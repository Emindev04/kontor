// Contextual ribbon tabs: Chart Design / Format, Shape Format, Table Design, PivotTable Analyze / Design.
import type { Doc } from '../../commands/doc'
import { t, tx } from '../../i18n'
import { chartTemplates, deleteChartTemplate, saveChartTemplate, templatePatch } from '../../charts/chartTemplates'
import {
  AlignCenterHorizontal, ArrowDownToLine, ArrowUpToLine, BarChart3, BringToFront, ChartColumn, Combine, Database, Eraser, FileStack, Grid3x3, Layers, LayoutTemplate, ListChecks, Move,
  Paintbrush, PaintBucket, PanelRight, PenLine, Pencil, Plus, RefreshCw, Repeat, RotateCw, Rows3, Scaling, SendToBack, Shapes, Sigma, Sparkles, Table2, TableProperties,
  Trash2, Type, Bold, Italic, ImageIcon, TextAlignStart, TextAlignCenter, TextAlignEnd, CopyMinus, Minus, Maximize2, Group, Ungroup, Filter, FilterX,
  CalendarRange,
} from 'lucide-react'
import type { ChartDef, ChartSeries, PictureObj, PivotDef, ShapeObj, SheetObject, SlicerObj, TableDef } from '../../model/extras'
import { arrangeObject, deleteObject, selectedObject, tableAt, pivotAt, updateObject, updateChart, alignObjects, distributeObjects, groupObjects, ungroupObjects, selectedIds } from '../../commands/objects'
import { convertToRange, renameTable, setHeaderRow, setTotalsRow, tableStyleLabel, tableStyleSpec, TABLE_STYLE_GROUPS, updateTable } from '../../commands/tables'
import { applyFilters } from '../../commands/filter'
import { deletePivot, groupPivotField, updatePivot } from '../../commands/pivot'
import { SLICER_COLORS, clearSlicer } from '../../commands/slicers'
import { absRef, chartData, chartSeries } from '../../charts/chartData'
import { PALETTES, CHART_STYLES } from '../../charts/renderChart'
import { SHAPES, shapeSVG } from '../../charts/shapes'
import { FontColorPalette } from '../palettes'
import { CheckItem, MenuButton, PopoverButton, RibbonButton, RibbonGroup, Spinner, keepFocus, type MenuItem } from '../ui'
import { useApp, useDocVersion } from '../appContext'
import { useEffect, useState } from 'react'

const inches = (px: number) => `${(px / 96).toFixed(2)}"`
const parseInches = (t: string) => {
  const n = parseFloat(t.replace(/["in ]/g, ''))
  return Number.isFinite(n) ? n * 96 : null
}

function SizeGroup({ o }: { o: SheetObject }) {
  const app = useApp()
  const set = (patch: Partial<SheetObject['anchor']>) => updateObject(app.doc, o.id, { anchor: { ...o.anchor, ...patch } }, tx('Size'))
  return (
    <RibbonGroup label={t('Size')} icon={Scaling}>
      <div className="col">
        <Spinner label={t('Height')} value={Math.abs(o.anchor.h)} step={9.6} min={4} max={20000} format={inches} parse={parseInches} onChange={(v) => set({ h: v })} />
        <Spinner label={t('Width')} value={Math.abs(o.anchor.w)} step={9.6} min={4} max={20000} format={inches} parse={parseInches} onChange={(v) => set({ w: v })} />
      </div>
    </RibbonGroup>
  )
}

/** Arrange > Align and Group menus for the selected objects. */
export function alignMenuItems(doc: Doc): MenuItem[] {
  const n = selectedIds(doc).length
  return [
    { label: t('Align Left'), onClick: () => alignObjects(doc, 'left'), disabled: !n },
    { label: t('Align Center'), onClick: () => alignObjects(doc, 'center'), disabled: !n },
    { label: t('Align Right'), onClick: () => alignObjects(doc, 'right'), disabled: !n },
    'separator',
    { label: t('Align Top'), onClick: () => alignObjects(doc, 'top'), disabled: !n },
    { label: t('Align Middle'), onClick: () => alignObjects(doc, 'middle'), disabled: !n },
    { label: t('Align Bottom'), onClick: () => alignObjects(doc, 'bottom'), disabled: !n },
    'separator',
    { label: t('Distribute Horizontally'), onClick: () => distributeObjects(doc, 'h'), disabled: n < 3 },
    { label: t('Distribute Vertically'), onClick: () => distributeObjects(doc, 'v'), disabled: n < 3 },
  ]
}

export function groupMenuItems(doc: Doc): MenuItem[] {
  const ids = selectedIds(doc)
  const grouped = doc.sheet.x.objects.some((o) => ids.includes(o.id) && o.group !== undefined)
  return [
    { label: t('Group'), onClick: () => groupObjects(doc), disabled: ids.length < 2 },
    { label: t('Ungroup'), onClick: () => ungroupObjects(doc), disabled: !grouped },
  ]
}

function ArrangeGroup({ o }: { o: SheetObject }) {
  const app = useApp()
  const doc = app.doc
  return (
    <RibbonGroup label={t('Arrange')} icon={Layers}>
      <div className="col">
        <MenuButton icon={BringToFront} label={t('Bring Forward')} showLabel items={[{ label: t('Bring Forward'), onClick: () => arrangeObject(doc, o.id, 'forward') }, { label: t('Bring to Front'), onClick: () => arrangeObject(doc, o.id, 'front') }]} />
        <MenuButton icon={SendToBack} label={t('Send Backward')} showLabel items={[{ label: t('Send Backward'), onClick: () => arrangeObject(doc, o.id, 'backward') }, { label: t('Send to Back'), onClick: () => arrangeObject(doc, o.id, 'back') }]} />
        <RibbonButton icon={PanelRight} label={t('Selection Pane')} showLabel onClick={() => app.setPane('selection')} />
      </div>
      <div className="col">
        <MenuButton icon={AlignCenterHorizontal} label={t('Align')} showLabel items={alignMenuItems(doc)} />
        <MenuButton icon={Group} label={t('Group')} showLabel items={groupMenuItems(doc)} />
      </div>
      {o.kind !== 'chart' && (
        <MenuButton
          icon={RotateCw}
          label={t('Rotate')}
          large
          items={[
            { label: t('Rotate Right 90°'), onClick: () => updateObject(doc, o.id, { rotation: (((o as ShapeObj).rotation ?? 0) + 90) % 360 } as Partial<SheetObject>, tx('Rotate')) },
            { label: t('Rotate Left 90°'), onClick: () => updateObject(doc, o.id, { rotation: (((o as ShapeObj).rotation ?? 0) + 270) % 360 } as Partial<SheetObject>, tx('Rotate')) },
            { label: t('Reset Rotation'), onClick: () => updateObject(doc, o.id, { rotation: 0 } as Partial<SheetObject>, tx('Rotate')) },
          ]}
        />
      )}
      <RibbonButton icon={Trash2} label={t('Delete')} large onClick={() => deleteObject(doc, o.id)} />
    </RibbonGroup>
  )
}

// ---------- charts ----------

export const QUICK_LAYOUTS: { label: string; patch: Partial<ChartDef> }[] = [
  { label: tx('Layout 1: title, legend right'), patch: { title: { show: true }, legend: 'right', dataLabels: 'none', axisTitles: {} } },
  { label: tx('Layout 2: title, legend top, data labels'), patch: { title: { show: true }, legend: 'top', dataLabels: 'value', gridlines: { major: false, minor: false, vertical: false } } },
  { label: tx('Layout 3: title, legend bottom'), patch: { title: { show: true }, legend: 'bottom', dataLabels: 'none', axisTitles: {} } },
  { label: tx('Layout 4: no title, data labels, legend bottom'), patch: { title: { show: false }, legend: 'bottom', dataLabels: 'value' } },
  { label: tx('Layout 5: title and axis titles'), patch: { title: { show: true }, legend: 'none', axisTitles: { x: 'Axis Title', y: 'Axis Title' } } },
  { label: tx('Layout 6: axis titles, legend right'), patch: { title: { show: true }, legend: 'right', axisTitles: { y: 'Axis Title' } } },
]

export function ChartDesignTab() {
  const app = useApp()
  const doc = app.doc
  useDocVersion(doc)
  const o = selectedObject(doc)
  if (!o || o.kind !== 'chart') return null
  const set = (patch: Partial<ChartDef>, label = tx('Chart Element')) => updateChart(doc, o.id, patch, label)
  const trendAll = (t: ChartSeries['trendline']) => {
    const series = chartSeries(doc.wb, doc.engine, o).map((s, i) => (i === 0 || t === undefined ? { ...s, trendline: t } : s))
    set({ series }, tx('Trendline'))
  }
  const elementItems: MenuItem[] = [
    { heading: t('Axes') },
    { label: t('Primary Horizontal'), checked: o.axes.x, onClick: () => set({ axes: { ...o.axes, x: !o.axes.x } }) },
    { label: t('Primary Vertical'), checked: o.axes.y, onClick: () => set({ axes: { ...o.axes, y: !o.axes.y } }) },
    { heading: t('Axis Titles') },
    { label: t('Primary Horizontal'), checked: !!o.axisTitles.x, onClick: () => set({ axisTitles: { ...o.axisTitles, x: o.axisTitles.x ? undefined : 'Axis Title' } }) },
    { label: t('Primary Vertical'), checked: !!o.axisTitles.y, onClick: () => set({ axisTitles: { ...o.axisTitles, y: o.axisTitles.y ? undefined : 'Axis Title' } }) },
    { heading: t('Chart Title') },
    { label: t('None'), checked: !o.title.show, onClick: () => set({ title: { ...o.title, show: false } }) },
    { label: t('Above Chart'), checked: o.title.show && !o.title.overlay, onClick: () => set({ title: { ...o.title, show: true, overlay: false } }) },
    { label: t('Centered Overlay'), checked: o.title.show && !!o.title.overlay, onClick: () => set({ title: { ...o.title, show: true, overlay: true } }) },
    { heading: t('Data Labels') },
    ...(['none', 'value', 'percent', 'category'] as const).map((d): MenuItem => ({ label: d === 'none' ? t('None') : d === 'value' ? t('Value') : d === 'percent' ? t('Percentage') : t('Category Name'), checked: o.dataLabels === d, onClick: () => set({ dataLabels: d }) })),
    { heading: t('Gridlines') },
    { label: t('Primary Major Horizontal'), checked: o.gridlines.major, onClick: () => set({ gridlines: { ...o.gridlines, major: !o.gridlines.major } }) },
    { label: t('Primary Minor Horizontal'), checked: o.gridlines.minor, onClick: () => set({ gridlines: { ...o.gridlines, minor: !o.gridlines.minor } }) },
    { label: t('Primary Major Vertical'), checked: o.gridlines.vertical, onClick: () => set({ gridlines: { ...o.gridlines, vertical: !o.gridlines.vertical } }) },
    { heading: t('Legend') },
    ...(['none', 'right', 'top', 'left', 'bottom'] as const).map((l): MenuItem => ({ label: l[0].toUpperCase() + l.slice(1), checked: o.legend === l, onClick: () => set({ legend: l }) })),
    { heading: t('Error Bars') },
    { label: t('None'), checked: !o.errorBars, onClick: () => set({ errorBars: undefined }, tx('Error Bars')) },
    { label: t('Standard Error'), checked: o.errorBars?.type === 'stdErr', onClick: () => set({ errorBars: { type: 'stdErr', value: 1 } }, tx('Error Bars')) },
    { label: t('Percentage'), checked: o.errorBars?.type === 'percent', onClick: () => set({ errorBars: { type: 'percent', value: 5 } }, tx('Error Bars')) },
    { label: t('Standard Deviation'), checked: o.errorBars?.type === 'stdDev', onClick: () => set({ errorBars: { type: 'stdDev', value: 1 } }, tx('Error Bars')) },
    { heading: t('Data Table') },
    { label: t('None'), checked: !o.dataTable, onClick: () => set({ dataTable: undefined }, tx('Data Table')) },
    { label: t('With Legend Keys'), checked: !!o.dataTable, onClick: () => set({ dataTable: true }, tx('Data Table')) },
    { heading: t('Trendline') },
    { label: t('None'), onClick: () => trendAll(undefined) },
    { label: t('Linear'), onClick: () => trendAll('linear') },
    { label: t('Exponential'), onClick: () => trendAll('exponential') },
    { label: t('Logarithmic'), onClick: () => trendAll('logarithmic') },
    { label: t('Moving Average'), onClick: () => trendAll('movingAverage') },
  ]
  return (
    <>
      <RibbonGroup label={t('Chart Layouts')} icon={LayoutTemplate}>
        <MenuButton icon={Plus} label={t('Add Chart Element')} large wide items={elementItems} />
        <MenuButton icon={LayoutTemplate} label={t('Quick Layout')} large wide items={QUICK_LAYOUTS.map((l) => ({ label: t(l.label), onClick: () => set(l.patch, tx('Quick Layout')) }))} />
      </RibbonGroup>
      <RibbonGroup label={t('Chart Styles')} icon={Paintbrush}>
        <MenuButton
          icon={Paintbrush}
          label={t('Change Colors')}
          large
          wide
          items={PALETTES.map((p, i): MenuItem => ({
            label: t(p.name),
            active: o.palette === i,
            preview: (
              <span className="pal-preview">
                {p.colors.slice(0, 6).map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </span>
            ),
            onClick: () => set({ palette: i }, tx('Change Colors')),
          }))}
        />
        <div className="chart-style-row">
          {CHART_STYLES.map((st, i) => (
            <button key={i} type="button" className={`chart-style${o.style === i + 1 ? ' is-active' : ''}`} title={t('Style {n}', { n: i + 1 })} onMouseDown={keepFocus} onClick={() => set({ style: i + 1 }, tx('Chart Style'))} style={{ background: st.bg }}>
              <span style={{ background: PALETTES[o.palette]?.colors[0] ?? '#2E6FD8', height: 14 }} />
              <span style={{ background: PALETTES[o.palette]?.colors[1] ?? '#F28C28', height: 20 }} />
              <span style={{ background: PALETTES[o.palette]?.colors[0] ?? '#2E6FD8', height: 10 }} />
            </button>
          ))}
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Data')} icon={Database}>
        <RibbonButton icon={Repeat} label={t('Switch Row/Column')} large onClick={() => set({ byRow: !o.byRow, series: undefined }, tx('Switch Row/Column'))} />
        <RibbonButton icon={Table2} label={t('Select Data')} large onClick={() => app.dialog({ kind: 'selectData', data: o.id })} />
      </RibbonGroup>
      <RibbonGroup label={t('Type')} icon={ChartColumn}>
        <RibbonButton icon={ChartColumn} label={t('Change Chart Type')} large onClick={() => app.dialog({ kind: 'changeChartType', data: o.id })} />
        <MenuButton
          icon={LayoutTemplate}
          label={t('Templates')}
          large
          wide
          items={[
            {
              label: t('Save as Template…'),
              onClick: () =>
                app.dialog({ kind: 'prompt', title: t('Save Chart Template'), message: t('Template name:'), onText: (name) => { saveChartTemplate(o, name); doc.emit() } }),
            },
            ...(chartTemplates().length ? (['separator', { heading: t('Apply a template') }] as MenuItem[]) : []),
            ...chartTemplates().map((tp): MenuItem => ({ label: tp.name, onClick: () => set(templatePatch(o, tp), tx('Apply Chart Template')) })),
            ...(chartTemplates().length ? (['separator', { heading: t('Delete a template') }] as MenuItem[]) : []),
            ...chartTemplates().map((tp): MenuItem => ({ label: t('Delete "{name}"', { name: tp.name }), onClick: () => { deleteChartTemplate(tp.name); doc.emit() } })),
          ]}
        />
      </RibbonGroup>
      <RibbonGroup label={t('Location')} icon={Move}>
        <RibbonButton icon={Move} label={t('Move Chart')} large onClick={() => app.dialog({ kind: 'moveChart', data: o.id })} />
      </RibbonGroup>
    </>
  )
}

/** Chart Format > Format Data Point: the fill color of one bar, slice or marker. */
function DataPointMenu({ chart }: { chart: ChartDef }) {
  const app = useApp()
  const doc = app.doc
  const [si, setSi] = useState(0)
  const [pi, setPi] = useState(0)
  const data = chartData(doc.wb, doc.engine, chart)
  const pieLike = chart.type === 'pie' || chart.type === 'doughnut'
  const series = pieLike ? data.series.slice(0, 1) : data.series
  const key = `${Math.min(si, series.length - 1)}:${pi}`
  const setColor = (c: string | null) => {
    const pointColors = { ...(chart.pointColors ?? {}) }
    if (c) pointColors[key] = c
    else delete pointColors[key]
    updateChart(doc, chart.id, { pointColors: Object.keys(pointColors).length ? pointColors : undefined }, tx('Format Data Point'))
  }
  return (
    <PopoverButton icon={PaintBucket} label={t('Format Data Point')} large>
      {(close) => (
        <div className="palette-menu data-point-menu">
          {!pieLike && (
            <label>
              {t('Series:')}{' '}
              <select value={si} onChange={(e) => setSi(Number(e.target.value))}>
                {series.map((s, i) => (
                  <option key={i} value={i}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {t('Point:')}{' '}
            <select value={pi} onChange={(e) => setPi(Number(e.target.value))}>
              {(data.categories.length ? data.categories : (series[0]?.values ?? []).map((_, i) => String(i + 1))).map((c, i) => (
                <option key={i} value={i}>
                  {c || String(i + 1)}
                </option>
              ))}
            </select>
          </label>
          <FontColorPalette
            autoLabel={t('Automatic')}
            onAuto={() => {
              setColor(null)
              close()
            }}
            onPick={(c) => {
              setColor(c)
              close()
            }}
          />
          {chart.pointColors && (
            <button type="button" className="btn" onClick={() => { updateChart(doc, chart.id, { pointColors: undefined }, tx('Format Data Point')); close() }}>
              {t('Reset all data points')}
            </button>
          )}
        </div>
      )}
    </PopoverButton>
  )
}

function ColorMenu({ icon, label, onPick, none }: { icon: typeof PaintBucket; label: string; onPick: (c: string | null) => void; none?: string }) {
  return (
    <PopoverButton icon={icon} label={label} showLabel>
      {(close) => (
        <div className="palette-menu">
          <FontColorPalette
            autoLabel={none ?? t('No Fill')}
            onAuto={() => {
              onPick(null)
              close()
            }}
            onPick={(c) => {
              onPick(c)
              close()
            }}
          />
        </div>
      )}
    </PopoverButton>
  )
}

export function ChartFormatTab() {
  const app = useApp()
  const doc = app.doc
  useDocVersion(doc)
  const o = selectedObject(doc)
  if (!o || o.kind !== 'chart') return null
  return (
    <>
      <RibbonGroup label={t('Current Selection')} icon={Pencil}>
        <div className="col">
          <RibbonButton icon={Pencil} label={t('Format Selection')} showLabel onClick={() => app.setPane('format')} />
          <RibbonButton icon={Eraser} label={t('Reset to Match Style')} showLabel onClick={() => updateChart(doc, o.id, { fill: undefined, border: undefined, fontColor: undefined }, tx('Reset Style'))} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Data Point')} icon={PaintBucket}>
        <DataPointMenu chart={o} />
      </RibbonGroup>
      <RibbonGroup label={t('Shape Styles')} icon={PaintBucket}>
        <div className="col">
          <ColorMenu icon={PaintBucket} label={t('Shape Fill')} onPick={(c) => updateChart(doc, o.id, { fill: c ?? undefined }, tx('Shape Fill'))} />
          <ColorMenu icon={PenLine} label={t('Shape Outline')} none={t('No Outline')} onPick={(c) => updateChart(doc, o.id, { border: c ?? 'transparent' }, tx('Shape Outline'))} />
          <ColorMenu icon={Type} label={t('Text Fill')} none={t('Automatic')} onPick={(c) => updateChart(doc, o.id, { fontColor: c ?? undefined }, tx('Text Fill'))} />
        </div>
      </RibbonGroup>
      <ArrangeGroup o={o} />
      <SizeGroup o={o} />
    </>
  )
}

export function ShapeGallery({ onPick }: { onPick: (id: string) => void }) {
  const groups = [...new Set(SHAPES.map((s) => s.group))]
  return (
    <div className="shape-gallery">
      {groups.map((g) => (
        <div key={g}>
          <div className="menu-heading">{t(g)}</div>
          <div className="shape-grid">
            {SHAPES.filter((s) => s.group === g).map((s) => (
              <button key={s.id} type="button" className="shape-item" title={t(s.label)} aria-label={t(s.label)} onMouseDown={keepFocus} onClick={() => onPick(s.id)}>
                <span dangerouslySetInnerHTML={{ __html: shapeSVG({ shape: s.id, fill: s.line ? null : '#ffffff', line: '#444', lineWidth: 1 }, 20, 16) }} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function ObjectFormatTab() {
  const app = useApp()
  const doc = app.doc
  useDocVersion(doc)
  const o = selectedObject(doc)
  if (!o || o.kind === 'chart' || o.kind === 'slicer') return null
  const upd = (patch: Partial<ShapeObj> | Partial<PictureObj>, label = tx('Format Shape')) => updateObject(doc, o.id, patch as Partial<SheetObject>, label)
  if (o.kind === 'picture')
    return (
      <>
        <RibbonGroup label={t('Picture Styles')} icon={ImageIcon}>
          <ColorMenu icon={PenLine} label={t('Picture Border')} none={t('No Outline')} onPick={(c) => upd({ border: c ?? undefined }, tx('Picture Border'))} />
          <RibbonButton icon={Type} label={t('Alt Text')} large onClick={() => app.dialog({ kind: 'altText', data: o.id })} />
          <RibbonButton icon={Maximize2} label={t('Reset Size')} large onClick={() => {
            const img = new Image()
            img.onload = () => upd({ anchor: { ...o.anchor, w: img.naturalWidth, h: img.naturalHeight } } as Partial<PictureObj>, tx('Reset Picture'))
            img.src = doc.wb.images.get(o.image) ?? ''
          }} />
        </RibbonGroup>
        <ArrangeGroup o={o} />
        <SizeGroup o={o} />
      </>
    )
  return (
    <>
      <RibbonGroup label={t('Insert Shapes')} icon={Shapes}>
        <PopoverButton icon={Shapes} label={t('Shapes')} large className="shape-menu">
          {(close) => (
            <ShapeGallery
              onPick={(id) => {
                close()
                upd({ shape: id }, tx('Change Shape'))
              }}
            />
          )}
        </PopoverButton>
      </RibbonGroup>
      <RibbonGroup label={t('Shape Styles')} icon={PaintBucket}>
        <div className="col">
          <ColorMenu icon={PaintBucket} label={t('Shape Fill')} onPick={(c) => upd({ fill: c })} />
          <ColorMenu icon={PenLine} label={t('Shape Outline')} none={t('No Outline')} onPick={(c) => upd({ line: c })} />
          <MenuButton icon={Minus} label={t('Weight')} showLabel items={[0.75, 1, 1.5, 2.25, 3, 4.5, 6].map((w) => ({ label: `${w} pt`, checked: o.lineWidth === w, onClick: () => upd({ lineWidth: w }) }))} />
        </div>
        <MenuButton
          icon={Sparkles}
          label={t('Text Effects')}
          large
          items={[
            { label: t('None'), checked: !o.effect, onClick: () => upd({ effect: undefined }) },
            { label: t('Shadow'), checked: o.effect === 'shadow', onClick: () => upd({ effect: 'shadow' }) },
            { label: t('Glow'), checked: o.effect === 'glow', onClick: () => upd({ effect: 'glow' }) },
            { label: t('Outline'), checked: o.effect === 'outline', onClick: () => upd({ effect: 'outline' }) },
          ]}
        />
      </RibbonGroup>
      <RibbonGroup label={t('Text')} icon={Type}>
        <div className="col">
          <div className="row">
            <RibbonButton icon={Bold} label={t('Bold')} active={o.bold} onClick={() => upd({ bold: !o.bold })} />
            <RibbonButton icon={Italic} label={t('Italic')} active={o.italic} onClick={() => upd({ italic: !o.italic })} />
            <RibbonButton icon={TextAlignStart} label={t('Align Left')} active={o.align === 'left'} onClick={() => upd({ align: 'left' })} />
            <RibbonButton icon={TextAlignCenter} label={t('Center')} active={o.align === 'center'} onClick={() => upd({ align: 'center' })} />
            <RibbonButton icon={TextAlignEnd} label={t('Align Right')} active={o.align === 'right'} onClick={() => upd({ align: 'right' })} />
          </div>
          <div className="row">
            <ColorMenu icon={Type} label={t('Text Fill')} none={t('Automatic')} onPick={(c) => upd({ textColor: c ?? '#000000' })} />
            <MenuButton icon={Type} label={`${o.fontSize} pt`} showLabel items={[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72].map((n) => ({ label: String(n), checked: o.fontSize === n, onClick: () => upd({ fontSize: n }) }))} />
          </div>
          <MenuButton
            icon={ArrowUpToLine}
            label={t('Align Text')}
            showLabel
            items={(['top', 'middle', 'bottom'] as const).map((v) => ({ label: v === 'top' ? t('Top') : v === 'middle' ? t('Middle') : t('Bottom'), checked: o.vAlign === v, onClick: () => upd({ vAlign: v }) }))}
          />
        </div>
      </RibbonGroup>
      <ArrangeGroup o={o} />
      <SizeGroup o={o} />
    </>
  )
}

void ArrowDownToLine

// ---------- tables ----------

export function TableStylePreview({ id, onClick, active }: { id: string; onClick: () => void; active?: boolean }) {
  const spec = tableStyleSpec(id)
  const rows = [0, 1, 2, 3, 4]
  const cell = (r: number) => {
    if (!spec) return { background: '#fff', borderBottom: '1px solid #ddd' }
    if (r === 0) return { background: spec.header.fill ?? '#fff', borderBottom: spec.header.bb ? `1px solid ${spec.header.bb.color}` : undefined }
    const band = (r - 1) % 2 === 0 ? spec.band1 : spec.band2
    return { background: band ?? '#fff', borderBottom: spec.inner ? `1px solid ${spec.inner}` : undefined }
  }
  return (
    <button type="button" className={`tstyle${active ? ' is-active' : ''}`} title={tableStyleLabel(id)} aria-label={tableStyleLabel(id)} onMouseDown={keepFocus} onClick={onClick} style={{ borderColor: spec?.outer }}>
      {rows.map((r) => (
        <span key={r} style={cell(r)} />
      ))}
    </button>
  )
}

export function TableStyleGallery({ current, onPick, includeNone }: { current?: string; onPick: (id: string) => void; includeNone?: boolean }) {
  const app = useApp()
  const own = app.doc.wb.tableStyles
  return (
    <div className="tstyle-gallery">
      {own.length > 0 && (
        <div>
          <div className="menu-heading">{t('Custom')}</div>
          <div className="tstyle-grid">
            {own.map((s) => (
              <TableStylePreview key={s.name} id={s.name} active={current === s.name} onClick={() => onPick(s.name)} />
            ))}
          </div>
        </div>
      )}
      {TABLE_STYLE_GROUPS.map((g) => (
        <div key={g.group}>
          <div className="menu-heading">{t(g.group)}</div>
          <div className="tstyle-grid">
            {includeNone && g.group === 'Light' && <TableStylePreview id="none" active={current === 'none'} onClick={() => onPick('none')} />}
            {Array.from({ length: g.count }, (_, i) => `TableStyle${g.group}${i + 1}`).map((id) => (
              <TableStylePreview key={id} id={id} active={current === id} onClick={() => onPick(id)} />
            ))}
          </div>
        </div>
      ))}
      <div className="menu-sep" />
      <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => app.dialog({ kind: 'newTableStyle' })}>{t('New Table Style…')}</button>
    </div>
  )
}

function TableNameBox({ t: table }: { t: TableDef }) {
  const app = useApp()
  const [name, setName] = useState(table.name)
  useEffect(() => setName(table.name), [table.name])
  return (
    <label className="name-field">
      {t('Table Name:')}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setName(table.name)
            e.currentTarget.blur()
          }
        }}
        onBlur={() => {
          if (name === table.name) return
          const err = renameTable(app.doc, table.id, name)
          if (err) {
            app.alert(err)
            setName(table.name)
          }
        }}
      />
    </label>
  )
}

export function TableDesignTab() {
  const app = useApp()
  const doc = app.doc
  useDocVersion(doc)
  const a = doc.sel.active
  const table = tableAt(doc.sheet, a.r, a.c)
  if (!table) return null
  const opt = (key: 'bandRows' | 'bandCols' | 'firstCol' | 'lastCol' | 'filterButton', v: boolean) =>
    updateTable(doc, table.id, (tb, sheet) => {
      tb[key] = v
      if (key === 'filterButton' && !v) {
        tb.filters = {}
        applyFilters(doc, sheet)
      }
    }, tx('Table Style Options'))
  return (
    <>
      <RibbonGroup label={t('Properties')} icon={TableProperties}>
        <div className="col">
          <TableNameBox t={table} />
          <RibbonButton icon={Scaling} label={t('Resize Table')} showLabel onClick={() => app.dialog({ kind: 'resizeTable', data: table.id })} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Tools')} icon={Combine}>
        <div className="col">
          <RibbonButton icon={FileStack} label={t('Summarize with PivotTable')} showLabel onClick={() => app.dialog({ kind: 'createPivot', data: absRef(doc.sheet, table.range) })} />
          <RibbonButton icon={Filter} label={t('Insert Slicer')} showLabel onClick={() => app.dialog({ kind: 'insertSlicer', data: { type: 'table', table: table.name } })} />
          <RibbonButton icon={CopyMinus} label={t('Remove Duplicates')} showLabel onClick={() => {
            doc.selectRange(table.range)
            app.dialog({ kind: 'removeDuplicates' })
          }} />
          <RibbonButton icon={Grid3x3} label={t('Convert to Range')} showLabel onClick={() => app.confirm(t('Do you want to convert the table to a normal range?'), () => convertToRange(doc, table.id), t('Convert to Range'))} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Table Style Options')} icon={ListChecks}>
        <div className="col checks">
          <CheckItem label={t('Header Row')} checked={table.header} onChange={(v) => setHeaderRow(doc, table.id, v)} />
          <CheckItem label={t('Total Row')} checked={table.totals} onChange={(v) => setTotalsRow(doc, table.id, v)} />
          <CheckItem label={t('Banded Rows')} checked={table.bandRows} onChange={(v) => opt('bandRows', v)} />
        </div>
        <div className="col checks">
          <CheckItem label={t('First Column')} checked={table.firstCol} onChange={(v) => opt('firstCol', v)} />
          <CheckItem label={t('Last Column')} checked={table.lastCol} onChange={(v) => opt('lastCol', v)} />
          <CheckItem label={t('Banded Columns')} checked={table.bandCols} onChange={(v) => opt('bandCols', v)} />
        </div>
        <div className="col checks">
          <CheckItem label={t('Filter Button')} checked={table.filterButton} onChange={(v) => opt('filterButton', v)} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Table Styles')} icon={Table2}>
        <PopoverButton icon={Table2} label={t('Quick Styles')} large className="tstyle-menu">
          {(close) => (
            <TableStyleGallery
              current={table.style}
              includeNone
              onPick={(id) => {
                close()
                updateTable(doc, table.id, (tb) => (tb.style = id), tx('Table Style'))
              }}
            />
          )}
        </PopoverButton>
      </RibbonGroup>
    </>
  )
}

// ---------- PivotTables ----------

export function PivotAnalyzeTab() {
  const app = useApp()
  const doc = app.doc
  useDocVersion(doc)
  const a = doc.sel.active
  const p = pivotAt(doc.sheet, a.r, a.c)
  if (!p) return null
  return (
    <>
      <RibbonGroup label={t('PivotTable')} icon={Table2}>
        <div className="col">
          <span className="ribbon-caption">{t('PivotTable Name:')}</span>
          <strong className="ribbon-caption">{p.name}</strong>
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Active Field')} icon={Rows3}>
        <div className="col">
          <RibbonButton icon={Plus} label={t('Expand Field')} showLabel onClick={() => updatePivot(doc, p.id, (x) => (x.collapsed = []), tx('Expand Field'))} />
          <RibbonButton icon={Minus} label={t('Collapse Field')} showLabel onClick={() => updatePivot(doc, p.id, (x) => {
            const out = x.output
            const vals = new Set<string>()
            if (out && x.rows.length > 1) {
              for (let r = out.r1; r <= out.r2; r++) {
                const v = doc.value(r, x.c)
                const st = doc.style(r, x.c)
                if (typeof v === 'string' && st.bold && v !== 'Grand Total' && v !== 'Row Labels') vals.add(v)
              }
            }
            x.collapsed = [...vals]
          }, tx('Collapse Field'))} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Group')} icon={Group}>
        <div className="col">
          <RibbonButton icon={Group} label={t('Group Field')} showLabel onClick={() => app.dialog({ kind: 'pivotGroup', data: p.id })} />
          <RibbonButton icon={Ungroup} label={t('Ungroup')} showLabel disabled={!p.groups} onClick={() => {
            const fields = Object.keys(p.groups ?? {})
            for (const f of fields) groupPivotField(doc, p.id, f, null)
          }} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Filter')} icon={Filter}>
        <RibbonButton icon={Filter} label={t('Insert Slicer')} large onClick={() => app.dialog({ kind: 'insertSlicer', data: { type: 'pivot', pivot: p.id } })} />
        <RibbonButton icon={CalendarRange} label={t('Insert Timeline')} large onClick={() => app.dialog({ kind: 'insertSlicer', data: { type: 'pivot', pivot: p.id, timeline: true } })} />
      </RibbonGroup>
      <RibbonGroup label={t('Calculations')} icon={Sigma}>
        <RibbonButton icon={Sigma} label={t('Calculated Field')} large title={t('Fields, Items & Sets: Calculated Field')} onClick={() => app.dialog({ kind: 'calcField', data: p.id })} />
      </RibbonGroup>
      <RibbonGroup label={t('Data')} icon={RefreshCw}>
        <RibbonButton icon={RefreshCw} label={t('Refresh')} large title={t('Refresh (Alt+F5)')} onClick={() => updatePivot(doc, p.id, () => {}, tx('Refresh'))} />
        <RibbonButton icon={Database} label={t('Change Data Source')} large onClick={() => app.dialog({ kind: 'pivotSource', data: p.id })} />
      </RibbonGroup>
      <RibbonGroup label={t('Actions')} icon={Move}>
        <div className="col">
          <RibbonButton icon={Eraser} label={t('Clear All')} showLabel onClick={() => updatePivot(doc, p.id, (x) => Object.assign(x, { rows: [], cols: [], values: [], filters: [] }), tx('Clear PivotTable'))} />
          <RibbonButton icon={Move} label={t('Move PivotTable')} showLabel onClick={() => app.dialog({ kind: 'movePivot', data: p.id })} />
          <RibbonButton icon={Trash2} label={t('Delete PivotTable')} showLabel onClick={() => app.confirm(t('Delete this PivotTable?'), () => deletePivot(doc, p.id), t('Delete PivotTable'))} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Tools')} icon={BarChart3}>
        <RibbonButton icon={BarChart3} label={t('PivotChart')} large onClick={() => {
          if (!p.output) return
          app.dialog({ kind: 'insertChart', data: absRef(doc.sheet, { ...p.output, r1: p.output.r1 + p.filters.length + (p.filters.length ? 1 : 0) + (p.cols.length ? 1 : 0), r2: p.output.r2 - (p.grandRows ? 1 : 0) }) })
        }} />
      </RibbonGroup>
      <RibbonGroup label={t('Show')} icon={PanelRight}>
        <RibbonButton icon={PanelRight} label={t('Field List')} large active={app.pane === 'pivot'} onClick={() => app.setPane(app.pane === 'pivot' ? null : 'pivot')} />
      </RibbonGroup>
    </>
  )
}

export function PivotDesignTab() {
  const app = useApp()
  const doc = app.doc
  useDocVersion(doc)
  const a = doc.sel.active
  const p = pivotAt(doc.sheet, a.r, a.c)
  if (!p) return null
  const upd = (fn: (x: PivotDef) => void, label: string) => updatePivot(doc, p.id, fn, label)
  return (
    <>
      <RibbonGroup label={t('Layout')} icon={LayoutTemplate}>
        <MenuButton icon={Sigma} label={t('Subtotals')} large items={[
          { label: t('Do Not Show Subtotals'), checked: !p.subtotals, onClick: () => upd((x) => (x.subtotals = false), tx('Subtotals')) },
          { label: t('Show all Subtotals at Top of Group'), checked: p.subtotals, onClick: () => upd((x) => (x.subtotals = true), tx('Subtotals')) },
        ]} />
        <MenuButton icon={Sigma} label={t('Grand Totals')} large items={[
          { label: t('Off for Rows and Columns'), checked: !p.grandRows && !p.grandCols, onClick: () => upd((x) => { x.grandRows = false; x.grandCols = false }, tx('Grand Totals')) },
          { label: t('On for Rows and Columns'), checked: p.grandRows && p.grandCols, onClick: () => upd((x) => { x.grandRows = true; x.grandCols = true }, tx('Grand Totals')) },
          { label: t('On for Rows Only'), checked: p.grandRows && !p.grandCols, onClick: () => upd((x) => { x.grandRows = true; x.grandCols = false }, tx('Grand Totals')) },
          { label: t('On for Columns Only'), checked: !p.grandRows && p.grandCols, onClick: () => upd((x) => { x.grandRows = false; x.grandCols = true }, tx('Grand Totals')) },
        ]} />
        <MenuButton icon={Table2} label={t('Report Layout')} large items={[
          { label: t('Show in Compact Form'), checked: p.layout === 'compact', onClick: () => upd((x) => (x.layout = 'compact'), tx('Report Layout')) },
          { label: t('Show in Outline Form'), checked: p.layout === 'outline', onClick: () => upd((x) => (x.layout = 'outline'), tx('Report Layout')) },
          { label: t('Show in Tabular Form'), checked: p.layout === 'tabular', onClick: () => upd((x) => (x.layout = 'tabular'), tx('Report Layout')) },
        ]} />
      </RibbonGroup>
      <RibbonGroup label={t('PivotTable Style Options')} icon={ListChecks}>
        <div className="col checks">
          <CheckItem label={t('Banded Rows')} checked={p.bandRows} onChange={(v) => upd((x) => (x.bandRows = v), tx('Banded Rows'))} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('PivotTable Styles')} icon={Table2}>
        <PopoverButton icon={Table2} label={t('Styles')} large className="tstyle-menu">
          {(close) => (
            <TableStyleGallery
              current={p.style}
              onPick={(id) => {
                close()
                upd((x) => (x.style = id), 'PivotTable Style')
              }}
            />
          )}
        </PopoverButton>
      </RibbonGroup>
    </>
  )
}

// ---------- Slicer ----------

export function SlicerTab() {
  const app = useApp()
  const doc = app.doc
  useDocVersion(doc)
  const o = selectedObject(doc)
  if (!o || o.kind !== 'slicer') return null
  const upd = (patch: Partial<SlicerObj>, label: string) => updateObject(doc, o.id, patch as Partial<SheetObject>, label)
  return (
    <>
      <RibbonGroup label={t('Slicer')} icon={Filter}>
        <div className="col">
          <span className="ribbon-caption">{t('Slicer Caption:')}</span>
          <input className="ribbon-input" aria-label={t('Slicer Caption')} defaultValue={o.caption} key={o.id} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} onBlur={(e) => e.target.value !== o.caption && upd({ caption: e.target.value }, tx('Slicer Caption'))} />
        </div>
        <RibbonButton icon={FilterX} label={t('Clear Filter')} large title={t('Clear Filter (Alt+C)')} disabled={o.selected === null} onClick={() => clearSlicer(doc, o.id)} />
        <RibbonButton icon={ListChecks} label={t('Multi-Select')} large active={!!o.multi} title={t('Multi-Select (Alt+S)')} onClick={() => upd({ multi: !o.multi }, tx('Multi-Select'))} />
      </RibbonGroup>
      <RibbonGroup label={t('Slicer Styles')} icon={Paintbrush}>
        <div className="slicer-styles">
          {SLICER_COLORS.map((c) => (
            <button key={c} type="button" className={o.color === c ? 'is-active' : undefined} title={t('Slicer Style')} aria-label={t('Slicer style {n}', { n: c })} onMouseDown={keepFocus} onClick={() => upd({ color: c }, tx('Slicer Style'))}>
              <span style={{ background: c }} />
              <span style={{ background: c, opacity: 0.45 }} />
            </button>
          ))}
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Buttons')} icon={Grid3x3}>
        <label className="ribbon-field">
          {t('Columns:')}{' '}
          <input type="number" min={1} max={20} value={o.columns} onChange={(e) => upd({ columns: Math.max(1, Math.min(20, Number(e.target.value) || 1)) }, tx('Slicer Columns'))} />
        </label>
      </RibbonGroup>
      <ArrangeGroup o={o} />
      <SizeGroup o={o} />
    </>
  )
}
