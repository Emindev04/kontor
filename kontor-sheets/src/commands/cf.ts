// Conditional formatting: evaluating rules for a cell (highlight rules, top/bottom, averages,
// duplicates, formulas, data bars, color scales and icon sets) and managing the rule list.
import { MAX_COLS, MAX_ROWS, type Range } from '../model/address'
import type { CFRule, CFStyle, CFValue, IconSetId, NewCFRule } from '../model/extras'
import type { Sheet } from '../model/sheet'
import { CellError, type Scalar } from '../model/types'
import { shiftFormula } from '../engine/refs'
import { periodBounds } from './filter'
import type { Doc } from './doc'
import { t, tx } from '../i18n'

export type CFResult = {
  style?: CFStyle
  bar?: { start: number; end: number; color: string; gradient: boolean; showValue: boolean; border: boolean; negative: boolean; axis?: number; axisColor?: string }
  scale?: string
  icon?: { set: IconSetId; index: number; count: number; showValue: boolean }
}

export const ICON_COUNTS: Record<IconSetId, number> = {
  '3Arrows': 3, '3ArrowsGray': 3, '4Arrows': 4, '5Arrows': 5, '3Triangles': 3, '3TrafficLights1': 3, '3TrafficLights2': 3, '3Signs': 3, '4TrafficLights': 4,
  '3Symbols': 3, '3Symbols2': 3, '3Flags': 3, '3Stars': 3, '4Rating': 4, '5Rating': 5, '5Quarters': 5, '5Boxes': 5, '4RedToBlack': 4,
}

type Stats = { nums: number[]; sorted: number[]; min: number; max: number; avg: number; std: number; counts: Map<string, number> }

const keyOf = (v: Scalar) => (v instanceof CellError ? v.code : typeof v === 'string' ? 's' + v.toUpperCase() : String(v))

const cache = new WeakMap<Sheet, { version: number; stats: Map<number, Stats> }>()

function bound(doc: Doc, sheet: Sheet, rg: Range): Range {
  const u = sheet.used()
  return { r1: rg.r1, c1: rg.c1, r2: Math.min(rg.r2, Math.max(rg.r1, u.r)), c2: Math.min(rg.c2, Math.max(rg.c1, u.c)) }
}

function ruleStats(doc: Doc, sheet: Sheet, rule: CFRule): Stats {
  let entry = cache.get(sheet)
  if (!entry || entry.version !== doc.version) cache.set(sheet, (entry = { version: doc.version, stats: new Map() }))
  const hit = entry.stats.get(rule.id)
  if (hit) return hit
  const nums: number[] = []
  const counts = new Map<string, number>()
  for (const rg0 of rule.ranges) {
    const rg = bound(doc, sheet, rg0)
    for (let r = rg.r1; r <= rg.r2; r++)
      for (let c = rg.c1; c <= rg.c2; c++) {
        const v = doc.engine.display(sheet, r, c)
        if (v === null || v === '') continue
        if (typeof v === 'number') nums.push(v)
        const k = keyOf(v)
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
  }
  const sorted = nums.slice().sort((a, b) => a - b)
  const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
  const std = nums.length > 1 ? Math.sqrt(nums.reduce((a, b) => a + (b - avg) ** 2, 0) / (nums.length - 1)) : 0
  const st: Stats = { nums, sorted, min: sorted[0] ?? 0, max: sorted[sorted.length - 1] ?? 0, avg, std, counts }
  entry.stats.set(rule.id, st)
  return st
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0
  const k = (sorted.length - 1) * Math.max(0, Math.min(1, p))
  const lo = Math.floor(k)
  const hi = Math.ceil(k)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (k - lo)
}

function origin(rule: CFRule) {
  const r = rule.ranges[0]
  return { r: r?.r1 ?? 0, c: r?.c1 ?? 0 }
}

function evalAt(doc: Doc, sheet: Sheet, rule: CFRule, text: string, r: number, c: number): Scalar {
  const o = origin(rule)
  const f = text.startsWith('=') ? text.slice(1) : text
  return doc.engine.evalScalar(r === o.r && c === o.c ? f : shiftFormula(f, r - o.r, c - o.c), sheet, r, c)
}

function cfNumber(doc: Doc, sheet: Sheet, rule: CFRule, v: CFValue, st: Stats, which: 'min' | 'max', r: number, c: number): number {
  switch (v.type) {
    case 'min': return st.min
    case 'max': return st.max
    case 'auto': return which === 'min' ? Math.min(0, st.min) : Math.max(0, st.max)
    case 'num': return Number(v.value ?? 0)
    case 'percent': return st.min + ((st.max - st.min) * Number(v.value ?? 0)) / 100
    case 'percentile': return percentile(st.sorted, Number(v.value ?? 0) / 100)
    case 'formula': {
      const x = evalAt(doc, sheet, rule, String(v.value ?? '0'), r, c)
      return typeof x === 'number' ? x : 0
    }
  }
}

function hex(c: string) {
  const n = parseInt(c.replace('#', ''), 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}

function lerpColor(a: string, b: string, t: number) {
  const x = hex(a)
  const y = hex(b)
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')
}

function asNumber(v: Scalar): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return null
  return null
}

function cmp(a: Scalar, b: Scalar): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const sa = a === null ? '' : String(a instanceof CellError ? a.code : a).toUpperCase()
  const sb = b === null ? '' : String(b instanceof CellError ? b.code : b).toUpperCase()
  if (typeof a === 'number' && typeof b !== 'number') return -1
  if (typeof b === 'number' && typeof a !== 'number') return 1
  return sa < sb ? -1 : sa > sb ? 1 : 0
}

/** Whether a highlight-type rule applies to (r, c). */
function test(doc: Doc, sheet: Sheet, rule: CFRule, r: number, c: number, v: Scalar): boolean {
  switch (rule.type) {
    case 'cellIs': {
      if (v === null) v = 0
      const a = evalAt(doc, sheet, rule, rule.f1, r, c)
      if (rule.op === 'between' || rule.op === 'notBetween') {
        const b = evalAt(doc, sheet, rule, rule.f2 ?? '0', r, c)
        const lo = cmp(a, b) <= 0 ? a : b
        const hi = cmp(a, b) <= 0 ? b : a
        const inside = cmp(v, lo) >= 0 && cmp(v, hi) <= 0
        return rule.op === 'between' ? inside : !inside
      }
      const d = cmp(v, a)
      switch (rule.op) {
        case 'equal': return d === 0
        case 'notEqual': return d !== 0
        case 'greaterThan': return d > 0
        case 'lessThan': return d < 0
        case 'greaterThanOrEqual': return d >= 0
        case 'lessThanOrEqual': return d <= 0
      }
      return false
    }
    case 'text': {
      const t = v === null ? '' : String(v instanceof CellError ? v.code : v).toLowerCase()
      const q = rule.text.toLowerCase()
      if (rule.op === 'contains') return t.includes(q)
      if (rule.op === 'notContains') return !t.includes(q)
      if (rule.op === 'beginsWith') return t.startsWith(q)
      return t.endsWith(q)
    }
    case 'date': {
      if (typeof v !== 'number') return false
      const b = periodBounds(rule.period)
      return !!b && v >= b[0] && v < b[1]
    }
    case 'duplicate':
    case 'unique': {
      if (v === null || v === '') return false
      const n = ruleStats(doc, sheet, rule).counts.get(keyOf(v)) ?? 0
      return rule.type === 'duplicate' ? n > 1 : n === 1
    }
    case 'top': {
      const x = asNumber(v)
      if (x === null) return false
      const st = ruleStats(doc, sheet, rule)
      if (!st.sorted.length) return false
      const n = rule.percent ? Math.max(1, Math.floor((st.sorted.length * rule.rank) / 100)) : Math.min(st.sorted.length, rule.rank)
      return rule.bottom ? x <= st.sorted[n - 1] : x >= st.sorted[st.sorted.length - n]
    }
    case 'average': {
      const x = asNumber(v)
      if (x === null) return false
      const st = ruleStats(doc, sheet, rule)
      const t = st.avg + (rule.std ? (rule.above ? 1 : -1) * rule.std * st.std : 0)
      return rule.above ? (rule.equal ? x >= t : x > t) : rule.equal ? x <= t : x < t
    }
    case 'blanks': return v === null || (typeof v === 'string' && v.trim() === '')
    case 'noBlanks': return !(v === null || (typeof v === 'string' && v.trim() === ''))
    case 'errors': return v instanceof CellError
    case 'noErrors': return !(v instanceof CellError)
    case 'expression': {
      const x = evalAt(doc, sheet, rule, rule.formula, r, c)
      return x === true || (typeof x === 'number' && x !== 0)
    }
    default: return false
  }
}

/** Rules of a sheet sorted by priority, with a quick per-cell lookup. */
export function cfEvaluator(doc: Doc, sheet: Sheet) {
  const rules = [...sheet.x.cf].sort((a, b) => a.priority - b.priority)
  if (!rules.length) return null
  return (r: number, c: number): CFResult | null => {
    let res: CFResult | null = null
    const style: CFStyle = {}
    let styled = false
    for (const rule of rules) {
      if (!rule.ranges.some((rg) => r >= rg.r1 && r <= rg.r2 && c >= rg.c1 && c <= rg.c2)) continue
      const v = doc.engine.display(sheet, r, c)
      if (rule.type === 'dataBar') {
        const x = asNumber(v)
        if (x === null) continue
        const st = ruleStats(doc, sheet, rule)
        const lo = cfNumber(doc, sheet, rule, rule.min, st, 'min', r, c)
        const hi = cfNumber(doc, sheet, rule, rule.max, st, 'max', r, c)
        const span = hi - lo || 1
        // negative values grow left from an axis: where zero falls (automatic), in the middle, or no axis at all
        const mode = rule.axis ?? 'auto'
        const half = Math.max(Math.abs(lo), Math.abs(hi)) || 1
        const axis = mode === 'none' ? 0 : mode === 'middle' ? 0.5 : lo < 0 && hi > 0 ? -lo / span : 0
        const pos = Math.max(0, Math.min(1, mode === 'middle' ? 0.5 + x / (2 * half) : (x - lo) / span))
        const negative = x < 0 && mode !== 'none'
        res = res ?? {}
        res.bar = {
          start: Math.min(axis, pos), end: Math.max(axis, pos === axis ? axis + 0.0001 : pos), color: negative ? rule.negColor ?? '#E04B3A' : rule.color, gradient: rule.gradient,
          showValue: rule.showValue, border: !!rule.border, negative, axis: axis > 0 ? axis : undefined, axisColor: rule.axisColor ?? '#000000',
        }
        if (!res.bar.end && !res.bar.start) res.bar.end = 0.02
      } else if (rule.type === 'colorScale') {
        const x = asNumber(v)
        if (x === null || rule.stops.length < 2) continue
        const st = ruleStats(doc, sheet, rule)
        const pts = rule.stops.map((s, i) => ({ v: cfNumber(doc, sheet, rule, s.v, st, i === 0 ? 'min' : 'max', r, c), color: s.color }))
        let color = pts[0].color
        if (x >= pts[pts.length - 1].v) color = pts[pts.length - 1].color
        else
          for (let i = 0; i < pts.length - 1; i++) {
            if (x >= pts[i].v && x <= pts[i + 1].v) {
              color = lerpColor(pts[i].color, pts[i + 1].color, (x - pts[i].v) / (pts[i + 1].v - pts[i].v || 1))
              break
            }
          }
        res = res ?? {}
        if (!res.scale) res.scale = color
      } else if (rule.type === 'iconSet') {
        const x = asNumber(v)
        if (x === null) continue
        const st = ruleStats(doc, sheet, rule)
        const n = ICON_COUNTS[rule.set]
        let idx = 0
        rule.thresholds.slice(0, n - 1).forEach((t, i) => {
          if (x >= cfNumber(doc, sheet, rule, t, st, 'min', r, c)) idx = i + 1
        })
        if (rule.reverse) idx = n - 1 - idx
        res = res ?? {}
        if (!res.icon) res.icon = { set: rule.set, index: idx, count: n, showValue: rule.showValue }
      } else if (test(doc, sheet, rule, r, c, v)) {
        for (const [k, val] of Object.entries(rule.style ?? {})) {
          if ((style as Record<string, unknown>)[k] === undefined) (style as Record<string, unknown>)[k] = val
        }
        styled = true
      } else continue
      if (rule.stop) break
    }
    if (styled) res = { ...(res ?? {}), style }
    return res
  }
}

// ---------- rule management ----------

export const CF_PRESETS: { label: string; style: CFStyle }[] = [
  { label: tx('Light Red Fill with Dark Red Text'), style: { fill: '#FFC7CE', color: '#9C0006' } },
  { label: tx('Yellow Fill with Dark Yellow Text'), style: { fill: '#FFEB9C', color: '#9C5700' } },
  { label: tx('Green Fill with Dark Green Text'), style: { fill: '#C6EFCE', color: '#006100' } },
  { label: tx('Light Red Fill'), style: { fill: '#FFC7CE' } },
  { label: tx('Red Text'), style: { color: '#9C0006' } },
  { label: tx('Red Border'), style: { border: '#C00000' } },
]

export const DATA_BAR_COLORS = ['#638EC6', '#63C384', '#FF555A', '#FFB628', '#008AEF', '#D6007B']

export const COLOR_SCALES: { label: string; stops: string[] }[] = [
  { label: tx('Green - Yellow - Red'), stops: ['#F8696B', '#FFEB84', '#63BE7B'] },
  { label: tx('Red - Yellow - Green'), stops: ['#63BE7B', '#FFEB84', '#F8696B'] },
  { label: tx('Green - White - Red'), stops: ['#F8696B', '#FCFCFF', '#63BE7B'] },
  { label: tx('Red - White - Green'), stops: ['#63BE7B', '#FCFCFF', '#F8696B'] },
  { label: tx('Blue - White - Red'), stops: ['#F8696B', '#FCFCFF', '#5A8AC6'] },
  { label: tx('Red - White - Blue'), stops: ['#5A8AC6', '#FCFCFF', '#F8696B'] },
  { label: tx('White - Red'), stops: ['#FCFCFF', '#F8696B'] },
  { label: tx('Red - White'), stops: ['#F8696B', '#FCFCFF'] },
  { label: tx('Green - White'), stops: ['#63BE7B', '#FCFCFF'] },
  { label: tx('White - Green'), stops: ['#FCFCFF', '#63BE7B'] },
  { label: tx('Green - Yellow'), stops: ['#63BE7B', '#FFEF9C'] },
  { label: tx('Yellow - Green'), stops: ['#FFEF9C', '#63BE7B'] },
]

export const ICON_SETS: { id: IconSetId; label: string; group: 'Directional' | 'Shapes' | 'Indicators' | 'Ratings' }[] = [
  { id: '3Arrows', label: tx('3 Arrows (Colored)'), group: 'Directional' },
  { id: '3ArrowsGray', label: tx('3 Arrows (Gray)'), group: 'Directional' },
  { id: '3Triangles', label: tx('3 Triangles'), group: 'Directional' },
  { id: '4Arrows', label: tx('4 Arrows (Colored)'), group: 'Directional' },
  { id: '5Arrows', label: tx('5 Arrows (Colored)'), group: 'Directional' },
  { id: '3TrafficLights1', label: tx('3 Traffic Lights (Unrimmed)'), group: 'Shapes' },
  { id: '3TrafficLights2', label: tx('3 Traffic Lights (Rimmed)'), group: 'Shapes' },
  { id: '3Signs', label: tx('3 Signs'), group: 'Shapes' },
  { id: '4TrafficLights', label: tx('4 Traffic Lights'), group: 'Shapes' },
  { id: '4RedToBlack', label: tx('Red To Black'), group: 'Shapes' },
  { id: '3Symbols', label: tx('3 Symbols (Circled)'), group: 'Indicators' },
  { id: '3Symbols2', label: tx('3 Symbols (Uncircled)'), group: 'Indicators' },
  { id: '3Flags', label: tx('3 Flags'), group: 'Indicators' },
  { id: '3Stars', label: tx('3 Stars'), group: 'Ratings' },
  { id: '4Rating', label: tx('4 Ratings'), group: 'Ratings' },
  { id: '5Rating', label: tx('5 Ratings'), group: 'Ratings' },
  { id: '5Quarters', label: tx('5 Quarters'), group: 'Ratings' },
  { id: '5Boxes', label: tx('5 Boxes'), group: 'Ratings' },
]

export function defaultThresholds(set: IconSetId): CFValue[] {
  const n = ICON_COUNTS[set]
  return Array.from({ length: n - 1 }, (_, i) => ({ type: 'percent' as const, value: Math.round(((i + 1) * 100) / n) }))
}

export function addRule(doc: Doc, rule: NewCFRule, sheet = doc.sheet) {
  doc.transact(tx('Conditional Formatting'), () => {
    doc.noteProps(sheet)
    // a new rule goes on top of the list
    const shifted = sheet.x.cf.map((r) => ({ ...r, priority: r.priority + 1 }))
    sheet.x.cf = [{ ...rule, id: doc.wb.newObjectId(), priority: 1 } as CFRule, ...shifted]
  })
}

export function setRules(doc: Doc, rules: CFRule[], sheet = doc.sheet) {
  doc.transact(tx('Manage Rules'), () => {
    doc.noteProps(sheet)
    sheet.x.cf = rules.map((r, i) => ({ ...r, priority: i + 1 }))
  })
}

export function clearRules(doc: Doc, ranges: Range[] | null, sheet = doc.sheet) {
  doc.transact(tx('Clear Rules'), () => {
    doc.noteProps(sheet)
    if (!ranges) sheet.x.cf = []
    else sheet.x.cf = sheet.x.cf.filter((r) => !r.ranges.some((a) => ranges.some((b) => a.r1 <= b.r2 && b.r1 <= a.r2 && a.c1 <= b.c2 && b.c1 <= a.c2)))
  })
}

export function describeRule(rule: CFRule): string {
  const ops: Record<string, string> = {
    greaterThan: t('greater than'), lessThan: t('less than'), between: t('between'), notBetween: t('not between'), equal: t('equal to'), notEqual: t('not equal to'),
    greaterThanOrEqual: t('greater than or equal to'), lessThanOrEqual: t('less than or equal to'),
  }
  const periods: Record<string, string> = {
    yesterday: t('yesterday'), today: t('today'), tomorrow: t('tomorrow'), last7Days: t('in the last 7 days'), lastWeek: t('last week'), thisWeek: t('this week'),
    nextWeek: t('next week'), lastMonth: t('last month'), thisMonth: t('this month'), nextMonth: t('next month'),
  }
  switch (rule.type) {
    case 'cellIs': return rule.f2 && (rule.op === 'between' || rule.op === 'notBetween') ? t('Cell Value {op} {value1} and {value2}', { op: ops[rule.op], value1: rule.f1, value2: rule.f2 }) : t('Cell Value {op} {value}', { op: ops[rule.op], value: rule.f1 })
    case 'text': return t('Cell Value {op} "{text}"', { op: rule.op === 'contains' ? t('contains') : rule.op === 'notContains' ? t('does not contain') : rule.op === 'beginsWith' ? t('begins with') : t('ends with'), text: rule.text })
    case 'date': return t('A date occurring: {period}', { period: periods[rule.period] ?? rule.period.replace(/([A-Z0-9])/g, ' $1').toLowerCase() })
    case 'duplicate': return t('Duplicate Values')
    case 'unique': return t('Unique Values')
    case 'top': return (rule.bottom ? t('Bottom {n}', { n: rule.rank }) : t('Top {n}', { n: rule.rank })) + (rule.percent ? '%' : '')
    case 'average': {
      const base = rule.above ? (rule.equal ? t('Above or Equal to Average') : t('Above Average')) : rule.equal ? t('Below or Equal to Average') : t('Below Average')
      return rule.std ? t('{rule} ({n} std dev)', { rule: base, n: rule.std }) : base
    }
    case 'blanks': return t('Blanks')
    case 'noBlanks': return t('No Blanks')
    case 'errors': return t('Errors')
    case 'noErrors': return t('No Errors')
    case 'expression': return t('Formula: ={formula}', { formula: rule.formula })
    case 'dataBar': return t('Data Bar')
    case 'colorScale': return rule.stops.length === 2 ? t('2-Color Scale') : t('3-Color Scale')
    case 'iconSet': return t('Icon Set: {name}', { name: t(ICON_SETS.find((s) => s.id === rule.set)?.label ?? rule.set) })
  }
}

export function fullRange(): Range {
  return { r1: 0, c1: 0, r2: MAX_ROWS - 1, c2: MAX_COLS - 1 }
}
