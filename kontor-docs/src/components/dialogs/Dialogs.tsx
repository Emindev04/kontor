import { Suspense, lazy, useMemo, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { APP_NAME, APP_VERSION, SUITE_NAME } from '../../brand'
import { downloadBlob } from '../../io/download'
import { DEFAULT_QAT, QAT_COMMANDS } from '../TitleBar'
import { DATE_FORMATS, documentStats, pickFile, readFileAsDataUrl } from '../../editor/commands'
import { formatPageNumber, type PageNumberFormat } from '../../pageSetup'
import { UNITS, type Unit } from '../../units'
import { Modal, OkCancel, cls } from '../ui'
import { LinkDialog } from '../LinkDialog'
import { FontDialog } from './FontDialog'
import { BUILTIN_STYLES } from '../../editor/styleDefs'
import { ParagraphDialog } from './ParagraphDialog'
import { PageSetupDialog } from './PageSetupDialog'
import { DrawingDialog } from './DrawingDialog'
import { NotesDialog } from './NotesDialog'
import { TabsDialog } from './TabsDialog'
import { AutoCorrectDialog } from './AutoCorrectDialog'
import { EnvelopesDialog, LabelsDialog } from './MailingDialogs'
import { BordersShadingDialog, CellMarginsDialog, FormulaDialog, TablePropertiesDialog, TextToTableDialog } from './TableDialogs'
import { ColumnsDialog } from './ColumnsDialog'
import { PasteSpecialDialog } from './PasteSpecialDialog'
import { ManageSourcesDialog, MarkEntryDialog, NewSourceDialog } from './CitationDialogs'
import { CropDialog, LayoutOptionsDialog } from './DrawingDialogs'
import { BookmarkDialog, ChartDataDialog, CrossRefDialog, EquationDialog, InsertChartDialog, SignatureDialog } from './ObjectDialogs'
import { InsertDiagramDialog } from './DiagramDialogs'
import { EmailMergeDialog, MatchFieldsDialog, RecipientsDialog } from './MergeDialogs'

const IconsDialog = lazy(() => import('./IconsDialog'))
import { CompareDialog, RestrictDialog, ThesaurusDialog, TrackOptionsDialog } from './ReviewDialogs'
import type { AppApi, DialogKind } from '../tabs/types'

type Props = { dialog: DialogKind | null; setDialog: (d: DialogKind | null) => void; editor: Editor; app: AppApi; findQuery: string }

export function Dialogs({ dialog, setDialog, editor, app }: Props) {
  const close = () => setDialog(null)
  switch (dialog) {
    case 'link':
      return <LinkDialog editor={editor} onClose={close} />
    case 'font':
      return (
        <FontDialog
          editor={editor}
          onClose={close}
          onSetDefault={(font, size) => {
            // The Normal style gets the font; Set as Default then keeps it for new documents.
            const base = app.styleDefs.normal ?? BUILTIN_STYLES.find((s) => s.id === 'normal')!
            const next = { ...app.styleDefs, normal: { ...base, format: { ...base.format, font, size } } }
            app.setStyleDefs(() => next)
            app.setAsDefault(next)
          }}
        />
      )
    case 'paragraph':
      return <ParagraphDialog editor={editor} unit={app.settings.unit} onClose={close} />
    case 'pageSetup':
      return <PageSetupDialog setup={app.setup} setSetup={app.setSetup} unit={app.settings.unit} onClose={close} />
    case 'drawing':
      return <DrawingDialog editor={editor} onClose={close} />
    case 'goto':
      return <GoToDialog app={app} onClose={close} />
    case 'wordCount':
      return <WordCountDialog app={app} onClose={close} />
    case 'watermark':
      return <WatermarkDialog app={app} onClose={close} />
    case 'options':
      return <OptionsDialog app={app} onClose={close} />
    case 'help':
      return <HelpDialog onClose={close} />
    case 'hyphenation':
      return <HyphenationDialog app={app} onClose={close} />
    case 'newList':
      return <RecipientsDialog mode="new" onClose={close} />
    case 'editRecipients':
      return <RecipientsDialog mode="edit" onClose={close} />
    case 'matchFields':
      return <MatchFieldsDialog onClose={close} />
    case 'emailMerge':
      return <EmailMergeDialog editor={app.mainEditor} app={app} onClose={close} />
    case 'whatsNew':
      return <WhatsNewDialog onClose={close} />
    case 'training':
      return <TrainingDialog onClose={close} />
    case 'feedback':
      return <FeedbackDialog onClose={close} />
    case 'about':
      return <AboutDialog onClose={close} />
    case 'dateTime':
      return <DateTimeDialog editor={editor} app={app} onClose={close} />
    case 'symbol':
      return <SymbolDialog editor={editor} onClose={close} />
    case 'insertTable':
      return <InsertTableDialog editor={editor} onClose={close} />
    case 'pageNumberFormat':
      return <PageNumberFormatDialog app={app} onClose={close} />
    case 'accessibility':
      return <AccessibilityDialog app={app} onClose={close} />
    case 'caption':
      return <CaptionDialog editor={editor} onClose={close} />
    case 'imageUrl':
      return <ImageUrlDialog editor={editor} onClose={close} />
    case 'altText':
      return <AltTextDialog editor={editor} onClose={close} />
    case 'thesaurus':
      return <ThesaurusDialog editor={editor} onClose={close} />
    case 'trackOptions':
      return <TrackOptionsDialog app={app} onClose={close} />
    case 'compare':
      return <CompareDialog app={app} onClose={close} />
    case 'combine':
      return <CompareDialog app={app} onClose={close} combine />
    case 'restrict':
      return <RestrictDialog app={app} onClose={close} />
    case 'notes':
      return <NotesDialog app={app} onClose={close} />
    case 'columns':
      return <ColumnsDialog editor={editor} unit={app.settings.unit} onClose={close} />
    case 'layoutOptions':
      return <LayoutOptionsDialog editor={editor} unit={app.settings.unit} onClose={close} />
    case 'crop':
      return <CropDialog editor={editor} onClose={close} />
    case 'insertChart':
      return <InsertChartDialog editor={editor} app={app} onClose={close} />
    case 'insertDiagram':
      return <InsertDiagramDialog editor={editor} app={app} onClose={close} />
    case 'chartData':
      return <ChartDataDialog editor={app.mainEditor} app={app} onClose={close} />
    case 'equation':
      return <EquationDialog editor={editor} app={app} onClose={close} />
    case 'signature':
      return <SignatureDialog editor={editor} app={app} onClose={close} />
    case 'icons':
      return (
        <Suspense fallback={null}>
          <IconsDialog editor={editor} onClose={close} />
        </Suspense>
      )
    case 'bookmark':
      return <BookmarkDialog editor={app.mainEditor} onClose={close} />
    case 'crossRef':
      return <CrossRefDialog editor={app.mainEditor} app={app} onClose={close} />
    case 'tableProperties':
      return <TablePropertiesDialog editor={editor} unit={app.settings.unit} onClose={close} />
    case 'bordersShading':
      return <BordersShadingDialog editor={editor} app={app} onClose={close} />
    case 'formula':
      return <FormulaDialog editor={editor} onClose={close} />
    case 'textToTable':
      return <TextToTableDialog editor={editor} onClose={close} />
    case 'envelopes':
      return <EnvelopesDialog app={app} onClose={close} onCreate={app.openGenerated} />
    case 'labels':
      return <LabelsDialog app={app} onClose={close} onCreate={app.openGenerated} />
    case 'autoCorrect':
      return <AutoCorrectDialog app={app} onClose={close} />
    case 'tabs':
      return <TabsDialog editor={editor} unit={app.settings.unit} onClose={close} />
    case 'cellMargins':
      return <CellMarginsDialog editor={editor} unit={app.settings.unit} onClose={close} />
    case 'pasteSpecial':
      return <PasteSpecialDialog editor={editor} onClose={close} />
    case 'newSource':
      return <NewSourceDialog editor={editor} app={app} onClose={close} />
    case 'manageSources':
      return <ManageSourcesDialog editor={editor} app={app} onClose={close} />
    case 'markEntry':
      return <MarkEntryDialog editor={editor} onClose={close} />
    default:
      return null
  }
}

function GoToDialog({ app, onClose }: { app: AppApi; onClose: () => void }) {
  const [what, setWhat] = useState<'page' | 'heading'>('page')
  const [value, setValue] = useState('')
  const headings = useMemo(() => {
    const out: { pos: number; text: string }[] = []
    app.mainEditor.state.doc.descendants((n, pos) => {
      if (n.type.name === 'heading' && n.textContent.trim()) out.push({ pos, text: n.textContent.trim() })
    })
    return out
  }, [app.mainEditor])
  const go = () => {
    if (what === 'page') {
      const v = value.trim()
      let page = app.currentPage
      if (/^[+-]\d+$/.test(v)) page += Number(v)
      else if (/^\d+$/.test(v)) page = Number(v)
      else if (v) return
      else page += 1
      page = Math.max(1, Math.min(app.pages, page))
      app.scrollToPos(app.pageStartPos(page - 1))
    } else {
      const h = headings.find((x) => x.text.toLowerCase().includes(value.toLowerCase())) ?? headings[0]
      if (h) app.scrollToPos(h.pos + 1)
    }
    onClose()
  }
  return (
    <Modal title="Find and Replace – Go To" onClose={onClose} width={440} footer={<OkCancel okLabel={value ? 'Go To' : 'Next'} onOk={go} onCancel={onClose} />}>
      <div className="goto">
        <label>
          Go to what:
          <select size={2} value={what} onChange={(e) => setWhat(e.target.value as 'page' | 'heading')}>
            <option value="page">Page</option>
            <option value="heading">Heading</option>
          </select>
        </label>
        <label>
          {what === 'page' ? 'Enter page number:' : 'Enter heading text:'}
          <input autoFocus value={value} list={what === 'heading' ? 'goto-headings' : undefined} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
          <datalist id="goto-headings">
            {headings.map((h) => (
              <option key={h.pos} value={h.text} />
            ))}
          </datalist>
          <small className="dlg-hint">{what === 'page' ? `Enter + and − to move relative to the current page (${app.currentPage} of ${app.pages}).` : `${headings.length} headings in the document.`}</small>
        </label>
      </div>
    </Modal>
  )
}

function WordCountDialog({ app, onClose }: { app: AppApi; onClose: () => void }) {
  const s = documentStats(app.mainEditor, app.pages)
  const rows: [string, number][] = [
    ['Pages', s.pages],
    ['Words', s.words],
    ['Characters (no spaces)', s.charactersNoSpaces],
    ['Characters (with spaces)', s.characters],
    ['Paragraphs', s.paragraphs],
    ['Lines', s.lines],
  ]
  return (
    <Modal title="Word Count" onClose={onClose} width={340} footer={<button type="button" className="btn btn-primary" onClick={onClose}>Close</button>}>
      <p className="dlg-hint">{s.selection ? 'Statistics for the selection:' : 'Statistics:'}</p>
      <table className="stats">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{v.toLocaleString('en-US')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  )
}

function WatermarkDialog({ app, onClose }: { app: AppApi; onClose: () => void }) {
  const w = app.design.watermark
  const [kind, setKind] = useState<'none' | 'text' | 'picture'>(w ? (w.image ? 'picture' : 'text') : 'none')
  const [text, setText] = useState(w?.text || 'CONFIDENTIAL')
  const [color, setColor] = useState(w?.color ?? '#BFBFBF')
  const [semi, setSemi] = useState(w?.semitransparent ?? true)
  const [layout, setLayout] = useState(w?.layout ?? 'diagonal')
  const [image, setImage] = useState<string | null>(w?.image ?? null)
  const [scale, setScale] = useState(w?.scale ?? 1)
  const [washout, setWashout] = useState(w?.washout ?? true)
  const apply = () => {
    if (kind === 'none' || (kind === 'text' && !text.trim()) || (kind === 'picture' && !image)) app.setDesign({ ...app.design, watermark: null })
    else if (kind === 'picture') app.setDesign({ ...app.design, watermark: { text: '', color, semitransparent: semi, layout, image, scale, washout } })
    else app.setDesign({ ...app.design, watermark: { text: text.trim(), color, semitransparent: semi, layout } })
    onClose()
  }
  return (
    <Modal title="Printed Watermark" onClose={onClose} width={440} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <div className="dlg-stack">
        <label><input type="radio" checked={kind === 'none'} onChange={() => setKind('none')} /> No watermark</label>
        <label><input type="radio" checked={kind === 'picture'} onChange={() => setKind('picture')} /> Picture watermark</label>
        <fieldset className="dlg-fieldset" disabled={kind !== 'picture'}>
          <div className="dlg-inline">
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const file = await pickFile('image/*')
                if (file) setImage(await readFileAsDataUrl(file))
              }}
            >
              Select Picture…
            </button>
            <span className="dlg-hint">{image ? 'Picture selected' : 'No picture'}</span>
          </div>
          <label className="dlg-inline">
            Scale:
            <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
              {[0.5, 0.75, 1, 1.25, 1.5].map((v) => (
                <option key={v} value={v}>
                  {v * 100}%
                </option>
              ))}
            </select>
            <label><input type="checkbox" checked={washout} onChange={(e) => setWashout(e.target.checked)} /> Washout</label>
          </label>
        </fieldset>
        <label><input type="radio" checked={kind === 'text'} onChange={() => setKind('text')} /> Text watermark</label>
        <fieldset className="dlg-fieldset" disabled={kind !== 'text'}>
          <label className="dlg-inline">
            Text:
            <input list="watermark-texts" value={text} onChange={(e) => setText(e.target.value)} />
            <datalist id="watermark-texts">
              {['ASAP', 'CONFIDENTIAL', 'DO NOT COPY', 'DRAFT', 'ORIGINAL', 'PERSONAL', 'SAMPLE', 'TOP SECRET', 'URGENT'].map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <label className="dlg-inline">
            Color: <input type="color" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} />
            <label><input type="checkbox" checked={semi} onChange={(e) => setSemi(e.target.checked)} /> Semitransparent</label>
          </label>
          <div className="dlg-inline">
            Layout:
            <label><input type="radio" checked={layout === 'diagonal'} onChange={() => setLayout('diagonal')} /> Diagonal</label>
            <label><input type="radio" checked={layout === 'horizontal'} onChange={() => setLayout('horizontal')} /> Horizontal</label>
          </div>
        </fieldset>
      </div>
    </Modal>
  )
}

function OptionsDialog({ app, onClose }: { app: AppApi; onClose: () => void }) {
  const [unit, setUnit] = useState<Unit>(app.settings.unit)
  const [widow, setWidow] = useState(app.settings.widowControl)
  const [spell, setSpell] = useState(app.spellcheck)
  const [name, setName] = useState(app.settings.userName)
  const [initials, setInitials] = useState(app.settings.userInitials)
  const [quotes, setQuotes] = useState(app.settings.smartQuotes)
  const [autoCorrect, setAutoCorrect] = useState(app.settings.autoCorrect)
  const [paste, setPaste] = useState(app.settings.defaultPaste ?? 'keep')
  const [hiddenTabs, setHiddenTabs] = useState<string[]>(app.settings.hiddenTabs ?? [])
  const [qat, setQat] = useState<string[]>(app.settings.qat ?? DEFAULT_QAT)
  const apply = () => {
    app.setSettings({ ...app.settings, unit, widowControl: widow, userName: name.trim() || 'Author', userInitials: initials.trim() || 'A', smartQuotes: quotes, autoCorrect, defaultPaste: paste, hiddenTabs, qat })
    app.setSpellcheck(spell)
    onClose()
  }
  return (
    <Modal title={`${APP_NAME} Options`} onClose={onClose} width={460} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <div className="dlg-stack">
        <fieldset className="dlg-fieldset">
          <legend>Display</legend>
          <label className="dlg-inline">
            Show measurements in units of:
            <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {UNITS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        <fieldset className="dlg-fieldset">
          <legend>Personalize your copy</legend>
          <label className="dlg-inline">
            User name: <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="dlg-inline">
            Initials: <input value={initials} maxLength={4} onChange={(e) => setInitials(e.target.value)} />
          </label>
        </fieldset>
        <fieldset className="dlg-fieldset">
          <legend>Proofing</legend>
          <label><input type="checkbox" checked={spell} onChange={(e) => setSpell(e.target.checked)} /> Check spelling as you type</label>
          <label><input type="checkbox" checked={quotes} onChange={(e) => setQuotes(e.target.checked)} /> Replace "straight quotes" with “smart quotes” as you type</label>
          <label><input type="checkbox" checked={autoCorrect} onChange={(e) => setAutoCorrect(e.target.checked)} /> Replace text as you type (AutoCorrect)</label>
          <button type="button" className="btn" onClick={() => app.openDialog('autoCorrect')}>
            AutoCorrect Options…
          </button>
        </fieldset>
        <fieldset className="dlg-fieldset">
          <legend>Cut, copy, and paste</legend>
          <label className="dlg-inline">
            Pasting from other programs:
            <select value={paste} onChange={(e) => setPaste(e.target.value as typeof paste)}>
              <option value="keep">Keep Source Formatting</option>
              <option value="merge">Merge Formatting</option>
              <option value="text">Keep Text Only</option>
            </select>
          </label>
        </fieldset>
        <fieldset className="dlg-fieldset">
          <legend>Layout</legend>
          <label><input type="checkbox" checked={widow} onChange={(e) => setWidow(e.target.checked)} /> Widow/Orphan control for all paragraphs</label>
        </fieldset>
        <fieldset className="dlg-fieldset">
          <legend>Customize the Ribbon</legend>
          <div className="dlg-checks-grid">
            {CUSTOMIZABLE_TABS.map((t) => (
              <label key={t.id}>
                <input type="checkbox" checked={!hiddenTabs.includes(t.id)} onChange={(e) => setHiddenTabs(e.target.checked ? hiddenTabs.filter((h) => h !== t.id) : [...hiddenTabs, t.id])} /> {t.label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="dlg-fieldset">
          <legend>Quick Access Toolbar</legend>
          <div className="dlg-checks-grid">
            {QAT_COMMANDS.map((c) => (
              <label key={c.id}>
                <input type="checkbox" checked={qat.includes(c.id)} onChange={(e) => setQat(e.target.checked ? QAT_COMMANDS.map((x) => x.id).filter((x) => x === c.id || qat.includes(x)) : qat.filter((q) => q !== c.id))} /> {c.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  )
}

const SHORTCUTS: [string, [string, string][]][] = [
  ['File', [['Ctrl+S', 'Save as .docx'], ['Ctrl+O', 'Open'], ['Ctrl+P', 'Print'], ['F12', 'Save As'], ['Ctrl+Alt+N', 'New document']]],
  ['Editing', [['Ctrl+Z / Ctrl+Y', 'Undo / Redo'], ['Ctrl+X / C / V', 'Cut / Copy / Paste'], ['Ctrl+F', 'Find'], ['Ctrl+H', 'Replace'], ['Ctrl+G', 'Go To'], ['Ctrl+K', 'Insert link'], ['Ctrl+A', 'Select all'], ['Ctrl+Enter', 'Page break'], ['Shift+Enter', 'Line break']]],
  ['Character', [['Ctrl+B / I / U', 'Bold / Italic / Underline'], ['Ctrl+Shift+D', 'Double underline'], ['Ctrl+= / Ctrl+Shift++', 'Subscript / Superscript'], ['Ctrl+Shift+A', 'All caps'], ['Ctrl+Shift+K', 'Small caps'], ['Ctrl+Shift+> / <', 'Grow / shrink font'], ['Ctrl+] / [', 'Font size +1 / −1 pt'], ['Ctrl+D', 'Font dialog'], ['Ctrl+Space', 'Remove character formatting'], ['Shift+F3', 'Change case'], ['Ctrl+Shift+C / V', 'Copy / paste formatting']]],
  ['Paragraph', [['Ctrl+L / E / R / J', 'Left / Center / Right / Justify'], ['Ctrl+1 / 2 / 5', 'Single / double / 1.5 line spacing'], ['Ctrl+0', 'Toggle 12 pt space before'], ['Ctrl+M / Ctrl+Shift+M', 'Indent / outdent'], ['Ctrl+T / Ctrl+Shift+T', 'Hanging indent'], ['Ctrl+Q', 'Remove paragraph formatting'], ['Ctrl+Alt+1 … 3', 'Heading 1 … 3'], ['Ctrl+Shift+N', 'Normal style'], ['Ctrl+Shift+L', 'Bullets'], ['Ctrl+*', 'Show/hide ¶']]],
  ['Other', [['Alt+Shift+D / T', 'Insert date / time'], ['Ctrl+F1', 'Collapse the ribbon'], ['F7', 'Spelling'], ['Esc', 'Close header/footer, stop Format Painter']]],
]

function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title={`${APP_NAME} Help`} onClose={onClose} width={640} footer={<button type="button" className="btn btn-primary" onClick={onClose}>Close</button>}>
      <p className="dlg-hint">Keyboard shortcuts. On a Mac, use ⌘ instead of Ctrl. Double-click the top or bottom margin to edit headers and footers; double-click the body to return.</p>
      <div className="shortcut-cols">
        {SHORTCUTS.map(([group, list]) => (
          <section key={group}>
            <h3>{group}</h3>
            <table className="shortcuts">
              <tbody>
                {list.map(([k, v]) => (
                  <tr key={k}>
                    <td>
                      <kbd>{k}</kbd>
                    </td>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </Modal>
  )
}

/** Ribbon tabs that Options › Customize the Ribbon can hide (Home always stays). */
const CUSTOMIZABLE_TABS = [
  { id: 'insert', label: 'Insert' }, { id: 'draw', label: 'Draw' }, { id: 'design', label: 'Design' }, { id: 'layout', label: 'Layout' }, { id: 'references', label: 'References' },
  { id: 'mailings', label: 'Mailings' }, { id: 'review', label: 'Review' }, { id: 'view', label: 'View' }, { id: 'help', label: 'Help' },
]

const WHATS_NEW: [string, string[]][] = [
  ['Version 0.4', ['Diagrams: lists, processes, cycles, hierarchies, Venn, matrix and pyramid layouts with a text pane', 'Groups of shapes are saved as one drawing group in .docx files', 'Track Changes records formatting changes', 'Combine Documents merges a reviewer’s copy', 'Live preview of paste options', 'Undo and Redo history lists, customizable Quick Access Toolbar and status bar', 'Pages can be centered or bottom-aligned vertically', 'The ribbon shrinks group by group on narrow windows']],
  ['Version 0.3', ['Citations and bibliography, index, paste options and Paste Special', 'Right-to-left paragraphs, Selection Pane and grouping, text in shapes', 'Table rows that break across pages']],
  ['Version 0.2', ['Comments, Track Changes, Compare, footnotes and endnotes', 'Sections, columns, floating pictures, shapes, charts and equations', 'Read Mode, Outline, Draft and Multiple Pages views']],
]

function WhatsNewDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="What's New" onClose={onClose} width={520} footer={<button type="button" className="btn btn-primary" onClick={onClose}>Close</button>}>
      {WHATS_NEW.map(([version, items]) => (
        <section key={version}>
          <h3>{version}</h3>
          <ul className="dlg-list">
            {items.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </section>
      ))}
    </Modal>
  )
}

const TRAINING: [string, string][] = [
  ['Create a document', 'File › New starts a blank document or one from a template. Your work is saved in this browser automatically; Ctrl+S saves a .docx copy.'],
  ['Format text quickly', 'Pick a style in Home › Styles for headings and quotes, so a table of contents and the Navigation pane can find them.'],
  ['Lay out pages', 'Layout › Margins, Orientation, Size and Columns set up the page. Insert › Header, Footer and Page Number add running text.'],
  ['Add pictures and diagrams', 'Insert › Pictures, Shapes, Diagram and Chart. Select an object to see its own tab, with layout, colors, wrapping and size.'],
  ['Collaborate', 'Review › New Comment adds a note; Track Changes records edits so that others can accept or reject them. Compare and Combine merge versions.'],
  ['Find your way', 'Search (Alt+Q) finds text, View › Navigation Pane lists the headings, and Ctrl+G goes to a page.'],
]

function TrainingDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Training: Getting Started" onClose={onClose} width={560} footer={<button type="button" className="btn btn-primary" onClick={onClose}>Close</button>}>
      <div className="dlg-stack">
        {TRAINING.map(([title, text]) => (
          <section key={title}>
            <strong>{title}</strong>
            <p className="dlg-hint">{text}</p>
          </section>
        ))}
      </div>
    </Modal>
  )
}

function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('')
  const [kind, setKind] = useState('I like something')
  const body = `${kind}\n\n${text}\n\n— ${APP_NAME} ${APP_VERSION}, ${navigator.userAgent}`
  return (
    <Modal
      title="Feedback"
      onClose={onClose}
      width={480}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn" disabled={!text.trim()} onClick={() => downloadBlob(new Blob([body], { type: 'text/plain' }), 'feedback.txt')}>
            Save as File
          </button>
          <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={() => void navigator.clipboard?.writeText(body).then(onClose)}>
            Copy to Clipboard
          </button>
        </>
      }
    >
      <div className="dlg-stack">
        <p className="dlg-hint">Write down what you like, what doesn't work or what you miss. Copy it to post it where the project collects feedback (for example its issue tracker).</p>
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind of feedback">
          <option>I like something</option>
          <option>I don't like something</option>
          <option>I have a suggestion</option>
        </select>
        <textarea rows={6} value={text} aria-label="Feedback" onChange={(e) => setText(e.target.value)} />
      </div>
    </Modal>
  )
}

function HyphenationDialog({ app, onClose }: { app: AppApi; onClose: () => void }) {
  const o = app.design.hyphenationOptions ?? { caps: true, zone: 0.25, limit: 0 }
  const [auto, setAuto] = useState(app.design.hyphenation)
  const [caps, setCaps] = useState(o.caps)
  const [zone, setZone] = useState(o.zone)
  const [limit, setLimit] = useState(o.limit)
  const apply = () => {
    app.setDesign({ ...app.design, hyphenation: auto, hyphenationOptions: { caps, zone, limit } })
    onClose()
  }
  return (
    <Modal title="Hyphenation" onClose={onClose} width={380} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <div className="dlg-stack">
        <label><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Automatically hyphenate document</label>
        <label><input type="checkbox" checked={caps} onChange={(e) => setCaps(e.target.checked)} /> Hyphenate words in CAPS</label>
        <label className="dlg-inline">
          Hyphenation zone: <input type="number" min={0} step={0.05} value={zone} onChange={(e) => setZone(Number(e.target.value) || 0)} /> in
        </label>
        <label className="dlg-inline">
          Limit consecutive hyphens to:
          <input type="number" min={0} step={1} value={limit} onChange={(e) => setLimit(Math.max(0, Math.round(Number(e.target.value) || 0)))} /> (0 = no limit)
        </label>
        <p className="dlg-hint">The zone and the limit are saved with the document for other programs; on screen the browser's own hyphenation applies.</p>
      </div>
    </Modal>
  )
}

function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title={`About ${APP_NAME}`} onClose={onClose} width={420} footer={<button type="button" className="btn btn-primary" onClick={onClose}>OK</button>}>
      <p>
        <strong>{APP_NAME}</strong> {APP_VERSION}
        <br />
        Part of the free {SUITE_NAME} office suite.
      </p>
      <p className="dlg-hint">Runs entirely in your browser; documents are stored on this device. Built with open-source libraries: React, TipTap/ProseMirror, docx, JSZip, Lucide icons and the Carlito/Caladea fonts.</p>
    </Modal>
  )
}

function DateTimeDialog({ editor, app, onClose }: { editor: Editor; app: AppApi; onClose: () => void }) {
  const [format, setFormat] = useState(0)
  const [auto, setAuto] = useState(false)
  const now = new Date()
  const apply = () => {
    if (auto && app.hfEdit) editor.chain().focus().insertField(format >= 8 ? 'time' : 'date').run()
    else editor.chain().focus().insertContent(DATE_FORMATS[format](now)).run()
    onClose()
  }
  return (
    <Modal title="Date and Time" onClose={onClose} width={380} footer={<OkCancel onOk={apply} onCancel={onClose} extra={<label><input type="checkbox" checked={auto} disabled={!app.hfEdit} onChange={(e) => setAuto(e.target.checked)} /> Update automatically</label>} />}>
      <label className="dlg-stack">
        Available formats:
        <select size={11} value={format} onChange={(e) => setFormat(Number(e.target.value))} onDoubleClick={apply}>
          {DATE_FORMATS.map((f, i) => (
            <option key={i} value={i}>
              {f(now)}
            </option>
          ))}
        </select>
      </label>
    </Modal>
  )
}

const SYMBOL_SETS: [string, string][] = [
  ['Latin-1 Supplement', '¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ'],
  ['General Punctuation', '–—‘’‚“”„†‡•…‰′″‹›‼⁄'],
  ['Currency Symbols', '€£¥¢₹₽₩₺₿$¤'],
  ['Letterlike Symbols', '℃℉№℗℘ℝ™Ω℮⅓⅔⅛⅜⅝⅞'],
  ['Arrows', '←↑→↓↔↕↖↗↘↙⇐⇑⇒⇓⇔'],
  ['Mathematical Operators', '∀∂∃∅∇∈∉∋∏∑−∓∕∗√∝∞∠∧∨∩∪∫∬∮∴∵∼≅≈≠≡≤≥⊂⊃⊆⊇⊕⊗⊥⋅'],
  ['Greek', 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρστυφχψω'],
  ['Geometric Shapes', '■□▪▫▬▲△▶▷▼▽◀◁◆◇◊○●◐◑★☆'],
  ['Dingbats', '✁✂✃✄✆✇✈✉✌✍✎✏✐✑✒✓✔✕✖✗✘✙✚✛✜✝✞✟✠✡✢✣✤✥✦✧✩✪✫✬✭✮✯✰❶❷❸❹❺❻❼❽❾❿➔➘➙➚➛➜➝➞➟➠➡➢➣➤'],
  ['Emoji', '😀😁😂🙂😉😍😎🤔👍👎👏🙏💡📌📎✅❌⚠️⭐🔥🎉📅📞✉️'],
]

function SymbolDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [set, setSet] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const insert = (s: string | null) => {
    if (s) editor.chain().focus().insertContent(s).run()
  }
  return (
    <Modal
      title="Symbol"
      onClose={onClose}
      width={560}
      footer={
        <OkCancel
          okLabel="Insert"
          onOk={() => insert(selected)}
          onCancel={onClose}
          extra={<span className="dlg-hint">{selected ? `Character code: U+${selected.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}` : 'Double-click a symbol to insert it.'}</span>}
        />
      }
    >
      <label className="dlg-inline">
        Subset:
        <select value={set} onChange={(e) => setSet(Number(e.target.value))}>
          {SYMBOL_SETS.map(([name], i) => (
            <option key={name} value={i}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <div className="symbol-table">
        {Array.from(SYMBOL_SETS[set][1]).map((s, i) => (
          <button key={`${s}-${i}`} type="button" className={cls(selected === s && 'is-active')} onClick={() => setSelected(s)} onDoubleClick={() => insert(s)}>
            {s}
          </button>
        ))}
      </div>
    </Modal>
  )
}

function InsertTableDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [cols, setCols] = useState(5)
  const [rows, setRows] = useState(2)
  const apply = () => {
    editor.chain().focus().insertTable({ rows: Math.max(1, Math.min(rows, 500)), cols: Math.max(1, Math.min(cols, 63)), withHeaderRow: false }).run()
    onClose()
  }
  return (
    <Modal title="Insert Table" onClose={onClose} width={320} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <fieldset className="dlg-fieldset">
        <legend>Table size</legend>
        <label className="dlg-inline">
          Number of columns: <input type="number" min={1} max={63} value={cols} onChange={(e) => setCols(Number(e.target.value))} />
        </label>
        <label className="dlg-inline">
          Number of rows: <input type="number" min={1} max={500} value={rows} onChange={(e) => setRows(Number(e.target.value))} />
        </label>
      </fieldset>
    </Modal>
  )
}

function PageNumberFormatDialog({ app, onClose }: { app: AppApi; onClose: () => void }) {
  const [format, setFormat] = useState<PageNumberFormat>(app.setup.pageNumberFormat)
  const [start, setStart] = useState(app.setup.pageNumberStart)
  const [restart, setRestart] = useState(app.setup.pageNumberStart !== 1)
  const formats: PageNumberFormat[] = ['decimal', 'lowerLetter', 'upperLetter', 'lowerRoman', 'upperRoman']
  const apply = () => {
    app.setSetup({ ...app.setup, pageNumberFormat: format, pageNumberStart: restart ? Math.max(0, start) : 1 })
    onClose()
  }
  return (
    <Modal title="Page Number Format" onClose={onClose} width={340} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <label className="dlg-inline">
        Number format:
        <select value={format} onChange={(e) => setFormat(e.target.value as PageNumberFormat)}>
          {formats.map((f) => (
            <option key={f} value={f}>
              {[1, 2, 3].map((n) => formatPageNumber(n, f)).join(', ')}, …
            </option>
          ))}
        </select>
      </label>
      <fieldset className="dlg-fieldset">
        <legend>Page numbering</legend>
        <label><input type="radio" checked={!restart} onChange={() => setRestart(false)} /> Continue from previous section</label>
        <label className="dlg-inline">
          <input type="radio" checked={restart} onChange={() => setRestart(true)} /> Start at:
          <input type="number" min={0} value={start} disabled={!restart} onChange={(e) => setStart(Number(e.target.value))} />
        </label>
      </fieldset>
    </Modal>
  )
}

function luminance(color: string) {
  const hex = color.replace('#', '')
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex.slice(0, 6)
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  return isNaN(r + g + b) ? 0 : 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function AccessibilityDialog({ app, onClose }: { app: AppApi; onClose: () => void }) {
  const issues = useMemo(() => {
    const out: { kind: 'Error' | 'Warning'; text: string; pos: number }[] = []
    let lastLevel = 0
    app.mainEditor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image' && !node.attrs.alt) out.push({ kind: 'Error', text: 'Missing alternative text (picture)', pos })
      if (node.type.name === 'heading') {
        if (!node.textContent.trim()) out.push({ kind: 'Warning', text: 'Empty heading', pos })
        if (lastLevel && node.attrs.level > lastLevel + 1) out.push({ kind: 'Warning', text: `Skipped heading level (Heading ${lastLevel} → Heading ${node.attrs.level})`, pos })
        lastLevel = node.attrs.level
      }
      if (node.type.name === 'table') {
        let headerCells = false
        node.firstChild?.forEach((c) => (headerCells ||= c.type.name === 'tableHeader'))
        if (!headerCells) out.push({ kind: 'Warning', text: 'Table has no header row', pos })
      }
      if (node.isText) {
        const color = node.marks.find((m) => m.type.name === 'textStyle')?.attrs.color as string | undefined
        if (color && luminance(color) > 0.8) out.push({ kind: 'Warning', text: 'Hard-to-read text contrast', pos })
      }
    })
    return out
  }, [app.mainEditor])
  return (
    <Modal title="Accessibility" onClose={onClose} width={460} footer={<button type="button" className="btn btn-primary" onClick={onClose}>Close</button>}>
      {issues.length ? (
        <ul className="issues">
          {issues.map((i, n) => (
            <li key={n}>
              <span className={cls('issue-kind', i.kind === 'Error' && 'is-error')}>{i.kind}</span>
              <span>{i.text}</span>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  app.scrollToPos(Math.max(1, i.pos))
                  onClose()
                }}
              >
                Go to
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No issues found. This document should be easy to read for everyone, including people who use assistive technology.</p>
      )}
    </Modal>
  )
}

function CaptionDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [label, setLabel] = useState('Figure')
  const [position, setPosition] = useState<'below' | 'above'>('below')
  const count = useMemo(() => {
    let n = 0
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'paragraph' && node.attrs.pStyle === 'caption' && node.textContent.startsWith(label)) n++
    })
    return n
  }, [editor, label])
  const [text, setText] = useState('')
  const apply = () => {
    const caption = { type: 'paragraph', attrs: { pStyle: 'caption' }, content: [{ type: 'text', text: `${label} ${count + 1}${text ? `: ${text}` : ''}` }] }
    const $from = editor.state.selection.$from
    const depth = Math.max(1, $from.depth)
    const at = position === 'below' ? $from.after(depth) : $from.before(depth)
    editor.chain().focus().insertContentAt(at, caption).run()
    onClose()
  }
  return (
    <Modal title="Caption" onClose={onClose} width={380} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <div className="dlg-stack">
        <label className="dlg-inline">
          Caption: <input value={`${label} ${count + 1}${text ? `: ${text}` : ''}`} readOnly />
        </label>
        <label className="dlg-inline">
          Text: <input autoFocus value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <label className="dlg-inline">
          Label:
          <select value={label} onChange={(e) => setLabel(e.target.value)}>
            <option>Figure</option>
            <option>Table</option>
            <option>Equation</option>
          </select>
        </label>
        <label className="dlg-inline">
          Position:
          <select value={position} onChange={(e) => setPosition(e.target.value as 'below' | 'above')}>
            <option value="below">Below selected item</option>
            <option value="above">Above selected item</option>
          </select>
        </label>
      </div>
    </Modal>
  )
}

function ImageUrlDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const apply = () => {
    const src = url.trim()
    if (/^(https?:|data:image\/)/i.test(src)) editor.chain().focus().setImage({ src }).run()
    onClose()
  }
  return (
    <Modal title="Insert Picture from Address" onClose={onClose} width={440} footer={<OkCancel okLabel="Insert" onOk={apply} onCancel={onClose} />}>
      <label className="dlg-stack">
        Picture address (URL):
        <input autoFocus placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} />
        <small className="dlg-hint">Pictures from other websites can only be saved into .docx files if the website allows it.</small>
      </label>
    </Modal>
  )
}

function AltTextDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const isImage = editor.state.selection instanceof NodeSelection && editor.state.selection.node.type.name === 'image'
  const [alt, setAlt] = useState((editor.getAttributes('image').alt as string) ?? '')
  const [decorative, setDecorative] = useState(false)
  const apply = () => {
    if (isImage) editor.chain().focus().updateAttributes('image', { alt: decorative ? '' : alt }).run()
    onClose()
  }
  return (
    <Modal title="Alt Text" onClose={onClose} width={400} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      {isImage ? (
        <div className="dlg-stack">
          <label className="dlg-stack">
            How would you describe this picture to someone who can't see it?
            <textarea autoFocus rows={4} value={alt} disabled={decorative} onChange={(e) => setAlt(e.target.value)} />
          </label>
          <label><input type="checkbox" checked={decorative} onChange={(e) => setDecorative(e.target.checked)} /> Mark as decorative</label>
        </div>
      ) : (
        <p>Select a picture first.</p>
      )}
    </Modal>
  )
}
