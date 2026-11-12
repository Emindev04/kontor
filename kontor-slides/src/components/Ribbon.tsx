import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { selectedElements, store, useStore } from '../store/store'
import { cls, keepFocus, RibbonScaleContext, useRibbonScale } from './ui'
import { HomeTab } from './tabs/HomeTab'
import { HandoutMasterTab, NotesMasterTab, SlideMasterTab } from './MasterViews'
import type { UiApi } from './tabs/types'
import { t, tx } from '../i18n'

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
  { id: 'home', label: tx('Home') },
  { id: 'insert', label: tx('Insert') },
  { id: 'draw', label: tx('Draw') },
  { id: 'design', label: tx('Design') },
  { id: 'transitions', label: tx('Transitions') },
  { id: 'animations', label: tx('Animations') },
  { id: 'slideshow', label: tx('Slide Show') },
  { id: 'record', label: tx('Record') },
  { id: 'review', label: tx('Review') },
  { id: 'view', label: tx('View') },
  { id: 'help', label: tx('Help') },
]

const MASTER_TABS: Record<string, { id: string; label: string }> = {
  master: { id: 'slideMaster', label: tx('Slide Master') },
  handoutMaster: { id: 'handoutMaster', label: tx('Handout Master') },
  notesMaster: { id: 'notesMaster', label: tx('Notes Master') },
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
          {t('File')}
        </button>
        {masterTab && (
          <button type="button" role="tab" aria-selected={current === masterTab.id} className={cls('tab', current === masterTab.id && 'is-active')} onMouseDown={keepFocus} onClick={() => store.set({ tab: masterTab.id })}>
            {t(masterTab.label)}
          </button>
        )}
        {TABS.filter((tb) => !masterTab || view === 'master' || ['view', 'help'].includes(tb.id)).map((tb) => (
          <button key={tb.id} type="button" role="tab" aria-selected={current === tb.id} className={cls('tab', current === tb.id && 'is-active')} onMouseDown={keepFocus} onClick={() => store.set({ tab: tb.id })}>
            {t(tb.label)}
          </button>
        ))}
        {hasShape && (
          <button type="button" role="tab" aria-selected={current === 'shapeFormat'} className={cls('tab tab-context', current === 'shapeFormat' && 'is-active')} onMouseDown={keepFocus} onClick={() => store.set({ tab: 'shapeFormat' })}>
            {t('Shape Format')}
          </button>
        )}
        {hasTable && (
          <>
            <button type="button" role="tab" aria-selected={current === 'tableDesign'} className={cls('tab tab-context', current === 'tableDesign' && 'is-active')} onMouseDown={keepFocus} onClick={() => store.set({ tab: 'tableDesign' })}>
              {t('Table Design')}
            </button>
            <button type="button" role="tab" aria-selected={current === 'tableLayout'} className={cls('tab tab-context', current === 'tableLayout' && 'is-active')} onMouseDown={keepFocus} onClick={() => store.set({ tab: 'tableLayout' })}>
              {t('Layout')}
            </button>
          </>
        )}
        {hasChart && (
          <>
            <button type="button" role="tab" aria-selected={current === 'chartDesign'} className={cls('tab tab-context', current === 'chartDesign' && 'is-active')} onMouseDown={keepFocus} onClick={() => store.set({ tab: 'chartDesign' })}>
              {t('Chart Design')}
            </button>
            <button type="button" role="tab" aria-selected={current === 'chartFormat'} className={cls('tab tab-context', current === 'chartFormat' && 'is-active')} onMouseDown={keepFocus} onClick={() => store.set({ tab: 'chartFormat' })}>
              {t('Format')}
            </button>
          </>
        )}
        {hasDiagram && (
          <button type="button" role="tab" aria-selected={current === 'diagramDesign'} className={cls('tab tab-context', current === 'diagramDesign' && 'is-active')} onMouseDown={keepFocus} onClick={() => store.set({ tab: 'diagramDesign' })}>
            {t('Diagram Design')}
          </button>
        )}
        {hasMedia && (
          <button type="button" role="tab" aria-selected={current === 'playback'} className={cls('tab tab-context', current === 'playback' && 'is-active')} onMouseDown={keepFocus} onClick={() => store.set({ tab: 'playback' })}>
            {t('Playback')}
          </button>
        )}
        {hasPicture && (
          <button type="button" role="tab" aria-selected={current === 'pictureFormat'} className={cls('tab tab-context', current === 'pictureFormat' && 'is-active')} onMouseDown={keepFocus} onClick={() => store.set({ tab: 'pictureFormat' })}>
            {t('Picture Format')}
          </button>
        )}
      </nav>
      <div className="ribbon" role="tabpanel" ref={panelRef}>
        <RibbonScaleContext.Provider value={levels}>{panel}</RibbonScaleContext.Provider>
      </div>
    </div>
  )
}
