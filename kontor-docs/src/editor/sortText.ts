import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'

// Home › Sort: the Sort Text dialog. Sorts the selected paragraphs (or list items) or the rows of the
// table the selection is in, by up to three keys: whole paragraphs, a field (text between tabs,
// commas or another separator) or a table column, compared as text, numbers or dates.

export type SortType = 'text' | 'number' | 'date'
export type SortKey = { field: number; type: SortType; descending: boolean }
export type SortOptions = {
  keys: SortKey[]
  /** Field separator for paragraphs: tab, comma or any other character. */
  separator: string
  /** Leaves the first paragraph or table row in place. */
  headerRow: boolean
  caseSensitive: boolean
}

/** Field `field` (1-based; 0 = whole text) of a paragraph. */
export function fieldOf(text: string, field: number, separator: string): string {
  if (field <= 0) return text
  return (text.split(separator)[field - 1] ?? '').trim()
}

function numberOf(s: string): number | null {
  const m = s.replace(/[\s ]/g, '').match(/-?\d[\d,]*(\.\d+)?|-?\.\d+/)
  if (!m) return null
  const n = Number(m[0].replace(/,/g, ''))
  return isNaN(n) ? null : n
}

function dateOf(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  // Day.month.year and day/month/year are common outside the US: try the ISO form first.
  const dmy = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/)
  if (dmy) return new Date(Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])).getTime()
  const v = Date.parse(t)
  return isNaN(v) ? null : v
}

/** Compares two values of one key. Values that are not numbers or dates sort before the others, as in the original. */
export function compareValues(a: string, b: string, type: SortType, caseSensitive: boolean): number {
  if (type === 'text') {
    return caseSensitive ? a.localeCompare(b, undefined, { numeric: true, caseFirst: 'upper' }) : a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  }
  const parse = type === 'number' ? numberOf : dateOf
  const x = parse(a)
  const y = parse(b)
  if (x == null && y == null) return a.localeCompare(b)
  if (x == null) return -1
  if (y == null) return 1
  return x - y
}

/** Sorts rows (each a list of field texts, index 0 = whole text) by the keys; stable. */
export function sortRows<T>(items: T[], text: (item: T, field: number) => string, options: Pick<SortOptions, 'keys' | 'caseSensitive'>): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      for (const key of options.keys) {
        const c = compareValues(text(a.item, key.field), text(b.item, key.field), key.type, options.caseSensitive)
        if (c) return key.descending ? -c : c
      }
      return a.index - b.index
    })
    .map((x) => x.item)
}

/** The table the selection is in (position and node), if any. */
export function selectedTable(editor: Editor): { pos: number; node: PMNode } | null {
  const { $from } = editor.state.selection
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === 'table') return { pos: $from.before(d), node: $from.node(d) }
  return null
}

/** Number of columns of the selected table, or of fields of the first selected paragraph. */
export function fieldCount(editor: Editor, separator: string): number {
  const table = selectedTable(editor)
  if (table) return Math.max(1, ...Array.from({ length: table.node.childCount }, (_, i) => table.node.child(i).childCount))
  const { from, to } = editor.state.selection
  let first = ''
  editor.state.doc.nodesBetween(from, to, (n) => {
    if (n.isTextblock && !first) first = n.textContent
    return !first
  })
  return Math.max(1, first.split(separator).length)
}

export function sortSelection(editor: Editor, options: SortOptions): boolean {
  const state = editor.state
  const table = selectedTable(editor)
  if (table) {
    const rows: PMNode[] = []
    table.node.forEach((r) => rows.push(r))
    const head = options.headerRow ? rows.slice(0, 1) : []
    const body = options.headerRow ? rows.slice(1) : rows
    if (body.length < 2) return false
    const sorted = sortRows(body, (row, field) => (field <= 0 ? row.textContent : row.childCount >= field ? row.child(field - 1).textContent : ''), options)
    const tr = state.tr.replaceWith(table.pos + 1, table.pos + table.node.nodeSize - 1, [...head, ...sorted])
    editor.view.dispatch(tr.scrollIntoView())
    return true
  }
  const { $from } = state.selection
  // Without a selection the whole list or document is sorted.
  const everything = state.selection.empty
  const from = everything ? 0 : state.selection.from
  const to = everything ? state.doc.content.size : state.selection.to
  const parent = $from.depth > 1 ? $from.node($from.depth - 1) : state.doc
  const start = $from.depth > 1 ? $from.start($from.depth - 1) : 0
  // In a list, sort the items of the list the selection is in.
  const children: { node: PMNode; pos: number }[] = []
  parent.forEach((node, offset) => {
    const pos = start + offset
    if (pos + node.nodeSize > from && pos < to) children.push({ node, pos })
  })
  let blocks = children
  if (parent.type.name === 'listItem' && $from.depth > 2) {
    const list = $from.node($from.depth - 2)
    const listStart = $from.start($from.depth - 2)
    blocks = []
    list.forEach((node, offset) => {
      const pos = listStart + offset
      if (pos + node.nodeSize > from && pos < to) blocks.push({ node, pos })
    })
  }
  const head = options.headerRow ? blocks.slice(0, 1) : []
  const body = options.headerRow ? blocks.slice(1) : blocks
  if (body.length < 2) return false
  const sorted = sortRows(body, (b, field) => fieldOf(b.node.textContent, field, options.separator), options)
  const range = { from: blocks[0].pos, to: blocks[blocks.length - 1].pos + blocks[blocks.length - 1].node.nodeSize }
  editor.view.dispatch(state.tr.replaceWith(range.from, range.to, [...head, ...sorted].map((c) => c.node)).scrollIntoView())
  return true
}
