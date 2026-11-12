import { useEffect, useMemo, useRef } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ListTree, Plus, RotateCcw, Shapes, Type, Network, Palette, Paintbrush } from 'lucide-react'
import type { DiagramElement, DiagramLayout } from '../../model/types'
import { DIAGRAM_COLORS, DIAGRAM_LAYOUTS, DIAGRAM_STYLES, addNode, changeNodeLevel, defaultNodes, diagramToGroup, moveNode } from '../../model/diagram'
import { docFromText } from '../../model/richtext'
import { createTextBox } from '../../model/factory'
import { makeRenderCtx } from '../../render/context'
import { ElementView } from '../../render/ElementView'
import { commit, currentSlide, store, updateSlide, useStore } from '../../store/store'
import * as A from '../../store/actions'
import { MenuButton, PopoverButton, RibbonButton, RibbonGroup, SplitMenuButton, cls, keepFocus } from '../ui'
import { ArrangeButtons, ArrangeExtraButtons } from './common'
import type { TabProps } from './types'

function useDiagram() {
  return useStore((s) => {
    void s.pres
    return A.currentDiagram()
  })
}

/** Small rendering of a diagram layout (or of the selected diagram with other colors/styles). */
export function DiagramThumb({ layout, colors = 'primary', style = 'flat', width = 72, height = 54, nodes }: { layout: DiagramLayout; colors?: string; style?: string; width?: number; height?: number; nodes?: DiagramElement['nodes'] }) {
  const pres = useStore((s) => s.pres)
  const rc = useMemo(() => makeRenderCtx(pres, 1, 'blank'), [pres])
  const base = 320
  const d: DiagramElement = { id: `thumb-${layout}`, type: 'diagram', name: '', x: 0, y: 0, w: base, h: base * (height / width), rot: 0, layout, nodes: nodes ?? defaultNodes(layout).map((n) => ({ ...n, text: '' })), colors, style }
  return (
    <span className="diagram-thumb" style={{ width, height }}>
      <span style={{ position: 'absolute', left: 0, top: 0, width: base, height: d.h, transform: `scale(${width / base})`, transformOrigin: '0 0' }}>
        <ElementView el={d} rc={rc} mode="thumb" />
      </span>
    </span>
  )
}

const selNode = () => {
  const d = A.currentDiagram()
  const id = store.get().diagramNode
  return d && id && d.nodes.some((n) => n.id === id) ? id : (d?.nodes[d.nodes.length - 1]?.id ?? null)
}

export function addDiagramShape(where: 'after' | 'before' | 'above' | 'below') {
  const d = A.currentDiagram()
  if (!d) return
  const { nodes, id } = addNode(d.nodes, selNode(), where)
  A.updateDiagram((x) => ({ ...x, nodes }))
  store.set({ diagramNode: id, diagramPane: true })
}

function convertToShapes() {
  const d = A.currentDiagram()
  if (!d) return
  const g = diagramToGroup(d)
  const sid = store.get().slideId
  commit((p) => updateSlide(p, sid, (sl) => ({ ...sl, elements: sl.elements.map((e) => (e.id === d.id ? g : e)) })), { selection: [g.id] })
}

function convertToText() {
  const d = A.currentDiagram()
  if (!d) return
  const sl = currentSlide()
  const tb = createTextBox({ x: d.x, y: d.y, w: d.w, h: d.h }, sl.elements, true)
  const doc = { type: 'doc' as const, content: d.nodes.map((n) => ({ ...docFromText(n.text, { level: n.level, bullet: '•' }).content[0] })) }
  const el = { ...tb, text: { ...tb.text!, doc, autofit: 'shrink' as const } }
  const sid = store.get().slideId
  commit((p) => updateSlide(p, sid, (s) => ({ ...s, elements: s.elements.map((e) => (e.id === d.id ? el : e)) })), { selection: [el.id] })
}

export function DiagramDesignTab({ ui }: TabProps) {
  const d = useDiagram()
  const pane = useStore((s) => s.diagramPane)
  const node = d ? selNode() : null
  const upd = (fn: (x: DiagramElement) => Partial<DiagramElement>) => A.updateDiagram((x) => ({ ...x, ...fn(x) }))
  return (
    <>
      <RibbonGroup label="Create Graphic">
        <SplitMenuButton
          icon={Plus}
          label="Add Shape"
          large
          disabled={!d}
          onClick={() => addDiagramShape('after')}
          items={[
            { label: 'Add Shape After', onClick: () => addDiagramShape('after') },
            { label: 'Add Shape Before', onClick: () => addDiagramShape('before') },
            { label: 'Add Shape Above', onClick: () => addDiagramShape('above') },
            { label: 'Add Shape Below', onClick: () => addDiagramShape('below') },
          ]}
        />
        <div className="col">
          <RibbonButton icon={ChevronLeft} label="Promote" showLabel disabled={!node} onClick={() => node && upd((x) => ({ nodes: changeNodeLevel(x.nodes, node, -1) }))} />
          <RibbonButton icon={ChevronRight} label="Demote" showLabel disabled={!node} onClick={() => node && upd((x) => ({ nodes: changeNodeLevel(x.nodes, node, 1) }))} />
          <RibbonButton icon={ListTree} label="Text Pane" showLabel active={pane} disabled={!d} onClick={() => store.set({ diagramPane: !pane })} />
        </div>
        <div className="col">
          <RibbonButton icon={ArrowUp} label="Move Up" showLabel disabled={!node} onClick={() => node && upd((x) => ({ nodes: moveNode(x.nodes, node, -1) }))} />
          <RibbonButton icon={ArrowDown} label="Move Down" showLabel disabled={!node} onClick={() => node && upd((x) => ({ nodes: moveNode(x.nodes, node, 1) }))} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Layouts" icon={Network}>
        <div className="inline-gallery">
          {DIAGRAM_LAYOUTS.slice(0, 4).map((l) => (
            <button key={l.id} type="button" title={l.label} className={cls('chart-style-item', d?.layout === l.id && 'is-active')} disabled={!d} onMouseDown={keepFocus} onClick={() => upd(() => ({ layout: l.id }))}>
              <DiagramThumb layout={l.id} nodes={d?.nodes} width={60} height={44} />
            </button>
          ))}
          <PopoverButton icon={Network} label="More Layouts" disabled={!d} panelClass="menu-wide">
            {(close) => (
              <div className="diagram-layout-grid">
                {DIAGRAM_LAYOUTS.map((l) => (
                  <button key={l.id} type="button" title={l.label} className={cls('chart-style-item', d?.layout === l.id && 'is-active')} onMouseDown={keepFocus} onClick={() => (close(), upd(() => ({ layout: l.id })))}>
                    <DiagramThumb layout={l.id} nodes={d?.nodes} />
                  </button>
                ))}
              </div>
            )}
          </PopoverButton>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Diagram Styles" icon={Paintbrush}>
        <PopoverButton icon={Palette} label="Change Colors" large disabled={!d} panelClass="menu-wide">
          {(close) => (
            <div className="diagram-colors">
              {DIAGRAM_COLORS.map((c) => (
                <button key={c.id} type="button" title={c.label} className={cls('chart-style-item', d?.colors === c.id && 'is-active')} onMouseDown={keepFocus} onClick={() => (close(), upd(() => ({ colors: c.id })))}>
                  <DiagramThumb layout={d?.layout ?? 'basicList'} colors={c.id} style={d?.style} nodes={d?.nodes} width={60} height={40} />
                </button>
              ))}
            </div>
          )}
        </PopoverButton>
        <div className="inline-gallery">
          {DIAGRAM_STYLES.map((st) => (
            <button key={st.id} type="button" title={st.label} className={cls('chart-style-item', d?.style === st.id && 'is-active')} disabled={!d} onMouseDown={keepFocus} onClick={() => upd(() => ({ style: st.id }))}>
              <DiagramThumb layout={d?.layout ?? 'basicList'} colors={d?.colors} style={st.id} nodes={d?.nodes} width={48} height={40} />
            </button>
          ))}
        </div>
      </RibbonGroup>
      <RibbonGroup label="Reset">
        <RibbonButton icon={RotateCcw} label="Reset Graphic" large disabled={!d} onClick={() => upd(() => ({ colors: 'primary', style: 'flat' }))} />
        <MenuButton
          icon={Shapes}
          label="Convert"
          large
          disabled={!d}
          items={[
            { label: 'Convert to Text', icon: Type, onClick: convertToText },
            { label: 'Convert to Shapes', icon: Shapes, onClick: convertToShapes },
          ]}
        />
      </RibbonGroup>
      <RibbonGroup label="Arrange">
        <ArrangeButtons ui={ui} />
        <ArrangeExtraButtons />
      </RibbonGroup>
    </>
  )
}

/** The outline next to the selected diagram: one line per shape; Tab/Shift+Tab change the level. */
export function DiagramTextPane({ d, style }: { d: DiagramElement; style: React.CSSProperties }) {
  const focusId = useStore((s) => s.diagramNode)
  const refs = useRef(new Map<string, HTMLInputElement>())
  useEffect(() => {
    if (focusId) refs.current.get(focusId)?.focus()
  }, [focusId, d.nodes.length])
  const set = (nodes: DiagramElement['nodes']) => A.updateDiagram((x) => ({ ...x, nodes }))
  return (
    <div className="diagram-pane" style={style} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <div className="diagram-pane-head">
        <span>Type your text here</span>
        <button type="button" aria-label="Close text pane" onClick={() => store.set({ diagramPane: false })}>
          ×
        </button>
      </div>
      <ul>
        {d.nodes.map((n, i) => (
          <li key={n.id} style={{ paddingLeft: 8 + n.level * 18 }}>
            <span className="dp-bullet">•</span>
            <input
              ref={(el) => {
                if (el) refs.current.set(n.id, el)
                else refs.current.delete(n.id)
              }}
              value={n.text}
              placeholder="[Text]"
              aria-label={`Diagram text ${i + 1}`}
              onFocus={() => store.get().diagramNode !== n.id && store.set({ diagramNode: n.id })}
              onChange={(e) => set(d.nodes.map((x) => (x.id === n.id ? { ...x, text: e.target.value } : x)))}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const r = addNode(d.nodes, n.id, 'after')
                  // Enter adds a sibling right after this line (children stay with their parent).
                  const at = d.nodes.indexOf(n) + 1
                  const nodes = [...d.nodes.slice(0, at), { id: r.id, text: '', level: n.level }, ...d.nodes.slice(at)]
                  set(nodes)
                  store.set({ diagramNode: r.id })
                } else if (e.key === 'Tab') {
                  e.preventDefault()
                  set(changeNodeLevel(d.nodes, n.id, e.shiftKey ? -1 : 1))
                } else if (e.key === 'Backspace' && !n.text && d.nodes.length > 1) {
                  e.preventDefault()
                  const prev = d.nodes[i - 1] ?? d.nodes[i + 1]
                  set(d.nodes.filter((x) => x.id !== n.id))
                  store.set({ diagramNode: prev?.id ?? null })
                } else if (e.key === 'ArrowUp' && i > 0) {
                  e.preventDefault()
                  store.set({ diagramNode: d.nodes[i - 1].id })
                } else if (e.key === 'ArrowDown' && i < d.nodes.length - 1) {
                  e.preventDefault()
                  store.set({ diagramNode: d.nodes[i + 1].id })
                } else if (e.key === 'Escape') {
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
            />
          </li>
        ))}
      </ul>
      <div className="diagram-pane-foot">{DIAGRAM_LAYOUTS.find((l) => l.id === d.layout)?.label}</div>
    </div>
  )
}
