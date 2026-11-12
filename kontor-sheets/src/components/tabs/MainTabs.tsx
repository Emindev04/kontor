// Insert, Data, Review and View ribbon tabs.
import {
  AreaChart, ArrowDownAZ, ArrowDownWideNarrow, ArrowUpZA, BarChart3, BarChartHorizontal, ChartColumn, ChartLine, ChartPie, ChartScatter, CircleDot, Columns2,
  CopyMinus, Eraser, FileInput, FileSpreadsheet, Filter, FilterX, Group, Image as ImageIcon, LayoutPanelTop, Link, ListChecks, Lock, LockOpen, Maximize,
  MessageSquare, MessageSquarePlus, MessageSquareX, Minus, NotebookPen, Omega, Plus, RefreshCw, Rows3, ScanSearch, Shapes, ShieldCheck, Snowflake, Sparkles,
  SquareDashed, StickyNote, StretchHorizontal, Table2, Target, TableProperties, TextCursorInput, TrendingUp, Type, Ungroup, ZoomIn, ChevronLeft, ChevronRight,
  Smile, PanelRight, Sigma, Zap, CircleOff, FileStack, SquareSplitHorizontal, AppWindow, Hash, Combine, LineChart, FileJson, Globe, FileCode, Eye, CalendarRange, Accessibility, PenOff, SpellCheck, History,
} from 'lucide-react'
import { MAX_COLS, MAX_ROWS, isFullCols, isFullRows } from '../../model/address'
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
      app.alert(`We couldn't read ${file.name}.`, 'Get Data')
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
                  app.alert('Select a range with data first, then insert the chart.')
                  return
                }
                insertChart(app, it.type, it.grouping, source(app))
              }}
            >
              <span dangerouslySetInnerHTML={{ __html: chartTypeIcon(it.type, it.grouping) }} />
              <span>{it.label}</span>
            </button>
          ))}
          <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => { close(); app.dialog({ kind: 'insertChart', data: source(app) }) }}>More Charts…</button>
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
      <RibbonGroup label="Tables" icon={Table2}>
        <RibbonButton icon={FileStack} label="PivotTable" large onClick={() => app.dialog({ kind: 'createPivot', data: source(app) })} />
        <RibbonButton icon={Sparkles} label="Recommended PivotTables" large onClick={() => app.dialog({ kind: 'recommendedPivots' })} />
        <RibbonButton icon={Table2} label="Table" large title="Table (Ctrl+T)" onClick={() => app.dialog({ kind: 'createTable' })} />
      </RibbonGroup>
      <RibbonGroup label="Illustrations" icon={ImageIcon}>
        <RibbonButton icon={ImageIcon} label="Pictures" large onClick={app.insertPicture} />
        <PopoverButton icon={Shapes} label="Shapes" large className="shape-menu">
          {(close) => (
            <ShapeGallery
              onPick={(id) => {
                close()
                startShape(id)
              }}
            />
          )}
        </PopoverButton>
        <RibbonButton icon={Smile} label="Icons" large onClick={() => app.dialog({ kind: 'insertIcon' })} />
      </RibbonGroup>
      <RibbonGroup label="Charts" icon={BarChart3}>
        <RibbonButton icon={BarChart3} label="Recommended Charts" large onClick={() => app.dialog({ kind: 'insertChart', data: source(app) })} />
        <div className="col">
          <ChartMenu icon={ChartColumn} label="Column" items={[
            { type: 'column', grouping: 'clustered', label: 'Clustered Column' }, { type: 'column', grouping: 'stacked', label: 'Stacked Column' }, { type: 'column', grouping: 'percent', label: '100% Stacked Column' },
            { type: 'bar', grouping: 'clustered', label: 'Clustered Bar' }, { type: 'bar', grouping: 'stacked', label: 'Stacked Bar' }, { type: 'bar', grouping: 'percent', label: '100% Stacked Bar' },
          ]} />
          <ChartMenu icon={ChartLine} label="Line" items={[
            { type: 'line', grouping: 'clustered', label: 'Line' }, { type: 'line', grouping: 'stacked', label: 'Stacked Line' }, { type: 'line', grouping: 'percent', label: '100% Stacked Line' },
            { type: 'area', grouping: 'clustered', label: 'Area' }, { type: 'area', grouping: 'stacked', label: 'Stacked Area' }, { type: 'area', grouping: 'percent', label: '100% Stacked Area' },
          ]} />
          <ChartMenu icon={ChartPie} label="Pie" items={[{ type: 'pie', grouping: 'clustered', label: 'Pie' }, { type: 'doughnut', grouping: 'clustered', label: 'Doughnut' }]} />
        </div>
        <div className="col">
          <ChartMenu icon={BarChartHorizontal} label="Bar" items={[
            { type: 'bar', grouping: 'clustered', label: 'Clustered Bar' }, { type: 'bar', grouping: 'stacked', label: 'Stacked Bar' }, { type: 'bar', grouping: 'percent', label: '100% Stacked Bar' },
          ]} />
          <ChartMenu icon={ChartScatter} label="Scatter" items={[{ type: 'scatter', grouping: 'clustered', label: 'Scatter' }, { type: 'radar', grouping: 'clustered', label: 'Radar' }]} />
          <ChartMenu icon={AreaChart} label="Statistic" items={[{ type: 'histogram', grouping: 'clustered', label: 'Histogram' }, { type: 'waterfall', grouping: 'clustered', label: 'Waterfall' }, { type: 'combo', grouping: 'clustered', label: 'Combo' }]} />
        </div>
        <RibbonButton icon={FileStack} label="PivotChart" large onClick={() => app.dialog({ kind: 'createPivot', data: source(app) })} />
      </RibbonGroup>
      <RibbonGroup label="Sparklines" icon={TrendingUp}>
        <RibbonButton icon={TrendingUp} label="Line" large onClick={() => app.dialog({ kind: 'sparklines', data: 'line' })} />
        <RibbonButton icon={ChartColumn} label="Column" large onClick={() => app.dialog({ kind: 'sparklines', data: 'column' })} />
        <RibbonButton icon={Hash} label="Win/Loss" large onClick={() => app.dialog({ kind: 'sparklines', data: 'winloss' })} />
      </RibbonGroup>
      <RibbonGroup label="Filters" icon={Filter}>
        <RibbonButton icon={Filter} label="Slicer" large title="Insert Slicer: filter a table or PivotTable with buttons" onClick={() => {
          const a = doc.sel.active
          const t = tableAt(doc.sheet, a.r, a.c)
          const p = pivotAt(doc.sheet, a.r, a.c)
          if (t) app.dialog({ kind: 'insertSlicer', data: { type: 'table', table: t.name } })
          else if (p) app.dialog({ kind: 'insertSlicer', data: { type: 'pivot', pivot: p.id } })
          else app.alert('Select a cell in a table or PivotTable to insert a slicer.', 'Insert Slicer')
        }} />
        <RibbonButton icon={CalendarRange} label="Timeline" large title="Insert Timeline: filter a PivotTable by dates" onClick={() => {
          const a = doc.sel.active
          const p = pivotAt(doc.sheet, a.r, a.c)
          if (p) app.dialog({ kind: 'insertSlicer', data: { type: 'pivot', pivot: p.id, timeline: true } })
          else app.alert('Select a cell in a PivotTable to insert a timeline.', 'Insert Timeline')
        }} />
      </RibbonGroup>
      <RibbonGroup label="Links" icon={Link}>
        <RibbonButton icon={Link} label="Link" large title="Insert Link (Ctrl+K)" onClick={() => app.dialog({ kind: 'hyperlink' })} />
      </RibbonGroup>
      <RibbonGroup label="Comments" icon={MessageSquarePlus}>
        <RibbonButton icon={MessageSquarePlus} label="Comment" large onClick={() => app.setPane('comments')} />
      </RibbonGroup>
      <RibbonGroup label="Text" icon={Type}>
        <RibbonButton icon={TextCursorInput} label="Text Box" large onClick={() => startShape('rect', true)} />
        <RibbonButton icon={LayoutPanelTop} label="Header & Footer" large onClick={() => app.dialog({ kind: 'headerFooter' })} />
        <MenuButton
          icon={Sparkles}
          label="WordArt"
          large
          items={[
            { label: 'Fill: Blue, Shadow', onClick: () => wordArt('#2E6FD8', 'shadow') },
            { label: 'Fill: Orange, Glow', onClick: () => wordArt('#E07A1F', 'glow') },
            { label: 'Fill: White, Outline: Blue', onClick: () => wordArt('#FFFFFF', 'outline') },
            { label: 'Fill: Black', onClick: () => wordArt('#262626', undefined) },
          ]}
        />
      </RibbonGroup>
      <RibbonGroup label="Symbols" icon={Omega}>
        <RibbonButton icon={Omega} label="Symbol" large onClick={() => app.dialog({ kind: 'symbol' })} />
      </RibbonGroup>
    </>
  )

  function wordArt(color: string, effect: 'shadow' | 'glow' | 'outline' | undefined) {
    const s = newShape(doc, 'rect', true)
    Object.assign(s, { name: s.name.replace('TextBox', 'WordArt'), fill: null, line: null, text: 'Your text here', textColor: color, fontSize: 36, bold: true, align: 'center', vAlign: 'middle', effect, anchor: { ...s.anchor, w: 360, h: 72 } })
    doc.transact('Insert WordArt', () => {
      doc.noteProps(doc.sheet)
      doc.sheet.x.objects = [...doc.sheet.x.objects, s]
    })
    doc.selObj = s.id
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
    app.alert('The active cell is not next to a group.')
  }
  return (
    <>
      <RibbonGroup label="Get & Transform Data" icon={FileInput}>
        <MenuButton
          icon={FileInput}
          label="Get Data"
          large
          items={[
            { heading: 'From File' },
            { label: 'From Text/CSV', icon: FileInput, onClick: () => getDataFrom(app, '.csv,.txt,.tsv,.prn') },
            { label: 'From JSON', icon: FileJson, onClick: () => getDataFrom(app, '.json') },
            { label: 'From XML', icon: FileCode, onClick: () => getDataFrom(app, '.xml') },
            { label: 'From Web Page (.html)', icon: Globe, onClick: () => getDataFrom(app, '.html,.htm') },
            { label: 'From Workbook', icon: FileSpreadsheet, onClick: app.openFile },
            { heading: 'From This Workbook' },
            { label: 'From Table/Range', icon: Table2, onClick: () => app.dialog({ kind: 'createTable' }) },
          ]}
        />
        <div className="col">
          <RibbonButton icon={FileInput} label="From Text/CSV" showLabel onClick={() => getDataFrom(app, '.csv,.txt,.tsv,.prn')} />
          <RibbonButton icon={Globe} label="From Web" showLabel title="From a saved web page (.html)" onClick={() => getDataFrom(app, '.html,.htm')} />
          <RibbonButton icon={Table2} label="From Table/Range" showLabel onClick={() => app.dialog({ kind: 'createTable' })} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Queries & Connections" icon={RefreshCw}>
        <RibbonButton icon={RefreshCw} label="Refresh All" large title="Refresh All (Ctrl+Alt+F5)" onClick={() => { refreshAllPivots(doc); doc.engine.recalcAll(); doc.emit() }} />
      </RibbonGroup>
      <RibbonGroup label="Sort & Filter" icon={Filter}>
        <div className="col">
          <RibbonButton icon={ArrowDownAZ} label="Sort A to Z" onClick={() => quickSort(doc, false)} />
          <RibbonButton icon={ArrowUpZA} label="Sort Z to A" onClick={() => quickSort(doc, true)} />
        </div>
        <RibbonButton icon={ArrowDownWideNarrow} label="Sort" large onClick={() => app.dialog({ kind: 'sort' })} />
        <RibbonButton icon={Filter} label="Filter" large title="Filter (Ctrl+Shift+L)" active={!!doc.sheet.x.autoFilter} onClick={() => { const e = toggleAutoFilter(doc); if (e) app.alert(e) }} />
        <div className="col">
          <RibbonButton icon={FilterX} label="Clear" showLabel disabled={!filtered} onClick={() => clearFilters(doc)} />
          <RibbonButton icon={RefreshCw} label="Reapply" showLabel onClick={() => reapplyFilters(doc)} />
          <RibbonButton icon={Filter} label="Advanced" showLabel onClick={() => app.dialog({ kind: 'advancedFilter' })} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Data Tools" icon={ListChecks}>
        <RibbonButton icon={Columns2} label="Text to Columns" large onClick={() => app.dialog({ kind: 'textToColumns' })} />
        <div className="col">
          <RibbonButton icon={Zap} label="Flash Fill" showLabel title="Flash Fill (Ctrl+E)" onClick={() => { const r = flashFill(doc); if (typeof r === 'string') app.alert(r, 'Flash Fill') }} />
          <RibbonButton icon={CopyMinus} label="Remove Duplicates" showLabel onClick={() => app.dialog({ kind: 'removeDuplicates' })} />
          <RibbonButton icon={Combine} label="Consolidate" showLabel onClick={() => app.dialog({ kind: 'consolidate' })} />
          <SplitButton
            icon={ListChecks}
            label="Data Validation"
            showLabel
            onClick={() => app.dialog({ kind: 'validation' })}
            items={[
              { label: 'Data Validation…', onClick: () => app.dialog({ kind: 'validation' }) },
              { label: 'Circle Invalid Data', onClick: () => circleInvalid(app) },
              { label: 'Clear Validation Circles', onClick: () => { doc.circles = []; doc.emit() } },
            ]}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Forecast" icon={Target}>
        <MenuButton
          icon={Target}
          label="What-If Analysis"
          large
          items={[
            { label: 'Scenario Manager…', onClick: () => app.dialog({ kind: 'scenarios' }) },
            { label: 'Goal Seek…', onClick: () => app.dialog({ kind: 'goalSeek' }) },
            { label: 'Data Table…', onClick: () => app.dialog({ kind: 'dataTable' }) },
          ]}
        />
        <RibbonButton icon={LineChart} label="Forecast Sheet" large onClick={() => app.dialog({ kind: 'forecast' })} />
      </RibbonGroup>
      <RibbonGroup label="Outline" icon={Group}>
        <SplitButton icon={Group} label="Group" large title="Group (Shift+Alt+Right)" onClick={() => groupSel(group, 'Group')} items={[{ label: 'Group…', onClick: () => groupSel(group, 'Group') }]} />
        <SplitButton
          icon={Ungroup}
          label="Ungroup"
          large
          title="Ungroup (Shift+Alt+Left)"
          onClick={() => groupSel(ungroup, 'Ungroup')}
          items={[{ label: 'Ungroup…', onClick: () => groupSel(ungroup, 'Ungroup') }, { label: 'Clear Outline', onClick: () => clearOutline(doc) }]}
        />
        <RibbonButton icon={Sigma} label="Subtotal" large onClick={() => app.dialog({ kind: 'subtotal' })} />
        <div className="col">
          <RibbonButton icon={Plus} label="Show Detail" showLabel onClick={() => detail(true)} />
          <RibbonButton icon={Minus} label="Hide Detail" showLabel onClick={() => detail(false)} />
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
    { label: note ? 'Edit Note' : 'New Note', shortcut: 'Shift+F2', onClick: () => app.dialog({ kind: 'prompt', title: 'note' }) },
    { label: 'Delete Note', disabled: !note, onClick: () => setNote(doc, r, c, null) },
    'separator',
    { label: 'Previous Note', disabled: !anyNotes, onClick: () => stepAnnotation(doc, 'notes', -1) },
    { label: 'Next Note', disabled: !anyNotes, onClick: () => stepAnnotation(doc, 'notes', 1) },
    { label: 'Show/Hide Note', disabled: !note, onClick: () => toggleNote(doc, r, c) },
    { label: allShown ? 'Hide All Notes' : 'Show All Notes', disabled: !anyNotes, onClick: () => showAllNotes(doc, !allShown) },
    'separator',
    {
      label: 'Convert to Comments',
      disabled: !anyNotes,
      onClick: () => {
        doc.transact('Convert to Comments', () => {
          for (const [k, n] of Object.entries(sheet.x.notes)) addComment(doc, Math.floor(Number(k) / 16384), Number(k) % 16384, n.text)
          doc.noteProps(sheet)
          sheet.x.notes = {}
        })
      },
    },
  ]
  return (
    <>
      <RibbonGroup label="Proofing" icon={StretchHorizontal}>
        <RibbonButton icon={SpellCheck} label="Spelling" large title="Spelling (F7)" onClick={() => app.dialog({ kind: 'spelling' })} />
        <RibbonButton icon={StretchHorizontal} label="Workbook Statistics" large onClick={() => app.dialog({ kind: 'stats' })} />
      </RibbonGroup>
      <RibbonGroup label="Accessibility" icon={Accessibility}>
        <RibbonButton icon={Accessibility} label="Check Accessibility" large onClick={() => app.dialog({ kind: 'accessibility' })} />
      </RibbonGroup>
      <RibbonGroup label="Comments" icon={MessageSquare}>
        <RibbonButton icon={MessageSquarePlus} label="New Comment" large onClick={() => app.setPane('comments')} />
        <RibbonButton icon={MessageSquareX} label="Delete" large disabled={!threadAt(sheet, r, c)} onClick={() => deleteThread(doc, r, c)} />
        <div className="col">
          <RibbonButton icon={ChevronLeft} label="Previous Comment" showLabel onClick={() => stepAnnotation(doc, 'comments', -1)} />
          <RibbonButton icon={ChevronRight} label="Next Comment" showLabel onClick={() => stepAnnotation(doc, 'comments', 1)} />
        </div>
        <RibbonButton icon={PanelRight} label="Show Comments" large active={app.pane === 'comments'} onClick={() => app.setPane(app.pane === 'comments' ? null : 'comments')} />
      </RibbonGroup>
      <RibbonGroup label="Notes" icon={StickyNote}>
        <MenuButton icon={NotebookPen} label="Notes" large items={noteItems} />
      </RibbonGroup>
      <RibbonGroup label="Protect" icon={ShieldCheck}>
        {sheet.x.protection ? (
          <RibbonButton icon={LockOpen} label="Unprotect Sheet" large onClick={() => app.dialog({ kind: 'unprotectSheet' })} />
        ) : (
          <RibbonButton icon={Lock} label="Protect Sheet" large onClick={() => app.dialog({ kind: 'protectSheet' })} />
        )}
        <RibbonButton icon={ShieldCheck} label={doc.wb.protection ? 'Unprotect Workbook' : 'Protect Workbook'} large active={!!doc.wb.protection} onClick={() => app.dialog({ kind: 'protectWorkbook', data: doc.wb.protection ? 'unprotect' : 'protect' })} />
        <RibbonButton icon={TableProperties} label="Allow Edit Ranges" large onClick={() => app.dialog({ kind: 'allowEditRanges' })} />
      </RibbonGroup>
      <RibbonGroup label="Changes" icon={History}>
        <RibbonButton icon={History} label="Show Changes" large onClick={() => app.dialog({ kind: 'showChanges' })} />
      </RibbonGroup>
      <RibbonGroup label="Ink" icon={PenOff}>
        <RibbonButton icon={PenOff} label="Hide Ink" large active={doc.hideInk} onClick={() => { doc.hideInk = !doc.hideInk; doc.emit() }} />
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
      <RibbonGroup label="Workbook Views" icon={FileSpreadsheet}>
        <RibbonButton icon={FileSpreadsheet} label="Normal" large active={app.viewMode === 'normal'} onClick={() => app.setViewMode('normal')} />
        <RibbonButton icon={SquareDashed} label="Page Break Preview" large active={app.viewMode === 'pageBreak'} onClick={() => app.setViewMode('pageBreak')} />
        <RibbonButton icon={LayoutPanelTop} label="Page Layout" large active={app.viewMode === 'pageLayout'} onClick={() => app.setViewMode('pageLayout')} />
        <RibbonButton icon={Eye} label="Custom Views" large onClick={() => app.dialog({ kind: 'customViews' })} />
      </RibbonGroup>
      <RibbonGroup label="Show" icon={CircleDot}>
        <div className="col checks">
          <CheckItem label="Formula Bar" checked={app.showFormulaBar} onChange={app.setShowFormulaBar} />
          <CheckItem label="Gridlines" checked={sheet.showGrid} onChange={(v) => { sheet.showGrid = v; doc.emit() }} />
          <CheckItem label="Headings" checked={sheet.showHeadings} onChange={(v) => { sheet.showHeadings = v; doc.emit() }} />
        </div>
        <div className="col checks">
          <CheckItem label="Zero Values" checked={sheet.showZeros} onChange={(v) => { sheet.showZeros = v; doc.emit() }} />
          <CheckItem label="Formulas" checked={sheet.showFormulas} onChange={(v) => { sheet.showFormulas = v; doc.emit() }} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Zoom" icon={ZoomIn}>
        <RibbonButton icon={ZoomIn} label="Zoom" large onClick={() => app.dialog({ kind: 'zoom' })} />
        <RibbonButton icon={ScanSearch} label="100%" large onClick={() => { sheet.zoom = 100; doc.emit() }} />
        <RibbonButton icon={Maximize} label="Zoom to Selection" large onClick={() => zoomToSelection()} />
      </RibbonGroup>
      <RibbonGroup label="Window" icon={AppWindow}>
        <RibbonButton icon={AppWindow} label="New Window" large onClick={() => window.open(location.href, '_blank', 'noopener')} />
        <MenuButton
          icon={Snowflake}
          label="Freeze Panes"
          large
          wide
          items={[
            sheet.freeze.rows || sheet.freeze.cols
              ? { label: 'Unfreeze Panes', detail: 'Unlock all rows and columns to scroll through the entire worksheet.', onClick: () => freezePanes(doc, 0, 0) }
              : { label: 'Freeze Panes', detail: 'Keep rows and columns visible while the rest of the worksheet scrolls (based on current selection).', onClick: () => freezePanes(doc, a.r, a.c) },
            { label: 'Freeze Top Row', detail: 'Keep the top row visible while scrolling through the rest of the worksheet.', onClick: () => freezePanes(doc, 1, 0) },
            { label: 'Freeze First Column', detail: 'Keep the first column visible while scrolling through the rest of the worksheet.', onClick: () => freezePanes(doc, 0, 1) },
          ]}
        />
        <RibbonButton icon={SquareSplitHorizontal} label="Split" large active={!!app.split} onClick={() => app.setSplit(app.split ? null : { r: Math.max(1, a.r), c: Math.max(1, a.c) })} />
        <RibbonButton icon={Rows3} label="Watch Window" large active={app.pane === 'watch'} onClick={() => app.setPane(app.pane === 'watch' ? null : 'watch')} />
        <RibbonButton icon={Maximize} label="Full Screen" large onClick={() => app.setFullScreen(true)} />
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
