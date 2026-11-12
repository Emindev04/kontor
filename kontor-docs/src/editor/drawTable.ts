import type { EditorView } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TableMap, CellSelection, addColumn, addRow, mergeCells, type TableRect } from '@tiptap/pm/tables'

// Table › Draw Table and Eraser.
//   Draw Table: drag a rectangle outside a table to create a one-cell table of that size; drag a
//   horizontal line inside a cell to split it into two rows, a vertical line to split it into two
//   columns (the neighbouring cells are merged so only the drawn cell is divided).
//   Eraser: click a line between two cells to merge them.

export type TableTool = 'draw' | 'eraser'

type Located = { table: PMNode; tablePos: number; map: TableMap; cellPos: number; rect: { left: number; top: number; right: number; bottom: number } }

function locateCell(view: EditorView, target: EventTarget | null): Located | null {
  const cellEl = (target as HTMLElement | null)?.closest?.('td, th')
  if (!cellEl || !view.dom.contains(cellEl)) return null
  const inside = view.posAtDOM(cellEl, 0)
  const $pos = view.state.doc.resolve(inside)
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d)
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
      const cellPos = $pos.before(d)
      for (let t = d - 1; t > 0; t--) {
        if ($pos.node(t).type.name === 'table') {
          const table = $pos.node(t)
          const tablePos = $pos.before(t)
          const map = TableMap.get(table)
          return { table, tablePos, map, cellPos, rect: map.findCell(cellPos - tablePos - 1) }
        }
      }
    }
  }
  return null
}

function tableRect(loc: Located): TableRect {
  return { left: 0, top: 0, right: loc.map.width, bottom: loc.map.height, map: loc.map, table: loc.table, tableStart: loc.tablePos + 1 }
}

/** Merges the cells of the map rectangle (map indexes) of the table at `tablePos`. */
function mergeRect(view: EditorView, tablePos: number, r: { left: number; top: number; right: number; bottom: number }) {
  const table = view.state.doc.nodeAt(tablePos)
  if (!table) return
  const map = TableMap.get(table)
  const start = tablePos + 1
  const a = start + map.map[r.top * map.width + r.left]
  const b = start + map.map[(r.bottom - 1) * map.width + (r.right - 1)]
  if (a === b) return
  view.dispatch(view.state.tr.setSelection(new CellSelection(view.state.doc.resolve(a), view.state.doc.resolve(b))))
  mergeCells(view.state, view.dispatch)
}

/** Splits the cell into two rows (horizontal line) or two columns (vertical line). */
export function splitDrawnCell(view: EditorView, loc: Located, direction: 'rows' | 'columns') {
  const { rect } = loc
  const tr = view.state.tr
  if (direction === 'rows') {
    // A new row under the cell's last row; the other columns' cells of the two rows are merged.
    addRow(tr, tableRect(loc), rect.bottom)
    view.dispatch(tr)
    for (let col = 0; col < loc.map.width; ) {
      const table = view.state.doc.nodeAt(loc.tablePos)!
      const map = TableMap.get(table)
      const cell = map.findCell(map.map[rect.top * map.width + col])
      if (col >= rect.left && col < rect.right) {
        col = cell.right
        continue
      }
      mergeRect(view, loc.tablePos, { left: cell.left, right: cell.right, top: cell.top, bottom: rect.bottom + 1 })
      col = cell.right
    }
  } else {
    addColumn(tr, tableRect(loc), rect.right)
    view.dispatch(tr)
    for (let row = 0; row < loc.map.height; ) {
      const table = view.state.doc.nodeAt(loc.tablePos)!
      const map = TableMap.get(table)
      const cell = map.findCell(map.map[row * map.width + rect.left])
      if (row >= rect.top && row < rect.bottom) {
        row = cell.bottom
        continue
      }
      mergeRect(view, loc.tablePos, { left: cell.left, right: rect.right + 1, top: cell.top, bottom: cell.bottom })
      row = cell.bottom
    }
  }
}

/** Eraser: merges the clicked cell with its neighbour across the nearest edge. */
export function eraseEdge(view: EditorView, loc: Located, side: 'left' | 'right' | 'top' | 'bottom'): boolean {
  const { rect, map } = loc
  const other =
    side === 'left' ? (rect.left > 0 ? { left: rect.left - 1, top: rect.top } : null)
    : side === 'right' ? (rect.right < map.width ? { left: rect.right, top: rect.top } : null)
    : side === 'top' ? (rect.top > 0 ? { left: rect.left, top: rect.top - 1 } : null)
    : rect.bottom < map.height ? { left: rect.left, top: rect.bottom } : null
  if (!other) return false
  const neighbour = map.findCell(map.map[other.top * map.width + other.left])
  const merged = { left: Math.min(rect.left, neighbour.left), top: Math.min(rect.top, neighbour.top), right: Math.max(rect.right, neighbour.right), bottom: Math.max(rect.bottom, neighbour.bottom) }
  mergeRect(view, loc.tablePos, merged)
  return true
}

/** Turns on drawing or erasing on the editor; returns the function that turns it off. */
export function attachTableTool(view: EditorView, tool: TableTool, onStop: () => void): () => void {
  const dom = view.dom
  const overlay = document.createElement('div')
  overlay.className = 'draw-table-rect'
  let start: { x: number; y: number; target: EventTarget | null } | null = null

  const onDown = (e: MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    if (tool === 'eraser') {
      const loc = locateCell(view, e.target)
      if (!loc) return
      const cellEl = (e.target as HTMLElement).closest('td, th')!.getBoundingClientRect()
      const d = { top: e.clientY - cellEl.top, bottom: cellEl.bottom - e.clientY, left: e.clientX - cellEl.left, right: cellEl.right - e.clientX }
      const side = (Object.keys(d) as (keyof typeof d)[]).reduce((a, b) => (d[a] <= d[b] ? a : b))
      eraseEdge(view, loc, side)
      return
    }
    start = { x: e.clientX, y: e.clientY, target: e.target }
    document.body.appendChild(overlay)
    onMove(e)
  }
  const onMove = (e: MouseEvent) => {
    if (!start) return
    const horizontalish = Math.abs(e.clientX - start.x) > Math.abs(e.clientY - start.y)
    const inCell = !!locateCell(view, start.target)
    Object.assign(overlay.style, inCell
      ? horizontalish
        ? { left: `${Math.min(start.x, e.clientX)}px`, top: `${start.y}px`, width: `${Math.abs(e.clientX - start.x)}px`, height: '0px' }
        : { left: `${start.x}px`, top: `${Math.min(start.y, e.clientY)}px`, width: '0px', height: `${Math.abs(e.clientY - start.y)}px` }
      : { left: `${Math.min(start.x, e.clientX)}px`, top: `${Math.min(start.y, e.clientY)}px`, width: `${Math.abs(e.clientX - start.x)}px`, height: `${Math.abs(e.clientY - start.y)}px` })
  }
  const onUp = (e: MouseEvent) => {
    if (!start) return
    const s = start
    start = null
    overlay.remove()
    const dx = Math.abs(e.clientX - s.x)
    const dy = Math.abs(e.clientY - s.y)
    if (dx < 6 && dy < 6) return
    const loc = locateCell(view, s.target)
    if (loc) {
      splitDrawnCell(view, loc, dx > dy ? 'rows' : 'columns')
      return
    }
    // A rectangle outside tables: a one-cell table of that size at the start point.
    const scale = dom.getBoundingClientRect().width / dom.offsetWidth || 1
    const at = view.posAtCoords({ left: s.x, top: s.y })
    if (!at) return
    const schema = view.state.schema
    const cell = schema.nodes.tableCell.create({ colwidth: [Math.max(24, Math.round(dx / scale))] }, schema.nodes.paragraph.create())
    const row = schema.nodes.tableRow.create(null, cell)
    const table = schema.nodes.table.create(null, row)
    const $at = view.state.doc.resolve(at.pos)
    // Insert after the block the rectangle starts in.
    let depth = $at.depth
    while (depth > 1 && !$at.node(depth).isTextblock) depth--
    const after = depth > 0 ? $at.after(Math.max(1, depth)) : at.pos
    const tr = view.state.tr.insert(after, table)
    const rowHeight = Math.round(dy / scale)
    if (rowHeight > 24) tr.setNodeMarkup(after + 1, undefined, { ...row.attrs, rowHeight })
    view.dispatch(tr.scrollIntoView())
  }
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onStop()

  dom.addEventListener('mousedown', onDown, true)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  window.addEventListener('keydown', onKey)
  dom.classList.add(tool === 'draw' ? 'is-drawing-table' : 'is-erasing-table')
  return () => {
    dom.removeEventListener('mousedown', onDown, true)
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    window.removeEventListener('keydown', onKey)
    dom.classList.remove('is-drawing-table', 'is-erasing-table')
    overlay.remove()
  }
}
