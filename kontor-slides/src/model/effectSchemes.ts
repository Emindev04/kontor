// Design > Variants > Effects: theme effect schemes. Shapes drawn with the shape tools that have no
// effects of their own take the scheme's look (like the original's theme effect styles).
import type { Effects, ShapeElement, SlideElement } from './types'
import { tx } from '../i18n'

export const EFFECT_SCHEMES: { id: string; label: string; fx: Effects | null }[] = [
  { id: 'none', label: tx('Flat'), fx: null },
  { id: 'subtle', label: tx('Subtle Solids'), fx: { shadow: { color: '#000000', alpha: 0.25, blur: 3, dist: 1.5, angle: 90 } } },
  { id: 'moderate', label: tx('Moderate'), fx: { shadow: { color: '#000000', alpha: 0.35, blur: 5, dist: 3, angle: 90 } } },
  { id: 'intense', label: tx('Intense'), fx: { shadow: { color: '#000000', alpha: 0.4, blur: 8, dist: 4, angle: 90 }, bevel: 'circle' } },
  { id: 'glossy', label: tx('Glossy'), fx: { bevel: 'convex', reflection: true } },
  { id: 'glow', label: tx('Glow Edge'), fx: { glow: { color: 'theme:accent1', size: 6, alpha: 0.4 } } },
  { id: 'inset', label: tx('Inset'), fx: { innerShadow: { color: '#000000', alpha: 0.4, blur: 5, dist: 3, angle: 45 } } },
  { id: 'banded', label: tx('Banded Edge'), fx: { bevel: 'relaxedInset', shadow: { color: '#000000', alpha: 0.3, blur: 4, dist: 2, angle: 45 } } },
]

/** True for shapes that follow the theme's effect scheme: drawn shapes with a fill and no effects of their own. */
export function usesSchemeEffects(el: SlideElement): el is ShapeElement {
  return el.type === 'shape' && !el.effects && !el.placeholder && !el.textBox && el.fill.type !== 'none' && el.prst !== 'custom'
}

/** The effects a shape is drawn with: its own, or the effect scheme's. */
export function effectiveEffects(el: ShapeElement, scheme: string | null | undefined): Effects | undefined {
  if (!scheme || scheme === 'none' || !usesSchemeEffects(el)) return el.effects
  return EFFECT_SCHEMES.find((s) => s.id === scheme)?.fx ?? undefined
}
