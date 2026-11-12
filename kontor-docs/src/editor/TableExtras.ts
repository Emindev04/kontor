import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { CellSelection, TableMap } from '@tiptap/pm/tables'

// More table formatting: per-cell borders (and the Border Painter), row heights, cell margins,
// text direction, repeated header rows, splitting tables, converting text to tables and formulas.

export type BorderPen = { style: 'solid' | 'dashed' | 'dotted' | 'double' | 'none'; width: number; color: string }
export type CellBorders = Partial<Record<'top' | 'right' | 'bottom' | 'left', BorderPen | null>>
export type BorderTarget = 'all' | 'outside' | 'inside' | 'insideH' | 'insideV' | 'top' | 'bottom' | 'left' | 'right' | 'none'

export const DEFAULT_PEN: BorderPen = { style: 'solid', width: 0.5, color: '#000000' }

const penCss = (p: BorderPen | null | undefined) => (!p || p.style === 'none' ? '1px solid transparent' : `${p.style === 'double' ? Math.max(p.width, 2.25) : p.width}pt ${p.style} ${p.color}`)

export function cellStyle(a: Record<string, unknown>) {
  const css: string[] = []
  const b = a.borders as CellBorders | null
  if (b) for (const side of ['top', 'right', 'bottom', 'left'] as const) if (side in b) css.push(`border-${side}: ${penCss(b[side])}`)
  if (a.textDirection === 'tbRl') css.push('writing-mode: vertical-rl')
  if (a.textDirection === 'btLr') css.push('writing-mode: vertical-rl', 'transform: rotate(180deg)')
  return css.join('; ')
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableExtras: {
      setCellBorders: (target: BorderTarget, pen: BorderPen) => ReturnType
      setCellAttribute: (name: string, value: unknown) => ReturnType
      setTableAttribute: (name: string, value: unknown) => ReturnType
      setRowHeight: (px: number | null) => ReturnType
      distributeRows: () => ReturnType
      splitTable: () => ReturnType
      deleteCellsShiftLeft: () => ReturnType
      /** Deletes the selected cells; the cells below move up and empty cells fill the bottom. */
      deleteCellsShiftUp: () => ReturnType
      /** Sets the width (CSS px, null = automatic) of the selected columns. */
      setColumnWidth: (width: number | null) => ReturnType
      convertTextToTable: (separator: 'tab' | 'comma' | 'paragraph') => ReturnType
    }
  }
}

function tableInfo(state: EditorState) {
  const $from = state.selection.$from
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name === 'table') return { node, pos: $from.before(d), start: $from.start(d), depth: d }
  }
  return null
}

/** The rectangle of selected cells (map indexes), or the cell at the cursor. */
function selectedRect(state: EditorState, table: NonNullable<ReturnType<typeof tableInfo>>) {
  const map = TableMap.get(table.node)
  const sel = state.selection
  if (sel instanceof CellSelection) {
    const a = map.findCell(sel.$anchorCell.pos - table.start)
    const b = map.findCell(sel.$headCell.pos - table.start)
    return { map, left: Math.min(a.left, b.left), right: Math.max(a.right, b.right), top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) }
  }
  const $from = sel.$from
  for (let d = $from.depth; d > table.depth; d--) {
    const name = $from.node(d).type.name
    if (name === 'tableCell' || name === 'tableHeader') {
      const r = map.findCell($from.before(d) - table.start)
      return { map, ...r }
    }
  }
  return null
}

function eachCell(state: EditorState, fn: (node: PMNode, pos: number, rect: { left: number; right: number; top: number; bottom: number }, sel: { left: number; right: number; top: number; bottom: number }) => Record<string, unknown> | null, tr: Transaction) {
  const table = tableInfo(state)
  if (!table) return false
  const sel = selectedRect(state, table)
  if (!sel) return false
  const seen = new Set<number>()
  for (let row = sel.top; row < sel.bottom; row++)
    for (let col = sel.left; col < sel.right; col++) {
      const offset = sel.map.map[row * sel.map.width + col]
      if (seen.has(offset)) continue
      seen.add(offset)
      const node = table.node.nodeAt(offset)!
      const pos = table.start + offset
      const next = fn(node, pos, sel.map.findCell(offset), sel)
      if (next) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...next })
    }
  return true
}

export const TableExtras = Extension.create({
  name: 'tableExtras',

  addGlobalAttributes() {
    return [
      {
        types: ['tableCell', 'tableHeader'],
        attributes: {
          borders: {
            default: null,
            parseHTML: (el) => {
              try {
                return el.getAttribute('data-borders') ? JSON.parse(el.getAttribute('data-borders')!) : null
              } catch {
                return null
              }
            },
            renderHTML: (a) => (a.borders ? { 'data-borders': JSON.stringify(a.borders), style: cellStyle({ borders: a.borders }) } : {}),
          },
          textDirection: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-dir'),
            renderHTML: (a) => (a.textDirection ? { 'data-dir': a.textDirection, style: cellStyle({ textDirection: a.textDirection }) } : {}),
          },
        },
      },
      {
        types: ['tableRow'],
        attributes: {
          rowHeight: {
            default: null,
            parseHTML: (el) => (el.getAttribute('data-height') ? Number(el.getAttribute('data-height')) : null),
            renderHTML: (a) => (a.rowHeight ? { 'data-height': String(a.rowHeight), style: `height: ${a.rowHeight}px` } : {}),
          },
          cantSplit: {
            default: false,
            parseHTML: (el) => el.hasAttribute('data-cant-split'),
            renderHTML: (a) => (a.cantSplit ? { 'data-cant-split': '' } : {}),
          },
        },
      },
      {
        types: ['table'],
        attributes: {
          repeatHeader: {
            default: false,
            parseHTML: (el) => el.hasAttribute('data-repeat-header'),
            renderHTML: (a) => (a.repeatHeader ? { 'data-repeat-header': '' } : {}),
          },
          cellPadding: {
            default: null,
            parseHTML: (el) => (el.getAttribute('data-cell-padding') ? Number(el.getAttribute('data-cell-padding')) : null),
            renderHTML: (a) => (a.cellPadding != null ? { 'data-cell-padding': String(a.cellPadding), style: `--cell-pad: ${a.cellPadding}in` } : {}),
          },
          tableTitle: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-title'),
            renderHTML: (a) => (a.tableTitle ? { 'data-title': a.tableTitle } : {}),
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setCellBorders:
        (target, pen) =>
        ({ state, tr, dispatch }) => {
          if (!dispatch) return !!tableInfo(state)
          return eachCell(
            state,
            (node, _pos, r, sel) => {
              const b: CellBorders = { ...(node.attrs.borders as CellBorders | null) }
              const outer = { top: r.top === sel.top, bottom: r.bottom === sel.bottom, left: r.left === sel.left, right: r.right === sel.right }
              const set = (side: keyof CellBorders, on: boolean) => {
                if (on) b[side] = pen
              }
              const none = { style: 'none' as const, width: 0, color: '#000000' }
              switch (target) {
                case 'none':
                  return { borders: { top: none, right: none, bottom: none, left: none } }
                case 'all':
                  return { borders: { top: pen, right: pen, bottom: pen, left: pen } }
                case 'outside':
                  set('top', outer.top)
                  set('bottom', outer.bottom)
                  set('left', outer.left)
                  set('right', outer.right)
                  break
                case 'inside':
                  set('top', !outer.top)
                  set('bottom', !outer.bottom)
                  set('left', !outer.left)
                  set('right', !outer.right)
                  break
                case 'insideH':
                  set('top', !outer.top)
                  set('bottom', !outer.bottom)
                  break
                case 'insideV':
                  set('left', !outer.left)
                  set('right', !outer.right)
                  break
                default:
                  set(target, outer[target])
              }
              return { borders: b }
            },
            tr,
          )
        },
      setCellAttribute:
        (name, value) =>
        ({ state, tr }) =>
          eachCell(state, () => ({ [name]: value }), tr),
      setTableAttribute:
        (name, value) =>
        ({ state, tr }) => {
          const t = tableInfo(state)
          if (!t) return false
          tr.setNodeMarkup(t.pos, undefined, { ...t.node.attrs, [name]: value })
          return true
        },
      setRowHeight:
        (px) =>
        ({ state, tr }) => {
          const t = tableInfo(state)
          if (!t) return false
          const sel = selectedRect(state, t)
          if (!sel) return false
          t.node.forEach((row, rowOffset, i) => {
            if (i >= sel.top && i < sel.bottom) tr.setNodeMarkup(t.start + rowOffset, undefined, { ...row.attrs, rowHeight: px })
          })
          return true
        },
      distributeRows:
        () =>
        ({ state, tr, view }) => {
          const t = tableInfo(state)
          if (!t) return false
          const dom = view.nodeDOM(t.pos) as HTMLElement | null
          const rows = dom ? Array.from(dom.querySelectorAll<HTMLElement>('tr')).filter((r) => !r.classList.contains('pg-row')) : []
          const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.offsetHeight, 0) / rows.length) : null
          t.node.forEach((row, rowOffset) => tr.setNodeMarkup(t.start + rowOffset, undefined, { ...row.attrs, rowHeight: avg }))
          return true
        },
      splitTable:
        () =>
        ({ state, tr }) => {
          const t = tableInfo(state)
          if (!t) return false
          const sel = selectedRect(state, t)
          if (!sel || sel.top === 0) return false
          let splitAt = t.start
          t.node.forEach((row, rowOffset, i) => {
            if (i === sel.top) splitAt = t.start + rowOffset
          })
          // Close the table before the row and open a new one with the same settings after an empty paragraph.
          const schema = state.schema
          const rest = t.node.content.cut(splitAt - t.start)
          const head = t.node.content.cut(0, splitAt - t.start)
          tr.replaceWith(t.pos, t.pos + t.node.nodeSize, [t.node.type.create(t.node.attrs, head), schema.nodes.paragraph.create(), t.node.type.create(t.node.attrs, rest)])
          return true
        },
      deleteCellsShiftLeft:
        () =>
        ({ state, tr }) => {
          const t = tableInfo(state)
          if (!t) return false
          const sel = selectedRect(state, t)
          if (!sel) return false
          // Delete the selected cells of each row and add empty cells at the row's end.
          const rows: PMNode[] = []
          t.node.forEach((row, _o, i) => {
            if (i < sel.top || i >= sel.bottom) return rows.push(row)
            const cells: PMNode[] = []
            let col = 0
            row.forEach((cell) => {
              const span = cell.attrs.colspan ?? 1
              if (col < sel.left || col >= sel.right) cells.push(cell)
              col += span
            })
            const removed = sel.right - sel.left
            for (let k = 0; k < removed; k++) cells.push(state.schema.nodes.tableCell.createAndFill()!)
            rows.push(row.type.create(row.attrs, cells))
          })
          tr.replaceWith(t.pos, t.pos + t.node.nodeSize, t.node.type.create(t.node.attrs, rows))
          return true
        },
      deleteCellsShiftUp:
        () =>
        ({ state, tr }) => {
          const t = tableInfo(state)
          if (!t) return false
          const sel = selectedRect(state, t)
          if (!sel) return false
          // Only plain grids: merged cells would not line up after moving.
          let merged = false
          t.node.descendants((n) => {
            if ((n.type.name === 'tableCell' || n.type.name === 'tableHeader') && ((n.attrs.colspan ?? 1) > 1 || (n.attrs.rowspan ?? 1) > 1)) merged = true
            return !merged && n.type.name !== 'tableCell' && n.type.name !== 'tableHeader'
          })
          if (merged) return false
          const grid: PMNode[][] = []
          t.node.forEach((row) => {
            const cells: PMNode[] = []
            row.forEach((c) => cells.push(c))
            grid.push(cells)
          })
          const removed = sel.bottom - sel.top
          for (let col = sel.left; col < sel.right; col++) {
            for (let r = sel.top; r < grid.length; r++) {
              const below = grid[r + removed]?.[col]
              if (grid[r][col]) grid[r][col] = below ?? state.schema.nodes.tableCell.createAndFill()!
            }
          }
          const rows: PMNode[] = []
          t.node.forEach((row, _o, i) => rows.push(row.type.create(row.attrs, grid[i])))
          tr.replaceWith(t.pos, t.pos + t.node.nodeSize, t.node.type.create(t.node.attrs, rows))
          return true
        },
      setColumnWidth:
        (width) =>
        ({ state, tr }) => {
          const t = tableInfo(state)
          if (!t) return false
          const sel = selectedRect(state, t)
          if (!sel) return false
          const { map } = sel
          const seen = new Set<number>()
          for (let row = 0; row < map.height; row++) {
            for (let col = sel.left; col < sel.right; col++) {
              const rel = map.map[row * map.width + col]
              if (seen.has(rel * 100 + col)) continue
              seen.add(rel * 100 + col)
              const cell = t.node.nodeAt(rel)
              if (!cell) continue
              const rect = map.findCell(rel)
              const span = cell.attrs.colspan ?? 1
              const widths: (number | null)[] = Array.isArray(cell.attrs.colwidth) ? [...cell.attrs.colwidth] : Array(span).fill(null)
              widths[col - rect.left] = width
              const colwidth = widths.every((w) => w == null) ? null : widths.map((w) => w ?? 0)
              tr.setNodeMarkup(t.start + rel, undefined, { ...cell.attrs, colwidth })
            }
          }
          return true
        },
      convertTextToTable:
        (separator) =>
        ({ state, tr }) => {
          const { from, to } = state.selection
          const blocks: { node: PMNode; pos: number }[] = []
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (node.isTextblock) {
              blocks.push({ node, pos })
              return false
            }
          })
          if (!blocks.length) return false
          const schema = state.schema
          const rowsText = separator === 'paragraph' ? blocks.map((b) => [b.node.textContent]) : blocks.map((b) => b.node.textContent.split(separator === 'tab' ? '\t' : ','))
          const cols = Math.max(...rowsText.map((r) => r.length))
          const rows = rowsText.map((cells) =>
            schema.nodes.tableRow.create(null, Array.from({ length: cols }, (_, i) => schema.nodes.tableCell.create(null, schema.nodes.paragraph.create(null, cells[i]?.trim() ? schema.text(cells[i].trim()) : null)))),
          )
          const start = blocks[0].pos
          const last = blocks[blocks.length - 1]
          tr.replaceWith(start, last.pos + last.node.nodeSize, schema.nodes.table.create(null, rows))
          return true
        },
    }
  },
})

/** Table > Formula: =SUM(ABOVE), =AVERAGE(LEFT) … evaluated over the numbers next to the cell. */
export function evaluateFormula(state: EditorState, formula: string): number | null {
  const t = tableInfo(state)
  if (!t) return null
  const sel = selectedRect(state, t)
  if (!sel) return null
  const m = formula.trim().replace(/^=/, '').match(/^(SUM|AVERAGE|COUNT|MAX|MIN|PRODUCT)\(\s*(ABOVE|BELOW|LEFT|RIGHT)\s*\)$/i)
  if (!m) return null
  const [, fn, dir] = m
  const values: number[] = []
  const cellText = (row: number, col: number) => {
    const offset = sel.map.map[row * sel.map.width + col]
    return t.node.nodeAt(offset)?.textContent ?? ''
  }
  const push = (text: string) => {
    const n = parseFloat(text.replace(/[$,%\s]/g, ''))
    if (!isNaN(n)) values.push(n)
  }
  const D = dir.toUpperCase()
  if (D === 'ABOVE') for (let r = sel.top - 1; r >= 0; r--) push(cellText(r, sel.left))
  if (D === 'BELOW') for (let r = sel.bottom; r < sel.map.height; r++) push(cellText(r, sel.left))
  if (D === 'LEFT') for (let c = sel.left - 1; c >= 0; c--) push(cellText(sel.top, c))
  if (D === 'RIGHT') for (let c = sel.right; c < sel.map.width; c++) push(cellText(sel.top, c))
  switch (fn.toUpperCase()) {
    case 'SUM': return values.reduce((a, b) => a + b, 0)
    case 'AVERAGE': return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
    case 'COUNT': return values.length
    case 'MAX': return values.length ? Math.max(...values) : 0
    case 'MIN': return values.length ? Math.min(...values) : 0
    case 'PRODUCT': return values.reduce((a, b) => a * b, 1)
  }
  return null
}
