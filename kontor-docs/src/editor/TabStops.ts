import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

// Custom tab stops (ruler and Tabs dialog): left, center, right, decimal and bar tabs with dot,
// dash or underline leaders. Paragraphs without their own stops keep the default 0.5" stops (CSS).
//
// Each tab character of a paragraph with custom stops is drawn as an inline box whose width is
// computed after layout: from where the tab starts to the next stop, minus the following text for
// right/centered/decimal stops.

export type TabAlign = 'left' | 'center' | 'right' | 'decimal' | 'bar'
export type TabLeader = 'none' | 'dot' | 'dash' | 'underline'
export type TabStop = { pos: number; align: TabAlign; leader: TabLeader }

const PX_PER_IN = 96
const DEFAULT_STEP = 0.5 * PX_PER_IN

type State = { widths: Map<number, number>; decorations: DecorationSet }
export const tabStopsKey = new PluginKey<State>('tabStops')

function build(doc: PMNode, widths: Map<number, number>) {
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return
    const stops = (node.attrs.tabStops as TabStop[] | null) ?? null
    if (!stops?.length) return false
    node.forEach((child, offset) => {
      if (!child.isText || !child.text?.includes('\t')) return
      for (let i = 0; i < child.text.length; i++) {
        if (child.text[i] !== '\t') continue
        const at = pos + 1 + offset + i
        const w = widths.get(at)
        const leader = (widths.get(-at) ?? 0) as number
        const leaderClass = ['', ' tab-dot', ' tab-dash', ' tab-underline'][leader] ?? ''
        decos.push(Decoration.inline(at, at + 1, { class: `tab-char${leaderClass}`, style: w != null ? `width: ${Math.max(1, w)}px` : '' }))
      }
    })
    return false
  })
  return DecorationSet.create(doc, decos)
}

/** Measures every tab of paragraphs with custom stops and returns the widths they need. */
export function measure(view: EditorView) {
  const widths = new Map<number, number>()
  const root = view.dom.getBoundingClientRect()
  // Page zoom: screen pixels per CSS pixel of the document.
  const scale = root.width / (parseFloat(getComputedStyle(view.dom).width) || root.width) || 1
  view.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return
    const stops = ((node.attrs.tabStops as TabStop[] | null) ?? []).slice().sort((a, b) => a.pos - b.pos)
    if (!stops.length) return false
    const dom = view.nodeDOM(pos) as HTMLElement | null
    if (!dom) return false
    // Tab positions count from the left margin (or the cell's content edge in tables).
    const container = (dom.closest('td, th') as HTMLElement | null) ?? view.dom
    const left = container.getBoundingClientRect().left + (parseFloat(getComputedStyle(container).paddingLeft) || 0) * scale
    const tabs: number[] = []
    node.forEach((child, offset) => {
      if (child.isText && child.text) for (let i = 0; i < child.text.length; i++) if (child.text[i] === '\t') tabs.push(pos + 1 + offset + i)
    })
    const spans = Array.from(dom.querySelectorAll<HTMLElement>('.tab-char'))
    let lineTop = -1
    let shift = 0
    tabs.forEach((at, k) => {
      const c = view.coordsAtPos(at, 1)
      if (Math.abs(c.top - lineTop) > 2) {
        lineTop = c.top
        shift = 0
      }
      // Every tab of the paragraph is drawn as a .tab-char box, in document order.
      const span = spans[k]
      const oldW = span ? span.getBoundingClientRect().width / scale : 0
      const x = (c.left - left) / scale + shift
      const stop = stops.find((s) => s.pos * PX_PER_IN > x + 1)
      let w: number
      let leader: TabLeader = 'none'
      if (!stop) w = Math.ceil((x + 1) / DEFAULT_STEP) * DEFAULT_STEP - x
      else {
        const stopX = stop.pos * PX_PER_IN
        leader = stop.leader
        // The text up to the next tab (or the end of the line) for right, centered and decimal stops.
        const next = tabs[k + 1] ?? pos + node.nodeSize - 1
        const segStart = view.coordsAtPos(at + 1, 1)
        const segEnd = view.coordsAtPos(next, -1)
        const sameLine = Math.abs(segEnd.top - segStart.top) < 2
        const segW = sameLine ? (segEnd.left - segStart.left) / scale : 0
        let decimalW = segW
        if (stop.align === 'decimal') {
          const text = view.state.doc.textBetween(at + 1, next)
          const dot = text.search(/[.,]\d/)
          if (dot >= 0) decimalW = (view.coordsAtPos(at + 1 + dot, 1).left - segStart.left) / scale
        }
        w = stop.align === 'right' ? stopX - x - segW : stop.align === 'center' ? stopX - x - segW / 2 : stop.align === 'decimal' ? stopX - x - decimalW : stopX - x
        if (w < 1) w = Math.ceil((x + 1) / DEFAULT_STEP) * DEFAULT_STEP - x
      }
      widths.set(at, Math.round(w * 10) / 10)
      widths.set(-at, ['none', 'dot', 'dash', 'underline'].indexOf(leader))
      shift += w - oldW
    })
    return false
  })
  return widths
}

const same = (a: Map<number, number>, b: Map<number, number>) => a.size === b.size && [...a].every(([k, v]) => Math.abs((b.get(k) ?? -1e9) - v) < 0.6)

export const TabStops = Extension.create({
  name: 'tabStops',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          tabStops: {
            default: null,
            parseHTML: (el) => {
              try {
                return el.getAttribute('data-tabs') ? JSON.parse(el.getAttribute('data-tabs')!) : null
              } catch {
                return null
              }
            },
            renderHTML: (a) => (a.tabStops?.length ? { 'data-tabs': JSON.stringify(a.tabStops) } : {}),
          },
        },
      },
    ]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<State>({
        key: tabStopsKey,
        state: {
          init: (_, state) => ({ widths: new Map(), decorations: build(state.doc, new Map()) }),
          apply(tr, prev, _old, state) {
            const widths = tr.getMeta(tabStopsKey) as Map<number, number> | undefined
            if (widths) return { widths, decorations: build(state.doc, widths) }
            if (!tr.docChanged) return prev
            const mapped = new Map<number, number>()
            for (const [k, v] of prev.widths) {
              const m = tr.mapping.map(Math.abs(k))
              mapped.set(k < 0 ? -m : m, v)
            }
            return { widths: mapped, decorations: build(state.doc, mapped) }
          },
        },
        props: { decorations: (state) => tabStopsKey.getState(state)?.decorations },
        view: (view) => {
          // Per plugin view: the editor may recreate plugin views (e.g. when plugins are registered).
          let frame = 0
          let passes = 0
          let timer: ReturnType<typeof setTimeout> | undefined
          const run = () => {
            cancelAnimationFrame(frame)
            clearTimeout(timer)
            frame = 0
            if (view.isDestroyed) return
            const current = tabStopsKey.getState(view.state)!.widths
            let next: Map<number, number>
            try {
              next = measure(view)
            } catch (error) {
              console.warn('Tab stop layout failed', error)
              return
            }
            if (!same(current, next) && passes < 4) {
              passes++
              view.dispatch(view.state.tr.setMeta(tabStopsKey, next).setMeta('addToHistory', false))
            } else passes = 0
          }
          const schedule = () => {
            if (frame) return
            // Next frame normally; the timer covers background tabs, where frames are paused.
            frame = requestAnimationFrame(run)
            timer = setTimeout(run, 120)
          }
          schedule()
          return {
            update: (v, prevState) => {
              if (v.state.doc !== prevState.doc || tabStopsKey.getState(v.state)!.widths !== tabStopsKey.getState(prevState)!.widths) schedule()
            },
            destroy: () => {
              cancelAnimationFrame(frame)
              clearTimeout(timer)
              frame = 0
            },
          }
        },
      }),
    ]
  },
})
