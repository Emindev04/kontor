import { Extension, Node, mergeAttributes } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { refPage } from './Objects'

// References > Citations & Bibliography and Index.
//
// Sources live with the document (like comments); a citation is an inline field that shows the
// source in the chosen style, and the bibliography lists the cited sources. Index entries are hidden
// fields ("Mark Entry"); the index lists their terms with the pages they are on. Citation texts,
// the bibliography and the index refresh after every change, like updating fields in the original.

export type SourceType = 'book' | 'article' | 'website' | 'report'
export type Source = {
  id: string
  type: SourceType
  /** Authors as "Last, First; Last, First". */
  author: string
  title: string
  year: string
  /** Book/report publisher, journal name for articles, site name for websites. */
  publisher: string
  city: string
  volume: string
  pages: string
  url: string
  accessed: string
}
export type Sources = Record<string, Source>
export type CitationStyle = 'apa' | 'mla' | 'chicago'

export const CITATION_STYLES: { id: CitationStyle; label: string; heading: string }[] = [
  { id: 'apa', label: 'APA', heading: 'References' },
  { id: 'mla', label: 'MLA', heading: 'Works Cited' },
  { id: 'chicago', label: 'Chicago', heading: 'Bibliography' },
]

export const SOURCE_TYPES: { id: SourceType; label: string }[] = [
  { id: 'book', label: 'Book' },
  { id: 'article', label: 'Journal Article' },
  { id: 'website', label: 'Web Site' },
  { id: 'report', label: 'Report' },
]

export const EMPTY_SOURCE: Omit<Source, 'id'> = { type: 'book', author: '', title: '', year: '', publisher: '', city: '', volume: '', pages: '', url: '', accessed: '' }

let context: { sources: Sources; style: CitationStyle } = { sources: {}, style: 'apa' }

/** The app tells the fields which sources exist and which style to show them in. */
export function setCitationContext(sources: Sources, style: CitationStyle) {
  context = { sources, style }
}

const authors = (s: Source) =>
  s.author
    .split(';')
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => {
      const [last, first = ''] = a.split(',').map((x) => x.trim())
      return { last, first }
    })

const initials = (first: string) =>
  first
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((n) => `${n[0]}.`)
    .join(' ')

/** The text of an in-text citation, e.g. "(Smith, 2020)" or "(Smith 42)". */
export function citationText(sourceId: string, pages: string, style = context.style, sources = context.sources) {
  const s = sources[sourceId]
  if (!s) return '(Source not found)'
  const list = authors(s)
  const name = list.length === 0 ? s.title : list.length === 1 ? list[0].last : list.length === 2 ? `${list[0].last} ${style === 'apa' ? '&' : 'and'} ${list[1].last}` : `${list[0].last} et al.`
  const page = pages.trim()
  if (style === 'mla') return `(${[name, page].filter(Boolean).join(' ')})`
  if (style === 'chicago') return `(${[name, s.year].filter(Boolean).join(' ')}${page ? `, ${page}` : ''})`
  return `(${[name, s.year || 'n.d.'].join(', ')}${page ? `, p. ${page}` : ''})`
}

/** One bibliography entry in the style: plain text plus the part shown in italics. */
export function bibliographyEntry(s: Source, style = context.style): { before: string; italic: string; after: string } {
  const list = authors(s)
  const join = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')}${names.length > 2 ? ',' : ''} ${style === 'apa' ? '&' : 'and'} ${names[names.length - 1]}`)
  let who: string
  if (style === 'apa') who = join(list.map((a) => [a.last, initials(a.first)].filter(Boolean).join(', ')))
  else who = join(list.map((a, i) => (i === 0 ? [a.last, a.first].filter(Boolean).join(', ') : [a.first, a.last].filter(Boolean).join(' '))))
  const year = s.year || 'n.d.'
  const place = [s.city, s.publisher].filter(Boolean).join(': ')
  const url = s.url ? ` ${s.url}` : ''
  if (style === 'apa') {
    const head = `${who ? `${who} ` : ''}(${year}). `
    if (s.type === 'article') return { before: `${head}${s.title}. `, italic: [s.publisher, s.volume].filter(Boolean).join(', '), after: `${s.pages ? `, ${s.pages}` : ''}.${url}` }
    return { before: head, italic: s.title, after: `.${s.publisher ? ` ${s.publisher}.` : ''}${url}` }
  }
  if (style === 'mla') {
    const head = who ? `${who}. ` : ''
    if (s.type === 'article') return { before: `${head}"${s.title}." `, italic: s.publisher, after: `${s.volume ? `, vol. ${s.volume}` : ''}, ${year}${s.pages ? `, pp. ${s.pages}` : ''}.${url}` }
    if (s.type === 'website') return { before: `${head}"${s.title}." `, italic: s.publisher, after: `, ${year}.${url}${s.accessed ? ` Accessed ${s.accessed}.` : ''}` }
    return { before: head, italic: s.title, after: `. ${[s.publisher, year].filter(Boolean).join(', ')}.` }
  }
  const head = who ? `${who}. ` : ''
  if (s.type === 'article') return { before: `${head}${year}. "${s.title}." `, italic: s.publisher, after: `${s.volume ? ` ${s.volume}` : ''}${s.pages ? `: ${s.pages}` : ''}.${url}` }
  return { before: `${head}${year}. `, italic: s.title, after: `.${place ? ` ${place}.` : ''}${url}` }
}

/** Sources cited in the document (or all sources), sorted like a bibliography. */
export function bibliographySources(doc: PMNode, all = false, sources = context.sources) {
  const cited = new Set<string>()
  doc.descendants((n) => {
    if (n.type.name === 'citation') cited.add(n.attrs.sourceId)
  })
  return Object.values(sources)
    .filter((s) => all || cited.has(s.id))
    .sort((a, b) => (authors(a)[0]?.last || a.title).localeCompare(authors(b)[0]?.last || b.title))
}

export const bibliographyHeading = (style = context.style) => CITATION_STYLES.find((c) => c.id === style)?.heading ?? 'Bibliography'

const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

function bibliographyHtml(doc: PMNode, heading: string | null) {
  const entries = bibliographySources(doc)
  const items = entries.length
    ? entries
        .map((s) => {
          const e = bibliographyEntry(s)
          return `<p class="bib-entry">${esc(e.before)}${e.italic ? `<em>${esc(e.italic)}</em>` : ''}${esc(e.after)}</p>`
        })
        .join('')
    : '<p class="bib-entry">There are no sources in the current document.</p>'
  return `${heading !== null ? `<h1 class="bib-heading">${esc(heading || bibliographyHeading())}</h1>` : ''}${items}`
}

// ---- Index ----

export type IndexEntry = { term: string; sub: string; pos: number }

export function collectIndexEntries(doc: PMNode): IndexEntry[] {
  const out: IndexEntry[] = []
  doc.descendants((n, pos) => {
    if (n.type.name === 'indexEntry') out.push({ term: n.attrs.term, sub: n.attrs.sub ?? '', pos })
  })
  return out
}

/** Index lines: terms (and subentries) in alphabetical order with their page numbers. */
export function indexLines(doc: PMNode) {
  const map = new Map<string, Map<string, Set<string>>>()
  for (const e of collectIndexEntries(doc)) {
    const term = e.term.trim()
    if (!term) continue
    const subs = map.get(term) ?? new Map<string, Set<string>>()
    const pages = subs.get(e.sub.trim()) ?? new Set<string>()
    pages.add(refPage(e.pos))
    subs.set(e.sub.trim(), pages)
    map.set(term, subs)
  }
  const sortPages = (p: Set<string>) => [...p].sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b)).join(', ')
  const lines: { text: string; pages: string; level: 0 | 1; letter: string }[] = []
  for (const term of [...map.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))) {
    const subs = map.get(term)!
    lines.push({ text: term, pages: subs.has('') ? sortPages(subs.get('')!) : '', level: 0, letter: term[0].toUpperCase() })
    for (const sub of [...subs.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b))) lines.push({ text: sub, pages: sortPages(subs.get(sub)!), level: 1, letter: term[0].toUpperCase() })
  }
  return lines
}

function indexHtml(doc: PMNode) {
  const lines = indexLines(doc)
  if (!lines.length) return '<p class="index-line">No index entries found.</p>'
  let letter = ''
  return lines
    .map((l) => {
      const head = l.level === 0 && l.letter !== letter ? ((letter = l.letter), `<p class="index-letter">${esc(l.letter)}</p>`) : ''
      return `${head}<p class="index-line index-level-${l.level}">${esc(l.text)}${l.pages ? `, ${esc(l.pages)}` : ''}</p>`
    })
    .join('')
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    citations: {
      insertCitation: (sourceId: string, pages?: string) => ReturnType
      insertBibliography: (heading?: string | null) => ReturnType
      markIndexEntry: (term: string, sub?: string) => ReturnType
      insertIndex: () => ReturnType
    }
  }
}

export const Citation = Node.create({
  name: 'citation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      sourceId: { default: '', parseHTML: (el) => el.getAttribute('data-source') ?? '', renderHTML: (a) => ({ 'data-source': a.sourceId }) },
      pages: { default: '', parseHTML: (el) => el.getAttribute('data-pages') ?? '', renderHTML: (a) => (a.pages ? { 'data-pages': a.pages } : {}) },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-citation]' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-citation': '', class: 'citation' }), citationText(node.attrs.sourceId, node.attrs.pages)]
  },
  renderText({ node }) {
    return citationText(node.attrs.sourceId, node.attrs.pages)
  },
})

export const Bibliography = Node.create({
  name: 'bibliography',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return { heading: { default: '', parseHTML: (el) => el.getAttribute('data-heading'), renderHTML: (a) => (a.heading == null ? { 'data-no-heading': '' } : { 'data-heading': a.heading }) } }
  },
  parseHTML() {
    return [{ tag: 'div[data-bibliography]', getAttrs: (el) => ({ heading: (el as HTMLElement).hasAttribute('data-no-heading') ? null : ((el as HTMLElement).getAttribute('data-heading') ?? '') }) }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-bibliography': '', class: 'bibliography', contenteditable: 'false' })]
  },
})

export const IndexEntryNode = Node.create({
  name: 'indexEntry',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      term: { default: '', parseHTML: (el) => el.getAttribute('data-term') ?? '', renderHTML: (a) => ({ 'data-term': a.term }) },
      sub: { default: '', parseHTML: (el) => el.getAttribute('data-sub') ?? '', renderHTML: (a) => (a.sub ? { 'data-sub': a.sub } : {}) },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-index-entry]' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    // Shown like a hidden XE field: only with formatting marks on.
    return ['span', mergeAttributes(HTMLAttributes, { 'data-index-entry': '', class: 'index-entry' }), `{ XE "${node.attrs.term}${node.attrs.sub ? `:${node.attrs.sub}` : ''}" }`]
  },
  renderText() {
    return ''
  },
})

export const IndexNode = Node.create({
  name: 'documentIndex',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return { columns: { default: 2, parseHTML: (el) => Number(el.getAttribute('data-columns') ?? 2), renderHTML: (a) => ({ 'data-columns': a.columns }) } }
  },
  parseHTML() {
    return [{ tag: 'div[data-document-index]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-document-index': '', class: 'document-index', contenteditable: 'false' })]
  },
})

/** Keeps citation texts, bibliographies and indexes up to date (also when sources or pages change). */
export const Citations = Extension.create({
  name: 'citations',

  addExtensions() {
    return [Citation, Bibliography, IndexEntryNode, IndexNode]
  },

  addCommands() {
    return {
      insertCitation:
        (sourceId, pages = '') =>
        ({ commands }) =>
          commands.insertContent({ type: 'citation', attrs: { sourceId, pages } }),
      insertBibliography:
        (heading = '') =>
        ({ commands }) =>
          commands.insertContent({ type: 'bibliography', attrs: { heading } }),
      markIndexEntry:
        (term, sub = '') =>
        ({ state, tr, dispatch }) => {
          const node = state.schema.nodes.indexEntry.create({ term, sub })
          if (dispatch) dispatch(tr.insert(state.selection.to, node))
          return true
        },
      insertIndex:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: 'documentIndex' }),
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('citationsRefresh'),
        view: () => ({
          update: (view) => {
            const doc = view.state.doc
            view.dom.querySelectorAll<HTMLElement>('[data-citation]').forEach((dom) => {
              const node = view.state.doc.nodeAt(view.posAtDOM(dom, 0))
              if (node?.type.name !== 'citation') return
              const text = citationText(node.attrs.sourceId, node.attrs.pages)
              if (dom.textContent !== text) dom.textContent = text
            })
            view.dom.querySelectorAll<HTMLElement>('[data-bibliography]').forEach((dom) => {
              const node = view.state.doc.nodeAt(view.posAtDOM(dom, 0))
              const html = bibliographyHtml(doc, node?.attrs.heading ?? '')
              if (dom.dataset.html !== html) {
                dom.innerHTML = html
                dom.dataset.html = html
              }
            })
            view.dom.querySelectorAll<HTMLElement>('[data-document-index]').forEach((dom) => {
              const html = indexHtml(doc)
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
