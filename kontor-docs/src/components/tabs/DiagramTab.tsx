import {
  ArrowDown, ArrowLeftToLine, ArrowRightToLine, ArrowUp, LayoutGrid, ListPlus, Palette, PanelLeft, RotateCcw, Shapes, Sparkles, Trash2,
} from 'lucide-react'
import { MenuButton, RibbonButton, RibbonGroup } from '../ui'
import { DIAGRAM_COLORS, DIAGRAM_LAYOUTS, DIAGRAM_STYLES, diagramCursor, diagramShapes, editItems, newDiagram, shapeAttrsOf, type DiagramData } from '../../editor/Diagram'
import { selectedDiagram, updateDiagram } from '../DiagramTextPane'
import { ArrangeGroup, SizeGroup } from './DrawingGroups'
import type { TabProps } from './types'

/** Contextual tab of a selected diagram (layouts, colors, styles and outline edits). */
export function DiagramDesignTab({ editor, app }: TabProps) {
  const d = selectedDiagram(editor)
  if (!d) return null
  const data = d.data
  const set = (patch: Partial<DiagramData>) => updateDiagram(editor, d.pos, { ...data, ...patch })
  const edit = (action: Parameters<typeof editItems>[2]) => {
    const r = editItems(data.items, diagramCursor.index, action)
    diagramCursor.index = r.index
    set({ items: r.items })
  }
  const convert = () => {
    // Each shape becomes a floating shape of its own; together they form a group.
    const node = editor.state.doc.nodeAt(d.pos)
    if (!node) return
    const w = Number(node.attrs.width) || 576
    const h = Number(node.attrs.height) || 320
    const groupId = `g${Date.now().toString(36)}`
    const wrap = node.attrs.wrap === 'behind' ? 'behind' : 'front'
    const baseX = wrap === node.attrs.wrap ? Number(node.attrs.offsetX) || 0 : 0
    const baseY = wrap === node.attrs.wrap ? Number(node.attrs.offsetY) || 0 : 0
    const shapes = diagramShapes(data, w, h).map((s) =>
      editor.schema.nodes.shape.create({ ...shapeAttrsOf(s), wrap, offsetX: Math.round(baseX + s.x), offsetY: Math.round(baseY + s.y), groupId, groupX: Math.round(s.x), groupY: Math.round(s.y) }),
    )
    // A placeholder line keeps room for the floating shapes where the diagram was.
    editor.view.dispatch(editor.state.tr.replaceWith(d.pos, d.pos + node.nodeSize, shapes))
  }
  return (
    <>
      <RibbonGroup label="Create Graphic" priority={4}>
        <MenuButton
          large
          icon={ListPlus}
          label="Add Shape"
          items={[
            { label: 'Add Shape After', onClick: () => edit('after') },
            { label: 'Add Shape Before', onClick: () => edit('before') },
            { label: 'Add Shape Above', onClick: () => edit('above') },
            { label: 'Add Shape Below', onClick: () => edit('below') },
          ]}
        />
        <div className="col">
          <RibbonButton icon={ArrowLeftToLine} label="Promote" showLabel onClick={() => edit('promote')} />
          <RibbonButton icon={ArrowRightToLine} label="Demote" showLabel onClick={() => edit('demote')} />
          <RibbonButton icon={Trash2} label="Delete Shape" showLabel onClick={() => edit('delete')} />
        </div>
        <div className="col">
          <RibbonButton icon={ArrowUp} label="Move Up" showLabel onClick={() => edit('up')} />
          <RibbonButton icon={ArrowDown} label="Move Down" showLabel onClick={() => edit('down')} />
          <RibbonButton icon={PanelLeft} label="Text Pane" showLabel active={app.showDiagramPane} onClick={() => app.setShowDiagramPane(!app.showDiagramPane)} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Layouts" priority={3}>
        <MenuButton
          large
          icon={LayoutGrid}
          label="Change Layout"
          wide
          items={DIAGRAM_LAYOUTS.map((l) => ({ label: l.label, detail: l.category, active: data.layout === l.id, onClick: () => set({ layout: l.id }) }))}
        />
      </RibbonGroup>
      <RibbonGroup label="Diagram Styles" priority={3}>
        <MenuButton
          large
          icon={Palette}
          label="Change Colors"
          items={Object.entries(DIAGRAM_COLORS).map(([id, p]) => ({
            label: p.label,
            active: data.colors === id,
            preview: (
              <span className="palette-strip">
                {p.colors.slice(0, 5).map((c) => (
                  <span key={c} style={{ background: c }} />
                ))}
              </span>
            ),
            onClick: () => set({ colors: id }),
          }))}
        />
        <MenuButton large icon={Sparkles} label="Styles" items={DIAGRAM_STYLES.map((s) => ({ label: s.label, active: data.style === s.id, onClick: () => set({ style: s.id }) }))} />
      </RibbonGroup>
      <RibbonGroup label="Reset" priority={1}>
        <div className="col">
          <RibbonButton icon={RotateCcw} label="Reset Graphic" showLabel onClick={() => set({ colors: newDiagram(data.layout).colors, style: 'flat' })} />
          <RibbonButton icon={Shapes} label="Convert to Shapes" showLabel onClick={convert} />
        </div>
      </RibbonGroup>
      <ArrangeGroup editor={editor} app={app} />
      <SizeGroup editor={editor} unit={app.settings.unit} keepRatio={false} />
    </>
  )
}
