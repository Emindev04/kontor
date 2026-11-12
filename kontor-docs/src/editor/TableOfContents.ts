import { Node, mergeAttributes, type Editor } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'

// Table of contents: like the original's TOC field it stores the last calculated result and is
// refreshed with "Update Table". Ctrl+click on an entry jumps to its heading.

export type TocEntry = { text: string; level: number; page: string }

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableOfContents: {
      insertTableOfContents: (entries: TocEntry[], levels?: number) => ReturnType
      updateTableOfContents: (entries: TocEntry[]) => ReturnType
      removeTableOfContents: () => ReturnType
    }
  }
}

/** Headings of the document (up to `levels`) with the page they are on. */
export function collectHeadings(editor: Editor, levels: number, pageOf: (pos: number) => string): (TocEntry & { pos: number })[] {
  const out: (TocEntry & { pos: number })[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading' && node.attrs.level <= levels && node.textContent.trim()) {
      out.push({ text: node.textContent.trim(), level: node.attrs.level, page: pageOf(pos), pos })
    }
    return node.type.name !== 'tableOfContents'
  })
  return out
}

export const TableOfContents = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      entries: {
        default: [],
        parseHTML: (el) => {
          try {
            return JSON.parse(el.getAttribute('data-entries') ?? '[]')
          } catch {
            return []
          }
        },
        renderHTML: (a) => ({ 'data-entries': JSON.stringify(a.entries) }),
      },
      levels: {
        default: 3,
        parseHTML: (el) => Number(el.getAttribute('data-levels') ?? 3),
        renderHTML: (a) => ({ 'data-levels': a.levels }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toc"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const entries = (node.attrs.entries as TocEntry[]) ?? []
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'toc', class: 'toc', contenteditable: 'false' }),
      ['p', { class: 'toc-title' }, 'Contents'],
      ...(entries.length
        ? entries.map((e, i) => ['p', { class: `toc-entry toc-l${e.level}`, 'data-index': String(i) }, ['span', { class: 'toc-text' }, e.text], ['span', { class: 'toc-page' }, e.page]])
        : [['p', { class: 'toc-empty' }, 'No table of contents entries found. Apply heading styles to your text first.']]),
    ]
  },

  addCommands() {
    return {
      insertTableOfContents:
        (entries, levels = 3) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { entries, levels } }),
      updateTableOfContents:
        (entries) =>
        ({ state, tr, dispatch }) => {
          let found = false
          state.doc.descendants((node, pos) => {
            if (node.type.name !== this.name) return
            found = true
            if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, entries })
            return false
          })
          return found
        },
      removeTableOfContents:
        () =>
        ({ state, tr, dispatch }) => {
          const ranges: [number, number][] = []
          state.doc.descendants((node, pos) => {
            if (node.type.name === this.name) ranges.push([pos, pos + node.nodeSize])
          })
          if (dispatch) ranges.reverse().forEach(([from, to]) => tr.delete(from, to))
          return ranges.length > 0
        },
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            click: (view, event) => {
              const entry = (event.target as HTMLElement).closest?.('.toc-entry') as HTMLElement | null
              if (!entry || !(event.ctrlKey || event.metaKey)) return false
              const toc = entry.closest('.toc')
              const levels = Number(toc?.getAttribute('data-levels') ?? 3)
              const text = entry.querySelector('.toc-text')?.textContent ?? ''
              const target = collectHeadings(editor, levels, () => '').find((h) => h.text === text)
              if (!target) return false
              event.preventDefault()
              editor.chain().focus().setTextSelection(target.pos + 1).scrollIntoView().run()
              const dom = view.nodeDOM(target.pos)
              if (dom instanceof HTMLElement) dom.scrollIntoView({ block: 'center' })
              return true
            },
          },
        },
      }),
    ]
  },
})
