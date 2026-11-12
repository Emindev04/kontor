// Find & Replace, Go To and Go To Special.
import { cellKey, keyCol, keyRow, type Cell, type Range } from '../model/address'
import type { Sheet } from '../model/sheet'
import { wildcard } from '../engine/functions/helpers'
import type { Doc } from './doc'
import { cellView } from './display'
import { tx } from '../i18n'

export type FindOptions = {
  query: string
  within: 'sheet' | 'workbook'
  by: 'rows' | 'cols'
  lookIn: 'formulas' | 'values'
  matchCase: boolean
  whole: boolean
}

export const DEFAULT_FIND: FindOptions = { query: '', within: 'sheet', by: 'rows', lookIn: 'formulas', matchCase: false, whole: false }

export type Hit = { sheet: Sheet; r: number; c: number; text: string; value: string }

function matcher(o: FindOptions): RegExp {
  const re = wildcard(o.query, o.whole)
  return new RegExp(re.source, o.matchCase ? '' : 'i')
}

function cellText(doc: Doc, sheet: Sheet, r: number, c: number, lookIn: FindOptions['lookIn']): string {
  if (lookIn === 'formulas') return doc.inputText(r, c, sheet).replace(/^'/, '')
  return cellView(doc, sheet, r, c, doc.style(r, c, sheet)).text
}

function orderedKeys(sheet: Sheet, by: FindOptions['by'], includeSpill: boolean): number[] {
  const keys = [...sheet.cells.keys()]
  if (includeSpill) keys.push(...sheet.spillOwner.keys())
  if (by === 'rows') keys.sort((a, b) => a - b)
  else keys.sort((a, b) => keyCol(a) - keyCol(b) || keyRow(a) - keyRow(b))
  return keys
}

export function findAll(doc: Doc, o: FindOptions): Hit[] {
  if (!o.query) return []
  const re = matcher(o)
  const sheets = o.within === 'sheet' ? [doc.sheet] : doc.wb.sheets
  const out: Hit[] = []
  for (const sheet of sheets) {
    for (const k of orderedKeys(sheet, o.by, o.lookIn === 'values')) {
      const r = keyRow(k)
      const c = keyCol(k)
      const text = cellText(doc, sheet, r, c, o.lookIn)
      if (text && re.test(text)) out.push({ sheet, r, c, text: doc.inputText(r, c, sheet), value: cellView(doc, sheet, r, c, doc.style(r, c, sheet)).text })
    }
  }
  return out
}

/** Selects the next match after the active cell. Returns false when nothing matches. */
export function findNext(doc: Doc, o: FindOptions, backwards = false): Hit | null {
  const hits = findAll(doc, o)
  if (!hits.length) return null
  const active = doc.sel.active
  const sheetIdx = doc.activeIndex
  const pos = (h: Hit) => {
    const si = doc.wb.sheets.indexOf(h.sheet)
    const k = o.by === 'rows' ? cellKey(h.r, h.c) : h.c * 2 ** 21 + h.r
    return si * 2 ** 40 + k
  }
  const here = sheetIdx * 2 ** 40 + (o.by === 'rows' ? cellKey(active.r, active.c) : active.c * 2 ** 21 + active.r)
  const sorted = hits.slice().sort((a, b) => pos(a) - pos(b))
  const hit = backwards ? [...sorted].reverse().find((h) => pos(h) < here) ?? sorted[sorted.length - 1] : sorted.find((h) => pos(h) > here) ?? sorted[0]
  goTo(doc, hit.sheet, { r: hit.r, c: hit.c })
  return hit
}

export function goTo(doc: Doc, sheet: Sheet, cell: Cell) {
  const i = doc.wb.sheets.indexOf(sheet)
  if (i >= 0 && i !== doc.activeIndex) doc.setActiveSheet(i)
  doc.select(cell)
}

function replaceIn(text: string, o: FindOptions, repl: string): string {
  if (o.whole) return repl
  const re = new RegExp(wildcard(o.query, false).source, o.matchCase ? 'g' : 'gi')
  return text.replace(re, () => repl)
}

export function replaceAll(doc: Doc, o: FindOptions, repl: string): number {
  const hits = findAll(doc, { ...o, lookIn: 'formulas' })
  let n = 0
  doc.transact(tx('Replace'), () => {
    for (const h of hits) {
      const input = doc.inputText(h.r, h.c, h.sheet)
      const next = replaceIn(input, o, repl)
      if (next === input) continue
      try {
        const p = doc.prepareInput(next)
        const old = h.sheet.get(h.r, h.c)
        doc.write(h.sheet, h.r, h.c, { ...p.data, s: old?.s, link: old?.link })
        n++
      } catch {
        // skip replacements that would create an invalid formula
      }
    }
  })
  return n
}

/** Replaces in the active cell when it matches, then moves to the next match. */
export function replaceCurrent(doc: Doc, o: FindOptions, repl: string): boolean {
  const { r, c } = doc.sel.active
  const sheet = doc.sheet
  const input = doc.inputText(r, c, sheet)
  const re = matcher(o)
  if (input && re.test(input.replace(/^'/, ''))) {
    const next = replaceIn(input, o, repl)
    try {
      const p = doc.prepareInput(next)
      const old = sheet.get(r, c)
      doc.transact(tx('Replace'), () => doc.write(sheet, r, c, { ...p.data, s: old?.s, link: old?.link }))
    } catch {
      return false
    }
  }
  return !!findNext(doc, o)
}

export type SpecialKind = 'constants' | 'formulas' | 'blanks' | 'currentRegion' | 'lastCell' | 'currentArray' | 'visible' | 'merged' | 'errors' | 'numbers' | 'text' | 'notes' | 'cf' | 'validation' | 'objects'

/** Go To Special: selects matching cells within the selection (or the used range when one cell is selected). */
export function goToSpecial(doc: Doc, kind: SpecialKind): number {
  const sheet = doc.sheet
  const used = sheet.used()
  if (kind === 'lastCell') {
    doc.select({ r: Math.max(0, used.r), c: Math.max(0, used.c) })
    return 1
  }
  if (kind === 'currentArray') {
    const { r, c } = doc.sel.active
    const key = cellKey(r, c)
    const anchor = sheet.spills.has(key) ? key : sheet.spillOwner.get(key)
    if (anchor === undefined) return 0
    const sp = sheet.spills.get(anchor)!
    const ar = keyRow(anchor)
    const ac = keyCol(anchor)
    doc.selectRange({ r1: ar, c1: ac, r2: ar + sp.rows - 1, c2: ac + sp.cols - 1 })
    return 1
  }
  if (kind === 'objects') {
    const first = sheet.x.objects[0]
    if (!first) return 0
    doc.selObj = first.id
    doc.selObjs = []
    doc.emit()
    return sheet.x.objects.length
  }
  const rg0 = doc.activeRange
  const single = rg0.r1 === rg0.r2 && rg0.c1 === rg0.c2
  const area: Range = single ? { r1: 0, c1: 0, r2: Math.max(0, used.r), c2: Math.max(0, used.c) } : doc.boundToUsed(rg0)
  const inAny = (list: Range[], r: number, c: number) => list.some((x) => r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2)
  const cfRanges = kind === 'cf' ? sheet.x.cf.flatMap((x) => x.ranges) : []
  const dvRanges = kind === 'validation' ? sheet.x.validations.flatMap((x) => x.ranges) : []
  if (kind === 'currentRegion') return 0
  const cells: Cell[] = []
  for (let r = area.r1; r <= area.r2; r++) {
    if (kind === 'visible' && sheet.rows.hidden.has(r)) continue
    for (let c = area.c1; c <= area.c2; c++) {
      const d = sheet.get(r, c)
      const v = doc.value(r, c)
      let ok = false
      switch (kind) {
        case 'constants': ok = d?.f === undefined && d?.v !== undefined && d.v !== null; break
        case 'formulas': ok = d?.f !== undefined; break
        case 'blanks': ok = v === null; break
        case 'visible': ok = !sheet.cols.hidden.has(c); break
        case 'merged': ok = !!sheet.mergeAt(r, c); break
        case 'errors': ok = typeof v === 'object' && v !== null; break
        case 'numbers': ok = typeof v === 'number'; break
        case 'text': ok = typeof v === 'string'; break
        case 'notes': ok = !!sheet.x.notes[cellKey(r, c)] || !!sheet.x.comments[cellKey(r, c)]; break
        case 'cf': ok = inAny(cfRanges, r, c); break
        case 'validation': ok = inAny(dvRanges, r, c); break
      }
      if (ok) cells.push({ r, c })
    }
  }
  if (!cells.length) return 0
  // merge runs per row into ranges
  const ranges: Range[] = []
  for (const cell of cells) {
    const last = ranges[ranges.length - 1]
    if (last && last.r1 === cell.r && last.r2 === cell.r && last.c2 === cell.c - 1) last.c2 = cell.c
    else ranges.push({ r1: cell.r, r2: cell.r, c1: cell.c, c2: cell.c })
  }
  const capped = ranges.slice(0, 5000)
  doc.sel = { ranges: capped, active: cells[0], anchor: cells[0], head: { r: capped[capped.length - 1].r2, c: capped[capped.length - 1].c2 } }
  doc.emit()
  return cells.length
}
