import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { ChevronDown, ChevronUp, LayoutGrid, MoveDownRight, type LucideIcon } from 'lucide-react'
import { getLanguage, t } from '../i18n'

/** German keyboards label Ctrl and Shift as Strg and Umschalt. */
const keyNames = (shortcut: string) => (getLanguage() === 'de' ? shortcut.replace(/\bCtrl\+/g, 'Strg+').replace(/\bShift\+/g, 'Umschalt+') : shortcut)

export const cls = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

/** Keeps a ribbon click from taking focus (and with it the selection) away from the document. */
export const keepFocus = (e: React.MouseEvent) => e.preventDefault()

export function usePopover() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const inside = (e: Event) => ref.current?.contains(e.target as Node) || (e.target as HTMLElement).closest?.('.menu')
    const onDown = (e: MouseEvent) => {
      if (!inside(e)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    // Menus are fixed-position: close them on scroll or resize instead of letting them drift.
    const onMove = (e: Event) => {
      if (!inside(e)) setOpen(false)
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
  }, [open])
  return { open, setOpen, ref }
}

/** Drop-down panel positioned at its anchor (fixed, so the scrollable ribbon cannot clip it). */
export function Popup({
  anchor,
  className,
  matchWidth,
  role,
  children,
  point,
}: {
  anchor?: RefObject<HTMLElement | null>
  point?: { x: number; y: number }
  className?: string
  matchWidth?: boolean
  role?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  useLayoutEffect(() => {
    const m = ref.current?.getBoundingClientRect()
    const a = point ? new DOMRect(point.x, point.y, 0, 0) : anchor?.current?.getBoundingClientRect()
    if (!a || !m) return
    const width = matchWidth ? Math.max(a.width, m.width) : m.width
    const left = Math.max(8, Math.min(a.left, window.innerWidth - width - 8))
    const below = a.bottom + 2
    const top = below + m.height > window.innerHeight - 8 ? Math.max(8, a.top - m.height - 2) : below
    setStyle({ left, top, minWidth: matchWidth ? a.width : undefined, maxHeight: window.innerHeight - 16 })
  }, [anchor, matchWidth, point])
  return (
    <div ref={ref} role={role} className={cls('menu', className)} style={style}>
      {children}
    </div>
  )
}

/**
 * How far each ribbon group has been scaled down to make the tab fit, by group label:
 * 0 full size, 1 small buttons lose their labels, 2 large buttons turn into small labeled ones,
 * 3 those lose their labels too, 4 the whole group collapses into one drop-down button.
 */
export const RibbonFitContext = createContext<ReadonlyMap<string, number>>(new Map())
export const COLLAPSED_LEVEL = 4
/** Scale level of the group a control sits in (see RibbonFitContext). */
const GroupLevelContext = createContext(0)

/** Resolves the size a ribbon control should take at the current group scale level. */
function useScaled(large: boolean | undefined, showLabel: boolean | undefined, pin: boolean | undefined, minor?: boolean) {
  const level = useContext(GroupLevelContext)
  const hidden = !!minor && level >= 1
  if (pin) return { large: !!large, label: !!(large || showLabel), hidden }
  if (large) return level < 2 ? { large: true, label: true, hidden } : { large: false, label: level < 3, hidden }
  return { large: false, label: !!showLabel && level < 1, hidden }
}

/** True once the group a control sits in has started to scale down. */
export function useGroupScaled() {
  return useContext(GroupLevelContext) >= 1
}

export function RibbonGroup({
  label,
  icon,
  children,
  onLauncher,
  launcherTitle,
  priority = 2,
}: {
  label: string
  icon?: LucideIcon
  children: ReactNode
  onLauncher?: () => void
  launcherTitle?: string
  /** Higher numbers keep their full size longer when the window gets narrow (default 2). */
  priority?: number
}) {
  const level = useContext(RibbonFitContext).get(label) ?? 0
  const launcher = onLauncher && (
    <button type="button" className="rg-launcher" title={launcherTitle ?? t('{group} settings', { group: label })} aria-label={launcherTitle ?? t('{group} settings', { group: label })} onMouseDown={keepFocus} onClick={onLauncher}>
      <MoveDownRight size={10} />
    </button>
  )
  if (level >= COLLAPSED_LEVEL)
    return (
      <CollapsedGroup label={label} icon={icon ?? LayoutGrid} launcher={launcher} priority={priority}>
        {children}
      </CollapsedGroup>
    )
  return (
    <div className="rg" role="group" aria-label={label} data-rg={label} data-priority={priority} data-level={level || undefined}>
      <GroupLevelContext.Provider value={level}>
        <div className="rg-body">{children}</div>
      </GroupLevelContext.Provider>
      <div className="rg-label">
        {label}
        {launcher}
      </div>
    </div>
  )
}

/** A group that gave up its room: one large button that opens the group's controls in a drop-down. */
function CollapsedGroup({ label, icon: Icon, launcher, priority, children }: { label: string; icon: LucideIcon; launcher: ReactNode; priority: number; children: ReactNode }) {
  const { open, setOpen, ref } = usePopover()
  return (
    <div className="rg rg-collapsed" role="group" aria-label={label} data-rg={label} data-priority={priority} data-level={COLLAPSED_LEVEL}>
      <div className="rg-body popover-anchor" ref={ref}>
        <button type="button" className={cls('rb rb-large', open && 'is-active')} aria-haspopup="true" aria-expanded={open} title={label} onMouseDown={keepFocus} onClick={() => setOpen(!open)}>
          <Icon size={30} strokeWidth={1.3} />
          <span className="rb-text">
            {label}
            <ChevronDown size={10} className="rb-caret" />
          </span>
        </button>
        {open && (
          <Popup anchor={ref} className="rg-popup">
            <div
              className="rg rg-in-popup"
              onClick={(e) => {
                // A command closes the drop-down; buttons that open their own menus keep it open.
                const b = (e.target as HTMLElement).closest('button')
                if (b && !b.hasAttribute('aria-haspopup') && !b.closest('.combo') && !b.closest('.spinner')) setOpen(false)
              }}
            >
              <GroupLevelContext.Provider value={0}>
                <div className="rg-body">{children}</div>
              </GroupLevelContext.Provider>
              <div className="rg-label">
                {label}
                {launcher}
              </div>
            </div>
          </Popup>
        )}
      </div>
      <div className="rg-label" aria-hidden="true">
        {' '}
      </div>
    </div>
  )
}

type ButtonProps = {
  icon: LucideIcon
  label: string
  title?: string
  onClick?: () => void
  onDoubleClick?: () => void
  active?: boolean
  disabled?: boolean
  large?: boolean
  showLabel?: boolean
  caret?: boolean
  /** Keeps the button at its full size while the ribbon scales its group down. */
  pin?: boolean
  /** A secondary command that leaves the ribbon as soon as its group scales down (it stays reachable elsewhere). */
  minor?: boolean
}

export function RibbonButton({ icon: Icon, label, title, onClick, onDoubleClick, active, disabled, large: wantLarge, showLabel: wantLabel, caret, pin, minor }: ButtonProps) {
  const { large, label: showLabel, hidden } = useScaled(wantLarge, wantLabel, pin, minor)
  if (hidden) return null
  return (
    <button
      type="button"
      className={cls('rb', large && 'rb-large', active && 'is-active')}
      title={title ?? label}
      aria-label={label}
      aria-pressed={active}
      aria-haspopup={caret ? 'true' : undefined}
      disabled={disabled}
      onMouseDown={keepFocus}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <Icon size={large ? 30 : 16} strokeWidth={large ? 1.3 : 1.8} />
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

export type MenuEntry = {
  label: string
  detail?: string
  onClick: () => void
  active?: boolean
  checked?: boolean
  disabled?: boolean
  icon?: LucideIcon
  shortcut?: string
  preview?: ReactNode
}
export type MenuItem = MenuEntry | 'separator' | { heading: string }

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
            role={item.checked != null ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={item.checked}
            disabled={item.disabled}
            className={cls('menu-item', item.active && 'is-active')}
            onMouseDown={keepFocus}
            onClick={() => {
              close()
              item.onClick()
            }}
          >
            {item.checked != null ? <span className="menu-check">{item.checked ? '✓' : ''}</span> : item.icon ? <item.icon size={16} /> : null}
            {item.preview}
            <span className="menu-item-text">
              {item.label}
              {item.detail && <small>{item.detail}</small>}
            </span>
            {item.shortcut && <span className="menu-shortcut">{keyNames(item.shortcut)}</span>}
          </button>
        ),
      )}
    </>
  )
}

/** Ribbon button that opens a menu. */
export function MenuButton(props: Omit<ButtonProps, 'onClick' | 'caret'> & { items: MenuItem[]; wide?: boolean; footer?: ReactNode }) {
  const { items, wide, footer, ...button } = props
  const { open, setOpen, ref } = usePopover()
  if (useScaled(button.large, button.showLabel, button.pin, button.minor).hidden) return null
  return (
    <div className="popover-anchor" ref={ref}>
      <RibbonButton {...button} caret active={open || button.active} onClick={() => setOpen(!open)} />
      {open && (
        <Popup anchor={ref} className={wide ? 'menu-wide' : undefined} role="menu">
          <MenuList items={items} close={() => setOpen(false)} />
          {footer}
        </Popup>
      )}
    </div>
  )
}

/** Ribbon button that opens a free-form drop-down (table grid, symbols …). */
export function PopoverButton(props: Omit<ButtonProps, 'onClick' | 'caret'> & { children: (close: () => void) => ReactNode; className?: string }) {
  const { children, className, ...button } = props
  const { open, setOpen, ref } = usePopover()
  if (useScaled(button.large, button.showLabel, button.pin, button.minor).hidden) return null
  return (
    <div className="popover-anchor" ref={ref}>
      <RibbonButton {...button} caret active={open || button.active} onClick={() => setOpen(!open)} />
      {open && (
        <Popup anchor={ref} className={className}>
          {children(() => setOpen(false))}
        </Popup>
      )}
    </div>
  )
}

/** Split button: the main part runs the default action, the arrow opens more choices. */
export function SplitButton(props: ButtonProps & { items?: MenuItem[]; children?: (close: () => void) => ReactNode; menuClassName?: string }) {
  const { icon: Icon, label, title, onClick, active, disabled, items, children, menuClassName } = props
  const { large, label: showLabel, hidden } = useScaled(props.large, props.showLabel, props.pin, props.minor)
  const { open, setOpen, ref } = usePopover()
  if (hidden) return null
  return (
    <div className={cls('split popover-anchor', large && 'split-large', open && 'is-open')} ref={ref}>
      <button
        type="button"
        className={cls('rb split-main', large && 'rb-large', active && 'is-active')}
        title={title ?? label}
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onMouseDown={keepFocus}
        onClick={onClick}
      >
        <Icon size={large ? 30 : 16} strokeWidth={large ? 1.3 : 1.8} />
        {showLabel && !large && <span className="rb-text">{label}</span>}
      </button>
      <button type="button" className={cls('rb split-arrow', large && 'split-arrow-large')} aria-haspopup="true" aria-label={t('{name}: more options', { name: label })} disabled={disabled} onMouseDown={keepFocus} onClick={() => setOpen(!open)}>
        {large && <span className="rb-text">{label}</span>}
        <ChevronDown size={10} />
      </button>
      {open && (
        <Popup anchor={ref} className={menuClassName} role={items ? 'menu' : undefined}>
          {items ? <MenuList items={items} close={() => setOpen(false)} /> : children?.(() => setOpen(false))}
        </Popup>
      )}
    </div>
  )
}

/** Input with a list, like the font name and font size boxes. */
export function ComboBox({
  value,
  options,
  onCommit,
  width,
  title,
  renderOption,
  groups,
}: {
  value: string
  options: string[]
  onCommit: (value: string) => void
  width: number
  title: string
  renderOption?: (option: string) => ReactNode
  groups?: { heading: string; options: string[] }[]
}) {
  const { open, setOpen, ref } = usePopover()
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  // boxes get narrower once their group scales down, like the original ribbon
  const boxWidth = useGroupScaled() ? Math.max(40, Math.round(width * 0.8)) : width
  useEffect(() => {
    if (!focused) setDraft(value)
  }, [value, focused])

  const option = (o: string, key: string) => (
    <button
      key={key}
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
  )

  return (
    <div className="combo popover-anchor" ref={ref} style={{ width: boxWidth }}>
      <input
        value={draft}
        title={title}
        aria-label={title}
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
          } else if (e.key === 'Escape') {
            setDraft(value)
            e.currentTarget.blur()
          }
        }}
      />
      <button type="button" className="combo-btn" aria-label={t('Choose {name}', { name: title })} onMouseDown={keepFocus} onClick={() => setOpen(!open)}>
        <ChevronDown size={12} />
      </button>
      {open && (
        <Popup anchor={ref} className="combo-menu" matchWidth role="listbox">
          {groups
            ? groups.map((g) => (
                <div key={g.heading}>
                  <div className="menu-heading">{g.heading}</div>
                  {g.options.map((o) => option(o, `${g.heading}-${o}`))}
                </div>
              ))
            : options.map((o) => option(o, o))}
        </Popup>
      )}
    </div>
  )
}

/** Split color button: the left part applies the last color, the arrow opens the palette. */
export function ColorSplitButton({
  icon: Icon,
  label,
  color,
  onApply,
  children,
  large: wantLarge,
}: {
  icon: LucideIcon
  label: string
  color: string
  onApply: () => void
  children: (close: () => void) => ReactNode
  large?: boolean
}) {
  const large = useScaled(wantLarge, false, false).large
  const { open, setOpen, ref } = usePopover()
  return (
    <div className={cls('split popover-anchor', open && 'is-open')} ref={ref}>
      <button type="button" className={cls('rb split-main', large && 'rb-large')} title={label} aria-label={label} onMouseDown={keepFocus} onClick={onApply}>
        <span className="color-icon">
          <Icon size={large ? 26 : 15} strokeWidth={large ? 1.3 : 1.8} />
          <span className="color-bar" style={{ background: color }} />
        </span>
        {large && <span className="rb-text">{label}</span>}
      </button>
      <button type="button" className="rb split-arrow" aria-haspopup="true" aria-label={t('{name}: choose color', { name: label })} onMouseDown={keepFocus} onClick={() => setOpen(!open)}>
        <ChevronDown size={10} />
      </button>
      {open && (
        <Popup anchor={ref} className="palette-menu">
          {children(() => setOpen(false))}
        </Popup>
      )}
    </div>
  )
}

/** Small numeric box with arrows (Layout tab indents/spacing, header position …). */
export function Spinner({
  label,
  value,
  onChange,
  step,
  min = 0,
  max = 100,
  format,
  parse,
  width = 64,
  icon: Icon,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  step: number
  min?: number
  max?: number
  format: (value: number) => string
  parse: (text: string) => number | null
  width?: number
  icon?: LucideIcon
}) {
  const [draft, setDraft] = useState(format(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setDraft(format(value))
  }, [value, focused, format])
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 1000) / 1000))
  const commit = () => {
    const v = parse(draft)
    if (v != null) onChange(clamp(v))
    else setDraft(format(value))
  }
  return (
    <label className="spinner" title={label}>
      {Icon && <Icon size={14} />}
      <span className="spinner-label">{label}</span>
      <span className="spinner-box" style={{ width }}>
        <input
          value={draft}
          aria-label={label}
          onFocus={(e) => {
            setFocused(true)
            e.target.select()
          }}
          onBlur={() => {
            setFocused(false)
            commit()
          }}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              onChange(clamp(value + (e.key === 'ArrowUp' ? step : -step)))
            }
          }}
        />
        <span className="spinner-arrows">
          <button type="button" tabIndex={-1} aria-label={t('Increase {name}', { name: label })} onMouseDown={keepFocus} onClick={() => onChange(clamp(value + step))}>
            <ChevronUp size={9} />
          </button>
          <button type="button" tabIndex={-1} aria-label={t('Decrease {name}', { name: label })} onMouseDown={keepFocus} onClick={() => onChange(clamp(value - step))}>
            <ChevronDown size={9} />
          </button>
        </span>
      </span>
    </label>
  )
}

export function CheckItem({ label, checked, onChange, title }: { label: string; checked: boolean; onChange: (checked: boolean) => void; title?: string }) {
  return (
    <label className="check-item" title={title ?? label} onMouseDown={keepFocus}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  )
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  width,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
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
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={width ? { width: `min(${width}px, calc(100vw - 32px))` } : undefined} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-title">
          <span>{title}</span>
          <button type="button" className="modal-close" aria-label={t('Close')} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

/** Standard OK / Cancel footer. */
export function OkCancel({ onOk, onCancel, okLabel = 'OK', extra }: { onOk: () => void; onCancel: () => void; okLabel?: string; extra?: ReactNode }) {
  return (
    <>
      {extra}
      <span className="spacer" />
      <button type="button" className="btn btn-primary" onClick={onOk}>
        {okLabel}
      </button>
      <button type="button" className="btn" onClick={onCancel}>
        {t('Cancel')}
      </button>
    </>
  )
}

export function DialogTabs<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string }[]; active: T; onChange: (id: T) => void }) {
  return (
    <div className="dlg-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={active === t.id} className={cls('dlg-tab', active === t.id && 'is-active')} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}
