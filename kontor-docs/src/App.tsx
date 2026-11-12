import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditor } from '@tiptap/react'
import type { Editor, JSONContent } from '@tiptap/core'
import type { Mark } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'
import { APP_NAME, DEFAULT_DOC_TITLE } from './brand'
import { createExtensions } from './editor/extensions'
import { PaginationController } from './editor/Pagination'
import { fieldValue } from './editor/Fields'
import { applyMarks, cycleCase, insertDate, pickFile, readFileAsDataUrl } from './editor/commands'
import {
  DEFAULT_DESIGN, DEFAULT_SETUP, EMPTY_HEADER_FOOTER, formatPageNumber, paperDims, slotFor, type HeaderFooter, type HeaderFooterSlot,
  type PageDesign, type PageSetup,
} from './pageSetup'
import { PX_PER_IN, loadSettings, saveSettings, type Settings } from './units'
import { downloadBlob, safeFilename } from './io/download'
import { forgetFile, loadAutosaveAsync, loadAutosaveSync, onSystemOpenFile, openFilePicker, saveFile, storeAutosave, type FileType } from './io/fileAccess'
import { printPages, type PrintOptions } from './io/print'
import { DEFAULT_QAT, TitleBar, type TitleBarActions } from './components/TitleBar'
import { watchClipboard } from './editor/clipboardHistory'
import { Ribbon, prefetchTabs, type TabId } from './components/Ribbon'
import { Ruler } from './components/Ruler'
import { VerticalRuler } from './components/VerticalRuler'
import { InkOverlay, type InkTool } from './components/InkOverlay'
import { StatusBar } from './components/StatusBar'
import type { SaveFormat, Section as BackstageSection } from './components/Backstage'
import { FindPanel } from './components/FindPanel'
import { PAGE_GAP, PageView, type HeaderFooterEdit } from './components/PageView'
import { ContextMenu } from './components/ContextMenu'
import { MiniToolbar } from './components/MiniToolbar'
import { PasteOptionsButton } from './components/PasteOptionsButton'
import { cls } from './components/ui'
import { placeDrawing } from './editor/placeDrawing'
import { attachTableTool, type TableTool } from './editor/drawTable'
import { loadMacros, pickCommand, saveMacros, startRecording, type Recorder } from './editor/macros'
import { setLanguage as setUiLanguage, t, tx } from './i18n'
import { crossRefText, setRefContext, type CrossRefAttrs } from './editor/Objects'
import { stylesCss, type StyleDefs } from './editor/styleDefs'
import { DEFAULT_PEN, type BorderPen, type CellBorders } from './editor/TableExtras'
import { DEFAULT_AUTOCORRECT } from './editor/AutoCorrect'
import { setCitationContext, type CitationStyle, type Sources } from './editor/Citations'
import { addVersion, archiveDocument, loadArchived, touchDocument } from './library'

// Panes, dialogs and the File backstage load when first opened.
const Backstage = lazy(() => import('./components/Backstage').then((m) => ({ default: m.Backstage })))
const NavigationPane = lazy(() => import('./components/NavigationPane').then((m) => ({ default: m.NavigationPane })))
const Dialogs = lazy(() => import('./components/dialogs/Dialogs').then((m) => ({ default: m.Dialogs })))
const CommentsPane = lazy(() => import('./components/CommentsPane').then((m) => ({ default: m.CommentsPane })))
const ReviewingPane = lazy(() => import('./components/ReviewingPane').then((m) => ({ default: m.ReviewingPane })))
const StylesPane = lazy(() => import('./components/StylesPane').then((m) => ({ default: m.StylesPane })))
const ClipboardPane = lazy(() => import('./components/ClipboardPane').then((m) => ({ default: m.ClipboardPane })))
const DiagramTextPane = lazy(() => import('./components/DiagramTextPane').then((m) => ({ default: m.DiagramTextPane })))
const SelectionPane = lazy(() => import('./components/SelectionPane').then((m) => ({ default: m.SelectionPane })))
const StyleDialog = lazy(() => import('./components/dialogs/StyleDialog').then((m) => ({ default: m.StyleDialog })))
const ReadMode = lazy(() => import('./components/ReadMode').then((m) => ({ default: m.ReadMode })))
const PageOverview = lazy(() => import('./components/PageOverview').then((m) => ({ default: m.PageOverview })))

const DEFAULTS_KEY = 'kontor-write:defaults'
type SavedDefaults = { design?: Partial<PageDesign>; styles?: StyleDefs }
function loadDefaults(): SavedDefaults {
  try {
    return JSON.parse(localStorage.getItem(DEFAULTS_KEY) ?? '{}') as SavedDefaults
  } catch {
    return {}
  }
}
import { commentsAt, isTracking, newId, type Comments } from './editor/Review'
import { DEFAULT_NOTE_SETTINGS, EMPTY_NOTE, collectNotes, notesKey, type NoteKind, type NoteSettings, type Notes } from './editor/Notes'
import type { AppApi, DialogKind, MarkupView, OutlineOptions, Restriction, ShowMarkup, ViewMode } from './components/tabs/types'

const STORAGE_KEY = 'kontor-write:document'

type Stored = {
  version: 2
  title: string
  content: JSONContent
  setup: PageSetup
  design: PageDesign
  headerFooter: HeaderFooter
  language: string
  comments?: Comments
  trackChanges?: boolean
  restriction?: Restriction
  restrictionHash?: string | null
  notes?: Notes
  noteSettings?: NoteSettings
  styles?: StyleDefs
  docId?: string
  sources?: Sources
  citationStyle?: CitationStyle
  /** Review › Track Changes › Lock Tracking: password hash ("" = no password). */
  trackLock?: string | null
}

const DOCX: FileType = { description: tx('DOCX document'), extensions: ['docx'], mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
const OPEN_TYPES: FileType[] = [
  DOCX,
  { description: tx('OpenDocument text'), extensions: ['odt'], mime: 'application/vnd.oasis.opendocument.text' },
  { description: tx('Markdown'), extensions: ['md', 'markdown'], mime: 'text/markdown' },
  { description: tx('Web page'), extensions: ['html', 'htm'], mime: 'text/html' },
  { description: tx('Plain text'), extensions: ['txt'], mime: 'text/plain' },
  { description: tx('Rich Text Format'), extensions: ['rtf'], mime: 'application/rtf' },
  { description: tx('Legacy .doc document'), extensions: ['doc'], mime: 'application/msword' },
]
// Labels the document stylesheet shows with the formatting marks (CSS cannot translate them itself).
document.documentElement.style.setProperty('--label-page-break', JSON.stringify(t('Page Break')))
document.documentElement.style.setProperty('--label-column-break', JSON.stringify(t('Column Break')))

/** The file type with its description in the interface language. */
const localizedType = (type: FileType): FileType => ({ ...type, description: t(type.description) })
const SAVE_TYPES: Record<string, FileType> = {
  docx: DOCX,
  odt: OPEN_TYPES[1],
  md: { ...OPEN_TYPES[2], extensions: ['md'] },
  html: { ...OPEN_TYPES[3], extensions: ['html'] },
  txt: OPEN_TYPES[4],
  rtf: OPEN_TYPES[5],
}

function parseStored(raw: string | null | undefined): Stored | null {
  try {
    const parsed = raw ? (JSON.parse(raw) as Stored) : null
    return parsed?.version === 2 ? parsed : null
  } catch {
    return null
  }
}

function loadStored(): Stored | null {
  try {
    const raw = loadAutosaveSync(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Stored) : null
    return parsed?.version === 2 ? parsed : null
  } catch {
    return null
  }
}

export type LoadedDocument = {
  title: string
  content: JSONContent | string
  setup?: Partial<PageSetup>
  design?: Partial<PageDesign>
  headerFooter?: Partial<HeaderFooter>
  comments?: Comments
  trackChanges?: boolean
  notes?: Notes
  noteSettings?: Partial<NoteSettings>
  styles?: StyleDefs
  docId?: string
  sources?: Sources
  citationStyle?: CitationStyle
  trackLock?: string | null
}

export function App() {
  const stored = useMemo(loadStored, [])
  const [title, setTitle] = useState(stored?.title ?? t(DEFAULT_DOC_TITLE))
  const [docId, setDocId] = useState(() => stored?.docId ?? newId())
  const [setup, setSetup] = useState<PageSetup>({ ...DEFAULT_SETUP, ...stored?.setup })
  const savedDefaults = useMemo(loadDefaults, [])
  const [design, setDesign] = useState<PageDesign>({ ...DEFAULT_DESIGN, ...savedDefaults.design, ...stored?.design })
  const [styleDefs, setStyleDefsState] = useState<StyleDefs>(stored?.styles ?? savedDefaults.styles ?? {})
  const setStyleDefs = useCallback((update: (d: StyleDefs) => StyleDefs) => setStyleDefsState(update), [])
  const [showStylesPane, setShowStylesPane] = useState(false)
  const [showSelectionPane, setShowSelectionPane] = useState(false)
  const [backstageSection, setBackstageSection] = useState<BackstageSection>('home')
  // File opens on its Home page unless a command asked for another one (Print Preview).
  const setBackstage = useCallback((open: boolean) => {
    setBackstageOpen(open)
    if (!open) setBackstageSection('home')
  }, [])
  const [showDiagramPane, setShowDiagramPane] = useState(false)
  const [showClipboardPane, setShowClipboardPane] = useState(false)
  const [sources, setSources] = useState<Sources>(stored?.sources ?? {})
  const [citationStyle, setCitationStyle] = useState<CitationStyle>(stored?.citationStyle ?? 'apa')
  setCitationContext(sources, citationStyle)
  const [styleDialog, setStyleDialog] = useState<{ id: string | null } | null>(null)
  const [headerFooter, setHeaderFooter] = useState<HeaderFooter>({ ...EMPTY_HEADER_FOOTER, ...stored?.headerFooter })
  const [settings, setSettingsState] = useState<Settings>(loadSettings)
  const [zoom, setZoomRaw] = useState(100)
  const setZoom = useCallback((z: number) => setZoomRaw(Math.round(Math.min(500, Math.max(10, z)))), [])
  const [showRuler, setShowRuler] = useState(true)
  const [showMarks, setShowMarks] = useState(false)
  const [showNavigation, setShowNavigation] = useState(false)
  const [showGridlines, setShowGridlines] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [ribbonCollapsed, setRibbonCollapsed] = useState(false)
  // "New Window" opens a read-only Read Mode copy of the document.
  const [viewMode, setViewMode] = useState<ViewMode>(() => (new URLSearchParams(location.search).get('view') === 'read' ? 'read' : 'print'))
  const [spellcheck, setSpellcheck] = useState(true)
  const [language, setLanguage] = useState(stored?.language ?? 'en-US')
  const [fontColor, setFontColor] = useState('#FF0000')
  const [highlightColor, setHighlightColor] = useState('#FFFF00')
  const [painter, setPainter] = useState<{ marks: readonly Mark[]; sticky: boolean } | null>(null)
  const [copiedFormat, setCopiedFormat] = useState<readonly Mark[] | null>(null)
  const [tab, setTab] = useState<TabId>('home')
  const [backstage, setBackstageOpen] = useState(false)
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [find, setFind] = useState({ query: '', seq: 0 })
  const [autoSave, setAutoSave] = useState(true)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'failed'>('saved')
  const [version, setVersion] = useState(0)
  const [pages, setPages] = useState(1)
  /** Bumped by every new page layout (break positions, endnote placement). */
  const [layoutVersion, setLayoutVersion] = useState(0)
  const [hfEdit, setHfEdit] = useState<HeaderFooterEdit | null>(null)
  const [comments, setCommentsState] = useState<Comments>(stored?.comments ?? {})
  const setComments = useCallback((update: (c: Comments) => Comments) => setCommentsState(update), [])
  const [activeComment, setActiveComment] = useState<string | null>(null)
  const [editingComment, setEditingComment] = useState<string | null>(null)
  const [showComments, setShowComments] = useState(true)
  const [markupView, setMarkupView] = useState<MarkupView>('all')
  const [showMarkup, setShowMarkup] = useState<ShowMarkup>({ comments: true, insDel: true, highlight: false })
  const [showReviewingPane, setShowReviewingPane] = useState(false)
  const [restriction, setRestrictionState] = useState<Restriction>(stored?.restriction ?? 'none')
  const [restrictionHash, setRestrictionHash] = useState<string | null>(stored?.restrictionHash ?? null)
  const [trackLock, setTrackLock] = useState<string | null>(stored?.trackLock ?? null)
  const [pagesEl, setPagesEl] = useState<HTMLDivElement | null>(null)
  const [notes, setNotes] = useState<Notes>(stored?.notes ?? {})
  const [noteSettings, setNoteSettings] = useState<NoteSettings>({ ...DEFAULT_NOTE_SETTINGS, ...stored?.noteSettings })
  const noteSettingsRef = useRef(noteSettings)
  noteSettingsRef.current = noteSettings
  const [noteEdit, setNoteEdit] = useState<string | null>(null)
  const [hideBodyWhileHf, setHideBodyWhileHf] = useState(false)
  const [overview, setOverview] = useState<'multiple' | 'sideBySide' | null>(null)
  const [tablePen, setTablePen] = useState<BorderPen>(DEFAULT_PEN)
  const [borderPainter, setBorderPainter] = useState(false)
  const [tableTool, setTableTool] = useState<TableTool | null>(null)
  const [inkTool, setInkTool] = useState<InkTool | null>(null)
  // Options › Customize Ribbon › Add Command: the group waiting for a clicked ribbon command.
  const [picking, setPicking] = useState<{ tab: string; group: string } | null>(null)
  const [hideInk, setHideInk] = useState(false)
  // View › Macros: the macro being recorded.
  const [macroRec, setMacroRec] = useState<{ name: string; description: string; recorder: Recorder; paused: boolean } | null>(null)
  const [darkPage, setDarkPage] = useState(false)
  const [outline, setOutline] = useState<OutlineOptions>({ level: 0, firstLineOnly: false, showFormatting: true })
  const [drawKind, setDrawKind] = useState<string | null>(null)
  /** Position of the chart, equation or signature line a dialog edits. */
  const [objectPos, setObjectPos] = useState<number | null>(null)
  const openObjectDialog = useRef<(kind: DialogKind, pos: number) => void>(() => undefined)
  openObjectDialog.current = (kind, pos) => {
    setObjectPos(pos)
    setDialog(kind)
  }
  const canvasRef = useRef<HTMLDivElement>(null)
  const firstSave = useRef(true)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const setSettings = useCallback((s: Settings) => {
    setSettingsState(s)
    saveSettings(s)
  }, [])

  const controller = useMemo(() => new PaginationController(), [])
  // Load the other ribbon tabs and the dialogs in the background once the document is shown.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 1500))
    idle(() => {
      prefetchTabs()
      void import('./components/dialogs/Dialogs')
    })
  }, [])
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { kontor: unknown }).kontor = { controller }
    controller.onLayout = (r) => {
      setPages(r.pages)
      setLayoutVersion((v) => v + 1)
    }
    return () => {
      controller.onLayout = null
    }
  }, [controller])

  const editor = useEditor({
    extensions: createExtensions({
      pagination: controller,
      getAuthor: () => settingsRef.current.userName || t('Author'),
      getNoteSettings: () => noteSettingsRef.current,
      getPasteMode: () => settingsRef.current.defaultPaste ?? 'keep',
      getAutoCorrect: () => ({ smartQuotes: settingsRef.current.smartQuotes, autoCorrect: settingsRef.current.autoCorrect, entries: settingsRef.current.autoCorrectEntries ?? DEFAULT_AUTOCORRECT }),
      editors: {
        chart: (pos) => openObjectDialog.current('chartData', pos),
        diagram: () => setShowDiagramPane(true),
        equation: (pos) => openObjectDialog.current('equation', pos),
        signature: (pos) => openObjectDialog.current('signature', pos),
      },
    }),
    content: stored?.content ?? '<p></p>',
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { spellcheck: 'true', lang: 'en-US', 'aria-label': t('Document body') } },
    onUpdate: () => setVersion((v) => v + 1),
  })

  // Cuts and copies are kept for the Clipboard pane from the start.
  useEffect(() => watchClipboard(document), [])

  // Header/footer editor: one instance, loaded with the slot that is being edited.
  const hfSlot = useRef<HeaderFooterSlot | null>(null)
  const fieldCtx = useRef({ page: '1', pages: 1, title })
  const hfEditor = useEditor({
    extensions: createExtensions({ resolveField: (kind) => fieldValue(kind, fieldCtx.current) }),
    content: '<p></p>',
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { spellcheck: 'true', lang: 'en-US', 'aria-label': t('Header or footer') } },
    onUpdate: ({ editor: e }) => {
      const slot = hfSlot.current
      if (slot) setHeaderFooter((hf) => ({ ...hf, [slot]: e.getJSON() }))
    },
  })

  // Footnote/endnote editor: one instance, loaded with the note that is being edited.
  const noteSlot = useRef<string | null>(null)
  const noteEditor = useEditor({
    extensions: createExtensions({}),
    content: '<p></p>',
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { spellcheck: 'true', lang: 'en-US', 'aria-label': t('Note text') } },
    onUpdate: ({ editor: e }) => {
      const id = noteSlot.current
      if (id) setNotes((n) => ({ ...n, [id]: e.getJSON() }))
    },
  })

  useEffect(() => {
    if (!noteEditor) return
    noteSlot.current = null
    if (!noteEdit) return
    noteEditor.commands.setContent(notes[noteEdit] ?? EMPTY_NOTE, { emitUpdate: false })
    noteSlot.current = noteEdit
    const t = setTimeout(() => noteEditor.commands.focus('end'), 30)
    return () => clearTimeout(t)
    // Only switching notes reloads the editor; edits flow back through onUpdate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteEditor, noteEdit])

  // Renumber note references when the numbering options change.
  useEffect(() => {
    if (editor) editor.view.dispatch(editor.state.tr.setMeta(notesKey, true))
  }, [editor, noteSettings])

  useEffect(() => {
    for (const e of [editor, hfEditor, noteEditor]) {
      if (!e) continue
      e.view.dom.setAttribute('spellcheck', String(spellcheck))
      e.view.dom.setAttribute('lang', language)
    }
  }, [editor, hfEditor, noteEditor, spellcheck, language])

  const { w: paperW, h: paperH } = paperDims(setup)

  // Cross-references show page numbers from the pagination.
  setRefContext({ pageOf: (pos) => controller.pageOfPos(pos), pageLabel: (p) => formatPageNumber(p + setup.pageNumberStart, setup.pageNumberFormat) })

  useEffect(() => {
    if (!editor || !hfEditor) return
    if (!hfEdit) {
      hfSlot.current = null
      editor.setEditable(restriction !== 'readOnly' && restriction !== 'comments')
      return
    }
    fieldCtx.current = { page: formatPageNumber(hfEdit.page + setup.pageNumberStart, setup.pageNumberFormat), pages, title }
    hfSlot.current = null
    hfEditor.commands.setContent(headerFooter[hfEdit.slot] ?? '<p></p>', { emitUpdate: false })
    hfSlot.current = hfEdit.slot
    editor.setEditable(false)
    setTab('hf')
    requestAnimationFrame(() => hfEditor.commands.focus('end'))
    // Only switching the edited area reloads the editor; edits flow back through onUpdate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, hfEditor, hfEdit?.slot, hfEdit?.page, restriction])

  // Restrict Editing: "Tracked changes" (and Lock Tracking) keeps Track Changes switched on.
  useEffect(() => {
    if (editor && (restriction === 'tracked' || trackLock != null) && !isTracking(editor.state)) editor.commands.setTrackChanges(true)
  })

  /** The document with everything that is stored for it (AutoSave, recent documents, versions). */
  const snapshot = (): Stored | null =>
    editor
      ? { version: 2, title, content: editor.getJSON(), setup, design, headerFooter, language, comments, trackChanges: isTracking(editor.state), restriction, restrictionHash, notes, noteSettings, styles: styleDefs, docId, sources, citationStyle, trackLock }
      : null
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot

  // Autosave to the browser (localStorage), slightly delayed.
  useEffect(() => {
    if (firstSave.current) {
      firstSave.current = false
      return
    }
    if (!autoSave || !editor) return
    setSaveState('saving')
    const t = setTimeout(() => {
      const doc = snapshot()
      if (!doc) return
      storeAutosave(STORAGE_KEY, JSON.stringify(doc))
        .then(() => {
          const words = editor.storage.characterCount.words()
          touchDocument({ id: docId, title, modified: new Date().toISOString(), words })
          // Version history: at most one automatic version every ten minutes.
          void addVersion(docId, doc, words, 10 * 60 * 1000)
          setSaveState('saved')
        })
        .catch(() => setSaveState('failed'))
    }, 600)
    return () => clearTimeout(t)
  }, [version, title, setup, design, headerFooter, language, comments, restriction, restrictionHash, notes, noteSettings, styleDefs, docId, autoSave, editor, sources, citationStyle, trackLock])

  // Citations, bibliographies and indexes show sources and page numbers: refresh them when those change.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta('addToHistory', false))
  }, [editor, sources, citationStyle, layoutVersion])

  // Restore Track Changes with the document, and follow the cursor into comment anchors.
  useEffect(() => {
    if (editor && stored?.trackChanges) editor.commands.setTrackChanges(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])
  const lastSelection = useRef<unknown>(null)
  useEffect(() => {
    if (!editor || editor.state.selection === lastSelection.current) return
    const moved = lastSelection.current != null
    lastSelection.current = editor.state.selection
    if (!moved) return
    const ids = commentsAt(editor.state).filter((id) => comments[id])
    setActiveComment(ids[0] ?? null)
  })

  // Dialogs requested from places without access to the app (e.g. double-clicking a ruler tab).
  useEffect(() => {
    const onOpen = (e: Event) => setDialog((e as CustomEvent<DialogKind>).detail)
    window.addEventListener('kontor:open-dialog', onOpen)
    return () => window.removeEventListener('kontor:open-dialog', onOpen)
  }, [])

  // Border Painter: clicking near a cell edge draws that edge with the current pen.
  useEffect(() => {
    if (!borderPainter || !editor) return
    const dom = editor.view.dom
    const onDown = (e: MouseEvent) => {
      const cell = (e.target as HTMLElement).closest<HTMLElement>('td, th')
      if (!cell || !dom.contains(cell)) return
      e.preventDefault()
      const r = cell.getBoundingClientRect()
      const d = { top: e.clientY - r.top, bottom: r.bottom - e.clientY, left: e.clientX - r.left, right: r.right - e.clientX }
      const side = (Object.keys(d) as (keyof typeof d)[]).reduce((a, b) => (d[a] <= d[b] ? a : b))
      const pos = editor.view.posAtDOM(cell, 0) - 1
      const node = editor.state.doc.nodeAt(pos)
      if (!node || !/table(Cell|Header)/.test(node.type.name)) return
      const borders: CellBorders = { ...(node.attrs.borders as CellBorders | null), [side]: tablePen }
      editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, borders }))
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setBorderPainter(false)
    dom.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    dom.classList.add('is-border-painting')
    return () => {
      dom.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
      dom.classList.remove('is-border-painting')
    }
  }, [borderPainter, editor, tablePen])

  // Customize Ribbon › Add Command: the next ribbon command clicked joins the group.
  useEffect(() => {
    if (!picking || !editor) return
    return pickCommand(editor, (c) => {
      setPicking(null)
      if (c) {
        const s = settingsRef.current
        const customTabs = (s.customTabs ?? []).map((tab) => (tab.id !== picking.tab ? tab : { ...tab, groups: tab.groups.map((g) => (g.id !== picking.group ? g : { ...g, items: [...g.items, c] })) }))
        setSettings({ ...s, customTabs })
      }
      setDialog('options')
    })
  }, [picking, editor, setSettings])

  // Table › Draw Table and Eraser.
  useEffect(() => {
    if (!tableTool || !editor) return
    return attachTableTool(editor.view, tableTool, () => setTableTool(null))
  }, [tableTool, editor])

  // Format Painter: applied to the next selection (double-click keeps it on until Esc).
  useEffect(() => {
    if (!painter || !editor) return
    const target = hfEdit && hfEditor ? hfEditor : editor
    const dom = target.view.dom
    const onUp = () =>
      setTimeout(() => {
        if (target.state.selection.empty) return
        applyMarks(target, painter.marks)
        if (!painter.sticky) setPainter(null)
      }, 0)
    dom.addEventListener('mouseup', onUp)
    return () => dom.removeEventListener('mouseup', onUp)
  }, [painter, editor, hfEditor, hfEdit])

  const activeEditor = (hfEdit && hfEditor ? hfEditor : noteEdit && noteEditor ? noteEditor : editor) as Editor | null

  const exportDocument = useCallback(async () => {
    if (!editor) return null
    const { exportDocx } = await import('./io/docxExport')
    const crossRefs: Record<string, string> = {}
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name === 'crossRef') crossRefs[`${n.attrs.target}|${n.attrs.show}`] = crossRefText(editor.state.doc, n.attrs as CrossRefAttrs, pos)
    })
    return exportDocx({ doc: editor.getJSON(), setup, design, headerFooter, title, comments, trackChanges: isTracking(editor.state), notes, crossRefs, styles: styleDefs })
  }, [editor, setup, design, headerFooter, title, comments, notes, styleDefs, sources, citationStyle])

  /** Writes the document to a file. `saveAs` asks where to save; otherwise Save writes back into the open .docx file. */
  const writeFile = useCallback(
    async (format: SaveFormat, saveAs: boolean) => {
      if (!editor) return
      const name = safeFilename(title)
      let blob: Blob | null = null
      if (format === 'docx') blob = await exportDocument()
      else if (format === 'html') {
        const { exportHtml } = await import('./io/htmlExport')
        blob = new Blob([exportHtml(editor, title, design)], { type: 'text/html' })
      } else if (format === 'txt') blob = new Blob([editor.getText({ blockSeparator: '\r\n' })], { type: 'text/plain' })
      else {
        const formats = await import('./io/formats')
        if (format === 'md') blob = new Blob([formats.exportMarkdown(editor.getJSON())], { type: 'text/markdown' })
        else if (format === 'rtf') blob = new Blob([formats.exportRtf(editor.getJSON(), title)], { type: 'application/rtf' })
        else if (format === 'odt') blob = await formats.exportOdt(editor.getJSON(), title)
      }
      if (!blob) return
      const type = localizedType(SAVE_TYPES[format])
      try {
        const result = await saveFile(blob, `${name}.${type.extensions[0]}`, type, { saveAs, remember: format === 'docx' })
        if (result !== 'cancelled') {
          const doc = snapshotRef.current()
          if (doc) void addVersion(doc.docId!, doc, editor.storage.characterCount.words())
        }
        if (result === 'saved') setBackstage(false)
      } catch (error) {
        console.error(error)
        alert(t('The document could not be saved: {error}', { error: (error as Error).message }))
      }
    },
    [editor, exportDocument, title, design],
  )
  const saveAs = useCallback((format: SaveFormat = 'docx') => writeFile(format, true), [writeFile])
  const save = useCallback(() => writeFile('docx', false), [writeFile])

  /** Keeps a copy of the open document in the browser's document list before another one opens. */
  const archiveCurrent = useCallback(() => {
    if (!editor || editor.isEmpty) return
    const entry = { id: docId, title, modified: new Date().toISOString(), words: editor.storage.characterCount.words() }
    void loadAutosaveAsync(STORAGE_KEY).then((raw) => {
      const stored = parseStored(raw)
      if (stored) archiveDocument(docId, stored, entry)
    })
  }, [editor, docId, title])

  const loadDocument = useCallback(
    (doc: LoadedDocument, id?: string) => {
      if (!editor) return
      archiveCurrent()
      setDocId(id ?? newId())
      setHfEdit(null)
      editor.commands.setTrackChanges(false)
      editor.commands.setContent(doc.content, { emitUpdate: true })
      if (doc.trackChanges) editor.commands.setTrackChanges(true)
      setComments(() => doc.comments ?? {})
      setActiveComment(null)
      setNoteEdit(null)
      setNotes(doc.notes ?? {})
      setNoteSettings({ ...DEFAULT_NOTE_SETTINGS, ...doc.noteSettings })
      setTitle(doc.title)
      setSetup({ ...DEFAULT_SETUP, ...doc.setup })
      const defaults = loadDefaults()
      setDesign({ ...DEFAULT_DESIGN, ...defaults.design, ...doc.design })
      setStyleDefs(() => doc.styles ?? defaults.styles ?? {})
      setSources(doc.sources ?? {})
      setCitationStyle(doc.citationStyle ?? 'apa')
      setTrackLock(doc.trackLock ?? null)
      setHeaderFooter({ ...EMPTY_HEADER_FOOTER, ...doc.headerFooter })
      setBackstage(false)
      editor.commands.focus('start')
    },
    [editor, setComments, setStyleDefs, archiveCurrent],
  )

  const openRecent = useCallback(
    (id: string) => {
      const doc = loadArchived<Stored>(id)
      if (!doc) return alert(t('This document is no longer stored in this browser.'))
      forgetFile()
      loadDocument({ title: doc.title, content: doc.content, setup: doc.setup, design: doc.design, headerFooter: doc.headerFooter, comments: doc.comments, trackChanges: doc.trackChanges, notes: doc.notes, noteSettings: doc.noteSettings, styles: doc.styles, sources: doc.sources, citationStyle: doc.citationStyle, trackLock: doc.trackLock }, id)
    },
    [loadDocument],
  )

  const newComment = useCallback(() => {
    if (!editor) return
    setHfEdit(null)
    const id = newId()
    if (!editor.commands.addComment(id)) return
    const { userName, userInitials } = settingsRef.current
    setComments((c) => ({ ...c, [id]: { id, author: userName || t('Author'), initials: userInitials || 'A', date: new Date().toISOString(), text: '', resolved: false, replies: [] } }))
    setShowComments(true)
    setActiveComment(id)
    setEditingComment(id)
  }, [editor, setComments])

  const insertNote = useCallback(
    (kind: NoteKind) => {
      if (!editor) return
      setHfEdit(null)
      const id = newId()
      setNotes((n) => ({ ...n, [id]: EMPTY_NOTE }))
      editor.chain().insertNoteRef(kind, id).run()
      setViewMode('print')
      setNoteEdit(id)
    },
    [editor],
  )

  const closeNote = useCallback(() => {
    if (!editor || !noteEdit) return
    const ref = collectNotes(editor.state.doc).find((n) => n.id === noteEdit)
    setNoteEdit(null)
    if (ref) editor.chain().focus().setTextSelection(ref.pos + 1).run()
  }, [editor, noteEdit])

  const openDocumentFile = useCallback(async (file: File) => {
    if (!editor) return
    const base = file.name.replace(/\.(docx|odt|md|markdown|html?|txt|rtf|doc)$/i, '')
    try {
      if (/\.docx$/i.test(file.name)) {
        const { importDocx } = await import('./io/docxImport')
        const result = await importDocx(file)
        loadDocument({ ...result, title: base })
      } else if (/\.odt$/i.test(file.name)) {
        const { importOdt } = await import('./io/formats')
        loadDocument({ title: base, content: await importOdt(file) })
      } else if (/\.(md|markdown)$/i.test(file.name)) {
        const { importMarkdown } = await import('./io/formats')
        loadDocument({ title: base, content: importMarkdown(await file.text()) })
      } else if (/\.rtf$/i.test(file.name)) {
        const { importRtf, readRtfFile } = await import('./io/rtf')
        const result = importRtf(await readRtfFile(file))
        loadDocument({ title: base, content: result.html || '<p></p>' })
      } else if (/\.doc$/i.test(file.name)) {
        const { importDoc } = await import('./io/doc')
        const result = importDoc(new Uint8Array(await file.arrayBuffer()))
        loadDocument({ title: result.title || base, content: result.html || '<p></p>' })
      } else if (/\.html?$/i.test(file.name)) {
        loadDocument({ title: base, content: await file.text() })
      } else {
        const text = await file.text()
        loadDocument({
          title: base,
          content: { type: 'doc', content: text.split(/\r?\n/).map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })) },
        })
      }
    } catch (error) {
      console.error(error)
      alert(t('{app} could not open this file. Is it a valid document?', { app: APP_NAME }))
    }
  }, [editor, loadDocument])

  const openFile = useCallback(async () => {
    if (!editor) return
    const file = await openFilePicker(OPEN_TYPES.map(localizedType), 'docx')
    if (file) await openDocumentFile(file)
  }, [editor, openDocumentFile])

  // Documents handed over by the operating system (desktop app: double-click, Open With).
  const openDocumentFileRef = useRef(openDocumentFile)
  openDocumentFileRef.current = openDocumentFile
  useEffect(() => {
    if (editor) onSystemOpenFile('docx', (file) => void openDocumentFileRef.current(file))
  }, [editor])

  // AutoSave data that did not fit into localStorage lives in IndexedDB and is restored here.
  useEffect(() => {
    if (!editor || loadAutosaveSync(STORAGE_KEY) !== undefined) return
    void loadAutosaveAsync(STORAGE_KEY).then((raw) => {
      const doc = parseStored(raw)
      if (doc) loadDocument({ title: doc.title, content: doc.content, setup: doc.setup, design: doc.design, headerFooter: doc.headerFooter, comments: doc.comments, trackChanges: doc.trackChanges, notes: doc.notes, noteSettings: doc.noteSettings, styles: doc.styles, sources: doc.sources, citationStyle: doc.citationStyle, trackLock: doc.trackLock }, doc.docId)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  const newDocument = useCallback(
    (html: string) => {
      if (!editor) return
      forgetFile()
      loadDocument({ title: t(DEFAULT_DOC_TITLE), content: html })
    },
    [editor, loadDocument],
  )

  const print = useCallback((options?: PrintOptions) => {
    setBackstage(false)
    setHfEdit(null)
    const run = () =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLElement>('.pages')
          if (el) printPages(el, controller.result.pages, paperH * PX_PER_IN + PAGE_GAP, paperW * PX_PER_IN, paperH * PX_PER_IN, options)
        }),
      )
    if (viewMode !== 'print') {
      setViewMode('print')
      setTimeout(run, 200)
    } else run()
  }, [controller, paperW, paperH, viewMode])

  const openFind = useCallback(
    (kind: 'find' | 'replace' | 'goto', query?: string) => {
      if (!editor) return
      const { from, to, empty } = editor.state.selection
      const selected = empty ? '' : editor.state.doc.textBetween(from, to, ' ')
      setFind((f) => ({ query: query ?? (selected && selected.length < 100 ? selected : f.query), seq: f.seq + 1 }))
      setDialog(kind)
    },
    [editor],
  )

  const scrollToPos = useCallback(
    (pos: number) => {
      if (!editor) return
      editor.chain().focus().setTextSelection(pos).run()
      const { node } = editor.view.domAtPos(pos)
      const el = node instanceof HTMLElement ? node : node.parentElement
      el?.scrollIntoView({ block: 'center' })
    },
    [editor],
  )

  // Keyboard shortcuts of a desktop word processor that need application state.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      if (e.key === 'Escape') {
        setInkTool(null)
        if (painter) setPainter(null)
        else if (hfEdit && !dialog) setHfEdit(null)
        else if (noteEdit && !dialog) closeNote()
        return
      }
      if (e.key === 'F12') {
        e.preventDefault()
        setBackstage(true)
        return
      }
      if (e.key === 'F7') {
        e.preventDefault()
        setSpellcheck(true)
        return
      }
      if (e.key === 'F3' && e.shiftKey && activeEditor) {
        e.preventDefault()
        cycleCase(activeEditor)
        return
      }
      if (e.altKey && !e.shiftKey && !mod && e.code === 'KeyQ') {
        e.preventDefault()
        document.getElementById('tb-search')?.focus()
        return
      }
      if (mod && e.altKey && e.shiftKey && e.code === 'KeyS') {
        e.preventDefault()
        setShowStylesPane((s) => !s)
        return
      }
      if (mod && e.altKey && !e.shiftKey && e.code === 'KeyM') {
        e.preventDefault()
        newComment()
        return
      }
      if (mod && e.altKey && !e.shiftKey && (e.code === 'KeyF' || e.code === 'KeyD')) {
        e.preventDefault()
        insertNote(e.code === 'KeyF' ? 'footnote' : 'endnote')
        return
      }
      if (e.altKey && e.shiftKey && !mod && activeEditor) {
        if (e.code === 'KeyD') {
          e.preventDefault()
          insertDate(activeEditor)
        } else if (e.code === 'KeyT') {
          e.preventDefault()
          insertDate(activeEditor, 8)
        } else if (e.code === 'KeyX') {
          e.preventDefault()
          setDialog('markEntry')
        } else if (e.code === 'KeyI') {
          e.preventDefault()
          setDialog('markCitation')
        } else if (e.code === 'KeyP' && hfEdit) {
          e.preventDefault()
          activeEditor.chain().focus().insertField('page').run()
        }
        return
      }
      if (!mod) return
      if (key === 'f1') {
        e.preventDefault()
        setRibbonCollapsed((c) => !c)
      } else if (key === 's') {
        e.preventDefault()
        if (e.shiftKey) saveAs('docx')
        else save()
      } else if (key === 'o') {
        e.preventDefault()
        openFile()
      } else if (key === 'p') {
        e.preventDefault()
        print()
      } else if (key === 'n' && e.altKey) {
        e.preventDefault()
        newDocument('<p></p>')
      } else if (key === 'f' && !e.shiftKey) {
        e.preventDefault()
        openFind('find')
      } else if (key === 'h' && !e.shiftKey) {
        e.preventDefault()
        openFind('replace')
      } else if (key === 'g' && !e.shiftKey) {
        e.preventDefault()
        openFind('goto')
      } else if (key === 'k' && !e.shiftKey) {
        e.preventDefault()
        setDialog('link')
      } else if (key === 'd' && !e.shiftKey) {
        e.preventDefault()
        setDialog('font')
      } else if ((e.key === '*' || (e.shiftKey && e.code === 'Digit8')) && !e.altKey) {
        e.preventDefault()
        setShowMarks((s) => !s)
      } else if (e.shiftKey && key === 'c' && activeEditor) {
        e.preventDefault()
        setCopiedFormat(activeEditor.state.selection.$from.marks())
      } else if (e.shiftKey && key === 'v' && activeEditor && copiedFormat) {
        e.preventDefault()
        applyMarks(activeEditor, copiedFormat)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, saveAs, openFile, openFind, print, newDocument, newComment, insertNote, closeNote, noteEdit, painter, hfEdit, dialog, activeEditor, copiedFormat])

  if (!editor || !hfEditor || !noteEditor || !activeEditor) return null

  const currentPage = controller.pageOfPos(editor.state.selection.head) + 1

  const app: AppApi = {
    mainEditor: editor,
    title,
    setup,
    setSetup,
    design,
    setDesign,
    settings,
    setSettings,
    headerFooter,
    setHeaderFooter,
    hfEdit,
    editHeaderFooter: (kind, page, nextSetup) => {
      const p = page ?? (hfEdit ? hfEdit.page : currentPage - 1)
      setViewMode('print')
      setHfEdit({ slot: slotFor(kind, p, nextSetup ?? setup), page: p })
    },
    closeHeaderFooter: () => {
      setHfEdit(null)
      setTab('home')
      requestAnimationFrame(() => editor.commands.focus())
    },
    setHeaderFooterSlot: (slot, content) => {
      setHeaderFooter((hf) => ({ ...hf, [slot]: content }))
      if (hfEdit?.slot === slot) {
        hfSlot.current = null
        hfEditor.commands.setContent(content ?? '<p></p>', { emitUpdate: false })
        hfSlot.current = slot
      }
    },
    pages,
    currentPage,
    pageOfPos: (pos) => controller.pageOfPos(pos),
    pageStartPos: (page) => controller.pageStart(page, editor.state.doc.content.size),
    zoom,
    setZoom,
    fitWidth: () => {
      const width = (canvasRef.current?.clientWidth ?? 800) - 64
      setZoom((width / (paperW * PX_PER_IN)) * 100)
    },
    fitPage: () => {
      const width = (canvasRef.current?.clientWidth ?? 800) - 64
      const height = (canvasRef.current?.clientHeight ?? 600) - (showRuler ? 70 : 40)
      setZoom(Math.min(width / (paperW * PX_PER_IN), height / (paperH * PX_PER_IN)) * 100)
    },
    showRuler,
    setShowRuler,
    showMarks,
    setShowMarks,
    showNavigation,
    setShowNavigation,
    showGridlines,
    setShowGridlines,
    focusMode,
    setFocusMode,
    viewMode,
    setViewMode: (mode) => {
      if (mode !== 'print') setHfEdit(null)
      setViewMode(mode)
    },
    spellcheck,
    setSpellcheck,
    language,
    setLanguage,
    fontColor,
    setFontColor,
    highlightColor,
    setHighlightColor,
    painterActive: !!painter,
    togglePainter: () => setPainter((p) => (p ? null : { marks: activeEditor.state.selection.$from.marks(), sticky: false })),
    lockPainter: () => setPainter({ marks: activeEditor.state.selection.$from.marks(), sticky: true }),
    openDialog: (d) => (d === 'find' || d === 'replace' || d === 'goto' ? openFind(d) : setDialog(d)),
    insertImage: async () => {
      const file = await pickFile('image/*')
      if (file) activeEditor.chain().focus().setImage({ src: await readFileAsDataUrl(file), alt: file.name.replace(/\.[^.]+$/, '') }).run()
    },
    print,
    scrollToPos,
    user: { name: settings.userName || t('Author'), initials: settings.userInitials || 'A' },
    comments,
    setComments,
    activeComment,
    setActiveComment,
    newComment,
    showComments,
    setShowComments,
    markupView,
    setMarkupView,
    showMarkup,
    setShowMarkup,
    showReviewingPane,
    setShowReviewingPane,
    tablePen,
    setTablePen,
    borderPainter,
    setBorderPainter,
    trackLock,
    setTrackLock,
    macroRecording: macroRec ? (macroRec.paused ? 'paused' : 'recording') : null,
    startMacro: (name, description) => {
      if (macroRec) macroRec.recorder.stop()
      setMacroRec({ name, description, recorder: startRecording(editor), paused: false })
      editor.commands.focus()
    },
    stopMacro: () => {
      if (!macroRec) return
      const steps = macroRec.recorder.stop()
      setMacroRec(null)
      saveMacros([...loadMacros().filter((m) => m.name !== macroRec.name), { name: macroRec.name, description: macroRec.description, steps, created: new Date().toISOString() }])
    },
    pauseMacro: () => {
      if (!macroRec) return
      macroRec.recorder.pause(!macroRec.paused)
      setMacroRec({ ...macroRec, paused: !macroRec.paused })
    },
    tableTool,
    setTableTool,
    pickRibbonCommand: (tab, group) => {
      setDialog(null)
      setPicking({ tab, group })
    },
    inkTool,
    setInkTool,
    hideInk,
    setHideInk,
    overview,
    setOverview,
    darkPage,
    setDarkPage,
    outline,
    setOutline,
    styleDefs,
    setStyleDefs,
    showStylesPane,
    showSelectionPane,
    setShowSelectionPane,
    showDiagramPane,
    setShowDiagramPane,
    showClipboardPane,
    setShowClipboardPane,
    sources,
    setSources,
    citationStyle,
    setCitationStyle,
    setShowStylesPane,
    editStyle: (id) => setStyleDialog({ id }),
    setAsDefault: (styles = styleDefs) => {
      try {
        localStorage.setItem(DEFAULTS_KEY, JSON.stringify({ design: { fonts: design.fonts, colors: design.colors, paragraphSpacing: design.paragraphSpacing, styleSet: design.styleSet }, styles }))
      } catch {
        // Storage full or blocked: the defaults only apply to this document.
      }
    },
    setInterfaceLanguage: (lang) => {
      // The language change reloads the program: store the document first so it opens again unchanged.
      const doc = snapshotRef.current()
      const stored = doc ? storeAutosave(STORAGE_KEY, JSON.stringify(doc)).catch(() => undefined) : Promise.resolve()
      void stored.then(() => setUiLanguage(lang))
    },
    hideBodyWhileHf,
    setHideBodyWhileHf,
    notes,
    noteSettings,
    setNoteSettings,
    insertNote,
    editNote: setNoteEdit,
    noteEdit,
    drawKind,
    startDraw: (kind) => setDrawKind(kind),
    objectPos,
    setObjectPos,
    openGenerated: (doc, printIt) => {
      loadDocument({ title: doc.title, content: doc.content, setup: doc.setup })
      if (printIt) setTimeout(() => print(), 600)
    },
    restriction,
    restrictionHash,
    setRestriction: (r, hash) => {
      setRestrictionState(r)
      setRestrictionHash(r === 'none' ? null : hash)
    },
  }

  const hasComments = Object.keys(comments).length > 0 && showMarkup.comments && markupView !== 'none' && markupView !== 'original'
  const hasMarkupPane = hasComments && viewMode === 'print'
  const status = !autoSave ? t('Not saved automatically') : saveState === 'failed' ? t('Too large to save in this browser') : saveState === 'saving' ? t('Saving…') : t('Saved')
  const isPrint = viewMode === 'print'
  const titleActions: TitleBarActions = {
    new: () => newDocument('<p></p>'),
    open: openFile,
    print,
    printPreview: () => {
      setBackstageSection('print')
      setBackstage(true)
    },
    spelling: () => setSpellcheck(true),
    readAloud: () => {
      const { from, to, empty } = editor.state.selection
      const text = empty ? editor.state.doc.textBetween(from, editor.state.doc.content.size, '\n', ' ') : editor.state.doc.textBetween(from, to, '\n', ' ')
      speechSynthesis.cancel()
      if (text.trim()) speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(text), { lang: 'en-US' }))
    },
    insertTable: () => setDialog('insertTable'),
    comment: newComment,
    comments: () => setShowComments(!showComments),
    account: () => setDialog('options'),
    share: async () => {
      // Shares a .docx copy through the system's share sheet where the browser offers one.
      const blob = await exportDocument()
      if (!blob) return
      const file = new File([blob], `${safeFilename(title)}.docx`, { type: blob.type })
      const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean }
      if (nav.share && nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], title })
        } catch {
          // The user closed the share sheet.
        }
      } else {
        downloadBlob(blob, file.name)
        alert(t('Your browser cannot share files directly, so a copy was downloaded. Attach it to an e-mail or upload it to share it.'))
      }
    },
  }
  const selectedObject = (() => {
    const sel = activeEditor.state.selection
    if (sel instanceof NodeSelection) return sel.node.type.name
    const $from = sel.$from
    for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === 'textBox') return 'textBox'
    return null
  })()
  const imageSelected = selectedObject === 'image'

  return (
    <div className={cls('app', focusMode && 'is-focus')}>
      {!focusMode && (
        <>
          <TitleBar
            editor={activeEditor}
            title={title}
            setTitle={setTitle}
            autoSave={autoSave}
            setAutoSave={setAutoSave}
            status={status}
            onSave={save}
            onSearch={(q) => openFind('find', q)}
            qat={settings.qat ?? DEFAULT_QAT}
            setQat={(qat) => setSettings({ ...settings, qat })}
            actions={titleActions}
            user={app.user}
            commentsOpen={showComments && Object.keys(comments).length > 0}
          />
          <Ribbon
            editor={activeEditor}
            app={app}
            active={tab}
            setActive={setTab}
            onFile={() => setBackstage(true)}
            collapsed={ribbonCollapsed}
            setCollapsed={setRibbonCollapsed}
            imageSelected={imageSelected}
            selectedObject={selectedObject}
          />
        </>
      )}

      <div className="workspace">
        {showReviewingPane && !focusMode && (
          <Suspense fallback={null}>
            <ReviewingPane
              editor={editor}
              comments={comments}
              onClose={() => setShowReviewingPane(false)}
              onNavigate={scrollToPos}
              onActivateComment={(id) => {
                setShowComments(true)
                setActiveComment(id)
              }}
            />
          </Suspense>
        )}
        {showNavigation && !focusMode && <Suspense fallback={null}><NavigationPane editor={editor} controller={controller} pages={pages} onClose={() => setShowNavigation(false)} onNavigate={scrollToPos} onSearch={(q) => openFind('find', q)} /></Suspense>}
        <div className={cls('canvas', !isPrint && 'is-web')} ref={canvasRef}>
          <div className={cls('page-wrap', !isPrint && 'is-web', showGridlines && 'show-gridlines')}>
            {showRuler && isPrint && <Ruler editor={activeEditor} setup={setup} setSetup={setSetup} zoom={zoom} unit={settings.unit} />}
            <PageView
              editor={editor}
              hfEditor={hfEditor}
              setup={setup}
              design={design}
              headerFooter={headerFooter}
              title={title}
              zoom={zoom}
              pages={pages}
              layoutVersion={layoutVersion}
              viewMode={viewMode === 'read' ? 'print' : viewMode}
              showMarks={showMarks}
              painting={!!painter}
              widowControl={settings.widowControl}
              hfEdit={hfEdit}
              onEditHeaderFooter={(edit) => (edit ? setHfEdit(edit) : app.closeHeaderFooter())}
              controller={controller}
              stylesCss={stylesCss(styleDefs, design.styleSet)}
              markupClass={cls(`markup-${markupView}`, darkPage && 'dark-page', viewMode === 'outline' && `is-outline outline-level-${outline.level}`, viewMode === 'outline' && outline.firstLineOnly && 'outline-first-line', viewMode === 'outline' && !outline.showFormatting && 'outline-plain', viewMode === 'draft' && 'is-draft', hfEdit && hideBodyWhileHf && 'hide-body', !showMarkup.insDel && 'hide-revisions', hideInk && 'hide-ink', (!showMarkup.comments || markupView === 'none' || markupView === 'original') && 'hide-comments')}
              hasMarkupPane={hasMarkupPane}
              pagesRef={setPagesEl}
              notes={notes}
              noteSettings={noteSettings}
              noteEdit={noteEdit}
              noteEditor={noteEditor}
              onEditNote={(id) => (id ? setNoteEdit(id) : setNoteEdit(null))}
              drawKind={drawKind}
              onDraw={(rect) => {
                const kind = drawKind
                setDrawKind(null)
                if (rect && kind && pagesEl) placeDrawing(editor, pagesEl, paperW * PX_PER_IN, kind, rect)
              }}
            >
              {inkTool && isPrint && !hfEdit && <InkOverlay editor={editor} tool={inkTool} pageWidth={paperW * PX_PER_IN} />}
              {showRuler && isPrint && !hfEdit && <VerticalRuler setup={setup} setSetup={setSetup} page={Math.min(pages - 1, controller.pageOfPos(editor.state.selection.head))} stride={paperH * PX_PER_IN + PAGE_GAP} unit={settings.unit} />}
              {hasMarkupPane && (
                <Suspense fallback={null}>
                  <CommentsPane
                    editor={editor}
                    comments={comments}
                    setComments={setComments}
                    active={activeComment}
                    setActive={setActiveComment}
                    editing={editingComment}
                    setEditing={setEditingComment}
                    user={app.user}
                    left={paperW * PX_PER_IN + 24}
                    pageWidth={paperW * PX_PER_IN}
                    showCards={showComments}
                    onShowCards={() => setShowComments(true)}
                    pagesEl={pagesEl}
                  />
                </Suspense>
              )}
            </PageView>
          </div>
        </div>
        {showSelectionPane && !focusMode && <Suspense fallback={null}><SelectionPane editor={editor} onClose={() => setShowSelectionPane(false)} /></Suspense>}
        {showClipboardPane && !focusMode && <Suspense fallback={null}><ClipboardPane editor={editor} onClose={() => setShowClipboardPane(false)} /></Suspense>}
        {showDiagramPane && selectedObject === 'diagram' && !focusMode && <Suspense fallback={null}><DiagramTextPane editor={editor} onClose={() => setShowDiagramPane(false)} /></Suspense>}
        {showStylesPane && !focusMode && (
          <Suspense fallback={null}><StylesPane editor={activeEditor} defs={styleDefs} setDefs={setStyleDefs} onClose={() => setShowStylesPane(false)} onModify={(id) => setStyleDialog({ id })} onManage={() => setDialog('manageStyles')} /></Suspense>
        )}
        {picking && (
          <div className="macro-recording" role="status" data-macro-control="">
            {t('Click a command on the ribbon to add it to the group (Esc to cancel).')}
            <button type="button" className="btn btn-small" onClick={() => (setPicking(null), setDialog('options'))}>
              {t('Cancel')}
            </button>
          </div>
        )}
        {macroRec && (
          <div className="macro-recording" role="status" data-macro-control="">
            <span className="macro-dot" aria-hidden="true" />
            {macroRec.paused ? t('Macro recording paused: {name}', { name: macroRec.name }) : t('Recording macro: {name}', { name: macroRec.name })}
            <button type="button" className="btn btn-small" onMouseDown={(e) => e.preventDefault()} onClick={() => app.pauseMacro()}>
              {macroRec.paused ? t('Resume Recorder') : t('Pause Recording')}
            </button>
            <button type="button" className="btn btn-small" onMouseDown={(e) => e.preventDefault()} onClick={() => app.stopMacro()}>
              {t('Stop Recording')}
            </button>
          </div>
        )}
        {(dialog === 'find' || dialog === 'replace') && (
          <FindPanel key={find.seq} editor={editor} initialQuery={find.query} withReplace={dialog === 'replace'} onClose={() => setDialog(null)} />
        )}
      </div>

      {!focusMode ? (
        <StatusBar app={app} editor={editor} onWordCount={() => setDialog('wordCount')} onGoTo={() => openFind('goto')} />
      ) : (
        <button type="button" className="focus-exit" onClick={() => setFocusMode(false)}>
          {t('Exit Focus')}</button>
      )}

      {viewMode === 'read' && <Suspense fallback={null}><ReadMode editor={editor} title={title} onExit={() => setViewMode('print')} onFind={() => openFind('find')} /></Suspense>}
      {overview && (
        <Suspense fallback={null}>
          <PageOverview
            pagesEl={pagesEl}
            pages={pages}
            stride={paperH * PX_PER_IN + PAGE_GAP}
            width={paperW * PX_PER_IN}
            height={paperH * PX_PER_IN}
            layout={overview}
            onPick={(k) => {
              setOverview(null)
              scrollToPos(app.pageStartPos(k))
            }}
            onClose={() => setOverview(null)}
          />
        </Suspense>
      )}
      <ContextMenu editor={activeEditor} app={app} />
      <MiniToolbar editor={activeEditor} app={app} />
      <PasteOptionsButton editor={editor} onSetDefault={() => setDialog('options')} />

      {backstage && (
        <Suspense fallback={null}>
          <Backstage
            title={title}
            setTitle={setTitle}
            editor={editor}
            app={app}
            onClose={() => setBackstage(false)}
            onNew={newDocument}
            onOpen={openFile}
            onSave={saveAs}
            onPrint={print}
            docId={docId}
            onOpenRecent={openRecent}
            onRestoreVersion={(data) => {
              const doc = data as Stored
              const current = snapshotRef.current()
              if (current) void addVersion(docId, current, editor.storage.characterCount.words())
              loadDocument({ title: doc.title, content: doc.content, setup: doc.setup, design: doc.design, headerFooter: doc.headerFooter, comments: doc.comments, trackChanges: doc.trackChanges, notes: doc.notes, noteSettings: doc.noteSettings, styles: doc.styles, sources: doc.sources, citationStyle: doc.citationStyle, trackLock: doc.trackLock }, docId)
            }}
            initialSection={backstageSection}
            onOptions={() => {
              setBackstage(false)
              setDialog('options')
            }}
          />
        </Suspense>
      )}
      {styleDialog && (
        <Suspense fallback={null}>
          <StyleDialog
            editor={activeEditor}
            defs={styleDefs}
            setDefs={setStyleDefs}
            styleId={styleDialog.id}
            onClose={() => setStyleDialog(null)}
            onSetDefault={(styles) => {
              try {
                localStorage.setItem(DEFAULTS_KEY, JSON.stringify({ ...loadDefaults(), styles }))
              } catch {
                // Storage full or blocked.
              }
            }}
          />
        </Suspense>
      )}
      {dialog && <Suspense fallback={null}><Dialogs dialog={dialog} setDialog={setDialog} editor={activeEditor} app={app} findQuery={find.query} /></Suspense>}
    </div>
  )
}
