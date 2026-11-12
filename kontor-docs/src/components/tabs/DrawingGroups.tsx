import {
  AlignCenter, BringToFront, FlipHorizontal2, FlipVertical2, Group, LayoutTemplate, ListTree, RotateCcw, RotateCw, SendToBack, Ungroup, WrapText as WrapIcon,
} from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { MenuButton, RibbonButton, RibbonGroup, SplitButton, Spinner } from '../ui'
import { WRAP_LABELS, isFloating, type WrapMode } from '../../editor/Drawing'
import { groupDrawings, selectedDrawings, ungroupDrawings } from '../../editor/DrawingSelection'
import { formatLength, parseLength, PX_PER_IN, type Unit } from '../../units'
import type { AppApi } from './types'

/** The selected drawing object (picture, shape, chart, text box) and its node type. */
export function selectedDrawing(editor: Editor) {
  const sel = editor.state.selection
  if (sel instanceof NodeSelection && ['image', 'shape', 'chart', 'diagram', 'onlineVideo', 'textBox', 'signatureLine'].includes(sel.node.type.name)) return { node: sel.node, pos: sel.from }
  // A text box is selected by putting the cursor inside it.
  const $from = sel.$from
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === 'textBox') return { node: $from.node(d), pos: $from.before(d) }
  return null
}

export function updateDrawing(editor: Editor, patch: Record<string, unknown>) {
  const d = selectedDrawing(editor)
  if (!d) return
  const tr = editor.state.tr.setNodeMarkup(d.pos, undefined, { ...d.node.attrs, ...patch })
  if (editor.state.selection instanceof NodeSelection) tr.setSelection(NodeSelection.create(tr.doc, d.pos))
  editor.view.dispatch(tr)
  editor.view.focus()
}

const WRAPS: WrapMode[] = ['inline', 'square', 'tight', 'through', 'topBottom', 'behind', 'front']

export function wrapItems(editor: Editor, app: AppApi) {
  const d = selectedDrawing(editor)
  const wrap = (d?.node.attrs.wrap as WrapMode) ?? 'inline'
  return [
    ...WRAPS.map((w) => ({
      label: WRAP_LABELS[w],
      active: wrap === w,
      onClick: () => updateDrawing(editor, { wrap: w, ...(isFloating(w) && !isFloating(wrap) ? { offsetX: 0, offsetY: 0 } : {}) }),
    })),
    'separator' as const,
    { label: 'More Layout Options…', onClick: () => app.openDialog('layoutOptions') },
  ]
}

/** Arrange group: Position, Wrap Text, Bring Forward, Send Backward, Align, Rotate. */
export function ArrangeGroup({ editor, app, rotatable = true }: { editor: Editor; app: AppApi; rotatable?: boolean }) {
  const d = selectedDrawing(editor)
  const a = d?.node.attrs ?? {}
  const wrap = (a.wrap as WrapMode) ?? 'inline'
  const z = Number(a.zIndex) || 0
  const rotate = (deg: number) => updateDrawing(editor, { rotation: (((Number(a.rotation) || 0) + deg) % 360 + 360) % 360 })
  const flip = (axis: 'h' | 'v') => {
    const f = (a.flip as string | null) ?? ''
    const next = f.includes(axis) ? f.replace(axis, '') : (f + axis).split('').sort().join('')
    updateDrawing(editor, { flip: next || null })
  }
  const align = (side: 'left' | 'center' | 'right') => {
    if (wrap === 'inline') editor.chain().focus().setTextAlign(side).run()
    else if (isFloating(wrap)) {
      // Floating objects: move horizontally within the text column.
      const width = Number(a.width) || 96
      const column = editor.view.dom.clientWidth
      const host = editor.view.nodeDOM(d!.pos) as HTMLElement | null
      const staticLeft = host ? host.getBoundingClientRect().left - editor.view.dom.getBoundingClientRect().left - (Number(a.offsetX) || 0) : 0
      const target = side === 'left' ? 0 : side === 'center' ? (column - width) / 2 : column - width
      updateDrawing(editor, { offsetX: Math.round(target - staticLeft) })
    } else updateDrawing(editor, { align: side })
  }
  return (
    <RibbonGroup label="Arrange" priority={2}>
      <MenuButton
        large
        icon={LayoutTemplate}
        label="Position"
        wide
        items={[
          { heading: 'In Line with Text' },
          { label: 'In Line with Text', active: wrap === 'inline', onClick: () => updateDrawing(editor, { wrap: 'inline' }) },
          { heading: 'With Text Wrapping' },
          { label: 'Left, Square Text Wrapping', onClick: () => updateDrawing(editor, { wrap: 'square', align: 'left' }) },
          { label: 'Right, Square Text Wrapping', onClick: () => updateDrawing(editor, { wrap: 'square', align: 'right' }) },
          { label: 'Center, Top and Bottom Wrapping', onClick: () => updateDrawing(editor, { wrap: 'topBottom', align: 'center' }) },
          { label: 'Left, Top and Bottom Wrapping', onClick: () => updateDrawing(editor, { wrap: 'topBottom', align: 'left' }) },
          { label: 'Right, Top and Bottom Wrapping', onClick: () => updateDrawing(editor, { wrap: 'topBottom', align: 'right' }) },
          'separator',
          { label: 'More Layout Options…', onClick: () => app.openDialog('layoutOptions') },
        ]}
      />
      <MenuButton large icon={WrapIcon} label="Wrap Text" items={wrapItems(editor, app)} />
      <div className="col">
        <SplitButton
          icon={BringToFront}
          label="Bring Forward"
          showLabel
          onClick={() => updateDrawing(editor, { zIndex: z + 1 })}
          items={[
            { label: 'Bring Forward', onClick: () => updateDrawing(editor, { zIndex: z + 1 }) },
            { label: 'Bring to Front', onClick: () => updateDrawing(editor, { zIndex: 50 }) },
            { label: 'Bring in Front of Text', onClick: () => updateDrawing(editor, { wrap: 'front', ...(isFloating(wrap) ? {} : { offsetX: 0, offsetY: 0 }) }) },
          ]}
        />
        <SplitButton
          icon={SendToBack}
          label="Send Backward"
          showLabel
          onClick={() => updateDrawing(editor, { zIndex: z - 1 })}
          items={[
            { label: 'Send Backward', onClick: () => updateDrawing(editor, { zIndex: z - 1 }) },
            { label: 'Send to Back', onClick: () => updateDrawing(editor, { zIndex: -50 }) },
            { label: 'Send Behind Text', onClick: () => updateDrawing(editor, { wrap: 'behind', ...(isFloating(wrap) ? {} : { offsetX: 0, offsetY: 0 }) }) },
          ]}
        />
        <RibbonButton icon={ListTree} label="Selection Pane" showLabel active={app.showSelectionPane} onClick={() => app.setShowSelectionPane(!app.showSelectionPane)} />
      </div>
      <div className="col">
        <MenuButton
          icon={AlignCenter}
          label="Align"
          showLabel
          items={[
            { label: 'Align Left', onClick: () => align('left') },
            { label: 'Align Center', onClick: () => align('center') },
            { label: 'Align Right', onClick: () => align('right') },
          ]}
        />
        <MenuButton
          icon={Group}
          label="Group"
          showLabel
          title={selectedDrawings(editor.state).length > 1 ? `Group (${selectedDrawings(editor.state).length} objects selected)` : 'Group: Shift+click objects to select several'}
          items={[
            {
              label: 'Group',
              icon: Group,
              onClick: () => {
                const problem = groupDrawings(editor.view)
                if (problem) alert(problem)
              },
            },
            { label: 'Ungroup', icon: Ungroup, onClick: () => ungroupDrawings(editor.view) || alert('The selection is not a group.') },
          ]}
        />
        {rotatable && (
          <MenuButton
            icon={RotateCw}
            label="Rotate"
            showLabel
            items={[
              { label: 'Rotate Right 90°', icon: RotateCw, onClick: () => rotate(90) },
              { label: 'Rotate Left 90°', icon: RotateCcw, onClick: () => rotate(-90) },
              { label: 'Flip Vertical', icon: FlipVertical2, onClick: () => flip('v') },
              { label: 'Flip Horizontal', icon: FlipHorizontal2, onClick: () => flip('h') },
              'separator',
              { label: 'More Rotation Options…', onClick: () => app.openDialog('layoutOptions') },
            ]}
          />
        )}
      </div>
    </RibbonGroup>
  )
}

/** Size group with height/width boxes; pictures keep their aspect ratio. */
export function SizeGroup({ editor, unit, keepRatio, extra }: { editor: Editor; unit: Unit; keepRatio: boolean; extra?: React.ReactNode }) {
  const d = selectedDrawing(editor)
  const dom = d ? (editor.view.nodeDOM(d.pos) as HTMLElement | null) : null
  const width = (d?.node.attrs.width as number | null) ?? dom?.offsetWidth ?? 96
  const height = (d?.node.attrs.height as number | null) ?? dom?.offsetHeight ?? 96
  const ratio = height / (width || 1)
  return (
    <RibbonGroup label="Size" priority={3}>
      {extra}
      <div className="col spinners">
        <Spinner
          label="Height"
          value={height / PX_PER_IN}
          step={0.1}
          min={0.1}
          max={22}
          format={(v) => formatLength(v, unit)}
          parse={(s) => parseLength(s, unit)}
          onChange={(v) => updateDrawing(editor, keepRatio ? { height: Math.round(v * PX_PER_IN), width: Math.round((v * PX_PER_IN) / ratio) } : { height: Math.round(v * PX_PER_IN), width })}
        />
        <Spinner
          label="Width"
          value={width / PX_PER_IN}
          step={0.1}
          min={0.1}
          max={22}
          format={(v) => formatLength(v, unit)}
          parse={(s) => parseLength(s, unit)}
          onChange={(v) => updateDrawing(editor, keepRatio ? { width: Math.round(v * PX_PER_IN), height: Math.round(v * PX_PER_IN * ratio) } : { width: Math.round(v * PX_PER_IN), height })}
        />
      </div>
    </RibbonGroup>
  )
}
