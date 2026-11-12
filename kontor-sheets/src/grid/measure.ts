import type { Style } from '../model/style'
import { fontFor } from './render'

let ctx: CanvasRenderingContext2D | null = null
const cache = new Map<string, number>()

/** Text width at 100% zoom, cached by font and text. */
export function measureText(text: string, style: Style): number {
  if (!ctx) ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return text.length * 7
  const font = fontFor(style, 1)
  const key = font + '\u0000' + text
  let w = cache.get(key)
  if (w === undefined) {
    ctx.font = font
    w = ctx.measureText(text).width
    if (cache.size > 20000) cache.clear()
    cache.set(key, w)
  }
  return w
}

export function clearMeasureCache() {
  cache.clear()
}
