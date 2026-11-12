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
import { t } from '../../i18n'

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
      label: t(WRAP_LABELS[w]),
      active: wrap === w,
      onClick: () => updateDrawing(editor, { wrap: w, ...(isFloating(w) && !isFloating(wrap) ? { offsetX: 0, offsetY: 0 } : {}) }),
    })),
    'separator' as const,
    { label: t('More Layout Options…'), onClick: () => app.openDialog('layoutOptions') },
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
    <RibbonGroup label={t('Arrange')} priority={2}>
      <MenuButton
        large
        icon={LayoutTemplate}
        label={t('Position')}
        wide
        items={[
          { heading: t('In Line with Text') },
          { label: t('In Line with Text'), active: wrap === 'inline', onClick: () => updateDrawing(editor, { wrap: 'inline' }) },
          { heading: t('With Text Wrapping') },
          { label: t('Left, Square Text Wrapping'), onClick: () => updateDrawing(editor, { wrap: 'square', align: 'left' }) },
          { label: t('Right, Square Text Wrapping'), onClick: () => updateDrawing(editor, { wrap: 'square', align: 'right' }) },
          { label: t('Center, Top and Bottom Wrapping'), onClick: () => updateDrawing(editor, { wrap: 'topBottom', align: 'center' }) },
          { label: t('Left, Top and Bottom Wrapping'), onClick: () => updateDrawing(editor, { wrap: 'topBottom', align: 'left' }) },
          { label: t('Right, Top and Bottom Wrapping'), onClick: () => updateDrawing(editor, { wrap: 'topBottom', align: 'right' }) },
          'separator',
          { label: t('More Layout Options…'), onClick: () => app.openDialog('layoutOptions') },
        ]}
      />
      <MenuButton large icon={WrapIcon} label={t('Wrap Text')} items={wrapItems(editor, app)} />
      <div className="col">
        <SplitButton
          icon={BringToFront}
          label={t('Bring Forward')}
          showLabel
          onClick={() => updateDrawing(editor, { zIndex: z + 1 })}
          items={[
            { label: t('Bring Forward'), onClick: () => updateDrawing(editor, { zIndex: z + 1 }) },
            { label: t('Bring to Front'), onClick: () => updateDrawing(editor, { zIndex: 50 }) },
            { label: t('Bring in Front of Text'), onClick: () => updateDrawing(editor, { wrap: 'front', ...(isFloating(wrap) ? {} : { offsetX: 0, offsetY: 0 }) }) },
          ]}
        />
        <SplitButton
          icon={SendToBack}
          label={t('Send Backward')}
          showLabel
          onClick={() => updateDrawing(editor, { zIndex: z - 1 })}
          items={[
            { label: t('Send Backward'), onClick: () => updateDrawing(editor, { zIndex: z - 1 }) },
            { label: t('Send to Back'), onClick: () => updateDrawing(editor, { zIndex: -50 }) },
            { label: t('Send Behind Text'), onClick: () => updateDrawing(editor, { wrap: 'behind', ...(isFloating(wrap) ? {} : { offsetX: 0, offsetY: 0 }) }) },
          ]}
        />
        <RibbonButton icon={ListTree} label={t('Selection Pane')} showLabel active={app.showSelectionPane} onClick={() => app.setShowSelectionPane(!app.showSelectionPane)} />
      </div>
      <div className="col">
        <MenuButton
          icon={AlignCenter}
          label={t('Align')}
          showLabel
          items={[
            { label: t('Align Left'), onClick: () => align('left') },
            { label: t('Align Center'), onClick: () => align('center') },
            { label: t('Align Right'), onClick: () => align('right') },
          ]}
        />
        <MenuButton
          icon={Group}
          label={t('Group')}
          showLabel
          title={selectedDrawings(editor.state).length > 1 ? t('Group ({n} objects selected)', { n: selectedDrawings(editor.state).length }) : t('Group: Shift+click objects to select several')}
          items={[
            {
              label: t('Group'),
              icon: Group,
              onClick: () => {
                const problem = groupDrawings(editor.view)
                if (problem) alert(problem)
              },
            },
            { label: t('Ungroup'), icon: Ungroup, onClick: () => ungroupDrawings(editor.view) || alert(t('The selection is not a group.')) },
          ]}
        />
        {rotatable && (
          <MenuButton
            icon={RotateCw}
            label={t('Rotate')}
            showLabel
            items={[
              { label: t('Rotate Right 90°'), icon: RotateCw, onClick: () => rotate(90) },
              { label: t('Rotate Left 90°'), icon: RotateCcw, onClick: () => rotate(-90) },
              { label: t('Flip Vertical'), icon: FlipVertical2, onClick: () => flip('v') },
              { label: t('Flip Horizontal'), icon: FlipHorizontal2, onClick: () => flip('h') },
              'separator',
              { label: t('More Rotation Options…'), onClick: () => app.openDialog('layoutOptions') },
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
    <RibbonGroup label={t('Size')} priority={3}>
      {extra}
      <div className="col spinners">
        <Spinner
          label={t('Height')}
          value={height / PX_PER_IN}
          step={0.1}
          min={0.1}
          max={22}
          format={(v) => formatLength(v, unit)}
          parse={(s) => parseLength(s, unit)}
          onChange={(v) => updateDrawing(editor, keepRatio ? { height: Math.round(v * PX_PER_IN), width: Math.round((v * PX_PER_IN) / ratio) } : { height: Math.round(v * PX_PER_IN), width })}
        />
        <Spinner
          label={t('Width')}
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
