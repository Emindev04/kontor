import type { ColorRef, ThemeSlot } from './types'
import { t, tx } from '../i18n'

export type ThemeColors = Record<ThemeSlot, string>

export const THEME_SLOTS: ThemeSlot[] = ['bg1', 'tx1', 'bg2', 'tx2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']

export const SLOT_LABELS: Record<ThemeSlot, string> = {
  bg1: tx('Background 1'),
  tx1: tx('Text 1'),
  bg2: tx('Background 2'),
  tx2: tx('Text 2'),
  accent1: tx('Accent 1'),
  accent2: tx('Accent 2'),
  accent3: tx('Accent 3'),
  accent4: tx('Accent 4'),
  accent5: tx('Accent 5'),
  accent6: tx('Accent 6'),
  hlink: tx('Hyperlink'),
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16) || 0
  return [n >> 16, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function rgbToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h /= 6
  return [h, s, l]
}

export function hslToHex(h: number, s: number, l: number) {
  if (s === 0) return rgbToHex(l * 255, l * 255, l * 255)
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return rgbToHex(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255)
}

/** Lighten (+) or darken (−) like the luminance modulation used by presentation themes. */
export function adjustLum(hex: string, amount: number) {
  const [h, s, l] = rgbToHsl(hex)
  const nl = amount >= 0 ? l * (1 - amount) + amount : l * (1 + amount)
  return hslToHex(h, s, nl)
}

/** Variant codes used in ColorRef strings: l80 = lighter 80 %, d25 = darker 25 %. */
export function applyVariant(hex: string, variant?: string) {
  if (!variant) return hex
  const m = /^([ld])(\d+)$/.exec(variant)
  if (!m) return hex
  const amount = Number(m[2]) / 100
  return adjustLum(hex, m[1] === 'l' ? amount : -amount)
}

export function resolveColor(ref: ColorRef | null | undefined, colors: ThemeColors, fallback = '#000000'): string {
  if (!ref) return fallback
  if (ref.startsWith('#')) return ref.toUpperCase()
  if (ref.startsWith('theme:')) {
    const [, slot, variant] = ref.split(':')
    const base = colors[slot as ThemeSlot]
    return base ? applyVariant(base, variant) : fallback
  }
  return ref
}

export function withAlpha(hex: string, alpha = 1) {
  if (alpha >= 1) return hex
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, alpha).toFixed(3)})`
}

export function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** The five shade/tint rows shown under each theme color in the palette. */
export function paletteVariants(hex: string): { code: string; label: string }[] {
  const l = rgbToHsl(hex)[2]
  if (l < 0.15) return [50, 35, 25, 15, 5].map((p) => ({ code: `l${String(p).padStart(2, '0')}`, label: t('Lighter {n}%', { n: p }) }))
  if (l > 0.9) return [5, 15, 25, 35, 50].map((p) => ({ code: `d${String(p).padStart(2, '0')}`, label: t('Darker {n}%', { n: p }) }))
  return [
    { code: 'l80', label: t('Lighter 80%') },
    { code: 'l60', label: t('Lighter 60%') },
    { code: 'l40', label: t('Lighter 40%') },
    { code: 'd25', label: t('Darker 25%') },
    { code: 'd50', label: t('Darker 50%') },
  ]
}

export function normalizeHex(value: string): string | null {
  const v = value.trim().replace(/^#/, '')
  if (/^[0-9a-f]{6}$/i.test(v)) return '#' + v.toUpperCase()
  if (/^[0-9a-f]{3}$/i.test(v)) return '#' + v.split('').map((c) => c + c).join('').toUpperCase()
  return null
}

/** Named CSS color or rgb() string to hex (used by import and paste). */
export function cssToHex(value: string): string | null {
  const hex = normalizeHex(value)
  if (hex) return hex
  const m = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(value)
  if (m) return rgbToHex(Number(m[1]), Number(m[2]), Number(m[3]))
  return null
}
