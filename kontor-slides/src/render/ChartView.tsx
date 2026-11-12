import { useId, type ReactNode } from 'react'
import type { ChartElement, ChartSeriesType } from '../model/types'
import { adjustLum, resolveColor, type ThemeColors } from '../model/color'
import { chartStyle, errorAmount, fitTrend, formatTick, niceScale, seriesColor } from '../model/chart'
import { t } from '../i18n'

const PX = 96 / 72

type Props = { chart: ChartElement; colors: ThemeColors; font: string }

function textWidth(text: string, size: number) {
  return text.length * size * 0.52
}

/** Draws a chart as SVG in its element box (also used for thumbnails, slide show and printing). */
export function ChartSvg({ chart, colors, font }: Props) {
  const uid = useId().replace(/:/g, '')
  const st = chartStyle(chart.style)
  const W = Math.max(chart.w, 10)
  const H = Math.max(chart.h, 10)
  const dark = !!st.dark
  const textColor = dark ? '#F2F2F2' : resolveColor('theme:tx1:l35', colors)
  const gridColor = dark ? 'rgba(255,255,255,0.25)' : '#D9D9D9'
  const labelSize = 12 * PX
  const titleSize = 18.6 * PX
  const pad = 9.6
  const out: ReactNode[] = []
  const isPie = chart.chartType === 'pie' || chart.chartType === 'doughnut'
  const isBar = chart.chartType === 'bar'
  const series = chart.series
  const cats = chart.categories
  const color = (i: number, n: number) => resolveColor(seriesColor(chart, i, n, series[i]?.color), colors)
  const sliceColor = (i: number) => resolveColor(seriesColor(chart, i, cats.length, null), colors)

  // ---------- Frame: background, title, legend ----------
  let top = pad
  let bottom = H - pad
  let left = pad
  let right = W - pad
  if (st.dark || chart.fill.type !== 'none') {
    const bg = chart.fill.type === 'solid' ? resolveColor(chart.fill.color, colors) : dark ? resolveColor('theme:tx1:l15', colors) : '#FFFFFF'
    out.push(<rect key="bg" x={0} y={0} width={W} height={H} fill={bg} />)
  }
  if (chart.line) out.push(<rect key="border" x={0.5} y={0.5} width={W - 1} height={H - 1} fill="none" stroke={resolveColor(chart.line.color, colors)} strokeWidth={chart.line.width * PX} />)
  if (chart.title.show) {
    out.push(
      <text key="title" x={W / 2} y={top + titleSize * 0.9} textAnchor="middle" fontSize={titleSize} fill={textColor}>
        {chart.title.text || t('Chart Title')}
      </text>,
    )
    top += titleSize * 1.4
  }
  const legendItems = isPie ? cats.map((c, i) => ({ label: c, color: sliceColor(i), line: false })) : series.map((s, i) => ({ label: s.name, color: color(i, series.length), line: seriesType(chart, i) === 'line' }))
  if (chart.legend.show && legendItems.length) {
    const sw = labelSize * 0.7
    const itemW = (l: string) => sw + 6 + textWidth(l, labelSize) + 14
    if (chart.legend.pos === 'bottom' || chart.legend.pos === 'top') {
      const total = legendItems.reduce((a, it) => a + itemW(it.label), 0)
      let x = Math.max(pad, (W - total) / 2)
      const y = chart.legend.pos === 'bottom' ? bottom - labelSize * 0.6 : top + labelSize * 0.6
      for (const [i, it] of legendItems.entries()) {
        out.push(<LegendKey key={`lk${i}`} x={x} y={y} size={sw} color={it.color} line={it.line} />)
        out.push(
          <text key={`lt${i}`} x={x + sw + 5} y={y + labelSize * 0.35} fontSize={labelSize} fill={textColor}>
            {it.label}
          </text>,
        )
        x += itemW(it.label)
      }
      if (chart.legend.pos === 'bottom') bottom -= labelSize * 1.8
      else top += labelSize * 1.8
    } else {
      const lw = Math.max(...legendItems.map((it) => itemW(it.label)))
      const x = chart.legend.pos === 'right' ? right - lw + 6 : left
      const startY = (top + bottom) / 2 - (legendItems.length * labelSize * 1.4) / 2
      legendItems.forEach((it, i) => {
        const y = startY + i * labelSize * 1.4 + labelSize * 0.5
        out.push(<LegendKey key={`lk${i}`} x={x} y={y} size={sw} color={it.color} line={it.line} />)
        out.push(
          <text key={`lt${i}`} x={x + sw + 5} y={y + labelSize * 0.35} fontSize={labelSize} fill={textColor}>
            {it.label}
          </text>,
        )
      })
      if (chart.legend.pos === 'right') right -= lw + 4
      else left += lw + 4
    }
  }

  const defs: ReactNode[] = []
  const paint = (c: string, key: string) => {
    if (!st.gradient) return c
    defs.push(
      <linearGradient key={key} id={`${uid}${key}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={adjustLum(c, 0.3)} />
        <stop offset="1" stopColor={adjustLum(c, -0.15)} />
      </linearGradient>,
    )
    return `url(#${uid}${key})`
  }
  const barStroke = st.outline ? (dark ? '#262626' : '#FFFFFF') : 'none'
  const filter = st.shadow ? `drop-shadow(1px 2px 2px rgba(0,0,0,0.35))` : undefined

  // ---------- Data labels ----------
  const show = chart.labelShow ?? {}
  const showValue = show.value ?? !(show.category || show.series || show.percent)
  const labelText = (si: number, i: number, v: number, pct?: number) =>
    [show.series ? (isPie ? series[0]?.name : series[si]?.name) : '', show.category ? cats[i] : '', showValue ? formatTick(v, chart.grouping === 'percent' && !isPie) : '', show.percent && pct !== undefined ? `${Math.round(pct * 100)}%` : ''].filter(Boolean).join(', ')

  // ---------- Pie and doughnut ----------
  if (isPie) {
    const values = (series[0]?.values ?? []).map((v) => Math.max(0, v ?? 0))
    const total = values.reduce((a, b) => a + b, 0) || 1
    const outside = chart.dataLabels && chart.labelPos === 'outsideEnd'
    const cx = (left + right) / 2
    const cy = (top + bottom) / 2
    const r = Math.max(4, Math.min(right - left, bottom - top) / 2 - 4 - (outside ? labelSize * 1.4 : 0))
    const hole = chart.chartType === 'doughnut' ? r * 0.5 : 0
    if (chart.threeD && !hole) {
      // 3-D pie: a tilted disc (ellipse) with a visible edge on the front half.
      const ry = r * 0.55
      const depth = r * 0.16
      const cy0 = cy - depth / 2
      const at = (a: number, dy = 0) => `${(cx + Math.cos(a) * r).toFixed(2)} ${(cy0 + dy + Math.sin(a) * ry).toFixed(2)}`
      const slices: { a0: number; a1: number; v: number; i: number }[] = []
      let acc = -Math.PI / 2
      values.forEach((v, i) => {
        const a1 = acc + (v / total) * Math.PI * 2
        slices.push({ a0: acc, a1, v, i })
        acc = a1
      })
      // Edges first (only the parts facing the viewer: angles 0…π and 2π…3π).
      for (const sl of slices)
        for (const [lo, hi] of [
          [0, Math.PI],
          [2 * Math.PI, 3 * Math.PI],
          [-2 * Math.PI, -Math.PI],
        ]) {
          const s0 = Math.max(sl.a0, lo)
          const s1 = Math.min(sl.a1, hi)
          if (s1 - s0 < 1e-4) continue
          const large = s1 - s0 > Math.PI ? 1 : 0
          const d = `M${at(s0)} A${r} ${ry} 0 ${large} 1 ${at(s1)} L${at(s1, depth)} A${r} ${ry} 0 ${large} 0 ${at(s0, depth)} Z`
          out.push(<path key={`e${sl.i}-${lo}`} d={d} fill={adjustLum(sliceColor(sl.i), -0.25)} stroke={dark ? '#262626' : '#FFFFFF'} strokeWidth={0.75} />)
        }
      for (const sl of slices) {
        const full = sl.v / total > 0.9999
        const large = sl.a1 - sl.a0 > Math.PI ? 1 : 0
        const d = full ? `M${cx - r} ${cy0} a${r} ${ry} 0 1 0 ${2 * r} 0 a${r} ${ry} 0 1 0 ${-2 * r} 0` : `M${cx} ${cy0} L${at(sl.a0)} A${r} ${ry} 0 ${large} 1 ${at(sl.a1)} Z`
        out.push(<path key={`s${sl.i}`} d={d} fill={paint(sliceColor(sl.i), `p${sl.i}`)} stroke={dark ? '#262626' : '#FFFFFF'} strokeWidth={1.5} style={{ filter }} />)
        if (chart.dataLabels && sl.v > 0) {
          const mid = (sl.a0 + sl.a1) / 2
          const pos = chart.labelPos ?? 'bestFit'
          const k = pos === 'center' ? 0.4 : pos === 'insideEnd' ? 0.8 : pos === 'outsideEnd' ? 1.18 : 0.65
          out.push(
            <text key={`dl${sl.i}`} x={cx + Math.cos(mid) * r * k} y={cy0 + Math.sin(mid) * ry * k + labelSize * 0.35} textAnchor="middle" fontSize={labelSize} fill={pos === 'outsideEnd' ? textColor : '#FFFFFF'}>
              {labelText(0, sl.i, sl.v, sl.v / total)}
            </text>,
          )
        }
      }
      return wrap(W, H, font, defs, out)
    }
    let a0 = -Math.PI / 2
    values.forEach((v, i) => {
      const a1 = a0 + (v / total) * Math.PI * 2
      const large = a1 - a0 > Math.PI ? 1 : 0
      const p = (a: number, rr: number) => `${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`
      const full = v / total > 0.9999
      const d = full
        ? hole
          ? `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 M${cx - hole} ${cy} a${hole} ${hole} 0 1 1 ${2 * hole} 0 a${hole} ${hole} 0 1 1 ${-2 * hole} 0`
          : `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`
        : hole
          ? `M${p(a0, r)} A${r} ${r} 0 ${large} 1 ${p(a1, r)} L${p(a1, hole)} A${hole} ${hole} 0 ${large} 0 ${p(a0, hole)} Z`
          : `M${cx} ${cy} L${p(a0, r)} A${r} ${r} 0 ${large} 1 ${p(a1, r)} Z`
      out.push(<path key={`s${i}`} d={d} fill={paint(sliceColor(i), `p${i}`)} fillRule="evenodd" stroke={dark ? '#262626' : '#FFFFFF'} strokeWidth={1.5} style={{ filter }} />)
      if (chart.dataLabels && v > 0) {
        const mid = (a0 + a1) / 2
        const pos = chart.labelPos ?? 'bestFit'
        const lr = hole ? (r + hole) / 2 : pos === 'center' ? r * 0.4 : pos === 'insideEnd' ? r * 0.8 : pos === 'outsideEnd' ? r + labelSize * 0.9 : r * 0.65
        const lx = cx + Math.cos(mid) * lr
        out.push(
          <text key={`dl${i}`} x={lx} y={cy + Math.sin(mid) * lr + labelSize * 0.35} textAnchor={pos === 'outsideEnd' && !hole ? (Math.cos(mid) > 0.2 ? 'start' : Math.cos(mid) < -0.2 ? 'end' : 'middle') : 'middle'} fontSize={labelSize} fill={pos === 'outsideEnd' && !hole ? textColor : '#FFFFFF'}>
            {labelText(0, i, v, v / total)}
          </text>,
        )
      }
      a0 = a1
    })
    return wrap(W, H, font, defs, out)
  }

  // ---------- Axes ----------
  const scatter = chart.chartType === 'scatter'
  const percent = chart.grouping === 'percent' && chart.chartType !== 'scatter'
  const stacked = chart.grouping !== 'clustered' && chart.chartType !== 'scatter' && chart.chartType !== 'combo'
  const n = cats.length
  // Series on the secondary (right) axis get their own scale; horizontal bar charts keep one axis.
  const onSec = (si: number) => !isBar && !!series[si]?.secondary
  const axisSeries = (sec: boolean) => series.map((_, i) => i).filter((i) => onSec(i) === sec)
  const hasSec = axisSeries(true).length > 0
  const totalsFor = (idxs: number[]) => cats.map((_, i) => idxs.reduce((a, si) => a + Math.abs(series[si].values[i] ?? 0), 0) || 1)
  const totals = [totalsFor(axisSeries(false)), totalsFor(axisSeries(true))]
  const val = (si: number, i: number) => {
    const v = series[si].values[i] ?? 0
    return percent ? v / totals[onSec(si) ? 1 : 0][i] : v
  }
  const extent = (idxs: number[]) => {
    let vmin = 0
    let vmax = 0
    if (stacked) {
      cats.forEach((_, i) => {
        let pos = 0
        let neg = 0
        idxs.forEach((si) => {
          const v = val(si, i)
          if (v >= 0) pos += v
          else neg += v
        })
        vmax = Math.max(vmax, pos)
        vmin = Math.min(vmin, neg)
      })
    } else
      idxs.forEach((si) =>
        cats.forEach((_, i) => {
          vmax = Math.max(vmax, val(si, i))
          vmin = Math.min(vmin, val(si, i))
        }),
      )
    if (percent) {
      vmax = Math.min(1, Math.max(vmax, 1))
      vmin = Math.max(-1, vmin)
    }
    return { vmin, vmax }
  }
  const e1 = extent(axisSeries(false))
  const scale = niceScale(e1.vmin, e1.vmax, chart.axes.min, chart.axes.max)
  const e2 = hasSec ? extent(axisSeries(true)) : null
  const scale2 = e2 ? niceScale(e2.vmin, e2.vmax) : null
  const xs = scatter ? cats.map((c) => parseFloat(c)).map((v, i) => (Number.isFinite(v) ? v : i + 1)) : []
  const xScale = scatter ? niceScale(Math.min(...xs, 0), Math.max(...xs, 1)) : null
  const valLabels = scale.ticks.map((t) => formatTick(t, percent))
  const valLabels2 = scale2 ? scale2.ticks.map((t) => formatTick(t, percent)) : []
  const valLabelW = chart.axes.val ? Math.max(...valLabels.map((l) => textWidth(l, labelSize))) + 8 : 0
  const valLabelW2 = scale2 && chart.axes.val ? Math.max(...valLabels2.map((l) => textWidth(l, labelSize))) + 8 : 0
  const catLabelW = isBar && chart.axes.cat ? Math.max(0, ...cats.map((c) => textWidth(c, labelSize))) + 8 : 0
  if (chart.axes.valTitle) {
    if (isBar) bottom -= labelSize * 1.6
    else left += labelSize * 1.6
  }
  if (scale2 && chart.axes.secTitle) right -= labelSize * 1.6
  if (chart.axes.catTitle) {
    if (isBar) left += labelSize * 1.6
    else bottom -= labelSize * 1.6
  }
  const plot = isBar
    ? { x: left + catLabelW, y: top + 4, w: Math.max(10, right - left - catLabelW - 4), h: Math.max(10, bottom - top - 4 - (chart.axes.val ? labelSize * 1.5 : 0)) }
    : { x: left + valLabelW, y: top + labelSize * 0.5, w: Math.max(10, right - left - valLabelW - valLabelW2 - 4), h: Math.max(10, bottom - top - labelSize * 0.5 - (chart.axes.cat ? labelSize * 1.6 : 0)) }
  const posIn = (sc: typeof scale, v: number) => (isBar ? plot.x + ((v - sc.min) / (sc.max - sc.min)) * plot.w : plot.y + plot.h - ((v - sc.min) / (sc.max - sc.min)) * plot.h)
  const vToPos = (v: number) => posIn(scale, v)
  const vPos = (si: number, v: number) => posIn(onSec(si) && scale2 ? scale2 : scale, v)
  const clampV = (si: number, v: number) => {
    const sc = onSec(si) && scale2 ? scale2 : scale
    return Math.max(sc.min, Math.min(sc.max, v))
  }
  const zero = vToPos(Math.max(scale.min, Math.min(scale.max, 0)))

  // Gridlines and value labels.
  const grid = chart.gridlines.major && !st.noGrid
  scale.ticks.forEach((t, i) => {
    const pos = vToPos(t)
    if (grid) out.push(isBar ? <line key={`g${i}`} x1={pos} x2={pos} y1={plot.y} y2={plot.y + plot.h} stroke={gridColor} strokeWidth={1} /> : <line key={`g${i}`} x1={plot.x} x2={plot.x + plot.w} y1={pos} y2={pos} stroke={gridColor} strokeWidth={1} />)
    if (chart.gridlines.minor && i < scale.ticks.length - 1) {
      const mid = vToPos(t + scale.step / 2)
      out.push(isBar ? <line key={`gm${i}`} x1={mid} x2={mid} y1={plot.y} y2={plot.y + plot.h} stroke={gridColor} strokeWidth={0.5} /> : <line key={`gm${i}`} x1={plot.x} x2={plot.x + plot.w} y1={mid} y2={mid} stroke={gridColor} strokeWidth={0.5} />)
    }
    if (chart.axes.val)
      out.push(
        isBar ? (
          <text key={`vl${i}`} x={pos} y={plot.y + plot.h + labelSize * 1.2} textAnchor="middle" fontSize={labelSize} fill={textColor}>
            {valLabels[i]}
          </text>
        ) : (
          <text key={`vl${i}`} x={plot.x - 6} y={pos + labelSize * 0.35} textAnchor="end" fontSize={labelSize} fill={textColor}>
            {valLabels[i]}
          </text>
        ),
      )
  })
  if (scale2 && chart.axes.val)
    scale2.ticks.forEach((t, i) =>
      out.push(
        <text key={`vl2${i}`} x={plot.x + plot.w + 6} y={posIn(scale2, t) + labelSize * 0.35} textAnchor="start" fontSize={labelSize} fill={textColor}>
          {valLabels2[i]}
        </text>,
      ),
    )
  // Category axis line and labels.
  const band = (isBar ? plot.h : plot.w) / Math.max(1, n)
  const catPos = (i: number) => (isBar ? plot.y + band * (i + 0.5) : plot.x + band * (i + 0.5))
  if (!scatter) {
    out.push(isBar ? <line key="cax" x1={zero} x2={zero} y1={plot.y} y2={plot.y + plot.h} stroke={gridColor} strokeWidth={1} /> : <line key="cax" x1={plot.x} x2={plot.x + plot.w} y1={zero} y2={zero} stroke={gridColor} strokeWidth={1} />)
    if (chart.axes.cat)
      cats.forEach((c, i) =>
        out.push(
          isBar ? (
            <text key={`cl${i}`} x={plot.x - 6} y={catPos(n - 1 - i) + labelSize * 0.35} textAnchor="end" fontSize={labelSize} fill={textColor}>
              {c}
            </text>
          ) : (
            <text key={`cl${i}`} x={catPos(i)} y={plot.y + plot.h + labelSize * 1.2} textAnchor="middle" fontSize={labelSize} fill={textColor}>
              {c}
            </text>
          ),
        ),
      )
  }
  if (chart.axes.valTitle)
    out.push(
      isBar ? (
        <text key="vt" x={plot.x + plot.w / 2} y={H - pad - (chart.legend.show && chart.legend.pos === 'bottom' ? labelSize * 1.8 : 0)} textAnchor="middle" fontSize={labelSize * 1.1} fill={textColor}>
          {chart.axes.valTitle}
        </text>
      ) : (
        <text key="vt" x={0} y={0} transform={`translate(${pad + labelSize} ${plot.y + plot.h / 2}) rotate(-90)`} textAnchor="middle" fontSize={labelSize * 1.1} fill={textColor}>
          {chart.axes.valTitle}
        </text>
      ),
    )
  if (scale2 && chart.axes.secTitle)
    out.push(
      <text key="st" x={0} y={0} transform={`translate(${W - pad - labelSize * 0.4} ${plot.y + plot.h / 2}) rotate(90)`} textAnchor="middle" fontSize={labelSize * 1.1} fill={textColor}>
        {chart.axes.secTitle}
      </text>,
    )
  if (chart.axes.catTitle)
    out.push(
      isBar ? (
        <text key="ct" x={0} y={0} transform={`translate(${pad + labelSize} ${plot.y + plot.h / 2}) rotate(-90)`} textAnchor="middle" fontSize={labelSize * 1.1} fill={textColor}>
          {chart.axes.catTitle}
        </text>
      ) : (
        <text key="ct" x={plot.x + plot.w / 2} y={plot.y + plot.h + labelSize * 2.6} textAnchor="middle" fontSize={labelSize * 1.1} fill={textColor}>
          {chart.axes.catTitle}
        </text>
      ),
    )

  // ---------- Series ----------
  const groupW = band * (st.wide ? 0.75 : 0.62)
  const labels: ReactNode[] = []
  const label = (key: string, x: number, y: number, si: number, i: number, v: number, anchor: 'middle' | 'start' | 'end' = 'middle') =>
    chart.dataLabels &&
    labels.push(
      <text key={key} x={x} y={y} textAnchor={anchor} fontSize={labelSize * 0.95} fill={textColor}>
        {labelText(si, i, v)}
      </text>,
    )

  // Error bars, drawn above the series (vertical for columns, lines and scatter points; horizontal for bars).
  const errs: ReactNode[] = []
  const errBar = (key: string, si: number, i: number, value: number, at: number, horizontal: boolean) => {
    const eb = series[si].errorBars
    // Like the original, 3-D charts have no error bars.
    if (!eb || percent || chart.threeD) return
    const [m, p] = errorAmount(series[si].values, i, eb)
    const a = vPos(si, clampV(si, value - m))
    const b = vPos(si, clampV(si, value + p))
    const stroke = dark ? '#F2F2F2' : '#404040'
    const cap = eb.noCap ? 0 : 4
    if (horizontal) {
      errs.push(<line key={key} x1={a} x2={b} y1={at} y2={at} stroke={stroke} strokeWidth={1} />)
      if (cap) for (const [k, x] of [m ? a : null, p ? b : null].entries()) x !== null && errs.push(<line key={`${key}c${k}`} x1={x} x2={x} y1={at - cap} y2={at + cap} stroke={stroke} strokeWidth={1} />)
    } else {
      errs.push(<line key={key} x1={at} x2={at} y1={a} y2={b} stroke={stroke} strokeWidth={1} />)
      if (cap) for (const [k, y] of [m ? a : null, p ? b : null].entries()) y !== null && errs.push(<line key={`${key}c${k}`} x1={at - cap} x2={at + cap} y1={y} y2={y} stroke={stroke} strokeWidth={1} />)
    }
  }
  const depth3d = chart.threeD && chart.chartType !== 'combo' ? Math.min(groupW * 0.35, 14) : 0

  // Columns and bars; the secondary axis draws its own (overlapping) set, like the original.
  for (const sec of [false, true]) {
    const barSeries = axisSeries(sec).filter((i) => seriesType(chart, i) === 'column')
    const barW = stacked ? groupW : groupW / Math.max(1, barSeries.length)
    const stackPos = cats.map(() => 0)
    const stackNeg = cats.map(() => 0)
    barSeries.forEach((si, bi) => {
      const c = color(si, series.length)
      const fill = paint(c, `b${si}`)
      cats.forEach((_, i) => {
        const v = val(si, i)
        let from: number
        let to: number
        if (stacked) {
          if (v >= 0) {
            from = stackPos[i]
            to = stackPos[i] += v
          } else {
            from = stackNeg[i]
            to = stackNeg[i] += v
          }
        } else {
          from = 0
          to = v
        }
        const a = vPos(si, clampV(si, from))
        const b = vPos(si, clampV(si, to))
        const ci = isBar ? n - 1 - i : i
        const off = catPos(ci) - groupW / 2 + (stacked ? 0 : bi * barW)
        const raw = series[si].values[i] ?? 0
        const pos = chart.labelPos ?? (stacked ? 'center' : 'outsideEnd')
        if (depth3d) {
          // 3-D look: a lighter top and a darker side face behind the front face.
          const dx = depth3d * 0.8
          const dy = depth3d * 0.55
          const [x0, x1, y0, y1] = isBar ? [Math.min(a, b), Math.max(a, b), off, off + barW] : [off, off + barW, Math.min(a, b), Math.max(a, b)]
          out.push(<path key={`t3${si}-${i}`} d={`M${x0} ${y0} L${x0 + dx} ${y0 - dy} L${x1 + dx} ${y0 - dy} L${x1} ${y0} Z`} fill={adjustLum(c, 0.25)} stroke={barStroke} strokeWidth={st.outline ? 1 : 0} />)
          out.push(<path key={`s3${si}-${i}`} d={`M${x1} ${y0} L${x1 + dx} ${y0 - dy} L${x1 + dx} ${y1 - dy} L${x1} ${y1} Z`} fill={adjustLum(c, -0.3)} stroke={barStroke} strokeWidth={st.outline ? 1 : 0} />)
        }
        if (isBar) errBar(`eb${si}-${i}`, si, i, to, off + barW / 2, true)
        else errBar(`eb${si}-${i}`, si, i, to, off + barW / 2, false)
        if (isBar) {
          out.push(<rect key={`r${si}-${i}`} x={Math.min(a, b)} y={off} width={Math.abs(b - a)} height={barW} fill={fill} stroke={barStroke} strokeWidth={st.outline ? 1.5 : 0} style={{ filter }} />)
          const end = v >= 0 ? Math.max(a, b) : Math.min(a, b)
          const base = v >= 0 ? Math.min(a, b) : Math.max(a, b)
          const lx = pos === 'center' ? (a + b) / 2 : pos === 'insideEnd' ? end - 4 : pos === 'insideBase' ? base + 4 : end + 4
          label(`d${si}-${i}`, lx, off + barW / 2 + labelSize * 0.33, si, i, raw, pos === 'center' ? 'middle' : pos === 'insideEnd' ? 'end' : 'start')
        } else {
          out.push(<rect key={`r${si}-${i}`} x={off} y={Math.min(a, b)} width={barW} height={Math.abs(b - a)} fill={fill} stroke={barStroke} strokeWidth={st.outline ? 1.5 : 0} style={{ filter }} />)
          const end = v >= 0 ? Math.min(a, b) : Math.max(a, b)
          const base = v >= 0 ? Math.max(a, b) : Math.min(a, b)
          const ly = pos === 'center' ? (a + b) / 2 + labelSize * 0.35 : pos === 'insideEnd' ? end + labelSize * 1.05 : pos === 'insideBase' ? base - 4 : end - 4
          label(`d${si}-${i}`, off + barW / 2, ly, si, i, raw)
        }
      })
    })
  }

  // Lines and areas (stacked lines/areas accumulate per category and axis).
  const acc = [cats.map(() => 0), cats.map(() => 0)]
  const xOf = (i: number) => (scatter && xScale ? plot.x + ((xs[i] - xScale.min) / (xScale.max - xScale.min)) * plot.w : catPos(i))
  series.forEach((s, si) => {
    const kind = seriesType(chart, si)
    if (kind === 'column') return
    const c = color(si, series.length)
    const pts: [number, number][] = []
    const base: [number, number][] = []
    const sum = acc[onSec(si) ? 1 : 0]
    cats.forEach((_, i) => {
      const raw = s.values[i]
      if (raw === null || raw === undefined) return
      const v = val(si, i)
      const lo = stacked ? sum[i] : 0
      const hi = stacked ? (sum[i] += v) : v
      const x = xOf(i)
      pts.push([x, vPos(si, hi)])
      base.push([x, vPos(si, lo)])
      if (kind !== 'area') errBar(`eb${si}-${i}`, si, i, hi, x, false)
      if (kind !== 'area') {
        const pos = chart.labelPos ?? 'above'
        const ly = pos === 'center' ? vPos(si, hi) + labelSize * 0.35 : pos === 'below' ? vPos(si, hi) + labelSize * 1.2 : vPos(si, hi) - 8
        label(`dl${si}-${i}`, pos === 'left' ? x - 6 : pos === 'right' ? x + 6 : x, pos === 'left' || pos === 'right' ? vPos(si, hi) + labelSize * 0.35 : ly, si, i, raw, pos === 'left' ? 'end' : pos === 'right' ? 'start' : 'middle')
      }
    })
    if (!pts.length) return
    if (kind === 'area') {
      const d = `M${pts.map((p) => p.join(' ')).join(' L')} L${[...base].reverse().map((p) => p.join(' ')).join(' L')} Z`
      out.push(<path key={`a${si}`} d={d} fill={paint(c, `a${si}`)} fillOpacity={st.gradient ? 1 : 0.9} stroke={barStroke} style={{ filter }} />)
      return
    }
    if (!scatter || chart.smooth) {
      const d = chart.smooth ? smoothPath(pts) : `M${pts.map((p) => p.join(' ')).join(' L')}`
      if (!scatter) out.push(<path key={`l${si}`} d={d} fill="none" stroke={c} strokeWidth={st.wide ? 3.5 : 2.25 * PX} strokeLinejoin="round" strokeLinecap="round" style={{ filter }} />)
      else out.push(<path key={`l${si}`} d={d} fill="none" stroke={c} strokeWidth={2} />)
    }
    if (chart.markers || scatter) pts.forEach(([x, y], i) => out.push(<circle key={`m${si}-${i}`} cx={x} cy={y} r={scatter ? 4 : 3.5} fill={c} stroke={dark ? '#262626' : '#FFFFFF'} strokeWidth={1} />))
  })

  // Trendlines (fitted on category numbers 1…n, or on x values for scatter charts).
  series.forEach((s, si) => {
    const t = s.trendline
    if (!t || stacked) return
    const data = cats.map((_, i) => [scatter ? xs[i] : i + 1, s.values[i]] as [number, number | null]).filter((q): q is [number, number] => q[1] !== null && q[1] !== undefined)
    const fit = fitTrend(data, t)
    if (!fit) return
    const c = color(si, series.length)
    const toX = (x: number) => (scatter && xScale ? plot.x + ((x - xScale.min) / (xScale.max - xScale.min)) * plot.w : plot.x + band * (x - 0.5))
    let pts: [number, number][]
    if ('points' in fit) pts = fit.points.map(([x, y]) => [toX(x), vPos(si, clampV(si, y))])
    else {
      const x0 = data[0][0]
      const x1 = data[data.length - 1][0] + (t.forward ?? 0)
      pts = []
      for (let k = 0; k <= 48; k++) {
        const x = x0 + ((x1 - x0) * k) / 48
        const y = fit.at(x)
        if (y !== null && Number.isFinite(y)) pts.push([toX(x), vPos(si, clampV(si, y))])
      }
    }
    if (pts.length < 2) return
    out.push(<path key={`t${si}`} d={`M${pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' L')}`} fill="none" stroke={c} strokeWidth={1.5 * PX} strokeDasharray="3 3" strokeLinecap="round" />)
    if (!('points' in fit) && (t.showEquation || t.showR2)) {
      const [ex, ey] = pts[pts.length - 1]
      const text = [t.showEquation ? fit.equation : '', t.showR2 ? `R² = ${fit.r2.toFixed(4)}` : ''].filter(Boolean)
      text.forEach((line, k) =>
        labels.push(
          <text key={`te${si}-${k}`} x={Math.min(ex, plot.x + plot.w)} y={Math.max(plot.y + labelSize, ey - 8 - (text.length - 1 - k) * labelSize * 1.1)} textAnchor="end" fontSize={labelSize * 0.9} fill={textColor}>
            {line}
          </text>,
        ),
      )
    }
  })
  if (scatter && xScale && chart.axes.cat)
    xScale.ticks.forEach((t, i) => {
      const x = plot.x + ((t - xScale.min) / (xScale.max - xScale.min)) * plot.w
      out.push(
        <text key={`xl${i}`} x={x} y={plot.y + plot.h + labelSize * 1.2} textAnchor="middle" fontSize={labelSize} fill={textColor}>
          {formatTick(t)}
        </text>,
      )
      if (grid) out.push(<line key={`xg${i}`} x1={x} x2={x} y1={plot.y} y2={plot.y + plot.h} stroke={gridColor} strokeWidth={1} />)
    })
  out.push(...errs, ...labels)
  return wrap(W, H, font, defs, out)
}

function seriesType(chart: ChartElement, i: number): ChartSeriesType {
  switch (chart.chartType) {
    case 'line':
    case 'scatter':
      return 'line'
    case 'area':
      return 'area'
    case 'combo':
      return chart.series[i]?.type ?? (i === 0 ? 'column' : 'line')
    default:
      return 'column'
  }
}

function smoothPath(pts: [number, number][]) {
  if (pts.length < 3) return `M${pts.map((p) => p.join(' ')).join(' L')}`
  let d = `M${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0]} ${p2[1]}`
  }
  return d
}

function LegendKey({ x, y, size, color, line }: { x: number; y: number; size: number; color: string; line: boolean }) {
  return line ? <line x1={x} x2={x + size} y1={y} y2={y} stroke={color} strokeWidth={3} /> : <rect x={x} y={y - size / 2} width={size} height={size} fill={color} />
}

function wrap(w: number, h: number, font: string, defs: ReactNode[], children: ReactNode[]) {
  return (
    <svg className="chart-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ fontFamily: font }} aria-hidden="true">
      {defs.length > 0 && <defs>{defs}</defs>}
      {children}
    </svg>
  )
}
