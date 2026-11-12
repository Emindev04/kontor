import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { ChevronDown, ChevronUp, MoveDownRight, type LucideIcon } from 'lucide-react'
import { t } from '../i18n'

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

export function RibbonGroup({
  label,
  children,
  onLauncher,
  launcherTitle,
  className,
  icon: Icon,
  priority,
}: {
  label: string
  children: ReactNode
  onLauncher?: () => void
  launcherTitle?: string
  className?: string
  /** Icon of the button the group turns into when the window is too narrow (default: its first icon). */
  icon?: LucideIcon
  /** How long the group keeps its full size when the window narrows: 0 shrinks first, 5 last (default 2). */
  priority?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const iconRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  // Without an explicit icon the collapsed button borrows the first icon inside the group.
  useLayoutEffect(() => {
    const slot = iconRef.current
    if (Icon || !slot) return
    const svg = ref.current?.querySelector<SVGElement>(':scope > .rg-body svg')
    if (!svg) return
    const copy = svg.cloneNode(true) as SVGElement
    copy.setAttribute('width', '22')
    copy.setAttribute('height', '22')
    copy.setAttribute('stroke-width', '1.4')
    slot.replaceChildren(copy)
  })
  // On narrow windows the ribbon collapses groups into a single button (class set by the Ribbon);
  // the button shows the group's controls in a drop-down panel.
  useEffect(() => {
    if (!open) return
    const group = ref.current
    const body = group?.querySelector<HTMLElement>(':scope > .rg-body')
    const btn = group?.querySelector<HTMLElement>(':scope > .rg-collapsed')
    if (body && btn) {
      const r = btn.getBoundingClientRect()
      body.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - body.offsetWidth - 8))}px`
      body.style.top = `${r.bottom + 2}px`
    }
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!group?.contains(target) && !target.closest('.menu')) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      if (body) body.style.left = body.style.top = ''
    }
  }, [open])
  return (
    <div ref={ref} className={cls('rg', className, open && 'is-open')} role="group" aria-label={label} data-priority={priority}>
      <button type="button" className="rg-collapsed" aria-expanded={open} title={label} onMouseDown={keepFocus} onClick={() => setOpen(!open)}>
        <span className="rg-collapsed-icon" aria-hidden="true" ref={iconRef}>
          {Icon && <Icon size={22} strokeWidth={1.4} />}
        </span>
        <span className="rb-text">
          {label}
          <ChevronDown size={10} className="rb-caret" />
        </span>
      </button>
      <div className="rg-body">{children}</div>
      <div className="rg-label">
        {label}
        {onLauncher && (
          <button type="button" className="rg-launcher" title={launcherTitle ?? t('{name} settings', { name: label })} aria-label={launcherTitle ?? t('{name} settings', { name: label })} onMouseDown={keepFocus} onClick={onLauncher}>
            <MoveDownRight size={10} />
          </button>
        )}
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
  /** Extra class; `rb-optional` hides the button when its group is compacted on narrow windows. */
  className?: string
}

export function RibbonButton({ icon: Icon, label, title, onClick, onDoubleClick, active, disabled, large, showLabel, caret, className }: ButtonProps) {
  return (
    <button
      type="button"
      className={cls('rb', large && 'rb-large', active && 'is-active', className)}
      title={title ?? label}
      aria-label={label}
      aria-pressed={active}
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
            {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
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
  const { icon: Icon, label, title, onClick, active, disabled, large, showLabel, items, children, menuClassName } = props
  const { open, setOpen, ref } = usePopover()
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
      <button type="button" className={cls('rb split-arrow', large && 'split-arrow-large')} aria-label={t('{name}: more options', { name: label })} disabled={disabled} onMouseDown={keepFocus} onClick={() => setOpen(!open)}>
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
  compactWidth,
}: {
  value: string
  options: string[]
  onCommit: (value: string) => void
  width: number
  /** Narrower width used when the ribbon group is compacted on narrow windows. */
  compactWidth?: number
  title: string
  renderOption?: (option: string) => ReactNode
  groups?: { heading: string; options: string[] }[]
}) {
  const { open, setOpen, ref } = usePopover()
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
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
    <div
      className="combo popover-anchor"
      ref={ref}
      data-compact={compactWidth ? '' : undefined}
      style={{ width, ['--compact-width' as string]: compactWidth ? `${compactWidth}px` : undefined }}
    >
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
      <button type="button" className="combo-btn" aria-label={t('Open the list: {name}', { name: title })} onMouseDown={keepFocus} onClick={() => setOpen(!open)}>
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
  large,
}: {
  icon: LucideIcon
  label: string
  color: string
  onApply: () => void
  children: (close: () => void) => ReactNode
  large?: boolean
}) {
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
      <button type="button" className="rb split-arrow" aria-label={t('{name}: choose color', { name: label })} onMouseDown={keepFocus} onClick={() => setOpen(!open)}>
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
export function OkCancel({ onOk, onCancel, okLabel = t('OK'), extra, okDisabled }: { onOk: () => void; onCancel: () => void; okLabel?: string; extra?: ReactNode; okDisabled?: boolean }) {
  return (
    <>
      {extra}
      <span className="spacer" />
      <button type="button" className="btn btn-primary" onClick={onOk} disabled={okDisabled}>
        {okLabel}
      </button>
      <button type="button" className="btn" onClick={onCancel}>
        {t('Cancel')}</button>
    </>
  )
}

export function DialogTabs<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string }[]; active: T; onChange: (id: T) => void }) {
  return (
    <div className="dlg-tabs" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.id} type="button" role="tab" aria-selected={active === tab.id} className={cls('dlg-tab', active === tab.id && 'is-active')} onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  )
}
