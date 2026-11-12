import { describe, expect, it } from 'vitest'
import { applyBorders, cellLook, createTable, deleteCols, deleteRows, insertCol, insertRow, mergeCells, originOf, splitCell, expandRange } from './table'

const t0 = () => createTable(3, 3, { x: 0, y: 0, w: 300 }, 't', 'Table')
const live = (t: ReturnType<typeof t0>) => t.rows.map((r) => r.cells.map((c) => (c.merged ? '.' : `${c.rowSpan ?? 1}${c.colSpan ?? 1}`)).join(' '))

describe('tables', () => {
  it('creates a grid with matching size', () => {
    const t = t0()
    expect(t.cols).toHaveLength(3)
    expect(t.rows).toHaveLength(3)
    expect(t.w).toBe(300)
  })

  it('merges and unmerges via split', () => {
    const m = mergeCells(t0(), { r0: 0, c0: 0, r1: 1, c1: 1 })
    expect(live(m)).toEqual(['22 . 11', '. . 11', '11 11 11'])
    expect(originOf(m, 1, 1)).toEqual({ r: 0, c: 0 })
    expect(expandRange(m, { r0: 1, c0: 1, r1: 1, c1: 2 })).toEqual({ r0: 0, c0: 0, r1: 1, c1: 2 })
    const s = splitCell(m, 1, 1, 2, 2)
    expect(live(s)).toEqual(['11 11 11', '11 11 11', '11 11 11'])
  })

  it('splits a single cell into columns and widens the neighbours', () => {
    const s = splitCell(t0(), 1, 1, 1, 2)
    expect(s.cols).toHaveLength(4)
    expect(live(s)).toEqual(['11 12 . 11', '11 11 11 11', '11 12 . 11'])
    expect(Math.round(s.w)).toBe(300)
  })

  it('splits a single cell into rows', () => {
    const s = splitCell(t0(), 0, 0, 2, 1)
    expect(s.rows).toHaveLength(4)
    expect(live(s)).toEqual(['11 21 21', '11 . .', '11 11 11', '11 11 11'])
  })

  it('inserts rows and columns through merges', () => {
    const m = mergeCells(t0(), { r0: 0, c0: 0, r1: 1, c1: 0 })
    const r = insertRow(m, 1, 0)
    expect(live(r)).toEqual(['31 11 11', '. 11 11', '. 11 11', '11 11 11'])
    const c = insertCol(mergeCells(t0(), { r0: 0, c0: 0, r1: 0, c1: 1 }), 1, 0)
    expect(live(c)).toEqual(['13 . . 11', '11 11 11 11', '11 11 11 11'])
  })

  it('deletes rows and columns but never the last one', () => {
    expect(deleteRows(t0(), 0, 2)).toBeNull()
    expect(deleteCols(t0(), 1, 1)!.cols).toHaveLength(2)
  })

  it('resolves style parts and explicit borders', () => {
    const t = t0()
    expect(cellLook(t, 0, 0).bold).toBe(true)
    expect(cellLook(t, 1, 0).fill).toEqual({ type: 'solid', color: 'theme:accent1:l60' })
    const b = applyBorders(t, { r0: 0, c0: 0, r1: 2, c1: 2 }, 'outside', { color: '#FF0000', width: 2, dash: 'solid' })
    expect(cellLook(b, 0, 0).borders.t).toEqual({ color: '#FF0000', width: 2, dash: 'solid' })
    expect(cellLook(b, 1, 1).borders.t?.color).not.toBe('#FF0000')
  })
})
