import { Extension } from '@tiptap/core'

// Font dialog effects stored on the textStyle mark (small caps, all caps, spacing, position …)
// plus underline style/color stored on the underline mark.

export type TextEffect = 'shadow' | 'outline' | 'emboss' | 'engrave'
export type UnderlineStyle = 'single' | 'double' | 'thick' | 'dotted' | 'dashed' | 'wavy' | 'words'

export type TextEffectAttrs = {
  smallCaps: boolean | null
  allCaps: boolean | null
  doubleStrike: boolean | null
  hidden: boolean | null
  /** Character spacing in points (positive = expanded). */
  letterSpacing: number | null
  /** Raised (positive) or lowered position in points. */
  baselineShift: number | null
  /** Horizontal scale in percent. */
  scale: number | null
  /** Kerning for fonts of this size (pt) and above. */
  kerning: number | null
  /** OpenType features: ligatures, number forms and number spacing. */
  ligatures: 'standard' | 'contextual' | 'historical' | 'all' | null
  numForms: 'lining' | 'oldstyle' | null
  numSpacing: 'proportional' | 'tabular' | null
  textEffect: TextEffect | null
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textEffects: {
      setTextEffects: (attrs: Partial<TextEffectAttrs>) => ReturnType
      toggleSmallCaps: () => ReturnType
      toggleAllCaps: () => ReturnType
      setUnderlineStyle: (style: UnderlineStyle | null, color?: string | null) => ReturnType
    }
  }
}

const SHADOWS: Record<TextEffect, string> = {
  shadow: '1px 1px 1px rgba(0,0,0,.45)',
  outline: '-0.6px -0.6px 0 currentColor, 0.6px -0.6px 0 currentColor, -0.6px 0.6px 0 currentColor, 0.6px 0.6px 0 currentColor',
  emboss: '-1px -1px 0 rgba(255,255,255,.9), 1px 1px 0 rgba(0,0,0,.35)',
  engrave: '1px 1px 0 rgba(255,255,255,.9), -1px -1px 0 rgba(0,0,0,.35)',
}

// Each effect is written as a data attribute (for lossless copy & paste) plus the CSS that shows it.
const attr = (name: string, parse: (el: HTMLElement) => unknown, css: (v: never) => string) => ({
  [name]: {
    default: null,
    parseHTML: (el: HTMLElement) => {
      const raw = el.getAttribute(`data-${name}`)
      if (raw == null) return parse(el)
      return raw === 'true' ? true : isNaN(Number(raw)) ? raw : Number(raw)
    },
    renderHTML: (a: Record<string, unknown>) =>
      a[name] == null || a[name] === false ? {} : { [`data-${name}`]: String(a[name]), style: css(a[name] as never) },
  },
})

export const TextEffects = Extension.create({
  name: 'textEffects',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          ...attr('smallCaps', (el) => (el.style.fontVariant === 'small-caps' ? true : null), () => 'font-variant: small-caps'),
          ...attr('allCaps', (el) => (el.style.textTransform === 'uppercase' ? true : null), () => 'text-transform: uppercase'),
          ...attr(
            'doubleStrike',
            (el) => (el.style.textDecorationStyle === 'double' && el.style.textDecorationLine.includes('line-through') ? true : null),
            () => 'text-decoration-line: line-through; text-decoration-style: double',
          ),
          ...attr('hidden', () => null, () => 'display: var(--hidden-text, none)'),
          ...attr('letterSpacing', (el) => (el.style.letterSpacing ? parseFloat(el.style.letterSpacing) : null), (v: number) => `letter-spacing: ${v}pt`),
          ...attr(
            'baselineShift',
            (el) => (el.style.verticalAlign && /pt$/.test(el.style.verticalAlign) ? parseFloat(el.style.verticalAlign) : null),
            (v: number) => `vertical-align: ${v}pt`,
          ),
          ...attr('scale', () => null, (v: number) => `display: inline-block; transform: scaleX(${v / 100}); transform-origin: left`),
          ...attr('kerning', () => null, () => 'font-kerning: normal'),
          ...attr('ligatures', () => null, (v: string) => `font-variant-ligatures: ${{ standard: 'common-ligatures', contextual: 'common-ligatures contextual', historical: 'historical-ligatures', all: 'common-ligatures discretionary-ligatures historical-ligatures contextual' }[v] ?? 'normal'}`),
          ...attr('numForms', () => null, (v: string) => `font-variant-numeric: ${v === 'oldstyle' ? 'oldstyle-nums' : 'lining-nums'}`),
          ...attr('numSpacing', () => null, (v: string) => `font-feature-settings: '${v === 'tabular' ? 'tnum' : 'pnum'}'`),
          ...attr('textEffect', () => null, (v: TextEffect) => `text-shadow: ${SHADOWS[v]}${v === 'outline' ? '; color: #fff' : ''}`),
        },
      },
      {
        types: ['underline'],
        attributes: {
          underlineStyle: {
            default: null,
            parseHTML: (el) => (el.style.textDecorationStyle || null) as UnderlineStyle | null,
            renderHTML: (a) => {
              const s = a.underlineStyle as UnderlineStyle | null
              if (!s || s === 'single' || s === 'words') return {}
              if (s === 'thick') return { style: 'text-decoration-thickness: 2px' }
              return { style: `text-decoration-style: ${s}` }
            },
          },
          underlineColor: {
            default: null,
            parseHTML: (el) => el.style.textDecorationColor || null,
            renderHTML: (a) => (a.underlineColor ? { style: `text-decoration-color: ${a.underlineColor}` } : {}),
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setTextEffects:
        (attrs) =>
        ({ chain }) =>
          chain().setMark('textStyle', attrs).removeEmptyTextStyle().run(),
      toggleSmallCaps:
        () =>
        ({ editor, chain }) =>
          chain().setMark('textStyle', { smallCaps: editor.getAttributes('textStyle').smallCaps ? null : true }).removeEmptyTextStyle().run(),
      toggleAllCaps:
        () =>
        ({ editor, chain }) =>
          chain().setMark('textStyle', { allCaps: editor.getAttributes('textStyle').allCaps ? null : true }).removeEmptyTextStyle().run(),
      setUnderlineStyle:
        (style, color = null) =>
        ({ chain }) =>
          style ? chain().setMark('underline', { underlineStyle: style, underlineColor: color }).run() : chain().unsetMark('underline').run(),
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-a': () => this.editor.commands.toggleAllCaps(),
      'Mod-Shift-k': () => this.editor.commands.toggleSmallCaps(),
      'Mod-Shift-d': () =>
        this.editor.getAttributes('underline').underlineStyle === 'double'
          ? this.editor.commands.unsetMark('underline')
          : this.editor.commands.setUnderlineStyle('double'),
    }
  },
})
