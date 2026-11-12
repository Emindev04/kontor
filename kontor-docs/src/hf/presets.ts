import type { JSONContent } from '@tiptap/core'
import type { FieldKind } from '../editor/Fields'
import { tx } from '../i18n'

// Built-in header, footer and page number designs (the galleries of the Insert tab).

const text = (t: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'text', text: t, ...(marks ? { marks } : {}) })
const field = (kind: FieldKind): JSONContent => ({ type: 'field', attrs: { kind } })
const para = (content: JSONContent[], align?: 'left' | 'center' | 'right'): JSONContent => ({
  type: 'paragraph',
  attrs: align ? { textAlign: align } : {},
  content,
})
const doc = (...content: JSONContent[]): JSONContent => ({ type: 'doc', content })

const cell = (content: JSONContent[], align: 'left' | 'center' | 'right') => ({ type: 'tableCell', content: [para(content, align)] })
const columns = (parts: JSONContent[][]): JSONContent => ({
  type: 'table',
  attrs: { tableStyle: 'plain' },
  content: [{ type: 'tableRow', content: parts.map((p, i) => cell(p, (['left', 'center', 'right'] as const)[parts.length === 2 ? i * 2 : i])) }],
})

const placeholder = () => [text('[Type here]')]

export type Preset = { id: string; label: string; content: () => JSONContent }

export const HEADER_PRESETS: Preset[] = [
  { id: 'blank', label: tx('Blank'), content: () => doc(para([])) },
  { id: 'three', label: tx('Blank (Three Columns)'), content: () => doc(columns([placeholder(), placeholder(), placeholder()])) },
  { id: 'title', label: tx('Document Title'), content: () => doc(para([field('title')], 'center')) },
  { id: 'titleDate', label: tx('Title and Date'), content: () => doc(columns([[field('title')], [field('date')]])) },
  { id: 'line', label: tx('Title with Rule'), content: () => doc({ ...para([field('title')], 'right'), attrs: { textAlign: 'right', borders: 'b' } }) },
]

export const FOOTER_PRESETS: Preset[] = [
  { id: 'blank', label: tx('Blank'), content: () => doc(para([])) },
  { id: 'three', label: tx('Blank (Three Columns)'), content: () => doc(columns([placeholder(), placeholder(), placeholder()])) },
  { id: 'number', label: tx('Page Number'), content: () => doc(para([field('page')], 'center')) },
  { id: 'pageOf', label: tx('Page X of Y'), content: () => doc(para([text('Page '), field('page'), text(' of '), field('numPages')], 'right')) },
  { id: 'titlePage', label: tx('Title and Page Number'), content: () => doc(columns([[field('title')], [field('page')]])) },
]

export const PAGE_NUMBER_PRESETS: { id: string; label: string; content: () => JSONContent }[] = [
  { id: 'plain1', label: tx('Plain Number 1 (left)'), content: () => doc(para([field('page')], 'left')) },
  { id: 'plain2', label: tx('Plain Number 2 (center)'), content: () => doc(para([field('page')], 'center')) },
  { id: 'plain3', label: tx('Plain Number 3 (right)'), content: () => doc(para([field('page')], 'right')) },
  { id: 'pageOf', label: tx('Page X of Y'), content: () => doc(para([text('Page '), field('page'), text(' of '), field('numPages')], 'right')) },
  { id: 'bold', label: tx('Bold Numbers'), content: () => doc(para([field('page'), text(' | ', [{ type: 'bold' }]), text('Page')], 'right')) },
]

/** Removes page number fields from a header/footer. */
export function stripPageNumbers(content: JSONContent | null): JSONContent | null {
  if (!content) return content
  const walk = (node: JSONContent): JSONContent => ({
    ...node,
    content: node.content?.filter((c) => !(c.type === 'field' && (c.attrs?.kind === 'page' || c.attrs?.kind === 'numPages'))).map(walk),
  })
  return walk(content)
}

export function coverPage(kind: 'simple' | 'banded', title: string): JSONContent[] {
  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const blank = (): JSONContent => ({ type: 'paragraph' })
  if (kind === 'banded')
    return [
      { type: 'paragraph', attrs: { shading: '#2F5496', spaceBefore: 0, spaceAfter: 0 }, content: [] },
      { type: 'paragraph', attrs: { pStyle: 'title', shading: '#2F5496' }, content: [text(title || 'Document Title', [{ type: 'textStyle', attrs: { color: '#FFFFFF' } }])] },
      { type: 'paragraph', attrs: { pStyle: 'subtitle', shading: '#2F5496' }, content: [text('Document subtitle', [{ type: 'textStyle', attrs: { color: '#FFFFFF' } }])] },
      ...Array.from({ length: 12 }, blank),
      { type: 'paragraph', attrs: { textAlign: 'right' }, content: [text('Author name')] },
      { type: 'paragraph', attrs: { textAlign: 'right' }, content: [text(date)] },
      { type: 'pageBreak' },
    ]
  return [
    ...Array.from({ length: 8 }, blank),
    { type: 'paragraph', attrs: { pStyle: 'title', textAlign: 'center' }, content: [text(title || 'Document Title')] },
    { type: 'paragraph', attrs: { pStyle: 'subtitle', textAlign: 'center' }, content: [text('Document subtitle')] },
    ...Array.from({ length: 10 }, blank),
    { type: 'paragraph', attrs: { textAlign: 'center' }, content: [text('Author name · ' + date)] },
    { type: 'pageBreak' },
  ]
}

/**
 * The cover page at the start of a document: the blocks up to the first page break, when that page
 * holds a Title paragraph (as the built-in cover pages do). Returns the document range or null.
 */
export function coverPageRange(doc: import('@tiptap/pm/model').Node): { from: number; to: number } | null {
  let pos = 0
  let hasTitle = false
  for (let i = 0; i < doc.childCount && i < 60; i++) {
    const child = doc.child(i)
    if (child.type.name === 'pageBreak') return hasTitle ? { from: 0, to: pos + child.nodeSize } : null
    if (child.attrs.pStyle === 'title') hasTitle = true
    pos += child.nodeSize
  }
  return null
}
