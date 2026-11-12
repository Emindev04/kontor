import { Extension, Node, mergeAttributes } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { refPage } from './Objects'
import { t, tx } from '../i18n'

// References › Table of Authorities. "Mark Citation" inserts hidden citation fields (like the TA
// field of the original) with the long citation, the short citation and a category; the table lists
// the long citations by category with the pages they are cited on, and refreshes after every change.

export const TOA_CATEGORIES = [tx('Cases'), tx('Statutes'), tx('Other Authorities'), tx('Rules'), tx('Treatises'), tx('Regulations'), tx('Constitutional Provisions')]

export type AuthorityEntry = { long: string; short: string; category: number; pos: number }
export type ToaOptions = { category: number; passim: boolean; leader: 'dot' | 'dash' | 'underline' | 'none' }

export function collectAuthorities(doc: PMNode): AuthorityEntry[] {
  const out: AuthorityEntry[] = []
  doc.descendants((n, pos) => {
    if (n.type.name === 'authorityEntry') out.push({ long: n.attrs.long, short: n.attrs.short, category: n.attrs.category, pos })
  })
  return out
}

/**
 * The lines of the table: per category (0 = all categories), the citations (by their long form,
 * alphabetically) with their pages. With `passim`, citations on five or more pages show "passim".
 */
export function authorityLines(entries: AuthorityEntry[], pageOf: (pos: number) => string, options: Pick<ToaOptions, 'category' | 'passim'>) {
  const byCategory = new Map<number, Map<string, Set<string>>>()
  // A short citation stands for the long one marked with the same short form.
  const longOf = new Map<string, string>()
  for (const e of entries) if (e.long && e.short) longOf.set(e.short, e.long)
  for (const e of entries) {
    if (options.category && e.category !== options.category) continue
    const long = (e.long || longOf.get(e.short) || e.short).trim()
    if (!long) continue
    const cites = byCategory.get(e.category) ?? new Map<string, Set<string>>()
    const pages = cites.get(long) ?? new Set<string>()
    pages.add(pageOf(e.pos))
    cites.set(long, pages)
    byCategory.set(e.category, cites)
  }
  return [...byCategory.keys()]
    .sort((a, b) => a - b)
    .map((category) => ({
      category,
      entries: [...byCategory.get(category)!.entries()]
        .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
        .map(([text, pages]) => ({
          text,
          pages: options.passim && pages.size >= 5 ? 'passim' : [...pages].sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b)).join(', '),
        })),
    }))
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
export const categoryName = (n: number) => t(TOA_CATEGORIES[n - 1] ?? TOA_CATEGORIES[0])

function toaHtml(doc: PMNode, options: ToaOptions) {
  const groups = authorityLines(collectAuthorities(doc), refPage, options)
  if (!groups.length) return `<p class="toa-empty">${esc(t('No table of authorities entries found.'))}</p>`
  return groups
    .map((g) => `<p class="toa-category">${esc(categoryName(g.category))}</p>${g.entries.map((e) => `<p class="toa-entry index-leader-${options.leader}"><span class="toc-text">${esc(e.text)}</span><span class="toc-page">${esc(e.pages)}</span></p>`).join('')}`)
    .join('')
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    authorities: {
      /** Inserts a citation field after the selection (or after every occurrence of the text with `all`). */
      markCitation: (entry: { long: string; short: string; category: number }, all?: boolean) => ReturnType
      insertTableOfAuthorities: (options?: Partial<ToaOptions>) => ReturnType
    }
  }
}

export const AuthorityEntryNode = Node.create({
  name: 'authorityEntry',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      long: { default: '', parseHTML: (el) => el.getAttribute('data-long') ?? '', renderHTML: (a) => ({ 'data-long': a.long }) },
      short: { default: '', parseHTML: (el) => el.getAttribute('data-short') ?? '', renderHTML: (a) => ({ 'data-short': a.short }) },
      category: { default: 1, parseHTML: (el) => Number(el.getAttribute('data-category') ?? 1), renderHTML: (a) => ({ 'data-category': String(a.category) }) },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-authority]' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    // Shown like a hidden TA field: only with formatting marks on.
    return ['span', mergeAttributes(HTMLAttributes, { 'data-authority': '', class: 'index-entry' }), `{ TA \\l "${node.attrs.long}" \\s "${node.attrs.short}" \\c ${node.attrs.category} }`]
  },
  renderText() {
    return ''
  },
})

export const TableOfAuthoritiesNode = Node.create({
  name: 'tableOfAuthorities',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      category: { default: 0, parseHTML: (el) => Number(el.getAttribute('data-category') ?? 0), renderHTML: (a) => ({ 'data-category': String(a.category) }) },
      passim: { default: true, parseHTML: (el) => el.getAttribute('data-passim') !== 'false', renderHTML: (a) => ({ 'data-passim': String(a.passim) }) },
      leader: { default: 'dot', parseHTML: (el) => el.getAttribute('data-leader') ?? 'dot', renderHTML: (a) => ({ 'data-leader': a.leader }) },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-table-of-authorities]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-table-of-authorities': '', class: 'table-of-authorities', contenteditable: 'false' })]
  },
})

export const Authorities = Extension.create({
  name: 'authorities',

  addExtensions() {
    return [AuthorityEntryNode, TableOfAuthoritiesNode]
  },

  addCommands() {
    return {
      markCitation:
        (entry, all = false) =>
        ({ state, tr, dispatch }) => {
          const type = state.schema.nodes.authorityEntry
          const { from, to } = state.selection
          const text = state.doc.textBetween(from, to, ' ').trim()
          if (!all || !text) {
            if (dispatch) dispatch(tr.insert(to, type.create(entry)))
            return true
          }
          // Mark All: after every occurrence of the selected text (short form for later ones).
          const ends: number[] = []
          state.doc.descendants((node, pos) => {
            if (!node.isText || !node.text) return
            let i = node.text.indexOf(text)
            while (i !== -1) {
              ends.push(pos + i + text.length)
              i = node.text.indexOf(text, i + text.length)
            }
          })
          if (!ends.includes(to)) ends.push(to)
          if (dispatch) {
            ends.sort((a, b) => b - a).forEach((end) => tr.insert(end, type.create(end === to ? entry : { ...entry, long: '' })))
            dispatch(tr)
          }
          return true
        },
      insertTableOfAuthorities:
        (options = {}) =>
        ({ commands }) =>
          commands.insertContent({ type: 'tableOfAuthorities', attrs: options }),
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('authoritiesRefresh'),
        view: () => ({
          update: (view) => {
            view.dom.querySelectorAll<HTMLElement>('[data-table-of-authorities]').forEach((dom) => {
              const node = view.state.doc.nodeAt(view.posAtDOM(dom, 0))
              if (node?.type.name !== 'tableOfAuthorities') return
              const html = toaHtml(view.state.doc, node.attrs as ToaOptions)
              if (dom.dataset.html !== html) {
                dom.innerHTML = html
                dom.dataset.html = html
              }
            })
          },
        }),
      }),
    ]
  },
})

/** Table of Authorities as plain lines (for .docx and other formats). */
export function authorityExportLines(doc: PMNode, options: ToaOptions) {
  return authorityLines(collectAuthorities(doc), refPage, options)
}
