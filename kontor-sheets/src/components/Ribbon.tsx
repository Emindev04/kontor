import { Suspense, lazy, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { ChevronUp } from 'lucide-react'
import { COLLAPSED_LEVEL, RibbonFitContext, cls, keepFocus } from './ui'
import { HomeTab } from './tabs/HomeTab'
import { FormulasTab } from './tabs/FormulasTab'
import { DrawTab, HelpTab, PageLayoutTab } from './tabs/OtherTabs'
import { DataTab, InsertTab, ReviewTab, ViewTab } from './tabs/MainTabs'
// contextual tabs load when a chart, table, PivotTable or object is first selected
const ctxTab = (name: 'ChartDesignTab' | 'ChartFormatTab' | 'ObjectFormatTab' | 'PivotAnalyzeTab' | 'PivotDesignTab' | 'SlicerTab' | 'TableDesignTab') =>
  lazy(() => import('./tabs/ContextTabs').then((m) => ({ default: m[name] })))
const ChartDesignTab = ctxTab('ChartDesignTab')
const ChartFormatTab = ctxTab('ChartFormatTab')
const ObjectFormatTab = ctxTab('ObjectFormatTab')
const PivotAnalyzeTab = ctxTab('PivotAnalyzeTab')
const PivotDesignTab = ctxTab('PivotDesignTab')
const SlicerTab = ctxTab('SlicerTab')
const TableDesignTab = ctxTab('TableDesignTab')
import { useApp, useDocVersion } from './appContext'
import { activeContext } from '../commands/objects'
import { prefs } from '../model/prefs'
import { t, tx } from '../i18n'

export type TabId =
  | 'home' | 'insert' | 'draw' | 'pageLayout' | 'formulas' | 'data' | 'review' | 'view' | 'help'
  | 'tableDesign' | 'chartDesign' | 'chartFormat' | 'shapeFormat' | 'slicer' | 'pivotAnalyze' | 'pivotDesign'

type TabDef = { id: TabId; label: string; panel: React.ComponentType; context?: 'table' | 'chart' | 'shape' | 'slicer' | 'pivot' }

const TABS: TabDef[] = [
  { id: 'home', label: tx('Home'), panel: HomeTab },
  // "{tab}" is always empty: it only gives the tab its own key, as some languages name the tab differently from the command.
  { id: 'insert', label: tx('Insert {tab}'), panel: InsertTab },
  { id: 'draw', label: tx('Draw'), panel: DrawTab },
  { id: 'pageLayout', label: tx('Page Layout'), panel: PageLayoutTab },
  { id: 'formulas', label: tx('Formulas'), panel: FormulasTab },
  { id: 'data', label: tx('Data'), panel: DataTab },
  { id: 'review', label: tx('Review'), panel: ReviewTab },
  { id: 'view', label: tx('View'), panel: ViewTab },
  { id: 'help', label: tx('Help'), panel: HelpTab },
  { id: 'tableDesign', label: tx('Table Design'), panel: TableDesignTab, context: 'table' },
  { id: 'pivotAnalyze', label: tx('PivotTable Analyze'), panel: PivotAnalyzeTab, context: 'pivot' },
  { id: 'pivotDesign', label: tx('Design'), panel: PivotDesignTab, context: 'pivot' },
  { id: 'chartDesign', label: tx('Chart Design'), panel: ChartDesignTab, context: 'chart' },
  { id: 'chartFormat', label: tx('Format'), panel: ChartFormatTab, context: 'chart' },
  { id: 'shapeFormat', label: tx('Shape Format'), panel: ObjectFormatTab, context: 'shape' },
  { id: 'slicer', label: tx('Slicer'), panel: SlicerTab, context: 'slicer' },
]

/** The shown name of a ribbon tab. */
export const tabLabel = (label: string) => t(label, { tab: '' }).trim()

/** Main tabs that File > Options > Customize the Ribbon can hide (Home always stays). */
export const CUSTOMIZABLE_TABS = TABS.filter((t) => !t.context && t.id !== 'home').map((t) => ({ id: t.id, label: t.label }))

type Props = { active: TabId; setActive: (t: TabId) => void; onFile: () => void; collapsed: boolean; setCollapsed: (c: boolean) => void }

type Step = { name: string; level: number }

/**
 * The order in which groups give up room, like the original ribbon: every group shrinks in
 * steps (labels go, large buttons get small, then the group collapses), and groups with a lower
 * priority — and, at equal priority, groups further right — shrink first. The first, mild step
 * (small buttons drop their labels, boxes get narrower) happens everywhere before anything else.
 */
function scaleSteps(groups: HTMLElement[]): Step[] {
  const steps: (Step & { key: number; index: number })[] = []
  groups.forEach((g, index) => {
    const priority = Number(g.dataset.priority ?? 2)
    for (let level = 1; level <= COLLAPSED_LEVEL; level++) steps.push({ name: g.dataset.rg ?? '', level, key: level === 1 ? priority / 100 : priority * 2 + level, index })
  })
  steps.sort((a, b) => a.key - b.key || b.index - a.index || a.level - b.level)
  return steps
}

function levelsFor(steps: Step[], k: number) {
  const m = new Map<string, number>()
  for (const s of steps.slice(0, k)) m.set(s.name, s.level)
  return m
}

/** Mounts once a lazily loaded tab has rendered, so the ribbon can measure its groups again. */
function Ready({ onReady }: { onReady: () => void }) {
  useLayoutEffect(() => onReady(), [onReady])
  return null
}

// warm up the contextual tabs while the user is still looking at the sheet
if (typeof window !== 'undefined') setTimeout(() => void import('./tabs/ContextTabs'), 1500)

export function Ribbon({ active, setActive, onFile, collapsed, setCollapsed }: Props) {
  const [, force] = useState(0)
  const remeasure = useCallback(() => force((n) => n + 1), [])
  const app = useApp()
  useDocVersion(app.doc)
  const ctx = activeContext(app.doc)
  const hiddenTabs = prefs().hiddenTabs
  const visible = TABS.filter((t) => (!t.context || t.context === ctx) && !hiddenTabs.includes(t.id))
  const tab = visible.find((t) => t.id === active) ?? visible[0]
  const Panel = tab.panel
  const ribbon = useRef<HTMLDivElement>(null)
  // total width of the tab's groups after k scale steps, per tab
  const widths = useRef(new Map<string, number>())
  const steps = useRef(new Map<TabId, Step[]>())
  const lastK = useRef(new Map<TabId, number>())
  const burst = useRef(0)
  // steps that did not save any room, never applied again
  const skip = useRef(new Set<string>())
  const [fit, setFit] = useState<{ tab: TabId; k: number }>({ tab: tab.id, k: 0 })
  const [avail, setAvail] = useState(0)
  const k = fit.tab === tab.id ? fit.k : (lastK.current.get(tab.id) ?? 0)
  const levels = levelsFor(steps.current.get(tab.id) ?? [], k)

  useLayoutEffect(() => {
    const el = ribbon.current
    if (!el) return
    const ro = new ResizeObserver(() => setAvail(el.clientWidth))
    ro.observe(el)
    setAvail(el.clientWidth)
    return () => ro.disconnect()
  }, [collapsed])

  // Scale groups down step by step until the tab fits, and back up when there is room again.
  useLayoutEffect(() => {
    const el = ribbon.current
    if (!el || !avail) return
    const groups = [...el.querySelectorAll<HTMLElement>(':scope > .rg')]
    const stepKey = (st: Step) => `${tab.id}:${st.name}:${st.level}`
    const dropWidths = (from: number) => {
      for (const key of [...widths.current.keys()]) {
        const [t, i] = key.split(':')
        if (t === tab.id && Number(i) >= from) widths.current.delete(key)
      }
    }
    const plan = scaleSteps(groups).filter((st) => !skip.current.has(stepKey(st)))
    const known = steps.current.get(tab.id)
    if (!known || known.length !== plan.length || known.some((st, i) => st.name !== plan[i].name || st.level !== plan[i].level)) {
      steps.current.set(tab.id, plan)
      dropWidths(0)
    }
    const at = Math.min(k, plan.length)
    const total = groups.reduce((sum, g) => sum + g.getBoundingClientRect().width, 0)
    // A step that buys no room (a lone button that turns small under a wide label, a group that
    // is already narrower than its collapsed form) only makes the ribbon look worse: drop it.
    const before = at > 0 ? widths.current.get(`${tab.id}:${at - 1}`) : undefined
    if (before !== undefined && total > before - 2) {
      skip.current.add(stepKey(plan[at - 1]))
      steps.current.set(tab.id, plan.filter((_, i) => i !== at - 1))
      dropWidths(at)
      setFit({ tab: tab.id, k: at - 1 })
      return
    }
    widths.current.set(`${tab.id}:${at}`, total)
    lastK.current.set(tab.id, at)
    const room = avail - 8
    let next = at
    if (total > room && at < plan.length) next = at + 1
    else if (total <= room && at > 0) {
      const wider = widths.current.get(`${tab.id}:${at - 1}`)
      if (wider !== undefined && wider <= room) next = at - 1
    }
    if (next === k && fit.tab === tab.id) {
      burst.current = 0
      return
    }
    // React caps nested updates; spread very long scaling runs over frames
    if (++burst.current > 40) {
      burst.current = 0
      const id = requestAnimationFrame(() => setFit({ tab: tab.id, k: next }))
      return () => cancelAnimationFrame(id)
    }
    setFit({ tab: tab.id, k: next })
  })

  const tabButton = (def: TabDef) => (
    <button
      key={def.id}
      type="button"
      role="tab"
      aria-selected={tab.id === def.id}
      className={cls('tab', def.context && 'tab-context', tab.id === def.id && !collapsed && 'is-active')}
      onMouseDown={keepFocus}
      onClick={() => {
        setActive(def.id)
        if (collapsed) setCollapsed(false)
      }}
      onDoubleClick={() => setCollapsed(!collapsed)}
    >
      {tabLabel(def.label)}
    </button>
  )

  return (
    <div className="ribbon-wrap">
      <nav className="tabs" role="tablist">
        <button type="button" className="tab tab-file" onMouseDown={keepFocus} onClick={onFile}>
          {t('File')}
        </button>
        {visible.map(tabButton)}
        <span className="spacer" />
        {!collapsed && (
          <button type="button" className="tab ribbon-toggle" title={t('Collapse the Ribbon (Ctrl+F1)')} aria-label={t('Collapse the Ribbon')} onMouseDown={keepFocus} onClick={() => setCollapsed(true)}>
            <ChevronUp size={14} />
          </button>
        )}
      </nav>
      {!collapsed && (
        <div className="ribbon" role="tabpanel" aria-label={tabLabel(tab.label)} ref={ribbon}>
          <RibbonFitContext.Provider value={levels}>
            <Suspense fallback={null}>
              <Panel />
              <Ready onReady={remeasure} />
            </Suspense>
          </RibbonFitContext.Provider>
        </div>
      )}
    </div>
  )
}

