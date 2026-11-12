import type { JSONContent } from '@tiptap/core'

// Review > Compare: builds a "compared document" from an original and a revised version. Paragraphs
// are aligned first, then changed paragraphs are compared word by word; differences come out as
// tracked insertions and deletions.

type Tok = { text: string; marks?: JSONContent['marks']; node?: JSONContent }
type Op = { op: 'eq' | 'del' | 'ins'; a?: Tok; b?: Tok }

const TEXTBLOCKS = new Set(['paragraph', 'heading'])

const blockText = (n: JSONContent): string => (n.content ?? []).map((c) => (c.type === 'text' ? c.text : c.type === 'hardBreak' ? '\n' : '￼')).join('')

function tokens(n: JSONContent): Tok[] {
  const out: Tok[] = []
  for (const c of n.content ?? []) {
    if (c.type === 'text') {
      for (const part of (c.text ?? '').match(/\s+|[\p{L}\p{N}_'’-]+|[^\s\p{L}\p{N}]/gu) ?? []) out.push({ text: part, marks: c.marks })
    } else out.push({ text: `￼${JSON.stringify(c)}`, node: c })
  }
  return out
}

/** Longest common subsequence diff of two sequences, compared with `eq`. */
export function diff<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): { op: 'eq' | 'del' | 'ins'; i: number; j: number }[] {
  // Trim the common prefix and suffix first: most edits are local.
  let start = 0
  while (start < a.length && start < b.length && eq(a[start], b[start])) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && eq(a[endA - 1], b[endB - 1])) {
    endA--
    endB--
  }
  const n = endA - start
  const m = endB - start
  const ops: { op: 'eq' | 'del' | 'ins'; i: number; j: number }[] = []
  for (let k = 0; k < start; k++) ops.push({ op: 'eq', i: k, j: k })
  if (n * m > 4_000_000) {
    // Too large for the table: treat the middle as replaced.
    for (let i = 0; i < n; i++) ops.push({ op: 'del', i: start + i, j: -1 })
    for (let j = 0; j < m; j++) ops.push({ op: 'ins', i: -1, j: start + j })
  } else {
    const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = eq(a[start + i], b[start + j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
    let i = 0
    let j = 0
    while (i < n || j < m) {
      if (i < n && j < m && eq(a[start + i], b[start + j])) {
        ops.push({ op: 'eq', i: start + i, j: start + j })
        i++
        j++
      } else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) {
        ops.push({ op: 'ins', i: -1, j: start + j })
        j++
      } else {
        ops.push({ op: 'del', i: start + i, j: -1 })
        i++
      }
    }
  }
  for (let k = 0; k < a.length - endA; k++) ops.push({ op: 'eq', i: endA + k, j: endB + k })
  return ops
}

function withMark(marks: JSONContent['marks'], mark: { type: string; attrs: Record<string, unknown> }) {
  return [...(marks ?? []).filter((m) => m.type !== 'insertion' && m.type !== 'deletion'), mark]
}

function inline(ops: Op[], ins: { type: string; attrs: Record<string, unknown> }, del: { type: string; attrs: Record<string, unknown> }): JSONContent[] {
  const out: JSONContent[] = []
  for (const o of ops) {
    const tok = o.op === 'del' ? o.a! : o.b!
    const marks = o.op === 'eq' ? tok.marks : withMark(tok.marks, o.op === 'ins' ? ins : del)
    if (tok.node) {
      out.push(o.op === 'eq' ? tok.node : { ...tok.node, marks: withMark(tok.node.marks, o.op === 'ins' ? ins : del) })
      continue
    }
    const last = out[out.length - 1]
    if (last?.type === 'text' && JSON.stringify(last.marks ?? null) === JSON.stringify(marks?.length ? marks : null)) last.text += tok.text
    else out.push({ type: 'text', text: tok.text, ...(marks?.length ? { marks } : {}) })
  }
  return out
}

function markAll(n: JSONContent, mark: { type: string; attrs: Record<string, unknown> }): JSONContent {
  return { ...n, content: (n.content ?? []).map((c) => (c.type === 'text' || c.type === 'image' || c.type === 'field' ? { ...c, marks: withMark(c.marks, mark) } : c)) }
}

type Slot = { node: JSONContent; parent: JSONContent[] }

function collect(doc: JSONContent): Slot[] {
  const out: Slot[] = []
  const walk = (n: JSONContent) => {
    for (const c of n.content ?? []) {
      if (TEXTBLOCKS.has(c.type ?? '')) out.push({ node: c, parent: n.content! })
      else if (c.content) walk(c)
    }
  }
  walk(doc)
  return out
}

/** Returns the revised document with the differences to the original as tracked changes. */
export function compareDocuments(original: JSONContent, revised: JSONContent, author: string): { doc: JSONContent; changes: number } {
  const date = new Date().toISOString()
  const ins = { type: 'insertion', attrs: { author, date } }
  const del = { type: 'deletion', attrs: { author, date } }
  const result: JSONContent = JSON.parse(JSON.stringify(revised))
  const a = collect(original)
  const b = collect(result)
  const ta = a.map((s) => blockText(s.node))
  const tb = b.map((s) => blockText(s.node))
  const ops = diff(ta, tb, (x, y) => x === y)
  let changes = 0
  const pendingDeleted: JSONContent[] = []
  const flushBefore = (slot: Slot | undefined) => {
    if (!pendingDeleted.length) return
    if (slot) slot.parent.splice(slot.parent.indexOf(slot.node), 0, ...pendingDeleted)
    else (result.content ??= []).push(...pendingDeleted)
    pendingDeleted.length = 0
  }

  // Unmatched paragraphs between two equal ones are paired up as "modified" where possible.
  for (let k = 0; k < ops.length; ) {
    if (ops[k].op === 'eq') {
      flushBefore(b[ops[k].j])
      k++
      continue
    }
    const dels: number[] = []
    const inss: number[] = []
    while (k < ops.length && ops[k].op !== 'eq') {
      if (ops[k].op === 'del') dels.push(ops[k].i)
      else inss.push(ops[k].j)
      k++
    }
    const pairs = Math.min(dels.length, inss.length)
    for (let p = 0; p < pairs; p++) {
      const oa = a[dels[p]].node
      const slot = b[inss[p]]
      flushBefore(slot)
      const tA = tokens(oa)
      const tB = tokens(slot.node)
      const wordOps = diff(tA, tB, (x, y) => x.text === y.text).map((o): Op => ({ op: o.op, a: o.i >= 0 ? tA[o.i] : undefined, b: o.j >= 0 ? tB[o.j] : undefined }))
      changes += wordOps.filter((o) => o.op !== 'eq' && !/^\s+$/.test((o.a ?? o.b)!.text)).length
      slot.node.content = inline(wordOps, ins, del)
      if (!slot.node.content.length) delete slot.node.content
    }
    for (let p = pairs; p < dels.length; p++) {
      pendingDeleted.push(markAll(JSON.parse(JSON.stringify(a[dels[p]].node)), del))
      changes++
    }
    for (let p = pairs; p < inss.length; p++) {
      const slot = b[inss[p]]
      flushBefore(slot)
      Object.assign(slot.node, markAll(slot.node, ins))
      changes++
    }
  }
  flushBefore(undefined)
  return { doc: result, changes }
}
