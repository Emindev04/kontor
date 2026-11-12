// Insert, Data, Review and View ribbon tabs.
import {
  AreaChart, ArrowDownAZ, ArrowDownWideNarrow, ArrowUpZA, BarChart3, BarChartHorizontal, ChartColumn, ChartLine, ChartPie, ChartScatter, CircleDot, Columns2,
  CopyMinus, Eraser, FileInput, FileSpreadsheet, Filter, FilterX, Group, Image as ImageIcon, LayoutPanelTop, Link, ListChecks, Lock, LockOpen, Maximize,
  MessageSquare, MessageSquarePlus, MessageSquareX, Minus, NotebookPen, Omega, Plus, RefreshCw, Rows3, ScanSearch, Shapes, ShieldCheck, Snowflake, Sparkles,
  SquareDashed, StickyNote, StretchHorizontal, Table2, Target, TableProperties, TextCursorInput, TrendingUp, Type, Ungroup, ZoomIn, ChevronLeft, ChevronRight,
  Smile, PanelRight, Sigma, Zap, CircleOff, FileStack, SquareSplitHorizontal, AppWindow, Hash, Combine, LineChart, FileJson, Globe, FileCode, Eye, CalendarRange, Accessibility, PenOff, SpellCheck, History,
} from 'lucide-react'
import { MAX_COLS, MAX_ROWS, isFullCols, isFullRows } from '../../model/address'
import { Clapperboard, EyeOff } from 'lucide-react'
import { t, tx } from '../../i18n'
import { stopRecording } from '../../commands/macros'
import type { ChartGrouping, ChartType } from '../../model/extras'
import { quickSort } from '../../commands/sort'
import { freezePanes } from '../../commands/ops'
import { clearFilters, hasActiveFilters, reapplyFilters, toggleAutoFilter } from '../../commands/filter'
import { refreshAllPivots } from '../../commands/pivot'
import { clearOutline, group, ungroup, toggleGroup, groupRun, levelAt } from '../../commands/outline'
import { deleteThread, noteAt, setNote, showAllNotes, stepAnnotation, threadAt, toggleNote, addComment } from '../../commands/review'
import { flashFill } from '../../commands/flashFill'
import { newShape, pivotAt, tableAt } from '../../commands/objects'
import { chartTypeIcon } from '../../charts/renderChart'
import { insertChart, circleInvalid } from '../dialogs/ChartTableDialogs'
import { ShapeGallery } from './ContextTabs'
import { CheckItem, MenuButton, PopoverButton, RibbonButton, RibbonGroup, SplitButton, keepFocus, type MenuItem } from '../ui'
import { useApp, useDocVersion } from '../appContext'
import { absRef } from '../../charts/chartData'
import { currentRegion } from '../../commands/sort'
import { parseDataFile } from '../../commands/tools'

/** Picks a data file and shows the tables found in it (Get Data). */
function getDataFrom(app: ReturnType<typeof useApp>, accept: string) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      app.dialog({ kind: 'getData', data: parseDataFile(file.name, await file.text()) })
    } catch {
      app.alert(t("We couldn't read {file}.", { file: file.name }), t('Get Data'))
    }
  }
  input.click()
}

function source(app: ReturnType<typeof useApp>) {
  const doc = app.doc
  let rg = doc.activeRange
  if (rg.r1 === rg.r2 && rg.c1 === rg.c2) rg = currentRegion(doc, doc.sel.active)
  return absRef(doc.sheet, doc.boundToUsed(rg))
}

function ChartMenu({ icon, label, items }: { icon: typeof ChartColumn; label: string; items: { type: ChartType; grouping: ChartGrouping; label: string }[] }) {
  const app = useApp()
  return (
    <PopoverButton icon={icon} label={label} showLabel>
      {(close) => (
        <div className="chart-menu">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              className="chart-menu-item"
              title={it.label}
              onMouseDown={keepFocus}
              onClick={() => {
                close()
                if (!app.doc.sheet.hasValue(app.doc.sel.active.r, app.doc.sel.active.c) && app.doc.activeRange.r1 === app.doc.activeRange.r2 && app.doc.activeRange.c1 === app.doc.activeRange.c2) {
                  app.alert(t('Select a range with data first, then insert the chart.'))
                  return
                }
                insertChart(app, it.type, it.grouping, source(app))
              }}
            >
              <span dangerouslySetInnerHTML={{ __html: chartTypeIcon(it.type, it.grouping) }} />
              <span>{it.label}</span>
            </button>
          ))}
          <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => { close(); app.dialog({ kind: 'insertChart', data: source(app) }) }}>{t('More Charts…')}</button>
        </div>
      )}
    </PopoverButton>
  )
}

export function InsertTab() {
  const app = useApp()
  const doc = app.doc
  useDocVersion(doc)
  const startShape = (shape: string, textBox = false) => {
    doc.drawShape = { shape, textBox }
    doc.emit()
    app.focusGrid()
  }
  return (
    <>
      <RibbonGroup label={t('Tables')} icon={Table2}>
        <RibbonButton icon={FileStack} label={t('PivotTable')} large onClick={() => app.dialog({ kind: 'createPivot', data: source(app) })} />
        <RibbonButton icon={Sparkles} label={t('Recommended PivotTables')} large onClick={() => app.dialog({ kind: 'recommendedPivots' })} />
        <RibbonButton icon={Table2} label={t('Table')} large title={t('Table (Ctrl+T)')} onClick={() => app.dialog({ kind: 'createTable' })} />
      </RibbonGroup>
      <RibbonGroup label={t('Illustrations')} icon={ImageIcon}>
        <RibbonButton icon={ImageIcon} label={t('Pictures')} large onClick={app.insertPicture} />
        <PopoverButton icon={Shapes} label={t('Shapes')} large className="shape-menu">
          {(close) => (
            <ShapeGallery
              onPick={(id) => {
                close()
                startShape(id)
              }}
            />
          )}
        </PopoverButton>
        <RibbonButton icon={Smile} label={t('Icons')} large onClick={() => app.dialog({ kind: 'insertIcon' })} />
      </RibbonGroup>
      <RibbonGroup label={t('Charts')} icon={BarChart3}>
        <RibbonButton icon={BarChart3} label={t('Recommended Charts')} large onClick={() => app.dialog({ kind: 'insertChart', data: source(app) })} />
        <div className="col">
          <ChartMenu icon={ChartColumn} label={t('Column')} items={[
            { type: 'column', grouping: 'clustered', label: t('Clustered Column') }, { type: 'column', grouping: 'stacked', label: t('Stacked Column') }, { type: 'column', grouping: 'percent', label: t('100% Stacked Column') },
            { type: 'bar', grouping: 'clustered', label: t('Clustered Bar') }, { type: 'bar', grouping: 'stacked', label: t('Stacked Bar') }, { type: 'bar', grouping: 'percent', label: t('100% Stacked Bar') },
          ]} />
          <ChartMenu icon={ChartLine} label={t('Line')} items={[
            { type: 'line', grouping: 'clustered', label: t('Line') }, { type: 'line', grouping: 'stacked', label: t('Stacked Line') }, { type: 'line', grouping: 'percent', label: t('100% Stacked Line') },
            { type: 'area', grouping: 'clustered', label: t('Area') }, { type: 'area', grouping: 'stacked', label: t('Stacked Area') }, { type: 'area', grouping: 'percent', label: t('100% Stacked Area') },
          ]} />
          <ChartMenu icon={ChartPie} label={t('Pie')} items={[{ type: 'pie', grouping: 'clustered', label: t('Pie') }, { type: 'doughnut', grouping: 'clustered', label: t('Doughnut') }]} />
        </div>
        <div className="col">
          <ChartMenu icon={BarChartHorizontal} label={t('Bar')} items={[
            { type: 'bar', grouping: 'clustered', label: t('Clustered Bar') }, { type: 'bar', grouping: 'stacked', label: t('Stacked Bar') }, { type: 'bar', grouping: 'percent', label: t('100% Stacked Bar') },
          ]} />
          <ChartMenu icon={ChartScatter} label={t('Scatter')} items={[{ type: 'scatter', grouping: 'clustered', label: t('Scatter') }, { type: 'radar', grouping: 'clustered', label: t('Radar') }]} />
          <ChartMenu icon={AreaChart} label={t('Statistic')} items={[{ type: 'histogram', grouping: 'clustered', label: t('Histogram') }, { type: 'waterfall', grouping: 'clustered', label: t('Waterfall') }, { type: 'combo', grouping: 'clustered', label: t('Combo') }]} />
        </div>
        <RibbonButton icon={FileStack} label={t('PivotChart')} large onClick={() => app.dialog({ kind: 'createPivot', data: source(app) })} />
      </RibbonGroup>
      <RibbonGroup label={t('Sparklines')} icon={TrendingUp}>
        <RibbonButton icon={TrendingUp} label={t('Line')} large onClick={() => app.dialog({ kind: 'sparklines', data: 'line' })} />
        <RibbonButton icon={ChartColumn} label={t('Column')} large onClick={() => app.dialog({ kind: 'sparklines', data: 'column' })} />
        <RibbonButton icon={Hash} label={t('Win/Loss')} large onClick={() => app.dialog({ kind: 'sparklines', data: 'winloss' })} />
      </RibbonGroup>
      <RibbonGroup label={t('Filters')} icon={Filter}>
        <RibbonButton icon={Filter} label={t('Slicer')} large title={t('Insert Slicer: filter a table or PivotTable with buttons')} onClick={() => {
          const a = doc.sel.active
          const table = tableAt(doc.sheet, a.r, a.c)
          const p = pivotAt(doc.sheet, a.r, a.c)
          if (table) app.dialog({ kind: 'insertSlicer', data: { type: 'table', table: table.name } })
          else if (p) app.dialog({ kind: 'insertSlicer', data: { type: 'pivot', pivot: p.id } })
          else app.alert(t('Select a cell in a table or PivotTable to insert a slicer.'), t('Insert Slicer'))
        }} />
        <RibbonButton icon={CalendarRange} label={t('Timeline')} large title={t('Insert Timeline: filter a PivotTable by dates')} onClick={() => {
          const a = doc.sel.active
          const p = pivotAt(doc.sheet, a.r, a.c)
          if (p) app.dialog({ kind: 'insertSlicer', data: { type: 'pivot', pivot: p.id, timeline: true } })
          else app.alert(t('Select a cell in a PivotTable to insert a timeline.'), t('Insert Timeline'))
        }} />
      </RibbonGroup>
      <RibbonGroup label={t('Links')} icon={Link}>
        <RibbonButton icon={Link} label={t('Link')} large title={t('Insert Link (Ctrl+K)')} onClick={() => app.dialog({ kind: 'hyperlink' })} />
      </RibbonGroup>
      <RibbonGroup label={t('Comments')} icon={MessageSquarePlus}>
        <RibbonButton icon={MessageSquarePlus} label={t('Comment')} large onClick={() => app.setPane('comments')} />
      </RibbonGroup>
      <RibbonGroup label={t('Text')} icon={Type}>
        <RibbonButton icon={TextCursorInput} label={t('Text Box')} large onClick={() => startShape('rect', true)} />
        <RibbonButton icon={LayoutPanelTop} label={t('Header & Footer')} large onClick={() => app.dialog({ kind: 'headerFooter' })} />
        <MenuButton
          icon={Sparkles}
          label={t('WordArt')}
          large
          items={[
            { label: t('Fill: Blue, Shadow'), onClick: () => wordArt('#2E6FD8', 'shadow') },
            { label: t('Fill: Orange, Glow'), onClick: () => wordArt('#E07A1F', 'glow') },
            { label: t('Fill: White, Outline: Blue'), onClick: () => wordArt('#FFFFFF', 'outline') },
            { label: t('Fill: Black'), onClick: () => wordArt('#262626', undefined) },
          ]}
        />
      </RibbonGroup>
      <RibbonGroup label={t('Symbols')} icon={Omega}>
        <RibbonButton icon={Omega} label={t('Symbol')} large onClick={() => app.dialog({ kind: 'symbol' })} />
      </RibbonGroup>
    </>
  )

  function wordArt(color: string, effect: 'shadow' | 'glow' | 'outline' | undefined) {
    const s = newShape(doc, 'rect', true)
    Object.assign(s, { name: s.name.replace('TextBox', 'WordArt'), fill: null, line: null, text: t('Your text here'), textColor: color, fontSize: 36, bold: true, align: 'center', vAlign: 'middle', effect, anchor: { ...s.anchor, w: 360, h: 72 } })
    doc.transact(tx('Insert WordArt'), () => {
      doc.noteProps(doc.sheet)
      doc.sheet.x.objects = [...doc.sheet.x.objects, s]
    })
    doc.selObj = s.id
    doc.selObjs = []
    doc.emit()
    app.setTab('shapeFormat')
  }
}

export function DataTab() {
  const app = useApp()
  const doc = app.doc
  useDocVersion(doc)
  const filtered = hasActiveFilters(doc.sheet)
  const groupSel = (fn: typeof group | typeof ungroup, label: string) => {
    const rg = doc.activeRange
    if (isFullRows(rg) && !isFullCols(rg)) return void fn(doc, 'row', rg)
    if (isFullCols(rg) && !isFullRows(rg)) return void fn(doc, 'col', rg)
    app.dialog({ kind: 'groupDialog', data: label === 'Ungroup' ? 'ungroup' : 'group' })
  }
  const detail = (show: boolean) => {
    const sheet = doc.sheet
    const a = doc.sel.active
    // find a summary row next to the active row
    for (let L = 7; L >= 1; L--) {
      for (const at of [a.r, a.r + 1, a.r - 1]) {
        const run = groupRun(sheet, 'row', at, L)
        if (run && (levelAt(sheet, 'row', a.r) >= L || at === a.r)) {
          const hidden = sheet.rows.hidden.has(run[0])
          if (hidden === show) toggleGroup(doc, 'row', at, L)
          return
        }
      }
    }
    app.alert(t('The active cell is not next to a group.'))
  }
  return (
    <>
      <RibbonGroup label={t('Get & Transform Data')} icon={FileInput}>
        <MenuButton
          icon={FileInput}
          label={t('Get Data')}
          large
          items={[
            { heading: t('From File') },
            { label: t('From Text/CSV'), icon: FileInput, onClick: () => getDataFrom(app, '.csv,.txt,.tsv,.prn') },
            { label: t('From JSON'), icon: FileJson, onClick: () => getDataFrom(app, '.json') },
            { label: t('From XML'), icon: FileCode, onClick: () => getDataFrom(app, '.xml') },
            { label: t('From Web Page (.html)'), icon: Globe, onClick: () => getDataFrom(app, '.html,.htm') },
            { label: t('From Workbook'), icon: FileSpreadsheet, onClick: app.openFile },
            { heading: t('From This Workbook') },
            { label: t('From Table/Range'), icon: Table2, onClick: () => app.dialog({ kind: 'createTable' }) },
          ]}
        />
        <div className="col">
          <RibbonButton icon={FileInput} label={t('From Text/CSV')} showLabel onClick={() => getDataFrom(app, '.csv,.txt,.tsv,.prn')} />
          <RibbonButton icon={Globe} label={t('From Web')} showLabel title={t('From a saved web page (.html)')} onClick={() => getDataFrom(app, '.html,.htm')} />
          <RibbonButton icon={Table2} label={t('From Table/Range')} showLabel onClick={() => app.dialog({ kind: 'createTable' })} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Queries & Connections')} icon={RefreshCw}>
        <RibbonButton icon={RefreshCw} label={t('Refresh All')} large title={t('Refresh All (Ctrl+Alt+F5)')} onClick={() => { refreshAllPivots(doc); doc.engine.recalcAll(); doc.emit() }} />
      </RibbonGroup>
      <RibbonGroup label={t('Sort & Filter')} icon={Filter}>
        <div className="col">
          <RibbonButton icon={ArrowDownAZ} label={t('Sort A to Z')} onClick={() => quickSort(doc, false)} />
          <RibbonButton icon={ArrowUpZA} label={t('Sort Z to A')} onClick={() => quickSort(doc, true)} />
        </div>
        <RibbonButton icon={ArrowDownWideNarrow} label={t('Sort')} large onClick={() => app.dialog({ kind: 'sort' })} />
        <RibbonButton icon={Filter} label={t('Filter')} large title={t('Filter (Ctrl+Shift+L)')} active={!!doc.sheet.x.autoFilter} onClick={() => { const e = toggleAutoFilter(doc); if (e) app.alert(e) }} />
        <div className="col">
          <RibbonButton icon={FilterX} label={t('Clear')} showLabel disabled={!filtered} onClick={() => clearFilters(doc)} />
          <RibbonButton icon={RefreshCw} label={t('Reapply')} showLabel onClick={() => reapplyFilters(doc)} />
          <RibbonButton icon={Filter} label={t('Advanced')} showLabel onClick={() => app.dialog({ kind: 'advancedFilter' })} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Data Tools')} icon={ListChecks}>
        <RibbonButton icon={Columns2} label={t('Text to Columns')} large onClick={() => app.dialog({ kind: 'textToColumns' })} />
        <div className="col">
          <RibbonButton icon={Zap} label={t('Flash Fill')} showLabel title={t('Flash Fill (Ctrl+E)')} onClick={() => { const r = flashFill(doc); if (typeof r === 'string') app.alert(r, t('Flash Fill')) }} />
          <RibbonButton icon={CopyMinus} label={t('Remove Duplicates')} showLabel onClick={() => app.dialog({ kind: 'removeDuplicates' })} />
          <RibbonButton icon={Combine} label={t('Consolidate')} showLabel onClick={() => app.dialog({ kind: 'consolidate' })} />
          <SplitButton
            icon={ListChecks}
            label={t('Data Validation')}
            showLabel
            onClick={() => app.dialog({ kind: 'validation' })}
            items={[
              { label: t('Data Validation…'), onClick: () => app.dialog({ kind: 'validation' }) },
              { label: t('Circle Invalid Data'), onClick: () => circleInvalid(app) },
              { label: t('Clear Validation Circles'), onClick: () => { doc.circles = []; doc.emit() } },
            ]}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Forecast')} icon={Target}>
        <MenuButton
          icon={Target}
          label={t('What-If Analysis')}
          large
          items={[
            { label: t('Scenario Manager…'), onClick: () => app.dialog({ kind: 'scenarios' }) },
            { label: t('Goal Seek…'), onClick: () => app.dialog({ kind: 'goalSeek' }) },
            { label: t('Data Table…'), onClick: () => app.dialog({ kind: 'dataTable' }) },
          ]}
        />
        <RibbonButton icon={LineChart} label={t('Forecast Sheet')} large onClick={() => app.dialog({ kind: 'forecast' })} />
      </RibbonGroup>
      <RibbonGroup label={t('Outline')} icon={Group}>
        <SplitButton icon={Group} label={t('Group')} large title={t('Group (Shift+Alt+Right)')} onClick={() => groupSel(group, tx('Group'))} items={[{ label: t('Group…'), onClick: () => groupSel(group, tx('Group')) }]} />
        <SplitButton
          icon={Ungroup}
          label={t('Ungroup')}
          large
          title={t('Ungroup (Shift+Alt+Left)')}
          onClick={() => groupSel(ungroup, tx('Ungroup'))}
          items={[{ label: t('Ungroup…'), onClick: () => groupSel(ungroup, tx('Ungroup')) }, { label: t('Clear Outline'), onClick: () => clearOutline(doc) }]}
        />
        <RibbonButton icon={Sigma} label={t('Subtotal')} large onClick={() => app.dialog({ kind: 'subtotal' })} />
        <div className="col">
          <RibbonButton icon={Plus} label={t('Show Detail')} showLabel onClick={() => detail(true)} />
          <RibbonButton icon={Minus} label={t('Hide Detail')} showLabel onClick={() => detail(false)} />
        </div>
      </RibbonGroup>
    </>
  )
}

export function ReviewTab() {
  const app = useApp()
  const doc = app.doc
  useDocVersion(doc)
  const sheet = doc.sheet
  const { r, c } = doc.sel.active
  const note = noteAt(sheet, r, c)
  const anyNotes = Object.keys(sheet.x.notes).length > 0
  const allShown = anyNotes && Object.values(sheet.x.notes).every((n) => n.visible)
  const noteItems: MenuItem[] = [
    { label: note ? t('Edit Note') : t('New Note'), shortcut: 'Shift+F2', onClick: () => app.dialog({ kind: 'prompt', title: 'note' }) },
    { label: t('Delete Note'), disabled: !note, onClick: () => setNote(doc, r, c, null) },
    'separator',
    { label: t('Previous Note'), disabled: !anyNotes, onClick: () => stepAnnotation(doc, 'notes', -1) },
    { label: t('Next Note'), disabled: !anyNotes, onClick: () => stepAnnotation(doc, 'notes', 1) },
    { label: t('Show/Hide Note'), disabled: !note, onClick: () => toggleNote(doc, r, c) },
    { label: allShown ? t('Hide All Notes') : t('Show All Notes'), disabled: !anyNotes, onClick: () => showAllNotes(doc, !allShown) },
    'separator',
    {
      label: t('Convert to Comments'),
      disabled: !anyNotes,
      onClick: () => {
        doc.transact(tx('Convert to Comments'), () => {
          for (const [k, n] of Object.entries(sheet.x.notes)) addComment(doc, Math.floor(Number(k) / 16384), Number(k) % 16384, n.text)
          doc.noteProps(sheet)
          sheet.x.notes = {}
        })
      },
    },
  ]
  return (
    <>
      <RibbonGroup label={t('Proofing')} icon={StretchHorizontal}>
        <RibbonButton icon={SpellCheck} label={t('Spelling')} large title={t('Spelling (F7)')} onClick={() => app.dialog({ kind: 'spelling' })} />
        <RibbonButton icon={StretchHorizontal} label={t('Workbook Statistics')} large onClick={() => app.dialog({ kind: 'stats' })} />
      </RibbonGroup>
      <RibbonGroup label={t('Accessibility')} icon={Accessibility}>
        <RibbonButton icon={Accessibility} label={t('Check Accessibility')} large onClick={() => app.dialog({ kind: 'accessibility' })} />
      </RibbonGroup>
      <RibbonGroup label={t('Comments')} icon={MessageSquare}>
        <RibbonButton icon={MessageSquarePlus} label={t('New Comment')} large onClick={() => app.setPane('comments')} />
        <RibbonButton icon={MessageSquareX} label={t('Delete')} large disabled={!threadAt(sheet, r, c)} onClick={() => deleteThread(doc, r, c)} />
        <div className="col">
          <RibbonButton icon={ChevronLeft} label={t('Previous Comment')} showLabel onClick={() => stepAnnotation(doc, 'comments', -1)} />
          <RibbonButton icon={ChevronRight} label={t('Next Comment')} showLabel onClick={() => stepAnnotation(doc, 'comments', 1)} />
        </div>
        <RibbonButton icon={PanelRight} label={t('Show Comments')} large active={app.pane === 'comments'} onClick={() => app.setPane(app.pane === 'comments' ? null : 'comments')} />
      </RibbonGroup>
      <RibbonGroup label={t('Notes')} icon={StickyNote}>
        <MenuButton icon={NotebookPen} label={t('Notes')} large items={noteItems} />
      </RibbonGroup>
      <RibbonGroup label={t('Protect')} icon={ShieldCheck}>
        {sheet.x.protection ? (
          <RibbonButton icon={LockOpen} label={t('Unprotect Sheet')} large onClick={() => app.dialog({ kind: 'unprotectSheet' })} />
        ) : (
          <RibbonButton icon={Lock} label={t('Protect Sheet')} large onClick={() => app.dialog({ kind: 'protectSheet' })} />
        )}
        <RibbonButton icon={ShieldCheck} label={doc.wb.protection ? t('Unprotect Workbook') : t('Protect Workbook')} large active={!!doc.wb.protection} onClick={() => app.dialog({ kind: 'protectWorkbook', data: doc.wb.protection ? 'unprotect' : 'protect' })} />
        <RibbonButton icon={TableProperties} label={t('Allow Edit Ranges')} large onClick={() => app.dialog({ kind: 'allowEditRanges' })} />
      </RibbonGroup>
      <RibbonGroup label={t('Changes')} icon={History}>
        <RibbonButton icon={History} label={t('Show Changes')} large onClick={() => app.dialog({ kind: 'showChanges' })} />
      </RibbonGroup>
      <RibbonGroup label={t('Ink')} icon={PenOff}>
        <RibbonButton icon={PenOff} label={t('Hide Ink')} large active={doc.hideInk} onClick={() => { doc.hideInk = !doc.hideInk; doc.emit() }} />
      </RibbonGroup>
    </>
  )
}

export function ViewTab() {
  const app = useApp()
  const doc = app.doc
  useDocVersion(doc)
  const sheet = doc.sheet
  const a = doc.sel.active
  return (
    <>
      <RibbonGroup label={t('Workbook Views')} icon={FileSpreadsheet}>
        <RibbonButton icon={FileSpreadsheet} label={t('Normal')} large active={app.viewMode === 'normal'} onClick={() => app.setViewMode('normal')} />
        <RibbonButton icon={SquareDashed} label={t('Page Break Preview')} large active={app.viewMode === 'pageBreak'} onClick={() => app.setViewMode('pageBreak')} />
        <RibbonButton icon={LayoutPanelTop} label={t('Page Layout')} large active={app.viewMode === 'pageLayout'} onClick={() => app.setViewMode('pageLayout')} />
        <RibbonButton icon={Eye} label={t('Custom Views')} large onClick={() => app.dialog({ kind: 'customViews' })} />
      </RibbonGroup>
      <RibbonGroup label={t('Show')} icon={CircleDot}>
        <div className="col checks">
          <CheckItem label={t('Formula Bar')} checked={app.showFormulaBar} onChange={app.setShowFormulaBar} />
          <CheckItem label={t('Gridlines')} checked={sheet.showGrid} onChange={(v) => { sheet.showGrid = v; doc.emit() }} />
          <CheckItem label={t('Headings')} checked={sheet.showHeadings} onChange={(v) => { sheet.showHeadings = v; doc.emit() }} />
        </div>
        <div className="col checks">
          <CheckItem label={t('Zero Values')} checked={sheet.showZeros} onChange={(v) => { sheet.showZeros = v; doc.emit() }} />
          <CheckItem label={t('Formulas')} checked={sheet.showFormulas} onChange={(v) => { sheet.showFormulas = v; doc.emit() }} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Zoom')} icon={ZoomIn}>
        <RibbonButton icon={ZoomIn} label={t('Zoom')} large onClick={() => app.dialog({ kind: 'zoom' })} />
        <RibbonButton icon={ScanSearch} label="100%" large onClick={() => { sheet.zoom = 100; doc.emit() }} />
        <RibbonButton icon={Maximize} label={t('Zoom to Selection')} large onClick={() => zoomToSelection()} />
      </RibbonGroup>
      <RibbonGroup label={t('Window')} icon={AppWindow}>
        <RibbonButton icon={AppWindow} label={t('New Window')} large onClick={() => window.open(location.href, '_blank', 'noopener')} />
        <MenuButton
          icon={Snowflake}
          label={t('Freeze Panes')}
          large
          wide
          items={[
            sheet.freeze.rows || sheet.freeze.cols
              ? { label: t('Unfreeze Panes'), detail: t('Unlock all rows and columns to scroll through the entire worksheet.'), onClick: () => freezePanes(doc, 0, 0) }
              : { label: t('Freeze Panes'), detail: t('Keep rows and columns visible while the rest of the worksheet scrolls (based on current selection).'), onClick: () => freezePanes(doc, a.r, a.c) },
            { label: t('Freeze Top Row'), detail: t('Keep the top row visible while scrolling through the rest of the worksheet.'), onClick: () => freezePanes(doc, 1, 0) },
            { label: t('Freeze First Column'), detail: t('Keep the first column visible while scrolling through the rest of the worksheet.'), onClick: () => freezePanes(doc, 0, 1) },
          ]}
        />
        <RibbonButton icon={SquareSplitHorizontal} label={t('Split')} large active={!!app.split} onClick={() => app.setSplit(app.split ? null : { r: Math.max(1, a.r), c: Math.max(1, a.c) })} />
        <RibbonButton icon={Rows3} label={t('Watch Window')} large active={app.pane === 'watch'} onClick={() => app.setPane(app.pane === 'watch' ? null : 'watch')} />
        <RibbonButton icon={Maximize} label={t('Full Screen')} large onClick={() => app.setFullScreen(true)} />
        <div className="col">
          <RibbonButton icon={EyeOff} label={t('Hide')} showLabel disabled={doc.windowHidden} onClick={() => { doc.windowHidden = true; doc.emit() }} />
          <RibbonButton icon={Eye} label={t('Unhide')} showLabel disabled={!doc.windowHidden} onClick={() => { doc.windowHidden = false; doc.emit() }} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Macros')} icon={Clapperboard}>
        <MenuButton
          icon={Clapperboard}
          label={t('Macros')}
          large
          active={!!doc.recorder}
          items={[
            { label: t('View Macros'), onClick: () => app.dialog({ kind: 'macros' }) },
            doc.recorder
              ? { label: t('Stop Recording'), onClick: () => stopRecording(doc) }
              : { label: t('Record Macro…'), onClick: () => void import('../dialogs/MacroDialog').then((m) => m.recordMacro(app, doc.macroRelative)) },
            { label: t('Use Relative References'), checked: doc.macroRelative, onClick: () => { doc.macroRelative = !doc.macroRelative; doc.emit() } },
          ]}
        />
      </RibbonGroup>
    </>
  )

  function zoomToSelection() {
    const rg = doc.activeRange
    const el = document.querySelector('.grid-scroller') as HTMLElement | null
    if (!el) return
    const w = sheet.cols.offset(Math.min(rg.c2, MAX_COLS - 1) + 1) - sheet.cols.offset(rg.c1)
    const h = sheet.rows.offset(Math.min(rg.r2, MAX_ROWS - 1) + 1) - sheet.rows.offset(rg.r1)
    const z = Math.floor(Math.min((el.clientWidth - 40) / w, (el.clientHeight - 30) / h) * 100)
    sheet.zoom = Math.max(10, Math.min(400, z))
    doc.emit()
  }
}

void Eraser
void CircleOff
