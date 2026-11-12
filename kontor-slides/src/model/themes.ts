import type { ColorRef, Fill, ShapeElement } from './types'
import type { ThemeColors } from './color'
import { tx } from '../i18n'

export type ThemeVariant = { name: string; colors: ThemeColors; background: Fill; titleBackground?: Fill }

export type DecoKind = 'title' | 'section' | 'content'

export type Theme = {
  id: string
  name: string
  fonts: { major: string; minor: string }
  variants: ThemeVariant[]
  /** Alignment of titles on content slides. */
  titleAlign: 'left' | 'center'
  /** Text color on title/section slides when they use a different background. */
  titleSlideText?: ColorRef
  titleCaps?: boolean
  bulletChar: string
  deco: (kind: DecoKind, w: number, h: number) => Omit<ShapeElement, 'id'>[]
}

type Palette = { bg1: string; tx1: string; bg2: string; tx2: string; accents: string[]; hlink?: string }

function colors(p: Palette): ThemeColors {
  const [a1, a2, a3, a4, a5, a6] = p.accents
  return { bg1: p.bg1, tx1: p.tx1, bg2: p.bg2, tx2: p.tx2, accent1: a1, accent2: a2, accent3: a3, accent4: a4, accent5: a5, accent6: a6, hlink: p.hlink ?? a1 }
}

const solid = (color: ColorRef, alpha?: number): Fill => ({ type: 'solid', color, alpha })
const BG: Fill = solid('theme:bg1')

/** Base palette, the accents rotated, an alternative accent set and a dark/light swap. */
function variants(base: Palette, alt: string[], names: [string, string, string, string], bg: Fill = BG, titleBackground?: Fill): ThemeVariant[] {
  const rotated = [...base.accents.slice(1), base.accents[0]]
  const swapped: Palette = { ...base, bg1: base.tx1, tx1: base.bg1, bg2: base.tx2, tx2: base.bg2 }
  return [
    { name: names[0], colors: colors(base), background: bg, titleBackground },
    { name: names[1], colors: colors({ ...base, accents: rotated }), background: bg, titleBackground },
    { name: names[2], colors: colors({ ...base, accents: alt }), background: bg, titleBackground },
    { name: names[3], colors: colors(swapped), background: bg, titleBackground },
  ]
}

function shape(prst: string, x: number, y: number, w: number, h: number, fill: Fill, extra: Partial<ShapeElement> = {}): Omit<ShapeElement, 'id'> {
  return { type: 'shape', name: 'Decoration', prst, x, y, w, h, rot: 0, fill, line: null, locked: true, ...extra }
}

const none = () => []

export const THEMES: Theme[] = [
  {
    id: 'kontor',
    name: 'Kontor',
    fonts: { major: 'Calibri Light', minor: 'Calibri' },
    titleAlign: 'left',
    bulletChar: '•',
    variants: variants(
      { bg1: '#FFFFFF', tx1: '#000000', bg2: '#E8E6E3', tx2: '#2E3A4B', accents: ['#2F6FC4', '#E3742F', '#9E9E9E', '#F2B705', '#4FA3D9', '#5FA84B'], hlink: '#2F6FC4' },
      ['#C8553D', '#F28F3B', '#588B8B', '#2D3047', '#93B7BE', '#E0A458'],
      [tx('Default'), tx('Shifted'), tx('Warm'), tx('Dark')],
    ),
    deco: none,
  },
  {
    id: 'atrium',
    name: 'Atrium',
    fonts: { major: 'Playfair Display', minor: 'Lato' },
    titleAlign: 'left',
    bulletChar: '–',
    variants: variants(
      { bg1: '#F6F2EC', tx1: '#2B2622', bg2: '#E6DCCD', tx2: '#4A3F35', accents: ['#B5523B', '#D9A441', '#6B8F71', '#3F5E7A', '#8C6A5D', '#C9B79C'] },
      ['#6B8F71', '#3F5E7A', '#B5523B', '#D9A441', '#9A8C98', '#4A4E69'],
      [tx('Clay'), tx('Ochre'), tx('Sage'), tx('Ink')],
    ),
    deco: (kind, w, h) =>
      kind === 'content'
        ? [shape('rect', 88, 172, 120, 4, solid('theme:accent1'))]
        : [shape('rect', 0, 0, w * 0.035, h, solid('theme:accent1')), shape('rect', w * 0.035, 0, w * 0.008, h, solid('theme:accent2'))],
  },
  {
    id: 'midnight',
    name: 'Midnight',
    fonts: { major: 'Montserrat', minor: 'Open Sans' },
    titleAlign: 'left',
    bulletChar: '▪',
    variants: variants(
      { bg1: '#121A2E', tx1: '#FFFFFF', bg2: '#1E2A47', tx2: '#C9D3E8', accents: ['#F5B700', '#2EC4B6', '#E4572E', '#A0C4FF', '#FF7AA2', '#7BD389'] },
      ['#2EC4B6', '#A0C4FF', '#F5B700', '#FF7AA2', '#E4572E', '#7BD389'],
      [tx('Gold'), tx('Teal'), tx('Arctic'), tx('Daylight')],
    ),
    deco: (kind, w, h) =>
      kind === 'content'
        ? [shape('rect', 88, 28, 64, 6, solid('theme:accent1'))]
        : [
            shape('rtTriangle', w * 0.62, h * 0.55, w * 0.38, h * 0.45, solid('theme:accent1', 0.9), { flipH: true }),
            shape('rtTriangle', w * 0.78, h * 0.3, w * 0.22, h * 0.7, solid('theme:accent2', 0.75), { flipH: true }),
          ],
  },
  {
    id: 'meadow',
    name: 'Meadow',
    fonts: { major: 'Merriweather', minor: 'Lato' },
    titleAlign: 'left',
    bulletChar: '•',
    variants: variants(
      { bg1: '#FFFFFF', tx1: '#1F2D1F', bg2: '#EAF2E3', tx2: '#2F4F2F', accents: ['#4C8C4A', '#A3C45A', '#2F6F73', '#E0A526', '#8A5A44', '#5E7CE2'] },
      ['#2F6F73', '#5E7CE2', '#4C8C4A', '#A3C45A', '#E0A526', '#8A5A44'],
      [tx('Spring'), tx('Field'), tx('Lake'), tx('Night')],
    ),
    deco: (kind, w, h) =>
      kind === 'content'
        ? [shape('rect', 0, 0, w, 14, solid('theme:accent1')), shape('rect', 0, 14, w, 4, solid('theme:accent2'))]
        : [shape('rect', 0, h * 0.88, w, h * 0.12, solid('theme:accent1')), shape('rect', 0, h * 0.865, w, h * 0.015, solid('theme:accent2'))],
  },
  {
    id: 'coral',
    name: 'Coral',
    fonts: { major: 'Montserrat', minor: 'Lato' },
    titleAlign: 'left',
    titleSlideText: '#FFFFFF',
    bulletChar: '›',
    variants: variants(
      { bg1: '#FFFFFF', tx1: '#3A2E39', bg2: '#FDE8E1', tx2: '#5C3D46', accents: ['#F25F5C', '#FFB563', '#247BA0', '#70C1B3', '#50514F', '#B370B0'] },
      ['#247BA0', '#70C1B3', '#F25F5C', '#FFB563', '#B370B0', '#50514F'],
      [tx('Coral'), tx('Apricot'), tx('Lagoon'), tx('Dusk')],
      BG,
      { type: 'gradient', kind: 'linear', angle: 135, stops: [{ pos: 0, color: 'theme:accent1' }, { pos: 1, color: 'theme:accent2' }] },
    ),
    deco: (kind, _w, h) => (kind === 'content' ? [shape('rect', 0, 0, 18, h, { type: 'gradient', kind: 'linear', angle: 90, stops: [{ pos: 0, color: 'theme:accent1' }, { pos: 1, color: 'theme:accent2' }] })] : []),
  },
  {
    id: 'graphite',
    name: 'Graphite',
    fonts: { major: 'Open Sans', minor: 'Open Sans' },
    titleAlign: 'left',
    bulletChar: '■',
    variants: variants(
      { bg1: '#262626', tx1: '#F2F2F2', bg2: '#3A3A3A', tx2: '#D0D0D0', accents: ['#FF8C42', '#FFD166', '#06D6A0', '#118AB2', '#EF476F', '#8D99AE'] },
      ['#06D6A0', '#118AB2', '#FF8C42', '#FFD166', '#EF476F', '#8D99AE'],
      [tx('Ember'), tx('Amber'), tx('Mint'), tx('Chalk')],
    ),
    deco: (kind, w, h) =>
      kind === 'content'
        ? [shape('rect', 88, 172, 72, 5, solid('theme:accent1'))]
        : [shape('rect', w * 0.125, h * 0.515, 96, 6, solid('theme:accent1')), shape('rect', 0, h - 10, w, 10, solid('theme:accent1'))],
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    fonts: { major: 'Trebuchet MS', minor: 'Trebuchet MS' },
    titleAlign: 'left',
    bulletChar: '◦',
    variants: variants(
      { bg1: '#1C4E80', tx1: '#FFFFFF', bg2: '#163E66', tx2: '#D6E6F5', accents: ['#7FDBFF', '#FFDC00', '#FF851B', '#2ECC40', '#F012BE', '#B9D8F2'] },
      ['#FFDC00', '#FF851B', '#7FDBFF', '#2ECC40', '#B9D8F2', '#F012BE'],
      [tx('Cyan'), tx('Signal'), tx('Warm'), tx('Paper')],
      { type: 'gradient', kind: 'linear', angle: 90, stops: [{ pos: 0, color: 'theme:bg1' }, { pos: 1, color: 'theme:bg2' }] },
    ),
    deco: (kind, w, h) => {
      const line = { color: 'theme:tx1', width: 1.5, dash: 'solid' as const, alpha: 0.55 }
      const c = kind === 'content' ? 18 : 30
      const s = kind === 'content' ? 40 : 70
      return [
        shape('line', c, c, s, 0, { type: 'none' }, { line }),
        shape('line', c, c, 0, s, { type: 'none' }, { line }),
        shape('line', w - c - s, h - c, s, 0, { type: 'none' }, { line }),
        shape('line', w - c, h - c - s, 0, s, { type: 'none' }, { line }),
      ]
    },
  },
  {
    id: 'citrus',
    name: 'Citrus',
    fonts: { major: 'Montserrat', minor: 'Open Sans' },
    titleAlign: 'left',
    bulletChar: '•',
    variants: variants(
      { bg1: '#FFFFFF', tx1: '#2D2A32', bg2: '#FFF6DD', tx2: '#4D4A52', accents: ['#F2C14E', '#F78154', '#4D9078', '#B4436C', '#5FAD56', '#3C6E71'] },
      ['#4D9078', '#5FAD56', '#F2C14E', '#F78154', '#3C6E71', '#B4436C'],
      [tx('Lemon'), tx('Tangerine'), tx('Lime'), tx('Night')],
    ),
    deco: (kind, w, h) =>
      kind === 'content'
        ? [shape('ellipse', w - 90, -50, 140, 140, solid('theme:accent1', 0.85))]
        : [shape('ellipse', w * 0.78, -h * 0.25, w * 0.34, w * 0.34, solid('theme:accent1', 0.9)), shape('ellipse', -w * 0.08, h * 0.72, w * 0.2, w * 0.2, solid('theme:accent2', 0.8))],
  },
  {
    id: 'paper',
    name: 'Paper',
    fonts: { major: 'Georgia', minor: 'Georgia' },
    titleAlign: 'center',
    bulletChar: '•',
    variants: variants(
      { bg1: '#FBF8F1', tx1: '#3B3024', bg2: '#EFE7D6', tx2: '#5A4A38', accents: ['#8C5E3C', '#A3B18A', '#588157', '#BC6C25', '#6D597A', '#355070'] },
      ['#355070', '#6D597A', '#8C5E3C', '#BC6C25', '#588157', '#A3B18A'],
      [tx('Sepia'), tx('Olive'), tx('Indigo'), tx('Ink')],
    ),
    deco: (_kind, w, h) => {
      const line = { color: 'theme:tx2', width: 1, dash: 'solid' as const, alpha: 0.6 }
      return [shape('rect', 20, 20, w - 40, h - 40, { type: 'none' }, { line }), shape('rect', 26, 26, w - 52, h - 52, { type: 'none' }, { line: { ...line, width: 0.5 } })]
    },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    fonts: { major: 'Montserrat', minor: 'Open Sans' },
    titleAlign: 'left',
    bulletChar: '•',
    variants: variants(
      { bg1: '#1B1036', tx1: '#FFFFFF', bg2: '#33206B', tx2: '#E0D7FF', accents: ['#A06CD5', '#47E5BC', '#FFD166', '#FF6B6B', '#4CC9F0', '#F72585'] },
      ['#47E5BC', '#4CC9F0', '#A06CD5', '#F72585', '#FFD166', '#FF6B6B'],
      [tx('Violet'), tx('Glacier'), tx('Borealis'), tx('Dawn')],
      { type: 'gradient', kind: 'radial', angle: 0, stops: [{ pos: 0, color: 'theme:bg2' }, { pos: 1, color: 'theme:bg1' }] },
    ),
    deco: none,
  },
  {
    id: 'slate',
    name: 'Slate',
    fonts: { major: 'Calibri', minor: 'Calibri' },
    titleAlign: 'left',
    bulletChar: '•',
    variants: variants(
      { bg1: '#E9EDF2', tx1: '#1F2933', bg2: '#CBD2D9', tx2: '#323F4B', accents: ['#3E7CB1', '#F17300', '#81A4CD', '#054A91', '#7A8B99', '#2A9D8F'] },
      ['#2A9D8F', '#054A91', '#3E7CB1', '#F17300', '#81A4CD', '#7A8B99'],
      [tx('Steel'), tx('Signal'), tx('Harbor'), tx('Charcoal')],
    ),
    deco: (kind, w, h) => (kind === 'content' ? [shape('rect', w - 24, 0, 24, h, solid('theme:accent1'))] : [shape('rect', w * 0.92, 0, w * 0.08, h, solid('theme:accent1')), shape('rect', w * 0.9, 0, w * 0.012, h, solid('theme:accent2'))]),
  },
]

export const DEFAULT_THEME_ID = 'kontor'

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

export function getVariant(theme: Theme, index: number): ThemeVariant {
  return theme.variants[index] ?? theme.variants[0]
}

/** The presentation's theme colors: the variant's colors with any custom colors on top. */
export function presColors(p: { themeId: string; variant: number; colors?: Partial<ThemeColors> | null }): ThemeColors {
  const base = getVariant(getTheme(p.themeId), p.variant).colors
  return p.colors ? { ...base, ...p.colors } : base
}

/** Font name plus open fallbacks (metric-compatible where available). */
export function fontStack(name: string): string {
  const fallbacks: Record<string, string> = {
    Calibri: 'Carlito, "Segoe UI", Arial, sans-serif',
    'Calibri Light': '"Calibri Light", Carlito, "Segoe UI Light", Arial, sans-serif',
    Cambria: 'Caladea, Georgia, serif',
    Georgia: 'Georgia, Caladea, serif',
    'Times New Roman': '"Times New Roman", Times, serif',
    'Playfair Display': '"Playfair Display", Georgia, serif',
    Merriweather: 'Merriweather, Georgia, serif',
    'Courier New': '"Courier New", Courier, monospace',
    Consolas: 'Consolas, Menlo, monospace',
  }
  const quoted = /\s/.test(name) ? `"${name}"` : name
  return name === 'Calibri Light' ? fallbacks[name] : `${quoted}, ${fallbacks[name] ?? 'Arial, sans-serif'}`
}

export const FONT_LIST = [
  'Arial',
  'Arial Black',
  'Calibri',
  'Calibri Light',
  'Cambria',
  'Candara',
  'Century Gothic',
  'Comic Sans MS',
  'Consolas',
  'Courier New',
  'Franklin Gothic Medium',
  'Garamond',
  'Georgia',
  'Gill Sans',
  'Helvetica',
  'Impact',
  'Lato',
  'Lucida Sans',
  'Merriweather',
  'Montserrat',
  'Open Sans',
  'Palatino',
  'Playfair Display',
  'Segoe UI',
  'Tahoma',
  'Times New Roman',
  'Trebuchet MS',
  'Verdana',
]
