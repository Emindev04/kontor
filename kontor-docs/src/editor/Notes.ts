import { Node, mergeAttributes, type JSONContent } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { formatPageNumber, type PageNumberFormat } from '../pageSetup'

// Footnotes and endnotes. The reference mark in the text is an inline atom that only carries the
// note id; the note text lives next to the document (like comment threads) and is laid out at the
// bottom of the page (footnotes) or after the last paragraph (endnotes) by the page view.

export type NoteKind = 'footnote' | 'endnote'
export type Notes = Record<string, JSONContent>
export type NoteFormat = PageNumberFormat | 'symbol'
export type NoteSettings = { footnoteFormat: NoteFormat; endnoteFormat: NoteFormat; footnoteStart: number; endnoteStart: number }

export const DEFAULT_NOTE_SETTINGS: NoteSettings = { footnoteFormat: 'decimal', endnoteFormat: 'lowerRoman', footnoteStart: 1, endnoteStart: 1 }

const SYMBOLS = ['*', '†', '‡', '§']

export function formatNoteNumber(n: number, format: NoteFormat) {
  if (format === 'symbol') return SYMBOLS[(n - 1) % 4].repeat(Math.floor((n - 1) / 4) + 1)
  return formatPageNumber(n, format)
}

export const EMPTY_NOTE: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }

/** Note references in document order, with their displayed numbers. */
export function collectNotes(doc: PMNode, settings: NoteSettings = DEFAULT_NOTE_SETTINGS) {
  const out: { id: string; kind: NoteKind; pos: number; label: string }[] = []
  const counts = { footnote: settings.footnoteStart - 1, endnote: settings.endnoteStart - 1 }
  doc.descendants((node, pos) => {
    if (node.type.name !== 'noteRef') return
    const kind = node.attrs.kind as NoteKind
    counts[kind]++
    out.push({ id: node.attrs.id, kind, pos, label: formatNoteNumber(counts[kind], kind === 'footnote' ? settings.footnoteFormat : settings.endnoteFormat) })
  })
  return out
}

export const notesKey = new PluginKey<DecorationSet>('noteNumbers')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    notes: {
      insertNoteRef: (kind: NoteKind, id: string) => ReturnType
    }
  }
}

export const NoteRef = Node.create<{ getSettings: () => NoteSettings }>({
  name: 'noteRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { getSettings: () => DEFAULT_NOTE_SETTINGS }
  },

  addAttributes() {
    return {
      id: { default: null, parseHTML: (el) => el.getAttribute('data-note'), renderHTML: (a) => ({ 'data-note': a.id }) },
      kind: { default: 'footnote', parseHTML: (el) => el.getAttribute('data-kind') ?? 'footnote', renderHTML: (a) => ({ 'data-kind': a.kind }) },
    }
  },

  parseHTML() {
    return [{ tag: 'sup[data-note]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['sup', mergeAttributes(HTMLAttributes, { class: 'note-ref' })]
  },

  renderText() {
    return ''
  },

  addCommands() {
    return {
      insertNoteRef:
        (kind, id) =>
        ({ chain, state }) =>
          chain()
            .setTextSelection(state.selection.to)
            .insertContent({ type: this.name, attrs: { id, kind } })
            .run(),
    }
  },

  addProseMirrorPlugins() {
    const getSettings = () => this.options.getSettings()
    const build = (doc: PMNode) =>
      DecorationSet.create(
        doc,
        collectNotes(doc, getSettings()).map((n) => Decoration.node(n.pos, n.pos + 1, { 'data-n': n.label })),
      )
    return [
      new Plugin({
        key: notesKey,
        state: {
          init: (_, state) => build(state.doc),
          apply: (tr, prev, _old, state) => (tr.docChanged || tr.getMeta(notesKey) ? build(state.doc) : prev),
        },
        props: { decorations: (state) => notesKey.getState(state) },
      }),
    ]
  },
})
