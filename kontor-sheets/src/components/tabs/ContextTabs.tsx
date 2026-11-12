// Contextual ribbon tabs: Chart Design / Format, Shape Format, Table Design, PivotTable Analyze / Design.
import {
  ArrowDownToLine, ArrowUpToLine, BarChart3, BringToFront, ChartColumn, Combine, Database, Eraser, FileStack, Grid3x3, Layers, LayoutTemplate, ListChecks, Move,
  Paintbrush, PaintBucket, PanelRight, PenLine, Pencil, Plus, RefreshCw, Repeat, RotateCw, Rows3, Scaling, SendToBack, Shapes, Sigma, Sparkles, Table2, TableProperties,
  Trash2, Type, Bold, Italic, ImageIcon, TextAlignStart, TextAlignCenter, TextAlignEnd, CopyMinus, Minus, Maximize2, Group, Ungroup, Filter, FilterX,
  CalendarRange,
} from 'lucide-react'
import type { ChartDef, ChartSeries, PictureObj, PivotDef, ShapeObj, SheetObject, SlicerObj, TableDef } from '../../model/extras'
import { arrangeObject, deleteObject, selectedObject, tableAt, pivotAt, updateObject, updateChart } from '../../commands/objects'
import { convertToRange, renameTable, setHeaderRow, setTotalsRow, tableStyleLabel, tableStyleSpec, TABLE_STYLE_GROUPS, updateTable } from '../../commands/tables'
import { applyFilters } from '../../commands/filter'
import { deletePivot, groupPivotField, updatePivot } from '../../commands/pivot'
import { SLICER_COLORS, clearSlicer } from '../../commands/slicers'
import { absRef, chartSeries } from '../../charts/chartData'
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
  const set = (patch: Partial<SheetObject['anchor']>) => updateObject(app.doc, o.id, { anchor: { ...o.anchor, ...patch } }, 'Size')
  return (
    <RibbonGroup label="Size" icon={Scaling}>
      <div className="col">
        <Spinner label="Height" value={Math.abs(o.anchor.h)} step={9.6} min={4} max={20000} format={inches} parse={parseInches} onChange={(v) => set({ h: v })} />
        <Spinner label="Width" value={Math.abs(o.anchor.w)} step={9.6} min={4} max={20000} format={inches} parse={parseInches} onChange={(v) => set({ w: v })} />
      </div>
    </RibbonGroup>
  )
}

function ArrangeGroup({ o }: { o: SheetObject }) {
  const app = useApp()
  const doc = app.doc
  return (
    <RibbonGroup label="Arrange" icon={Layers}>
      <div className="col">
        <MenuButton icon={BringToFront} label="Bring Forward" showLabel items={[{ label: 'Bring Forward', onClick: () => arrangeObject(doc, o.id, 'forward') }, { label: 'Bring to Front', onClick: () => arrangeObject(doc, o.id, 'front') }]} />
        <MenuButton icon={SendToBack} label="Send Backward" showLabel items={[{ label: 'Send Backward', onClick: () => arrangeObject(doc, o.id, 'backward') }, { label: 'Send to Back', onClick: () => arrangeObject(doc, o.id, 'back') }]} />
        <RibbonButton icon={PanelRight} label="Selection Pane" showLabel onClick={() => app.setPane('selection')} />
      </div>
      {o.kind !== 'chart' && (
        <MenuButton
          icon={RotateCw}
          label="Rotate"
          large
          items={[
            { label: 'Rotate Right 90°', onClick: () => updateObject(doc, o.id, { rotation: (((o as ShapeObj).rotation ?? 0) + 90) % 360 } as Partial<SheetObject>, 'Rotate') },
            { label: 'Rotate Left 90°', onClick: () => updateObject(doc, o.id, { rotation: (((o as ShapeObj).rotation ?? 0) + 270) % 360 } as Partial<SheetObject>, 'Rotate') },
            { label: 'Reset Rotation', onClick: () => updateObject(doc, o.id, { rotation: 0 } as Partial<SheetObject>, 'Rotate') },
          ]}
        />
      )}
      <RibbonButton icon={Trash2} label="Delete" large onClick={() => deleteObject(doc, o.id)} />
    </RibbonGroup>
  )
}

// ---------- charts ----------

export const QUICK_LAYOUTS: { label: string; patch: Partial<ChartDef> }[] = [
  { label: 'Layout 1: title, legend right', patch: { title: { show: true }, legend: 'right', dataLabels: 'none', axisTitles: {} } },
  { label: 'Layout 2: title, legend top, data labels', patch: { title: { show: true }, legend: 'top', dataLabels: 'value', gridlines: { major: false, minor: false, vertical: false } } },
  { label: 'Layout 3: title, legend bottom', patch: { title: { show: true }, legend: 'bottom', dataLabels: 'none', axisTitles: {} } },
  { label: 'Layout 4: no title, data labels, legend bottom', patch: { title: { show: false }, legend: 'bottom', dataLabels: 'value' } },
  { label: 'Layout 5: title and axis titles', patch: { title: { show: true }, legend: 'none', axisTitles: { x: 'Axis Title', y: 'Axis Title' } } },
  { label: 'Layout 6: axis titles, legend right', patch: { title: { show: true }, legend: 'right', axisTitles: { y: 'Axis Title' } } },
]

export function ChartDesignTab() {
  const app = useApp()
  const doc = app.doc
  useDocVersion(doc)
  const o = selectedObject(doc)
  if (!o || o.kind !== 'chart') return null
  const set = (patch: Partial<ChartDef>, label = 'Chart Element') => updateChart(doc, o.id, patch, label)
  const trendAll = (t: ChartSeries['trendline']) => {
    const series = chartSeries(doc.wb, doc.engine, o).map((s, i) => (i === 0 || t === undefined ? { ...s, trendline: t } : s))
    set({ series }, 'Trendline')
  }
  const elementItems: MenuItem[] = [
    { heading: 'Axes' },
    { label: 'Primary Horizontal', checked: o.axes.x, onClick: () => set({ axes: { ...o.axes, x: !o.axes.x } }) },
    { label: 'Primary Vertical', checked: o.axes.y, onClick: () => set({ axes: { ...o.axes, y: !o.axes.y } }) },
    { heading: 'Axis Titles' },
    { label: 'Primary Horizontal', checked: !!o.axisTitles.x, onClick: () => set({ axisTitles: { ...o.axisTitles, x: o.axisTitles.x ? undefined : 'Axis Title' } }) },
    { label: 'Primary Vertical', checked: !!o.axisTitles.y, onClick: () => set({ axisTitles: { ...o.axisTitles, y: o.axisTitles.y ? undefined : 'Axis Title' } }) },
    { heading: 'Chart Title' },
    { label: 'None', checked: !o.title.show, onClick: () => set({ title: { ...o.title, show: false } }) },
    { label: 'Above Chart', checked: o.title.show && !o.title.overlay, onClick: () => set({ title: { ...o.title, show: true, overlay: false } }) },
    { label: 'Centered Overlay', checked: o.title.show && !!o.title.overlay, onClick: () => set({ title: { ...o.title, show: true, overlay: true } }) },
    { heading: 'Data Labels' },
    ...(['none', 'value', 'percent', 'category'] as const).map((d): MenuItem => ({ label: d === 'none' ? 'None' : d === 'value' ? 'Value' : d === 'percent' ? 'Percentage' : 'Category Name', checked: o.dataLabels === d, onClick: () => set({ dataLabels: d }) })),
    { heading: 'Gridlines' },
    { label: 'Primary Major Horizontal', checked: o.gridlines.major, onClick: () => set({ gridlines: { ...o.gridlines, major: !o.gridlines.major } }) },
    { label: 'Primary Minor Horizontal', checked: o.gridlines.minor, onClick: () => set({ gridlines: { ...o.gridlines, minor: !o.gridlines.minor } }) },
    { label: 'Primary Major Vertical', checked: o.gridlines.vertical, onClick: () => set({ gridlines: { ...o.gridlines, vertical: !o.gridlines.vertical } }) },
    { heading: 'Legend' },
    ...(['none', 'right', 'top', 'left', 'bottom'] as const).map((l): MenuItem => ({ label: l[0].toUpperCase() + l.slice(1), checked: o.legend === l, onClick: () => set({ legend: l }) })),
    { heading: 'Error Bars' },
    { label: 'None', checked: !o.errorBars, onClick: () => set({ errorBars: undefined }, 'Error Bars') },
    { label: 'Standard Error', checked: o.errorBars?.type === 'stdErr', onClick: () => set({ errorBars: { type: 'stdErr', value: 1 } }, 'Error Bars') },
    { label: 'Percentage', checked: o.errorBars?.type === 'percent', onClick: () => set({ errorBars: { type: 'percent', value: 5 } }, 'Error Bars') },
    { label: 'Standard Deviation', checked: o.errorBars?.type === 'stdDev', onClick: () => set({ errorBars: { type: 'stdDev', value: 1 } }, 'Error Bars') },
    { heading: 'Trendline' },
    { label: 'None', onClick: () => trendAll(undefined) },
    { label: 'Linear', onClick: () => trendAll('linear') },
    { label: 'Exponential', onClick: () => trendAll('exponential') },
    { label: 'Logarithmic', onClick: () => trendAll('logarithmic') },
    { label: 'Moving Average', onClick: () => trendAll('movingAverage') },
  ]
  return (
    <>
      <RibbonGroup label="Chart Layouts" icon={LayoutTemplate}>
        <MenuButton icon={Plus} label="Add Chart Element" large wide items={elementItems} />
        <MenuButton icon={LayoutTemplate} label="Quick Layout" large wide items={QUICK_LAYOUTS.map((l) => ({ label: l.label, onClick: () => set(l.patch, 'Quick Layout') }))} />
      </RibbonGroup>
      <RibbonGroup label="Chart Styles" icon={Paintbrush}>
        <MenuButton
          icon={Paintbrush}
          label="Change Colors"
          large
          wide
          items={PALETTES.map((p, i): MenuItem => ({
            label: p.name,
            active: o.palette === i,
            preview: (
              <span className="pal-preview">
                {p.colors.slice(0, 6).map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </span>
            ),
            onClick: () => set({ palette: i }, 'Change Colors'),
          }))}
        />
        <div className="chart-style-row">
          {CHART_STYLES.map((st, i) => (
            <button key={i} type="button" className={`chart-style${o.style === i + 1 ? ' is-active' : ''}`} title={`Style ${i + 1}`} onMouseDown={keepFocus} onClick={() => set({ style: i + 1 }, 'Chart Style')} style={{ background: st.bg }}>
              <span style={{ background: PALETTES[o.palette]?.colors[0] ?? '#2E6FD8', height: 14 }} />
              <span style={{ background: PALETTES[o.palette]?.colors[1] ?? '#F28C28', height: 20 }} />
              <span style={{ background: PALETTES[o.palette]?.colors[0] ?? '#2E6FD8', height: 10 }} />
            </button>
          ))}
        </div>
      </RibbonGroup>
      <RibbonGroup label="Data" icon={Database}>
        <RibbonButton icon={Repeat} label="Switch Row/Column" large onClick={() => set({ byRow: !o.byRow, series: undefined }, 'Switch Row/Column')} />
        <RibbonButton icon={Table2} label="Select Data" large onClick={() => app.dialog({ kind: 'selectData', data: o.id })} />
      </RibbonGroup>
      <RibbonGroup label="Type" icon={ChartColumn}>
        <RibbonButton icon={ChartColumn} label="Change Chart Type" large onClick={() => app.dialog({ kind: 'changeChartType', data: o.id })} />
      </RibbonGroup>
      <RibbonGroup label="Location" icon={Move}>
        <RibbonButton icon={Move} label="Move Chart" large onClick={() => app.dialog({ kind: 'moveChart', data: o.id })} />
      </RibbonGroup>
    </>
  )
}

function ColorMenu({ icon, label, onPick, none }: { icon: typeof PaintBucket; label: string; onPick: (c: string | null) => void; none?: string }) {
  return (
    <PopoverButton icon={icon} label={label} showLabel>
      {(close) => (
        <div className="palette-menu">
          <FontColorPalette
            autoLabel={none ?? 'No Fill'}
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
      <RibbonGroup label="Current Selection" icon={Pencil}>
        <div className="col">
          <RibbonButton icon={Pencil} label="Format Selection" showLabel onClick={() => app.setPane('format')} />
          <RibbonButton icon={Eraser} label="Reset to Match Style" showLabel onClick={() => updateChart(doc, o.id, { fill: undefined, border: undefined, fontColor: undefined }, 'Reset Style')} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Shape Styles" icon={PaintBucket}>
        <div className="col">
          <ColorMenu icon={PaintBucket} label="Shape Fill" onPick={(c) => updateChart(doc, o.id, { fill: c ?? undefined }, 'Shape Fill')} />
          <ColorMenu icon={PenLine} label="Shape Outline" none="No Outline" onPick={(c) => updateChart(doc, o.id, { border: c ?? 'transparent' }, 'Shape Outline')} />
          <ColorMenu icon={Type} label="Text Fill" none="Automatic" onPick={(c) => updateChart(doc, o.id, { fontColor: c ?? undefined }, 'Text Fill')} />
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
          <div className="menu-heading">{g}</div>
          <div className="shape-grid">
            {SHAPES.filter((s) => s.group === g).map((s) => (
              <button key={s.id} type="button" className="shape-item" title={s.label} aria-label={s.label} onMouseDown={keepFocus} onClick={() => onPick(s.id)}>
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
  const upd = (patch: Partial<ShapeObj> | Partial<PictureObj>, label = 'Format Shape') => updateObject(doc, o.id, patch as Partial<SheetObject>, label)
  if (o.kind === 'picture')
    return (
      <>
        <RibbonGroup label="Picture Styles" icon={ImageIcon}>
          <ColorMenu icon={PenLine} label="Picture Border" none="No Outline" onPick={(c) => upd({ border: c ?? undefined }, 'Picture Border')} />
          <RibbonButton icon={Type} label="Alt Text" large onClick={() => app.dialog({ kind: 'altText', data: o.id })} />
          <RibbonButton icon={Maximize2} label="Reset Size" large onClick={() => {
            const img = new Image()
            img.onload = () => upd({ anchor: { ...o.anchor, w: img.naturalWidth, h: img.naturalHeight } } as Partial<PictureObj>, 'Reset Picture')
            img.src = doc.wb.images.get(o.image) ?? ''
          }} />
        </RibbonGroup>
        <ArrangeGroup o={o} />
        <SizeGroup o={o} />
      </>
    )
  return (
    <>
      <RibbonGroup label="Insert Shapes" icon={Shapes}>
        <PopoverButton icon={Shapes} label="Shapes" large className="shape-menu">
          {(close) => (
            <ShapeGallery
              onPick={(id) => {
                close()
                upd({ shape: id }, 'Change Shape')
              }}
            />
          )}
        </PopoverButton>
      </RibbonGroup>
      <RibbonGroup label="Shape Styles" icon={PaintBucket}>
        <div className="col">
          <ColorMenu icon={PaintBucket} label="Shape Fill" onPick={(c) => upd({ fill: c })} />
          <ColorMenu icon={PenLine} label="Shape Outline" none="No Outline" onPick={(c) => upd({ line: c })} />
          <MenuButton icon={Minus} label="Weight" showLabel items={[0.75, 1, 1.5, 2.25, 3, 4.5, 6].map((w) => ({ label: `${w} pt`, checked: o.lineWidth === w, onClick: () => upd({ lineWidth: w }) }))} />
        </div>
        <MenuButton
          icon={Sparkles}
          label="Text Effects"
          large
          items={[
            { label: 'None', checked: !o.effect, onClick: () => upd({ effect: undefined }) },
            { label: 'Shadow', checked: o.effect === 'shadow', onClick: () => upd({ effect: 'shadow' }) },
            { label: 'Glow', checked: o.effect === 'glow', onClick: () => upd({ effect: 'glow' }) },
            { label: 'Outline', checked: o.effect === 'outline', onClick: () => upd({ effect: 'outline' }) },
          ]}
        />
      </RibbonGroup>
      <RibbonGroup label="Text" icon={Type}>
        <div className="col">
          <div className="row">
            <RibbonButton icon={Bold} label="Bold" active={o.bold} onClick={() => upd({ bold: !o.bold })} />
            <RibbonButton icon={Italic} label="Italic" active={o.italic} onClick={() => upd({ italic: !o.italic })} />
            <RibbonButton icon={TextAlignStart} label="Align Left" active={o.align === 'left'} onClick={() => upd({ align: 'left' })} />
            <RibbonButton icon={TextAlignCenter} label="Center" active={o.align === 'center'} onClick={() => upd({ align: 'center' })} />
            <RibbonButton icon={TextAlignEnd} label="Align Right" active={o.align === 'right'} onClick={() => upd({ align: 'right' })} />
          </div>
          <div className="row">
            <ColorMenu icon={Type} label="Text Fill" none="Automatic" onPick={(c) => upd({ textColor: c ?? '#000000' })} />
            <MenuButton icon={Type} label={`${o.fontSize} pt`} showLabel items={[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72].map((n) => ({ label: String(n), checked: o.fontSize === n, onClick: () => upd({ fontSize: n }) }))} />
          </div>
          <MenuButton
            icon={ArrowUpToLine}
            label="Align Text"
            showLabel
            items={(['top', 'middle', 'bottom'] as const).map((v) => ({ label: v === 'top' ? 'Top' : v === 'middle' ? 'Middle' : 'Bottom', checked: o.vAlign === v, onClick: () => upd({ vAlign: v }) }))}
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
          <div className="menu-heading">Custom</div>
          <div className="tstyle-grid">
            {own.map((s) => (
              <TableStylePreview key={s.name} id={s.name} active={current === s.name} onClick={() => onPick(s.name)} />
            ))}
          </div>
        </div>
      )}
      {TABLE_STYLE_GROUPS.map((g) => (
        <div key={g.group}>
          <div className="menu-heading">{g.group}</div>
          <div className="tstyle-grid">
            {includeNone && g.group === 'Light' && <TableStylePreview id="none" active={current === 'none'} onClick={() => onPick('none')} />}
            {Array.from({ length: g.count }, (_, i) => `TableStyle${g.group}${i + 1}`).map((id) => (
              <TableStylePreview key={id} id={id} active={current === id} onClick={() => onPick(id)} />
            ))}
          </div>
        </div>
      ))}
      <div className="menu-sep" />
      <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => app.dialog({ kind: 'newTableStyle' })}>New Table Style…</button>
    </div>
  )
}

function TableNameBox({ t }: { t: TableDef }) {
  const app = useApp()
  const [name, setName] = useState(t.name)
  useEffect(() => setName(t.name), [t.name])
  return (
    <label className="name-field">
      Table Name:
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setName(t.name)
            e.currentTarget.blur()
          }
        }}
        onBlur={() => {
          if (name === t.name) return
          const err = renameTable(app.doc, t.id, name)
          if (err) {
            app.alert(err)
            setName(t.name)
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
  const t = tableAt(doc.sheet, a.r, a.c)
  if (!t) return null
  const opt = (key: 'bandRows' | 'bandCols' | 'firstCol' | 'lastCol' | 'filterButton', v: boolean) =>
    updateTable(doc, t.id, (tb, sheet) => {
      tb[key] = v
      if (key === 'filterButton' && !v) {
        tb.filters = {}
        applyFilters(doc, sheet)
      }
    }, 'Table Style Options')
  return (
    <>
      <RibbonGroup label="Properties" icon={TableProperties}>
        <div className="col">
          <TableNameBox t={t} />
          <RibbonButton icon={Scaling} label="Resize Table" showLabel onClick={() => app.dialog({ kind: 'resizeTable', data: t.id })} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Tools" icon={Combine}>
        <div className="col">
          <RibbonButton icon={FileStack} label="Summarize with PivotTable" showLabel onClick={() => app.dialog({ kind: 'createPivot', data: absRef(doc.sheet, t.range) })} />
          <RibbonButton icon={Filter} label="Insert Slicer" showLabel onClick={() => app.dialog({ kind: 'insertSlicer', data: { type: 'table', table: t.name } })} />
          <RibbonButton icon={CopyMinus} label="Remove Duplicates" showLabel onClick={() => {
            doc.selectRange(t.range)
            app.dialog({ kind: 'removeDuplicates' })
          }} />
          <RibbonButton icon={Grid3x3} label="Convert to Range" showLabel onClick={() => app.confirm('Do you want to convert the table to a normal range?', () => convertToRange(doc, t.id), 'Convert to Range')} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Table Style Options" icon={ListChecks}>
        <div className="col checks">
          <CheckItem label="Header Row" checked={t.header} onChange={(v) => setHeaderRow(doc, t.id, v)} />
          <CheckItem label="Total Row" checked={t.totals} onChange={(v) => setTotalsRow(doc, t.id, v)} />
          <CheckItem label="Banded Rows" checked={t.bandRows} onChange={(v) => opt('bandRows', v)} />
        </div>
        <div className="col checks">
          <CheckItem label="First Column" checked={t.firstCol} onChange={(v) => opt('firstCol', v)} />
          <CheckItem label="Last Column" checked={t.lastCol} onChange={(v) => opt('lastCol', v)} />
          <CheckItem label="Banded Columns" checked={t.bandCols} onChange={(v) => opt('bandCols', v)} />
        </div>
        <div className="col checks">
          <CheckItem label="Filter Button" checked={t.filterButton} onChange={(v) => opt('filterButton', v)} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Table Styles" icon={Table2}>
        <PopoverButton icon={Table2} label="Quick Styles" large className="tstyle-menu">
          {(close) => (
            <TableStyleGallery
              current={t.style}
              includeNone
              onPick={(id) => {
                close()
                updateTable(doc, t.id, (tb) => (tb.style = id), 'Table Style')
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
      <RibbonGroup label="PivotTable" icon={Table2}>
        <div className="col">
          <span className="ribbon-caption">PivotTable Name:</span>
          <strong className="ribbon-caption">{p.name}</strong>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Active Field" icon={Rows3}>
        <div className="col">
          <RibbonButton icon={Plus} label="Expand Field" showLabel onClick={() => updatePivot(doc, p.id, (x) => (x.collapsed = []), 'Expand Field')} />
          <RibbonButton icon={Minus} label="Collapse Field" showLabel onClick={() => updatePivot(doc, p.id, (x) => {
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
          }, 'Collapse Field')} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Group" icon={Group}>
        <div className="col">
          <RibbonButton icon={Group} label="Group Field" showLabel onClick={() => app.dialog({ kind: 'pivotGroup', data: p.id })} />
          <RibbonButton icon={Ungroup} label="Ungroup" showLabel disabled={!p.groups} onClick={() => {
            const fields = Object.keys(p.groups ?? {})
            for (const f of fields) groupPivotField(doc, p.id, f, null)
          }} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Filter" icon={Filter}>
        <RibbonButton icon={Filter} label="Insert Slicer" large onClick={() => app.dialog({ kind: 'insertSlicer', data: { type: 'pivot', pivot: p.id } })} />
        <RibbonButton icon={CalendarRange} label="Insert Timeline" large onClick={() => app.dialog({ kind: 'insertSlicer', data: { type: 'pivot', pivot: p.id, timeline: true } })} />
      </RibbonGroup>
      <RibbonGroup label="Calculations" icon={Sigma}>
        <RibbonButton icon={Sigma} label="Calculated Field" large title="Fields, Items & Sets: Calculated Field" onClick={() => app.dialog({ kind: 'calcField', data: p.id })} />
      </RibbonGroup>
      <RibbonGroup label="Data" icon={RefreshCw}>
        <RibbonButton icon={RefreshCw} label="Refresh" large title="Refresh (Alt+F5)" onClick={() => updatePivot(doc, p.id, () => {}, 'Refresh')} />
        <RibbonButton icon={Database} label="Change Data Source" large onClick={() => app.dialog({ kind: 'pivotSource', data: p.id })} />
      </RibbonGroup>
      <RibbonGroup label="Actions" icon={Move}>
        <div className="col">
          <RibbonButton icon={Eraser} label="Clear All" showLabel onClick={() => updatePivot(doc, p.id, (x) => Object.assign(x, { rows: [], cols: [], values: [], filters: [] }), 'Clear PivotTable')} />
          <RibbonButton icon={Move} label="Move PivotTable" showLabel onClick={() => app.dialog({ kind: 'movePivot', data: p.id })} />
          <RibbonButton icon={Trash2} label="Delete PivotTable" showLabel onClick={() => app.confirm('Delete this PivotTable?', () => deletePivot(doc, p.id), 'Delete PivotTable')} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Tools" icon={BarChart3}>
        <RibbonButton icon={BarChart3} label="PivotChart" large onClick={() => {
          if (!p.output) return
          app.dialog({ kind: 'insertChart', data: absRef(doc.sheet, { ...p.output, r1: p.output.r1 + p.filters.length + (p.filters.length ? 1 : 0) + (p.cols.length ? 1 : 0), r2: p.output.r2 - (p.grandRows ? 1 : 0) }) })
        }} />
      </RibbonGroup>
      <RibbonGroup label="Show" icon={PanelRight}>
        <RibbonButton icon={PanelRight} label="Field List" large active={app.pane === 'pivot'} onClick={() => app.setPane(app.pane === 'pivot' ? null : 'pivot')} />
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
      <RibbonGroup label="Layout" icon={LayoutTemplate}>
        <MenuButton icon={Sigma} label="Subtotals" large items={[
          { label: 'Do Not Show Subtotals', checked: !p.subtotals, onClick: () => upd((x) => (x.subtotals = false), 'Subtotals') },
          { label: 'Show all Subtotals at Top of Group', checked: p.subtotals, onClick: () => upd((x) => (x.subtotals = true), 'Subtotals') },
        ]} />
        <MenuButton icon={Sigma} label="Grand Totals" large items={[
          { label: 'Off for Rows and Columns', checked: !p.grandRows && !p.grandCols, onClick: () => upd((x) => { x.grandRows = false; x.grandCols = false }, 'Grand Totals') },
          { label: 'On for Rows and Columns', checked: p.grandRows && p.grandCols, onClick: () => upd((x) => { x.grandRows = true; x.grandCols = true }, 'Grand Totals') },
          { label: 'On for Rows Only', checked: p.grandRows && !p.grandCols, onClick: () => upd((x) => { x.grandRows = true; x.grandCols = false }, 'Grand Totals') },
          { label: 'On for Columns Only', checked: !p.grandRows && p.grandCols, onClick: () => upd((x) => { x.grandRows = false; x.grandCols = true }, 'Grand Totals') },
        ]} />
        <MenuButton icon={Table2} label="Report Layout" large items={[
          { label: 'Show in Compact Form', checked: p.layout === 'compact', onClick: () => upd((x) => (x.layout = 'compact'), 'Report Layout') },
          { label: 'Show in Outline Form', checked: p.layout === 'outline', onClick: () => upd((x) => (x.layout = 'outline'), 'Report Layout') },
          { label: 'Show in Tabular Form', checked: p.layout === 'tabular', onClick: () => upd((x) => (x.layout = 'tabular'), 'Report Layout') },
        ]} />
      </RibbonGroup>
      <RibbonGroup label="PivotTable Style Options" icon={ListChecks}>
        <div className="col checks">
          <CheckItem label="Banded Rows" checked={p.bandRows} onChange={(v) => upd((x) => (x.bandRows = v), 'Banded Rows')} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="PivotTable Styles" icon={Table2}>
        <PopoverButton icon={Table2} label="Styles" large className="tstyle-menu">
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
      <RibbonGroup label="Slicer" icon={Filter}>
        <div className="col">
          <span className="ribbon-caption">Slicer Caption:</span>
          <input className="ribbon-input" aria-label="Slicer Caption" defaultValue={o.caption} key={o.id} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} onBlur={(e) => e.target.value !== o.caption && upd({ caption: e.target.value }, 'Slicer Caption')} />
        </div>
        <RibbonButton icon={FilterX} label="Clear Filter" large title="Clear Filter (Alt+C)" disabled={o.selected === null} onClick={() => clearSlicer(doc, o.id)} />
        <RibbonButton icon={ListChecks} label="Multi-Select" large active={!!o.multi} title="Multi-Select (Alt+S)" onClick={() => upd({ multi: !o.multi }, 'Multi-Select')} />
      </RibbonGroup>
      <RibbonGroup label="Slicer Styles" icon={Paintbrush}>
        <div className="slicer-styles">
          {SLICER_COLORS.map((c) => (
            <button key={c} type="button" className={o.color === c ? 'is-active' : undefined} title="Slicer Style" aria-label={`Slicer style ${c}`} onMouseDown={keepFocus} onClick={() => upd({ color: c }, 'Slicer Style')}>
              <span style={{ background: c }} />
              <span style={{ background: c, opacity: 0.45 }} />
            </button>
          ))}
        </div>
      </RibbonGroup>
      <RibbonGroup label="Buttons" icon={Grid3x3}>
        <label className="ribbon-field">
          Columns:{' '}
          <input type="number" min={1} max={20} value={o.columns} onChange={(e) => upd({ columns: Math.max(1, Math.min(20, Number(e.target.value) || 1)) }, 'Slicer Columns')} />
        </label>
      </RibbonGroup>
      <ArrangeGroup o={o} />
      <SizeGroup o={o} />
    </>
  )
}
