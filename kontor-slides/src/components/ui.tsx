import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AlignLeft, Brush, ChevronDown, ClipboardPaste, Clock, Eye, Image as ImageIcon, Layers, LayoutGrid, LayoutTemplate, MessageSquare, Palette, Play, Presentation, Search, Shapes, Sparkles, Table, Type, type LucideIcon } from 'lucide-react'

export const cls = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

/** Keeps a click on the ribbon from taking focus (and the text selection) away from the slide. */
export const keepFocus = (e: React.MouseEvent) => e.preventDefault()

export function usePopover(opts: { keepOpenInMenus?: boolean } = {}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const keepInMenus = !!opts.keepOpenInMenus
  useEffect(() => {
    if (!open) return
    // Menus opened from inside this popup are separate portals; with keepOpenInMenus they count as inside.
    const inside = (t: EventTarget | null) => ref.current?.contains(t as Node) || popRef.current?.contains(t as Node) || (keepInMenus && !!(t as Element | null)?.closest?.('.menu, .modal-backdrop'))
    const onDown = (e: MouseEvent) => {
      if (!inside(e.target)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    // Menus are fixed-positioned: close them on scroll or resize instead of letting them drift.
    const onMove = (e: Event) => {
      if (!inside(e.target)) setOpen(false)
    }
    const onResize = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open, keepInMenus])
  return { open, setOpen, ref, popRef }
}

/** Drop-down panel positioned at its anchor (fixed), so the scrolling ribbon cannot clip it. */
export function Popup({
  anchor,
  className,
  matchWidth,
  role,
  popRef,
  children,
  at,
}: {
  anchor?: RefObject<HTMLElement | null>
  className?: string
  matchWidth?: boolean
  role?: string
  popRef?: RefObject<HTMLDivElement | null>
  children: ReactNode
  at?: { x: number; y: number }
}) {
  const localRef = useRef<HTMLDivElement>(null)
  const ref = popRef ?? localRef
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  useLayoutEffect(() => {
    const a = at ? { left: at.x, right: at.x, top: at.y, bottom: at.y, width: 0 } : anchor?.current?.getBoundingClientRect()
    const m = ref.current?.getBoundingClientRect()
    if (!a || !m) return
    const width = matchWidth ? Math.max(a.width, m.width) : m.width
    const left = Math.max(8, Math.min(a.left, window.innerWidth - width - 8))
    const below = a.bottom + 2
    const top = below + m.height > window.innerHeight - 8 ? Math.max(8, a.top - m.height - 2) : below
    setStyle({ left, top, minWidth: matchWidth ? a.width : undefined, maxHeight: window.innerHeight - 16 })
  }, [anchor, matchWidth, at, ref])
  return createPortal(
    <div ref={ref} role={role} className={cls('menu', className)} style={style}>
      {children}
    </div>,
    document.body,
  )
}

/**
 * Scale level of every ribbon group, by position: 0 full size, 1 large buttons become small ones with
 * labels, 2 small buttons lose their labels, 3 the group collapses into one drop-down button.
 */
export const RibbonScaleContext = createContext<number[]>([])

const GROUP_ICONS: Record<string, LucideIcon> = {
  Clipboard: ClipboardPaste,
  Slides: Presentation,
  Font: Type,
  Paragraph: AlignLeft,
  Drawing: Shapes,
  Editing: Search,
  Arrange: Layers,
  Images: ImageIcon,
  Illustrations: Shapes,
  Tables: Table,
  Text: Type,
  Themes: Palette,
  Variants: Palette,
  Customize: LayoutTemplate,
  Timing: Clock,
  Animation: Sparkles,
  'Advanced Animation': Sparkles,
  'Transition to This Slide': Sparkles,
  Preview: Play,
  'Presentation Views': Eye,
  Show: Eye,
  Comments: MessageSquare,
  'Shape Styles': Brush,
  'WordArt Styles': Type,
  'Table Styles': Table,
}

/** How long a group keeps its full size when space runs out: 1 shrinks first, 4 last (like the original). */
const GROUP_PRIORITY: Record<string, number> = {
  Editing: 1,
  Drawing: 1,
  Arrange: 1,
  Comments: 1,
  Media: 1,
  Symbols: 1,
  Links: 1,
  Zoom: 1,
  Text: 1,
  Customize: 1,
  Preview: 1,
  Language: 1,
  Proofing: 1,
  Accessibility: 1,
  Window: 1,
  Macros: 1,
  Font: 3,
  Paragraph: 3,
  // Already compact once scaled, so they collapse only after everything else.
  Clipboard: 4,
  Slides: 4,
  Themes: 3,
  Animation: 3,
  'Transition to This Slide': 3,
  'Shape Styles': 3,
  'Table Styles': 3,
}

export function RibbonGroup({ label, children, onLauncher, launcherTitle, icon, priority }: { label: string; children: ReactNode; onLauncher?: () => void; launcherTitle?: string; icon?: LucideIcon; priority?: number }) {
  const levels = useContext(RibbonScaleContext)
  const rootRef = useRef<HTMLDivElement>(null)
  const [idx, setIdx] = useState(-1)
  const { open, setOpen, ref, popRef } = usePopover({ keepOpenInMenus: true })
  useLayoutEffect(() => {
    const el = rootRef.current
    const parent = el?.parentElement
    if (!el || !parent) return
    const next = Array.from(parent.children).filter((c) => c.classList.contains('rg')).indexOf(el)
    if (next !== idx) setIdx(next)
  })
  const level = idx >= 0 ? (levels[idx] ?? 0) : 0
  const prio = priority ?? GROUP_PRIORITY[label] ?? 2
  const launcher = onLauncher && (
    <button type="button" className="rg-launcher" title={launcherTitle ?? `${label} settings`} aria-label={launcherTitle ?? `${label} settings`} onMouseDown={keepFocus} onClick={onLauncher}>
      <svg viewBox="0 0 8 8" width="8" height="8" aria-hidden="true">
        <path d="M1 1h4M1 1v4M2.5 2.5L7 7M7 4v3H4" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
    </button>
  )
  if (level >= 3) {
    const Icon = icon ?? GROUP_ICONS[label] ?? LayoutGrid
    return (
      <div
        className="rg is-collapsed"
        data-priority={prio}
        ref={(n) => {
          rootRef.current = n
          ref.current = n
        }}
      >
        <button type="button" className={cls('rb rb-large rg-collapse-btn', open && 'is-active')} title={label} aria-label={label} aria-expanded={open} onMouseDown={keepFocus} onClick={() => setOpen(!open)}>
          <Icon size={26} strokeWidth={1.3} />
          <span className="rb-text">
            {label}
            <ChevronDown size={10} className="rb-caret" />
          </span>
        </button>
        {open && (
          <Popup anchor={ref} popRef={popRef} className="rg-popup">
            <div className="rg rg-in-popup">
              <div className="rg-body">{children}</div>
              <div className="rg-label">
                {label}
                {launcher}
              </div>
            </div>
          </Popup>
        )}
      </div>
    )
  }
  return (
    <div className={cls('rg', level > 0 && `lvl-${level}`)} data-priority={prio} ref={rootRef}>
      <div className="rg-body">{children}</div>
      <div className="rg-label">
        {label}
        {launcher}
      </div>
    </div>
  )
}

/**
 * The order in which groups shrink: low-priority groups go all the way first (right to left); the others
 * then shrink level by level together, lower priority first, so Font and Paragraph collapse last.
 */
function scaleSteps(priorities: number[]): [number, number][] {
  const steps: [number, number][] = []
  const tiers = [...new Set(priorities)].sort((a, b) => a - b)
  const members = (tier: number) =>
    priorities
      .map((p, i) => [p, i] as const)
      .filter(([p]) => p === tier)
      .map(([, i]) => i)
      .reverse()
  const rest = tiers.filter((t) => t > 1)
  if (tiers[0] === 1) for (let level = 1; level <= 3; level++) members(1).forEach((i) => steps.push([i, level]))
  for (let level = 1; level <= 3; level++) rest.forEach((tier) => members(tier).forEach((i) => steps.push([i, level])))
  return steps
}

/**
 * Scales ribbon groups down in steps when the window gets narrow, like the original: large buttons turn
 * into small labelled ones, then lose their labels, and finally the group collapses into one button.
 * Low-priority groups shrink first. Returns the level per group and a ref for the ribbon panel.
 */
export function useRibbonScale(key: string) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)
  const stepRef = useRef(0)
  stepRef.current = step
  // Measured content width per step for this tab, so widening never oscillates.
  const widths = useRef(new Map<number, number>())
  const sig = useRef('')
  const [priorities, setPriorities] = useState<number[]>([])
  const fit = () => {
    const panel = panelRef.current
    if (!panel) return
    const groups = Array.from(panel.children).filter((c): c is HTMLElement => c.classList.contains('rg'))
    const prios = groups.map((g) => Number(g.dataset.priority) || 2)
    const nextSig = `${key}|${prios.join(',')}`
    if (nextSig !== sig.current) {
      sig.current = nextSig
      widths.current.clear()
      setPriorities(prios)
      if (stepRef.current !== 0) setStep(0)
      return
    }
    if (!groups.length) return
    const left = panel.getBoundingClientRect().left
    const used = Math.max(...groups.map((g) => g.getBoundingClientRect().right)) - left
    const avail = panel.clientWidth - 4
    const s = stepRef.current
    widths.current.set(s, used)
    const max = scaleSteps(prios).length
    if (used > avail) {
      if (s < max) setStep(s + 1)
      return
    }
    if (s > 0) {
      const prev = widths.current.get(s - 1)
      if (prev === undefined || prev <= avail) setStep(s - 1)
    }
  }
  // Runs after every render: group contents can change width (enabled state, galleries).
  useLayoutEffect(fit)
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    let w = panel.clientWidth
    const ro = new ResizeObserver(() => {
      // Content changes are handled after render; only react to the panel's own width here.
      if (panel.clientWidth === w) return
      w = panel.clientWidth
      fit()
    })
    ro.observe(panel)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const levels: number[] = priorities.map(() => 0)
  scaleSteps(priorities)
    .slice(0, step)
    .forEach(([i, level]) => (levels[i] = level))
  return { panelRef, levels }
}

type ButtonProps = {
  icon?: LucideIcon
  iconNode?: ReactNode
  label: string
  title?: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  large?: boolean
  showLabel?: boolean
  caret?: boolean
  onDoubleClick?: () => void
  /** Stays large when the ribbon scales down (like Paste). */
  keep?: boolean
}

export function RibbonButton({ icon: Icon, iconNode, label, title, onClick, onDoubleClick, active, disabled, large, showLabel, caret, keep }: ButtonProps) {
  return (
    <button
      type="button"
      className={cls('rb', large && 'rb-large', active && 'is-active', keep && 'rb-keep')}
      title={title ?? label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={keepFocus}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {iconNode ?? (Icon && <Icon size={large ? 30 : 16} strokeWidth={large ? 1.3 : 1.8} />)}
      {(large || showLabel) && (
        <span className="rb-text">
          {label}
          {caret && <ChevronDown size={10} className="rb-caret" />}
        </span>
      )}
      {!large && !showLabel && caret && <ChevronDown size={10} className="rb-caret" />}
    </button>
  )
}

export type MenuItem = { label: string; detail?: string; onClick: () => void; active?: boolean; disabled?: boolean; icon?: LucideIcon; shortcut?: string } | 'separator' | { heading: string }

export function MenuList({ items, close }: { items: MenuItem[]; close: () => void }) {
  return (
    <>
      {items.map((item, i) =>
        item === 'separator' ? (
          <div key={i} className="menu-sep" />
        ) : 'heading' in item ? (
          <div key={i} className="menu-heading">
            {item.heading}
          </div>
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={cls('menu-item', item.active && 'is-active')}
            onMouseDown={keepFocus}
            onClick={() => {
              close()
              item.onClick()
            }}
          >
            {item.icon ? <item.icon size={16} /> : <span className="menu-icon-space" />}
            <span className="menu-item-text">
              {item.label}
              {item.detail && <small>{item.detail}</small>}
            </span>
            {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
          </button>
        ),
      )}
    </>
  )
}

/** Ribbon button that opens a menu. */
export function MenuButton(props: Omit<ButtonProps, 'onClick' | 'caret'> & { items: MenuItem[] | (() => MenuItem[]); wide?: boolean }) {
  const { items, wide, ...button } = props
  const { open, setOpen, ref, popRef } = usePopover()
  return (
    <div className="popover-anchor" ref={ref}>
      <RibbonButton {...button} caret active={open || button.active} onClick={() => setOpen(!open)} />
      {open && (
        <Popup anchor={ref} popRef={popRef} className={wide ? 'menu-wide' : undefined} role="menu">
          <MenuList items={typeof items === 'function' ? items() : items} close={() => setOpen(false)} />
        </Popup>
      )}
    </div>
  )
}

/** Split button: the main part runs the default action, the arrow opens a menu. */
export function SplitMenuButton(props: Omit<ButtonProps, 'caret'> & { items: MenuItem[] | (() => MenuItem[]) | ((close: () => void) => ReactNode); custom?: boolean; wide?: boolean }) {
  const { items, custom, wide, ...button } = props
  const { open, setOpen, ref, popRef } = usePopover()
  const close = () => setOpen(false)
  return (
    <div className={cls('split popover-anchor', button.large && 'split-large', open && 'is-open', button.keep && 'rb-keep')} ref={ref}>
      <RibbonButton {...button} />
      <button type="button" className={cls('rb split-arrow', button.large && 'split-arrow-large')} aria-label={`${button.label} options`} disabled={button.disabled} onMouseDown={keepFocus} onClick={() => setOpen(!open)}>
        {button.large && <span className="rb-text">{button.label}</span>}
        <ChevronDown size={10} />
      </button>
      {open && (
        <Popup anchor={ref} popRef={popRef} className={wide ? 'menu-wide' : undefined} role="menu">
          {custom ? (items as (close: () => void) => ReactNode)(close) : <MenuList items={typeof items === 'function' ? (items as () => MenuItem[])() : (items as MenuItem[])} close={close} />}
        </Popup>
      )}
    </div>
  )
}

/** Ribbon button that opens a free-form panel (galleries, pickers). */
export function PopoverButton(props: Omit<ButtonProps, 'onClick' | 'caret'> & { panelClass?: string; children: (close: () => void) => ReactNode }) {
  const { children, panelClass, ...button } = props
  const { open, setOpen, ref, popRef } = usePopover()
  return (
    <div className="popover-anchor" ref={ref}>
      <RibbonButton {...button} caret active={open || button.active} onClick={() => setOpen(!open)} />
      {open && (
        <Popup anchor={ref} popRef={popRef} className={panelClass}>
          {children(() => setOpen(false))}
        </Popup>
      )}
    </div>
  )
}

/** Input with a drop-down list, like the font and font size boxes. */
export function ComboBox({
  value,
  options,
  onCommit,
  width,
  title,
  renderOption,
  disabled,
}: {
  value: string
  options: (string | { heading: string })[]
  onCommit: (value: string) => void
  width: number
  title: string
  renderOption?: (option: string) => ReactNode
  disabled?: boolean
}) {
  const { open, setOpen, ref, popRef } = usePopover()
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setDraft(value)
  }, [value, focused])

  return (
    <div className={cls('combo popover-anchor', disabled && 'is-disabled')} ref={ref} style={{ width }}>
      <input
        value={draft}
        title={title}
        aria-label={title}
        disabled={disabled}
        onFocus={(e) => {
          setFocused(true)
          e.target.select()
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            setOpen(false)
            e.currentTarget.blur()
            onCommit(draft.trim())
          }
          if (e.key === 'Escape') {
            setDraft(value)
            e.currentTarget.blur()
          }
        }}
      />
      <button type="button" className="combo-btn" aria-label={`Choose ${title.toLowerCase()}`} disabled={disabled} onMouseDown={keepFocus} onClick={() => setOpen(!open)}>
        <ChevronDown size={12} />
      </button>
      {open && (
        <Popup anchor={ref} popRef={popRef} className="combo-menu" matchWidth role="listbox">
          {options.map((o, i) =>
            typeof o === 'string' ? (
              <button
                key={`${o}-${i}`}
                type="button"
                role="option"
                aria-selected={o === value}
                className={cls('menu-item', o === value && 'is-active')}
                onMouseDown={keepFocus}
                onClick={() => {
                  setOpen(false)
                  onCommit(o)
                }}
              >
                {renderOption ? renderOption(o) : o}
              </button>
            ) : (
              <div key={`h${i}`} className="menu-heading">
                {o.heading}
              </div>
            ),
          )}
        </Popup>
      )}
    </div>
  )
}

/** Split button for colors: the main half applies the last color, the arrow opens the palette. */
export function ColorSplitButton({
  icon: Icon,
  label,
  color,
  onApply,
  disabled,
  children,
}: {
  icon: LucideIcon
  label: string
  color: string
  onApply: () => void
  disabled?: boolean
  children: (close: () => void) => ReactNode
}) {
  const { open, setOpen, ref, popRef } = usePopover()
  return (
    <div className={cls('split popover-anchor', open && 'is-open')} ref={ref}>
      <button type="button" className="rb split-main" title={label} aria-label={label} disabled={disabled} onMouseDown={keepFocus} onClick={onApply}>
        <span className="color-icon">
          <Icon size={15} strokeWidth={1.8} />
          <span className="color-bar" style={{ background: color }} />
        </span>
      </button>
      <button type="button" className="rb split-arrow" aria-label={`${label}: choose color`} disabled={disabled} onMouseDown={keepFocus} onClick={() => setOpen(!open)}>
        <ChevronDown size={10} />
      </button>
      {open && (
        <Popup anchor={ref} popRef={popRef} className="palette-menu">
          {children(() => setOpen(false))}
        </Popup>
      )}
    </div>
  )
}

export function Modal({ title, onClose, children, footer, width }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-label={title} style={width ? { width: `min(${width}px, calc(100vw - 32px))` } : undefined} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-title">
          <span>{title}</span>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
    </div>,
    document.body,
  )
}

/** Small numeric field with up/down stepping (used for sizes, durations, spacing). */
export function NumberField({
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix = '',
  width = 70,
  label,
  decimals = 2,
  disabled,
}: {
  value: number | null
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
  width?: number
  label: string
  decimals?: number
  disabled?: boolean
}) {
  const fmt = (v: number | null) => (v === null || Number.isNaN(v) ? '' : `${Number(v.toFixed(decimals))}${suffix}`)
  const [draft, setDraft] = useState(fmt(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setDraft(fmt(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused])
  const clamp = (v: number) => Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v))
  const commitDraft = () => {
    const n = parseFloat(draft.replace(',', '.'))
    if (!Number.isNaN(n)) onChange(clamp(n))
    else setDraft(fmt(value))
  }
  return (
    <span className={cls('numfield', disabled && 'is-disabled')} style={{ width }}>
      <input
        aria-label={label}
        title={label}
        value={draft}
        disabled={disabled}
        onFocus={(e) => {
          setFocused(true)
          e.target.select()
        }}
        onBlur={() => {
          setFocused(false)
          commitDraft()
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commitDraft()
            e.currentTarget.blur()
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            onChange(clamp((value ?? 0) + (e.key === 'ArrowUp' ? step : -step)))
          }
        }}
      />
      <span className="numfield-spin">
        <button type="button" tabIndex={-1} aria-label={`Increase ${label}`} disabled={disabled} onMouseDown={keepFocus} onClick={() => onChange(clamp((value ?? 0) + step))}>
          ▲
        </button>
        <button type="button" tabIndex={-1} aria-label={`Decrease ${label}`} disabled={disabled} onMouseDown={keepFocus} onClick={() => onChange(clamp((value ?? 0) - step))}>
          ▼
        </button>
      </span>
    </span>
  )
}

/** Right-click menu at a screen position. */
export function ContextMenu({ at, items, onClose }: { at: { x: number; y: number }; items: MenuItem[]; onClose: () => void }) {
  const popRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    window.addEventListener('blur', onClose)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])
  return (
    <Popup at={at} popRef={popRef} className="context-menu" role="menu">
      <MenuList items={items} close={onClose} />
    </Popup>
  )
}

export function pickFile(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.click()
  })
}
