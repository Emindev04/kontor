import { patternTile } from '../model/patterns'
import type { ColorRef, Fill, HeaderFooter, LayoutId, MasterData, Presentation, ShapeElement, SlideSize } from '../model/types'
import { luminance, resolveColor, withAlpha, type ThemeColors } from '../model/color'
import { fontStack, getTheme, getVariant, type Theme, type ThemeVariant } from '../model/themes'
import { isTitleStyle, STYLE_DEFS } from '../model/layouts'
import type { TextCtx } from '../model/richtext'

export type RenderCtx = {
  theme: Theme
  variant: ThemeVariant
  colors: ThemeColors
  fonts: { major: string; minor: string }
  size: SlideSize
  headerFooter: HeaderFooter
  slideNumber: number
  dateText: string
  layout: LayoutId
  master?: MasterData | null
}

export function formatDate(d = new Date()) {
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
}

export function makeRenderCtx(
  p: { themeId: string; variant: number; fonts?: Presentation['fonts']; colors?: Presentation['colors']; size: SlideSize; headerFooter: HeaderFooter; master?: MasterData | null },
  slideNumber: number,
  layout: LayoutId,
): RenderCtx {
  const theme = getTheme(p.themeId)
  const variant = getVariant(theme, p.variant)
  return {
    theme,
    variant,
    colors: p.colors ? { ...variant.colors, ...p.colors } : variant.colors,
    fonts: p.fonts ?? theme.fonts,
    size: p.size,
    headerFooter: p.headerFooter,
    slideNumber,
    dateText: p.headerFooter.dateAuto || !p.headerFooter.dateText ? formatDate() : p.headerFooter.dateText,
    layout,
    master: p.master,
  }
}

/** Text color that reads well on accent fills (the theme's light color). */
export function lightText(colors: ThemeColors) {
  return luminance(colors.bg1) > luminance(colors.tx1) ? 'theme:bg1' : 'theme:tx1'
}

export function styleKey(el: ShapeElement) {
  return el.placeholder?.style ?? (el.textBox ? 'textBox' : 'shape')
}

export function textCtxFor(el: ShapeElement, rc: RenderCtx): TextCtx {
  const key = styleKey(el)
  const def = STYLE_DEFS[key]
  const titleSlide = rc.layout === 'title' || rc.layout === 'section'
  let color = def.color ?? (key === 'shape' ? lightText(rc.colors) : 'theme:tx1')
  if (titleSlide && rc.theme.titleSlideText && key !== 'shape' && key !== 'textBox') color = rc.theme.titleSlideText
  // Slide master text styles apply to placeholders.
  const ov = el.placeholder && el.placeholder.style !== 'pic' ? (isTitleStyle(el.placeholder.style) ? rc.master?.title : rc.master?.body) : undefined
  const sizes = ov?.size ? def.sizes.map((sz, i) => (i === 0 ? ov.size! : Math.max(8, Math.round(sz * (ov.size! / def.sizes[0]))))) : def.sizes
  return {
    sizes,
    font: fontStack(ov?.font ?? (def.font === 'major' ? rc.fonts.major : rc.fonts.minor)),
    color: resolveColor(ov?.color ?? color, rc.colors),
    bold: ov?.bold ?? def.bold,
    align: ov?.align ?? (def.align === 'title' ? rc.theme.titleAlign : def.align),
    bullets: def.bullets,
    bulletChar: rc.theme.bulletChar,
    lineHeight: def.lineHeight,
    spaceBefore: def.spaceBefore,
    colors: rc.colors,
    slideNumber: rc.slideNumber,
    dateText: rc.dateText,
    caps: rc.theme.titleCaps && !!el.placeholder && isTitleStyle(el.placeholder.style),
  }
}

/** Background used for a slide: its own fill, else the theme's (title variant for title/section layouts). */
export function slideBackground(slideBg: Fill | null | undefined, rc: RenderCtx): Fill {
  if (slideBg) return slideBg
  const layoutBg = rc.master?.layouts?.[rc.layout]?.background
  if (layoutBg) return layoutBg
  if (rc.master?.background) return rc.master.background
  const variant = rc.variant
  if ((rc.layout === 'title' || rc.layout === 'section') && variant.titleBackground) return variant.titleBackground
  return variant.background
}

export function fillToCss(fill: Fill, colors: ThemeColors): string {
  switch (fill.type) {
    case 'none':
      return 'transparent'
    case 'solid':
      return withAlpha(resolveColor(fill.color, colors), fill.alpha)
    case 'gradient': {
      const stops = fill.stops.map((s) => `${withAlpha(resolveColor(s.color, colors), s.alpha)} ${Math.round(s.pos * 100)}%`).join(', ')
      return fill.kind === 'radial' ? `radial-gradient(circle at center, ${stops})` : `linear-gradient(${fill.angle + 90}deg, ${stops})`
    }
    case 'picture':
      return fill.tile ? `url("${fill.src}") repeat` : `url("${fill.src}") center / 100% 100% no-repeat`
    case 'pattern':
      return `url("${patternTile(fill.preset, resolveColor(fill.fg, colors), resolveColor(fill.bg, colors))}") repeat`
  }
}

/** Text context for table cells: 18 pt body font, color and weight from the table style. */
export function tableCellCtx(rc: RenderCtx, color: ColorRef, bold: boolean): TextCtx {
  return {
    sizes: [18, 16, 14, 14, 14, 14, 14, 14, 14],
    font: fontStack(rc.fonts.minor),
    color: resolveColor(color, rc.colors),
    bold,
    align: 'left',
    bullets: false,
    bulletChar: rc.theme.bulletChar,
    lineHeight: 1,
    spaceBefore: [0],
    colors: rc.colors,
    slideNumber: rc.slideNumber,
    dateText: rc.dateText,
  }
}
