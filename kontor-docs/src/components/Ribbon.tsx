import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cls, keepFocus } from './ui'
import { HomeTab } from './tabs/HomeTab'
import type { TabProps } from './tabs/types'

export type TabId =
  | 'home'
  | 'insert'
  | 'draw'
  | 'design'
  | 'layout'
  | 'references'
  | 'mailings'
  | 'review'
  | 'view'
  | 'help'
  | 'hf'
  | 'tableDesign'
  | 'tableLayout'
  | 'picture'
  | 'shapeFormat'
  | 'chartDesign'
  | 'diagramDesign'
  | 'equation'
  | 'outlining'

const TABS: { id: TabId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'insert', label: 'Insert' },
  { id: 'draw', label: 'Draw' },
  { id: 'design', label: 'Design' },
  { id: 'layout', label: 'Layout' },
  { id: 'references', label: 'References' },
  { id: 'mailings', label: 'Mailings' },
  { id: 'review', label: 'Review' },
  { id: 'view', label: 'View' },
  { id: 'help', label: 'Help' },
]

/** KeyTips: press and release Alt, then a letter, to open a tab without the mouse. */
const KEYTIPS: Partial<Record<TabId | 'file', string>> = {
  file: 'F', home: 'H', insert: 'N', draw: 'D', design: 'G', layout: 'P', references: 'S', mailings: 'M', review: 'R', view: 'W', help: 'Y',
}


// Only the Home tab is part of the first download; the other tabs load when first opened (and in
// the background once the app is idle).
const TAB_MODULES = {
  insert: () => import('./tabs/InsertTab').then((m) => m.InsertTab),
  draw: () => import('./tabs/DrawTab').then((m) => m.DrawTab),
  design: () => import('./tabs/DesignTab').then((m) => m.DesignTab),
  layout: () => import('./tabs/LayoutTab').then((m) => m.LayoutTab),
  references: () => import('./tabs/ReferencesTab').then((m) => m.ReferencesTab),
  mailings: () => import('./tabs/MailingsTab').then((m) => m.MailingsTab),
  review: () => import('./tabs/ReviewTab').then((m) => m.ReviewTab),
  view: () => import('./tabs/ViewTab').then((m) => m.ViewTab),
  help: () => import('./tabs/HelpTab').then((m) => m.HelpTab),
  hf: () => import('./tabs/HeaderFooterTab').then((m) => m.HeaderFooterTab),
  tableDesign: () => import('./tabs/TableTab').then((m) => m.TableDesignTab),
  tableLayout: () => import('./tabs/TableTab').then((m) => m.TableLayoutTab),
  picture: () => import('./tabs/PictureTab').then((m) => m.PictureTab),
  shapeFormat: () => import('./tabs/ShapeFormatTab').then((m) => m.ShapeFormatTab),
  chartDesign: () => import('./tabs/ChartTab').then((m) => m.ChartDesignTab),
  diagramDesign: () => import('./tabs/DiagramTab').then((m) => m.DiagramDesignTab),
  equation: () => import('./tabs/EquationTab').then((m) => m.EquationTab),
  outlining: () => import('./tabs/OutlineTab').then((m) => m.OutlineTab),
} satisfies Record<Exclude<TabId, 'home'>, () => Promise<unknown>>

/** Cost of each scaling level (compact, reduced, collapsed); added to the group's priority. */
const SCALE_COST = [0, 0, 2, 4]

// The level lives in a data attribute rather than a class: React rewrites `className` whenever a
// group re-renders (e.g. when its drop-down opens), which would undo the scaling.
function setScale(group: HTMLElement, level: number) {
  if (level) group.dataset.scale = String(level)
  else delete group.dataset.scale
}

/** Short, unique keys for the commands of a tab: their initials where possible, otherwise numbered. */
export function assignKeyTips(buttons: HTMLElement[]) {
  const used = new Set<string>()
  const out: { code: string; el: HTMLElement }[] = []
  for (const el of buttons) {
    const label = (el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.textContent ?? '').replace(/[^A-Za-z0-9 ]/g, ' ').trim()
    const words = label.split(/\s+/).filter(Boolean)
    const tries = [
      words[0]?.[0],
      words.length > 1 ? `${words[0][0]}${words[1][0]}` : words[0]?.slice(0, 2),
      ...[...(words.join('') || 'X')].slice(1, 6).map((c) => `${words[0]?.[0] ?? 'X'}${c}`),
    ]
      .filter((c): c is string => !!c)
      .map((c) => c.toUpperCase())
    // A one-letter key must not be the start of another key, so single letters are only used once.
    const free = (c: string) => !used.has(c) && ![...used].some((u) => u.startsWith(c) || c.startsWith(u))
    let code = tries.find(free)
    // Otherwise the first free two-character key (all fallbacks are the same length, so none is the
    // start of another); three characters only if every pair is taken.
    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    for (const a of ALPHABET) {
      if (code) break
      for (const b of ALPHABET) if (!code && free(a + b)) code = a + b
    }
    code ??= `Z${out.length}`
    used.add(code)
    out.push({ code, el })
  }
  return out
}

export function fitRibbon(panel: HTMLElement) {
  const groups = Array.from(panel.querySelectorAll<HTMLElement>(':scope > .rg'))
  groups.forEach((g) => setScale(g, 0))
  const fits = () => panel.scrollWidth <= panel.clientWidth + 1
  if (fits()) return
  // A group that is just one large button stays a button (collapsing it would only add a click);
  // its last step is a small icon-only button above the group label.
  const single = (group: HTMLElement) => {
    const body = group.querySelector(':scope > .rg-body')
    const only = body?.children.length === 1 ? body.children[0] : null
    const result = !!only && (only.matches('.rb-large') || !!only.querySelector(':scope > .rb-large'))
    if (result) group.dataset.single = ''
    else delete group.dataset.single
    return result
  }
  const steps = groups.flatMap((group, index) => {
    const priority = Number(group.dataset.priority ?? 2)
    return (single(group) ? [1, 2] : [1, 2, 3]).map((level) => ({ group, index, level, score: SCALE_COST[level] + priority }))
  })
  steps.sort((a, b) => a.score - b.score || b.index - a.index || a.level - b.level)
  const levels = new Map(groups.map((g) => [g, 0]))
  for (const step of steps) {
    if (fits()) break
    const current = levels.get(step.group)!
    if (step.level <= current) continue
    const before = step.group.getBoundingClientRect().width
    setScale(step.group, step.level)
    // A step that doesn't make the group narrower (nothing to compact) is skipped.
    if (step.group.getBoundingClientRect().width >= before - 0.5) {
      setScale(step.group, current)
      continue
    }
    levels.set(step.group, step.level)
  }
  // Give space back to the most important groups if the greedy pass took more than it needed.
  const byImportance = [...groups].sort((a, b) => Number(b.dataset.priority ?? 2) - Number(a.dataset.priority ?? 2))
  // Stop at the first group that can't grow, so a less important group never ends up larger.
  for (const group of byImportance) {
    const start = levels.get(group)!
    for (let level = start - 1; level >= 0; level--) {
      setScale(group, level)
      if (!fits()) {
        setScale(group, levels.get(group)!)
        break
      }
      levels.set(group, level)
    }
    if (start > 0 && levels.get(group) === start) break
  }
}

const lazyTab = (load: () => Promise<unknown>) => lazy(async () => ({ default: (await load()) as ComponentType<TabProps> }))

export function prefetchTabs() {
  for (const load of Object.values(TAB_MODULES)) void load()
}

const PANELS: Record<TabId, ComponentType<TabProps>> = {
  home: HomeTab,
  ...(Object.fromEntries(Object.entries(TAB_MODULES).map(([id, load]) => [id, lazyTab(load)])) as unknown as Record<Exclude<TabId, 'home'>, ComponentType<TabProps>>),
}

type Props = TabProps & {
  active: TabId
  setActive: (tab: TabId) => void
  onFile: () => void
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  imageSelected: boolean
  selectedObject: string | null
}

export function Ribbon({ active, setActive, onFile, collapsed, setCollapsed, imageSelected, selectedObject, ...tabProps }: Props) {
  const inTable = tabProps.editor.isActive('table')
  const contextual: { id: TabId; label: string; group: string }[] = [
    ...(tabProps.app.viewMode === 'outline' ? [{ id: 'outlining' as const, label: 'Outlining', group: 'hf' }] : []),
    ...(tabProps.app.hfEdit ? [{ id: 'hf' as const, label: 'Header & Footer', group: 'hf' }] : []),
    ...(inTable
      ? [
          { id: 'tableDesign' as const, label: 'Table Design', group: 'table' },
          { id: 'tableLayout' as const, label: 'Layout', group: 'table' },
        ]
      : []),
    ...(imageSelected ? [{ id: 'picture' as const, label: 'Picture Format', group: 'picture' }] : []),
    ...(selectedObject === 'shape' || selectedObject === 'textBox' || selectedObject === 'signatureLine' ? [{ id: 'shapeFormat' as const, label: 'Shape Format', group: 'picture' }] : []),
    ...(selectedObject === 'chart' ? [{ id: 'chartDesign' as const, label: 'Chart Design', group: 'picture' }] : []),
    ...(selectedObject === 'diagram' ? [{ id: 'diagramDesign' as const, label: 'Diagram Design', group: 'picture' }] : []),
    ...(selectedObject === 'equation' ? [{ id: 'equation' as const, label: 'Equation', group: 'hf' }] : []),
  ]
  const panelRef = useRef<HTMLDivElement>(null)
  const [keyTips, setKeyTips] = useState(false)
  // Second level of KeyTips: after a tab's letter, every visible command of the tab gets its own keys.
  const [commandTips, setCommandTips] = useState<{ code: string; el: HTMLElement; left: number; top: number }[] | null>(null)
  const typed = useRef('')
  // After the tab's panel has rendered (a timer rather than animation frames, which pause in hidden tabs).
  const showCommandTips = () =>
    setTimeout(() =>
      void (() => {
        const panel = panelRef.current
        if (!panel) return
        const box = panel.getBoundingClientRect()
        const buttons = Array.from(panel.querySelectorAll<HTMLElement>('button[aria-label], .rg-collapsed, .combo input')).filter((b) => b.offsetParent && !(b as HTMLButtonElement).disabled)
        setCommandTips(assignKeyTips(buttons).map(({ code, el }) => {
          const r = el.getBoundingClientRect()
          return { code, el, left: r.left - box.left + r.width / 2, top: r.bottom - box.top - 6 }
        }))
        typed.current = ''
      })(),
    60)
  useEffect(() => {
    if (!commandTips) return
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setCommandTips(null)
        setKeyTips(true)
        return
      }
      if (e.key.length !== 1) return
      e.preventDefault()
      e.stopPropagation()
      typed.current += e.key.toUpperCase()
      const matches = commandTips.filter((t) => t.code.startsWith(typed.current))
      const exact = matches.find((t) => t.code === typed.current)
      if (exact) {
        setCommandTips(null)
        if (exact.el instanceof HTMLInputElement) exact.el.focus()
        else exact.el.click()
      } else if (!matches.length) typed.current = ''
    }
    const off = () => setCommandTips(null)
    window.addEventListener('keydown', onDown, true)
    window.addEventListener('mousedown', off)
    return () => {
      window.removeEventListener('keydown', onDown, true)
      window.removeEventListener('mousedown', off)
    }
  }, [commandTips])
  useEffect(() => {
    let altAlone = false
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        altAlone = true
        return
      }
      altAlone = false
      if (!keyTips) return
      const letter = e.key.toUpperCase()
      const hit = (Object.entries(KEYTIPS) as [TabId | 'file', string][]).find(([, k]) => k === letter)
      if (e.key === 'Escape' || hit) {
        e.preventDefault()
        setKeyTips(false)
      }
      if (!hit) return
      if (hit[0] === 'file') onFile()
      else {
        setActive(hit[0])
        if (collapsed) setCollapsed(false)
        showCommandTips()
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt' && altAlone) {
        e.preventDefault()
        setKeyTips((k) => !k)
      }
      altAlone = false
    }
    const off = () => setKeyTips(false)
    window.addEventListener('keydown', onDown, true)
    window.addEventListener('keyup', onUp, true)
    window.addEventListener('mousedown', off)
    return () => {
      window.removeEventListener('keydown', onDown, true)
      window.removeEventListener('keyup', onUp, true)
      window.removeEventListener('mousedown', off)
    }
  }, [keyTips, onFile, setActive, collapsed, setCollapsed])
  // Narrow windows: groups give up space step by step, like the original. Each group can be compacted
  // (small buttons lose their labels, combo boxes get narrower), then reduced (large buttons become
  // small ones with labels, stacked three high) and finally collapsed into a single drop-down button.
  // Low-priority groups go first; at equal priority the rightmost group goes first.
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const ro = new ResizeObserver(() => fitRibbon(panel))
    ro.observe(panel)
    // A lazily loaded tab replaces the panel's children once its code arrives.
    const mo = new MutationObserver(() => fitRibbon(panel))
    mo.observe(panel, { childList: true })
    void document.fonts?.ready.then(() => fitRibbon(panel))
    return () => {
      ro.disconnect()
      mo.disconnect()
    }
  }, [collapsed])
  useLayoutEffect(() => {
    if (panelRef.current) fitRibbon(panelRef.current)
  }, [active, collapsed, inTable, imageSelected, selectedObject])
  // Content can grow while editing (e.g. a longer font name); refit only when that makes it overflow.
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (panel && panel.scrollWidth > panel.clientWidth + 1) fitRibbon(panel)
  })
  const hiddenTabs = new Set(tabProps.app.settings.hiddenTabs ?? [])
  const shownTabs = TABS.filter((t) => !hiddenTabs.has(t.id))
  const available = new Set<TabId>([...shownTabs.map((t) => t.id), ...contextual.map((t) => t.id)])
  const current = available.has(active) ? active : 'home'
  const Panel = PANELS[current]

  const tabButton = (t: { id: TabId; label: string; group?: string }) => (
    <button
      key={t.id}
      type="button"
      role="tab"
      aria-selected={current === t.id}
      className={cls('tab', t.group && `tab-context tab-${t.group}`, current === t.id && 'is-active')}
      onMouseDown={keepFocus}
      onClick={() => {
        setActive(t.id)
        if (collapsed) setCollapsed(false)
      }}
      onDoubleClick={() => setCollapsed(!collapsed)}
    >
      {t.label}
      {keyTips && KEYTIPS[t.id] && <span className="keytip">{KEYTIPS[t.id]}</span>}
    </button>
  )

  return (
    <div className="ribbon-wrap">
      <nav className="tabs" role="tablist" aria-label="Ribbon">
        <button type="button" className="tab tab-file" onMouseDown={keepFocus} onClick={onFile}>
          File
          {keyTips && <span className="keytip">F</span>}
        </button>
        {shownTabs.map(tabButton)}
        {contextual.map(tabButton)}
        <span className="spacer" />
        <button
          type="button"
          className="tab ribbon-toggle"
          title={collapsed ? 'Pin the ribbon (Ctrl+F1)' : 'Collapse the ribbon (Ctrl+F1)'}
          aria-label={collapsed ? 'Show ribbon' : 'Collapse ribbon'}
          onMouseDown={keepFocus}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </nav>
      {!collapsed && (
        <div className="ribbon" role="tabpanel" ref={panelRef}>
          <Suspense fallback={<div className="ribbon-loading" />}>
            <Panel {...tabProps} />
          </Suspense>
          {commandTips?.map((t) => (
            <span key={t.code} className="keytip keytip-command" style={{ left: t.left, top: t.top }}>
              {t.code}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
