import { Node, mergeAttributes, type JSONContent } from '@tiptap/core'
import { t, tx } from '../i18n'

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
  if (!header) throw new Error(t('The list is empty.'))
  const columns = header.map((h, i) => h.trim() || t('Column {n}', { n: i + 1 }))
  const rows = body.map((r) => Object.fromEntries(columns.map((c, i) => [c, (r[i] ?? '').trim()])))
  mergeStore.set({ columns, rows, record: 0, source, excluded: [], fieldMap: {} })
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mergeField: {
      insertMergeField: (name: string) => ReturnType
    }
    mergeRule: {
      insertMergeRule: (attrs: Partial<RuleAttrs>) => ReturnType
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

// ---- Rules (Mailings › Rules) ----

export type RuleKind = 'if' | 'recordNumber' | 'sequence' | 'nextRecord' | 'nextRecordIf' | 'fillIn'
export type RuleOperator = 'eq' | 'ne' | 'lt' | 'gt' | 'le' | 'ge' | 'empty' | 'notEmpty'
export type RuleAttrs = { kind: RuleKind; field: string; op: RuleOperator; value: string; then: string; otherwise: string; prompt: string; id: string }

export const RULE_OPERATORS: { id: RuleOperator; label: string; code: string }[] = [
  { id: 'eq', label: tx('Equal to'), code: '=' },
  { id: 'ne', label: tx('Not equal to'), code: '<>' },
  { id: 'lt', label: tx('Less than'), code: '<' },
  { id: 'gt', label: tx('Greater than'), code: '>' },
  { id: 'le', label: tx('Less than or equal'), code: '<=' },
  { id: 'ge', label: tx('Greater than or equal'), code: '>=' },
  { id: 'empty', label: tx('Is blank'), code: '= ""' },
  { id: 'notEmpty', label: tx('Is not blank'), code: '<> ""' },
]

/** Compares a field value with the rule's value (as numbers when both are numbers). */
export function ruleMatches(actual: string, op: RuleOperator, expected: string): boolean {
  const a = actual.trim()
  const b = expected.trim()
  const na = Number(a)
  const nb = Number(b)
  const numeric = a !== '' && b !== '' && !isNaN(na) && !isNaN(nb)
  const cmp = numeric ? na - nb : a.localeCompare(b, undefined, { sensitivity: 'accent' })
  switch (op) {
    case 'eq': return cmp === 0
    case 'ne': return cmp !== 0
    case 'lt': return cmp < 0
    case 'gt': return cmp > 0
    case 'le': return cmp <= 0
    case 'ge': return cmp >= 0
    case 'empty': return a === ''
    case 'notEmpty': return a !== ''
  }
}

/** The field code a rule shows when results are not previewed. */
export function ruleCode(a: RuleAttrs): string {
  const op = RULE_OPERATORS.find((o) => o.id === a.op)?.code ?? '='
  const cond = a.op === 'empty' || a.op === 'notEmpty' ? `${a.field} ${op}` : `${a.field} ${op} "${a.value}"`
  switch (a.kind) {
    case 'if': return `«IF ${cond} "${a.then}" "${a.otherwise}"»`
    case 'recordNumber': return '«MERGEREC»'
    case 'sequence': return '«MERGESEQ»'
    case 'nextRecord': return '«NEXT»'
    case 'nextRecordIf': return `«NEXTIF ${cond}»`
    case 'fillIn': return `«FILLIN "${a.prompt}"»`
  }
}

/** State of one merged copy: the current recipient, its number and the answers to Fill-in prompts. */
export type MergeContext = { rows: Record<string, string>[]; index: number; sequence: number; answers?: Record<string, string>; all?: Record<string, string>[] }

/** The text a rule produces for the current recipient (and moves to the next one for Next Record). */
export function ruleText(a: RuleAttrs, ctx: MergeContext): string {
  const row = ctx.rows[ctx.index] ?? {}
  switch (a.kind) {
    case 'if': return ruleMatches(row[a.field] ?? '', a.op, a.value) ? a.then : a.otherwise
    case 'recordNumber': {
      const n = (ctx.all ?? data.rows).indexOf(row)
      return String(n >= 0 ? n + 1 : ctx.index + 1)
    }
    case 'sequence': return String(ctx.sequence)
    case 'nextRecord':
      if (ctx.index < ctx.rows.length - 1) ctx.index++
      return ''
    case 'nextRecordIf':
      if (ruleMatches(row[a.field] ?? '', a.op, a.value) && ctx.index < ctx.rows.length - 1) ctx.index++
      return ''
    case 'fillIn': return ctx.answers?.[a.id] ?? a.value
  }
}

/** Replaces merge fields and rules with the values of the current recipient, keeping their formatting. */
export function fillWith(doc: JSONContent, ctx: MergeContext): JSONContent {
  const walk = (node: JSONContent): JSONContent | null => {
    if (node.type === 'mergeField') {
      const text = ctx.rows[ctx.index]?.[node.attrs?.name] ?? ''
      return text ? { type: 'text', text, ...(node.marks ? { marks: node.marks } : {}) } : null
    }
    if (node.type === 'mergeRule') {
      const text = ruleText(node.attrs as RuleAttrs, ctx)
      return text ? { type: 'text', text, ...(node.marks ? { marks: node.marks } : {}) } : null
    }
    if (!node.content) return node
    return { ...node, content: node.content.map(walk).filter((n): n is JSONContent => n != null) }
  }
  return walk(doc)!
}

/** Replaces merge fields with the values of one recipient, keeping their formatting. */
export function fillRecord(doc: JSONContent, row: Record<string, string>, answers?: Record<string, string>): JSONContent {
  return fillWith(doc, { rows: [row], index: 0, sequence: 1, answers })
}

/** Fill-in rules of a document (asked once before merging). */
export function fillInRules(doc: JSONContent): RuleAttrs[] {
  const out: RuleAttrs[] = []
  const walk = (n: JSONContent) => {
    if (n.type === 'mergeRule' && n.attrs?.kind === 'fillIn') out.push(n.attrs as RuleAttrs)
    n.content?.forEach(walk)
  }
  walk(doc)
  return out
}

/**
 * One document with every recipient's copy, separated by page breaks (letters), or one after the
 * other on the same pages (a directory, such as a phone list). Next Record rules put several
 * recipients into one copy.
 */
export function mergeAll(doc: JSONContent, rows: Record<string, string>[], type: MergeType = 'letters', answers?: Record<string, string>): JSONContent {
  const content: JSONContent[] = []
  let sequence = 0
  for (let i = 0; i < rows.length; i++) {
    sequence++
    const ctx: MergeContext = { rows, index: i, sequence, answers }
    if (sequence > 1 && type !== 'directory') content.push({ type: 'pageBreak' })
    content.push(...(fillWith(doc, ctx).content ?? []))
    i = ctx.index
  }
  return { type: 'doc', content }
}

export const MergeRule = Node.create({
  name: 'mergeRule',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    const str = (name: keyof RuleAttrs, def: string) => ({
      default: def,
      parseHTML: (el: HTMLElement) => el.getAttribute(`data-rule-${name}`) ?? def,
      renderHTML: (a: Record<string, unknown>) => (a[name] ? { [`data-rule-${name}`]: String(a[name]) } : {}),
    })
    return {
      kind: str('kind', 'if'),
      field: str('field', ''),
      op: str('op', 'eq'),
      value: str('value', ''),
      then: str('then', ''),
      otherwise: str('otherwise', ''),
      prompt: str('prompt', ''),
      id: str('id', ''),
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-merge-rule]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-merge-rule': '', class: 'merge-field merge-rule' }), ruleCode(node.attrs as RuleAttrs)]
  },

  renderText({ node }) {
    return ruleCode(node.attrs as RuleAttrs)
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span')
      dom.className = 'merge-field merge-rule'
      const render = () => {
        const d = mergeStore.get()
        const a = node.attrs as RuleAttrs
        const shown = d.preview && d.rows[d.record] && a.kind !== 'nextRecord' && a.kind !== 'nextRecordIf'
        dom.textContent = shown ? ruleText(a, { rows: d.rows, index: d.record, sequence: includedRows(d).indexOf(d.rows[d.record]) + 1 || 1, all: d.rows }) : ruleCode(a)
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
      insertMergeRule:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    }
  },
})
