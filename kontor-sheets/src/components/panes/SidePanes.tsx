// Task panes on the right: Format (chart/shape/picture), PivotTable Fields, Watch Window,
// Selection pane and Comments.
import { toLocalFormula } from '../../engine/localize'
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Eye, Plus, Trash2, X, Check, RotateCcw } from 'lucide-react'
import { cellName, keyCol, keyRow } from '../../model/address'
import type { ChartDef, ChartSeries, PictureObj, PivotDef, PivotFn, PivotShowAs, ShapeObj, SheetObject } from '../../model/extras'
import { arrangeObject, pivotAt, selectObject, selectedObject, updateObject } from '../../commands/objects'
import { chartData, chartSeries } from '../../charts/chartData'
import { seriesColors } from '../../charts/renderChart'
import { PIVOT_FNS, readSource, updatePivot, fieldItems } from '../../commands/pivot'
import { addComment, deleteThread, resolveThread, threadAt, authorName, AUTHOR_KEY } from '../../commands/review'
import { cellView } from '../../commands/display'
import { pasteExternal } from '../../commands/clipboard'
import { useApp, useDocVersion, type PaneKind } from '../appContext'
import { Popup, keepFocus, usePopover } from '../ui'
import { formatDate, t, tx } from '../../i18n'

const TITLES: Record<PaneKind, string> = { format: tx('Format'), pivot: tx('PivotTable Fields'), watch: tx('Watch Window'), selection: tx('Selection'), comments: tx('Comments'), clipboard: tx('Clipboard') }

export function SidePane({ kind, onClose }: { kind: PaneKind; onClose: () => void }) {
  const app = useApp()
  useDocVersion(app.doc)
  const o = selectedObject(app.doc)
  const title = kind === 'format' && o ? (o.kind === 'chart' ? t('Format Chart Area') : o.kind === 'picture' ? t('Format Picture') : t('Format Shape')) : t(TITLES[kind])
  return (
    <aside className="side-pane" aria-label={title}>
      <header className="side-pane-head">
        <span>{title}</span>
        <button type="button" className="icon-btn" aria-label={t('Close pane')} onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="side-pane-body">
        {kind === 'format' && o?.kind === 'chart' && <ChartFormat c={o} />}
        {kind === 'format' && o?.kind === 'shape' && <ShapeFormat s={o} />}
        {kind === 'format' && o?.kind === 'picture' && <PictureFormat p={o} />}
        {kind === 'format' && !o && <p className="pane-hint">{t('Select a chart, shape or picture to format it.')}</p>}
        {kind === 'pivot' && <PivotFields />}
        {kind === 'watch' && <WatchWindow />}
        {kind === 'selection' && <SelectionPane />}
        {kind === 'comments' && <CommentsPane />}
        {kind === 'clipboard' && <ClipboardPane />}
      </div>
    </aside>
  )
}

function Section({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="pane-section" open={open}>
      <summary>{title}</summary>
      <div className="pane-section-body">{children}</div>
    </details>
  )
}

function ColorField({ label, value, onChange, allowNone }: { label: string; value: string | null | undefined; onChange: (c: string | null) => void; allowNone?: boolean }) {
  return (
    <label className="pane-field">
      <span>{label}</span>
      <span className="pane-color">
        <input type="color" value={value && value !== 'transparent' ? value : '#ffffff'} onChange={(e) => onChange(e.target.value.toUpperCase())} />
        {allowNone && (
          <button type="button" className="btn btn-small" onClick={() => onChange(null)}>
            {t('None')}
          </button>
        )}
      </span>
    </label>
  )
}

/** Number input; an empty box means "automatic" (undefined). */
function NumberField({ label, value, onCommit }: { label: string; value: number | undefined; onCommit: (v: number | undefined) => void }) {
  return (
    <TextField
      label={label}
      value={value === undefined ? '' : String(value)}
      onCommit={(t) => {
        const n = Number(t.trim())
        onCommit(t.trim() === '' || !Number.isFinite(n) ? undefined : n)
      }}
    />
  )
}

function TextField({ label, value, onCommit, placeholder }: { label: string; value: string; onCommit: (v: string) => void; placeholder?: string }) {
  const [draft, setDraft] = useState(value)
  const [focus, setFocus] = useState(false)
  const shown = focus ? draft : value
  return (
    <label className="pane-field">
      <span>{label}</span>
      <input
        value={shown}
        placeholder={placeholder}
        onFocus={() => {
          setDraft(value)
          setFocus(true)
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocus(false)
          if (draft !== value) onCommit(draft)
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  )
}

function ChartFormat({ c }: { c: ChartDef }) {
  const app = useApp()
  const doc = app.doc
  const set = (patch: Partial<ChartDef>, label = tx('Format Chart')) => updateObject(doc, c.id, patch as Partial<SheetObject>, label)
  const series = chartSeries(doc.wb, doc.engine, c)
  const data = useMemo(() => chartData(doc.wb, doc.engine, c), [doc, c, doc.version])
  const colors = seriesColors(c, series.length)
  const setSeries = (i: number, patch: Partial<ChartSeries>) => set({ series: series.map((s, j) => (j === i ? { ...s, ...patch } : s)) }, tx('Format Data Series'))
  return (
    <>
      <Section title={t('Chart Area')}>
        <ColorField label={t('Fill')} value={c.fill} allowNone onChange={(v) => set({ fill: v ?? undefined })} />
        <ColorField label={t('Border')} value={c.border} allowNone onChange={(v) => set({ border: v ?? 'transparent' })} />
        <ColorField label={t('Text color')} value={c.fontColor ?? '#595959'} onChange={(v) => set({ fontColor: v ?? undefined })} />
      </Section>
      <Section title={t('Titles and Legend')}>
        <label className="pane-check">
          <input type="checkbox" checked={c.title.show} onChange={(e) => set({ title: { ...c.title, show: e.target.checked } })} />{' '}{t('Chart title')}
        </label>
        <TextField label={t('Title text')} value={c.title.text ?? ''} placeholder={series.length === 1 ? data.series[0]?.name : t('Chart Title')} onCommit={(v) => set({ title: { ...c.title, show: true, text: v || undefined } })} />
        <TextField label={t('Horizontal axis title')} value={c.axisTitles.x ?? ''} onCommit={(v) => set({ axisTitles: { ...c.axisTitles, x: v || undefined } })} />
        <TextField label={t('Vertical axis title')} value={c.axisTitles.y ?? ''} onCommit={(v) => set({ axisTitles: { ...c.axisTitles, y: v || undefined } })} />
        <label className="pane-field">
          <span>{t('Legend')}</span>
          <select value={c.legend} onChange={(e) => set({ legend: e.target.value as ChartDef['legend'] })}>
            {['none', 'right', 'top', 'left', 'bottom'].map((x) => (
              <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>
            ))}
          </select>
        </label>
        <label className="pane-field">
          <span>{t('Data labels')}</span>
          <select value={c.dataLabels} onChange={(e) => set({ dataLabels: e.target.value as ChartDef['dataLabels'] })}>
            <option value="none">{t('None')}</option>
            <option value="value">{t('Value')}</option>
            <option value="percent">{t('Percentage')}</option>
            <option value="category">{t('Category name')}</option>
          </select>
        </label>
      </Section>
      {c.type !== 'pie' && c.type !== 'doughnut' && c.type !== 'radar' && (
        <Section title={t('Axis Options')}>
          <NumberField label={t('Minimum (blank = auto)')} value={c.valueAxis?.min} onCommit={(v) => set({ valueAxis: { ...c.valueAxis, min: v } }, tx('Format Axis'))} />
          <NumberField label={t('Maximum (blank = auto)')} value={c.valueAxis?.max} onCommit={(v) => set({ valueAxis: { ...c.valueAxis, max: v } }, tx('Format Axis'))} />
          <NumberField label={t('Major unit (blank = auto)')} value={c.valueAxis?.major} onCommit={(v) => set({ valueAxis: { ...c.valueAxis, major: v } }, tx('Format Axis'))} />
          {c.type !== 'scatter' && (
            <>
              <label className="pane-check">
                <input type="checkbox" checked={!!c.valueAxis?.log} onChange={(e) => set({ valueAxis: { ...c.valueAxis, log: e.target.checked || undefined } }, tx('Format Axis'))} />{' '}{t('Logarithmic scale')}
              </label>
              <label className="pane-check">
                <input type="checkbox" checked={!!c.valueAxis?.reverse} onChange={(e) => set({ valueAxis: { ...c.valueAxis, reverse: e.target.checked || undefined } }, tx('Format Axis'))} />{' '}{t('Values in reverse order')}
              </label>
            </>
          )}
          <TextField label={t('Number format (blank = linked to source)')} value={c.valueAxis?.fmt ?? ''} onCommit={(v) => set({ valueAxis: { ...c.valueAxis, fmt: v || undefined } }, tx('Format Axis'))} />
        </Section>
      )}
      {c.type !== 'pie' && c.type !== 'doughnut' && c.type !== 'radar' && c.type !== 'scatter' && (
        <Section title={t('Error Bars')}>
          <label className="pane-field">
            <span>{t('Error amount')}</span>
            <select value={c.errorBars?.type ?? ''} onChange={(e) => set({ errorBars: e.target.value ? { type: e.target.value as NonNullable<ChartDef['errorBars']>['type'], value: c.errorBars?.value ?? (e.target.value === 'percent' ? 5 : 1) } : undefined }, tx('Error Bars'))}>
              <option value="">{t('None')}</option>
              <option value="stdErr">{t('Standard Error')}</option>
              <option value="percent">{t('Percentage')}</option>
              <option value="stdDev">{t('Standard Deviation')}</option>
              <option value="fixed">{t('Fixed value')}</option>
            </select>
          </label>
          {c.errorBars && c.errorBars.type !== 'stdErr' && <NumberField label={c.errorBars.type === 'percent' ? t('Percentage') : c.errorBars.type === 'stdDev' ? t('Standard deviations') : t('Value')} value={c.errorBars.value} onCommit={(v) => set({ errorBars: { ...c.errorBars!, value: v ?? 1 } }, tx('Error Bars'))} />}
        </Section>
      )}
      <Section title={t('Series Options')}>
        {(c.type === 'column' || c.type === 'bar' || c.type === 'combo' || c.type === 'waterfall') && (
          <label className="pane-field">
            <span>{t('Gap width ({n}%)', { n: c.gapWidth })}</span>
            <input type="range" min={0} max={500} value={c.gapWidth} onChange={(e) => set({ gapWidth: Number(e.target.value) }, tx('Gap Width'))} />
          </label>
        )}
        {c.type === 'doughnut' && (
          <label className="pane-field">
            <span>{t('Hole size ({n}%)', { n: c.holeSize })}</span>
            <input type="range" min={10} max={90} value={c.holeSize} onChange={(e) => set({ holeSize: Number(e.target.value) }, tx('Hole Size'))} />
          </label>
        )}
        {(c.type === 'line' || c.type === 'scatter' || c.type === 'combo' || c.type === 'radar') && (
          <>
            <label className="pane-check">
              <input type="checkbox" checked={c.markers} onChange={(e) => set({ markers: e.target.checked })} />{' '}{t('Markers')}
            </label>
            <label className="pane-check">
              <input type="checkbox" checked={c.smooth} onChange={(e) => set({ smooth: e.target.checked })} />{' '}{t('Smoothed line')}
            </label>
          </>
        )}
        {series.map((s, i) => (
          <div key={i} className="pane-series">
            <strong>{data.series[i]?.name ?? `Series${i + 1}`}</strong>
            <ColorField label={t('Color')} value={s.color ?? colors[i]} onChange={(v) => setSeries(i, { color: v ?? undefined })} />
            {(c.type === 'line' || c.type === 'area') && (
              <label className="pane-check">
                <input type="checkbox" checked={!!s.secondary} onChange={(e) => setSeries(i, { secondary: e.target.checked })} />{' '}{t('Secondary axis')}
              </label>
            )}
            {c.type === 'combo' && (
              <>
                <label className="pane-field">
                  <span>{t('Chart type')}</span>
                  <select value={s.type ?? 'column'} onChange={(e) => setSeries(i, { type: e.target.value as ChartSeries['type'] })}>
                    <option value="column">{t('Clustered Column')}</option>
                    <option value="line">{t('Line')}</option>
                    <option value="area">{t('Area')}</option>
                  </select>
                </label>
                <label className="pane-check">
                  <input type="checkbox" checked={!!s.secondary} onChange={(e) => setSeries(i, { secondary: e.target.checked })} />{' '}{t('Secondary axis')}
                </label>
              </>
            )}
            {c.type !== 'pie' && c.type !== 'doughnut' && (
              <label className="pane-field">
                <span>{t('Trendline')}</span>
                <select value={s.trendline ?? ''} onChange={(e) => setSeries(i, { trendline: (e.target.value || undefined) as ChartSeries['trendline'] })}>
                  <option value="">{t('None')}</option>
                  <option value="linear">{t('Linear')}</option>
                  <option value="exponential">{t('Exponential')}</option>
                  <option value="logarithmic">{t('Logarithmic')}</option>
                  <option value="movingAverage">{t('Moving average')}</option>
                </select>
              </label>
            )}
          </div>
        ))}
      </Section>
    </>
  )
}

function ShapeFormat({ s }: { s: ShapeObj }) {
  const app = useApp()
  const set = (patch: Partial<ShapeObj>, label = tx('Format Shape')) => updateObject(app.doc, s.id, patch as Partial<SheetObject>, label)
  return (
    <>
      <Section title={t('Fill and Line')}>
        <ColorField label={t('Fill')} value={s.fill} allowNone onChange={(v) => set({ fill: v })} />
        <ColorField label={t('Line')} value={s.line} allowNone onChange={(v) => set({ line: v })} />
        <label className="pane-field">
          <span>{t('Line width ({n} pt)', { n: s.lineWidth })}</span>
          <input type="range" min={0.25} max={12} step={0.25} value={s.lineWidth} onChange={(e) => set({ lineWidth: Number(e.target.value) })} />
        </label>
      </Section>
      <Section title={t('Text')}>
        <label className="pane-field">
          <span>{t('Text')}</span>
          <textarea rows={3} defaultValue={s.text} onBlur={(e) => e.target.value !== s.text && set({ text: e.target.value }, tx('Edit Text'))} />
        </label>
        <ColorField label={t('Text color')} value={s.textColor} onChange={(v) => set({ textColor: v ?? '#000000' })} />
        <label className="pane-field">
          <span>{t('Font size')}</span>
          <input type="number" min={4} max={200} value={s.fontSize} onChange={(e) => set({ fontSize: Math.max(4, Number(e.target.value) || 11) })} />
        </label>
      </Section>
      <Section title={t('Size and Rotation')}>
        <label className="pane-field">
          <span>{t('Rotation (°)')}</span>
          <input type="number" min={0} max={359} value={s.rotation} onChange={(e) => set({ rotation: ((Number(e.target.value) % 360) + 360) % 360 }, tx('Rotate'))} />
        </label>
      </Section>
    </>
  )
}

function PictureFormat({ p }: { p: PictureObj }) {
  const app = useApp()
  const set = (patch: Partial<PictureObj>, label = tx('Format Picture')) => updateObject(app.doc, p.id, patch as Partial<SheetObject>, label)
  return (
    <>
      <Section title={t('Picture')}>
        <ColorField label={t('Border')} value={p.border} allowNone onChange={(v) => set({ border: v ?? undefined })} />
        <label className="pane-field">
          <span>{t('Rotation (°)')}</span>
          <input type="number" min={0} max={359} value={p.rotation} onChange={(e) => set({ rotation: ((Number(e.target.value) % 360) + 360) % 360 }, tx('Rotate'))} />
        </label>
      </Section>
      <Section title={t('Alt Text')}>
        <label className="pane-field">
          <span>{t('Description')}</span>
          <textarea rows={3} defaultValue={p.alt ?? ''} onBlur={(e) => set({ alt: e.target.value || undefined }, tx('Alt Text'))} />
        </label>
      </Section>
    </>
  )
}

// ---------- PivotTable Fields ----------

type Area = 'filters' | 'cols' | 'rows' | 'values'

function PivotFields() {
  const app = useApp()
  const doc = app.doc
  const a = doc.sel.active
  const p = pivotAt(doc.sheet, a.r, a.c)
  const [search, setSearch] = useState('')
  const [drag, setDrag] = useState<{ field: string; from: Area | 'list'; index: number } | null>(null)
  const src = useMemo(() => (p ? readSource(doc, p) : null), [doc, p, doc.version])
  if (!p || !src) return <p className="pane-hint">{t('Select a cell in a PivotTable to see its fields.')}</p>
  const upd = (fn: (x: PivotDef) => void, label = tx('PivotTable Fields')) => updatePivot(doc, p.id, fn, label)
  const used = (f: string) => p.rows.includes(f) || p.cols.includes(f) || p.values.some((v) => v.field === f) || p.filters.some((x) => x.field === f)
  const numeric = (f: string) => {
    const i = src.fields.indexOf(f)
    return src.rows.some((r) => typeof r.values[i] === 'number')
  }
  const remove = (x: PivotDef, area: Area, index: number) => {
    if (area === 'rows') x.rows.splice(index, 1)
    else if (area === 'cols') x.cols.splice(index, 1)
    else if (area === 'values') x.values.splice(index, 1)
    else x.filters.splice(index, 1)
  }
  const insert = (x: PivotDef, area: Area, field: string, at?: number) => {
    const pos = (list: unknown[]) => (at === undefined ? list.length : Math.min(at, list.length))
    if (area === 'rows') {
      x.rows = x.rows.filter((f) => f !== field)
      x.cols = x.cols.filter((f) => f !== field)
      x.rows.splice(pos(x.rows), 0, field)
    } else if (area === 'cols') {
      x.cols = x.cols.filter((f) => f !== field)
      x.rows = x.rows.filter((f) => f !== field)
      x.cols.splice(pos(x.cols), 0, field)
    } else if (area === 'values') x.values.splice(pos(x.values), 0, { field, fn: numeric(field) ? 'sum' : 'count', showAs: 'normal' })
    else {
      x.filters = x.filters.filter((f) => f.field !== field)
      x.rows = x.rows.filter((f) => f !== field)
      x.cols = x.cols.filter((f) => f !== field)
      x.filters.splice(pos(x.filters), 0, { field, selected: null })
    }
  }
  const toggle = (f: string, on: boolean) =>
    upd((x) => {
      if (on) insert(x, numeric(f) ? 'values' : 'rows', f)
      else {
        x.rows = x.rows.filter((r) => r !== f)
        x.cols = x.cols.filter((r) => r !== f)
        x.values = x.values.filter((v) => v.field !== f)
        x.filters = x.filters.filter((v) => v.field !== f)
      }
    })
  const drop = (area: Area, at?: number) => {
    if (!drag) return
    const d = drag
    setDrag(null)
    upd((x) => {
      if (d.from !== 'list') remove(x, d.from, d.index)
      insert(x, area, d.field, at)
    }, tx('Move Field'))
  }
  const areaItems = (area: Area): { label: string; field: string }[] =>
    area === 'rows' ? p.rows.map((f) => ({ label: f, field: f })) : area === 'cols' ? p.cols.map((f) => ({ label: f, field: f })) : area === 'filters' ? p.filters.map((f) => ({ label: f.field, field: f.field })) : p.values.map((v) => ({ label: v.name ?? t('{function} of {field}', { function: t(PIVOT_FNS.find((x) => x[0] === v.fn)?.[1] ?? ''), field: v.field }), field: v.field }))
  const AREA_LABEL: Record<Area, string> = { filters: t('Filters'), cols: t('Columns'), rows: t('Rows'), values: t('Values') }
  return (
    <div className="pivot-pane">
      <input className="pane-search" placeholder={t('Search')} value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="pivot-fields">
        {src.fields
          .filter((f) => f.toLowerCase().includes(search.toLowerCase()))
          .map((f) => (
            <label key={f} className="pivot-field" draggable onDragStart={() => setDrag({ field: f, from: 'list', index: -1 })}>
              <input type="checkbox" checked={used(f)} onChange={(e) => toggle(f, e.target.checked)} /> {f}
            </label>
          ))}
      </div>
      <p className="pane-hint">{t('Drag fields between areas below:')}</p>
      <div className="pivot-areas">
        {(['filters', 'cols', 'rows', 'values'] as Area[]).map((area) => (
          <div key={area} className="pivot-area" onDragOver={(e) => e.preventDefault()} onDrop={() => drop(area)}>
            <div className="pivot-area-title">{AREA_LABEL[area]}</div>
            {areaItems(area).map((it, i) => (
              <div
                key={`${it.field}-${i}`}
                className="pivot-chip"
                draggable
                onDragStart={() => setDrag({ field: it.field, from: area, index: i })}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.stopPropagation()
                  drop(area, i)
                }}
              >
                <span className="pivot-chip-label">{it.label}</span>
                {area === 'values' && (
                  <select
                    aria-label={t('Summarize values by')}
                    value={p.values[i].fn}
                    onChange={(e) => upd((x) => (x.values[i] = { ...x.values[i], fn: e.target.value as PivotFn, name: undefined }), tx('Value Field Settings'))}
                  >
                    {PIVOT_FNS.map(([id, label]) => (
                      <option key={id} value={id}>{t(label)}</option>
                    ))}
                  </select>
                )}
                {area === 'values' && (
                  <select aria-label={t('Show values as')} value={p.values[i].showAs} onChange={(e) => upd((x) => (x.values[i] = { ...x.values[i], showAs: e.target.value as PivotShowAs }), tx('Show Values As'))}>
                    <option value="normal">{t('No Calculation')}</option>
                    <option value="pctGrand">{t('% of Grand Total')}</option>
                    <option value="pctCol">{t('% of Column Total')}</option>
                    <option value="pctRow">{t('% of Row Total')}</option>
                  </select>
                )}
                {area === 'filters' && <FilterChoice p={p} index={i} />}
                <button type="button" className="icon-btn" aria-label={t('Move up')} disabled={i === 0} onClick={() => upd((x) => moveIn(x, area, i, -1), tx('Move Field'))}>
                  <ArrowUp size={12} />
                </button>
                <button type="button" className="icon-btn" aria-label={t('Move down')} onClick={() => upd((x) => moveIn(x, area, i, 1), tx('Move Field'))}>
                  <ArrowDown size={12} />
                </button>
                <button type="button" className="icon-btn" aria-label={t('Remove field')} onClick={() => upd((x) => remove(x, area, i), tx('Remove Field'))}>
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function moveIn(x: PivotDef, area: Area, i: number, d: number) {
  const list: unknown[] = area === 'rows' ? x.rows : area === 'cols' ? x.cols : area === 'values' ? x.values : x.filters
  const j = i + d
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
}

/** Report filter drop-down: one item, or several with "Select Multiple Items", like the original. */
function FilterChoice({ p, index }: { p: PivotDef; index: number }) {
  const app = useApp()
  const f = p.filters[index]
  const items = useMemo(() => fieldItems(app.doc, p, f.field), [app.doc, p, f.field])
  const { open, setOpen, ref } = usePopover()
  const [multi, setMulti] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const label = !f.selected ? t('(All)') : f.selected.length === 1 ? f.selected[0] : t('(Multiple Items)')
  const start = () => {
    setMulti(!!f.selected && f.selected.length > 1)
    setPicked(new Set(f.selected ?? items))
    setSearch('')
    setOpen(!open)
  }
  const commit = (selected: string[] | null) => {
    setOpen(false)
    updatePivot(app.doc, p.id, (x) => (x.filters[index] = { ...x.filters[index], selected: selected && selected.length < items.length ? selected : null }), tx('Filter'))
  }
  const shown = items.filter((it) => it.toLowerCase().includes(search.toLowerCase()))
  return (
    <div className="popover-anchor pf-filter" ref={ref}>
      <button type="button" className="pf-filter-btn" aria-haspopup="true" aria-expanded={open} aria-label={t('Filter {name}', { name: f.field })} onClick={start}>
        <span>{label}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <Popup anchor={ref} className="pf-filter-menu">
          <input type="search" placeholder={t('Search')} aria-label={t('Search items')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="pf-filter-list" role="listbox" aria-multiselectable={multi}>
            {multi ? (
              <>
                <label>
                  <input type="checkbox" checked={picked.size === items.length} onChange={(e) => setPicked(new Set(e.target.checked ? items : []))} />{' '}{t('(All)')}
                </label>
                {shown.map((it) => (
                  <label key={it}>
                    <input
                      type="checkbox"
                      checked={picked.has(it)}
                      onChange={(e) => {
                        const next = new Set(picked)
                        if (e.target.checked) next.add(it)
                        else next.delete(it)
                        setPicked(next)
                      }}
                    />{' '}
                    {it}
                  </label>
                ))}
              </>
            ) : (
              <>
                <button type="button" className={f.selected ? 'menu-item' : 'menu-item is-active'} onClick={() => commit(null)}>{t('(All)')}</button>
                {shown.map((it) => (
                  <button key={it} type="button" className={f.selected?.length === 1 && f.selected[0] === it ? 'menu-item is-active' : 'menu-item'} onClick={() => commit([it])}>
                    {it}
                  </button>
                ))}
              </>
            )}
          </div>
          <label className="pf-filter-multi">
            <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />{' '}{t('Select Multiple Items')}
          </label>
          {multi && (
            <div className="pf-filter-actions">
              <button type="button" className="btn btn-primary" disabled={!picked.size} onClick={() => commit(items.filter((it) => picked.has(it)))}>{t('OK')}</button>
              <button type="button" className="btn" onClick={() => setOpen(false)}>{t('Cancel')}</button>
            </div>
          )}
        </Popup>
      )}
    </div>
  )
}

// ---------- Clipboard ----------

function ClipboardPane() {
  const app = useApp()
  const doc = app.doc
  const list = doc.clipHistory
  const paste = (text: string, html: string) => {
    pasteExternal(doc, text, html)
    app.focusGrid()
  }
  return (
    <div className="clip-pane">
      <div className="row">
        <button type="button" className="btn" disabled={!list.length} onClick={() => paste(list.map((h) => h.text.replace(/\n$/, '')).reverse().join('\n') + '\n', '')}>{t('Paste All')}</button>
        <button type="button" className="btn" disabled={!list.length} onClick={() => { doc.clipHistory = []; doc.emit() }}>{t('Clear All')}</button>
      </div>
      <p className="pane-hint">{list.length ? t('Click an item to paste:') : t('Copy cells to collect them here (up to 24 items).')}</p>
      {list.map((h, i) => (
        <button key={i} type="button" className="clip-item" title={t('Paste {item}', { item: h.label })} onClick={() => paste(h.text, h.html)}>
          <small>{h.label}</small>
          <span>{h.text.split('\n').slice(0, 3).map((l) => l.replace(/\t/g, '  ')).join(' ⏎ ').slice(0, 120)}</span>
        </button>
      ))}
    </div>
  )
}

// ---------- Watch Window ----------

function WatchWindow() {
  const app = useApp()
  const doc = app.doc
  const add = () => {
    const list = [...app.watches]
    for (const rg of doc.sel.ranges) {
      const b = doc.boundToUsed(rg)
      for (let r = b.r1; r <= Math.min(b.r2, b.r1 + 50); r++)
        for (let c = b.c1; c <= Math.min(b.c2, b.c1 + 20); c++) if (!list.some((w) => w.sheetId === doc.sheet.id && w.r === r && w.c === c)) list.push({ sheetId: doc.sheet.id, r, c })
    }
    app.setWatches(list)
  }
  return (
    <div className="watch-pane">
      <div className="pane-actions">
        <button type="button" className="btn" onClick={add}>
          <Plus size={14} />{' '}{t('Add Watch')}
        </button>
        <button type="button" className="btn" disabled={!app.watches.length} onClick={() => app.setWatches([])}>
          <Trash2 size={14} />{' '}{t('Delete All')}
        </button>
      </div>
      <table className="pane-table">
        <thead>
          <tr>
            <th>{t('Sheet')}</th>
            <th>{t('Cell')}</th>
            <th>{t('Value')}</th>
            <th>{t('Formula')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {app.watches.map((w, i) => {
            const sheet = doc.wb.sheetById(w.sheetId)
            if (!sheet) return null
            const st = doc.wb.styles.get(sheet.styleId(w.r, w.c))
            return (
              <tr key={i}>
                <td>{sheet.name}</td>
                <td>{cellName(w.r, w.c)}</td>
                <td>{cellView(doc, sheet, w.r, w.c, st).text}</td>
                <td className="mono">{sheet.get(w.r, w.c)?.f !== undefined ? '=' + toLocalFormula(sheet.get(w.r, w.c)!.f!) : ''}</td>
                <td>
                  <button type="button" className="icon-btn" aria-label={t('Delete watch')} onClick={() => app.setWatches(app.watches.filter((_, j) => j !== i))}>
                    <X size={12} />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!app.watches.length && <p className="pane-hint">{t('Select cells and choose Add Watch to keep an eye on their values while you work elsewhere.')}</p>}
    </div>
  )
}

// ---------- Selection pane ----------

function SelectionPane() {
  const app = useApp()
  const doc = app.doc
  const objects = [...doc.sheet.x.objects].reverse()
  const [renaming, setRenaming] = useState<number | null>(null)
  return (
    <div className="selection-pane">
      {!objects.length && <p className="pane-hint">{t('There are no charts, pictures or shapes on this sheet.')}</p>}
      {objects.map((o) => (
        <div key={o.id} className={`sel-item${doc.selObj === o.id ? ' is-active' : ''}`} onMouseDown={keepFocus} onClick={() => selectObject(doc, o.id)} onDoubleClick={() => setRenaming(o.id)}>
          <Eye size={13} />
          {renaming === o.id ? (
            <input
              autoFocus
              defaultValue={o.name}
              onBlur={(e) => {
                setRenaming(null)
                if (e.target.value.trim() && e.target.value !== o.name) updateObject(doc, o.id, { name: e.target.value.trim() }, tx('Rename'))
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          ) : (
            <span>{o.name}</span>
          )}
        </div>
      ))}
      {doc.selObj !== null && (
        <div className="pane-actions">
          <button type="button" className="btn" onClick={() => arrangeObject(doc, doc.selObj!, 'forward')}>
            <ArrowUp size={14} />{' '}{t('Bring Forward')}
          </button>
          <button type="button" className="btn" onClick={() => arrangeObject(doc, doc.selObj!, 'backward')}>
            <ArrowDown size={14} />{' '}{t('Send Backward')}
          </button>
        </div>
      )}
    </div>
  )
}

// ---------- Comments ----------

function CommentsPane() {
  const app = useApp()
  const doc = app.doc
  const sheet = doc.sheet
  const { r, c } = doc.sel.active
  const [text, setText] = useState('')
  const [name, setName] = useState(authorName())
  const threads = Object.entries(sheet.x.comments)
    .map(([k, t]) => ({ k: Number(k), t }))
    .sort((a, b) => a.k - b.k)
  const current = threadAt(sheet, r, c)
  return (
    <div className="comments-pane">
      <label className="pane-field">
        <span>{t('Your name')}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            try {
              localStorage.setItem(AUTHOR_KEY, name)
            } catch {
              // storage unavailable
            }
          }}
        />
      </label>
      <div className="comment-new">
        <div className="pane-hint">
          {current ? t('Reply to {cell}', { cell: cellName(r, c) }) : t('New comment on {cell}', { cell: cellName(r, c) })}
        </div>
        <textarea rows={3} value={text} placeholder={current ? t('Reply…') : t('Start a conversation')} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            addComment(doc, r, c, text)
            setText('')
          }
        }} />
        <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={() => {
          addComment(doc, r, c, text)
          setText('')
        }}>
          {t('Post')}
        </button>
      </div>
      {threads.map(({ k, t: thread }) => (
        <div key={k} className={`thread${thread.resolved ? ' is-resolved' : ''}${keyRow(k) === r && keyCol(k) === c ? ' is-active' : ''}`} onClick={() => doc.select({ r: keyRow(k), c: keyCol(k) })}>
          <div className="thread-head">
            <strong>{cellName(keyRow(k), keyCol(k))}</strong>
            {thread.resolved && <span className="badge">{t('Resolved')}</span>}
            <span className="spacer" />
            <button type="button" className="icon-btn" title={thread.resolved ? t('Reopen thread') : t('Resolve thread')} onClick={(e) => {
              e.stopPropagation()
              resolveThread(doc, keyRow(k), keyCol(k), !thread.resolved)
            }}>
              {thread.resolved ? <RotateCcw size={13} /> : <Check size={13} />}
            </button>
            <button type="button" className="icon-btn" title={t('Delete thread')} onClick={(e) => {
              e.stopPropagation()
              deleteThread(doc, keyRow(k), keyCol(k))
            }}>
              <Trash2 size={13} />
            </button>
          </div>
          {thread.items.map((it, i) => (
            <div key={i} className="comment">
              <div className="comment-meta">
                <strong>{it.author}</strong> <span>{formatDate(new Date(it.date), { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
              <div className="comment-text">{it.text}</div>
            </div>
          ))}
        </div>
      ))}
      {!threads.length && <p className="pane-hint">{t('No comments on this sheet yet.')}</p>}
    </div>
  )
}
