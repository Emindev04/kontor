import type { Editor } from '@tiptap/react'
import type { HeaderFooter, HeaderFooterSlot, PageDesign, PageSetup } from '../../pageSetup'
import type { Settings } from '../../units'
import type { HeaderFooterEdit } from '../PageView'
import type { Comments } from '../../editor/Review'
import type { NoteKind, NoteSettings, Notes } from '../../editor/Notes'
import type { StyleDefs } from '../../editor/styleDefs'
import type { BorderPen } from '../../editor/TableExtras'

export type DialogKind =
  | 'link'
  | 'find'
  | 'replace'
  | 'goto'
  | 'font'
  | 'paragraph'
  | 'pageSetup'
  | 'wordCount'
  | 'watermark'
  | 'options'
  | 'help'
  | 'about'
  | 'dateTime'
  | 'symbol'
  | 'insertTable'
  | 'pageNumberFormat'
  | 'drawing'
  | 'accessibility'
  | 'caption'
  | 'imageUrl'
  | 'altText'
  | 'thesaurus'
  | 'trackOptions'
  | 'compare'
  | 'combine'
  | 'restrict'
  | 'notes'
  | 'columns'
  | 'layoutOptions'
  | 'crop'
  | 'chartData'
  | 'insertChart'
  | 'insertDiagram'
  | 'equation'
  | 'signature'
  | 'icons'
  | 'bookmark'
  | 'crossRef'
  | 'tableProperties'
  | 'bordersShading'
  | 'formula'
  | 'textToTable'
  | 'cellMargins'
  | 'tabs'
  | 'envelopes'
  | 'labels'
  | 'autoCorrect'
  | 'pasteSpecial'
  | 'newSource'
  | 'manageSources'
  | 'markEntry'
  | 'whatsNew'
  | 'newList'
  | 'hyphenation'
  | 'editRecipients'
  | 'matchFields'
  | 'emailMerge'
  | 'training'
  | 'feedback'
  | 'defineBullet'
  | 'defineMultilevel'
  | 'sortText'
  | 'tocCustom'
  | 'tableOfFigures'
  | 'markCitation'
  | 'tableOfAuthorities'
  | 'indexOptions'
  | 'styleInspector'
  | 'manageStyles'
  | 'macros'
  | 'recordMacro'
  | 'lockTracking'
  | 'textEffects'
  | 'compressPictures'
  | 'mergeRule'

export type ViewMode = 'print' | 'web' | 'read' | 'outline' | 'draft'
export type OutlineOptions = { level: number; firstLineOnly: boolean; showFormatting: boolean }
export type MarkupView = 'simple' | 'all' | 'none' | 'original'
export type ShowMarkup = { comments: boolean; insDel: boolean; highlight: boolean }
export type Restriction = 'none' | 'readOnly' | 'comments' | 'tracked'

/** Application state and actions the ribbon tabs need. */
export type AppApi = {
  /** The body editor, even while a header or footer is being edited. */
  mainEditor: Editor
  title: string
  setup: PageSetup
  setSetup: (setup: PageSetup) => void
  design: PageDesign
  setDesign: (design: PageDesign) => void
  settings: Settings
  setSettings: (settings: Settings) => void
  headerFooter: HeaderFooter
  setHeaderFooter: (hf: HeaderFooter) => void
  hfEdit: HeaderFooterEdit | null
  editHeaderFooter: (kind: 'header' | 'footer', page?: number, setup?: PageSetup) => void
  closeHeaderFooter: () => void
  setHeaderFooterSlot: (slot: HeaderFooterSlot, content: HeaderFooter[HeaderFooterSlot]) => void
  pages: number
  currentPage: number
  /** 0-based page index of a body position. */
  pageOfPos: (pos: number) => number
  /** First document position on a page (0-based). */
  pageStartPos: (page: number) => number
  zoom: number
  setZoom: (zoom: number) => void
  fitWidth: () => void
  fitPage: () => void
  showRuler: boolean
  setShowRuler: (on: boolean) => void
  showMarks: boolean
  setShowMarks: (on: boolean) => void
  showNavigation: boolean
  setShowNavigation: (on: boolean) => void
  showGridlines: boolean
  setShowGridlines: (on: boolean) => void
  focusMode: boolean
  setFocusMode: (on: boolean) => void
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  spellcheck: boolean
  setSpellcheck: (on: boolean) => void
  language: string
  setLanguage: (lang: string) => void
  fontColor: string
  setFontColor: (color: string) => void
  highlightColor: string
  setHighlightColor: (color: string) => void
  painterActive: boolean
  togglePainter: () => void
  /** Double-click on Format Painter: stays on until Esc. */
  lockPainter: () => void
  openDialog: (dialog: DialogKind) => void
  insertImage: () => void
  print: () => void
  scrollToPos: (pos: number) => void
  /** Review: comment threads, markup display and protection. */
  user: { name: string; initials: string }
  comments: Comments
  setComments: (update: (c: Comments) => Comments) => void
  activeComment: string | null
  setActiveComment: (id: string | null) => void
  newComment: () => void
  showComments: boolean
  setShowComments: (on: boolean) => void
  markupView: MarkupView
  setMarkupView: (view: MarkupView) => void
  showMarkup: ShowMarkup
  setShowMarkup: (show: ShowMarkup) => void
  showReviewingPane: boolean
  setShowReviewingPane: (on: boolean) => void
  notes: Notes
  noteSettings: NoteSettings
  setNoteSettings: (s: NoteSettings) => void
  insertNote: (kind: NoteKind) => void
  editNote: (id: string | null) => void
  noteEdit: string | null
  styleDefs: StyleDefs
  setStyleDefs: (update: (d: StyleDefs) => StyleDefs) => void
  showStylesPane: boolean
  showSelectionPane: boolean
  setShowSelectionPane: (show: boolean) => void
  showDiagramPane: boolean
  showClipboardPane: boolean
  setShowClipboardPane: (show: boolean) => void
  setShowDiagramPane: (show: boolean) => void
  sources: import('../../editor/Citations').Sources
  setSources: (sources: import('../../editor/Citations').Sources) => void
  citationStyle: import('../../editor/Citations').CitationStyle
  setCitationStyle: (style: import('../../editor/Citations').CitationStyle) => void
  setShowStylesPane: (on: boolean) => void
  /** Opens Create/Modify Style (null creates a new style). */
  editStyle: (id: string | null) => void
  setAsDefault: (styles?: StyleDefs) => void
  /** File › Options › Language: keeps the document and restarts the program in the chosen interface language. */
  setInterfaceLanguage: (language: import('../../i18n').Language) => void
  overview: 'multiple' | 'sideBySide' | null
  setOverview: (o: 'multiple' | 'sideBySide' | null) => void
  darkPage: boolean
  setDarkPage: (on: boolean) => void
  outline: OutlineOptions
  setOutline: (o: OutlineOptions) => void
  tablePen: BorderPen
  setTablePen: (pen: BorderPen) => void
  borderPainter: boolean
  setBorderPainter: (on: boolean) => void
  /** Lock Tracking: password hash ("" without password), null when not locked. */
  trackLock: string | null
  setTrackLock: (hash: string | null) => void
  /** View › Macros: recording state and recorder controls. */
  macroRecording: 'recording' | 'paused' | null
  startMacro: (name: string, description: string) => void
  stopMacro: () => void
  pauseMacro: () => void
  /** Options › Customize Ribbon › Add Command: waits for a ribbon command for that custom group. */
  pickRibbonCommand: (tab: string, group: string) => void
  /** Draw tab: the pen, highlighter or eraser used on the page (null = select text). */
  inkTool: import('../InkOverlay').InkTool | null
  setInkTool: (tool: import('../InkOverlay').InkTool | null) => void
  hideInk: boolean
  setHideInk: (hide: boolean) => void
  /** Table › Draw Table / Eraser mode. */
  tableTool: import('../../editor/drawTable').TableTool | null
  setTableTool: (tool: import('../../editor/drawTable').TableTool | null) => void
  hideBodyWhileHf: boolean
  setHideBodyWhileHf: (on: boolean) => void
  /** Draw mode for shapes ("rectangle", "arrowLine" …) and text boxes ("textBox"). */
  drawKind: string | null
  startDraw: (kind: string | null) => void
  /** Position of the object (chart, equation, signature line) a dialog edits. */
  objectPos: number | null
  setObjectPos: (pos: number | null) => void
  restriction: Restriction
  restrictionHash: string | null
  setRestriction: (r: Restriction, passwordHash: string | null) => void
  /** Opens a generated document (envelopes, labels) in place of the current one. */
  openGenerated: (doc: { title: string; content: import('@tiptap/core').JSONContent; setup: Partial<PageSetup> }, print: boolean) => void
}

export type TabProps = { editor: Editor; app: AppApi }
