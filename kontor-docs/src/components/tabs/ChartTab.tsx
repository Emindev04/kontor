import { ChartBar, ChartColumn, ChartLine, ChartPie, LayoutList, Palette, Table2, Tag, Type } from 'lucide-react'
import { MenuButton, RibbonButton, RibbonGroup } from '../ui'
import { CHART_PALETTES, type ChartData, type ChartType } from '../../editor/Chart'
import { ArrangeGroup, SizeGroup, selectedDrawing, updateDrawing } from './DrawingGroups'
import type { TabProps } from './types'

export const CHART_TYPES: { id: ChartType; label: string; stacking?: ChartData['stacking'] }[] = [
  { id: 'column', label: 'Clustered Column' },
  { id: 'column', label: 'Stacked Column', stacking: 'stacked' },
  { id: 'column', label: '100% Stacked Column', stacking: 'percent' },
  { id: 'bar', label: 'Clustered Bar' },
  { id: 'bar', label: 'Stacked Bar', stacking: 'stacked' },
  { id: 'line', label: 'Line with Markers' },
  { id: 'line', label: 'Stacked Line', stacking: 'stacked' },
  { id: 'area', label: 'Area' },
  { id: 'area', label: 'Stacked Area', stacking: 'stacked' },
  { id: 'pie', label: 'Pie' },
  { id: 'doughnut', label: 'Doughnut' },
  { id: 'scatter', label: 'Scatter' },
]

/** Contextual tab of a selected chart. */
export function ChartDesignTab({ editor, app }: TabProps) {
  const d = selectedDrawing(editor)
  const data = (d?.node.attrs.data ?? null) as ChartData | null
  if (!d || !data) return null
  const set = (patch: Partial<ChartData>) => updateDrawing(editor, { data: { ...data, ...patch } })
  return (
    <>
      <RibbonGroup label="Chart Layouts" priority={2}>
        <MenuButton
          large
          icon={LayoutList}
          label="Add Chart Element"
          items={[
            { heading: 'Chart Title' },
            { label: 'None', active: !data.title, onClick: () => set({ title: '' }) },
            { label: 'Above Chart', active: !!data.title, onClick: () => set({ title: data.title || 'Chart Title' }) },
            { heading: 'Legend' },
            ...(['none', 'right', 'top', 'left', 'bottom'] as const).map((l) => ({ label: l === 'none' ? 'None' : l[0].toUpperCase() + l.slice(1), active: data.legend === l, onClick: () => set({ legend: l }) })),
            { heading: 'Data Labels' },
            { label: 'Show Data Labels', checked: data.dataLabels, onClick: () => set({ dataLabels: !data.dataLabels }) },
            { heading: 'Gridlines' },
            { label: 'Primary Major Gridlines', checked: data.gridlines, onClick: () => set({ gridlines: !data.gridlines }) },
          ]}
        />
      </RibbonGroup>
      <RibbonGroup label="Chart Styles" priority={3}>
        <MenuButton
          large
          icon={Palette}
          label="Change Colors"
          items={Object.entries(CHART_PALETTES).map(([id, p]) => ({
            label: p.label,
            active: data.palette === id,
            preview: (
              <span className="palette-strip">
                {p.colors.slice(0, 5).map((c) => (
                  <span key={c} style={{ background: c }} />
                ))}
              </span>
            ),
            onClick: () => set({ palette: id, series: data.series.map(({ color: _c, ...s }) => s) }),
          }))}
        />
      </RibbonGroup>
      <RibbonGroup label="Data" priority={2}>
        <RibbonButton large icon={Table2} label="Edit Data" onClick={() => (app.setObjectPos(d.pos), app.openDialog('chartData'))} />
        <RibbonButton
          large
          icon={Type}
          label="Switch Row/Column"
          disabled={data.chartType === 'pie' || data.chartType === 'doughnut'}
          onClick={() =>
            set({
              categories: data.series.map((s) => s.name),
              series: data.categories.map((c, i) => ({ name: c, values: data.series.map((s) => s.values[i] ?? null) })),
            })
          }
        />
      </RibbonGroup>
      <RibbonGroup label="Type" priority={2}>
        <MenuButton
          large
          icon={data.chartType === 'pie' || data.chartType === 'doughnut' ? ChartPie : data.chartType === 'line' ? ChartLine : data.chartType === 'bar' ? ChartBar : ChartColumn}
          label="Change Chart Type"
          wide
          items={CHART_TYPES.map((t) => ({ label: t.label, active: data.chartType === t.id && (t.stacking ?? 'none') === data.stacking, onClick: () => set({ chartType: t.id, stacking: t.stacking ?? 'none' }) }))}
        />
      </RibbonGroup>
      <RibbonGroup label="Accessibility" priority={0}>
        <RibbonButton large icon={Tag} label="Chart Title" onClick={() => {
          const title = prompt('Chart title:', data.title)
          if (title != null) set({ title })
        }} />
      </RibbonGroup>
      <ArrangeGroup editor={editor} app={app} rotatable={false} />
      <SizeGroup editor={editor} unit={app.settings.unit} keepRatio={false} />
    </>
  )
}
