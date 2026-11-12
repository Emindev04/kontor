import { Suspense, lazy } from 'react'
import type { DialogSpec } from '../appContext'

const FunctionArgsDialog = lazy(() => import('./FunctionArgsDialog').then((m) => ({ default: m.FunctionArgsDialog })))
const MacrosDialog = lazy(() => import('./MacroDialog').then((m) => ({ default: m.MacrosDialog })))
const NewTableStyleDialog = lazy(() => import('./TableStyleDialog').then((m) => ({ default: m.NewTableStyleDialog })))
import { FormatCellsDialog } from './FormatCellsDialog'
import {
  AboutDialog, CreateNamesDialog, DefineNameDialog, FindReplaceDialog, GoToDialog, GoToSpecialDialog, GoalSeekDialog, InsertDeleteCellsDialog, InsertFunctionDialog,
  MessageDialog, MoveCopyDialog, NameManagerDialog, PageSetupDialog, PasteSpecialDialog, RemoveDuplicatesDialog, SeriesDialog, ShortcutsDialog, SizeDialog, SortDialog, StatsDialog,
  SymbolDialog, TextToColumnsDialog, UnhideSheetDialog, ZoomDialog,
} from './Dialogs'
import {
  CFManageDialog, CFQuickDialog, CFRuleDialog, CreatePivotDialog, CreateTableDialog, CustomFilterDialog, InsertChartDialog, MoveChartDialog, PivotSourceDialog,
  ResizeTableDialog, SelectDataDialog, Top10Dialog, ValidationDialog,
} from './ChartTableDialogs'
import {
  AdvancedFilterDialog, AllowEditRangesDialog, AltTextDialog, DataTableDialog, EvaluateFormulaDialog, GroupDialog, HeaderFooterDialog, InsertIconDialog, NoteDialog,
  PasswordDialog, PromptDialog, ProtectSheetDialog, ScenarioDialog, SparklinesDialog, SubtotalDialog,
} from './MoreDialogs'
import { CalcFieldDialog, InsertSlicerDialog, PivotGroupDialog } from './PivotDialogs'
import { AccessibilityDialog, ConsolidateDialog, CustomViewsDialog, ErrorCheckingDialog, ForecastDialog, GetDataDialog, HyperlinkDialog, RecommendedPivotsDialog, ShowChangesDialog, SpellingDialog } from './ToolDialogs'

export function DialogHost({ spec, onClose, onInsertFunction }: { spec: DialogSpec | null; onClose: () => void; onInsertFunction: (name: string) => void }) {
  if (!spec) return null
  switch (spec.kind) {
    case 'formatCells': return <FormatCellsDialog initialTab={spec.tab} onClose={onClose} />
    case 'insertCells': return <InsertDeleteCellsDialog insert onClose={onClose} />
    case 'deleteCells': return <InsertDeleteCellsDialog insert={false} onClose={onClose} />
    case 'rowHeight':
    case 'colWidth':
    case 'defaultWidth': return <SizeDialog kind={spec.kind} onClose={onClose} />
    case 'pasteSpecial': return <PasteSpecialDialog onClose={onClose} />
    case 'find': return <FindReplaceDialog replace={false} initial={spec.message} onClose={onClose} />
    case 'replace': return <FindReplaceDialog replace onClose={onClose} />
    case 'goto': return <GoToDialog onClose={onClose} />
    case 'gotoSpecial': return <GoToSpecialDialog onClose={onClose} />
    case 'insertFunction': return <InsertFunctionDialog onClose={onClose} onInsert={onInsertFunction} />
    case 'nameManager': return <NameManagerDialog onClose={onClose} />
    case 'defineName': return <DefineNameDialog onClose={onClose} />
    case 'createNames': return <CreateNamesDialog onClose={onClose} />
    case 'sort': return <SortDialog onClose={onClose} />
    case 'series': return <SeriesDialog onClose={onClose} />
    case 'moveCopy': return <MoveCopyDialog onClose={onClose} />
    case 'unhideSheet': return <UnhideSheetDialog onClose={onClose} />
    case 'zoom': return <ZoomDialog onClose={onClose} />
    case 'shortcuts': return <ShortcutsDialog onClose={onClose} />
    case 'about': return <AboutDialog onClose={onClose} />
    case 'removeDuplicates': return <RemoveDuplicatesDialog onClose={onClose} />
    case 'stats': return <StatsDialog onClose={onClose} />
    case 'pageSetup': return <PageSetupDialog initialTab={spec.tab} onClose={onClose} />
    case 'symbol': return <SymbolDialog onClose={onClose} />
    case 'hyperlink': return <HyperlinkDialog onClose={onClose} />
    case 'insertChart': return <InsertChartDialog data={spec.data} onClose={onClose} />
    case 'changeChartType': return <InsertChartDialog data={spec.data} onClose={onClose} />
    case 'selectData': return <SelectDataDialog data={spec.data} onClose={onClose} />
    case 'moveChart': return <MoveChartDialog data={spec.data} onClose={onClose} />
    case 'createTable': return <CreateTableDialog data={spec.data} onClose={onClose} />
    case 'resizeTable': return <ResizeTableDialog data={spec.data} onClose={onClose} />
    case 'createPivot': return <CreatePivotDialog data={spec.data} onClose={onClose} />
    case 'pivotSource': return <PivotSourceDialog data={spec.data} onClose={onClose} />
    case 'movePivot': return <PivotSourceDialog data={spec.data} move onClose={onClose} />
    case 'pivotGroup': return <PivotGroupDialog data={spec.data} onClose={onClose} />
    case 'calcField': return <CalcFieldDialog data={spec.data} onClose={onClose} />
    case 'insertSlicer': return <InsertSlicerDialog data={spec.data} onClose={onClose} />
    case 'customFilter': return <CustomFilterDialog data={spec.data} onClose={onClose} />
    case 'top10': return <Top10Dialog data={spec.data} onClose={onClose} />
    case 'cfQuick': return <CFQuickDialog data={spec.data} onClose={onClose} />
    case 'cfRule': return <CFRuleDialog data={spec.data} onClose={onClose} />
    case 'cfManage': return <CFManageDialog onClose={onClose} />
    case 'validation': return <ValidationDialog onClose={onClose} />
    case 'protectSheet': return <ProtectSheetDialog onClose={onClose} />
    case 'unprotectSheet': return <PasswordDialog kind="sheet" onClose={onClose} />
    case 'protectWorkbook': return <PasswordDialog kind={spec.data === 'unprotect' ? 'workbook' : 'protectWorkbook'} onClose={onClose} />
    case 'allowEditRanges': return <AllowEditRangesDialog onClose={onClose} />
    case 'groupDialog': return <GroupDialog data={spec.data} onClose={onClose} />
    case 'subtotal': return <SubtotalDialog onClose={onClose} />
    case 'dataTable': return <DataTableDialog onClose={onClose} />
    case 'scenarios': return <ScenarioDialog onClose={onClose} />
    case 'advancedFilter': return <AdvancedFilterDialog onClose={onClose} />
    case 'evaluateFormula': return <EvaluateFormulaDialog onClose={onClose} />
    case 'headerFooter': return <HeaderFooterDialog onClose={onClose} />
    case 'sparklines': return <SparklinesDialog data={spec.data} onClose={onClose} />
    case 'goalSeek': return <GoalSeekDialog onClose={onClose} />
    case 'textToColumns': return <TextToColumnsDialog onClose={onClose} />
    case 'altText': return <AltTextDialog data={spec.data} onClose={onClose} />
    case 'insertIcon': return <InsertIconDialog onClose={onClose} />
    case 'consolidate': return <ConsolidateDialog onClose={onClose} />
    case 'customViews': return <CustomViewsDialog onClose={onClose} />
    case 'recommendedPivots': return <RecommendedPivotsDialog onClose={onClose} />
    case 'forecast': return <ForecastDialog onClose={onClose} />
    case 'getData': return <GetDataDialog data={spec.data} onClose={onClose} />
    case 'accessibility': return <AccessibilityDialog onClose={onClose} />
    case 'spelling': return <SpellingDialog onClose={onClose} />
    case 'errorChecking': return <ErrorCheckingDialog onClose={onClose} />
    case 'showChanges': return <ShowChangesDialog onClose={onClose} />
    case 'macros': return <Suspense fallback={null}><MacrosDialog onClose={onClose} /></Suspense>
    case 'newTableStyle': return <Suspense fallback={null}><NewTableStyleDialog onClose={onClose} /></Suspense>
    case 'functionArgs': return <Suspense fallback={null}><FunctionArgsDialog fn={spec.fn ?? 'SUM'} onClose={onClose} /></Suspense>
    case 'prompt':
      if (spec.title === 'note') return <NoteDialog onClose={onClose} />
      return <PromptDialog title={spec.title} message={spec.message} onText={spec.onText} onClose={onClose} />
    case 'confirm': return <MessageDialog title={spec.title} message={spec.message ?? ''} onYes={spec.onYes} onClose={onClose} />
    case 'message':
      if (spec.message === 'goalseek') return <GoalSeekDialog onClose={onClose} />
      if (spec.message === 'textToColumns') return <TextToColumnsDialog onClose={onClose} />
      return <MessageDialog title={spec.title} message={spec.message ?? ''} onClose={onClose} />
    default: return null
  }
}
