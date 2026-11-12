import type { Node as PMNode } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'
import type { EditorView, NodeView } from '@tiptap/pm/view'
import { toggleMultiSelect } from './DrawingSelection'
import { tx } from '../i18n'

// Shared behaviour of pictures, shapes, charts and other drawing objects: size, rotation, text
// wrapping and position, with handles to resize and rotate them and dragging for floating ones.

export type WrapMode = 'inline' | 'square' | 'tight' | 'through' | 'topBottom' | 'behind' | 'front'
export type DrawingAlign = 'left' | 'center' | 'right'

export const WRAP_LABELS: Record<WrapMode, string> = {
  inline: tx('In Line with Text'),
  square: tx('Square'),
  tight: tx('Tight'),
  through: tx('Through'),
  topBottom: tx('Top and Bottom'),
  behind: tx('Behind Text'),
  front: tx('In Front of Text'),
}

export const isFloating = (wrap: WrapMode) => wrap === 'behind' || wrap === 'front'

/** Node attributes every drawing object has. */
export function drawingAttributes(defaults: { width?: number | null; height?: number | null; wrap?: WrapMode } = {}) {
  const numAttr = (name: string, def: number | null) => ({
    default: def,
    parseHTML: (el: HTMLElement) => {
      const v = el.getAttribute(`data-${name}`) ?? (name === 'width' || name === 'height' ? el.getAttribute(name) : null)
      return v == null || v === '' || isNaN(Number(v)) ? def : Number(v)
    },
    renderHTML: (a: Record<string, unknown>) => (a[name] == null || a[name] === def ? {} : { [`data-${name}`]: String(a[name]) }),
  })
  return {
    width: numAttr('width', defaults.width ?? null),
    height: numAttr('height', defaults.height ?? null),
    rotation: numAttr('rotation', 0),
    offsetX: numAttr('offset-x', 0),
    offsetY: numAttr('offset-y', 0),
    zIndex: numAttr('z-index', 0),
    wrap: {
      default: defaults.wrap ?? 'inline',
      parseHTML: (el: HTMLElement) => el.getAttribute('data-wrap') ?? defaults.wrap ?? 'inline',
      renderHTML: (a: Record<string, unknown>) => (a.wrap && a.wrap !== 'inline' ? { 'data-wrap': a.wrap } : {}),
    },
    align: {
      default: 'left',
      parseHTML: (el: HTMLElement) => el.getAttribute('data-align') ?? 'left',
      renderHTML: (a: Record<string, unknown>) => (a.align && a.align !== 'left' ? { 'data-align': a.align } : {}),
    },
    // Selection Pane: a name, hidden objects, and groups of objects that move together.
    name: {
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute('data-name'),
      renderHTML: (a: Record<string, unknown>) => (a.name ? { 'data-name': a.name } : {}),
    },
    hidden: {
      default: false,
      parseHTML: (el: HTMLElement) => el.hasAttribute('data-hidden'),
      renderHTML: (a: Record<string, unknown>) => (a.hidden ? { 'data-hidden': '' } : {}),
    },
    groupId: {
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute('data-group-id'),
      renderHTML: (a: Record<string, unknown>) => (a.groupId ? { 'data-group-id': a.groupId } : {}),
    },
    // Position inside its group (px from the group's top-left corner), written to .docx groups.
    groupX: numAttr('group-x', 0),
    groupY: numAttr('group-y', 0),
  }
}

/** Inline CSS of the outer box for the wrap mode (used by node views and static HTML). */
export function wrapStyle(a: Record<string, unknown>): string {
  const wrap = (a.wrap as WrapMode) ?? 'inline'
  const align = (a.align as DrawingAlign) ?? 'left'
  const parts: string[] = []
  switch (wrap) {
    case 'square':
    case 'tight':
    case 'through': {
      const m = wrap === 'square' ? '0.13in' : '0.06in'
      parts.push(`float: ${align === 'right' ? 'right' : 'left'}`, align === 'right' ? `margin: 0 0 ${m} ${m}` : `margin: 0 ${m} ${m} 0`)
      if (wrap !== 'square') parts.push('shape-outside: margin-box')
      break
    }
    case 'topBottom':
      parts.push('display: block', 'clear: both', 'margin-top: 4pt', 'margin-bottom: 4pt', `margin-left: ${align === 'left' ? '0' : 'auto'}`, `margin-right: ${align === 'right' ? '0' : 'auto'}`)
      break
    case 'behind':
    case 'front':
      // Absolutely positioned at its place in the text, moved by margins: no positioned parent needed.
      parts.push('position: absolute', `margin-left: ${Number(a.offsetX) || 0}px`, `margin-top: ${Number(a.offsetY) || 0}px`, `z-index: ${wrap === 'behind' ? -1 + Math.min(0, Number(a.zIndex) || 0) : 5 + (Number(a.zIndex) || 0)}`)
      break
  }
  return parts.join('; ')
}

type Handle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw' | 'rotate'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rotate']

export type DrawingRenderer = (node: PMNode, box: HTMLElement, size: { width: number; height: number }) => void

export type DrawingOptions = {
  /** Size used when the node has none (e.g. a picture's natural size). */
  naturalSize?: (node: PMNode, box: HTMLElement) => { width: number; height: number } | null
  /** Corner handles keep the aspect ratio (pictures). */
  keepRatio?: boolean
  /** Double-click action (e.g. edit a shape's text or a chart's data). */
  onDoubleClick?: (node: PMNode, view: EditorView, getPos: () => number | undefined) => void
  className?: string
  /** Editable content (text boxes): the node's children are rendered inside the drawing. */
  content?: boolean
}

/** Node view for drawing objects. */
export class DrawingView implements NodeView {
  dom: HTMLElement
  contentDOM?: HTMLElement
  private box: HTMLElement
  private frame: HTMLElement
  private node: PMNode

  constructor(
    node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
    private render: DrawingRenderer,
    private opts: DrawingOptions = {},
  ) {
    this.node = node
    this.dom = document.createElement(node.isInline ? 'span' : 'div')
    this.dom.className = `drawing ${opts.className ?? ''}`
    this.dom.contentEditable = 'false'
    this.dom.draggable = false
    this.box = document.createElement('span')
    this.box.className = 'drawing-box'
    this.frame = document.createElement('span')
    this.frame.className = 'drawing-frame'
    for (const h of HANDLES) {
      const el = document.createElement('span')
      el.className = `drawing-handle h-${h}`
      el.dataset.handle = h
      this.frame.appendChild(el)
    }
    if (opts.content) {
      this.contentDOM = document.createElement('div')
      this.contentDOM.className = 'drawing-content'
      this.box.appendChild(this.contentDOM)
      this.dom.contentEditable = 'true'
      this.frame.contentEditable = 'false'
      // Thin edges to grab and move a floating text box (its inside is for typing).
      for (const side of ['top', 'right', 'bottom', 'left']) {
        const edge = document.createElement('span')
        edge.className = `drawing-edge e-${side}`
        edge.dataset.edge = side
        edge.contentEditable = 'false'
        this.frame.appendChild(edge)
      }
    }
    this.dom.append(this.box, this.frame)
    this.dom.addEventListener('pointerdown', this.onPointerDown)
    this.dom.addEventListener('dblclick', (e) => {
      e.preventDefault()
      opts.onDoubleClick?.(this.node, this.view, this.getPos)
    })
    this.apply()
  }

  private size() {
    const a = this.node.attrs
    const natural = a.width == null || a.height == null ? this.opts.naturalSize?.(this.node, this.box) : null
    return { width: (a.width as number) ?? natural?.width ?? 96, height: (a.height as number) ?? natural?.height ?? 96 }
  }

  private apply() {
    const a = this.node.attrs
    const { width, height } = this.size()
    this.dom.setAttribute('style', wrapStyle(a))
    this.dom.dataset.wrap = a.wrap
    this.dom.classList.toggle('is-hidden', !!a.hidden)
    if (a.groupId) this.dom.dataset.groupId = a.groupId
    else delete this.dom.dataset.groupId
    this.dom.style.width = `${width}px`
    this.dom.style.height = this.opts.content && a.height == null ? 'auto' : `${height}px`
    this.dom.classList.toggle('is-auto-height', !!this.opts.content && a.height == null)
    const rotate = Number(a.rotation) || 0
    this.box.style.transform = rotate ? `rotate(${rotate}deg)` : ''
    this.frame.style.transform = rotate ? `rotate(${rotate}deg)` : ''
    this.render(this.node, this.box, { width, height })
  }

  /** Re-renders, e.g. after a picture has loaded and its natural size is known. */
  refresh() {
    this.apply()
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false
    this.node = node
    this.apply()
    return true
  }

  selectNode() {
    this.dom.classList.add('is-selected')
    for (const el of this.groupMembers()) el.classList.add('is-group-selected')
  }

  deselectNode() {
    this.dom.classList.remove('is-selected')
    for (const el of this.groupMembers()) el.classList.remove('is-group-selected')
  }

  /** The other objects of this object's group. */
  private groupMembers() {
    const id = this.node.attrs.groupId as string | null
    if (!id) return []
    return Array.from(this.view.dom.querySelectorAll<HTMLElement>(`.drawing[data-group-id="${CSS.escape(id)}"]`)).filter((el) => el !== this.dom)
  }

  stopEvent(e: Event) {
    const t = e.target as HTMLElement
    if (t.closest?.('.drawing-handle, .drawing-edge')) return true
    if (this.contentDOM?.contains(t)) return false
    // Floating objects are moved by dragging them, not by the editor's drag and drop.
    if (isFloating(this.node.attrs.wrap) && (e.type === 'pointerdown' || e.type === 'mousedown' || e.type.startsWith('drag'))) return true
    return t.closest?.('[data-drawing-input]') != null
  }

  ignoreMutation(m: MutationRecord | { type: 'selection'; target: Node }) {
    if (!this.contentDOM) return true
    if (m.type === 'selection') return false
    return !this.contentDOM.contains(m.target)
  }

  destroy() {
    this.dom.removeEventListener('pointerdown', this.onPointerDown)
  }

  private select() {
    const pos = this.getPos()
    if (pos == null) return
    this.view.dispatch(this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, pos)))
  }

  private commit(attrs: Record<string, unknown>) {
    const pos = this.getPos()
    if (pos == null) return
    const tr = this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, ...attrs })
    // Moving one object of a group moves the whole group.
    const id = this.node.attrs.groupId as string | null
    const dx = attrs.offsetX != null && attrs.width == null ? Number(attrs.offsetX) - (Number(this.node.attrs.offsetX) || 0) : 0
    const dy = attrs.offsetY != null && attrs.height == null ? Number(attrs.offsetY) - (Number(this.node.attrs.offsetY) || 0) : 0
    if (id && (dx || dy)) {
      tr.doc.descendants((n, p) => {
        if (p !== pos && n.attrs.groupId === id) tr.setNodeMarkup(p, undefined, { ...n.attrs, offsetX: (Number(n.attrs.offsetX) || 0) + dx, offsetY: (Number(n.attrs.offsetY) || 0) + dy })
      })
    }
    tr.setSelection(NodeSelection.create(tr.doc, pos))
    this.view.dispatch(tr)
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    const handle = target.closest<HTMLElement>('.drawing-handle')?.dataset.handle as Handle | undefined
    const floating = isFloating(this.node.attrs.wrap)
    if (this.contentDOM?.contains(target)) return // typing in a text box
    // Shift+click adds the object to (or removes it from) a multiple selection, e.g. to group objects.
    if (e.shiftKey && !handle) {
      const pos = this.getPos()
      if (pos != null) {
        e.preventDefault()
        e.stopPropagation()
        toggleMultiSelect(this.view, pos)
      }
      return
    }
    if (this.opts.content && !handle && !target.closest('.drawing-edge')) return
    if (!handle && !floating) return // inline and wrapped objects: the editor selects (and drags) them
    if ((e.target as HTMLElement).closest('[data-drawing-input]')) return
    e.preventDefault()
    e.stopPropagation()
    this.select()
    const scale = this.dom.getBoundingClientRect().width / (this.dom.offsetWidth || 1) || 1
    const start = { x: e.clientX, y: e.clientY, ...this.size(), offsetX: Number(this.node.attrs.offsetX) || 0, offsetY: Number(this.node.attrs.offsetY) || 0 }
    const rect = this.dom.getBoundingClientRect()
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    const ratio = start.height / (start.width || 1)
    let next: Record<string, number> = {}
    let moved = false
    const members = handle ? [] : this.groupMembers()
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / scale
      const dy = (ev.clientY - start.y) / scale
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true
      if (!handle) {
        if (!floating) return
        next = { offsetX: Math.round(start.offsetX + dx), offsetY: Math.round(start.offsetY + dy) }
        this.dom.style.marginLeft = `${next.offsetX}px`
        this.dom.style.marginTop = `${next.offsetY}px`
        for (const el of members) el.style.transform = `translate(${dx}px, ${dy}px)`
        return
      }
      if (handle === 'rotate') {
        let deg = (Math.atan2(ev.clientY - center.y, ev.clientX - center.x) * 180) / Math.PI + 90
        if (ev.shiftKey) deg = Math.round(deg / 15) * 15
        deg = Math.round((deg + 360) % 360)
        next = { rotation: deg }
        this.box.style.transform = this.frame.style.transform = `rotate(${deg}deg)`
        return
      }
      let w = start.width + (handle.includes('e') ? dx : handle.includes('w') ? -dx : 0)
      let h = start.height + (handle.includes('s') ? dy : handle.includes('n') ? -dy : 0)
      const corner = handle.length === 2
      if (corner && (this.opts.keepRatio ? !ev.shiftKey : ev.shiftKey)) h = w * ratio
      w = Math.max(8, Math.round(w))
      h = Math.max(8, Math.round(h))
      next = { width: w, height: h }
      if (floating) {
        if (handle.includes('w')) next.offsetX = Math.round(start.offsetX + (start.width - w))
        if (handle.includes('n')) next.offsetY = Math.round(start.offsetY + (start.height - h))
        if (next.offsetX != null) this.dom.style.marginLeft = `${next.offsetX}px`
        if (next.offsetY != null) this.dom.style.marginTop = `${next.offsetY}px`
      }
      this.dom.style.width = `${w}px`
      this.dom.style.height = `${h}px`
      this.render(this.node, this.box, { width: w, height: h })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      for (const el of members) el.style.transform = ''
      if (moved && Object.keys(next).length) this.commit(next)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
}
