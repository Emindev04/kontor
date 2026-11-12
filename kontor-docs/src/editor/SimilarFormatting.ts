import { Extension } from '@tiptap/core'
import type { Mark, Node as PMNode, ResolvedPos } from '@tiptap/pm/model'
import { Plugin, PluginKey, Selection, SelectionRange, TextSelection, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Mapping } from '@tiptap/pm/transform'

// Home › Select › Select Text with Similar Formatting: selects every stretch of text whose character
// formatting equals the formatting at the cursor. The result is one selection with several ranges:
// character and paragraph formatting and deleting act on all of them; typing replaces the first range
// and removes the others.

/** Marks that are not character formatting (review marks and links are ignored when comparing). */
const IGNORED = new Set(['link', 'comment', 'insertion', 'deletion', 'formatChange'])

export class MultiRangeSelection extends Selection {
  constructor(ranges: SelectionRange[]) {
    super(ranges[0].$from, ranges[ranges.length - 1].$to, ranges)
  }

  map(doc: PMNode, mapping: Mapping): Selection {
    const ranges = this.ranges
      .map((r) => {
        const from = mapping.map(r.$from.pos, 1)
        const to = mapping.map(r.$to.pos, -1)
        return from < to ? new SelectionRange(doc.resolve(from), doc.resolve(to)) : null
      })
      .filter((r): r is SelectionRange => !!r)
    if (ranges.length > 1) return new MultiRangeSelection(ranges)
    if (ranges.length === 1) return TextSelection.create(doc, ranges[0].$from.pos, ranges[0].$to.pos)
    return TextSelection.near(doc.resolve(mapping.map(this.head)))
  }

  eq(other: Selection): boolean {
    return other instanceof MultiRangeSelection && other.ranges.length === this.ranges.length && other.ranges.every((r, i) => r.$from.pos === this.ranges[i].$from.pos && r.$to.pos === this.ranges[i].$to.pos)
  }

  toJSON() {
    return { type: 'multiRange', ranges: this.ranges.map((r) => [r.$from.pos, r.$to.pos]) }
  }

  static fromJSON(doc: PMNode, json: { ranges: [number, number][] }) {
    return new MultiRangeSelection(json.ranges.map(([a, b]) => new SelectionRange(doc.resolve(a), doc.resolve(b))))
  }
}

// The browser would show one range from the first to the last: hide it and draw the ranges instead.
MultiRangeSelection.prototype.visible = false

try {
  Selection.jsonID('multiRange', MultiRangeSelection)
} catch {
  // Registered already (hot reload).
}

const sameMarks = (a: readonly Mark[], b: readonly Mark[]) => a.length === b.length && a.every((m) => b.some((n) => n.eq(m)))
const formatting = (marks: readonly Mark[]) => marks.filter((m) => !IGNORED.has(m.type.name))

/** Ranges of text whose character formatting equals `marks`. */
export function similarRanges(doc: PMNode, marks: readonly Mark[]): { from: number; to: number }[] {
  const want = formatting(marks)
  const out: { from: number; to: number }[] = []
  doc.descendants((node, pos) => {
    if (!node.isText) return
    if (!sameMarks(formatting(node.marks), want)) return
    const last = out[out.length - 1]
    if (last && last.to === pos) last.to = pos + node.nodeSize
    else out.push({ from: pos, to: pos + node.nodeSize })
  })
  return out
}

function referenceMarks(state: EditorState): readonly Mark[] {
  const { $from, empty } = state.selection
  if (!empty) {
    let found: readonly Mark[] | null = null
    state.doc.nodesBetween(state.selection.from, state.selection.to, (n) => {
      if (!found && n.isText) found = n.marks
      return !found
    })
    if (found) return found
  }
  return ($from as ResolvedPos).marks()
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    similarFormatting: {
      selectSimilarFormatting: () => ReturnType
    }
  }
}

const key = new PluginKey('similarFormatting')

export const SimilarFormatting = Extension.create({
  name: 'similarFormatting',

  addCommands() {
    return {
      selectSimilarFormatting:
        () =>
        ({ state, tr, dispatch }) => {
          const ranges = similarRanges(state.doc, referenceMarks(state))
          if (!ranges.length) return false
          if (dispatch) {
            const sel = ranges.length === 1 ? TextSelection.create(tr.doc, ranges[0].from, ranges[0].to) : new MultiRangeSelection(ranges.map((r) => new SelectionRange(tr.doc.resolve(r.from), tr.doc.resolve(r.to))))
            tr.setSelection(sel)
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        props: {
          // The browser shows only one range: the others are highlighted like a selection.
          decorations: (state) => {
            const sel = state.selection
            if (!(sel instanceof MultiRangeSelection)) return null
            return DecorationSet.create(
              state.doc,
              sel.ranges.map((r) => Decoration.inline(r.$from.pos, r.$to.pos, { class: 'multi-range-selection' })),
            )
          },
        },
      }),
    ]
  },
})
