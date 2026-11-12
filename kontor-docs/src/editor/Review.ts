import { Extension, Mark, mergeAttributes } from '@tiptap/core'
import type { Mark as PMMark, Node as PMNode, Schema } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { AddMarkStep, Mapping, RemoveMarkStep, ReplaceStep } from '@tiptap/pm/transform'
import { isHistoryTransaction } from '@tiptap/pm/history'
import { t, tx } from '../i18n'

// Review features: comment anchors and tracked changes (insertions and deletions).
//
// Comments are a mark that only carries the thread id; the thread itself (author, text, replies,
// resolved state) lives in the application state next to the document.
//
// Track Changes rewrites every user transaction while it is on: inserted text gets an insertion
// mark, and deleted text is put back with a deletion mark instead of disappearing. Text that was
// inserted while tracking and is deleted again simply goes away, like in the original.

export type CommentReply = { id: string; author: string; initials: string; date: string; text: string }
export type CommentThread = CommentReply & { resolved: boolean; replies: CommentReply[] }
export type Comments = Record<string, CommentThread>

export type ChangeKind = 'insertion' | 'deletion' | 'format'
/** `old`: for formatting changes, the text's formatting before the change (JSON of its marks). */
export type TrackedChange = { kind: ChangeKind; author: string; date: string; from: number; to: number; text: string; old?: string }

/** Marks that are not formatting: changing them is not a formatting change. */
const NON_FORMAT = new Set(['insertion', 'deletion', 'comment', 'formatChange', 'link'])
const formatMarks = (marks: readonly PMMark[]) => marks.filter((m) => !NON_FORMAT.has(m.type.name))
const marksJson = (marks: readonly PMMark[]) => JSON.stringify(formatMarks(marks).map((m) => m.toJSON()))

const MARK_LABELS: Record<string, string> = {
  bold: tx('Bold'), italic: tx('Italic'), underline: tx('Underline'), strike: tx('Strikethrough'), subscript: tx('Subscript'), superscript: tx('Superscript'), highlight: tx('Highlight'), code: tx('Code'),
}

/** "Formatted: Bold, Not Italic, Font color" for a formatting change, from the old and the current marks. */
export function describeFormat(old: string | undefined, current: readonly PMMark[]) {
  let before: { type: string; attrs?: Record<string, unknown> }[] = []
  try {
    before = JSON.parse(old ?? '[]')
  } catch {
    before = []
  }
  const now = formatMarks(current).map((m) => m.toJSON() as { type: string; attrs?: Record<string, unknown> })
  const parts: string[] = []
  const label = (type: string) => (MARK_LABELS[type] ? t(MARK_LABELS[type]) : type.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()))
  for (const m of now) {
    const prev = before.find((b) => b.type === m.type)
    if (!prev) parts.push(m.type === 'textStyle' ? styleText(m.attrs) : label(m.type))
    else if (JSON.stringify(prev.attrs ?? {}) !== JSON.stringify(m.attrs ?? {})) parts.push(m.type === 'textStyle' ? styleText(m.attrs, prev.attrs) : label(m.type))
  }
  for (const b of before) if (!now.some((m) => m.type === b.type)) parts.push(b.type === 'textStyle' ? t('Font: Default') : t('Not {format}', { format: label(b.type) }))
  return t('Formatted: {formats}', { formats: parts.filter(Boolean).join(', ') || t('Font') })
}

function styleText(attrs: Record<string, unknown> = {}, prev: Record<string, unknown> = {}) {
  const out: string[] = []
  if (attrs.fontFamily && attrs.fontFamily !== prev.fontFamily) out.push(t('Font: {name}', { name: String(attrs.fontFamily).split(',')[0].replace(/['"]/g, '') }))
  if (attrs.fontSize && attrs.fontSize !== prev.fontSize) out.push(t('Font size: {size}', { size: String(attrs.fontSize).replace('pt', ' pt') }))
  if (attrs.color && attrs.color !== prev.color) out.push(t('Font color'))
  if (attrs.backgroundColor && attrs.backgroundColor !== prev.backgroundColor) out.push(t('Shading'))
  return out.join(', ') || t('Font')
}

/** Skip meta: transactions that must not be tracked (accept/reject, loading documents). */
export const TRACK_SKIP = 'trackChangesSkip'

const AUTHOR_COLORS = ['#B4004E', '#2E74B5', '#5B8C2A', '#7030A0', '#C55A11', '#00808A', '#A6762A', '#C00000']

/** A stable color per author name, like the original's reviewer colors. */
export function authorColor(author: string) {
  let h = 0
  for (const c of author) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return AUTHOR_COLORS[h % AUTHOR_COLORS.length]
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?'

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

// ---- Marks ----

export const CommentMark = Mark.create({
  name: 'comment',
  inclusive: false,
  excludes: '',
  spanning: true,
  addAttributes() {
    return {
      id: { default: null, parseHTML: (el) => el.getAttribute('data-comment'), renderHTML: (a) => ({ 'data-comment': a.id }) },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-comment]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'comment-anchor' }), 0]
  },
})

const revisionAttrs = () => ({
  author: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-author') ?? '', renderHTML: (a: Record<string, string>) => ({ 'data-author': a.author, style: `--tc: ${authorColor(a.author ?? '')}` }) },
  date: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-date') ?? '', renderHTML: (a: Record<string, string>) => ({ 'data-date': a.date }) },
})

export const InsertionMark = Mark.create({
  name: 'insertion',
  inclusive: false,
  excludes: 'insertion deletion',
  addAttributes: revisionAttrs,
  parseHTML() {
    return [{ tag: 'ins' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['ins', mergeAttributes(HTMLAttributes, { class: 'tc-ins' }), 0]
  },
})

/** Text whose formatting changed while tracking; `old` keeps the formatting it had before. */
export const FormatChangeMark = Mark.create({
  name: 'formatChange',
  inclusive: false,
  excludes: 'formatChange',
  addAttributes() {
    return {
      ...revisionAttrs(),
      old: { default: '[]', parseHTML: (el: HTMLElement) => el.getAttribute('data-old') ?? '[]', renderHTML: (a: Record<string, string>) => ({ 'data-old': a.old }) },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-format-change]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-format-change': '', class: 'tc-fmt' }), 0]
  },
})

export const DeletionMark = Mark.create({
  name: 'deletion',
  inclusive: false,
  excludes: 'insertion deletion',
  addAttributes: revisionAttrs,
  parseHTML() {
    return [{ tag: 'del' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['del', mergeAttributes(HTMLAttributes, { class: 'tc-del' }), 0]
  },
})

// ---- Queries ----

/** All tracked changes in document order; neighbouring runs of the same kind and author are merged. */
export function collectChanges(doc: PMNode): TrackedChange[] {
  const out: TrackedChange[] = []
  doc.descendants((node, pos) => {
    if (!node.isText) return
    const mark = node.marks.find((m) => m.type.name === 'insertion' || m.type.name === 'deletion') ?? node.marks.find((m) => m.type.name === 'formatChange')
    if (!mark) return
    const kind = (mark.type.name === 'formatChange' ? 'format' : mark.type.name) as ChangeKind
    const last = out[out.length - 1]
    if (last && last.kind === kind && last.author === mark.attrs.author && last.to === pos && (kind !== 'format' || last.old === mark.attrs.old)) {
      last.to = pos + node.nodeSize
      last.text += node.text
    } else out.push({ kind, author: mark.attrs.author, date: mark.attrs.date, from: pos, to: pos + node.nodeSize, text: node.text ?? '', ...(kind === 'format' ? { old: mark.attrs.old as string } : {}) })
  })
  return out
}

/** Document range of every comment anchor, keyed by thread id. */
export function commentRanges(doc: PMNode) {
  const ranges = new Map<string, { from: number; to: number }>()
  doc.descendants((node, pos) => {
    if (!node.isText) return
    for (const m of node.marks) {
      if (m.type.name !== 'comment' || !m.attrs.id) continue
      const r = ranges.get(m.attrs.id)
      if (r) r.to = pos + node.nodeSize
      else ranges.set(m.attrs.id, { from: pos, to: pos + node.nodeSize })
    }
  })
  return ranges
}

/** Comment ids at a position (the cursor or the start of the selection). */
export function commentsAt(state: EditorState) {
  const { from, to, empty } = state.selection
  const ids = new Set<string>()
  const add = (marks: readonly PMMark[]) => marks.forEach((m) => m.type.name === 'comment' && ids.add(m.attrs.id))
  if (empty) {
    const $pos = state.doc.resolve(from)
    add($pos.nodeBefore?.marks ?? [])
    add($pos.nodeAfter?.marks ?? [])
  } else state.doc.nodesBetween(from, to, (n) => void (n.isText && add(n.marks)))
  return [...ids]
}

/** The tracked change at the selection, if any. */
export function changeAt(state: EditorState): TrackedChange | null {
  const { from, to } = state.selection
  return collectChanges(state.doc).find((c) => c.from <= to && c.to >= from) ?? null
}

// ---- Track Changes ----

type TrackState = { enabled: boolean }
export const trackKey = new PluginKey<TrackState>('trackChanges')

export const isTracking = (state: EditorState) => !!trackKey.getState(state)?.enabled

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    review: {
      setTrackChanges: (enabled: boolean) => ReturnType
      addComment: (id: string) => ReturnType
      removeComment: (id: string) => ReturnType
      acceptChange: (change: TrackedChange) => ReturnType
      rejectChange: (change: TrackedChange) => ReturnType
      acceptAllChanges: () => ReturnType
      rejectAllChanges: () => ReturnType
    }
  }
}

function resolveChange(tr: Transaction, schema: Schema, change: TrackedChange, accept: boolean) {
  if (change.kind === 'format') {
    const from = tr.mapping.map(change.from, 1)
    const to = tr.mapping.map(change.to, -1)
    if (to <= from) return
    if (!accept) {
      // Reject: the text gets back the formatting it had before.
      const spans: { s: number; e: number; old: string }[] = []
      tr.doc.nodesBetween(from, to, (node, pos) => {
        const m = node.isText ? node.marks.find((x) => x.type.name === 'formatChange') : null
        if (m) spans.push({ s: Math.max(pos, from), e: Math.min(pos + node.nodeSize, to), old: m.attrs.old as string })
      })
      for (const { s, e, old } of spans) {
        for (const name of Object.keys(schema.marks)) if (!NON_FORMAT.has(name)) tr.removeMark(s, e, schema.marks[name])
        try {
          for (const json of JSON.parse(old) as { type: string; attrs?: Record<string, unknown> }[]) if (schema.marks[json.type]) tr.addMark(s, e, schema.marks[json.type].create(json.attrs))
        } catch {
          // Unreadable old formatting: the text keeps its current formatting.
        }
      }
    }
    tr.removeMark(from, to, schema.marks.formatChange)
    return
  }
  const removeText = accept ? change.kind === 'deletion' : change.kind === 'insertion'
  const from = tr.mapping.map(change.from, 1)
  const to = tr.mapping.map(change.to, -1)
  if (to <= from) return
  if (removeText) tr.delete(from, to)
  else tr.removeMark(from, to, schema.marks[change.kind])
}

// Edits made in quick succession share one timestamp, so their marks merge into one revision.
let lastEdit = { author: '', time: 0, iso: '' }
function sessionDate(author: string) {
  const now = Date.now()
  if (lastEdit.author !== author || now - lastEdit.time > 60_000) lastEdit = { author, time: now, iso: new Date(now).toISOString() }
  else lastEdit.time = now
  return lastEdit.iso
}

/** Rewrites the replace steps of a user transaction into tracked insertions and deletions. */
function trackTransactions(trs: readonly Transaction[], oldState: EditorState, newState: EditorState, author: string): Transaction | null {
  const { schema } = newState
  const insType = schema.marks.insertion
  const delType = schema.marks.deletion
  const tr = newState.tr
  const date = sessionDate(author)
  let changed = false
  let formatted = false
  let cursor: number | null = null

  trs.forEach((t, ti) => {
    if (!t.docChanged || t.getMeta(TRACK_SKIP) || isHistoryTransaction(t) || t.getMeta('pagination')) return
    const later = new Mapping()
    for (let j = ti + 1; j < trs.length; j++) later.appendMapping(trs[j].mapping)
    t.steps.forEach((step, si) => {
      if ((step instanceof AddMarkStep || step instanceof RemoveMarkStep) && !NON_FORMAT.has((step as unknown as { mark: PMMark }).mark.type.name)) {
        // Formatting change: remember each piece of text's formatting from before the first change.
        const { from, to } = step as unknown as { from: number; to: number }
        const before = t.docs[si]
        const rest = new Mapping(t.mapping.maps.slice(si + 1))
        rest.appendMapping(later)
        rest.appendMapping(tr.mapping)
        const fmtType = schema.marks.formatChange
        before.nodesBetween(from, to, (node, pos) => {
          if (!node.isText || node.marks.some((m) => m.type === insType || m.type === delType)) return
          const s = rest.map(Math.max(pos, from), 1)
          const e = rest.map(Math.min(pos + node.nodeSize, to), -1)
          if (e <= s) return
          const existing = node.marks.find((m) => m.type === fmtType)
          const old = existing ? (existing.attrs.old as string) : marksJson(node.marks)
          tr.addMark(s, e, fmtType.create({ author, date, old }))
          changed = formatted = true
        })
        return
      }
      if (!(step instanceof ReplaceStep)) return
      const { from, to, slice } = step as unknown as { from: number; to: number; slice: import('@tiptap/pm/model').Slice }
      const before = t.docs[si]
      // Replacing the whole document means a document was loaded, not edited.
      if (from === 0 && to === before.content.size) return
      const rest = new Mapping(t.mapping.maps.slice(si + 1))
      rest.appendMapping(later)
      rest.appendMapping(tr.mapping)
      if (slice.size) {
        const a = rest.map(from, -1)
        const b = rest.map(from + slice.size, 1)
        if (b > a) {
          tr.removeMark(a, b, delType)
          tr.addMark(a, b, insType.create({ author, date }))
          changed = true
        }
      }
      if (to <= from) return
      const deleted = before.slice(from, to)
      if (!deleted.content.size) return
      const at = rest.map(from, -1)
      const mapsBefore = tr.mapping.maps.length
      tr.replace(at, at, deleted)
      if (tr.mapping.maps.length === mapsBefore) return
      const end = tr.mapping.maps[tr.mapping.maps.length - 1].map(at, 1)
      // Text the reviewer inserted themselves really goes; everything else is marked as deleted.
      const drop: [number, number][] = []
      tr.doc.nodesBetween(at, end, (node, pos) => {
        if (!node.isText) return
        const s = Math.max(pos, at)
        const e = Math.min(pos + node.nodeSize, end)
        if (node.marks.some((m) => m.type === insType)) drop.push([s, e])
        else if (!node.marks.some((m) => m.type === delType)) tr.addMark(s, e, delType.create({ author, date }))
      })
      let removed = 0
      for (const [s, e] of drop.reverse()) {
        tr.delete(s, e)
        removed += e - s
      }
      changed = true
      // Backspace leaves the cursor in front of the struck text, Delete behind it.
      const old = oldState.selection
      if (!slice.size && old.empty && trs.length === 1 && t.steps.length === 1) cursor = old.head === to ? at : end - removed
      else if (!slice.size && !old.empty) cursor = end - removed
    })
  })
  if (!changed) return null
  // Formatting that was changed back to how it was is no longer a change.
  const fmtType = schema.marks.formatChange
  if (formatted)
    tr.doc.descendants((node, pos) => {
      const m = node.isText ? node.marks.find((x) => x.type === fmtType) : null
      if (m && m.attrs.old === marksJson(node.marks)) tr.removeMark(pos, pos + node.nodeSize, fmtType)
    })
  if (cursor != null) tr.setSelection(TextSelection.create(tr.doc, Math.min(cursor, tr.doc.content.size)))
  return tr.setMeta(TRACK_SKIP, true).setMeta('addToHistory', true)
}

export const Review = Extension.create<{ getAuthor: () => string }>({
  name: 'review',

  addOptions() {
    return { getAuthor: () => t('Author') }
  },

  addExtensions() {
    return [CommentMark, InsertionMark, DeletionMark, FormatChangeMark]
  },

  addCommands() {
    return {
      setTrackChanges:
        (enabled) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(trackKey, { enabled }).setMeta(TRACK_SKIP, true)
          return true
        },
      addComment:
        (id) =>
        ({ tr, state, dispatch }) => {
          const { from, to, empty } = state.selection
          let a = from
          let b = to
          if (empty) {
            // Like the original: without a selection the comment anchors to the word at the cursor.
            const $pos = state.doc.resolve(from)
            const text = $pos.parent.textContent
            const offset = $pos.parentOffset
            let s = offset
            let e = offset
            while (s > 0 && /[\p{L}\p{N}_'-]/u.test(text[s - 1])) s--
            while (e < text.length && /[\p{L}\p{N}_'-]/u.test(text[e])) e++
            if (e === s && e < text.length) e++
            else if (e === s && s > 0) s--
            a = $pos.start() + s
            b = $pos.start() + e
          }
          if (b <= a) return false
          if (dispatch) tr.addMark(a, b, state.schema.marks.comment.create({ id })).setMeta(TRACK_SKIP, true)
          return true
        },
      removeComment:
        (id) =>
        ({ tr, state, dispatch }) => {
          const type = state.schema.marks.comment
          state.doc.descendants((node, pos) => {
            const mark = node.isText && node.marks.find((m) => m.type === type && m.attrs.id === id)
            if (mark) tr.removeMark(pos, pos + node.nodeSize, mark)
          })
          if (dispatch) tr.setMeta(TRACK_SKIP, true)
          return true
        },
      acceptChange:
        (change) =>
        ({ tr, state, dispatch }) => {
          if (dispatch) resolveChange(tr.setMeta(TRACK_SKIP, true), state.schema, change, true)
          return true
        },
      rejectChange:
        (change) =>
        ({ tr, state, dispatch }) => {
          if (dispatch) resolveChange(tr.setMeta(TRACK_SKIP, true), state.schema, change, false)
          return true
        },
      acceptAllChanges:
        () =>
        ({ tr, state, dispatch }) => {
          if (dispatch) {
            tr.setMeta(TRACK_SKIP, true)
            for (const c of collectChanges(state.doc)) resolveChange(tr, state.schema, c, true)
          }
          return true
        },
      rejectAllChanges:
        () =>
        ({ tr, state, dispatch }) => {
          if (dispatch) {
            tr.setMeta(TRACK_SKIP, true)
            for (const c of collectChanges(state.doc)) resolveChange(tr, state.schema, c, false)
          }
          return true
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-e': () => this.editor.commands.setTrackChanges(!isTracking(this.editor.state)),
    }
  },

  addProseMirrorPlugins() {
    const getAuthor = () => this.options.getAuthor()
    return [
      new Plugin<TrackState>({
        key: trackKey,
        state: {
          init: () => ({ enabled: false }),
          apply: (tr, prev) => (tr.getMeta(trackKey) as TrackState | undefined) ?? prev,
        },
        appendTransaction: (trs, oldState, newState) => (isTracking(newState) ? trackTransactions(trs, oldState, newState, getAuthor()) : null),
      }),
    ]
  },
})
