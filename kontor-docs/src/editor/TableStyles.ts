import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TableView } from '@tiptap/extension-table'
import { CellSelection } from '@tiptap/pm/tables'
import { tx } from '../i18n'

// Table style gallery, style options (header row, banded rows, first column …), cell shading and
// cell alignment. Styles are CSS classes on the <table>; shading is a cell attribute.

export type TableStyleId = 'grid' | 'plain' | 'outside' | 'light' | 'lightList' | 'accent1' | 'accent2' | 'accent3' | 'accent4' | 'dark'

export const TABLE_STYLES: { id: TableStyleId; label: string }[] = [
  { id: 'grid', label: tx('Table Grid') },
  { id: 'plain', label: tx('Plain') },
  { id: 'light', label: tx('Light Grid') },
  { id: 'lightList', label: tx('Light List') },
  { id: 'accent1', label: tx('Grid – Blue') },
  { id: 'accent2', label: tx('Grid – Orange') },
  { id: 'accent3', label: tx('Grid – Green') },
  { id: 'accent4', label: tx('Grid – Purple') },
  { id: 'dark', label: tx('Dark Header') },
]

export type TableOption = 'headerRow' | 'bandedRows' | 'firstColumn' | 'lastColumn' | 'totalRow' | 'bandedColumns'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableStyles: {
      setTableStyle: (id: TableStyleId) => ReturnType
      setTableOption: (option: TableOption, value: boolean) => ReturnType
      setCellBackground: (color: string | null) => ReturnType
      setCellVerticalAlign: (align: 'top' | 'middle' | 'bottom') => ReturnType
      setTableAlign: (align: 'left' | 'center' | 'right') => ReturnType
    }
  }
}

export function tableClass(attrs: Record<string, unknown>) {
  return [
    `ts-${(attrs.tableStyle as string) || 'grid'}`,
    attrs.headerRow !== false && 'ts-header',
    attrs.bandedRows && 'ts-banded',
    attrs.bandedColumns && 'ts-banded-cols',
    attrs.firstColumn && 'ts-first-col',
    attrs.lastColumn && 'ts-last-col',
    attrs.totalRow && 'ts-total',
    attrs.tableAlign && attrs.tableAlign !== 'left' && `ta-${attrs.tableAlign}`,
  ]
    .filter(Boolean)
    .join(' ')
}

/** Table node view that also keeps the style classes on the <table> element up to date. */
export class StyledTableView extends TableView {
  constructor(node: PMNode, cellMinWidth: number, view?: import('@tiptap/pm/view').EditorView, attrs?: Record<string, unknown>) {
    super(node, cellMinWidth, view, attrs)
    this.table.className = tableClass(node.attrs)
  }

  update(node: PMNode) {
    if (!super.update(node)) return false
    this.table.className = tableClass(node.attrs)
    return true
  }
}

function findTable(state: import('@tiptap/pm/state').EditorState) {
  const $from = state.selection.$from
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type.name === 'table') return { node, pos: $from.before(d) }
  }
  return null
}

export const TableStyles = Extension.create({
  name: 'tableStyles',

  addGlobalAttributes() {
    const bool = (name: string, fallback: boolean) => ({
      default: fallback,
      parseHTML: (el: HTMLElement) => (el.hasAttribute(`data-${name}`) ? el.getAttribute(`data-${name}`) === 'true' : fallback),
      renderHTML: (a: Record<string, unknown>) => (a[name] === fallback ? {} : { [`data-${name}`]: String(a[name]) }),
    })
    return [
      {
        types: ['table'],
        attributes: {
          tableStyle: {
            default: 'grid',
            parseHTML: (el) => el.getAttribute('data-table-style') || 'grid',
            renderHTML: (a) => ({ 'data-table-style': a.tableStyle, class: tableClass(a) }),
          },
          headerRow: bool('headerRow', true),
          bandedRows: bool('bandedRows', false),
          bandedColumns: bool('bandedColumns', false),
          firstColumn: bool('firstColumn', false),
          lastColumn: bool('lastColumn', false),
          totalRow: bool('totalRow', false),
          tableAlign: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-align'),
            renderHTML: (a) => (a.tableAlign ? { 'data-align': a.tableAlign } : {}),
          },
        },
      },
      {
        types: ['tableCell', 'tableHeader'],
        attributes: {
          backgroundColor: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-shading') || el.style.backgroundColor || null,
            renderHTML: (a) => (a.backgroundColor ? { 'data-shading': a.backgroundColor, style: `background-color: ${a.backgroundColor}` } : {}),
          },
          verticalAlign: {
            default: null,
            parseHTML: (el) => el.style.verticalAlign || null,
            renderHTML: (a) => (a.verticalAlign ? { style: `vertical-align: ${a.verticalAlign}` } : {}),
          },
        },
      },
    ]
  },

  addCommands() {
    const setTableAttrs =
      (attrs: Record<string, unknown>) =>
      ({ state, tr, dispatch }: { state: import('@tiptap/pm/state').EditorState; tr: import('@tiptap/pm/state').Transaction; dispatch?: unknown }) => {
        const table = findTable(state)
        if (!table) return false
        if (dispatch) tr.setNodeMarkup(table.pos, undefined, { ...table.node.attrs, ...attrs })
        return true
      }
    const setCellAttr =
      (name: string, value: unknown) =>
      ({ state, tr, dispatch }: { state: import('@tiptap/pm/state').EditorState; tr: import('@tiptap/pm/state').Transaction; dispatch?: unknown }) => {
        const sel = state.selection
        const cells: { pos: number; node: PMNode }[] = []
        if (sel instanceof CellSelection) sel.forEachCell((node, pos) => cells.push({ node, pos }))
        else {
          const $from = sel.$from
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d)
            if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
              cells.push({ node, pos: $from.before(d) })
              break
            }
          }
        }
        if (!cells.length) return false
        if (dispatch) cells.forEach(({ node, pos }) => tr.setNodeMarkup(pos, undefined, { ...node.attrs, [name]: value }))
        return true
      }
    return {
      setTableStyle: (id) => setTableAttrs({ tableStyle: id }),
      setTableOption: (option, value) => setTableAttrs({ [option]: value }),
      setTableAlign: (align) => setTableAttrs({ tableAlign: align === 'left' ? null : align }),
      setCellBackground: (color) => setCellAttr('backgroundColor', color),
      setCellVerticalAlign: (align) => setCellAttr('verticalAlign', align === 'top' ? null : align),
    }
  },
})

export function currentTableAttrs(state: import('@tiptap/pm/state').EditorState) {
  return findTable(state)?.node.attrs ?? null
}
