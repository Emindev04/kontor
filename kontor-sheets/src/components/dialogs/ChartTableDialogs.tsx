// Dialogs for charts, tables, PivotTables, custom filters, conditional formatting and data validation.
import { t, tx } from '../../i18n'
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { colName, rangeName, type Range } from '../../model/address'
import type { NewCFRule, CFRule, CFStyle, CFValue, CellOp, ChartDef, ChartGrouping, ChartSeries, ChartType, DatePeriod, FilterOp, IconSetId, Validation, ValidationType } from '../../model/extras'
import { absRef, chartData, chartSeries, deriveSeries, resolveRef } from '../../charts/chartData'
import { chartTypeIcon, renderChartSVG } from '../../charts/renderChart'
import { addObject, newChart, selectedObject, updateChart } from '../../commands/objects'
import { createTable, resizeTable, suggestTableRange, DEFAULT_TABLE_STYLE } from '../../commands/tables'
import { createPivot, updatePivot } from '../../commands/pivot'
import { setColumnFilter, type FilterTarget } from '../../commands/filter'
import { addRule, setRules, describeRule, CF_PRESETS, COLOR_SCALES, DATA_BAR_COLORS, ICON_SETS, defaultThresholds, ICON_COUNTS } from '../../commands/cf'
import { setValidation, validationAt, invalidCells } from '../../commands/validation'
import { currentRegion } from '../../commands/sort'
import { addSheet } from '../../commands/ops'
import { Modal, OkCancel, DialogTabs, cls } from '../ui'
import { useApp } from '../appContext'
import { NUMBER_OPS, TEXT_OPS } from '../FilterMenu'

type P = { onClose: () => void }

/** Parses "A1:B5", "$A$1:$B$5", "Sheet1!A1:B5" into a sheet + range. */
function parseRef(app: ReturnType<typeof useApp>, text: string) {
  return resolveRef(app.doc.wb, text, app.doc.sheet)
}

function selectionSource(app: ReturnType<typeof useApp>): string {
  const doc = app.doc
  let rg = doc.activeRange
  if (rg.r1 === rg.r2 && rg.c1 === rg.c2) rg = currentRegion(doc, doc.sel.active)
  rg = doc.boundToUsed(rg)
  return absRef(doc.sheet, rg)
}

// ---------- charts ----------

const CHART_KINDS: { type: ChartType; label: string; groupings?: ChartGrouping[] }[] = [
  { type: 'column', label: tx('Column'), groupings: ['clustered', 'stacked', 'percent'] },
  { type: 'line', label: tx('Line'), groupings: ['clustered', 'stacked', 'percent'] },
  { type: 'pie', label: tx('Pie') },
  { type: 'doughnut', label: tx('Doughnut') },
  { type: 'bar', label: tx('Bar'), groupings: ['clustered', 'stacked', 'percent'] },
  { type: 'area', label: tx('Area'), groupings: ['clustered', 'stacked', 'percent'] },
  { type: 'scatter', label: tx('X Y (Scatter)') },
  { type: 'radar', label: tx('Radar') },
  { type: 'histogram', label: tx('Histogram') },
  { type: 'waterfall', label: tx('Waterfall') },
  { type: 'funnel', label: tx('Funnel') },
  { type: 'treemap', label: tx('Treemap') },
  { type: 'boxWhisker', label: tx('Box & Whisker') },
  { type: 'combo', label: tx('Combo') },
]

const GROUP_LABEL: Record<ChartGrouping, string> = { clustered: tx('Clustered'), stacked: tx('Stacked'), percent: tx('100% Stacked') }

function subtypeName(type: ChartType, g: ChartGrouping) {
  const base = t(CHART_KINDS.find((k) => k.type === type)?.label ?? type)
  const grouped = t('{grouping} {chartType}', { grouping: t(GROUP_LABEL[g]), chartType: base })
  if (type === 'line' || type === 'area') return g === 'clustered' ? base : grouped
  return CHART_KINDS.find((k) => k.type === type)?.groupings ? grouped : base
}

export function insertChart(app: ReturnType<typeof useApp>, type: ChartType, grouping: ChartGrouping, source: string, onNewSheet = false) {
  const doc = app.doc
  if (onNewSheet) {
    addSheet(doc)
    const sheet = doc.sheet
    sheet.name = uniqueChartSheet(app)
  }
  const chart = newChart(doc, type, grouping, source)
  if (type === 'combo') {
    const series = deriveSeries(doc.wb, doc.engine, source, undefined).series.map((s, i) => ({ ...s, type: i === 0 ? ('column' as const) : ('line' as const) }))
    chart.series = series
  }
  if (onNewSheet) chart.anchor = { x: 8, y: 8, w: 900, h: 560 }
  addObject(doc, chart, t('Insert Chart'))
  app.setTab('chartDesign')
}

function uniqueChartSheet(app: ReturnType<typeof useApp>) {
  for (let i = 1; ; i++) if (!app.doc.wb.sheetByName(`Chart${i}`)) return `Chart${i}`
}

function recommended(app: ReturnType<typeof useApp>, source: string): { type: ChartType; grouping: ChartGrouping; why: string }[] {
  const doc = app.doc
  const d = deriveSeries(doc.wb, doc.engine, source, undefined)
  const out: { type: ChartType; grouping: ChartGrouping; why: string }[] = [{ type: 'column', grouping: 'clustered', why: t('A clustered column chart compares values across a few categories.') }]
  const fake = newChart(doc, 'column', 'clustered', source)
  const data = chartData(doc.wb, doc.engine, { ...fake, series: d.series })
  const n = data.categories.length
  if (data.series.length === 1 && n <= 8 && data.series[0].values.every((v) => v === null || v >= 0)) out.push({ type: 'pie', grouping: 'clustered', why: t('A pie chart shows proportions of a whole. Use it when the total adds up to 100%.') })
  if (n > 6) out.push({ type: 'line', grouping: 'clustered', why: t('A line chart shows trends over time (years, months, days) or categories.') })
  out.push({ type: 'bar', grouping: 'clustered', why: t('A clustered bar chart compares values across categories with long labels.') })
  if (data.series.length > 1) out.push({ type: 'column', grouping: 'stacked', why: t('A stacked column chart compares parts of a whole across categories.') })
  if (data.series.length > 1) out.push({ type: 'combo', grouping: 'clustered', why: t('A combo chart highlights different kinds of information with columns and lines.') })
  if (!out.some((o) => o.type === 'line')) out.push({ type: 'line', grouping: 'clustered', why: t('A line chart shows trends over time.') })
  return out
}

export function InsertChartDialog({ onClose, data }: P & { data?: unknown }) {
  const app = useApp()
  const doc = app.doc
  const changing = typeof data === 'number' ? (doc.sheet.x.objects.find((o) => o.id === data) as ChartDef | undefined) : undefined
  const source = changing?.source ?? (typeof data === 'string' && data !== 'quick' && data !== 'sheet' ? data : selectionSource(app))
  const recs = useMemo(() => recommended(app, source), [app, source])
  const [tab, setTab] = useState<'rec' | 'all'>(changing ? 'all' : 'rec')
  const [type, setType] = useState<ChartType>(changing?.type ?? recs[0].type)
  const [grouping, setGrouping] = useState<ChartGrouping>(changing?.grouping ?? recs[0].grouping)
  const preview = useMemo(() => {
    const c = { ...(changing ?? newChart(doc, type, grouping, source)), type, grouping, markers: type === 'line' || type === 'scatter' } as ChartDef
    if (type === 'combo' && !c.series) c.series = deriveSeries(doc.wb, doc.engine, source, undefined).series.map((s, i) => ({ ...s, type: i === 0 ? 'column' : 'line' }))
    return renderChartSVG(c, chartData(doc.wb, doc.engine, c), 420, 250)
  }, [doc, type, grouping, source, changing])
  const ok = () => {
    onClose()
    if (changing) {
      const patch: Partial<ChartDef> = { type, grouping, markers: type === 'line' || type === 'scatter' || type === 'radar' }
      if (type === 'combo' && !changing.series) patch.series = chartSeries(doc.wb, doc.engine, changing).map((s, i) => ({ ...s, type: i === 0 ? 'column' : 'line' }))
      if (type === 'pie' || type === 'doughnut') patch.gridlines = { major: false, minor: false, vertical: false }
      updateChart(doc, changing.id, patch, t('Change Chart Type'))
    } else insertChart(app, type, grouping, source, data === 'sheet')
  }
  if (data === 'quick' || data === 'sheet') {
    // Alt+F1 / F11 insert the default chart right away
    queueMicrotask(() => {
      onClose()
      insertChart(app, 'column', 'clustered', source, data === 'sheet')
    })
    return null
  }
  const kind = CHART_KINDS.find((k) => k.type === type)
  return (
    <Modal title={changing ? t('Change Chart Type') : t('Insert Chart')} onClose={onClose} width={760} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <DialogTabs tabs={[{ id: 'rec', label: t('Recommended Charts') }, { id: 'all', label: t('All Charts') }]} active={tab} onChange={setTab} />
      <div className="chart-dlg">
        <div className="chart-dlg-list">
          {tab === 'rec'
            ? recs.map((r, i) => (
                <button key={i} type="button" className={cls('chart-dlg-item', type === r.type && grouping === r.grouping && 'is-active')} onClick={() => { setType(r.type); setGrouping(r.grouping) }}>
                  <span dangerouslySetInnerHTML={{ __html: chartTypeIcon(r.type, r.grouping) }} />
                  {subtypeName(r.type, r.grouping)}
                </button>
              ))
            : CHART_KINDS.map((k) => (
                <button key={k.type} type="button" className={cls('chart-dlg-item', type === k.type && 'is-active')} onClick={() => { setType(k.type); setGrouping('clustered') }}>
                  <span dangerouslySetInnerHTML={{ __html: chartTypeIcon(k.type, 'clustered') }} />
                  {t(k.label)}
                </button>
              ))}
        </div>
        <div className="chart-dlg-main">
          {kind?.groupings && (
            <div className="chart-dlg-subtypes">
              {kind.groupings.map((g) => (
                <button key={g} type="button" className={cls('chart-sub', grouping === g && 'is-active')} title={subtypeName(type, g)} onClick={() => setGrouping(g)}>
                  <span dangerouslySetInnerHTML={{ __html: chartTypeIcon(type, g) }} />
                </button>
              ))}
            </div>
          )}
          <div className="chart-dlg-title">{subtypeName(type, grouping)}</div>
          <div className="chart-dlg-preview" dangerouslySetInnerHTML={{ __html: preview }} />
          {tab === 'rec' && <p className="dlg-hint">{recs.find((r) => r.type === type && r.grouping === grouping)?.why}</p>}
        </div>
      </div>
    </Modal>
  )
}

export function SelectDataDialog({ onClose, data }: P & { data?: unknown }) {
  const app = useApp()
  const doc = app.doc
  const chart = doc.sheet.x.objects.find((o) => o.id === data) as ChartDef | undefined
  const [source, setSource] = useState(chart?.source ?? '')
  const [series, setSeries] = useState<ChartSeries[]>(() => (chart ? chartSeries(doc.wb, doc.engine, chart).map((s) => ({ ...s })) : []))
  const [sel, setSel] = useState(0)
  const [byRow, setByRow] = useState(!!chart?.byRow)
  if (!chart) return null
  const reloadFrom = (src: string, rows: boolean) => {
    const d = deriveSeries(doc.wb, doc.engine, src, rows, chart.type === 'scatter')
    setSeries(d.series)
    setSel(0)
  }
  const cur = series[sel]
  const setCur = (patch: Partial<ChartSeries>) => setSeries(series.map((s, i) => (i === sel ? { ...s, ...patch } : s)))
  const ok = () => {
    if (!parseRef(app, source)) return app.alert(t('The chart data range is not valid.'))
    updateChart(doc, chart.id, { source, byRow, series }, t('Select Data'))
    onClose()
  }
  return (
    <Modal title={t('Select Data Source')} onClose={onClose} width={640} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="form">
        <label>
          {t('Chart data range:')}
          <input value={source} onChange={(e) => setSource(e.target.value)} onBlur={() => parseRef(app, source) && source !== chart.source && reloadFrom(source, byRow)} />
        </label>
      </div>
      <div className="dlg-inline">
        <button type="button" className="btn" onClick={() => { setByRow(!byRow); reloadFrom(source, !byRow) }}>{t('Switch Row/Column')}</button>
      </div>
      <div className="sd-cols">
        <fieldset className="dlg-fieldset">
          <legend>{t('Legend Entries (Series)')}</legend>
          <div className="sd-actions">
            <button type="button" className="btn btn-small" onClick={() => { setSeries([...series, { name: `Series${series.length + 1}`, values: '' }]); setSel(series.length) }}><Plus size={12} />{' '}{t('Add')}</button>
            <button type="button" className="btn btn-small" disabled={!cur} onClick={() => { setSeries(series.filter((_, i) => i !== sel)); setSel(Math.max(0, sel - 1)) }}><Trash2 size={12} />{' '}{t('Remove')}</button>
            <button type="button" className="btn btn-small" disabled={sel === 0} onClick={() => { const s = series.slice(); [s[sel - 1], s[sel]] = [s[sel], s[sel - 1]]; setSeries(s); setSel(sel - 1) }}><ArrowUp size={12} /></button>
            <button type="button" className="btn btn-small" disabled={sel >= series.length - 1} onClick={() => { const s = series.slice(); [s[sel + 1], s[sel]] = [s[sel], s[sel + 1]]; setSeries(s); setSel(sel + 1) }}><ArrowDown size={12} /></button>
          </div>
          <select size={6} value={sel} onChange={(e) => setSel(Number(e.target.value))}>
            {series.map((s, i) => (
              <option key={i} value={i}>{chartData(doc.wb, doc.engine, { ...chart, series: [s] }).series[0]?.name ?? s.name}</option>
            ))}
          </select>
        </fieldset>
        <fieldset className="dlg-fieldset">
          <legend>{t('Edit Series')}</legend>
          {cur ? (
            <div className="form">
              <label>{t('Series name:')}{' '}<input value={cur.name ?? ''} onChange={(e) => setCur({ name: e.target.value })} /></label>
              <label>{t('Series values:')}{' '}<input value={cur.values} onChange={(e) => setCur({ values: e.target.value })} /></label>
              <label>{chart.type === 'scatter' ? t('Series X values:') : t('Axis labels (categories):')} <input value={cur.categories ?? ''} onChange={(e) => setCur({ categories: e.target.value || undefined })} /></label>
            </div>
          ) : (
            <p className="dlg-hint">{t('Add a series to edit it.')}</p>
          )}
        </fieldset>
      </div>
    </Modal>
  )
}

export function MoveChartDialog({ onClose, data }: P & { data?: unknown }) {
  const app = useApp()
  const doc = app.doc
  const chart = doc.sheet.x.objects.find((o) => o.id === data) as ChartDef | undefined
  const [where, setWhere] = useState<'new' | 'object'>('object')
  const [name, setName] = useState(() => {
    for (let i = 1; ; i++) if (!doc.wb.sheetByName(`Chart${i}`)) return `Chart${i}`
  })
  const [target, setTarget] = useState(doc.sheet.id)
  if (!chart) return null
  const ok = () => {
    const from = doc.sheet
    if (where === 'new' && doc.wb.sheetByName(name)) return app.alert(t('A sheet with this name already exists.'))
    doc.transact(tx('Move Chart'), () => {
      doc.noteWorkbook()
      doc.noteProps(from)
      let dest = doc.wb.sheetById(target)!
      if (where === 'new') {
        dest = doc.wb.addSheet(name, doc.activeIndex + 1)
      }
      doc.noteProps(dest)
      from.x.objects = from.x.objects.filter((o) => o.id !== chart.id)
      const moved = { ...chart, anchor: where === 'new' ? { x: 8, y: 8, w: 900, h: 560 } : chart.anchor, chartSheet: where === 'new' || undefined }
      dest.x.objects = [...dest.x.objects, moved]
      doc.activeIndex = doc.wb.sheets.indexOf(dest)
    })
    doc.selObj = chart.id
    doc.selObjs = []
    doc.emit()
    onClose()
  }
  return (
    <Modal title={t('Move Chart')} onClose={onClose} width={420} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="form">
        <label className="check-item">
          <input type="radio" checked={where === 'new'} onChange={() => setWhere('new')} />{' '}{t('New sheet:')}
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={where !== 'new'} />
        </label>
        <label className="check-item">
          <input type="radio" checked={where === 'object'} onChange={() => setWhere('object')} />{' '}{t('Object in:')}
          <select value={target} onChange={(e) => setTarget(Number(e.target.value))} disabled={where !== 'object'}>
            {doc.wb.sheets.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  )
}

// ---------- tables ----------

export function CreateTableDialog({ onClose, data }: P & { data?: unknown }) {
  const app = useApp()
  const doc = app.doc
  const s = suggestTableRange(doc)
  const [ref, setRef] = useState('=' + rangeName(s.range).replace(/([A-Z]+)(\d+)/g, '$$$1$$$2'))
  const [header, setHeader] = useState(s.header)
  const ok = () => {
    const res = parseRef(app, ref)
    if (!res) return app.alert(t('The reference isn’t valid.'))
    const err = createTable(doc, res.range, header, typeof data === 'string' ? data : DEFAULT_TABLE_STYLE)
    if (err) return app.alert(err)
    onClose()
    app.setTab('tableDesign')
  }
  return (
    <Modal title={t('Create Table')} onClose={onClose} width={340} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="form">
        <label>{t('Where is the data for your table?')}{' '}<input autoFocus value={ref} onChange={(e) => setRef(e.target.value)} /></label>
        <label className="check-item"><input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} />{' '}{t('My table has headers')}</label>
      </div>
    </Modal>
  )
}

export function ResizeTableDialog({ onClose, data }: P & { data?: unknown }) {
  const app = useApp()
  const doc = app.doc
  const table = doc.sheet.x.tables.find((x) => x.id === data)
  const [ref, setRef] = useState(table ? '=' + rangeName(table.range).replace(/([A-Z]+)(\d+)/g, '$$$1$$$2') : '')
  if (!table) return null
  const ok = () => {
    const res = parseRef(app, ref)
    if (!res) return app.alert(t('The reference isn’t valid.'))
    const err = resizeTable(doc, table.id, res.range)
    if (err) return app.alert(err)
    onClose()
  }
  return (
    <Modal title={t('Resize Table')} onClose={onClose} width={360} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="form">
        <label>{t('Select the new data range for your table:')}{' '}<input autoFocus value={ref} onChange={(e) => setRef(e.target.value)} /></label>
        <p className="dlg-hint">{t('The headers must remain in the same row, and the resulting table range must overlap the original table range.')}</p>
      </div>
    </Modal>
  )
}

// ---------- PivotTables ----------

export function CreatePivotDialog({ onClose, data }: P & { data?: unknown }) {
  const app = useApp()
  const doc = app.doc
  const [source, setSource] = useState(typeof data === 'string' ? data : selectionSource(app))
  const [where, setWhere] = useState<'new' | 'existing'>('new')
  const [loc, setLoc] = useState('')
  const ok = () => {
    const res = parseRef(app, source)
    if (!res || res.range.r2 <= res.range.r1) return app.alert(t('The data range must have a header row and at least one row of data.'))
    let target: Parameters<typeof createPivot>[2] = { sheet: 'new', r: 2, c: 0 }
    if (where === 'existing') {
      const l = parseRef(app, loc || 'A1')
      if (!l) return app.alert(t('The destination reference is not valid.'))
      target = { sheet: l.sheet, r: l.range.r1, c: l.range.c1 }
    }
    const err = createPivot(doc, absRef(res.sheet, res.range), target)
    if (err) return app.alert(err)
    onClose()
    app.setPane('pivot')
    app.setTab('pivotAnalyze')
  }
  return (
    <Modal title={t('Create PivotTable')} onClose={onClose} width={420} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="form">
        <label>{t('Table/Range:')}{' '}<input autoFocus value={source} onChange={(e) => setSource(e.target.value)} /></label>
        <fieldset className="dlg-fieldset">
          <legend>{t('Choose where you want the PivotTable to be placed')}</legend>
          <label className="check-item"><input type="radio" checked={where === 'new'} onChange={() => setWhere('new')} />{' '}{t('New Worksheet')}</label>
          <label className="check-item"><input type="radio" checked={where === 'existing'} onChange={() => setWhere('existing')} />{' '}{t('Existing Worksheet')}</label>
          {where === 'existing' && <label>{t('Location:')}{' '}<input value={loc} placeholder={`${doc.sheet.name}!$A$1`} onChange={(e) => setLoc(e.target.value)} /></label>}
        </fieldset>
      </div>
    </Modal>
  )
}

export function PivotSourceDialog({ onClose, data, move }: P & { data?: unknown; move?: boolean }) {
  const app = useApp()
  const doc = app.doc
  const p = doc.wb.sheets.flatMap((s) => s.x.pivots).find((x) => x.id === data)
  const [text, setText] = useState(p ? (move ? `${colName(p.c)}${p.r + 1}` : p.source) : '')
  if (!p) return null
  const ok = () => {
    const res = parseRef(app, text)
    if (!res) return app.alert(t('The reference is not valid.'))
    updatePivot(doc, p.id, (x) => {
      if (move) {
        x.r = res.range.r1
        x.c = res.range.c1
      } else x.source = absRef(res.sheet, res.range)
    }, move ? t('Move PivotTable') : t('Change Data Source'))
    onClose()
  }
  return (
    <Modal title={move ? t('Move PivotTable') : t('Change PivotTable Data Source')} onClose={onClose} width={380} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="form">
        <label>{move ? t('Location:') : t('Table/Range:')} <input autoFocus value={text} onChange={(e) => setText(e.target.value)} /></label>
      </div>
    </Modal>
  )
}

// ---------- filters ----------

export function CustomFilterDialog({ onClose, data }: P & { data?: unknown }) {
  const app = useApp()
  const d = data as { target: FilterTarget; col: number; op: FilterOp }
  const [op1, setOp1] = useState<FilterOp>(d.op)
  const [v1, setV1] = useState('')
  const [and, setAnd] = useState(true)
  const [op2, setOp2] = useState<FilterOp>(d.op === 'ge' ? 'le' : 'eq')
  const [v2, setV2] = useState('')
  const ops: [FilterOp, string][] = [...NUMBER_OPS, ...TEXT_OPS.filter(([o]) => o !== 'eq' && o !== 'ne'), ['notBegins', tx('Does Not Begin With')], ['notEnds', tx('Does Not End With')]]
  const ok = () => {
    setColumnFilter(app.doc, d.target, d.col, { kind: 'custom', and, c1: { op: op1, value: v1 }, c2: v2 ? { op: op2, value: v2 } : undefined })
    onClose()
  }
  const row = (op: FilterOp, setOp: (o: FilterOp) => void, v: string, setV: (s: string) => void) => (
    <div className="dlg-inline">
      <select value={op} onChange={(e) => setOp(e.target.value as FilterOp)}>
        {ops.map(([o, l]) => (
          <option key={o} value={o}>{t(l).toLowerCase()}</option>
        ))}
      </select>
      <input value={v} onChange={(e) => setV(e.target.value)} />
    </div>
  )
  return (
    <Modal title={t('Custom AutoFilter')} onClose={onClose} width={460} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <p className="dlg-hint">{t('Show rows where:')}</p>
      {row(op1, setOp1, v1, setV1)}
      <div className="dlg-inline">
        <label className="check-item"><input type="radio" checked={and} onChange={() => setAnd(true)} />{' '}{t('And')}</label>
        <label className="check-item"><input type="radio" checked={!and} onChange={() => setAnd(false)} />{' '}{t('Or')}</label>
      </div>
      {row(op2, setOp2, v2, setV2)}
      <p className="dlg-hint">{t('Use ? to represent any single character. Use * to represent any series of characters.')}</p>
    </Modal>
  )
}

export function Top10Dialog({ onClose, data }: P & { data?: unknown }) {
  const app = useApp()
  const d = data as { target: FilterTarget; col: number }
  const [top, setTop] = useState(true)
  const [n, setN] = useState(10)
  const [percent, setPercent] = useState(false)
  const ok = () => {
    setColumnFilter(app.doc, d.target, d.col, { kind: 'top10', top, n: Math.max(1, n), percent })
    onClose()
  }
  return (
    <Modal title={t('Top 10 AutoFilter')} onClose={onClose} width={380} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="dlg-inline">
        <select value={top ? 'top' : 'bottom'} onChange={(e) => setTop(e.target.value === 'top')}>
          <option value="top">{t('Top')}</option>
          <option value="bottom">{t('Bottom')}</option>
        </select>
        <input type="number" min={1} max={500} value={n} onChange={(e) => setN(Number(e.target.value))} style={{ width: 70 }} />
        <select value={percent ? 'p' : 'i'} onChange={(e) => setPercent(e.target.value === 'p')}>
          <option value="i">{t('Items')}</option>
          <option value="p">{t('Percent')}</option>
        </select>
      </div>
    </Modal>
  )
}

// ---------- conditional formatting ----------

export type CFQuickKind = 'greaterThan' | 'lessThan' | 'between' | 'equal' | 'text' | 'date' | 'duplicate' | 'top' | 'bottom' | 'topPct' | 'bottomPct' | 'aboveAvg' | 'belowAvg'

const QUICK_TITLES: Record<CFQuickKind, [string, string]> = {
  greaterThan: [tx('Greater Than'), tx('Format cells that are GREATER THAN:')],
  lessThan: [tx('Less Than'), tx('Format cells that are LESS THAN:')],
  between: [tx('Between'), tx('Format cells that are BETWEEN:')],
  equal: [tx('Equal To'), tx('Format cells that are EQUAL TO:')],
  text: [tx('Text That Contains'), tx('Format cells that contain the text:')],
  date: [tx('A Date Occurring'), tx('Format cells that contain a date occurring:')],
  duplicate: [tx('Duplicate Values'), tx('Format cells that contain:')],
  top: [tx('Top 10 Items'), tx('Format cells that rank in the TOP:')],
  bottom: [tx('Bottom 10 Items'), tx('Format cells that rank in the BOTTOM:')],
  topPct: [tx('Top 10%'), tx('Format cells that rank in the TOP:')],
  bottomPct: [tx('Bottom 10%'), tx('Format cells that rank in the BOTTOM:')],
  aboveAvg: [tx('Above Average'), tx('Format cells that are ABOVE AVERAGE:')],
  belowAvg: [tx('Below Average'), tx('Format cells that are BELOW AVERAGE:')],
}

const PERIODS: [DatePeriod, string][] = [
  ['yesterday', tx('Yesterday')], ['today', tx('Today')], ['tomorrow', tx('Tomorrow')], ['last7Days', tx('In the last 7 days')], ['lastWeek', tx('Last week')], ['thisWeek', tx('This week')],
  ['nextWeek', tx('Next week')], ['lastMonth', tx('Last month')], ['thisMonth', tx('This month')], ['nextMonth', tx('Next month')],
]

function suggestValue(app: ReturnType<typeof useApp>) {
  const doc = app.doc
  const nums: number[] = []
  for (const rg of doc.sel.ranges) {
    const b = doc.boundToUsed(rg)
    for (let r = b.r1; r <= Math.min(b.r2, b.r1 + 2000); r++)
      for (let c = b.c1; c <= Math.min(b.c2, b.c1 + 50); c++) {
        const v = doc.value(r, c)
        if (typeof v === 'number') nums.push(v)
      }
  }
  if (!nums.length) return '0'
  nums.sort((a, b) => a - b)
  return String(+nums[Math.floor(nums.length / 2)].toPrecision(6))
}

export function CFQuickDialog({ onClose, data }: P & { data?: unknown }) {
  const app = useApp()
  const kind = data as CFQuickKind
  const [title, prompt] = QUICK_TITLES[kind].map((s) => t(s))
  const [v1, setV1] = useState(kind === 'top' || kind === 'bottom' || kind === 'topPct' || kind === 'bottomPct' ? '10' : kind === 'text' ? '' : suggestValue(app))
  const [v2, setV2] = useState(suggestValue(app))
  const [period, setPeriod] = useState<DatePeriod>('yesterday')
  const [dup, setDup] = useState<'duplicate' | 'unique'>('duplicate')
  const [preset, setPreset] = useState(0)
  const ranges = app.doc.sel.ranges.map((r) => app.doc.boundToUsed(r))
  const lit = (s: string) => (s.startsWith('=') ? s.slice(1) : s.trim() !== '' && Number.isFinite(Number(s)) ? s : `"${s.replace(/"/g, '""')}"`)
  const ok = () => {
    const style: CFStyle = CF_PRESETS[preset].style
    const base = { ranges, stop: false, style }
    let rule: NewCFRule
    switch (kind) {
      case 'greaterThan': rule = { ...base, type: 'cellIs', op: 'greaterThan', f1: lit(v1) }; break
      case 'lessThan': rule = { ...base, type: 'cellIs', op: 'lessThan', f1: lit(v1) }; break
      case 'between': rule = { ...base, type: 'cellIs', op: 'between', f1: lit(v1), f2: lit(v2) }; break
      case 'equal': rule = { ...base, type: 'cellIs', op: 'equal', f1: lit(v1) }; break
      case 'text': rule = { ...base, type: 'text', op: 'contains', text: v1 }; break
      case 'date': rule = { ...base, type: 'date', period }; break
      case 'duplicate': rule = { ...base, type: dup }; break
      case 'top': rule = { ...base, type: 'top', bottom: false, rank: Number(v1) || 10, percent: false }; break
      case 'bottom': rule = { ...base, type: 'top', bottom: true, rank: Number(v1) || 10, percent: false }; break
      case 'topPct': rule = { ...base, type: 'top', bottom: false, rank: Number(v1) || 10, percent: true }; break
      case 'bottomPct': rule = { ...base, type: 'top', bottom: true, rank: Number(v1) || 10, percent: true }; break
      case 'aboveAvg': rule = { ...base, type: 'average', above: true, equal: false }; break
      default: rule = { ...base, type: 'average', above: false, equal: false }
    }
    addRule(app.doc, rule)
    onClose()
  }
  return (
    <Modal title={title} onClose={onClose} width={480} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <p className="dlg-hint">{prompt}</p>
      <div className="dlg-inline">
        {(kind === 'greaterThan' || kind === 'lessThan' || kind === 'equal' || kind === 'between' || kind === 'text') && <input autoFocus value={v1} onChange={(e) => setV1(e.target.value)} />}
        {kind === 'between' && <span>{t('and')}</span>}
        {kind === 'between' && <input value={v2} onChange={(e) => setV2(e.target.value)} />}
        {(kind === 'top' || kind === 'bottom' || kind === 'topPct' || kind === 'bottomPct') && <input type="number" min={1} value={v1} onChange={(e) => setV1(e.target.value)} style={{ width: 70 }} />}
        {(kind === 'topPct' || kind === 'bottomPct') && <span>%</span>}
        {kind === 'date' && (
          <select value={period} onChange={(e) => setPeriod(e.target.value as DatePeriod)}>
            {PERIODS.map(([p, l]) => (
              <option key={p} value={p}>{t(l)}</option>
            ))}
          </select>
        )}
        {kind === 'duplicate' && (
          <select value={dup} onChange={(e) => setDup(e.target.value as 'duplicate' | 'unique')}>
            {/* "{values}" is always empty: these keys are adjectives here ("Duplicate" alone is the command). */}
            <option value="duplicate">{t('Duplicate {values}', { values: '' }).trim()}</option>
            <option value="unique">{t('Unique {values}', { values: '' }).trim()}</option>
          </select>
        )}
        <span>{t('with')}</span>
        <select value={preset} onChange={(e) => setPreset(Number(e.target.value))}>
          {CF_PRESETS.map((p, i) => (
            <option key={i} value={i}>{t(p.label)}</option>
          ))}
        </select>
      </div>
    </Modal>
  )
}

const RULE_TYPES = [
  ['all', tx('Format all cells based on their values')],
  ['cell', tx('Format only cells that contain')],
  ['top', tx('Format only top or bottom ranked values')],
  ['avg', tx('Format only values that are above or below average')],
  ['unique', tx('Format only unique or duplicate values')],
  ['formula', tx('Use a formula to determine which cells to format')],
] as const

type RuleKind = (typeof RULE_TYPES)[number][0]

function FormatPicker({ style, onChange }: { style: CFStyle; onChange: (s: CFStyle) => void }) {
  return (
    <div className="cf-format">
      <label>{t('Fill')}{' '}<input type="color" value={style.fill ?? '#ffffff'} onChange={(e) => onChange({ ...style, fill: e.target.value.toUpperCase() })} /></label>
      <label>{t('Font')}{' '}<input type="color" value={style.color ?? '#000000'} onChange={(e) => onChange({ ...style, color: e.target.value.toUpperCase() })} /></label>
      <label className="check-item"><input type="checkbox" checked={!!style.bold} onChange={(e) => onChange({ ...style, bold: e.target.checked || undefined })} />{' '}{t('Bold')}</label>
      <label className="check-item"><input type="checkbox" checked={!!style.italic} onChange={(e) => onChange({ ...style, italic: e.target.checked || undefined })} />{' '}{t('Italic')}</label>
      <label className="check-item"><input type="checkbox" checked={!!style.underline} onChange={(e) => onChange({ ...style, underline: e.target.checked || undefined })} />{' '}{t('Underline')}</label>
      <label className="check-item"><input type="checkbox" checked={!!style.strike} onChange={(e) => onChange({ ...style, strike: e.target.checked || undefined })} />{' '}{t('Strikethrough')}</label>
      <label className="check-item"><input type="checkbox" checked={!!style.border} onChange={(e) => onChange({ ...style, border: e.target.checked ? '#000000' : undefined })} />{' '}{t('Border')}</label>
      <label>{t('Number format')}{' '}<input value={style.fmt ?? ''} placeholder={t('General')} onChange={(e) => onChange({ ...style, fmt: e.target.value || undefined })} style={{ width: 110 }} /></label>
      <button type="button" className="btn btn-small" onClick={() => onChange({})}>{t('Clear')}</button>
      <span className="cf-sample" style={{ background: style.fill, color: style.color, fontWeight: style.bold ? 700 : 400, fontStyle: style.italic ? 'italic' : undefined, textDecoration: `${style.underline ? 'underline' : ''} ${style.strike ? 'line-through' : ''}`, outline: style.border ? `1px solid ${style.border}` : undefined }}>AaBbCcYyZz</span>
    </div>
  )
}

function ruleKindOf(r: CFRule | undefined): RuleKind {
  if (!r) return 'cell'
  if (r.type === 'dataBar' || r.type === 'colorScale' || r.type === 'iconSet') return 'all'
  if (r.type === 'top') return 'top'
  if (r.type === 'average') return 'avg'
  if (r.type === 'duplicate' || r.type === 'unique') return 'unique'
  if (r.type === 'expression') return 'formula'
  return 'cell'
}

/** New Formatting Rule / Edit Formatting Rule. `data` is the rule being edited (or a preset type). */
export function CFRuleDialog({ onClose, data }: P & { data?: unknown }) {
  const app = useApp()
  const doc = app.doc
  const editing = data && typeof data === 'object' && 'id' in (data as object) ? (data as CFRule) : undefined
  const startKind = (typeof data === 'string' ? data : ruleKindOf(editing)) as RuleKind
  const [kind, setKind] = useState<RuleKind>(startKind)
  const [style, setStyle] = useState<CFStyle>(editing?.style ?? { fill: '#FFC7CE', color: '#9C0006' })
  // "all cells" visual rules
  const [visual, setVisual] = useState<'2scale' | '3scale' | 'bar' | 'icon'>(editing?.type === 'dataBar' ? 'bar' : editing?.type === 'iconSet' ? 'icon' : editing?.type === 'colorScale' && editing.stops.length === 2 ? '2scale' : '3scale')
  const [c1, setC1] = useState(editing?.type === 'colorScale' ? editing.stops[0].color : '#F8696B')
  const [c2, setC2] = useState(editing?.type === 'colorScale' ? editing.stops[1]?.color ?? '#FFEB84' : '#FFEB84')
  const [c3, setC3] = useState(editing?.type === 'colorScale' ? editing.stops[2]?.color ?? '#63BE7B' : '#63BE7B')
  const [barColor, setBarColor] = useState(editing?.type === 'dataBar' ? editing.color : DATA_BAR_COLORS[0])
  const [gradient, setGradient] = useState(editing?.type === 'dataBar' ? editing.gradient : true)
  const [barMin, setBarMin] = useState<CFValue>(editing?.type === 'dataBar' ? editing.min : { type: 'auto' })
  const [barMax, setBarMax] = useState<CFValue>(editing?.type === 'dataBar' ? editing.max : { type: 'auto' })
  const [barAxis, setBarAxis] = useState<'auto' | 'middle' | 'none'>(editing?.type === 'dataBar' ? editing.axis ?? 'auto' : 'auto')
  const [negColor, setNegColor] = useState(editing?.type === 'dataBar' ? editing.negColor ?? '#E04B3A' : '#E04B3A')
  const [axisColor, setAxisColor] = useState(editing?.type === 'dataBar' ? editing.axisColor ?? '#000000' : '#000000')
  const [iconSet, setIconSetRaw] = useState<IconSetId>(editing?.type === 'iconSet' ? editing.set : '3TrafficLights1')
  const [thresholds, setThresholds] = useState<CFValue[]>(editing?.type === 'iconSet' ? editing.thresholds : defaultThresholds('3TrafficLights1'))
  const setIconSet = (set: IconSetId) => {
    setIconSetRaw(set)
    if (ICON_COUNTS[set] !== thresholds.length + 1) setThresholds(defaultThresholds(set))
  }
  const [reverse, setReverse] = useState(editing?.type === 'iconSet' ? editing.reverse : false)
  const [showValue, setShowValue] = useState(editing && 'showValue' in editing ? editing.showValue : true)
  // cell value
  const [cellMode, setCellMode] = useState<'value' | 'text' | 'date' | 'blanks' | 'noBlanks' | 'errors' | 'noErrors'>(
    editing?.type === 'text' ? 'text' : editing?.type === 'date' ? 'date' : editing?.type === 'blanks' || editing?.type === 'noBlanks' || editing?.type === 'errors' || editing?.type === 'noErrors' ? editing.type : 'value',
  )
  const [op, setOp] = useState<CellOp>(editing?.type === 'cellIs' ? editing.op : 'between')
  const [f1, setF1] = useState(editing?.type === 'cellIs' ? '=' + editing.f1 : '')
  const [f2, setF2] = useState(editing?.type === 'cellIs' ? '=' + (editing.f2 ?? '') : '')
  const [textOp, setTextOp] = useState<'contains' | 'notContains' | 'beginsWith' | 'endsWith'>(editing?.type === 'text' ? editing.op : 'contains')
  const [text, setText] = useState(editing?.type === 'text' ? editing.text : '')
  const [period, setPeriod] = useState<DatePeriod>(editing?.type === 'date' ? editing.period : 'yesterday')
  const [bottom, setBottom] = useState(editing?.type === 'top' ? editing.bottom : false)
  const [rank, setRank] = useState(editing?.type === 'top' ? editing.rank : 10)
  const [pct, setPct] = useState(editing?.type === 'top' ? editing.percent : false)
  const [above, setAbove] = useState(editing?.type === 'average' ? editing.above : true)
  const [uniq, setUniq] = useState<'duplicate' | 'unique'>(editing?.type === 'unique' ? 'unique' : 'duplicate')
  const [formula, setFormula] = useState(editing?.type === 'expression' ? '=' + editing.formula : '=')
  const strip = (s: string) => (s.startsWith('=') ? s.slice(1) : s.trim() !== '' && Number.isFinite(Number(s)) ? s : `"${s.replace(/"/g, '""')}"`)
  const build = (): NewCFRule | null => {
    const ranges = editing?.ranges ?? doc.sel.ranges.map((r) => doc.boundToUsed(r))
    const base = { ranges, stop: editing?.stop ?? false }
    switch (kind) {
      case 'all': {
        if (visual === 'bar')
          return { ...base, type: 'dataBar', color: barColor, gradient, min: barMin, max: barMax, showValue, ...(barAxis !== 'auto' ? { axis: barAxis } : {}), negColor, axisColor }
        if (visual === 'icon') return { ...base, type: 'iconSet', set: iconSet, reverse, showValue, thresholds }
        const stops: { v: CFValue; color: string }[] = visual === '2scale' ? [{ v: { type: 'min' }, color: c1 }, { v: { type: 'max' }, color: c3 }] : [{ v: { type: 'min' }, color: c1 }, { v: { type: 'percentile', value: 50 }, color: c2 }, { v: { type: 'max' }, color: c3 }]
        return { ...base, type: 'colorScale', stops }
      }
      case 'cell':
        if (cellMode === 'value') return { ...base, style, type: 'cellIs', op, f1: strip(f1), f2: op === 'between' || op === 'notBetween' ? strip(f2) : undefined }
        if (cellMode === 'text') return { ...base, style, type: 'text', op: textOp, text }
        if (cellMode === 'date') return { ...base, style, type: 'date', period }
        return { ...base, style, type: cellMode }
      case 'top': return { ...base, style, type: 'top', bottom, rank: Math.max(1, rank), percent: pct }
      case 'avg': return { ...base, style, type: 'average', above, equal: false }
      case 'unique': return { ...base, style, type: uniq }
      case 'formula': return formula.length > 1 ? { ...base, style, type: 'expression', formula: formula.replace(/^=/, '') } : null
    }
  }
  const ok = () => {
    const rule = build()
    if (!rule) return app.alert(t('Enter a formula.'))
    if (editing) setRules(doc, doc.sheet.x.cf.map((r) => (r.id === editing.id ? ({ ...rule, id: r.id, priority: r.priority } as CFRule) : r)))
    else addRule(doc, rule)
    onClose()
  }
  return (
    <Modal title={editing ? t('Edit Formatting Rule') : t('New Formatting Rule')} onClose={onClose} width={560} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <p className="dlg-hint">{t('Select a Rule Type:')}</p>
      <div className="rule-types">
        {RULE_TYPES.map(([k, label]) => (
          <button key={k} type="button" className={cls('rule-type', kind === k && 'is-active')} onClick={() => setKind(k)}>► {t(label)}</button>
        ))}
      </div>
      <fieldset className="dlg-fieldset">
        <legend>{t('Edit the Rule Description')}</legend>
        {kind === 'all' && (
          <div className="form">
            <label>{t('Format Style:')}
              <select value={visual} onChange={(e) => setVisual(e.target.value as typeof visual)}>
                <option value="2scale">{t('2-Color Scale')}</option>
                <option value="3scale">{t('3-Color Scale')}</option>
                <option value="bar">{t('Data Bar')}</option>
                <option value="icon">{t('Icon Sets')}</option>
              </select>
            </label>
            {(visual === '2scale' || visual === '3scale') && (
              <div className="dlg-inline">
                <label>{t('Minimum')}{' '}<input type="color" value={c1} onChange={(e) => setC1(e.target.value)} /></label>
                {visual === '3scale' && <label>{t('Midpoint')}{' '}<input type="color" value={c2} onChange={(e) => setC2(e.target.value)} /></label>}
                <label>{t('Maximum')}{' '}<input type="color" value={c3} onChange={(e) => setC3(e.target.value)} /></label>
              </div>
            )}
            {visual === 'bar' && (
              <div className="dlg-inline">
                <label>{t('Bar color')}{' '}<input type="color" value={barColor} onChange={(e) => setBarColor(e.target.value)} /></label>
                <label className="check-item"><input type="checkbox" checked={gradient} onChange={(e) => setGradient(e.target.checked)} />{' '}{t('Gradient fill')}</label>
              </div>
            )}
            {visual === 'bar' && (
              <div className="form">
                <CFValueInput label={t('Minimum:')} value={barMin} onChange={setBarMin} allowAuto />
                <CFValueInput label={t('Maximum:')} value={barMax} onChange={setBarMax} allowAuto />
                <div className="dlg-inline">
                  <label>
                    {t('Axis position:')}{' '}
                    <select value={barAxis} onChange={(e) => setBarAxis(e.target.value as typeof barAxis)}>
                      <option value="auto">{t('Automatic (display at variable position based on negative values)')}</option>
                      <option value="middle">{t('Cell midpoint')}</option>
                      <option value="none">{t('None (show negative value bars in same direction as positive)')}</option>
                    </select>
                  </label>
                </div>
                <div className="dlg-inline">
                  <label>{t('Negative bar fill color:')} <input type="color" value={negColor} onChange={(e) => setNegColor(e.target.value.toUpperCase())} /></label>
                  <label>{t('Axis color:')} <input type="color" value={axisColor} onChange={(e) => setAxisColor(e.target.value.toUpperCase())} /></label>
                </div>
              </div>
            )}
            {visual === 'icon' && (
              <div className="dlg-inline">
                <select value={iconSet} onChange={(e) => setIconSet(e.target.value as IconSetId)}>
                  {ICON_SETS.map((s) => (
                    <option key={s.id} value={s.id}>{t(s.label)}</option>
                  ))}
                </select>
                <label className="check-item"><input type="checkbox" checked={reverse} onChange={(e) => setReverse(e.target.checked)} />{' '}{t('Reverse Icon Order')}</label>
              </div>
            )}
            {visual === 'icon' && (
              <div className="form">
                {thresholds.map((th, i) => (
                  <CFValueInput
                    key={i}
                    label={t('Icon {n} when value is >=', { n: ICON_COUNTS[iconSet] - 1 - i })}
                    value={th}
                    onChange={(v) => setThresholds(thresholds.map((x, j) => (j === i ? v : x)))}
                  />
                ))}
              </div>
            )}
            {(visual === 'bar' || visual === 'icon') && (
              <label className="check-item"><input type="checkbox" checked={!showValue} onChange={(e) => setShowValue(!e.target.checked)} />{' '}{t('Show')}{' '}{visual === 'bar' ? t('Bar') : t('Icon')}{' '}{t('Only')}</label>
            )}
          </div>
        )}
        {kind === 'cell' && (
          <div className="form">
            <div className="dlg-inline">
              <select value={cellMode} onChange={(e) => setCellMode(e.target.value as typeof cellMode)}>
                <option value="value">{t('Cell Value')}</option>
                <option value="text">{t('Specific Text')}</option>
                <option value="date">{t('Dates Occurring')}</option>
                <option value="blanks">{t('Blanks')}</option>
                <option value="noBlanks">{t('No Blanks')}</option>
                <option value="errors">{t('Errors')}</option>
                <option value="noErrors">{t('No Errors')}</option>
              </select>
              {cellMode === 'value' && (
                <>
                  <select value={op} onChange={(e) => setOp(e.target.value as CellOp)}>
                    {(['between', 'notBetween', 'equal', 'notEqual', 'greaterThan', 'lessThan', 'greaterThanOrEqual', 'lessThanOrEqual'] as CellOp[]).map((o) => (
                      <option key={o} value={o}>{o.replace(/([A-Z])/g, ' $1').toLowerCase()}</option>
                    ))}
                  </select>
                  <input value={f1} onChange={(e) => setF1(e.target.value)} style={{ width: 90 }} />
                  {(op === 'between' || op === 'notBetween') && <><span>{t('and')}</span><input value={f2} onChange={(e) => setF2(e.target.value)} style={{ width: 90 }} /></>}
                </>
              )}
              {cellMode === 'text' && (
                <>
                  <select value={textOp} onChange={(e) => setTextOp(e.target.value as typeof textOp)}>
                    <option value="contains">{t('containing')}</option>
                    <option value="notContains">{t('not containing')}</option>
                    <option value="beginsWith">{t('beginning with')}</option>
                    <option value="endsWith">{t('ending with')}</option>
                  </select>
                  <input value={text} onChange={(e) => setText(e.target.value)} />
                </>
              )}
              {cellMode === 'date' && (
                <select value={period} onChange={(e) => setPeriod(e.target.value as DatePeriod)}>
                  {PERIODS.map(([p, l]) => (
                    <option key={p} value={p}>{t(l)}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}
        {kind === 'top' && (
          <div className="dlg-inline">
            <select value={bottom ? 'b' : 't'} onChange={(e) => setBottom(e.target.value === 'b')}>
              <option value="t">{t('Top')}</option>
              <option value="b">{t('Bottom')}</option>
            </select>
            <input type="number" min={1} value={rank} onChange={(e) => setRank(Number(e.target.value))} style={{ width: 70 }} />
            <label className="check-item"><input type="checkbox" checked={pct} onChange={(e) => setPct(e.target.checked)} />{' '}{t('% of the selected range')}</label>
          </div>
        )}
        {kind === 'avg' && (
          <div className="dlg-inline">
            <span>{t('Format values that are')}</span>
            <select value={above ? 'a' : 'b'} onChange={(e) => setAbove(e.target.value === 'a')}>
              <option value="a">{t('above')}</option>
              <option value="b">{t('below')}</option>
            </select>
            <span>{t('the average for the selected range')}</span>
          </div>
        )}
        {kind === 'unique' && (
          <div className="dlg-inline">
            <span>{t('Format all:')}</span>
            <select value={uniq} onChange={(e) => setUniq(e.target.value as 'duplicate' | 'unique')}>
              <option value="duplicate">{t('duplicate')}</option>
              <option value="unique">{t('unique')}</option>
            </select>
            <span>{t('values in the selected range')}</span>
          </div>
        )}
        {kind === 'formula' && (
          <div className="form">
            <label>{t('Format values where this formula is true:')}{' '}<input value={formula} onChange={(e) => setFormula(e.target.value)} /></label>
          </div>
        )}
        {kind !== 'all' && (
          <>
            <p className="dlg-hint">{t('Format:')}</p>
            <FormatPicker style={style} onChange={setStyle} />
          </>
        )}
      </fieldset>
    </Modal>
  )
}

export function CFManageDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const [scope, setScope] = useState<'sel' | 'sheet'>('sel')
  const [rules, setLocal] = useState<CFRule[]>(() => [...doc.sheet.x.cf].sort((a, b) => a.priority - b.priority))
  const [sel, setSel] = useState<number | null>(null)
  const selRanges = doc.sel.ranges
  const touches = (r: CFRule) => r.ranges.some((a) => selRanges.some((b) => a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2))
  const shown = rules.filter((r) => scope === 'sheet' || touches(r))
  const move = (d: number) => {
    if (sel === null) return
    const i = rules.findIndex((r) => r.id === sel)
    const j = i + d
    if (j < 0 || j >= rules.length) return
    const next = rules.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    setLocal(next)
  }
  const ok = () => {
    setRules(doc, rules)
    onClose()
  }
  return (
    <Modal title={t('Conditional Formatting Rules Manager')} onClose={onClose} width={700} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="dlg-inline">
        <span>{t('Show formatting rules for:')}</span>
        <select value={scope} onChange={(e) => setScope(e.target.value as 'sel' | 'sheet')}>
          <option value="sel">{t('Current Selection')}</option>
          <option value="sheet">{t('This Worksheet')}</option>
        </select>
      </div>
      <div className="dlg-inline">
        <button type="button" className="btn" onClick={() => { setRules(doc, rules); onClose(); app.dialog({ kind: 'cfRule' }) }}><Plus size={13} />{' '}{t('New Rule…')}</button>
        <button type="button" className="btn" disabled={sel === null} onClick={() => { const r = rules.find((x) => x.id === sel); if (r) { setRules(doc, rules); onClose(); app.dialog({ kind: 'cfRule', data: r }) } }}>{t('Edit Rule…')}</button>
        <button type="button" className="btn" disabled={sel === null} onClick={() => { setLocal(rules.filter((r) => r.id !== sel)); setSel(null) }}><Trash2 size={13} />{' '}{t('Delete Rule')}</button>
        <button type="button" className="btn" disabled={sel === null} onClick={() => move(-1)}><ArrowUp size={13} /></button>
        <button type="button" className="btn" disabled={sel === null} onClick={() => move(1)}><ArrowDown size={13} /></button>
      </div>
      <table className="rules-table">
        <thead>
          <tr>
            <th>{t('Rule (applied in order shown)')}</th>
            <th>{t('Format')}</th>
            <th>{t('Applies to')}</th>
            <th>{t('Stop If True')}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id} className={sel === r.id ? 'is-active' : ''} onClick={() => setSel(r.id)}>
              <td>{describeRule(r)}</td>
              <td>
                <span className="cf-sample" style={{ background: r.type === 'colorScale' ? `linear-gradient(90deg, ${r.stops.map((s) => s.color).join(',')})` : r.type === 'dataBar' ? r.color : r.style?.fill, color: r.style?.color, fontWeight: r.style?.bold ? 700 : 400 }}>AaBbCcYyZz</span>
              </td>
              <td>
                <input
                  value={r.ranges.map((x) => rangeName(x)).join(',')}
                  onChange={(e) => {
                    const parts = e.target.value.split(',').map((p) => resolveRef(doc.wb, p, doc.sheet)?.range).filter((x): x is Range => !!x)
                    if (parts.length) setLocal(rules.map((x) => (x.id === r.id ? { ...x, ranges: parts } : x)))
                  }}
                />
              </td>
              <td>
                <input type="checkbox" checked={r.stop} onChange={(e) => setLocal(rules.map((x) => (x.id === r.id ? { ...x, stop: e.target.checked } : x)))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!shown.length && <p className="dlg-hint">{t('No rules to show.')}</p>}
    </Modal>
  )
}

// ---------- data validation ----------

export function ValidationDialog({ onClose }: P) {
  const app = useApp()
  const doc = app.doc
  const a = doc.sel.active
  const existing = validationAt(doc.sheet, a.r, a.c)
  const [tab, setTab] = useState<'settings' | 'input' | 'error'>('settings')
  const [type, setType] = useState<ValidationType>(existing?.type ?? 'any')
  const [op, setOp] = useState<CellOp>(existing?.op ?? 'between')
  const [f1, setF1] = useState(existing?.f1 ?? '')
  const [f2, setF2] = useState(existing?.f2 ?? '')
  const [blank, setBlank] = useState(existing?.allowBlank ?? true)
  const [dropdown, setDropdown] = useState(existing?.dropdown ?? true)
  const [showInput, setShowInput] = useState(existing?.showInput ?? true)
  const [inputTitle, setInputTitle] = useState(existing?.inputTitle ?? '')
  const [inputMessage, setInputMessage] = useState(existing?.inputMessage ?? '')
  const [showError, setShowError] = useState(existing?.showError ?? true)
  const [errorStyle, setErrorStyle] = useState<Validation['errorStyle']>(existing?.errorStyle ?? 'stop')
  const [errorTitle, setErrorTitle] = useState(existing?.errorTitle ?? '')
  const [errorMessage, setErrorMessage] = useState(existing?.errorMessage ?? '')
  const ranges = doc.sel.ranges.map((r) => doc.boundToUsed(r))
  const needs2 = op === 'between' || op === 'notBetween'
  const ok = () => {
    if (type === 'list' && !f1.trim()) return app.alert(t('You must enter a value for Source.'))
    if ((type === 'whole' || type === 'decimal' || type === 'date' || type === 'time' || type === 'textLength') && !f1.trim()) return app.alert(t('You must enter a value.'))
    if (type === 'custom' && !f1.trim()) return app.alert(t('You must enter a formula.'))
    setValidation(doc, ranges, { type, op, f1: f1.trim() || undefined, f2: needs2 ? f2.trim() || undefined : undefined, allowBlank: blank, dropdown, showInput, inputTitle, inputMessage, showError, errorStyle, errorTitle, errorMessage })
    onClose()
  }
  const label1 = type === 'list' ? t('Source:') : type === 'custom' ? t('Formula:') : needs2 ? t('Minimum:') : op.includes('greater') ? t('Minimum:') : op.includes('less') ? t('Maximum:') : t('Value:')
  return (
    <Modal
      title={t('Data Validation')}
      onClose={onClose}
      width={460}
      footer={<OkCancel onOk={ok} onCancel={onClose} extra={<button type="button" className="btn" onClick={() => { setValidation(doc, ranges, null); onClose() }}>{t('Clear All')}</button>} />}
    >
      <DialogTabs tabs={[{ id: 'settings', label: t('Settings') }, { id: 'input', label: t('Input Message') }, { id: 'error', label: t('Error Alert') }]} active={tab} onChange={setTab} />
      {tab === 'settings' && (
        <div className="form">
          <label>{t('Allow:')}
            <select value={type} onChange={(e) => setType(e.target.value as ValidationType)}>
              <option value="any">{t('Any value')}</option>
              <option value="whole">{t('Whole number')}</option>
              <option value="decimal">{t('Decimal')}</option>
              <option value="list">{t('List')}</option>
              <option value="date">{t('Date')}</option>
              <option value="time">{t('Time')}</option>
              <option value="textLength">{t('Text length')}</option>
              <option value="custom">{t('Custom')}</option>
            </select>
          </label>
          {type !== 'any' && <label className="check-item"><input type="checkbox" checked={blank} onChange={(e) => setBlank(e.target.checked)} />{' '}{t('Ignore blank')}</label>}
          {type === 'list' && <label className="check-item"><input type="checkbox" checked={dropdown} onChange={(e) => setDropdown(e.target.checked)} />{' '}{t('In-cell dropdown')}</label>}
          {type !== 'any' && type !== 'list' && type !== 'custom' && (
            <label>{t('Data:')}
              <select value={op} onChange={(e) => setOp(e.target.value as CellOp)}>
                {(['between', 'notBetween', 'equal', 'notEqual', 'greaterThan', 'lessThan', 'greaterThanOrEqual', 'lessThanOrEqual'] as CellOp[]).map((o) => (
                  <option key={o} value={o}>{o.replace(/([A-Z])/g, ' $1').toLowerCase()}</option>
                ))}
              </select>
            </label>
          )}
          {type !== 'any' && <label>{label1} <input value={f1} placeholder={type === 'list' ? t('Yes,No,Maybe  or  =$A$1:$A$5') : type === 'date' ? t('1/1/2026 or =A1') : ''} onChange={(e) => setF1(e.target.value)} /></label>}
          {type !== 'any' && type !== 'list' && type !== 'custom' && needs2 && <label>{t('Maximum:')}{' '}<input value={f2} onChange={(e) => setF2(e.target.value)} /></label>}
        </div>
      )}
      {tab === 'input' && (
        <div className="form">
          <label className="check-item"><input type="checkbox" checked={showInput} onChange={(e) => setShowInput(e.target.checked)} />{' '}{t('Show input message when cell is selected')}</label>
          <label>{t('Title:')}{' '}<input value={inputTitle} onChange={(e) => setInputTitle(e.target.value)} /></label>
          <label>{t('Input message:')}{' '}<textarea rows={4} value={inputMessage} onChange={(e) => setInputMessage(e.target.value)} /></label>
        </div>
      )}
      {tab === 'error' && (
        <div className="form">
          <label className="check-item"><input type="checkbox" checked={showError} onChange={(e) => setShowError(e.target.checked)} />{' '}{t('Show error alert after invalid data is entered')}</label>
          <label>{t('Style:')}
            <select value={errorStyle} onChange={(e) => setErrorStyle(e.target.value as Validation['errorStyle'])}>
              <option value="stop">{t('Stop')}</option>
              <option value="warning">{t('Warning')}</option>
              <option value="information">{t('Information')}</option>
            </select>
          </label>
          <label>{t('Title:')}{' '}<input value={errorTitle} onChange={(e) => setErrorTitle(e.target.value)} /></label>
          <label>{t('Error message:')}{' '}<textarea rows={4} value={errorMessage} onChange={(e) => setErrorMessage(e.target.value)} /></label>
        </div>
      )}
    </Modal>
  )
}

export function circleInvalid(app: ReturnType<typeof useApp>) {
  const doc = app.doc
  doc.circles = invalidCells(doc, doc.sheet)
  doc.emit()
  if (!doc.circles.length) app.alert(t('There are no invalid entries on this sheet.'))
}

void selectedObject

/** Type and value of a rule threshold (Lowest/Highest value, Number, Percent, Percentile, Formula). */
function CFValueInput({ label, value, onChange, allowAuto }: { label: string; value: CFValue; onChange: (v: CFValue) => void; allowAuto?: boolean }) {
  const types: [CFValue['type'], string][] = [
    ...(allowAuto ? ([['auto', t('Automatic')], ['min', t('Lowest Value')], ['max', t('Highest Value')]] as [CFValue['type'], string][]) : []),
    ['num', t('Number')],
    ['percent', t('Percent')],
    ['percentile', t('Percentile')],
    ['formula', t('Formula')],
  ]
  const needsValue = value.type === 'num' || value.type === 'percent' || value.type === 'percentile' || value.type === 'formula'
  return (
    <div className="dlg-inline">
      <span>{label}</span>
      <select value={value.type} onChange={(e) => onChange({ type: e.target.value as CFValue['type'], value: value.value ?? (e.target.value === 'formula' ? '' : 0) })}>
        {types.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
      {needsValue && (
        <input
          value={value.value ?? ''}
          style={{ width: 90 }}
          onChange={(e) => onChange({ ...value, value: value.type === 'formula' ? e.target.value.replace(/^=/, '') : Number(e.target.value) || 0 })}
        />
      )}
    </div>
  )
}
