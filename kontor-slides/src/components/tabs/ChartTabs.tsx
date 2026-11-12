import { useState } from 'react'
import { ArrowLeftRight, Axis3d, BarChart3, LayoutDashboard, Paintbrush, PaintBucket, PenLine, PlusSquare, Table2, Palette, TrendingUp } from 'lucide-react'
import type { ChartElement, DataLabelPos, Trendline } from '../../model/types'
import { ERROR_BAR_PRESETS } from '../../model/chart'
import { CHART_PALETTES, CHART_STYLES, seriesColor, switchRowColumn, TRENDLINE_LABELS } from '../../model/chart'
import { resolveColor } from '../../model/color'
import { fontStack } from '../../model/themes'
import { ChartSvg } from '../../render/ChartView'
import { useStore } from '../../store/store'
import * as A from '../../store/actions'
import { ColorPalette } from '../palettes'
import { MenuButton, NumberField, PopoverButton, RibbonButton, RibbonGroup, cls, keepFocus, type MenuItem } from '../ui'
import { ArrangeButtons, ArrangeExtraButtons, useThemeColors } from './common'
import type { TabProps } from './types'
import { t, tx } from '../../i18n'

const IN = 96

function useChart() {
  return useStore((s) => {
    void s.pres
    return A.currentChart()
  })
}

const up = (patch: (c: ChartElement) => Partial<ChartElement>) => A.updateChart((c) => ({ ...c, ...patch(c) }))

function elementItems(c: ChartElement | null): MenuItem[] {
  if (!c) return []
  const pie = c.chartType === 'pie' || c.chartType === 'doughnut'
  return [
    { heading: t('Axes') },
    { label: t('Primary Horizontal'), active: c.axes.cat, disabled: pie, onClick: () => up((x) => ({ axes: { ...x.axes, cat: !x.axes.cat } })) },
    { label: t('Primary Vertical'), active: c.axes.val, disabled: pie, onClick: () => up((x) => ({ axes: { ...x.axes, val: !x.axes.val } })) },
    { heading: t('Axis Titles') },
    { label: t('Primary Horizontal'), active: !!c.axes.catTitle, disabled: pie, onClick: () => up((x) => ({ axes: { ...x.axes, catTitle: x.axes.catTitle ? null : t('Axis Title') } })) },
    { label: t('Primary Vertical'), active: !!c.axes.valTitle, disabled: pie, onClick: () => up((x) => ({ axes: { ...x.axes, valTitle: x.axes.valTitle ? null : t('Axis Title') } })) },
    { label: t('Secondary Vertical'), active: !!c.axes.secTitle, disabled: pie || !c.series.some((s) => s.secondary), onClick: () => up((x) => ({ axes: { ...x.axes, secTitle: x.axes.secTitle ? null : t('Axis Title') } })) },
    { heading: t('Chart Title') },
    { label: t('None'), active: !c.title.show, onClick: () => up((x) => ({ title: { ...x.title, show: false } })) },
    { label: t('Above Chart'), active: c.title.show, onClick: () => up((x) => ({ title: { ...x.title, show: true } })) },
    { heading: t('Data Labels') },
    { label: t('None'), active: !c.dataLabels, onClick: () => up(() => ({ dataLabels: false })) },
    ...labelPositions(c).map(([pos, label]) => ({ label: t(label), active: c.dataLabels && (c.labelPos ?? defaultLabelPos(c)) === pos, onClick: () => up(() => ({ dataLabels: true, labelPos: pos })) })),
    { label: t('Show Category Name'), active: !!c.labelShow?.category, onClick: () => up((x) => ({ dataLabels: true, labelShow: { ...x.labelShow, category: !x.labelShow?.category } })) },
    { label: t('Show Series Name'), active: !!c.labelShow?.series, onClick: () => up((x) => ({ dataLabels: true, labelShow: { ...x.labelShow, series: !x.labelShow?.series } })) },
    ...(pie ? [{ label: t('Show Percentage'), active: !!c.labelShow?.percent, onClick: () => up((x) => ({ dataLabels: true, labelShow: { ...x.labelShow, percent: !x.labelShow?.percent } })) }] : []),
    { heading: t('Trendline') },
    ...(['none', 'linear', 'exponential', 'forecast', 'movingAvg'] as const).map((k) => ({
      label: k === 'none' ? t('None') : k === 'forecast' ? t('Linear Forecast') : t(TRENDLINE_LABELS[k]),
      disabled: pie || c.grouping !== 'clustered',
      active: k === 'none' ? !c.series.some((s) => s.trendline) : c.series.some((s) => s.trendline && (k === 'forecast' ? s.trendline.type === 'linear' && !!s.trendline.forward : s.trendline.type === k && !(k === 'linear' && s.trendline.forward))),
      onClick: () => up((x) => ({ series: x.series.map((s, i) => (i === chartSeriesIndex() || k === 'none' ? { ...s, trendline: k === 'none' ? null : k === 'forecast' ? { type: 'linear' as const, forward: 2 } : { type: k } } : s)) })),
    })),
    { heading: t('Error Bars') },
    ...ERROR_BAR_PRESETS.map((p) => ({
      label: t(p.label),
      disabled: pie || c.grouping === 'percent' || !!c.threeD,
      active: p.bars ? c.series.some((s) => s.errorBars?.type === p.bars!.type) : !c.series.some((s) => s.errorBars),
      onClick: () => up((x) => ({ series: x.series.map((s) => ({ ...s, errorBars: p.bars })) })),
    })),
    { heading: t('Gridlines') },
    { label: t('Primary Major Horizontal'), active: c.gridlines.major, disabled: pie, onClick: () => up((x) => ({ gridlines: { ...x.gridlines, major: !x.gridlines.major } })) },
    { label: t('Primary Minor Horizontal'), active: c.gridlines.minor, disabled: pie, onClick: () => up((x) => ({ gridlines: { ...x.gridlines, minor: !x.gridlines.minor } })) },
    { heading: t('Legend') },
    { label: t('None'), active: !c.legend.show, onClick: () => up((x) => ({ legend: { ...x.legend, show: false } })) },
    ...(['right', 'top', 'left', 'bottom'] as const).map((pos) => ({ label: t({ right: tx('Right'), top: tx('Top'), left: tx('Left'), bottom: tx('Bottom') }[pos]), active: c.legend.show && c.legend.pos === pos, onClick: () => up(() => ({ legend: { show: true, pos } })) })),
    { heading: t('Lines') },
    { label: t('Smooth Lines'), active: c.smooth, disabled: !['line', 'scatter', 'combo'].includes(c.chartType), onClick: () => up((x) => ({ smooth: !x.smooth })) },
    { label: t('Markers'), active: c.markers, disabled: !['line', 'combo'].includes(c.chartType), onClick: () => up((x) => ({ markers: !x.markers })) },
  ]
}

/** The series picked in the Format tab (commands like Trendline apply to it). */
let seriesSel = 0
const chartSeriesIndex = () => seriesSel

function defaultLabelPos(c: ChartElement): DataLabelPos {
  if (c.chartType === 'pie' || c.chartType === 'doughnut') return 'bestFit'
  if (c.chartType === 'line' || c.chartType === 'scatter') return 'above'
  return c.grouping === 'clustered' ? 'outsideEnd' : 'center'
}

function labelPositions(c: ChartElement): [DataLabelPos, string][] {
  if (c.chartType === 'pie' || c.chartType === 'doughnut') return [['center', tx('Center')], ['insideEnd', tx('Inside End')], ['outsideEnd', tx('Outside End')], ['bestFit', tx('Best Fit')]]
  if (c.chartType === 'line' || c.chartType === 'scatter') return [['center', tx('Center')], ['left', tx('Left')], ['right', tx('Right')], ['above', tx('Above')], ['below', tx('Below')]]
  if (c.chartType === 'area') return [['center', tx('Show')]]
  return c.grouping === 'clustered' ? [['center', tx('Center')], ['insideEnd', tx('Inside End')], ['insideBase', tx('Inside Base')], ['outsideEnd', tx('Outside End')]] : [['center', tx('Center')], ['insideEnd', tx('Inside End')], ['insideBase', tx('Inside Base')]]
}

const QUICK_LAYOUTS: { label: string; apply: (c: ChartElement) => Partial<ChartElement> }[] = [
  { label: tx('Layout 1'), apply: (c) => ({ title: { ...c.title, show: true }, legend: { show: true, pos: 'right' }, dataLabels: false, gridlines: { major: true, minor: false } }) },
  { label: tx('Layout 2'), apply: (c) => ({ title: { ...c.title, show: true }, legend: { show: true, pos: 'top' }, dataLabels: true, axes: { ...c.axes, val: false }, gridlines: { major: false, minor: false } }) },
  { label: tx('Layout 3'), apply: (c) => ({ title: { ...c.title, show: true }, legend: { show: true, pos: 'bottom' }, dataLabels: false, axes: { ...c.axes, val: true }, gridlines: { major: true, minor: false } }) },
  { label: tx('Layout 4'), apply: (c) => ({ title: { ...c.title, show: false }, legend: { show: true, pos: 'bottom' }, dataLabels: true, gridlines: { major: false, minor: false } }) },
  { label: tx('Layout 5'), apply: (c) => ({ title: { ...c.title, show: true }, legend: { show: false, pos: 'bottom' }, axes: { ...c.axes, catTitle: t('Axis Title'), valTitle: t('Axis Title') }, gridlines: { major: true, minor: false } }) },
  { label: tx('Layout 6'), apply: (c) => ({ title: { ...c.title, show: true }, legend: { show: false, pos: 'bottom' }, axes: { ...c.axes, valTitle: t('Axis Title'), catTitle: null }, gridlines: { major: true, minor: true } }) },
]

function MiniChart({ chart, patch }: { chart: ChartElement; patch: Partial<ChartElement> }) {
  const colors = useThemeColors()
  const mini = { ...chart, ...patch, w: 260, h: 170 }
  return (
    <span className="mini-chart" style={{ width: 78, height: 51 }}>
      <span style={{ transform: 'scale(0.3)', transformOrigin: '0 0', display: 'block', width: 260, height: 170 }}>
        <ChartSvg chart={mini} colors={colors} font={fontStack('Carlito')} />
      </span>
    </span>
  )
}

export function ChartDesignTab({ ui }: TabProps) {
  const chart = useChart()
  const colors = useThemeColors()
  return (
    <>
      <RibbonGroup label={t('Chart Layouts')}>
        <MenuButton icon={PlusSquare} label={t('Add Chart Element')} large disabled={!chart} items={() => elementItems(A.currentChart())} />
        <PopoverButton icon={LayoutDashboard} label={t('Quick Layout')} large disabled={!chart} panelClass="menu-wide">
          {(close) => (
            <div className="quick-layouts">
              {chart &&
                QUICK_LAYOUTS.map((l) => (
                  <button key={l.label} type="button" title={t(l.label)} className="chart-style-item" onMouseDown={keepFocus} onClick={() => (close(), up(l.apply))}>
                    <MiniChart chart={chart} patch={l.apply(chart)} />
                  </button>
                ))}
            </div>
          )}
        </PopoverButton>
      </RibbonGroup>
      <RibbonGroup label={t('Chart Styles')} icon={Paintbrush}>
        <PopoverButton icon={Palette} label={t('Change Colors')} large disabled={!chart} panelClass="menu-wide">
          {(close) => (
            <div className="chart-palettes">
              {CHART_PALETTES.map((p) => (
                <button key={p.id} type="button" className={cls('menu-item', chart?.palette === p.id && 'is-active')} onMouseDown={keepFocus} onClick={() => (close(), up(() => ({ palette: p.id })))}>
                  <span className="palette-strip">
                    {Array.from({ length: 6 }, (_, i) => (
                      <span key={i} style={{ background: resolveColor(seriesColor({ palette: p.id }, i, 6), colors) }} />
                    ))}
                  </span>
                  {p.n ? t(p.label, { n: p.n }) : t(p.label)}
                </button>
              ))}
            </div>
          )}
        </PopoverButton>
        <div className="inline-gallery">
          {chart &&
            CHART_STYLES.slice(0, 6).map((st) => (
              <button key={st.id} type="button" title={t(st.label)} className={cls('chart-style-item', chart.style === st.id && 'is-active')} onMouseDown={keepFocus} onClick={() => up(() => ({ style: st.id }))}>
                <MiniChart chart={chart} patch={{ style: st.id, title: { ...chart.title, show: false }, legend: { ...chart.legend, show: false } }} />
              </button>
            ))}
          <PopoverButton icon={Paintbrush} label={t('More Chart Styles')} disabled={!chart} panelClass="menu-wide">
            {(close) => (
              <div className="quick-layouts">
                {chart &&
                  CHART_STYLES.map((st) => (
                    <button key={st.id} type="button" title={t(st.label)} className={cls('chart-style-item', chart.style === st.id && 'is-active')} onMouseDown={keepFocus} onClick={() => (close(), up(() => ({ style: st.id })))}>
                      <MiniChart chart={chart} patch={{ style: st.id }} />
                    </button>
                  ))}
              </div>
            )}
          </PopoverButton>
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Data')}>
        <RibbonButton icon={ArrowLeftRight} label={t('Switch Row/Column')} large disabled={!chart || chart.chartType === 'scatter'} onClick={() => up((c) => switchRowColumn(c))} />
        <RibbonButton icon={Table2} label={t('Edit Data')} large disabled={!chart} onClick={() => ui.openDialog('chartData')} />
      </RibbonGroup>
      <RibbonGroup label={t('Type')}>
        <RibbonButton icon={BarChart3} label={t('Change Chart Type')} large disabled={!chart} onClick={() => ui.openDialog('changeChart')} />
      </RibbonGroup>
    </>
  )
}

export function ChartFormatTab({ ui }: TabProps) {
  const chart = useChart()
  const colors = useThemeColors()
  const [series, setSeriesState] = useState(seriesSel)
  const setSeries = (i: number) => {
    seriesSel = i
    setSeriesState(i)
  }
  const pie = chart?.chartType === 'pie' || chart?.chartType === 'doughnut'
  const cur = chart?.series[series]
  const setTrend = (t: Trendline | null) => up((x) => ({ series: x.series.map((s, i) => (i === series ? { ...s, trendline: t } : s)) }))
  const names = chart ? (pie ? chart.categories : chart.series.map((s) => s.name)) : []
  return (
    <>
      <RibbonGroup label={t('Current Selection')}>
        <div className="col">
          <label className="field-row">
            <select aria-label={t('Chart element')} value={series} onChange={(e) => setSeries(Number(e.target.value))} disabled={!chart || pie}>
              {names.map((n, i) => (
                <option key={i} value={i}>
                  {pie ? t('Series 1') : t('Series "{name}"', { name: n })}
                </option>
              ))}
            </select>
          </label>
          <PopoverButton icon={PaintBucket} label={t('Series Fill')} showLabel disabled={!chart || pie} panelClass="palette-menu">
            {(close) => (
              <ColorPalette
                colors={colors}
                onPick={(c) => (close(), up((x) => ({ series: x.series.map((s, i) => (i === series ? { ...s, color: c } : s)) })))}
                auto={{ label: t('Automatic'), onClick: () => (close(), up((x) => ({ series: x.series.map((s, i) => (i === series ? { ...s, color: null } : s)) }))) }}
              />
            )}
          </PopoverButton>
        </div>
        <div className="col">
          <RibbonButton
            icon={Axis3d}
            label={t('Secondary Axis')}
            showLabel
            active={!!cur?.secondary}
            disabled={!chart || pie || chart.chartType === 'bar' || chart.series.length < 2}
            title={t('Plot this series on a secondary value axis')}
            onClick={() => up((x) => ({ series: x.series.map((s, i) => (i === series ? { ...s, secondary: !s.secondary || undefined } : s)) }))}
          />
          <MenuButton
            icon={TrendingUp}
            label={t('Trendline')}
            showLabel
            disabled={!chart || pie || chart.grouping !== 'clustered'}
            items={[
              { label: t('None'), active: !cur?.trendline, onClick: () => setTrend(null) },
              ...(['linear', 'exponential', 'logarithmic', 'power'] as const).map((ty) => ({ label: t(TRENDLINE_LABELS[ty]), active: cur?.trendline?.type === ty, onClick: () => setTrend({ ...cur?.trendline, type: ty }) })),
              { label: t('Polynomial (order 2)'), active: cur?.trendline?.type === 'polynomial' && (cur.trendline.order ?? 2) === 2, onClick: () => setTrend({ ...cur?.trendline, type: 'polynomial', order: 2 }) },
              { label: t('Polynomial (order 3)'), active: cur?.trendline?.type === 'polynomial' && cur.trendline.order === 3, onClick: () => setTrend({ ...cur?.trendline, type: 'polynomial', order: 3 }) },
              { label: t('Moving Average (2 periods)'), active: cur?.trendline?.type === 'movingAvg', onClick: () => setTrend({ type: 'movingAvg', period: 2 }) },
              'separator',
              { label: t('Forecast Forward 2 Periods'), active: !!cur?.trendline?.forward, disabled: !cur?.trendline || cur.trendline.type === 'movingAvg', onClick: () => cur?.trendline && setTrend({ ...cur.trendline, forward: cur.trendline.forward ? undefined : 2 }) },
              { label: t('Display Equation on Chart'), active: !!cur?.trendline?.showEquation, disabled: !cur?.trendline || cur.trendline.type === 'movingAvg', onClick: () => cur?.trendline && setTrend({ ...cur.trendline, showEquation: !cur.trendline.showEquation }) },
              { label: t('Display R-squared Value on Chart'), active: !!cur?.trendline?.showR2, disabled: !cur?.trendline || cur.trendline.type === 'movingAvg', onClick: () => cur?.trendline && setTrend({ ...cur.trendline, showR2: !cur.trendline.showR2 }) },
            ]}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Chart Area')}>
        <div className="col">
          <PopoverButton icon={PaintBucket} label={t('Shape Fill')} showLabel disabled={!chart} panelClass="palette-menu">
            {(close) => <ColorPalette colors={colors} onPick={(c) => (close(), up(() => ({ fill: { type: 'solid', color: c } })))} none={{ label: t('No Fill'), onClick: () => (close(), up(() => ({ fill: { type: 'none' } }))) }} />}
          </PopoverButton>
          <PopoverButton icon={PenLine} label={t('Shape Outline')} showLabel disabled={!chart} panelClass="palette-menu">
            {(close) => <ColorPalette colors={colors} onPick={(c) => (close(), up(() => ({ line: { color: c, width: 0.75, dash: 'solid' } })))} none={{ label: t('No Outline'), onClick: () => (close(), up(() => ({ line: null }))) }} />}
          </PopoverButton>
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Axis Bounds')}>
        <div className="col">
          <label className="field-row">
            <span>{t('Minimum:')}</span>
            <NumberField label={t('Axis minimum')} value={chart?.axes.min ?? null} step={1} disabled={!chart || pie} onChange={(v) => up((c) => ({ axes: { ...c.axes, min: v } }))} />
          </label>
          <label className="field-row">
            <span>{t('Maximum:')}</span>
            <NumberField label={t('Axis maximum')} value={chart?.axes.max ?? null} step={1} disabled={!chart || pie} onChange={(v) => up((c) => ({ axes: { ...c.axes, max: v } }))} />
          </label>
          <button type="button" className="rb" disabled={!chart} onMouseDown={keepFocus} onClick={() => up((c) => ({ axes: { ...c.axes, min: null, max: null } }))}>
            {t('Reset to Auto')}
          </button>
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Chart Title')}>
        <div className="col">
          <label className="field-row">
            <input aria-label={t('Chart title text')} value={chart?.title.text ?? ''} disabled={!chart} onChange={(e) => up((c) => ({ title: { show: true, text: e.target.value } }))} style={{ width: 150 }} />
          </label>
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Arrange')}>
        <ArrangeButtons ui={ui} />
        <ArrangeExtraButtons />
      </RibbonGroup>
      <RibbonGroup label={t('Size')}>
        <div className="col">
          <label className="field-row">
            <span>{t('Height:')}</span>
            <NumberField label={t('Chart Height')} value={chart ? chart.h / IN : null} step={0.1} min={0.5} max={56} suffix='"' disabled={!chart} onChange={(v) => A.setSelectionSize(null, v * IN, false)} />
          </label>
          <label className="field-row">
            <span>{t('Width:')}</span>
            <NumberField label={t('Chart Width')} value={chart ? chart.w / IN : null} step={0.1} min={0.5} max={56} suffix='"' disabled={!chart} onChange={(v) => A.setSelectionSize(v * IN, null, false)} />
          </label>
        </div>
      </RibbonGroup>
    </>
  )
}
