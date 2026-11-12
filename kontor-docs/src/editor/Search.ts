import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export type Range = { from: number; to: number }
export type SearchOptions = { matchCase?: boolean; wholeWord?: boolean; wildcards?: boolean }
type SearchState = { query: string; options: SearchOptions; current: number; matches: Range[]; decorations: DecorationSet }
type SearchMeta = { query?: string; current?: number; options?: SearchOptions }

export const searchKey = new PluginKey<SearchState>('search')

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}_]/u.test(c)

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Special characters of the Find box (^t tab, ^? any character, ^# digit, ^$ letter, ^w white space, ^^ caret). */
const SPECIAL: Record<string, string> = { t: '\\t', '?': '.', '#': '\\d', $: '\\p{L}', w: '\\s+', '^': '\\^', s: '\\u00A0', '-': '\\u00AD', '~': '\\u2011' }

/**
 * The search as a regular expression, or null for a plain text search. With "Use wildcards":
 * ? any character, * any text, [abc] [a-z] [!x] sets, < and > word start and end, {n,m} and @
 * repeats, ( ) groups for \1 … in the replacement, \ escapes the next character.
 */
export function searchRegExp(query: string, options: SearchOptions = {}): RegExp | null {
  const flags = `gu${options.matchCase ? '' : 'i'}`
  if (!options.wildcards) {
    if (!query.includes('^')) return null
    const source = query.split(/(\^.)/).map((part) => (part.length === 2 && part[0] === '^' && SPECIAL[part[1]] ? SPECIAL[part[1]] : escapeRe(part))).join('')
    return new RegExp(source, flags)
  }
  let out = ''
  for (let i = 0; i < query.length; i++) {
    const c = query[i]
    if (c === '\\' && i + 1 < query.length) out += escapeRe(query[++i])
    else if (c === '?') out += '.'
    else if (c === '*') out += '[^]*?'
    else if (c === '<') out += '(?<![\\p{L}\\p{N}_])'
    else if (c === '>') out += '(?![\\p{L}\\p{N}_])'
    else if (c === '@') out += '+'
    else if (c === '(' || c === ')') out += c
    else if (c === '{') {
      const end = query.indexOf('}', i)
      if (end < 0) out += '\\{'
      else {
        out += `{${query.slice(i + 1, end).replace(/\s/g, '')}}`
        i = end
      }
    } else if (c === '[') {
      const end = query.indexOf(']', i + 1)
      if (end < 0) out += '\\['
      else {
        const body = query.slice(i + 1, end)
        out += body.startsWith('!') ? `[^${body.slice(1).replace(/[\\\]]/g, '\\$&')}]` : `[${body.replace(/[\\\]]/g, '\\$&')}]`
        i = end
      }
    } else if (c === '^' && SPECIAL[query[i + 1]]) out += SPECIAL[query[++i]]
    else out += escapeRe(c)
  }
  try {
    return new RegExp(out, flags)
  } catch {
    return null
  }
}

/** The replacement text for one match: ^& is the found text, \1 … the wildcard groups, ^t a tab. */
export function expandReplacement(replacement: string, found: string, query: string, options: SearchOptions = {}) {
  const re = searchRegExp(query, options)
  const groups = re ? (new RegExp(`^(?:${re.source})$`, re.flags.replace('g', '')).exec(found) ?? []) : []
  return replacement.replace(/\^&|\^t|\^\^|\\(\d)/g, (m, n) => (m === '^&' ? found : m === '^t' ? '\t' : m === '^^' ? '^' : (groups[Number(n)] ?? '')))
}

/** Finds matches inside every textblock, also across formatting boundaries. */
export function findMatches(doc: PMNode, query: string, options: SearchOptions = {}): Range[] {
  const results: Range[] = []
  if (!query) return results
  const re = searchRegExp(query, options)
  const fold = (s: string) => (options.matchCase ? s : s.toLowerCase())
  const needle = fold(query)
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return
    let text = ''
    const map: number[] = []
    node.forEach((child, offset) => {
      const start = pos + 1 + offset
      if (child.isText && child.text) {
        for (let i = 0; i < child.text.length; i++) map.push(start + i)
        text += child.text
      } else {
        map.push(start)
        text += '￼'
      }
    })
    if (re) {
      for (const m of text.matchAll(re)) {
        if (!m[0].length) continue
        const i = m.index ?? 0
        const whole = !options.wholeWord || options.wildcards || (!isWordChar(text[i - 1]) && !isWordChar(text[i + m[0].length]))
        if (whole) results.push({ from: map[i], to: map[i + m[0].length - 1] + 1 })
      }
      return false
    }
    const haystack = fold(text)
    let i = haystack.indexOf(needle)
    while (i !== -1) {
      const whole = !options.wholeWord || (!isWordChar(text[i - 1]) && !isWordChar(text[i + needle.length]))
      if (whole) results.push({ from: map[i], to: map[i + needle.length - 1] + 1 })
      i = haystack.indexOf(needle, i + (whole ? needle.length : 1))
    }
    return false
  })
  return results
}

function build(doc: PMNode, query: string, current: number, options: SearchOptions): SearchState {
  const matches = findMatches(doc, query, options)
  const idx = matches.length ? Math.min(Math.max(current, 0), matches.length - 1) : -1
  const decorations = DecorationSet.create(
    doc,
    matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === idx ? 'search-hit is-current' : 'search-hit' })),
  )
  return { query, options, current: idx, matches, decorations }
}

export function getSearchState(state: EditorState) {
  return searchKey.getState(state) as SearchState
}

export const Search = Extension.create({
  name: 'search',

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: (_, { doc }) => build(doc, '', -1, {}),
          apply(tr, prev, _old, newState) {
            const meta = tr.getMeta(searchKey) as SearchMeta | undefined
            if (meta) return build(newState.doc, meta.query ?? prev.query, meta.current ?? 0, meta.options ?? prev.options)
            if (tr.docChanged && prev.query) return build(newState.doc, prev.query, prev.current, prev.options)
            return prev
          },
        },
        props: {
          decorations: (state) => searchKey.getState(state)?.decorations,
        },
      }),
    ]
  },
})
