import { Node, mergeAttributes } from '@tiptap/core'
import { DrawingView, drawingAttributes, wrapStyle, type DrawingRenderer } from './Drawing'
import { shapeSvg } from './Shape'
import { SHAPES } from './shapePaths'
import { t, tx } from '../i18n'

// Text boxes (Insert > Text Box) and WordArt: a drawing object whose content is ordinary,
// editable document text. WordArt is a text box without fill or outline and a text style preset.
// A shape with text is a text box with a shape outline (`kind`), so its text has full formatting.

export const WORDART_STYLES: { id: string; label: string }[] = [
  { id: 'fill-dark', label: tx('Fill: Black, Text Color 1; Shadow') },
  { id: 'fill-accent', label: tx('Fill: Blue, Accent Color 1; Shadow') },
  { id: 'outline-accent', label: tx('Fill: White; Outline: Blue, Accent Color 1') },
  { id: 'gradient-gold', label: tx('Gradient Fill: Gold; Outline: Brown') },
  { id: 'gradient-blue', label: tx('Gradient Fill: Blue; Reflection') },
  { id: 'fill-orange', label: tx('Fill: Orange, Accent Color 2; Outline') },
  { id: 'glow-green', label: tx('Fill: Green; Glow') },
  { id: 'pattern-gray', label: tx('Pattern Fill: Gray; Hard Shadow') },
]

export type TextBoxAttrs = {
  fill: string | null
  stroke: string | null
  strokeWidth: number
  padding: number
  wordArt: string | null
  vAlign: 'top' | 'middle' | 'bottom'
  /** Shape outline (a shape preset) instead of a rectangle, with the shape's line and effects. */
  kind: string | null
  dash: 'solid' | 'dash' | 'dot' | 'dashDot'
  shadow: boolean
  glow: string | null
  gradient: boolean
  /** Default text color of the box's text. */
  textColor: string | null
}

/** Text inset for shapes whose outline is not a rectangle, as a share of the size. */
const SHAPE_INSET: Record<string, number> = { ellipse: 0.15, triangle: 0.22, diamond: 0.25, hexagon: 0.12, octagon: 0.1, star5: 0.3, cloud: 0.18 }

const renderTextBox: DrawingRenderer = (node, box, { width, height }) => {
  const a = node.attrs
  box.className = `drawing-box textbox-box${a.wordArt ? ` wordart wordart-${a.wordArt}` : ''}${a.kind ? ' is-shape' : ''}`
  const pad = a.padding ?? 0.05
  let svg = box.querySelector<HTMLElement>(':scope > .shape-svg')
  if (a.kind && SHAPES[a.kind]) {
    if (!svg) {
      svg = document.createElement('span')
      svg.className = 'shape-svg'
      svg.contentEditable = 'false'
      box.prepend(svg)
    }
    // The outline follows the box: auto-height boxes are measured after layout.
    const h = a.height ?? (box.offsetHeight || height)
    svg.innerHTML = shapeSvg(a, width, h)
    svg.style.transform = [a.flip?.includes('h') ? 'scaleX(-1)' : '', a.flip?.includes('v') ? 'scaleY(-1)' : ''].filter(Boolean).join(' ')
    const inset = SHAPE_INSET[a.kind] ?? 0.06
    Object.assign(box.style, {
      background: 'transparent',
      border: '0',
      padding: `${Math.max(pad * 96, inset * h)}px ${Math.max(pad * 192, inset * width)}px`,
    })
  } else {
    svg?.remove()
    Object.assign(box.style, {
      background: a.fill ?? 'transparent',
      border: a.stroke && a.strokeWidth ? `${a.strokeWidth}pt solid ${a.stroke}` : '0',
      padding: `${pad}in ${pad * 2}in`,
    })
  }
  box.style.color = a.textColor ?? ''
  box.style.justifyContent = a.vAlign === 'middle' ? 'center' : a.vAlign === 'bottom' ? 'flex-end' : 'flex-start'
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textBox: {
      insertTextBox: (attrs?: Partial<TextBoxAttrs> & { width?: number; height?: number | null; wrap?: string; offsetX?: number; offsetY?: number; text?: string }, at?: number) => ReturnType
    }
  }
}

export const TextBox = Node.create({
  name: 'textBox',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  draggable: false,
  selectable: true,

  addAttributes() {
    const plain = (name: string, def: unknown) => ({
      default: def,
      parseHTML: (el: HTMLElement) => {
        const v = el.getAttribute(`data-${name}`)
        if (v == null) return def
        return typeof def === 'number' ? Number(v) : v === 'null' ? null : v
      },
      renderHTML: (a: Record<string, unknown>) => (a[name] === def ? {} : { [`data-${name}`]: String(a[name]) }),
    })
    return {
      ...drawingAttributes({ width: 192, height: null, wrap: 'square' }),
      fill: plain('fill', '#FFFFFF'),
      stroke: plain('stroke', '#000000'),
      strokeWidth: plain('strokeWidth', 0.75),
      padding: plain('padding', 0.05),
      wordArt: plain('wordArt', null),
      vAlign: plain('vAlign', 'top'),
      kind: plain('kind', null),
      dash: plain('dash', 'solid'),
      shadow: { default: false, parseHTML: (el: HTMLElement) => el.getAttribute('data-shadow') === 'true', renderHTML: (a: Record<string, unknown>) => (a.shadow ? { 'data-shadow': 'true' } : {}) },
      glow: plain('glow', null),
      gradient: { default: false, parseHTML: (el: HTMLElement) => el.getAttribute('data-gradient') === 'true', renderHTML: (a: Record<string, unknown>) => (a.gradient ? { 'data-gradient': 'true' } : {}) },
      textColor: plain('textColor', null),
      flip: plain('flip', null),
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="text-box"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const a = node.attrs
    const w = a.width ?? 192
    const h = a.height ?? 96
    const outline = a.kind && SHAPES[a.kind] ? `url("data:image/svg+xml,${encodeURIComponent(shapeSvg(a, w, h))}") no-repeat` : null
    const style = [
      wrapStyle(a),
      `width: ${w}px`,
      a.height ? `height: ${a.height}px` : '',
      `background: ${outline ?? a.fill ?? 'transparent'}`,
      !outline && a.stroke && a.strokeWidth ? `border: ${a.strokeWidth}pt solid ${a.stroke}` : '',
      a.textColor ? `color: ${a.textColor}` : '',
      `padding: ${a.padding}in ${a.padding * 2}in`,
    ]
      .filter(Boolean)
      .join('; ')
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'text-box', class: `text-box${a.wordArt ? ` wordart wordart-${a.wordArt}` : ''}`, style }), 0]
  },

  addNodeView() {
    return ({ node, view, getPos }) => new DrawingView(node, view, getPos as () => number | undefined, renderTextBox, { className: 'textbox', content: true })
  },

  addCommands() {
    return {
      insertTextBox:
        (attrs = {}, at) =>
        ({ commands, state }) => {
          const { text, ...rest } = attrs
          const node = {
            type: this.name,
            attrs: rest,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: text ?? t('Type your text here.') }] }],
          }
          const $from = state.selection.$from
          const pos = at ?? ($from.depth >= 1 ? $from.before(1) : state.selection.from)
          return commands.insertContentAt(pos, node)
        },
    }
  },
})
