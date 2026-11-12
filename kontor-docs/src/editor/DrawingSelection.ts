import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { NodeSelection, Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { isFloating, type WrapMode } from './Drawing'

// Several drawing objects selected at once (Shift+click or the Selection Pane), and grouping them:
// objects of a group share a group id and move together.

export const DRAWING_TYPES = ['image', 'shape', 'textBox', 'chart', 'diagram', 'onlineVideo', 'signatureLine']

type State = { positions: number[] }
export const multiSelectKey = new PluginKey<State>('drawingMultiSelect')

/** Every drawing object of the document in document order, with a display name. */
export function listDrawings(doc: PMNode) {
  const out: { pos: number; node: PMNode; name: string; kind: string }[] = []
  doc.descendants((node, pos) => {
    if (!DRAWING_TYPES.includes(node.type.name)) return
    const kind = drawingKind(node)
    // Like the original, objects are numbered across the document ("Oval 1", "Rectangle 2").
    out.push({ pos, node, kind, name: (node.attrs.name as string | null) || `${kind} ${out.length + 1}` })
    return node.type.name === 'textBox' ? false : undefined
  })
  return out
}

const SHAPE_NAMES: Record<string, string> = { ellipse: 'Oval', rectangle: 'Rectangle', roundRect: 'Rectangle: Rounded Corners', line: 'Straight Connector', arrowLine: 'Straight Arrow Connector' }

function drawingKind(node: PMNode) {
  switch (node.type.name) {
    case 'image':
      return 'Picture'
    case 'textBox':
      return node.attrs.wordArt ? 'WordArt' : 'Text Box'
    case 'chart':
      return 'Chart'
    case 'diagram':
      return 'Diagram'
    case 'onlineVideo':
      return 'Online Video'
    case 'signatureLine':
      return 'Signature Line'
    default:
      return SHAPE_NAMES[node.attrs.kind as string] ?? String(node.attrs.kind ?? 'Shape').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
  }
}

export function getMultiSelection(state: EditorState) {
  return multiSelectKey.getState(state)?.positions ?? []
}

/** The objects a group command works on: the multiple selection, or the selected object. */
export function selectedDrawings(state: EditorState) {
  const multi = getMultiSelection(state)
  const sel = state.selection
  const positions = new Set(multi)
  if (sel instanceof NodeSelection && DRAWING_TYPES.includes(sel.node.type.name)) positions.add(sel.from)
  return [...positions].sort((a, b) => a - b).flatMap((pos) => {
    const node = state.doc.nodeAt(pos)
    return node && DRAWING_TYPES.includes(node.type.name) ? [{ pos, node }] : []
  })
}

export function toggleMultiSelect(view: EditorView, pos: number) {
  const current = new Set(getMultiSelection(view.state))
  const sel = view.state.selection
  // The object selected before Shift+click joins the multiple selection.
  if (sel instanceof NodeSelection && DRAWING_TYPES.includes(sel.node.type.name)) current.add(sel.from)
  if (current.has(pos) && current.size > 1) current.delete(pos)
  else current.add(pos)
  const tr = view.state.tr.setMeta(multiSelectKey, { positions: [...current] })
  tr.setSelection(NodeSelection.create(tr.doc, pos))
  view.dispatch(tr)
}

export function setMultiSelection(view: EditorView, positions: number[]) {
  const tr = view.state.tr.setMeta(multiSelectKey, { positions })
  if (positions.length) tr.setSelection(NodeSelection.create(tr.doc, positions[positions.length - 1]))
  view.dispatch(tr)
}

const newGroupId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Groups the selected floating objects. Returns why it could not, or null. */
export function groupDrawings(view: EditorView): string | null {
  const items = selectedDrawings(view.state)
  // Selecting one object of a group means the whole group.
  if (items.length < 2) return 'Select two or more objects (Shift+click) to group them.'
  if (items.some((d) => !isFloating(d.node.attrs.wrap as WrapMode))) return 'Only objects with the "In Front of Text" or "Behind Text" layout can be grouped.'
  const id = newGroupId()
  const tr = view.state.tr
  // Remember where each object sits inside the group, so the group can be saved as one drawing.
  const rects = items.map((d) => (view.nodeDOM(d.pos) as HTMLElement | null)?.querySelector<HTMLElement>('.drawing-box')?.getBoundingClientRect() ?? null)
  const zoom = view.dom.getBoundingClientRect().width / (view.dom.offsetWidth || 1) || 1
  const left = Math.min(...rects.map((r) => r?.left ?? Infinity))
  const top = Math.min(...rects.map((r) => r?.top ?? Infinity))
  items.forEach((d, i) => {
    const r = rects[i]
    const groupX = r && isFinite(left) ? Math.round((r.left - left) / zoom) : 0
    const groupY = r && isFinite(top) ? Math.round((r.top - top) / zoom) : 0
    tr.setNodeMarkup(d.pos, undefined, { ...d.node.attrs, groupId: id, groupX, groupY })
  })
  tr.setMeta(multiSelectKey, { positions: [] })
  view.dispatch(tr)
  return null
}

export function ungroupDrawings(view: EditorView) {
  const ids = new Set(selectedDrawings(view.state).map((d) => d.node.attrs.groupId).filter(Boolean))
  if (!ids.size) return false
  const tr = view.state.tr
  view.state.doc.descendants((n, p) => {
    if (ids.has(n.attrs.groupId)) tr.setNodeMarkup(p, undefined, { ...n.attrs, groupId: null, groupX: 0, groupY: 0 })
  })
  view.dispatch(tr)
  return true
}

export const DrawingSelection = Extension.create({
  name: 'drawingSelection',

  addProseMirrorPlugins() {
    return [
      new Plugin<State>({
        key: multiSelectKey,
        state: {
          init: () => ({ positions: [] }),
          apply(tr, prev) {
            const meta = tr.getMeta(multiSelectKey) as State | undefined
            if (meta) return meta
            if (!prev.positions.length) return prev
            // Any other selection change ends the multiple selection.
            if (tr.selectionSet && !tr.docChanged) return { positions: [] }
            if (!tr.docChanged) return prev
            const positions = prev.positions.map((p) => tr.mapping.mapResult(p)).filter((r) => !r.deleted).map((r) => r.pos)
            return { positions }
          },
        },
        props: {
          decorations(state) {
            const positions = getMultiSelection(state)
            if (!positions.length) return null
            const decos = positions.flatMap((pos) => {
              const node = state.doc.nodeAt(pos)
              return node ? [Decoration.node(pos, pos + node.nodeSize, { class: 'is-multi-selected' })] : []
            })
            return DecorationSet.create(state.doc, decos)
          },
        },
      }),
    ]
  },
})
