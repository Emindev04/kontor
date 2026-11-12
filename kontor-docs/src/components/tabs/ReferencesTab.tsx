import { BookA, BookMarked, BookOpenText, Footprints, Library, ListPlus, NotebookPen, NotebookText, Quote, RefreshCw, Rows3, TableOfContents as TocIcon, Tag } from 'lucide-react'
import { TextSelection } from '@tiptap/pm/state'
import { MenuButton, RibbonButton, RibbonGroup, SplitButton } from '../ui'
import { collectNotes, type NoteKind } from '../../editor/Notes'
import { collectHeadings } from '../../editor/TableOfContents'
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

  const update = () => {
    let levels = 3
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'tableOfContents') levels = n.attrs.levels
    })
    editor.commands.updateTableOfContents(tocEntries(app, levels, pageOf))
  }

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
    else alert('There are no footnotes or endnotes in this document.')
  }

  return (
    <>
      <RibbonGroup label="Table of Contents" priority={4}>
        <MenuButton
          large
          wide
          icon={TocIcon}
          label="Table of Contents"
          items={[
            { heading: 'Built-In' },
            { label: 'Automatic Table 1', detail: 'Headings 1–3 with page numbers', onClick: () => insert(3) },
            { label: 'Automatic Table 2', detail: 'Headings 1–2 with page numbers', onClick: () => insert(2) },
            { label: 'Detailed Table', detail: 'Headings 1–6 with page numbers', onClick: () => insert(6) },
            'separator',
            { label: 'Remove Table of Contents', disabled: !hasToc, onClick: () => editor.chain().focus().removeTableOfContents().run() },
          ]}
        />
        <div className="col">
          <MenuButton
            icon={ListPlus}
            label="Add Text"
            showLabel
            items={[
              { label: 'Do Not Show in Table of Contents', active: currentLevel == null, onClick: () => setLevel(null) },
              { label: 'Level 1', active: currentLevel === 1, onClick: () => setLevel(1) },
              { label: 'Level 2', active: currentLevel === 2, onClick: () => setLevel(2) },
              { label: 'Level 3', active: currentLevel === 3, onClick: () => setLevel(3) },
            ]}
          />
          <RibbonButton icon={RefreshCw} label="Update Table" showLabel disabled={!hasToc} onClick={update} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Footnotes" priority={3} onLauncher={() => app.openDialog('notes')} launcherTitle="Footnote and Endnote">
        <RibbonButton large icon={Footprints} label="Insert Footnote" title="Insert Footnote (Ctrl+Alt+F)" onClick={() => app.insertNote('footnote')} />
        <div className="col">
          <RibbonButton icon={NotebookText} label="Insert Endnote" showLabel title="Insert Endnote (Ctrl+Alt+D)" onClick={() => app.insertNote('endnote')} />
          <SplitButton
            icon={BookOpenText}
            label="Next Footnote"
            showLabel
            disabled={!noteRefs.length}
            onClick={() => goToNote(app, 'footnote', 1)}
            items={[
              { label: 'Next Footnote', onClick: () => goToNote(app, 'footnote', 1) },
              { label: 'Previous Footnote', onClick: () => goToNote(app, 'footnote', -1) },
              { label: 'Next Endnote', onClick: () => goToNote(app, 'endnote', 1) },
              { label: 'Previous Endnote', onClick: () => goToNote(app, 'endnote', -1) },
            ]}
          />
          <RibbonButton icon={BookOpenText} label="Show Notes" showLabel disabled={!noteRefs.length} onClick={showNotes} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Citations & Bibliography" priority={2}>
        <MenuButton
          large
          icon={Quote}
          label="Insert Citation"
          wide
          items={[
            ...Object.values(app.sources).map((s) => ({ label: `${s.author || s.title}`, detail: `${s.title}${s.year ? ` (${s.year})` : ''}`, onClick: () => editor.chain().focus().insertCitation(s.id).run() })),
            ...(Object.keys(app.sources).length ? (['separator'] as const) : []),
            { label: 'Add New Source…', onClick: () => app.openDialog('newSource') },
          ]}
        />
        <div className="col">
          <RibbonButton icon={Library} label="Manage Sources" showLabel onClick={() => app.openDialog('manageSources')} />
          <MenuButton
            icon={BookA}
            label={`Style: ${CITATION_STYLES.find((c) => c.id === app.citationStyle)?.label ?? 'APA'}`}
            showLabel
            items={CITATION_STYLES.map((c) => ({ label: c.label, detail: c.heading, active: app.citationStyle === c.id, onClick: () => app.setCitationStyle(c.id) }))}
          />
          <MenuButton
            icon={BookMarked}
            label="Bibliography"
            showLabel
            items={[
              ...CITATION_STYLES.map((c) => ({ label: c.heading, detail: `Heading "${c.heading}"`, onClick: () => editor.chain().focus().insertBibliography(c.heading).run() })),
              { label: 'Insert Bibliography', detail: 'Without a heading', onClick: () => editor.chain().focus().insertBibliography(null).run() },
            ]}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Captions" priority={1}>
        <RibbonButton large icon={Tag} label="Insert Caption" onClick={() => app.openDialog('caption')} />
        <div className="col">
          <RibbonButton
            icon={Rows3}
            label="Insert Table of Figures"
            showLabel
            onClick={() => {
              const captions: string[] = []
              editor.state.doc.descendants((n) => {
                if (n.type.name === 'paragraph' && n.attrs.pStyle === 'caption' && n.textContent.trim()) captions.push(n.textContent.trim())
              })
              if (!captions.length) return alert('No table of figures entries found. Insert captions first.')
              editor.chain().focus().insertContent(captions.map((c) => ({ type: 'paragraph', content: [{ type: 'text', text: c }] }))).run()
            }}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Index" priority={0}>
        <RibbonButton large icon={NotebookPen} label="Mark Entry" title="Mark Index Entry (Alt+Shift+X)" onClick={() => app.openDialog('markEntry')} />
        <div className="col">
          <RibbonButton icon={ListPlus} label="Insert Index" showLabel onClick={() => editor.chain().focus().insertIndex().run()} />
          <RibbonButton icon={RefreshCw} label="Update Index" showLabel onClick={() => editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false))} />
        </div>
      </RibbonGroup>
    </>
  )
}
