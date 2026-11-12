import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { selectedElements, store, useStore } from '../store/store'
import { cls, keepFocus, RibbonScaleContext, useRibbonScale } from './ui'
import { HomeTab } from './tabs/HomeTab'
import { HandoutMasterTab, NotesMasterTab, SlideMasterTab } from './MasterViews'
import type { UiApi } from './tabs/types'

type TabComponent = ComponentType<{ ui: UiApi }>

/** Tabs other than Home are loaded on demand (and prefetched when the browser is idle). */
const TAB_LOADERS: Record<string, () => Promise<TabComponent>> = {
  insert: () => import('./tabs/InsertTab').then((m) => m.InsertTab),
  draw: () => import('./tabs/InsertTab').then((m) => m.DrawTab as TabComponent),
  design: () => import('./tabs/DesignTab').then((m) => m.DesignTab),
  transitions: () => import('./tabs/TransitionsTab').then((m) => m.TransitionsTab as TabComponent),
  animations: () => import('./tabs/AnimationsTab').then((m) => m.AnimationsTab as TabComponent),
  slideshow: () => import('./tabs/ShowTabs').then((m) => m.SlideShowTab),
  record: () => import('./tabs/ShowTabs').then((m) => m.RecordTab as TabComponent),
  review: () => import('./tabs/ShowTabs').then((m) => m.ReviewTab),
  view: () => import('./tabs/ShowTabs').then((m) => m.ViewTab),
  help: () => import('./tabs/ShowTabs').then((m) => m.HelpTab),
  shapeFormat: () => import('./tabs/FormatTabs').then((m) => m.ShapeFormatTab),
  pictureFormat: () => import('./tabs/FormatTabs').then((m) => m.PictureFormatTab),
  tableDesign: () => import('./tabs/TableTabs').then((m) => m.TableDesignTab),
  tableLayout: () => import('./tabs/TableTabs').then((m) => m.TableLayoutTab),
  chartDesign: () => import('./tabs/ChartTabs').then((m) => m.ChartDesignTab),
  chartFormat: () => import('./tabs/ChartTabs').then((m) => m.ChartFormatTab),
  diagramDesign: () => import('./tabs/DiagramTabs').then((m) => m.DiagramDesignTab),
  playback: () => import('./tabs/MediaTabs').then((m) => m.PlaybackTab),
}
const loadedTabs = new Map<string, TabComponent>()

function loadTab(id: string) {
  const loader = TAB_LOADERS[id]
  return loader ? loader().then((c) => (loadedTabs.set(id, c), c)) : Promise.resolve(null)
}

/** The component of a tab, or null while it loads (the ribbon re-renders, and re-measures, when it arrives). */
function useTab(id: string): TabComponent | null {
  const [, setTick] = useState(0)
  const ready = loadedTabs.get(id) ?? null
  useEffect(() => {
    if (ready || !TAB_LOADERS[id]) return
    let live = true
    loadTab(id).then(() => live && setTick((t) => t + 1))
    return () => {
      live = false
    }
  }, [id, ready])
  return ready
}

const TABS: { id: string; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'insert', label: 'Insert' },
  { id: 'draw', label: 'Draw' },
  { id: 'design', label: 'Design' },
  { id: 'transitions', label: 'Transitions' },
  { id: 'animations', label: 'Animations' },
  { id: 'slideshow', label: 'Slide Show' },
  { id: 'record', label: 'Record' },
  { id: 'review', label: 'Review' },
  { id: 'view', label: 'View' },
  { id: 'help', label: 'Help' },
]

const MASTER_TABS: Record<string, { id: string; label: string }> = {
  master: { id: 'slideMaster', label: 'Slide Master' },
  handoutMaster: { id: 'handoutMaster', label: 'Handout Master' },
  notesMaster: { id: 'notesMaster', label: 'Notes Master' },
}

export function Ribbon({ ui, onFile }: { ui: UiApi; onFile: () => void }) {
  const view = useStore((s) => s.view)
  const masterTab = MASTER_TABS[view]
  const tab0 = useStore((s) => s.tab)
  const tab = !masterTab && ['slideMaster', 'handoutMaster', 'notesMaster'].includes(tab0) ? 'home' : tab0
  const kinds = useStore(() => selectedElements().map((e) => e.type))
  const hasShape = kinds.some((k) => k === 'shape' || k === 'group' || k === 'ink')
  const hasPicture = kinds.includes('image')
  const hasTable = kinds.length === 1 && kinds[0] === 'table'
  const hasChart = kinds.length === 1 && kinds[0] === 'chart'
  const hasDiagram = kinds.length === 1 && kinds[0] === 'diagram'
  const hasMedia = kinds.length === 1 && kinds[0] === 'media'
  const current =
    (tab === 'shapeFormat' && !hasShape) || (tab === 'pictureFormat' && !hasPicture) || ((tab === 'tableDesign' || tab === 'tableLayout') && !hasTable) || ((tab === 'chartDesign' || tab === 'chartFormat') && !hasChart) || (tab === 'diagramDesign' && !hasDiagram) || (tab === 'playback' && !hasMedia) ? 'home' : tab

  useEffect(() => {
    const onTab = (e: Event) => store.set({ tab: (e as CustomEvent<string>).detail })
    window.addEventListener('kontor:tab', onTab)
    return () => window.removeEventListener('kontor:tab', onTab)
  }, [])

  const { panelRef, levels } = useRibbonScale(current)
  // Keep the active tab visible when the tab strip is too narrow (contextual tabs sit at the end).
  useEffect(() => {
    document.querySelector('.tabs .tab.is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [current, hasTable, hasChart, hasDiagram, hasMedia, hasShape, hasPicture])

  // Prefetch the other tabs once the editor is up, so switching tabs never waits.
  useEffect(() => {
    const prefetch = () => Object.keys(TAB_LOADERS).forEach((id) => loadedTabs.has(id) || loadTab(id))
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
    const t = idle ? idle(prefetch) : window.setTimeout(prefetch, 1500)
    return () => {
      if (!idle) clearTimeout(t)
    }
  }, [])

  const Lazy = useTab(current)
  const fixed: Record<string, ReactNode> = {
    home: <HomeTab ui={ui} />,
    slideMaster: <SlideMasterTab ui={ui} />,
    handoutMaster: <HandoutMasterTab />,
    notesMaster: <NotesMasterTab />,
  }
  const panel = fixed[current] ?? (Lazy ? <Lazy ui={ui} /> : TAB_LOADERS[current] ? null : fixed.home)

  return (
    <div className="ribbon-wrap">
      <nav className="tabs" role="tablist">
        <button type="button" className="tab tab-file" onMouseDown={keepFocus} onClick={onFile}>
          File
        </button>
        {masterTab && (
          <button type="button" role="tab" aria-selected={current === masterTab.id} className={cls('tab', current === masterTab.id && 'is-active')} onMouseDown={keepFocus} onClick={() => store.set({ tab: masterTab.id })}>
            {masterTab.label}
          </button>
        )}
        {TABS.filter((t) => !masterTab || view === 'master' || ['view', 'help'].includes(t.id)).map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={current === t.id} className={cls('tab', current === t.id && 'is-active')} onMouseDown={keepFocus} onClick={() => store.set({ tab: t.id })}>
            {t.label}
          </button>
        ))}
        {hasShape && (
          <button type="button" role="tab" aria-selected={current === 'shapeFormat'} className={cls('tab tab-context', current === 'shapeFormat' && 'is-active')} onMouseDown={keepFocus} onClick={() => store.set({ tab: 'shapeFormat' })}>
            Shape Format
          </button>
        )}
        {hasTable && (
          <>
            <button type="button" role="tab" aria-selected={current === 'tableDesign'} className={cls('tab tab-context', current === 'tableDesign' && 'is-active')} onMouseDown={keepFocus} onClick={() => store.set({ tab: 'tableDesign' })}>
              Table Design
            </button>
            <button type="button" role="tab" aria-selected={current === 'tableLayout'} className={cls('tab tab-context', current === 'tableLayout' && 'is-active')} onMouseDown={keepFocus} onClick={() => store.set({ tab: 'tableLayout' })}>
              Layout
            </button>
          </>
        )}
        {hasChart && (
          <>
            <button type="button" role="tab" aria-selected={current === 'chartDesign'} className={cls('tab tab-context', current === 'chartDesign' && 'is-active')} onMouseDown={keepFocus} onClick={() => store.set({ tab: 'chartDesign' })}>
              Chart Design
            </button>
            <button type="button" role="tab" aria-selected={current === 'chartFormat'} className={cls('tab tab-context', current === 'chartFormat' && 'is-active')} onMouseDown={keepFocus} onClick={() => store.set({ tab: 'chartFormat' })}>
              Format
            </button>
          </>
        )}
        {hasDiagram && (
          <button type="button" role="tab" aria-selected={current === 'diagramDesign'} className={cls('tab tab-context', current === 'diagramDesign' && 'is-active')} onMouseDown={keepFocus} onClick={() => store.set({ tab: 'diagramDesign' })}>
            Diagram Design
          </button>
        )}
        {hasMedia && (
          <button type="button" role="tab" aria-selected={current === 'playback'} className={cls('tab tab-context', current === 'playback' && 'is-active')} onMouseDown={keepFocus} onClick={() => store.set({ tab: 'playback' })}>
            Playback
          </button>
        )}
        {hasPicture && (
          <button type="button" role="tab" aria-selected={current === 'pictureFormat'} className={cls('tab tab-context', current === 'pictureFormat' && 'is-active')} onMouseDown={keepFocus} onClick={() => store.set({ tab: 'pictureFormat' })}>
            Picture Format
          </button>
        )}
      </nav>
      <div className="ribbon" role="tabpanel" ref={panelRef}>
        <RibbonScaleContext.Provider value={levels}>{panel}</RibbonScaleContext.Provider>
      </div>
    </div>
  )
}
