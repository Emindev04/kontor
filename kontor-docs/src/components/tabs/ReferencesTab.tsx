import { BookA, BookMarked, BookOpenText, Footprints, Gavel, Library, ListPlus, NotebookPen, NotebookText, Quote, RefreshCw, Rows3, ScrollText, TableOfContents as TocIcon, Tag } from 'lucide-react'
import { TextSelection } from '@tiptap/pm/state'
import { MenuButton, RibbonButton, RibbonGroup, SplitButton } from '../ui'
import { collectNotes, type NoteKind } from '../../editor/Notes'
import { collectCaptions, collectHeadings, type TocOptions } from '../../editor/TableOfContents'
import { t } from '../../i18n'
import { formatPageNumber } from '../../pageSetup'
import { CITATION_STYLES } from '../../editor/Citations'
import type { AppApi, TabProps } from './types'

export function tocEntries(app: AppApi, levels: number, pageOf: (pos: number) => number) {
  const { setup } = app
  return collectHeadings(app.mainEditor, levels, (pos) => formatPageNumber(pageOf(pos) + setup.pageNumberStart, setup.pageNumberFormat)).map(({ text, level, page }) => ({
    text,
    level,
    page,
  }))
}

/** Entries of a table of contents or table of figures, from the options stored on it. */
export function computeTocEntries(app: AppApi, attrs: Record<string, unknown>) {
  const { setup } = app
  const page = (pos: number) => formatPageNumber(app.pageOfPos(pos) + setup.pageNumberStart, setup.pageNumberFormat)
  const a = attrs as Partial<TocOptions> & { levels?: number }
  const list = a.kind === 'figures' ? collectCaptions(app.mainEditor, a.label ?? '', a.includeLabel !== false, page) : collectHeadings(app.mainEditor, a.levels ?? 3, page, a.useOutline !== false)
  return list.map(({ text, level, page: p }) => ({ text, level, page: p }))
}

/** Updates every table of contents and table of figures. */
export function refreshTables(app: AppApi) {
  return app.mainEditor.commands.refreshTablesOfContents((attrs) => computeTocEntries(app, attrs))
}

/** Moves the cursor to the next/previous footnote or endnote reference. */
export function goToNote(app: AppApi, kind: NoteKind, direction: 1 | -1) {
  const editor = app.mainEditor
  const list = collectNotes(editor.state.doc).filter((n) => n.kind === kind && app.notes[n.id])
  const head = editor.state.selection.head
  const target = direction > 0 ? list.find((n) => n.pos >= head) : [...list].reverse().find((n) => n.pos + 1 < head)
  if (!target) return
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, target.pos + 1)).scrollIntoView())
  editor.view.focus()
}

export function ReferencesTab({ app }: TabProps) {
  const editor = app.mainEditor
  const hasToc = (() => {
    let found = false
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'tableOfContents') found = true
      return !found
    })
    return found
  })()
  const pageOf = (pos: number) => app.pageOfPos(pos)

  const insert = (levels: number) => {
    if (hasToc) editor.commands.removeTableOfContents()
    editor.chain().focus().insertTableOfContents(tocEntries(app, levels, pageOf), levels).run()
    // The table itself moves headings down; refresh once the pages have been laid out again.
    setTimeout(() => editor.commands.updateTableOfContents(tocEntries(app, levels, pageOf)), 300)
  }

  const update = () => refreshTables(app)
  const hasFigures = (() => {
    let found = false
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'tableOfContents' && n.attrs.kind === 'figures') found = true
      return !found
    })
    return found
  })()

  const setLevel = (level: number | null) => {
    const c = editor.chain().focus()
    if (level == null) c.setParagraph().run()
    else c.setHeading({ level: level as 1 | 2 | 3 }).run()
  }
  const currentLevel = editor.isActive('heading') ? (editor.getAttributes('heading').level as number) : null

  const noteRefs = collectNotes(editor.state.doc).filter((n) => app.notes[n.id])
  const showNotes = () => {
    const note = document.querySelector<HTMLElement>('.sheet .note[data-note-id]')
    if (note) note.scrollIntoView({ block: 'center', behavior: 'smooth' })
    else alert(t('There are no footnotes or endnotes in this document.'))
  }

  return (
    <>
      <RibbonGroup label={t('Table of Contents')} priority={4}>
        <MenuButton
          large
          wide
          icon={TocIcon}
          label={t('Table of Contents')}
          items={[
            { heading: t('Built-In') },
            { label: t('Automatic Table 1'), detail: t('Headings 1–3 with page numbers'), onClick: () => insert(3) },
            { label: t('Automatic Table 2'), detail: t('Headings 1–2 with page numbers'), onClick: () => insert(2) },
            { label: t('Detailed Table'), detail: t('Headings 1–6 with page numbers'), onClick: () => insert(6) },
            'separator',
            { label: t('Custom Table of Contents…'), onClick: () => app.openDialog('tocCustom') },
            { label: t('Remove Table of Contents'), disabled: !hasToc, onClick: () => editor.chain().focus().removeTableOfContents().run() },
          ]}
        />
        <div className="col">
          <MenuButton
            icon={ListPlus}
            label={t('Add Text')}
            showLabel
            items={[
              { label: t('Do Not Show in Table of Contents'), active: currentLevel == null, onClick: () => setLevel(null) },
              { label: t('Level 1'), active: currentLevel === 1, onClick: () => setLevel(1) },
              { label: t('Level 2'), active: currentLevel === 2, onClick: () => setLevel(2) },
              { label: t('Level 3'), active: currentLevel === 3, onClick: () => setLevel(3) },
            ]}
          />
          <RibbonButton icon={RefreshCw} label={t('Update Table')} showLabel disabled={!hasToc} onClick={update} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Footnotes')} priority={3} onLauncher={() => app.openDialog('notes')} launcherTitle={t('Footnote and Endnote')}>
        <RibbonButton large icon={Footprints} label={t('Insert Footnote')} title={t('Insert Footnote (Ctrl+Alt+F)')} onClick={() => app.insertNote('footnote')} />
        <div className="col">
          <RibbonButton icon={NotebookText} label={t('Insert Endnote')} showLabel title={t('Insert Endnote (Ctrl+Alt+D)')} onClick={() => app.insertNote('endnote')} />
          <SplitButton
            icon={BookOpenText}
            label={t('Next Footnote')}
            showLabel
            disabled={!noteRefs.length}
            onClick={() => goToNote(app, 'footnote', 1)}
            items={[
              { label: t('Next Footnote'), onClick: () => goToNote(app, 'footnote', 1) },
              { label: t('Previous Footnote'), onClick: () => goToNote(app, 'footnote', -1) },
              { label: t('Next Endnote'), onClick: () => goToNote(app, 'endnote', 1) },
              { label: t('Previous Endnote'), onClick: () => goToNote(app, 'endnote', -1) },
            ]}
          />
          <RibbonButton icon={BookOpenText} label={t('Show Notes')} showLabel disabled={!noteRefs.length} onClick={showNotes} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Citations & Bibliography')} priority={2}>
        <MenuButton
          large
          icon={Quote}
          label={t('Insert Citation')}
          wide
          items={[
            ...Object.values(app.sources).map((s) => ({ label: `${s.author || s.title}`, detail: `${s.title}${s.year ? ` (${s.year})` : ''}`, onClick: () => editor.chain().focus().insertCitation(s.id).run() })),
            ...(Object.keys(app.sources).length ? (['separator'] as const) : []),
            { label: t('Add New Source…'), onClick: () => app.openDialog('newSource') },
          ]}
        />
        <div className="col">
          <RibbonButton icon={Library} label={t('Manage Sources')} showLabel onClick={() => app.openDialog('manageSources')} />
          <MenuButton
            icon={BookA}
            label={t('Style: {name}', { name: t(CITATION_STYLES.find((c) => c.id === app.citationStyle)?.label ?? 'APA') })}
            showLabel
            items={CITATION_STYLES.map((c) => ({ label: t(c.label), detail: t(c.heading), active: app.citationStyle === c.id, onClick: () => app.setCitationStyle(c.id) }))}
          />
          <MenuButton
            icon={BookMarked}
            label={t('Bibliography')}
            showLabel
            items={[
              ...CITATION_STYLES.map((c) => ({ label: t(c.heading), detail: t('Heading “{name}”', { name: t(c.heading) }), onClick: () => editor.chain().focus().insertBibliography(c.heading).run() })),
              { label: t('Insert Bibliography'), detail: t('Without a heading'), onClick: () => editor.chain().focus().insertBibliography(null).run() },
            ]}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Captions')} priority={1}>
        <RibbonButton large icon={Tag} label={t('Insert Caption')} onClick={() => app.openDialog('caption')} />
        <div className="col">
          <RibbonButton icon={Rows3} label={t('Insert Table of Figures')} showLabel onClick={() => app.openDialog('tableOfFigures')} />
          <RibbonButton icon={RefreshCw} label={t('Update Table')} showLabel disabled={!hasFigures} onClick={update} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Table of Authorities')} priority={0}>
        <RibbonButton large icon={Gavel} label={t('Mark Citation')} title={t('Mark Citation (Alt+Shift+I)')} onClick={() => app.openDialog('markCitation')} />
        <div className="col">
          <RibbonButton icon={ScrollText} label={t('Insert Table of Authorities')} showLabel onClick={() => app.openDialog('tableOfAuthorities')} />
          <RibbonButton icon={RefreshCw} label={t('Update Table')} showLabel onClick={() => editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false))} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Index')} priority={0}>
        <RibbonButton large icon={NotebookPen} label={t('Mark Entry')} title={t('Mark Index Entry (Alt+Shift+X)')} onClick={() => app.openDialog('markEntry')} />
        <div className="col">
          <RibbonButton icon={ListPlus} label={t('Insert Index')} showLabel onClick={() => app.openDialog('indexOptions')} />
          <RibbonButton icon={RefreshCw} label={t('Update Index')} showLabel onClick={() => editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false))} />
        </div>
      </RibbonGroup>
    </>
  )
}
