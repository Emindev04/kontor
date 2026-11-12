import { createContext, useContext, useSyncExternalStore } from 'react'
import type { Doc } from '../commands/doc'

export type DialogKind =
  | 'formatCells' | 'insertCells' | 'deleteCells' | 'rowHeight' | 'colWidth' | 'defaultWidth' | 'pasteSpecial' | 'find' | 'replace'
  | 'goto' | 'gotoSpecial' | 'insertFunction' | 'nameManager' | 'defineName' | 'createNames' | 'sort' | 'series' | 'moveCopy'
  | 'unhideSheet' | 'zoom' | 'shortcuts' | 'about' | 'removeDuplicates' | 'stats' | 'pageSetup' | 'symbol' | 'message' | 'confirm' | 'hyperlink' | 'cellStyles'
  | 'insertChart' | 'changeChartType' | 'selectData' | 'moveChart' | 'createTable' | 'resizeTable' | 'createPivot' | 'pivotSource' | 'movePivot'
  | 'cfQuick' | 'cfRule' | 'cfManage' | 'validation' | 'customFilter' | 'top10' | 'protectSheet' | 'unprotectSheet' | 'protectWorkbook' | 'allowEditRanges'
  | 'groupDialog' | 'subtotal' | 'dataTable' | 'scenarios' | 'advancedFilter' | 'evaluateFormula' | 'headerFooter' | 'sparklines' | 'goalSeek' | 'textToColumns'
  | 'altText' | 'consolidate' | 'tableTotalCustom' | 'prompt' | 'insertIcon' | 'customViews' | 'pivotGroup' | 'calcField' | 'insertSlicer'
  | 'recommendedPivots' | 'forecast' | 'getData' | 'accessibility' | 'spelling' | 'errorChecking' | 'showChanges' | 'functionArgs' | 'newTableStyle'

export type DialogSpec = {
  kind: DialogKind
  tab?: string
  title?: string
  message?: string
  onYes?: () => void
  fn?: string
  /** Extra data for the dialog (rule being edited, filter column …). */
  data?: unknown
  /** For prompt dialogs: called with the entered text. */
  onText?: (text: string) => void
}

export type PaneKind = 'format' | 'pivot' | 'watch' | 'selection' | 'comments' | 'clipboard'

export type ViewMode = 'normal' | 'pageLayout' | 'pageBreak'

export interface AppApi {
  doc: Doc
  dialog: (spec: DialogSpec) => void
  alert: (message: string, title?: string) => void
  confirm: (message: string, onYes: () => void, title?: string) => void
  save: () => void
  saveAs: (format: 'xlsx' | 'csv' | 'ods' | 'txt' | 'html') => void
  open: () => void
  /** Reopens a workbook from the Recent list (a copy kept in this browser). */
  openRecent: (id: string, name: string) => void
  newBook: () => void
  print: () => void
  copy: (cut: boolean) => void
  paste: (special?: boolean) => void
  focusGrid: () => void
  painter: { active: boolean; sticky: boolean }
  startPainter: (sticky: boolean) => void
  showFormulaBar: boolean
  setShowFormulaBar: (on: boolean) => void
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
  insertFunction: (name: string) => void
  autoSum: (fn: string) => void
  openFile: () => void
  setFullScreen: (on: boolean) => void
  pane: PaneKind | null
  setPane: (p: PaneKind | null) => void
  /** Watched cells of the Watch Window (not saved with the workbook). */
  watches: { sheetId: number; r: number; c: number }[]
  setWatches: (w: { sheetId: number; r: number; c: number }[]) => void
  insertPicture: () => void
  setTab: (tab: string) => void
  split: { r: number; c: number } | null
  setSplit: (s: { r: number; c: number } | null) => void
}

export const AppContext = createContext<AppApi>(null as unknown as AppApi)

export const useApp = () => useContext(AppContext)

export function useDocVersion(doc: Doc) {
  return useSyncExternalStore(doc.subscribe, doc.getVersion)
}
