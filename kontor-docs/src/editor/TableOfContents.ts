import { Node, mergeAttributes, type Editor } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { t } from '../i18n'

// Table of contents: like the original's TOC field it stores the last calculated result and is
// refreshed with "Update Table". Ctrl+click on an entry jumps to its heading.

export type TocEntry = { text: string; level: number; page: string }
export type TocLeader = 'dot' | 'dash' | 'underline' | 'none'
/** Options of the Table of Contents and Table of Figures dialogs, stored on the node. */
export type TocOptions = {
  /** "toc" lists headings, "figures" lists captions. */
  kind: 'toc' | 'figures'
  showPages: boolean
  rightAlign: boolean
  leader: TocLeader
  /** Table of Figures: only captions with this label ("Figure", "Table" …); empty = all. */
  label: string
  /** Table of Figures: include the label and number ("Figure 1: …"). */
  includeLabel: boolean
  /** Table of Contents: also list paragraphs with an outline level. */
  useOutline: boolean
}

export const DEFAULT_TOC_OPTIONS: TocOptions = { kind: 'toc', showPages: true, rightAlign: true, leader: 'dot', label: '', includeLabel: true, useOutline: true }

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableOfContents: {
      insertTableOfContents: (entries: TocEntry[], levels?: number, options?: Partial<TocOptions>) => ReturnType
      /** Updates the tables of one kind (default: tables of contents). */
      updateTableOfContents: (entries: TocEntry[], kind?: TocOptions['kind']) => ReturnType
      /** Recalculates every table from its own options. */
      refreshTablesOfContents: (compute: (attrs: Record<string, unknown>) => TocEntry[]) => ReturnType
      removeTableOfContents: () => ReturnType
    }
  }
}

/** Headings (and paragraphs with an outline level) up to `levels`, with the page they are on. */
export function collectHeadings(editor: Editor, levels: number, pageOf: (pos: number) => string, useOutline = true): (TocEntry & { pos: number })[] {
  const out: (TocEntry & { pos: number })[] = []
  editor.state.doc.descendants((node, pos) => {
    const level = node.type.name === 'heading' ? (node.attrs.level as number) : useOutline && node.type.name === 'paragraph' ? (node.attrs.outlineLevel as number | null) : null
    if (level && level <= levels && node.textContent.trim()) {
      out.push({ text: node.textContent.trim(), level, page: pageOf(pos), pos })
    }
    return node.type.name !== 'tableOfContents'
  })
  return out
}

/** Caption label of a caption paragraph ("Figure 1: Sales" gives "Figure"). */
export const captionLabel = (text: string) => text.match(/^(\S+)\s+[\dIVXivx]+(?=[.:\s-]|$)/)?.[1] ?? ''

/** Captions for a Table of Figures (label "" = all), with the page they are on. */
export function collectCaptions(editor: Editor, label: string, includeLabel: boolean, pageOf: (pos: number) => string): (TocEntry & { pos: number })[] {
  const out: (TocEntry & { pos: number })[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph' || node.attrs.pStyle !== 'caption') return node.type.name !== 'tableOfContents'
    const text = node.textContent.trim()
    if (!text || (label && captionLabel(text) !== label)) return false
    out.push({ text: includeLabel ? text : text.replace(/^\S+\s+[\dIVXivx]+[.:]?\s*[-–—:]?\s*/, ''), level: 1, page: pageOf(pos), pos })
    return false
  })
  return out
}

const optionAttr = <K extends keyof TocOptions>(key: K, data: string, parse: (v: string) => TocOptions[K]) => ({
  default: DEFAULT_TOC_OPTIONS[key],
  parseHTML: (el: HTMLElement) => (el.hasAttribute(data) ? parse(el.getAttribute(data)!) : DEFAULT_TOC_OPTIONS[key]),
  renderHTML: (a: Record<string, unknown>) => (a[key] === DEFAULT_TOC_OPTIONS[key] ? {} : { [data]: String(a[key]) }),
})

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
      kind: optionAttr('kind', 'data-kind', (v) => (v === 'figures' ? 'figures' : 'toc')),
      showPages: optionAttr('showPages', 'data-show-pages', (v) => v !== 'false'),
      rightAlign: optionAttr('rightAlign', 'data-right-align', (v) => v !== 'false'),
      leader: optionAttr('leader', 'data-leader', (v) => (['dot', 'dash', 'underline', 'none'].includes(v) ? (v as TocLeader) : 'dot')),
      label: optionAttr('label', 'data-label', (v) => v),
      includeLabel: optionAttr('includeLabel', 'data-include-label', (v) => v !== 'false'),
      useOutline: optionAttr('useOutline', 'data-use-outline', (v) => v !== 'false'),
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toc"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const entries = (node.attrs.entries as TocEntry[]) ?? []
    const a = node.attrs as TocOptions
    const figures = a.kind === 'figures'
    const cls = ['toc', figures && 'toc-figures', `toc-leader-${a.rightAlign ? a.leader : 'none'}`, !a.rightAlign && 'toc-inline-pages'].filter(Boolean).join(' ')
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'toc', class: cls, contenteditable: 'false' }),
      ...(figures ? [] : [['p', { class: 'toc-title' }, t('Contents')]]),
      ...(entries.length
        ? entries.map((e, i) => ['p', { class: `toc-entry toc-l${e.level}`, 'data-index': String(i) }, ['span', { class: 'toc-text' }, e.text], ...(a.showPages ? [['span', { class: 'toc-page' }, e.page]] : [])])
        : [['p', { class: 'toc-empty' }, figures ? t('No table of figures entries found.') : t('No table of contents entries found. Apply heading styles to your text first.')]]),
    ]
  },

  addCommands() {
    return {
      insertTableOfContents:
        (entries, levels = 3, options = {}) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { entries, levels, ...options } }),
      updateTableOfContents:
        (entries, kind = 'toc') =>
        ({ state, tr, dispatch }) => {
          let found = false
          state.doc.descendants((node, pos) => {
            if (node.type.name !== this.name) return
            if ((node.attrs.kind ?? 'toc') !== kind) return false
            found = true
            if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, entries })
            return false
          })
          return found
        },
      refreshTablesOfContents:
        (compute) =>
        ({ state, tr, dispatch }) => {
          let found = false
          state.doc.descendants((node, pos) => {
            if (node.type.name !== this.name) return
            found = true
            const entries = compute(node.attrs)
            if (dispatch && JSON.stringify(entries) !== JSON.stringify(node.attrs.entries)) tr.setNodeMarkup(pos, undefined, { ...node.attrs, entries })
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
              const targets = toc?.classList.contains('toc-figures') ? collectCaptions(editor, '', true, () => '') : collectHeadings(editor, Math.max(levels, 9), () => '')
              const target = targets.find((h) => h.text === text || h.text.endsWith(text))
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
