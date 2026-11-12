import { Node, mergeAttributes, type JSONContent } from '@tiptap/core'

// Mail merge: «Merge Field» placeholders filled from a CSV recipient list.

export type MergeType = 'letters' | 'email' | 'envelopes' | 'labels' | 'directory' | 'normal'
/**
 * `excluded`: rows unchecked in Edit Recipient List. `fieldMap`: Match Fields, from the names the
 * Address Block and Greeting Line use to the list's own columns.
 */
export type MergeData = {
  columns: string[]
  rows: Record<string, string>[]
  preview: boolean
  record: number
  highlight: boolean
  source: string
  type: MergeType
  excluded: number[]
  fieldMap: Record<string, string>
}

let data: MergeData = { columns: [], rows: [], preview: false, record: 0, highlight: false, source: '', type: 'letters', excluded: [], fieldMap: {} }

/** The recipients that take part in the merge (checked in Edit Recipient List). */
export const includedRows = (d: MergeData = data) => d.rows.filter((_, i) => !d.excluded.includes(i))

/** Fields the Address Block and Greeting Line need, and the column names that usually hold them. */
export const MATCH_FIELDS: [string, string[]][] = [
  ['Title', ['Title', 'Courtesy Title']],
  ['First Name', ['First Name', 'FirstName', 'Given Name']],
  ['Last Name', ['Last Name', 'LastName', 'Surname', 'Family Name']],
  ['Company', ['Company', 'Company Name', 'Organization']],
  ['Address 1', ['Address Line 1', 'Address', 'Street', 'Address 1']],
  ['City', ['City', 'Town']],
  ['State', ['State', 'Province', 'Region']],
  ['Postal Code', ['ZIP Code', 'ZIP', 'Postal Code', 'Postcode']],
  ['Country', ['Country', 'Country or Region']],
  ['E-mail Address', ['E-mail Address', 'Email', 'E-mail', 'Email Address']],
]

/** The list column for a merge field name (from Match Fields, or the usual column names). */
export function matchedColumn(field: string, d: MergeData = data) {
  if (d.fieldMap[field]) return d.fieldMap[field]
  const names = MATCH_FIELDS.find(([f]) => f === field)?.[1] ?? [field]
  return d.columns.find((c) => names.some((n) => n.toLowerCase() === c.toLowerCase())) ?? null
}

/** Merge fields in the document that the recipient list has no column for (Check for Errors). */
export function missingFields(doc: JSONContent, d: MergeData = data) {
  const missing = new Set<string>()
  const walk = (n: JSONContent) => {
    if (n.type === 'mergeField' && !d.columns.includes(n.attrs?.name)) missing.add(String(n.attrs?.name))
    n.content?.forEach(walk)
  }
  walk(doc)
  return [...missing]
}

export function toCsv(columns: string[], rows: Record<string, string>[]) {
  const q = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return [columns.map(q).join(','), ...rows.map((r) => columns.map((c) => q(r[c] ?? '')).join(','))].join('\r\n')
}
const listeners = new Set<() => void>()

export const mergeStore = {
  get: () => data,
  set(patch: Partial<MergeData>) {
    data = { ...data, ...patch }
    listeners.forEach((l) => l())
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

/** Small RFC 4180 CSV parser (quotes, escaped quotes, newlines in quotes; comma, semicolon or tab). */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = [',', ';', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0]
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"' && field === '') quoted = true
    else if (c === delimiter) {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

export function loadRecipients(csv: string, source: string) {
  const [header, ...body] = parseCsv(csv.replace(/^﻿/, ''))
  if (!header) throw new Error('The list is empty.')
  const columns = header.map((h, i) => h.trim() || `Column ${i + 1}`)
  const rows = body.map((r) => Object.fromEntries(columns.map((c, i) => [c, (r[i] ?? '').trim()])))
  mergeStore.set({ columns, rows, record: 0, source, excluded: [], fieldMap: {} })
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mergeField: {
      insertMergeField: (name: string) => ReturnType
    }
  }
}

export const MergeField = Node.create({
  name: 'mergeField',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      name: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-merge-field'),
        renderHTML: (a) => ({ 'data-merge-field': a.name }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-merge-field]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'merge-field' }), `«${node.attrs.name}»`]
  },

  renderText({ node }) {
    return `«${node.attrs.name}»`
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span')
      dom.className = 'merge-field'
      const render = () => {
        const d = mergeStore.get()
        const row = d.rows[d.record]
        dom.textContent = d.preview && row ? (row[node.attrs.name] ?? '') : `«${node.attrs.name}»`
        dom.classList.toggle('is-highlighted', d.highlight)
        dom.classList.toggle('is-preview', d.preview)
      }
      render()
      const unsubscribe = mergeStore.subscribe(render)
      return { dom, destroy: unsubscribe }
    }
  },

  addCommands() {
    return {
      insertMergeField:
        (name) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { name } }),
    }
  },
})

/** Replaces merge fields with the values of one recipient, keeping their formatting. */
export function fillRecord(doc: JSONContent, row: Record<string, string>): JSONContent {
  const walk = (node: JSONContent): JSONContent | null => {
    if (node.type === 'mergeField') {
      const text = row[node.attrs?.name] ?? ''
      return text ? { type: 'text', text, ...(node.marks ? { marks: node.marks } : {}) } : null
    }
    if (!node.content) return node
    return { ...node, content: node.content.map(walk).filter((n): n is JSONContent => n != null) }
  }
  return walk(doc)!
}

/**
 * One document with every recipient's copy, separated by page breaks (letters), or one after the
 * other on the same pages (a directory, such as a phone list).
 */
export function mergeAll(doc: JSONContent, rows: Record<string, string>[], type: MergeType = 'letters'): JSONContent {
  const content: JSONContent[] = []
  rows.forEach((row, i) => {
    if (i > 0 && type !== 'directory') content.push({ type: 'pageBreak' })
    content.push(...(fillRecord(doc, row).content ?? []))
  })
  return { type: 'doc', content }
}
