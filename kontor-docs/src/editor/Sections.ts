import { Node, mergeAttributes } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { NodeRange } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { liftTarget } from '@tiptap/pm/transform'

// Sections and columns.
//
// A section break is a block marker: "Next Page", "Even Page" and "Odd Page" start a new page (the
// pagination adds a blank page when the parity is wrong); "Continuous" only separates sections.
// Text in columns is wrapped in a `columns` block, which is what the original does with a pair of
// continuous section breaks. Column breaks move the following text to the next column.

export type SectionKind = 'nextPage' | 'continuous' | 'evenPage' | 'oddPage'
export type ColumnsAttrs = { count: number; gap: number; line: boolean; preset: 'equal' | 'left' | 'right' }

export const SECTION_LABEL: Record<SectionKind, string> = {
  nextPage: 'Section Break (Next Page)',
  continuous: 'Section Break (Continuous)',
  evenPage: 'Section Break (Even Page)',
  oddPage: 'Section Break (Odd Page)',
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sections: {
      insertSectionBreak: (kind: SectionKind) => ReturnType
      insertColumnBreak: () => ReturnType
      setColumns: (attrs: Partial<ColumnsAttrs> & { count: number }, scope?: 'section' | 'selection' | 'document') => ReturnType
    }
  }
}

export const SectionBreak = Node.create({
  name: 'sectionBreak',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      kind: { default: 'nextPage', parseHTML: (el) => el.getAttribute('data-kind') ?? 'nextPage', renderHTML: (a) => ({ 'data-kind': a.kind, 'data-label': SECTION_LABEL[a.kind as SectionKind] }) },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="section-break"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'section-break', class: 'section-break' })]
  },

  addCommands() {
    return {
      insertSectionBreak:
        (kind) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { kind } }),
      insertColumnBreak:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: 'columnBreak' }),
      setColumns:
        (attrs, scope = 'section') =>
        ({ state, tr, dispatch }) => {
          if (dispatch) applyColumns(state, tr, attrs, scope)
          return true
        },
    }
  },
})

export const ColumnBreak = Node.create({
  name: 'columnBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'div[data-type="column-break"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'column-break', class: 'column-break' })]
  },
  addKeyboardShortcuts() {
    return { 'Mod-Shift-Enter': () => this.editor.commands.insertContent({ type: this.name }) }
  },
})

/** CSS for a columns block; the measuring pass shows it as one column of the column width. */
export function columnsStyle(a: ColumnsAttrs) {
  const gap = `${a.gap}in`
  return [
    `column-count: ${a.count}`,
    `column-gap: ${gap}`,
    a.line ? 'column-rule: 0.75pt solid #000' : '',
    `--col-w: calc((100% - ${a.count - 1} * ${gap}) / ${a.count})`,
  ]
    .filter(Boolean)
    .join('; ')
}

export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      count: { default: 2, parseHTML: (el) => Number(el.getAttribute('data-count') ?? 2) },
      gap: { default: 0.5, parseHTML: (el) => Number(el.getAttribute('data-gap') ?? 0.5) },
      line: { default: false, parseHTML: (el) => el.getAttribute('data-line') === 'true' },
      preset: { default: 'equal', parseHTML: (el) => el.getAttribute('data-preset') ?? 'equal' },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const a = node.attrs as ColumnsAttrs
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'columns',
        'data-count': a.count,
        'data-gap': a.gap,
        'data-line': String(a.line),
        'data-preset': a.preset,
        class: 'col-section',
        style: columnsStyle(a),
      }),
      0,
    ]
  },
})

/** The top-level block range of the section around the cursor (between section breaks). */
function sectionRange(doc: PMNode, pos: number) {
  let from = 0
  let to = doc.content.size
  let offset = 0
  doc.forEach((child) => {
    const end = offset + child.nodeSize
    if (child.type.name === 'sectionBreak') {
      if (end <= pos) from = end
      else if (offset >= pos && to === doc.content.size) to = offset
    }
    offset = end
  })
  return { from, to }
}

function applyColumns(state: EditorState, tr: Transaction, attrs: Partial<ColumnsAttrs> & { count: number }, scope: 'section' | 'selection' | 'document') {
  const type = state.schema.nodes.columns
  const { $from, from, to, empty } = state.selection
  // Already inside columns: change them (one column removes the wrapper).
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d)
    if (node.type !== type) continue
    const pos = $from.before(d)
    if (attrs.count <= 1) {
      const inner = new NodeRange(tr.doc.resolve(pos + 1), tr.doc.resolve(pos + node.nodeSize - 1), d)
      const target = liftTarget(inner)
      if (target != null) tr.lift(inner, target)
    } else tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs })
    return
  }
  if (attrs.count <= 1) return
  let a: number
  let b: number
  if (scope === 'document') {
    a = 0
    b = state.doc.content.size
  } else if (scope === 'selection' && !empty) {
    a = from
    b = to
  } else ({ from: a, to: b } = sectionRange(state.doc, from))
  // Expand to whole top-level blocks and skip leading/trailing section breaks.
  const $a = state.doc.resolve(Math.min(a, state.doc.content.size))
  const $b = state.doc.resolve(Math.max(a, b))
  const start = $a.depth ? $a.before(1) : a
  const end = $b.depth ? $b.after(1) : b
  if (end <= start) return
  const range = new NodeRange(tr.doc.resolve(start), tr.doc.resolve(end), 0)
  tr.wrap(range, [{ type, attrs: { count: attrs.count, gap: attrs.gap ?? 0.5, line: attrs.line ?? false, preset: attrs.preset ?? 'equal' } }])
}
