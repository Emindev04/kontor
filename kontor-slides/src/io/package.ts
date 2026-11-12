// Shared bits of the .pptx package that both the writer and the reader need.

/** Package part holding the Kontor model, so files saved here reopen exactly. */
export const KONTOR_PART = 'kontor/presentation.json'
/** Relationship type (from the package root) that points at KONTOR_PART; other programs ignore it. */
export const KONTOR_REL = 'http://schemas.kontor.app/relationships/presentation-model'
/** Prefix used inside KONTOR_PART for pictures and media that are stored once as package parts. */
export const MEDIA_REF = 'kontor-media:'

/** Small stable hash used to detect whether a file was edited elsewhere. */
export function hashString(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

/** Replaces every string value of `value` (deeply) with `fn(string)`. */
export function mapStrings<T>(value: T, fn: (s: string) => string): T {
  if (typeof value === 'string') return fn(value) as T
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn)) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = mapStrings(v, fn)
    return out as T
  }
  return value
}
