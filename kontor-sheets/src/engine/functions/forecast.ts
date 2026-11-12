// Exponential triple smoothing (additive error, trend and seasonality): FORECAST.ETS and its
// companions, also used by Data > Forecast Sheet.
import { fn } from '../registry'
import type { Ctx, Value } from '../values'
import { CellError, ERR, argMatrix, argNum, isErr } from './helpers'

export type EtsModel = {
  alpha: number
  beta: number
  gamma: number
  season: number
  step: number
  t0: number
  level: number
  trend: number
  seasonal: number[]
  /** One-step-ahead errors of the fit. */
  errors: number[]
  values: number[]
}

/** Season length with the strongest autocorrelation of the detrended series (1 = none). */
export function detectSeason(ys: number[]): number {
  const n = ys.length
  if (n < 6) return 1
  // remove a linear trend
  const xm = (n - 1) / 2
  const ym = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  ys.forEach((y, i) => {
    sxy += (i - xm) * (y - ym)
    sxx += (i - xm) * (i - xm)
  })
  const slope = sxx ? sxy / sxx : 0
  const d = ys.map((y, i) => y - (ym + slope * (i - xm)))
  const v = d.reduce((a, b) => a + b * b, 0)
  if (!v) return 1
  let best = 1
  let bestAcf = 0.3
  for (let lag = 2; lag <= Math.min(Math.floor(n / 2), 8760); lag++) {
    let s = 0
    for (let i = lag; i < n; i++) s += d[i] * d[i - lag]
    const acf = s / v
    if (acf > bestAcf + 1e-9) {
      bestAcf = acf
      best = lag
    }
  }
  return best
}

function fitWith(ys: number[], m: number, alpha: number, beta: number, gamma: number) {
  const n = ys.length
  const first = ys.slice(0, m)
  let level = first.reduce((a, b) => a + b, 0) / m
  let trend = n >= 2 * m ? (ys.slice(m, 2 * m).reduce((a, b) => a + b, 0) / m - level) / m : n > 1 ? (ys[n - 1] - ys[0]) / (n - 1) : 0
  const seasonal = m > 1 ? first.map((y) => y - level) : [0]
  const errors: number[] = []
  let sse = 0
  for (let i = 0; i < n; i++) {
    const s = seasonal[i % m]
    const pred = level + trend + (m > 1 ? s : 0)
    const e = ys[i] - pred
    if (i >= m) {
      errors.push(e)
      sse += e * e
    }
    const lastLevel = level
    level = alpha * (ys[i] - (m > 1 ? s : 0)) + (1 - alpha) * (level + trend)
    trend = beta * (level - lastLevel) + (1 - beta) * trend
    if (m > 1) seasonal[i % m] = gamma * (ys[i] - level) + (1 - gamma) * s
  }
  return { level, trend, seasonal, errors, sse }
}

/** Fits the model, choosing the smoothing parameters with the smallest squared error. */
export function etsFit(ys: number[], ts: number[], seasonality: number): EtsModel | CellError {
  if (ys.length < 3 || ys.length !== ts.length) return ERR.num
  const order = ts.map((t, i) => [t, ys[i]] as const).sort((a, b) => a[0] - b[0])
  const t = order.map((p) => p[0])
  const steps = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b)
  // the typical step (a monthly timeline has steps of 28 to 31 days)
  const step = steps[Math.floor(steps.length / 2)]
  if (!(step > 0)) return ERR.num
  // fill gaps on the timeline by linear interpolation (data completion = 1)
  const values: number[] = []
  for (let i = 0; i < order.length; i++) {
    values.push(order[i][1])
    if (i + 1 < order.length) {
      const gaps = Math.round((t[i + 1] - t[i]) / step) - 1
      for (let g = 1; g <= gaps; g++) values.push(order[i][1] + ((order[i + 1][1] - order[i][1]) * g) / (gaps + 1))
    }
  }
  const m = seasonality === 1 ? detectSeason(values) : Math.max(1, Math.trunc(seasonality) || 1)
  if (m > values.length / 2 && m > 1) return ERR.num
  let best: (ReturnType<typeof fitWith> & { a: number; b: number; g: number }) | null = null
  const grid = [0.01, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.99]
  for (const a of grid)
    for (const b of [0.001, 0.01, 0.05, 0.1, 0.2, 0.3, 0.5])
      for (const g of m > 1 ? [0.001, 0.05, 0.1, 0.2, 0.4, 0.6, 0.9] : [0]) {
        const f = fitWith(values, m, a, b, g)
        if (!best || f.sse < best.sse) best = { ...f, a, b, g }
      }
  const f = best!
  return { alpha: f.a, beta: f.b, gamma: f.g, season: m, step, t0: t[0], level: f.level, trend: f.trend, seasonal: f.seasonal, errors: f.errors, values }
}

/** Forecast at timeline value x (beyond the last point). */
export function etsForecast(model: EtsModel, x: number): number {
  const n = model.values.length
  const h = Math.max(1, (x - (model.t0 + (n - 1) * model.step)) / model.step)
  const m = model.season
  const s = m > 1 ? model.seasonal[(n + Math.ceil(h) - 1) % m] : 0
  return model.level + h * model.trend + s
}

/** Half width of the prediction interval at x for the given confidence level. */
export function etsConfint(model: EtsModel, x: number, conf: number): number {
  const n = model.values.length
  const h = Math.max(1, (x - (model.t0 + (n - 1) * model.step)) / model.step)
  const errs = model.errors.length ? model.errors : [0]
  const sigma = Math.sqrt(errs.reduce((a, e) => a + e * e, 0) / errs.length)
  const growth = 1 + (h - 1) * model.alpha * model.alpha * (1 + h * model.beta + (h * (2 * h - 1) * model.beta * model.beta) / 6)
  return normInv((1 + conf) / 2) * sigma * Math.sqrt(growth)
}

/** Inverse standard normal (Acklam's rational approximation). */
function normInv(p: number) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  const q = p < 0.02425 ? Math.sqrt(-2 * Math.log(p)) : p > 0.97575 ? Math.sqrt(-2 * Math.log(1 - p)) : 0
  if (p < 0.02425) return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  if (p > 0.97575) return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  const r = p - 0.5
  const s = r * r
  return ((((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r) / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1)
}

function series(args: Value[], vi: number, ti: number, ctx: Ctx): { ys: number[]; ts: number[] } | CellError {
  const ym = argMatrix(args, vi, ctx)
  if (isErr(ym)) return ym
  const tm = argMatrix(args, ti, ctx)
  if (isErr(tm)) return tm
  if (ym.data.length !== tm.data.length) return ERR.na
  const ys: number[] = []
  const ts: number[] = []
  ym.data.forEach((y, i) => {
    const t = tm.data[i]
    if (typeof t !== 'number') return
    if (typeof y === 'number') {
      ys.push(y)
      ts.push(t)
    }
  })
  return ts.length < 3 ? ERR.num : { ys, ts }
}

function modelOf(args: Value[], vi: number, ti: number, si: number, ctx: Ctx): EtsModel | CellError {
  const s = series(args, vi, ti, ctx)
  if (isErr(s)) return s
  const season = args.length > si && args[si] !== null ? argNum(args, si, ctx) : 1
  if (isErr(season)) return season
  if (season < 0 || season > 8760) return ERR.num
  return etsFit(s.ys, s.ts, season)
}

fn('FORECAST.ETS', 3, 6, (args, ctx) => {
  const x = argNum(args, 0, ctx)
  if (isErr(x)) return x
  const m = modelOf(args, 1, 2, 3, ctx)
  return isErr(m) ? m : etsForecast(m, x)
})

fn('FORECAST.ETS.CONFINT', 3, 7, (args, ctx) => {
  const x = argNum(args, 0, ctx)
  if (isErr(x)) return x
  const conf = args.length > 3 && args[3] !== null ? argNum(args, 3, ctx) : 0.95
  if (isErr(conf)) return conf
  if (conf <= 0 || conf >= 1) return ERR.num
  const m = modelOf(args, 1, 2, 4, ctx)
  return isErr(m) ? m : etsConfint(m, x, conf)
})

fn('FORECAST.ETS.SEASONALITY', 2, 4, (args, ctx) => {
  const m = modelOf(args, 0, 1, 99, ctx)
  return isErr(m) ? m : m.season === 1 ? 0 : m.season
})

fn('FORECAST.ETS.STAT', 3, 6, (args, ctx) => {
  const type = argNum(args, 2, ctx)
  if (isErr(type)) return type
  const m = modelOf(args, 0, 1, 3, ctx)
  if (isErr(m)) return m
  const e = m.errors.length ? m.errors : [0]
  const ys = m.values
  const mae = e.reduce((a, x) => a + Math.abs(x), 0) / e.length
  const naive = ys.slice(1).reduce((a, y, i) => a + Math.abs(y - ys[i]), 0) / Math.max(1, ys.length - 1)
  const smape = (e.reduce((a, x, i) => {
    const y = ys[i + m.season] ?? 0
    const f = y - x
    return a + (Math.abs(y) + Math.abs(f) ? Math.abs(x) / ((Math.abs(y) + Math.abs(f)) / 2) : 0)
  }, 0) / e.length)
  switch (Math.trunc(type)) {
    case 1: return m.alpha
    case 2: return m.beta
    case 3: return m.gamma
    case 4: return naive ? mae / naive : 0
    case 5: return smape
    case 6: return mae
    case 7: return Math.sqrt(e.reduce((a, x) => a + x * x, 0) / e.length)
    case 8: return m.step
    default: return ERR.num
  }
})

export type { CellError }
