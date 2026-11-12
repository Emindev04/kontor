import { ChartBar, ChartColumn, ChartLine, ChartPie, LayoutList, Palette, Table2, Tag, Type } from 'lucide-react'
import { MenuButton, RibbonButton, RibbonGroup } from '../ui'
import { CHART_PALETTES, type ChartData, type ChartType } from '../../editor/Chart'
import { ArrangeGroup, SizeGroup, selectedDrawing, updateDrawing } from './DrawingGroups'
import type { TabProps } from './types'
import { t, tx } from '../../i18n'

export const CHART_TYPES: { id: ChartType; label: string; stacking?: ChartData['stacking'] }[] = [
  { id: 'column', label: tx('Clustered Column') },
  { id: 'column', label: tx('Stacked Column'), stacking: 'stacked' },
  { id: 'column', label: tx('100% Stacked Column'), stacking: 'percent' },
  { id: 'bar', label: tx('Clustered Bar') },
  { id: 'bar', label: tx('Stacked Bar'), stacking: 'stacked' },
  { id: 'line', label: tx('Line with Markers') },
  { id: 'line', label: tx('Stacked Line'), stacking: 'stacked' },
  { id: 'area', label: tx('Area') },
  { id: 'area', label: tx('Stacked Area'), stacking: 'stacked' },
  { id: 'pie', label: tx('Pie') },
  { id: 'doughnut', label: tx('Doughnut') },
  { id: 'scatter', label: tx('Scatter') },
]

/** Contextual tab of a selected chart. */
export function ChartDesignTab({ editor, app }: TabProps) {
  const d = selectedDrawing(editor)
  const data = (d?.node.attrs.data ?? null) as ChartData | null
  if (!d || !data) return null
  const set = (patch: Partial<ChartData>) => updateDrawing(editor, { data: { ...data, ...patch } })
  return (
    <>
      <RibbonGroup label={t('Chart Layouts')} priority={2}>
        <MenuButton
          large
          icon={LayoutList}
          label={t('Add Chart Element')}
          items={[
            { heading: t('Chart Title') },
            { label: t('None'), active: !data.title, onClick: () => set({ title: '' }) },
            { label: t('Above Chart'), active: !!data.title, onClick: () => set({ title: data.title || t('Chart Title') }) },
            { heading: t('Legend') },
            ...(['none', 'right', 'top', 'left', 'bottom'] as const).map((l) => ({ label: l === 'none' ? t('None') : l[0].toUpperCase() + l.slice(1), active: data.legend === l, onClick: () => set({ legend: l }) })),
            { heading: t('Data Labels') },
            { label: t('Show Data Labels'), checked: data.dataLabels, onClick: () => set({ dataLabels: !data.dataLabels }) },
            { heading: t('Gridlines') },
            { label: t('Primary Major Gridlines'), checked: data.gridlines, onClick: () => set({ gridlines: !data.gridlines }) },
          ]}
        />
      </RibbonGroup>
      <RibbonGroup label={t('Chart Styles')} priority={3}>
        <MenuButton
          large
          icon={Palette}
          label={t('Change Colors')}
          items={Object.entries(CHART_PALETTES).map(([id, p]) => ({
            label: t(p.label),
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
      <RibbonGroup label={t('Data')} priority={2}>
        <RibbonButton large icon={Table2} label={t('Edit Data')} onClick={() => (app.setObjectPos(d.pos), app.openDialog('chartData'))} />
        <RibbonButton
          large
          icon={Type}
          label={t('Switch Row/Column')}
          disabled={data.chartType === 'pie' || data.chartType === 'doughnut'}
          onClick={() =>
            set({
              categories: data.series.map((s) => s.name),
              series: data.categories.map((c, i) => ({ name: c, values: data.series.map((s) => s.values[i] ?? null) })),
            })
          }
        />
      </RibbonGroup>
      <RibbonGroup label={t('Type')} priority={2}>
        <MenuButton
          large
          icon={data.chartType === 'pie' || data.chartType === 'doughnut' ? ChartPie : data.chartType === 'line' ? ChartLine : data.chartType === 'bar' ? ChartBar : ChartColumn}
          label={t('Change Chart Type')}
          wide
          items={CHART_TYPES.map((item) => ({ label: t(item.label), active: data.chartType === item.id && (item.stacking ?? 'none') === data.stacking, onClick: () => set({ chartType: item.id, stacking: item.stacking ?? 'none' }) }))}
        />
      </RibbonGroup>
      <RibbonGroup label={t('Accessibility')} priority={0}>
        <RibbonButton large icon={Tag} label={t('Chart Title')} onClick={() => {
          const title = prompt(t('Chart title:'), data.title)
          if (title != null) set({ title })
        }} />
      </RibbonGroup>
      <ArrangeGroup editor={editor} app={app} rotatable={false} />
      <SizeGroup editor={editor} unit={app.settings.unit} keepRatio={false} />
    </>
  )
}
