import { Node, mergeAttributes } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { DrawingView, drawingAttributes, wrapStyle, type DrawingRenderer } from './Drawing'
import { SHAPES } from './shapePaths'

// Shapes from Insert > Shapes: a preset outline with fill, outline, shadow and optional text.

export type ShapeAttrs = {
  kind: string
  fill: string | null
  stroke: string | null
  strokeWidth: number
  dash: 'solid' | 'dash' | 'dot' | 'dashDot'
  shadow: boolean
  glow: string | null
  text: string
  textColor: string
  fontSize: number
  bold: boolean
  italic: boolean
  textAlign: 'left' | 'center' | 'right'
  vAlign: 'top' | 'middle' | 'bottom'
  gradient: boolean
}

export const SHAPE_DEFAULTS: Omit<ShapeAttrs, 'kind'> = {
  fill: '#2F6FC4',
  stroke: '#1F4E8C',
  strokeWidth: 1,
  dash: 'solid',
  shadow: false,
  glow: null,
  text: '',
  textColor: '#FFFFFF',
  fontSize: 11,
  bold: false,
  italic: false,
  textAlign: 'center',
  vAlign: 'middle',
  gradient: false,
}

const DASH: Record<string, string> = { solid: '', dash: '6 3', dot: '1.5 2.5', dashDot: '6 3 1.5 3' }

const SVG_NS = 'http://www.w3.org/2000/svg'
let gradientId = 0

/** SVG markup of a shape (also used for thumbnails and exports to images). */
export function shapeSvg(a: Record<string, unknown>, w: number, h: number) {
  const preset = SHAPES[a.kind as string] ?? SHAPES.rectangle
  const sw = (Number(a.strokeWidth) || 0) * (4 / 3)
  const stroke = a.stroke ?? 'none'
  const isLine = !!preset.line
  const fill = isLine ? 'none' : (a.fill as string | null) ?? 'none'
  const dash = DASH[(a.dash as string) ?? 'solid']
  const id = `g${++gradientId}`
  const defs: string[] = []
  let fillRef = fill
  if (a.gradient && fill !== 'none') {
    defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${fill}" stop-opacity="0.65"/><stop offset="1" stop-color="${fill}"/></linearGradient>`)
    fillRef = `url(#${id})`
  }
  const markers: string[] = []
  if (a.kind === 'arrowLine' || a.kind === 'doubleArrowLine') {
    defs.push(`<marker id="${id}e" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="${stroke}"/></marker>`)
    markers.push(`marker-end="url(#${id}e)"`)
    if (a.kind === 'doubleArrowLine') markers.push(`marker-start="url(#${id}e)"`)
  }
  const filter = [a.shadow ? 'drop-shadow(3px 3px 3px rgba(0,0,0,.4))' : '', a.glow ? `drop-shadow(0 0 5px ${a.glow})` : ''].filter(Boolean).join(' ')
  const common = `stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}`
  const body = `<path d="${preset.path(w, h)}" fill="${fillRef}" fill-rule="evenodd" ${common} ${markers.join(' ')}/>`
  const detail = preset.detail ? `<path d="${preset.detail(w, h)}" fill="none" ${common}/>` : ''
  return `<svg xmlns="${SVG_NS}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" overflow="visible"${filter ? ` style="filter:${filter}"` : ''}>${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${body}${detail}</svg>`
}

const renderShape: DrawingRenderer = (node, box, { width, height }) => {
  const a = node.attrs
  box.className = 'drawing-box shape-box'
  let svg = box.querySelector<HTMLElement>('.shape-svg')
  if (!svg) {
    svg = document.createElement('span')
    svg.className = 'shape-svg'
    box.appendChild(svg)
  }
  svg.innerHTML = shapeSvg(a, width, height)
  svg.style.transform = [a.flip?.includes('h') ? 'scaleX(-1)' : '', a.flip?.includes('v') ? 'scaleY(-1)' : ''].filter(Boolean).join(' ')
  let text = box.querySelector<HTMLElement>('.shape-text')
  if (!text) {
    text = document.createElement('span')
    text.className = 'shape-text'
    box.appendChild(text)
  }
  if (!text.isContentEditable) text.textContent = a.text ?? ''
  Object.assign(text.style, {
    color: a.textColor,
    fontSize: `${a.fontSize}pt`,
    fontWeight: a.bold ? 'bold' : '',
    fontStyle: a.italic ? 'italic' : '',
    textAlign: a.textAlign,
    justifyContent: a.vAlign === 'top' ? 'flex-start' : a.vAlign === 'bottom' ? 'flex-end' : 'center',
  })
  text.hidden = !!SHAPES[a.kind]?.line
}

/**
 * Adding text to a shape (double-click or "Add Text") turns it into a text box with the shape's
 * outline, so the text gets full formatting; the shape stays where it was on the page.
 */
export function editShapeText(node: PMNode, view: EditorView, getPos: () => number | undefined) {
  const pos = getPos()
  if (pos == null || SHAPES[node.attrs.kind]?.line) return
  convertShapeToTextBox(view, pos)
}

export function convertShapeToTextBox(view: EditorView, pos: number) {
  const { state } = view
  const node = state.doc.nodeAt(pos)
  const type = state.schema.nodes.textBox
  if (!node || node.type.name !== 'shape' || !type) return false
  const a = node.attrs
  const before = (view.nodeDOM(pos) as HTMLElement | null)?.getBoundingClientRect()
  const $pos = state.doc.resolve(pos)
  const at = $pos.depth >= 1 ? $pos.before(1) : pos
  const marks = [
    ...(a.bold ? [state.schema.marks.bold.create()] : []),
    ...(a.italic ? [state.schema.marks.italic.create()] : []),
    state.schema.marks.textStyle.create({ fontSize: `${a.fontSize ?? 11}pt` }),
  ]
  const para = state.schema.nodes.paragraph.create({ textAlign: a.textAlign === 'left' ? null : a.textAlign }, a.text ? state.schema.text(a.text, marks) : null)
  const box = type.create(
    {
      kind: a.kind,
      fill: a.fill,
      stroke: a.stroke,
      strokeWidth: a.strokeWidth,
      dash: a.dash,
      shadow: a.shadow,
      glow: a.glow,
      gradient: a.gradient,
      flip: a.flip,
      textColor: a.textColor,
      vAlign: a.vAlign,
      padding: 0.05,
      width: a.width,
      height: a.height,
      wrap: a.wrap,
      align: a.align,
      offsetX: a.offsetX,
      offsetY: a.offsetY,
      zIndex: a.zIndex,
      rotation: a.rotation,
      name: a.name,
      hidden: a.hidden,
      groupId: a.groupId,
    },
    para,
  )
  const tr = state.tr.delete(pos, pos + node.nodeSize)
  tr.insert(tr.mapping.map(at, -1), box)
  const boxPos = tr.mapping.map(at, -1)
  tr.setSelection(TextSelection.create(tr.doc, boxPos + 2 + para.content.size))
  view.dispatch(tr)
  // A floating shape keeps its place on the page although its anchor moved to the paragraph start.
  const after = (view.nodeDOM(boxPos) as HTMLElement | null)?.getBoundingClientRect()
  const scale = after && after.width ? after.width / (Number(a.width) || after.width) : 1
  if (before && after && (a.wrap === 'front' || a.wrap === 'behind')) {
    const dx = Math.round((before.left - after.left) / scale)
    const dy = Math.round((before.top - after.top) / scale)
    const current = view.state.doc.nodeAt(boxPos)
    if (current && (dx || dy)) view.dispatch(view.state.tr.setNodeMarkup(boxPos, undefined, { ...current.attrs, offsetX: (Number(current.attrs.offsetX) || 0) + dx, offsetY: (Number(current.attrs.offsetY) || 0) + dy }))
  }
  view.focus()
  return true
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    shape: {
      insertShape: (attrs: Partial<ShapeAttrs> & { kind: string; width?: number; height?: number; wrap?: string; offsetX?: number; offsetY?: number }, at?: number) => ReturnType
    }
  }
}

export const Shape = Node.create({
  name: 'shape',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    const plain = (name: keyof ShapeAttrs | 'kind', def: unknown) => ({
      default: def,
      parseHTML: (el: HTMLElement) => {
        const v = el.getAttribute(`data-${name}`)
        if (v == null) return def
        return typeof def === 'number' ? Number(v) : typeof def === 'boolean' ? v === 'true' : v
      },
      renderHTML: (a: Record<string, unknown>) => (a[name] === def ? {} : { [`data-${name}`]: String(a[name]) }),
    })
    return {
      ...drawingAttributes({ width: 144, height: 96, wrap: 'front' }),
      kind: plain('kind', 'rectangle'),
      flip: plain('flip' as keyof ShapeAttrs, null),
      ...Object.fromEntries(Object.entries(SHAPE_DEFAULTS).map(([k, v]) => [k, plain(k as keyof ShapeAttrs, v)])),
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="shape"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const w = node.attrs.width ?? 144
    const h = node.attrs.height ?? 96
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'shape', class: 'drawing shape-static', style: `${wrapStyle(node.attrs)}; display: inline-block; width: ${w}px; height: ${h}px; background: url("data:image/svg+xml,${encodeURIComponent(shapeSvg(node.attrs, w, h))}") no-repeat` }), node.attrs.text ?? '']
  },

  renderText({ node }) {
    return node.attrs.text ?? ''
  },

  addNodeView() {
    return ({ node, view, getPos }) => new DrawingView(node, view, getPos as () => number | undefined, renderShape, { className: 'shape', onDoubleClick: editShapeText })
  },

  addCommands() {
    return {
      insertShape:
        (attrs, at) =>
        ({ commands }) => {
          const node = { type: this.name, attrs: { ...SHAPE_DEFAULTS, ...attrs } }
          return at != null ? commands.insertContentAt(at, node) : commands.insertContent(node)
        },
    }
  },
})
