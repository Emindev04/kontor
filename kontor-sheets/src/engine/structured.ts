// Structured references to tables: Table1[Sales], Table1[[#Headers],[Sales]], [@Qty], Table1[#All] …
import type { Range } from '../model/address'
import type { TableDef } from '../model/extras'
import { tokenize } from './tokenizer'

type Special = 'all' | 'data' | 'headers' | 'totals'
export type StructSpec = { thisRow: boolean; parts: Special[]; col1?: string; col2?: string }

const SPECIALS: Record<string, Special | 'thisRow'> = { '#ALL': 'all', '#DATA': 'data', '#HEADERS': 'headers', '#TOTALS': 'totals', '#THIS ROW': 'thisRow' }

/** Column names escape ' [ ] # with a leading apostrophe. */
const unescape = (s: string) => s.replace(/'(.)/g, '$1').trim()

function splitTop(s: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === "'" && i + 1 < s.length) {
      cur += ch + s[++i]
      continue
    }
    if (ch === '[') depth++
    if (ch === ']') depth--
    if (ch === sep && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((x) => x.trim())
}

const strip = (s: string) => (s.startsWith('[') && s.endsWith(']') ? s.slice(1, -1) : s)

export function parseSpec(spec: string): StructSpec | null {
  let inner = strip(spec.trim()).trim()
  const out: StructSpec = { thisRow: false, parts: [] }
  if (inner.startsWith('@')) {
    out.thisRow = true
    inner = inner.slice(1).trim()
    if (!inner) return out
    if (!inner.startsWith('[')) {
      out.col1 = unescape(inner)
      return out
    }
  }
  if (!inner) {
    out.parts = ['data']
    return out
  }
  const items = inner.startsWith('[') ? splitTop(inner, ',') : [inner]
  for (const item of items) {
    const cols = splitTop(item, ':')
    if (cols.length === 2) {
      out.col1 = unescape(strip(cols[0]))
      out.col2 = unescape(strip(cols[1]))
      continue
    }
    const name = strip(item)
    const sp = SPECIALS[name.toUpperCase()]
    if (sp === 'thisRow') out.thisRow = true
    else if (sp) out.parts.push(sp)
    else if (name.startsWith('#')) return null
    else out.col1 = unescape(name)
  }
  return out
}

export function tableRows(t: TableDef) {
  const header = t.header ? t.range.r1 : -1
  const d1 = t.range.r1 + (t.header ? 1 : 0)
  const d2 = t.range.r2 - (t.totals ? 1 : 0)
  const totals = t.totals ? t.range.r2 : -1
  return { header, d1, d2, totals }
}

export function columnIndex(t: TableDef, name: string): number {
  const up = name.toUpperCase()
  return t.columns.findIndex((c) => c.name.toUpperCase() === up)
}

/** Range a structured reference covers, or null (#REF!) when a part does not exist. */
export function resolveSpec(t: TableDef, s: StructSpec, row: number): Range | null {
  const { header, d1, d2, totals } = tableRows(t)
  let r1: number
  let r2: number
  if (s.thisRow) {
    if (row < d1 || row > d2) return null
    r1 = r2 = row
  } else {
    const parts = s.parts.length ? s.parts : ['data' as Special]
    const rows: number[] = []
    for (const p of parts) {
      if (p === 'all') rows.push(t.range.r1, t.range.r2)
      else if (p === 'data') {
        if (d2 >= d1) rows.push(d1, d2)
        else rows.push(d1, d1)
      } else if (p === 'headers') {
        if (header < 0) return null
        rows.push(header)
      } else if (p === 'totals') {
        if (totals < 0) return null
        rows.push(totals)
      }
    }
    r1 = Math.min(...rows)
    r2 = Math.max(...rows)
  }
  let c1 = t.range.c1
  let c2 = t.range.c2
  if (s.col1 !== undefined) {
    const i = columnIndex(t, s.col1)
    if (i < 0) return null
    c1 = c2 = t.range.c1 + i
    if (s.col2 !== undefined) {
      const j = columnIndex(t, s.col2)
      if (j < 0) return null
      c1 = t.range.c1 + Math.min(i, j)
      c2 = t.range.c1 + Math.max(i, j)
    }
  }
  return { r1, c1, r2, c2 }
}

const escapeCol = (name: string) => name.replace(/(['[\]#])/g, "'$1")

/** Structured reference text for a table column ("Table1[Sales]" or "[@Sales]"). */
export function columnRef(table: string, col: string, thisRow = false): string {
  const c = escapeCol(col)
  const simple = /^[A-Za-z_][A-Za-z0-9_]*$/.test(col)
  if (thisRow) return `${table}[@${simple ? c : `[${c}]`}]`
  return `${table}[${c}]`
}

/** Renames a table inside formulas. */
export function renameTableInFormula(f: string, oldName: string, newName: string): string {
  if (!f.toUpperCase().includes(oldName.toUpperCase())) return f
  let out = ''
  for (const t of tokenize(f)) {
    if ((t.type === 'struct' && t.table?.toUpperCase() === oldName.toUpperCase()) || (t.type === 'name' && t.id === oldName.toUpperCase() && !t.sheet)) {
      out += t.type === 'struct' ? newName + t.spec : newName
    } else out += t.text
  }
  return out
}

/** Renames a column inside structured references to `table` (or implicit ones when `implicit`). */
export function renameColumnInFormula(f: string, table: string, oldCol: string, newCol: string, implicit: boolean): string {
  if (!f.includes('[')) return f
  let out = ''
  const re = new RegExp(`\\[(@?)\\s*${oldCol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\]`, 'gi')
  for (const t of tokenize(f)) {
    if (t.type === 'struct' && ((t.table ?? '').toUpperCase() === table.toUpperCase() || (implicit && !t.table))) {
      let spec = t.spec ?? ''
      spec = spec.replace(re, (_m, at) => `[${at}${escapeCol(newCol)}]`)
      // "[@Old]" without inner brackets
      const bare = new RegExp(`^\\[@${oldCol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]$`, 'i')
      if (bare.test(t.spec ?? '')) spec = `[@${escapeCol(newCol)}]`
      const plain = new RegExp(`^\\[${oldCol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]$`, 'i')
      if (plain.test(t.spec ?? '')) spec = `[${escapeCol(newCol)}]`
      out += (t.table ?? '') + spec
    } else out += t.text
  }
  return out
}
