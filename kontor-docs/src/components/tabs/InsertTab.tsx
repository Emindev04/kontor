import {
  Bookmark, ChartColumn, Network, Link2, PenLine, Shapes, Sigma, TextCursorInput, Type as WordArtIcon, MessageSquarePlus, BookOpen, CalendarClock, CaseUpper, FilePlus2, FileText, Hash, Image, Link, Minus, Omega, PanelBottom, PanelTop,
  SeparatorHorizontal, Table, TextQuote, Monitor, FileInput, Trash2, MonitorPlay, PencilLine,
} from 'lucide-react'
import { deleteQuickPart, insertQuickPart, insertScreenshot, insertTextFromFile, loadQuickParts, saveSelectionAsQuickPart } from '../../editor/insertExtras'
import { MenuButton, PopoverButton, RibbonButton, RibbonGroup, type MenuItem } from '../ui'
import { SYMBOLS, TablePicker } from '../palettes'
import { FOOTER_PRESETS, HEADER_PRESETS, PAGE_NUMBER_PRESETS, coverPage, coverPageRange, stripPageNumbers } from '../../hf/presets'
import { formatDate, t } from '../../i18n'
import { HF_SLOTS, slotFor } from '../../pageSetup'
import { SplitButton, keepFocus } from '../ui'
import { Sticker as IconsIcon } from 'lucide-react'
import { ShapeGallery } from './ShapeFormatTab'
import { WORDART_STYLES } from '../../editor/TextBox'
import { EQUATION_GALLERY } from '../../editor/math'
import type { AppApi, TabProps } from './types'

export function headerFooterMenu(app: AppApi, kind: 'header' | 'footer'): MenuItem[] {
  const presets = kind === 'header' ? HEADER_PRESETS : FOOTER_PRESETS
  const page = app.hfEdit ? app.hfEdit.page : app.currentPage - 1
  const slot = slotFor(kind, page, app.setup)
  return [
    { heading: t('Built-in') },
    ...presets.map((p) => ({
      label: t(p.label),
      onClick: () => {
        app.setHeaderFooterSlot(slot, p.content())
        app.editHeaderFooter(kind, page)
      },
    })),
    'separator',
    { label: kind === 'header' ? t('Edit Header') : t('Edit Footer'), onClick: () => app.editHeaderFooter(kind, page) },
    {
      label: kind === 'header' ? t('Remove Header') : t('Remove Footer'),
      onClick: () => {
        app.setHeaderFooterSlot(kind, null)
        app.setHeaderFooterSlot(kind === 'header' ? 'firstHeader' : 'firstFooter', null)
        app.setHeaderFooterSlot(kind === 'header' ? 'evenHeader' : 'evenFooter', null)
      },
    },
  ]
}

export function pageNumberMenu(app: AppApi): MenuItem[] {
  const page = app.hfEdit ? app.hfEdit.page : app.currentPage - 1
  const place = (kind: 'header' | 'footer', id: string) => {
    const preset = PAGE_NUMBER_PRESETS.find((p) => p.id === id)!
    app.setHeaderFooterSlot(slotFor(kind, page, app.setup), preset.content())
    app.editHeaderFooter(kind, page)
  }
  return [
    { heading: t('Top of Page') },
    ...PAGE_NUMBER_PRESETS.map((p) => ({ label: t(p.label), onClick: () => place('header', p.id) })),
    { heading: t('Bottom of Page') },
    ...PAGE_NUMBER_PRESETS.map((p) => ({ label: t(p.label), onClick: () => place('footer', p.id) })),
    'separator',
    {
      label: t('Current Position'),
      disabled: !app.hfEdit,
      detail: app.hfEdit ? undefined : t('Available while editing a header or footer'),
      onClick: () => undefined,
    },
    { label: t('Format Page Numbers…'), onClick: () => app.openDialog('pageNumberFormat') },
    {
      label: t('Remove Page Numbers'),
      onClick: () => HF_SLOTS.forEach((s) => app.setHeaderFooterSlot(s, stripPageNumbers(app.headerFooter[s]))),
    },
  ]
}

export function InsertTab({ editor, app }: TabProps) {
  const chain = () => editor.chain().focus()
  // A new cover page replaces the current one.
  const insertCover = (kind: 'simple' | 'banded') => {
    const range = coverPageRange(app.mainEditor.state.doc)
    const c = app.mainEditor.chain().focus()
    if (range) c.deleteRange(range)
    c.insertContentAt(0, coverPage(kind, '')).run()
  }
  const pageNumbers = pageNumberMenu(app).map((item) =>
    typeof item === 'object' && 'label' in item && item.label === 'Current Position'
      ? { ...item, onClick: () => chain().insertField('page').run() }
      : item,
  )
  return (
    <>
      <RibbonGroup label={t('Pages')} priority={1}>
        <MenuButton
          large
          icon={BookOpen}
          label={t('Cover Page')}
          wide
          items={[
            { heading: t('Built-in') },
            { label: t('Simple'), detail: t('Centered title, subtitle and author'), onClick: () => insertCover('simple') },
            { label: t('Banded'), detail: t('Colored title band'), onClick: () => insertCover('banded') },
            'separator',
            {
              label: t('Remove Current Cover Page'),
              disabled: !coverPageRange(app.mainEditor.state.doc),
              onClick: () => {
                const range = coverPageRange(app.mainEditor.state.doc)
                if (range) app.mainEditor.chain().focus().deleteRange(range).run()
              },
            },
          ]}
        />
        <div className="col">
          <RibbonButton icon={FilePlus2} label={t('Blank Page')} showLabel onClick={() => chain().insertContent([{ type: 'pageBreak' }, { type: 'paragraph' }, { type: 'pageBreak' }]).run()} />
          <RibbonButton icon={SeparatorHorizontal} label={t('Page Break')} showLabel title={t('Page Break (Ctrl+Enter)')} onClick={() => chain().setPageBreak().run()} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Tables')} priority={4}>
        <PopoverButton large icon={Table} label={t('Table')}>
          {(close) => (
            <>
              <TablePicker
                onPick={(rows, cols) => {
                  close()
                  chain().insertTable({ rows, cols, withHeaderRow: false }).run()
                }}
              />
              <div className="menu-sep" />
              <button
                type="button"
                className="menu-item"
                onMouseDown={keepFocus}
                onClick={() => {
                  close()
                  app.openDialog('insertTable')
                }}
              >
                <Table size={16} /> {t('Insert Table…')}</button>
              <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), app.setTableTool('draw'))}>
                <PencilLine size={16} /> {t('Draw Table')}
              </button>
              <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), app.openDialog('textToTable'))}>
                <Table size={16} /> {t('Convert Text to Table…')}</button>
              <div className="menu-heading">{t('Quick Tables')}</div>
              <button
                type="button"
                className="menu-item"
                onMouseDown={keepFocus}
                onClick={() => {
                  close()
                  chain()
                    .insertContent('<table data-table-style="accent1" data-bandedRows="true"><tr><th><p>Item</p></th><th><p>Needed</p></th></tr><tr><td><p>Books</p></td><td><p>1</p></td></tr><tr><td><p>Magazines</p></td><td><p>3</p></td></tr><tr><td><p>Notebooks</p></td><td><p>1</p></td></tr><tr><td><p>Paper pads</p></td><td><p>1</p></td></tr></table><p></p>')
                    .run()
                }}
              >
                <Table size={16} /> {t('Tabular List')}</button>
              <button
                type="button"
                className="menu-item"
                onMouseDown={keepFocus}
                onClick={() => {
                  close()
                  const d = new Date()
                  const first = new Date(d.getFullYear(), d.getMonth(), 1).getDay()
                  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
                  const cells = Array.from({ length: Math.ceil((first + days) / 7) * 7 }, (_, i) => (i >= first && i < first + days ? String(i - first + 1) : ''))
                  const rows = Array.from({ length: cells.length / 7 }, (_, r) => `<tr>${cells.slice(r * 7, r * 7 + 7).map((c) => `<td><p>${c}</p></td>`).join('')}</tr>`).join('')
                  const month = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                  chain().insertContent(`<h2>${month}</h2><table data-table-style="light"><tr>${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x) => `<th><p>${x}</p></th>`).join('')}</tr>${rows}</table><p></p>`).run()
                }}
              >
                <Table size={16} /> {t('Calendar')}</button>
            </>
          )}
        </PopoverButton>
      </RibbonGroup>
      <RibbonGroup label={t('Illustrations')} priority={3}>
        <MenuButton
          large
          icon={Image}
          label={t('Pictures')}
          items={[
            { heading: t('Insert Picture From') },
            { label: t('This Device…'), onClick: app.insertImage },
            { label: t('Online Address…'), onClick: () => app.openDialog('imageUrl') },
          ]}
        />
        <PopoverButton large icon={Shapes} label={t('Shapes')} className="shape-menu">
          {(close) => (
            <>
              <ShapeGallery
                onPick={(kind) => {
                  close()
                  app.startDraw(kind)
                }}
              />
              <div className="menu-sep" />
              <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), app.startDraw('textBox'))}>
                <TextCursorInput size={16} /> {t('Draw Text Box')}</button>
            </>
          )}
        </PopoverButton>
        <div className="col">
          <RibbonButton icon={IconsIcon} label={t('Icons')} showLabel onClick={() => app.openDialog('icons')} />
          <RibbonButton
            icon={MonitorPlay}
            label={t('Online Video')}
            showLabel
            title={t('Insert a YouTube or Vimeo video')}
            onClick={() => {
              const url = prompt(t('Paste the address of a YouTube or Vimeo video:'))
              if (url && !app.mainEditor.chain().focus().insertOnlineVideo(url).run()) alert(t('Only YouTube and Vimeo addresses can be embedded.'))
            }}
          />
          <RibbonButton icon={Monitor} label={t('Screenshot')} showLabel title={t('Insert a picture of a screen, window or browser tab')} onClick={() => void insertScreenshot(app.mainEditor).then((err) => err && alert(err))} />
          <RibbonButton icon={Network} label={t('Diagram')} showLabel title={t('Insert a diagram (lists, processes, cycles, hierarchies …)')} onClick={() => app.openDialog('insertDiagram')} />
          <RibbonButton icon={ChartColumn} label={t('Chart')} showLabel onClick={() => app.openDialog('insertChart')} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Links')} priority={2}>
        <RibbonButton large icon={Link} label={t('Link')} title={t('Insert Link (Ctrl+K)')} active={editor.isActive('link')} onClick={() => app.openDialog('link')} />
        <div className="col">
          <RibbonButton icon={Bookmark} label={t('Bookmark')} showLabel onClick={() => app.openDialog('bookmark')} />
          <RibbonButton icon={Link2} label={t('Cross-reference')} showLabel onClick={() => app.openDialog('crossRef')} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Comments')} priority={2}>
        <RibbonButton large icon={MessageSquarePlus} label={t('Comment')} title={t('New Comment (Ctrl+Alt+M)')} onClick={app.newComment} />
      </RibbonGroup>
      <RibbonGroup label={t('Header & Footer')} priority={2}>
        <MenuButton large icon={PanelTop} label={t('Header')} items={headerFooterMenu(app, 'header')} />
        <MenuButton large icon={PanelBottom} label={t('Footer')} items={headerFooterMenu(app, 'footer')} />
        <MenuButton large icon={Hash} label={t('Page Number')} items={pageNumbers} />
      </RibbonGroup>
      <RibbonGroup label={t('Text')} priority={2}>
        <MenuButton
          large
          icon={TextCursorInput}
          label={t('Text Box')}
          wide
          items={[
            { heading: t('Built-in') },
            { label: t('Simple Text Box'), detail: t('A bordered box next to the text'), onClick: () => app.mainEditor.chain().focus().insertTextBox({ wrap: 'square', align: 'right' } as never).run() },
            { label: t('Sidebar'), detail: t('A shaded box on the right'), onClick: () => app.mainEditor.chain().focus().insertTextBox({ wrap: 'square', align: 'right', fill: '#DCE8F7', stroke: null, width: 220, text: t('Sidebar title — type your text here.') } as never).run() },
            { label: t('Pull Quote'), detail: t('A centered quote between paragraphs'), onClick: () => app.mainEditor.chain().focus().insertTextBox({ wrap: 'topBottom', align: 'center', fill: null, stroke: '#2F6FC4', strokeWidth: 1.5, width: 400, text: t('“Type a quote from the document here.”') } as never).run() },
            'separator',
            { label: t('Draw Text Box'), onClick: () => app.startDraw('textBox') },
          ]}
        />
        <MenuButton
          large
          icon={WordArtIcon}
          label={t('WordArt')}
          wide
          items={WORDART_STYLES.map((w) => ({
            label: t(w.label),
            preview: <span className={`wordart wordart-${w.id} wordart-preview`}>A</span>,
            onClick: () =>
              app.mainEditor
                .chain()
                .focus()
                .insertContentAt(app.mainEditor.state.selection.$from.depth ? app.mainEditor.state.selection.$from.before(1) : app.mainEditor.state.selection.from, {
                  type: 'textBox',
                  attrs: { wrap: 'topBottom', align: 'center', fill: null, stroke: null, wordArt: w.id, width: 480 },
                  content: [{ type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: t('Your text here'), marks: [{ type: 'textStyle', attrs: { fontSize: '36pt' } }] }] }],
                })
                .run(),
          }))}
        />
        <MenuButton
          large
          icon={CaseUpper}
          label={t('Drop Cap')}
          items={[
            { label: t('None'), active: !editor.getAttributes('paragraph').dropCap, onClick: () => chain().setParagraphFormat({ dropCap: null }).run() },
            { label: t('Dropped'), active: editor.getAttributes('paragraph').dropCap === 'dropped', onClick: () => chain().setParagraphFormat({ dropCap: 'dropped' }).run() },
            { label: t('In margin'), active: editor.getAttributes('paragraph').dropCap === 'margin', onClick: () => chain().setParagraphFormat({ dropCap: 'margin' }).run() },
          ]}
        />
        <div className="col">
          <MenuButton
            icon={FileText}
            label={t('Quick Parts')}
            showLabel
            items={[
              { heading: t('Document Property') },
              { label: t('Title'), onClick: () => (app.hfEdit ? chain().insertField('title').run() : chain().insertContent(app.title).run()) },
              { heading: t('Field') },
              { label: t('Page'), disabled: !app.hfEdit, onClick: () => chain().insertField('page').run() },
              { label: t('Number of Pages'), disabled: !app.hfEdit, onClick: () => chain().insertField('numPages').run() },
              { label: t('Date'), onClick: () => (app.hfEdit ? chain().insertField('date').run() : chain().insertContent(formatDate(new Date())).run()) },
              ...(loadQuickParts().length ? [{ heading: t('AutoText') }, ...loadQuickParts().map((p) => ({ label: p.name, onClick: () => insertQuickPart(editor, p) }))] : []),
              'separator',
              { label: t('Save Selection to Quick Part Gallery…'), onClick: () => {
                const err = saveSelectionAsQuickPart(editor)
                if (err) alert(err)
              } },
              ...(loadQuickParts().length ? [{ label: t('Delete a Quick Part…'), icon: Trash2, onClick: () => {
                const name = prompt(t('Delete which building block?') + '\n' + loadQuickParts().map((p) => p.name).join('\n'))
                if (name) deleteQuickPart(name.trim())
              } }] : []),
            ]}
          />
          <MenuButton
            icon={FileInput}
            label={t('Object')}
            showLabel
            items={[{ label: t('Text from File…'), detail: t('Insert the content of a .docx, .doc, .odt, .rtf, .md, .html or .txt file'), onClick: () => void insertTextFromFile(editor).then((err) => err && alert(err)) }]}
          />
          <RibbonButton icon={CalendarClock} label={t('Date & Time')} showLabel onClick={() => app.openDialog('dateTime')} />
          <RibbonButton icon={Minus} label={t('Horizontal Line')} showLabel onClick={() => chain().setHorizontalRule().run()} />
        </div>
        <div className="col">
          <RibbonButton icon={PenLine} label={t('Signature Line')} showLabel onClick={() => (app.setObjectPos(null), app.openDialog('signature'))} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Symbols')} priority={1}>
        <SplitButton
          large
          icon={Sigma}
          label={t('Equation')}
          title={t('Insert New Equation (Alt+=)')}
          onClick={() => (app.setObjectPos(null), app.openDialog('equation'))}
          items={[
            { heading: t('Built-in') },
            ...EQUATION_GALLERY.map((g) => ({ label: t(g.label), onClick: () => app.mainEditor.chain().focus().insertEquation(g.latex, true).run() })),
            'separator',
            { label: t('Insert New Equation'), onClick: () => (app.setObjectPos(null), app.openDialog('equation')) },
          ]}
        />
        <PopoverButton large icon={Omega} label={t('Symbol')} className="symbol-popup">
          {(close) => (
            <>
              <div className="symbol-grid">
                {SYMBOLS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    title={s}
                    onMouseDown={keepFocus}
                    onClick={() => {
                      close()
                      chain().insertContent(s).run()
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="menu-sep" />
              <button
                type="button"
                className="menu-item"
                onMouseDown={keepFocus}
                onClick={() => {
                  close()
                  app.openDialog('symbol')
                }}
              >
                <TextQuote size={16} /> {t('More Symbols…')}</button>
            </>
          )}
        </PopoverButton>
      </RibbonGroup>
    </>
  )
}
