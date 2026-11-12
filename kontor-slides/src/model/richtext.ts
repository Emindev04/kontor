import type { Inline, Mark, Para, ParaAttrs, RichDoc, TextAlign } from './types'
import { resolveColor, type ThemeColors } from './color'
import { fontStack } from './themes'

/** Everything needed to turn a stored document into styled HTML. */
export type TextCtx = {
  sizes: number[]
  font: string
  color: string
  bold?: boolean
  align: TextAlign
  bullets: boolean
  bulletChar: string
  lineHeight: number
  spaceBefore: number[]
  colors: ThemeColors
  slideNumber: number
  dateText: string
  caps?: boolean
}

export type TextStyleAttrs = Extract<Mark, { type: 'textStyle' }>['attrs']

export const LEVEL_INDENT = 48
export const BULLET_INDENT = 24
export const LINE_FACTOR = 1.2

export const NUMBER_SCHEMES: { id: string; label: string; sample: (n: number) => string }[] = [
  { id: 'arabicPeriod', label: '1. 2. 3.', sample: (n) => `${n}.` },
  { id: 'arabicParenR', label: '1) 2) 3)', sample: (n) => `${n})` },
  { id: 'romanUcPeriod', label: 'I. II. III.', sample: (n) => `${toRoman(n)}.` },
  { id: 'alphaUcPeriod', label: 'A. B. C.', sample: (n) => `${toAlpha(n)}.` },
  { id: 'alphaUcParenR', label: 'A) B) C)', sample: (n) => `${toAlpha(n)})` },
  { id: 'alphaLcParenR', label: 'a) b) c)', sample: (n) => `${toAlpha(n).toLowerCase()})` },
  { id: 'alphaLcPeriod', label: 'a. b. c.', sample: (n) => `${toAlpha(n).toLowerCase()}.` },
  { id: 'romanLcPeriod', label: 'i. ii. iii.', sample: (n) => `${toRoman(n).toLowerCase()}.` },
]

export const BULLET_CHARS: { char: string; label: string }[] = [
  { char: '•', label: 'Filled Round Bullets' },
  { char: 'o', label: 'Hollow Round Bullets' },
  { char: '▪', label: 'Filled Square Bullets' },
  { char: '□', label: 'Hollow Square Bullets' },
  { char: '➢', label: 'Star Bullets' },
  { char: '➔', label: 'Arrow Bullets' },
  { char: '✓', label: 'Checkmark Bullets' },
  { char: '–', label: 'Dash Bullets' },
]

export function toRoman(n: number) {
  const map: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let out = ''
  for (const [v, s] of map) while (n >= v) {
    out += s
    n -= v
  }
  return out
}

export function toAlpha(n: number) {
  let out = ''
  while (n > 0) {
    n--
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26)
  }
  return out
}

// ---------- Building documents ----------

export function emptyDoc(): RichDoc {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

export function docFromText(text: string, attrs?: ParaAttrs, marks?: Mark[]): RichDoc {
  const lines = text.split('\n')
  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      ...(attrs ? { attrs: { ...attrs } } : {}),
      ...(line ? { content: [{ type: 'text', text: line, ...(marks?.length ? { marks } : {}) }] } : {}),
    })),
  }
}

export function paraText(p: Para, ctx?: Pick<TextCtx, 'slideNumber' | 'dateText'>) {
  return (p.content ?? [])
    .map((n) => (n.type === 'text' ? n.text : n.type === 'hardBreak' ? '\n' : n.attrs.kind === 'slidenum' ? String(ctx?.slideNumber ?? '#') : (ctx?.dateText ?? '')))
    .join('')
}

export function docText(doc: RichDoc | undefined) {
  return doc ? doc.content.map((p) => paraText(p)).join('\n') : ''
}

export function isDocEmpty(doc: RichDoc | undefined) {
  return !doc || doc.content.every((p) => !p.content?.length)
}

// ---------- Paragraph layout ----------

export function effectiveBullet(attrs: ParaAttrs | undefined, ctx: Pick<TextCtx, 'bullets' | 'bulletChar'>) {
  const b = attrs?.bullet
  if (b === undefined || b === null) return ctx.bullets ? ctx.bulletChar : null
  return b === 'none' ? null : b
}

/** Bullet or number text for each paragraph (empty string = no marker). */
export function computeMarkers(paras: Para[], ctx: Pick<TextCtx, 'bullets' | 'bulletChar'>): string[] {
  const counters: number[] = []
  const numbered: (string | null)[] = []
  return paras.map((p) => {
    const level = p.attrs?.level ?? 0
    counters.length = Math.min(counters.length, level + 1)
    numbered.length = Math.min(numbered.length, level + 1)
    const bullet = effectiveBullet(p.attrs, ctx)
    if (!bullet) {
      counters[level] = 0
      numbered[level] = null
      return ''
    }
    if (bullet.startsWith('num:')) {
      const scheme = bullet.slice(4)
      counters[level] = numbered[level] === scheme ? (counters[level] ?? 0) + 1 : Math.max(1, p.attrs?.startAt ?? 1)
      numbered[level] = scheme
      const def = NUMBER_SCHEMES.find((s) => s.id === scheme) ?? NUMBER_SCHEMES[0]
      return def.sample(counters[level])
    }
    counters[level] = 0
    numbered[level] = null
    return bullet
  })
}

export function paraMetrics(attrs: ParaAttrs | undefined, ctx: TextCtx, hasMarker: boolean) {
  const level = Math.max(0, Math.min(8, attrs?.level ?? 0))
  const size = ctx.sizes[Math.min(level, ctx.sizes.length - 1)]
  const marL = (hasMarker ? BULLET_INDENT : 0) + level * LEVEL_INDENT
  return {
    level,
    size,
    marL,
    indent: hasMarker ? -BULLET_INDENT : 0,
    align: attrs?.align ?? ctx.align,
    lineHeight: (attrs?.lineHeight ?? ctx.lineHeight) * LINE_FACTOR,
    spaceBefore: attrs?.spaceBefore ?? ctx.spaceBefore[Math.min(level, ctx.spaceBefore.length - 1)] ?? 0,
    spaceAfter: attrs?.spaceAfter ?? 0,
  }
}

export function paraStyle(attrs: ParaAttrs | undefined, ctx: TextCtx, hasMarker: boolean) {
  const m = paraMetrics(attrs, ctx, hasMarker)
  return [
    `font-size:calc(${m.size}pt * var(--fscale, 1))`,
    `line-height:calc(${m.lineHeight.toFixed(3)} * (1 - var(--lred, 0)))`,
    m.align === 'distributed' ? 'text-align:justify;text-align-last:justify' : `text-align:${m.align}`,
    `margin:calc(${m.spaceBefore}pt * (1 - var(--lred, 0))) 0 calc(${m.spaceAfter}pt * (1 - var(--lred, 0)))`,
    `padding-left:${m.marL}px`,
    `text-indent:${m.indent}px`,
    `--bw:${BULLET_INDENT}px`,
    ...(attrs?.bulletSize ? [`--bsz:${attrs.bulletSize / 100}`] : []),
    ...(attrs?.bulletColor ? [`--bclr:${resolveColor(attrs.bulletColor, ctx.colors)}`] : []),
  ].join(';')
}

export function textStyleCss(attrs: TextStyleAttrs, colors: ThemeColors) {
  const css: string[] = []
  if (attrs.fontFamily) css.push(`font-family:${fontStack(attrs.fontFamily).replace(/"/g, "'")}`)
  if (attrs.fontSize) css.push(`font-size:calc(${attrs.fontSize}pt * var(--fscale, 1))`)
  if (attrs.color) css.push(`color:${resolveColor(attrs.color, colors)}`)
  if (attrs.letterSpacing) css.push(`letter-spacing:${attrs.letterSpacing}pt`)
  if (attrs.shadow) css.push('text-shadow:0.05em 0.05em 0.08em rgba(0,0,0,0.45)')
  if (attrs.caps === 'all') css.push('text-transform:uppercase')
  if (attrs.caps === 'small') css.push('font-variant:small-caps')
  return css.join(';')
}

// ---------- Static HTML rendering (matches the editor's DOM) ----------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function openMark(m: Mark, colors: ThemeColors) {
  switch (m.type) {
    case 'bold':
      return ['<strong>', '</strong>']
    case 'italic':
      return ['<em>', '</em>']
    case 'underline':
      return ['<u>', '</u>']
    case 'strike':
      return ['<s>', '</s>']
    case 'superscript':
      return ['<sup>', '</sup>']
    case 'subscript':
      return ['<sub>', '</sub>']
    case 'highlight':
      return [`<mark style="background-color:${esc(m.attrs.color)}">`, '</mark>']
    case 'link':
      return [`<a href="${esc(m.attrs.href)}" target="_blank" rel="noopener noreferrer">`, '</a>']
    case 'textStyle':
      return [`<span style="${esc(textStyleCss(m.attrs, colors))}">`, '</span>']
  }
}

function inlineHtml(n: Inline, ctx: TextCtx) {
  let inner =
    n.type === 'text'
      ? esc(n.text)
      : n.type === 'hardBreak'
        ? '<br>'
        : `<span class="field" data-field="${n.attrs.kind}">${esc(n.attrs.kind === 'slidenum' ? String(ctx.slideNumber) : ctx.dateText)}</span>`
  const marks = n.marks ?? []
  for (let i = marks.length - 1; i >= 0; i--) {
    const [o, c] = openMark(marks[i], ctx.colors)
    inner = o + inner + c
  }
  return inner
}

/** The static HTML of each paragraph (used when text animates paragraph by paragraph). */
export function docToParagraphs(doc: RichDoc, ctx: TextCtx): string[] {
  const markers = computeMarkers(doc.content, ctx)
  return doc.content.map((p, i) => {
    const content = p.content ?? []
    let inner = content.map((n) => inlineHtml(n, ctx)).join('')
    if (!content.length || content[content.length - 1].type === 'hardBreak') inner += '<br>'
    const marker = content.length ? markers[i] : undefined
    return `<p style="${paraStyle(p.attrs, ctx, !!marker)}"${marker ? ` data-marker="${esc(marker)}"` : ''}>${inner}</p>`
  })
}

export function docToHtml(doc: RichDoc, ctx: TextCtx, prompt?: string) {
  const markers = computeMarkers(doc.content, ctx)
  if (prompt && isDocEmpty(doc)) {
    const attrs = doc.content[0]?.attrs
    const marker = markers[0]
    return `<p class="prompt" style="${paraStyle(attrs, ctx, !!marker)}"${marker ? ` data-marker="${esc(marker)}"` : ''}>${esc(prompt)}</p>`
  }
  return doc.content
    .map((p, i) => {
      const content = p.content ?? []
      let inner = content.map((n) => inlineHtml(n, ctx)).join('')
      if (!content.length || content[content.length - 1].type === 'hardBreak') inner += '<br>'
      // Like the original, empty paragraphs show their bullet only while the text is being edited.
      const marker = content.length ? markers[i] : undefined
      return `<p style="${paraStyle(p.attrs, ctx, !!marker)}"${marker ? ` data-marker="${esc(marker)}"` : ''}>${inner}</p>`
    })
    .join('')
}

// ---------- Whole-document formatting (used when shapes are selected but not in text edit) ----------

function mapInlines(doc: RichDoc, fn: (n: Inline) => Inline): RichDoc {
  return { ...doc, content: doc.content.map((p) => (p.content ? { ...p, content: p.content.map(fn) } : p)) }
}

function inlines(doc: RichDoc) {
  return doc.content.flatMap((p) => p.content ?? []).filter((n) => n.type !== 'hardBreak')
}

export function hasMarkEverywhere(doc: RichDoc, type: Mark['type']) {
  const all = inlines(doc)
  return all.length > 0 && all.every((n) => n.marks?.some((m) => m.type === type))
}

export function setMarkAll(doc: RichDoc, mark: Mark, on: boolean): RichDoc {
  return mapInlines(doc, (n) => {
    const rest = (n.marks ?? []).filter((m) => m.type !== mark.type && !(mark.type === 'superscript' && m.type === 'subscript') && !(mark.type === 'subscript' && m.type === 'superscript'))
    return { ...n, marks: on ? [...rest, mark] : rest } as Inline
  })
}

export function setTextStyleAll(doc: RichDoc, patch: TextStyleAttrs): RichDoc {
  return mapInlines(doc, (n) => {
    const marks = n.marks ?? []
    const existing = marks.find((m) => m.type === 'textStyle') as Extract<Mark, { type: 'textStyle' }> | undefined
    const attrs = { ...(existing?.attrs ?? {}), ...patch }
    const cleaned = Object.fromEntries(Object.entries(attrs).filter(([, v]) => v !== null && v !== undefined && v !== false)) as TextStyleAttrs
    const rest = marks.filter((m) => m.type !== 'textStyle')
    return { ...n, marks: Object.keys(cleaned).length ? [...rest, { type: 'textStyle', attrs: cleaned }] : rest } as Inline
  })
}

export function uniformTextStyle<K extends keyof TextStyleAttrs>(doc: RichDoc, key: K): TextStyleAttrs[K] | undefined {
  const all = inlines(doc)
  if (!all.length) return undefined
  const values = all.map((n) => (n.marks?.find((m) => m.type === 'textStyle') as Extract<Mark, { type: 'textStyle' }> | undefined)?.attrs[key] ?? undefined)
  return values.every((v) => v === values[0]) ? values[0] : undefined
}

export function clearFormattingAll(doc: RichDoc): RichDoc {
  return mapInlines(doc, (n) => ({ ...n, marks: (n.marks ?? []).filter((m) => m.type === 'link') }) as Inline)
}

export function setParaAll(doc: RichDoc, patch: Partial<ParaAttrs>): RichDoc {
  return { ...doc, content: doc.content.map((p) => ({ ...p, attrs: { ...(p.attrs ?? {}), ...patch } })) }
}

export function changeLevelAll(doc: RichDoc, delta: number): RichDoc {
  return { ...doc, content: doc.content.map((p) => ({ ...p, attrs: { ...(p.attrs ?? {}), level: Math.max(0, Math.min(8, (p.attrs?.level ?? 0) + delta)) } })) }
}

export type CaseMode = 'sentence' | 'lower' | 'upper' | 'title' | 'toggle'

export function changeCaseText(text: string, mode: CaseMode, atSentenceStart = true) {
  switch (mode) {
    case 'lower':
      return text.toLowerCase()
    case 'upper':
      return text.toUpperCase()
    case 'toggle':
      return [...text].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('')
    case 'title':
      return text.toLowerCase().replace(/(^|[\s\-(“"'])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
    case 'sentence': {
      let start = atSentenceStart
      return [...text.toLowerCase()]
        .map((c) => {
          if (start && /\p{L}/u.test(c)) {
            start = false
            return c.toUpperCase()
          }
          if (/[.!?]/.test(c)) start = true
          return c
        })
        .join('')
    }
  }
}

export function changeCaseAll(doc: RichDoc, mode: CaseMode): RichDoc {
  return {
    ...doc,
    content: doc.content.map((p) => {
      let first = true
      return p.content
        ? {
            ...p,
            content: p.content.map((n) => {
              if (n.type !== 'text') return n
              const out = { ...n, text: changeCaseText(n.text, mode, first) }
              first = false
              return out
            }),
          }
        : p
    }),
  }
}

/** Replaces matches of `query` in text runs; returns the new doc and how many were replaced. */
export function replaceInDoc(doc: RichDoc, query: string, replacement: string, opts: { matchCase: boolean; wholeWords: boolean }, limit = Infinity) {
  let count = 0
  const flags = opts.matchCase ? 'g' : 'gi'
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(opts.wholeWords ? `\\b${escaped}\\b` : escaped, flags)
  const next = mapInlines(doc, (n) => {
    if (n.type !== 'text' || count >= limit) return n
    const text = n.text.replace(re, (m) => {
      if (count >= limit) return m
      count++
      return replacement
    })
    return { ...n, text }
  })
  // Drop runs that became empty.
  next.content = next.content.map((p) => (p.content ? { ...p, content: p.content.filter((n) => n.type !== 'text' || n.text.length > 0) } : p))
  return { doc: next, count }
}

export function findInText(text: string, query: string, opts: { matchCase: boolean; wholeWords: boolean }) {
  if (!query) return []
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(opts.wholeWords ? `\\b${escaped}\\b` : escaped, opts.matchCase ? 'g' : 'gi')
  const out: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    out.push(m.index)
    if (!m[0].length) re.lastIndex++
  }
  return out
}

/** Fonts used anywhere in a document. */
export function fontsInDoc(doc: RichDoc, into: Set<string>) {
  for (const n of inlines(doc)) {
    const ts = n.marks?.find((m) => m.type === 'textStyle') as Extract<Mark, { type: 'textStyle' }> | undefined
    if (ts?.attrs.fontFamily) into.add(ts.attrs.fontFamily)
  }
}

export function replaceFontInDoc(doc: RichDoc, from: string, to: string): RichDoc {
  return mapInlines(doc, (n) => ({
    ...n,
    marks: n.marks?.map((m) => (m.type === 'textStyle' && m.attrs.fontFamily === from ? { ...m, attrs: { ...m.attrs, fontFamily: to } } : m)),
  }) as Inline)
}
