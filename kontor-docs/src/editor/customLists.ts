// Custom bullets (Define New Bullet) and custom multilevel lists (Define New Multilevel List).
//
// Both are stored in the list node's `listStyle` attribute, so they travel with copy and paste:
//   sym:★              a bullet character
//   pic:data:image/…   a picture bullet
//   ml:[{"f":"decimal","t":"%1."},{"f":"lower-alpha","t":"%1.%2."}, …]
// Multilevel definitions use the number placeholders of the .docx format (%1 … %9), so they are written
// to and read from .docx as they are. Their numbers are drawn with CSS counters from a style sheet that
// is added to the page for every definition in use.

import { tx } from '../i18n'

export type LevelFormat = 'decimal' | 'decimal-zero' | 'lower-alpha' | 'upper-alpha' | 'lower-roman' | 'upper-roman' | 'bullet' | 'none'
export type ListLevel = { f: LevelFormat; t: string }

export const LEVEL_FORMATS: { id: LevelFormat; label: string }[] = [
  { id: 'decimal', label: tx('1, 2, 3, …') },
  { id: 'decimal-zero', label: tx('01, 02, 03, …') },
  { id: 'lower-alpha', label: tx('a, b, c, …') },
  { id: 'upper-alpha', label: tx('A, B, C, …') },
  { id: 'lower-roman', label: tx('i, ii, iii, …') },
  { id: 'upper-roman', label: tx('I, II, III, …') },
  { id: 'bullet', label: tx('Bullet') },
  { id: 'none', label: tx('(none)') },
]

/** The default multilevel list of the dialog: 1. a. i. 1. a. i. … */
export function defaultLevels(): ListLevel[] {
  const formats: LevelFormat[] = ['decimal', 'lower-alpha', 'lower-roman']
  return Array.from({ length: 9 }, (_, i) => ({ f: formats[i % 3], t: `%${i + 1}.` }))
}

export const isMultilevel = (style: unknown): boolean => typeof style === 'string' && style.startsWith('ml:')
export const isSymbolBullet = (style: unknown): boolean => typeof style === 'string' && style.startsWith('sym:')
export const isPictureBullet = (style: unknown): boolean => typeof style === 'string' && style.startsWith('pic:')

export function encodeMultilevel(levels: ListLevel[]): string {
  return `ml:${JSON.stringify(levels.slice(0, 9).map((l) => ({ f: l.f, t: l.t })))}`
}

export function decodeMultilevel(style: string): ListLevel[] | null {
  if (!isMultilevel(style)) return null
  try {
    const levels = JSON.parse(style.slice(3)) as ListLevel[]
    if (!Array.isArray(levels) || !levels.length) return null
    const out = defaultLevels()
    levels.slice(0, 9).forEach((l, i) => {
      if (l && typeof l.t === 'string' && LEVEL_FORMATS.some((f) => f.id === l.f)) out[i] = { f: l.f, t: l.t }
    })
    return out
  } catch {
    return null
  }
}

function roman(n: number) {
  const table: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
  let out = ''
  for (const [v, s] of table) while (n >= v) (out += s), (n -= v)
  return out
}

function alpha(n: number) {
  let out = ''
  while (n > 0) {
    n--
    out = String.fromCharCode(97 + (n % 26)) + out
    n = Math.floor(n / 26)
  }
  return out
}

/** A number in a level format (for previews and plain-text output). */
export function formatLevelNumber(n: number, f: LevelFormat): string {
  switch (f) {
    case 'decimal-zero': return String(n).padStart(2, '0')
    case 'lower-alpha': return alpha(n)
    case 'upper-alpha': return alpha(n).toUpperCase()
    case 'lower-roman': return roman(n)
    case 'upper-roman': return roman(n).toUpperCase()
    case 'bullet':
    case 'none': return ''
    default: return String(n)
  }
}

/** The label of an item: `counts[k]` is the current number of level k+1. */
export function levelLabel(levels: ListLevel[], level: number, counts: number[]): string {
  const def = levels[level]
  if (!def) return ''
  if (def.f === 'bullet') return def.t || '•'
  return def.t.replace(/%([1-9])/g, (_, k: string) => {
    const i = Number(k) - 1
    return formatLevelNumber(counts[i] ?? 1, levels[i]?.f === 'bullet' ? 'decimal' : (levels[i]?.f ?? 'decimal'))
  })
}

const cssString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`
const COUNTER_STYLE: Record<LevelFormat, string> = {
  decimal: 'decimal',
  'decimal-zero': 'decimal-leading-zero',
  'lower-alpha': 'lower-alpha',
  'upper-alpha': 'upper-alpha',
  'lower-roman': 'lower-roman',
  'upper-roman': 'upper-roman',
  bullet: 'disc',
  none: 'none',
}

/** CSS that draws a multilevel list definition. */
export function multilevelCss(style: string): string {
  const levels = decodeMultilevel(style)
  if (!levels) return ''
  const sel = `ol[data-list-style=${cssString(style)}]`
  const rules: string[] = []
  for (let k = 0; k < 9; k++) {
    const list = `.ProseMirror ${sel}${' ol'.repeat(k)}`
    const def = levels[k]
    const content =
      def.f === 'bullet'
        ? cssString(def.t || '•')
        : def.t
            .split(/(%[1-9])/)
            .filter(Boolean)
            .map((part) => {
              const m = part.match(/^%([1-9])$/)
              if (!m) return cssString(part)
              const i = Number(m[1]) - 1
              return `counter(kml${i + 1}, ${COUNTER_STYLE[levels[i].f === 'bullet' ? 'decimal' : levels[i].f]})`
            })
            .join(' ') || '""'
    rules.push(`${list} { counter-reset: kml${k + 1}; list-style: none; }`)
    rules.push(`${list} > li { position: relative; counter-increment: kml${k + 1}; }`)
    rules.push(`${list} > li::before { content: ${content}; position: absolute; right: calc(100% + 0.12in); white-space: nowrap; }`)
  }
  return rules.join('\n')
}

const injected = new Set<string>()

/** Adds the style sheet of a multilevel definition to the page (once). */
export function ensureListCss(style: string) {
  if (typeof document === 'undefined' || injected.has(style)) return
  injected.add(style)
  let el = document.getElementById('kontor-list-styles') as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = 'kontor-list-styles'
    document.head.appendChild(el)
  }
  el.appendChild(document.createTextNode(`${multilevelCss(style)}\n`))
}

/** Inline style for symbol and picture bullets. */
export function bulletCss(style: string): string | null {
  if (isSymbolBullet(style)) return `list-style-type: ${cssString(`${style.slice(4)}  `)}`
  if (isPictureBullet(style)) return `list-style-image: url(${cssString(style.slice(4))})`
  return null
}

/** Shrinks a picture to bullet size (data URL, at most 14 px). */
export async function pictureBullet(dataUrl: string): Promise<string> {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const scale = Math.min(1, 14 / Math.max(img.naturalWidth, img.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}
