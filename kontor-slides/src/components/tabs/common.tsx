import { useState } from 'react'
import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical, BringToFront, FlipHorizontal2, FlipVertical2, Group, LayoutTemplate, Layers, PaintBucket, PenLine, Plus, RotateCcw, RotateCw, SendToBack, Sparkles, Ungroup, ArrowUpToLine, ArrowDownToLine, AlignHorizontalSpaceAround, AlignVerticalSpaceAround, Recycle } from 'lucide-react'
import type { Dash, Effects, Fill, LayoutId, Line, ShapeElement, SlideElement } from '../../model/types'
import { DRAW_TOOLS, geometry, SHAPE_CATEGORIES, SHAPE_PRESETS, type ShapePreset } from '../../model/shapes'
import { layoutBoxes, LAYOUTS } from '../../model/layouts'
import { getTheme, getVariant } from '../../model/themes'
import { resolveColor, type ThemeColors } from '../../model/color'
import { fillToCss, slideBackground, makeRenderCtx } from '../../render/context'
import { selectedElements, store, useStore } from '../../store/store'
import * as A from '../../store/actions'
import { ColorPalette } from '../palettes'
import { keepFocus, MenuButton, PopoverButton, RibbonButton, SplitMenuButton, cls, type MenuItem } from '../ui'

export function useThemeColors(): ThemeColors {
  const themeId = useStore((s) => s.pres.themeId)
  const variant = useStore((s) => s.pres.variant)
  const custom = useStore((s) => s.pres.colors)
  const base = getVariant(getTheme(themeId), variant).colors
  return custom ? { ...base, ...custom } : base
}

// ---------- Shapes ----------

export function ShapeIcon({ preset, size = 20 }: { preset: ShapePreset; size?: number }) {
  const w = preset.open && preset.prst === 'line' ? size - 4 : size - 4
  const h = preset.open && preset.prst === 'line' ? size - 4 : size - 4
  const geo = geometry(preset.prst, w, h)
  return (
    <svg width={size} height={size} viewBox={`-2 -2 ${size} ${size}`} aria-hidden="true">
      {geo.paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill === 'none' ? 'none' : '#eaeaea'} fillRule={p.evenOdd ? 'evenodd' : undefined} stroke="#555" strokeWidth={1} />
      ))}
      {preset.tail && <path d={`M${w} ${h} l-5 -1 l1 -4 z`} fill="#555" />}
      {preset.head && <path d="M0 0 l5 1 l-1 4 z" fill="#555" />}
    </svg>
  )
}

export function ShapeGallery({ onPick, shapesOnly }: { onPick: (p: ShapePreset) => void; shapesOnly?: boolean }) {
  return (
    <div className="shape-gallery">
      {SHAPE_CATEGORIES.map((cat) => (
        <div key={cat}>
          <div className="palette-heading">{cat}</div>
          <div className="shape-grid">
            {SHAPE_PRESETS.filter((p) => p.category === cat && !(shapesOnly && DRAW_TOOLS.has(p.prst))).map((p) => (
              <button key={p.id} type="button" title={p.label} aria-label={p.label} onMouseDown={keepFocus} onClick={() => onPick(p)}>
                <ShapeIcon preset={p} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function startShapeTool(preset: ShapePreset) {
  if (store.get().editingId) A.exitEditing()
  store.set({ tool: { kind: 'shape', preset } })
}

export function ShapesButton({ large = true }: { large?: boolean }) {
  return (
    <PopoverButton iconNode={<ShapesIcon size={large ? 30 : 16} />} label="Shapes" large={large} showLabel={!large} panelClass="shape-panel">
      {(close) => (
        <ShapeGallery
          onPick={(p) => {
            close()
            startShapeTool(p)
          }}
        />
      )}
    </PopoverButton>
  )
}

function ShapesIcon({ size = 30 }: { size?: number | string; strokeWidth?: number | string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      <rect x="3" y="12" width="13" height="13" fill="#fff" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="19" cy="11" r="7.5" fill="var(--brand-tint)" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

// ---------- Layouts ----------

export function LayoutThumb({ id, colors, bg }: { id: LayoutId; colors: ThemeColors; bg: string }) {
  const boxes = layoutBoxes(id, 1280, 720)
  return (
    <span className="layout-thumb" style={{ background: bg }}>
      {boxes.map((b, i) => (
        <span key={i} className={cls('lt-box', (b.style === 'title' || b.style === 'ctrTitle' || b.style === 'sectionTitle' || b.style === 'captionTitle') && 'lt-title')} style={{ left: `${(b.x / 1280) * 100}%`, top: `${(b.y / 720) * 100}%`, width: `${(b.w / 1280) * 100}%`, height: `${(b.h / 720) * 100}%`, borderColor: resolveColor('theme:tx1:l50', colors) }} />
      ))}
    </span>
  )
}

export function LayoutGallery({ onPick, current }: { onPick: (id: LayoutId) => void; current?: LayoutId }) {
  const pres = useStore((s) => s.pres)
  const colors = useThemeColors()
  return (
    <div className="layout-gallery">
      <div className="palette-heading">{getTheme(pres.themeId).name}</div>
      <div className="layout-grid">
        {LAYOUTS.map((l) => {
          const rc = makeRenderCtx(pres, 1, l.id)
          return (
            <button key={l.id} type="button" className={cls('layout-item', current === l.id && 'is-active')} onMouseDown={keepFocus} onClick={() => onPick(l.id)} title={l.name}>
              <LayoutThumb id={l.id} colors={colors} bg={fillToCss(slideBackground(null, rc), colors)} />
              <span>{l.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function NewSlideIcon({ size = 30 }: { size?: number | string; strokeWidth?: number | string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      <rect x="3" y="7" width="20" height="14" rx="1" fill="#fff" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6 11h10M6 14h7" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="23" cy="21" r="5.5" fill="var(--brand)" />
      <path d="M23 18.3v5.4M20.3 21h5.4" stroke="#fff" strokeWidth="1.5" />
    </svg>
  )
}

export function NewSlideButton() {
  const layout = useStore((s) => s.pres.slides.find((x) => x.id === s.slideId)?.layout)
  return (
    <SplitMenuButton
      iconNode={<NewSlideIcon />}
      label="New Slide"
      title="New Slide (Ctrl+M)"
      large
      custom
      wide
      onClick={() => A.newSlide()}
      items={(close: () => void) => (
        <>
          <LayoutGallery
            current={layout}
            onPick={(id) => {
              close()
              A.newSlide(id)
            }}
          />
          <div className="menu-sep" />
          <button
            type="button"
            className="menu-item"
            onMouseDown={keepFocus}
            onClick={() => {
              close()
              A.duplicateSlides()
            }}
          >
            <Plus size={16} /> Duplicate Selected Slides
          </button>
          <button
            type="button"
            className="menu-item"
            onMouseDown={keepFocus}
            onClick={() => {
              close()
              window.dispatchEvent(new CustomEvent('kontor:dialog', { detail: 'reuseSlides' }))
            }}
          >
            <Recycle size={16} /> Reuse Slides…
          </button>
        </>
      )}
    />
  )
}

export function LayoutButton({ large }: { large?: boolean }) {
  const layout = useStore((s) => s.pres.slides.find((x) => x.id === s.slideId)?.layout)
  return (
    <PopoverButton icon={LayoutTemplate} label="Layout" showLabel={!large} large={large} panelClass="menu-wide">
      {(close) => (
        <LayoutGallery
          current={layout}
          onPick={(id) => {
            close()
            A.setLayout(id)
          }}
        />
      )}
    </PopoverButton>
  )
}

// ---------- Fill, outline, effects ----------

function updateShapes(fn: (e: ShapeElement) => ShapeElement) {
  A.updateSelected((e) => (e.type === 'shape' ? fn(e) : e))
}

function updateWithLine(fn: (line: Line, e: SlideElement) => Line) {
  A.updateSelected((e) => (e.type === 'shape' || e.type === 'image' ? ({ ...e, line: fn(e.line, e) } as SlideElement) : e))
}

function updateEffects(fn: (fx: Effects) => Effects) {
  A.updateSelected((e) => (e.type === 'shape' || e.type === 'image' ? ({ ...e, effects: fn(e.effects ?? {}) } as SlideElement) : e))
}

export function setFillSelected(fill: Fill) {
  updateShapes((e) => ({ ...e, fill }))
}

export const GRADIENT_PRESETS: { label: string; make: (c: string) => Fill }[] = [
  { label: 'Linear Down', make: (c) => ({ type: 'gradient', kind: 'linear', angle: 90, stops: [{ pos: 0, color: `${c}:l40` }, { pos: 1, color: c }] }) },
  { label: 'Linear Right', make: (c) => ({ type: 'gradient', kind: 'linear', angle: 0, stops: [{ pos: 0, color: `${c}:l40` }, { pos: 1, color: c }] }) },
  { label: 'Linear Diagonal', make: (c) => ({ type: 'gradient', kind: 'linear', angle: 45, stops: [{ pos: 0, color: `${c}:l40` }, { pos: 1, color: `${c}:d25` }] }) },
  { label: 'Linear Up', make: (c) => ({ type: 'gradient', kind: 'linear', angle: 270, stops: [{ pos: 0, color: `${c}:l40` }, { pos: 1, color: c }] }) },
  { label: 'From Center', make: (c) => ({ type: 'gradient', kind: 'radial', angle: 0, stops: [{ pos: 0, color: `${c}:l60` }, { pos: 1, color: c }] }) },
  { label: 'Dark Variation', make: (c) => ({ type: 'gradient', kind: 'linear', angle: 90, stops: [{ pos: 0, color: c }, { pos: 1, color: `${c}:d50` }] }) },
]

function lastFillColor() {
  const el = selectedElements().find((e) => e.type === 'shape') as ShapeElement | undefined
  return el && el.fill.type === 'solid' ? el.fill.color : 'theme:accent1'
}

export function FillMenuContent({ close, onPicture }: { close: () => void; onPicture?: () => void }) {
  const colors = useThemeColors()
  const base = lastFillColor()
  const baseRef = base.startsWith('theme:') ? base.split(':').slice(0, 2).join(':') : 'theme:accent1'
  return (
    <ColorPalette
      colors={colors}
      onPick={(c) => {
        close()
        setFillSelected({ type: 'solid', color: c })
      }}
      none={{
        label: 'No Fill',
        onClick: () => {
          close()
          setFillSelected({ type: 'none' })
        },
      }}
      extra={
        <>
          <div className="palette-heading">Gradient</div>
          <div className="gradient-row">
            {GRADIENT_PRESETS.map((g) => {
              const f = g.make(baseRef)
              return (
                <button
                  key={g.label}
                  type="button"
                  className="swatch gradient-swatch"
                  title={g.label}
                  aria-label={g.label}
                  style={{ background: fillToCss(f, colors) }}
                  onMouseDown={keepFocus}
                  onClick={() => {
                    close()
                    setFillSelected(f)
                  }}
                />
              )
            })}
          </div>
          {onPicture && (
            <button
              type="button"
              className="menu-item"
              onMouseDown={keepFocus}
              onClick={() => {
                close()
                onPicture()
              }}
            >
              Picture…
            </button>
          )}
        </>
      }
    />
  )
}

const WEIGHTS = [0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6]
const DASH_LIST: [Dash, string][] = [
  ['solid', 'Solid'],
  ['sysDot', 'Round Dot'],
  ['sysDash', 'Square Dot'],
  ['dash', 'Dash'],
  ['dashDot', 'Dash Dot'],
  ['lgDash', 'Long Dash'],
  ['lgDashDot', 'Long Dash Dot'],
  ['lgDashDotDot', 'Long Dash Dot Dot'],
]

export function OutlineMenuContent({ close }: { close: () => void }) {
  const colors = useThemeColors()
  const [sub, setSub] = useState<null | 'weight' | 'dash' | 'arrows'>(null)
  const ensure = (line: Line): NonNullable<Line> => line ?? { color: 'theme:accent1:d50', width: 1, dash: 'solid' }
  if (sub)
    return (
      <div className="palette">
        <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => setSub(null)}>
          ‹ Back
        </button>
        <div className="menu-sep" />
        {sub === 'weight' &&
          WEIGHTS.map((w) => (
            <button key={w} type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), updateWithLine((l) => ({ ...ensure(l), width: w })))}>
              <span className="line-sample" style={{ borderTopWidth: Math.max(1, (w * 4) / 3) }} /> {w} pt
            </button>
          ))}
        {sub === 'dash' &&
          DASH_LIST.map(([d, label]) => (
            <button key={d} type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), updateWithLine((l) => ({ ...ensure(l), dash: d })))}>
              <svg width="60" height="6" aria-hidden="true">
                <line x1="0" y1="3" x2="60" y2="3" stroke="#333" strokeWidth="2" strokeDasharray={{ solid: '', sysDot: '2 2', sysDash: '6 2', dash: '8 6', dashDot: '8 6 2 6', lgDash: '16 6', lgDashDot: '16 6 2 6', lgDashDotDot: '16 6 2 6 2 6' }[d]} />
              </svg>
              {label}
            </button>
          ))}
        {sub === 'arrows' &&
          (
            [
              ['none', 'none', 'No Arrows'],
              ['none', 'triangle', 'Arrow at End'],
              ['triangle', 'none', 'Arrow at Start'],
              ['triangle', 'triangle', 'Arrows at Both Ends'],
              ['none', 'stealth', 'Stealth Arrow'],
              ['none', 'arrow', 'Open Arrow'],
              ['oval', 'oval', 'Round Ends'],
              ['diamond', 'diamond', 'Diamond Ends'],
            ] as const
          ).map(([head, tail, label]) => (
            <button key={label} type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), updateWithLine((l) => ({ ...ensure(l), head, tail })))}>
              {label}
            </button>
          ))}
      </div>
    )
  return (
    <ColorPalette
      colors={colors}
      onPick={(c) => {
        close()
        updateWithLine((l) => ({ ...ensure(l), color: c }))
      }}
      none={{
        label: 'No Outline',
        onClick: () => {
          close()
          updateWithLine(() => null)
        },
      }}
      extra={
        <>
          <div className="menu-sep" />
          <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => setSub('weight')}>
            Weight ›
          </button>
          <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => setSub('dash')}>
            Dashes ›
          </button>
          <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => setSub('arrows')}>
            Arrows ›
          </button>
        </>
      }
    />
  )
}

export const SHADOW_PRESETS: { label: string; shadow: Effects['shadow'] }[] = [
  { label: 'No Shadow', shadow: null },
  { label: 'Offset: Bottom Right', shadow: { color: '#000000', alpha: 0.4, blur: 4, dist: 3, angle: 45 } },
  { label: 'Offset: Bottom', shadow: { color: '#000000', alpha: 0.4, blur: 4, dist: 3, angle: 90 } },
  { label: 'Offset: Bottom Left', shadow: { color: '#000000', alpha: 0.4, blur: 4, dist: 3, angle: 135 } },
  { label: 'Offset: Right', shadow: { color: '#000000', alpha: 0.4, blur: 4, dist: 3, angle: 0 } },
  { label: 'Offset: Center', shadow: { color: '#000000', alpha: 0.4, blur: 6, dist: 0, angle: 0 } },
  { label: 'Offset: Top Left', shadow: { color: '#000000', alpha: 0.4, blur: 4, dist: 3, angle: 225 } },
  { label: 'Perspective: Below', shadow: { color: '#000000', alpha: 0.25, blur: 12, dist: 10, angle: 90 } },
]

export function EffectsMenuContent({ close }: { close: () => void }) {
  const colors = useThemeColors()
  return (
    <div className="palette effects-menu">
      <div className="palette-heading">Shadow</div>
      {SHADOW_PRESETS.map((p) => (
        <button key={p.label} type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), updateEffects((fx) => ({ ...fx, shadow: p.shadow })))}>
          {p.label}
        </button>
      ))}
      <div className="palette-heading">Glow</div>
      <div className="glow-row">
        <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), updateEffects((fx) => ({ ...fx, glow: null })))}>
          No Glow
        </button>
        {(['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'] as const).map((slot) =>
          [5, 11].map((size) => (
            <button
              key={`${slot}${size}`}
              type="button"
              className="swatch glow-swatch"
              title={`Glow: ${size} pt, ${slot.replace('accent', 'Accent ')}`}
              aria-label={`Glow ${size} point ${slot}`}
              style={{ boxShadow: `0 0 ${size / 2}px ${size / 3}px ${colors[slot]}` }}
              onMouseDown={keepFocus}
              onClick={() => (close(), updateEffects((fx) => ({ ...fx, glow: { color: `theme:${slot}`, size, alpha: 0.6 } })))}
            />
          )),
        )}
      </div>
      <div className="palette-heading">Soft Edges</div>
      <div className="row wrap">
        {[0, 1, 2.5, 5, 10, 25].map((v) => (
          <button key={v} type="button" className="chip" onMouseDown={keepFocus} onClick={() => (close(), updateEffects((fx) => ({ ...fx, softEdge: v || undefined })))}>
            {v ? `${v} pt` : 'None'}
          </button>
        ))}
      </div>
      <div className="palette-heading">Reflection</div>
      <div className="row wrap">
        <button type="button" className="chip" onMouseDown={keepFocus} onClick={() => (close(), updateEffects((fx) => ({ ...fx, reflection: false })))}>
          No Reflection
        </button>
        <button type="button" className="chip" onMouseDown={keepFocus} onClick={() => (close(), updateEffects((fx) => ({ ...fx, reflection: true })))}>
          Tight Reflection
        </button>
      </div>
    </div>
  )
}

export function FillButtons({ disabled, onPicture }: { disabled?: boolean; onPicture?: () => void }) {
  return (
    <>
      <PopoverButton icon={PaintBucket} label="Shape Fill" showLabel disabled={disabled} panelClass="palette-menu">
        {(close) => <FillMenuContent close={close} onPicture={onPicture} />}
      </PopoverButton>
      <PopoverButton icon={PenLine} label="Shape Outline" showLabel disabled={disabled} panelClass="palette-menu">
        {(close) => <OutlineMenuContent close={close} />}
      </PopoverButton>
      <PopoverButton icon={Sparkles} label="Shape Effects" showLabel disabled={disabled} panelClass="palette-menu">
        {(close) => <EffectsMenuContent close={close} />}
      </PopoverButton>
    </>
  )
}

// ---------- Quick styles ----------

export type QuickStyle = { fill: Fill; line: Line; text: string; effects?: Effects }

export function quickStyles(): QuickStyle[] {
  const slots = ['tx1', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']
  const out: QuickStyle[] = []
  for (const s of slots) out.push({ fill: { type: 'none' }, line: { color: `theme:${s}`, width: 1, dash: 'solid' }, text: `theme:${s}` })
  for (const s of slots) out.push({ fill: { type: 'solid', color: `theme:${s}` }, line: { color: `theme:${s}:d50`, width: 1, dash: 'solid' }, text: 'theme:bg1' })
  for (const s of slots) out.push({ fill: { type: 'solid', color: `theme:${s}:l80` }, line: { color: `theme:${s}`, width: 1, dash: 'solid' }, text: 'theme:tx1' })
  for (const s of slots) out.push({ fill: { type: 'gradient', kind: 'linear', angle: 90, stops: [{ pos: 0, color: `theme:${s}:l40` }, { pos: 1, color: `theme:${s}` }] }, line: null, text: 'theme:bg1' })
  for (const s of slots) out.push({ fill: { type: 'solid', color: `theme:${s}` }, line: null, text: 'theme:bg1', effects: { shadow: { color: '#000000', alpha: 0.4, blur: 4, dist: 3, angle: 45 } } })
  return out
}

export function QuickStylesGallery({ close }: { close: () => void }) {
  const colors = useThemeColors()
  return (
    <div className="quick-styles">
      <div className="palette-heading">Theme Styles</div>
      <div className="qs-grid">
        {quickStyles().map((q, i) => (
          <button
            key={i}
            type="button"
            className="qs-item"
            onMouseDown={keepFocus}
            onClick={() => {
              close()
              updateShapes((e) => ({ ...e, fill: q.fill, line: q.line, effects: q.effects ?? { ...e.effects, shadow: null } }))
            }}
            style={{
              background: fillToCss(q.fill, colors),
              border: q.line ? `1.5px solid ${resolveColor(q.line.color, colors)}` : '1.5px solid transparent',
              color: resolveColor(q.text, colors),
              boxShadow: q.effects?.shadow ? '2px 2px 3px rgba(0,0,0,.35)' : undefined,
            }}
            title="Apply style"
          >
            Abc
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- Arrange ----------

export function arrangeItems(ui: { openPane: (p: 'selection') => void }): MenuItem[] {
  const sel = store.get().selection
  const none = !sel.length
  return [
    { heading: 'Order Objects' },
    { label: 'Bring to Front', icon: BringToFront, onClick: A.bringToFront, disabled: none },
    { label: 'Send to Back', icon: SendToBack, onClick: A.sendToBack, disabled: none },
    { label: 'Bring Forward', icon: ArrowUpToLine, onClick: A.bringForward, disabled: none },
    { label: 'Send Backward', icon: ArrowDownToLine, onClick: A.sendBackward, disabled: none },
    { heading: 'Group Objects' },
    { label: 'Group', icon: Group, shortcut: 'Ctrl+G', onClick: A.groupSelection, disabled: sel.length < 2 },
    { label: 'Ungroup', icon: Ungroup, shortcut: 'Ctrl+Shift+G', onClick: A.ungroupSelection, disabled: !selectedElements().some((e) => e.type === 'group') },
    { heading: 'Position Objects' },
    ...alignItems(),
    { label: 'Rotate Right 90°', icon: RotateCw, onClick: () => A.rotateSelection(90), disabled: none },
    { label: 'Rotate Left 90°', icon: RotateCcw, onClick: () => A.rotateSelection(-90), disabled: none },
    { label: 'Flip Vertical', icon: FlipVertical2, onClick: () => A.flipSelection('v'), disabled: none },
    { label: 'Flip Horizontal', icon: FlipHorizontal2, onClick: () => A.flipSelection('h'), disabled: none },
    'separator',
    { label: 'Selection Pane…', icon: Layers, onClick: () => ui.openPane('selection') },
  ]
}

let alignToSlide = false

export function alignItems(): MenuItem[] {
  const n = store.get().selection.length
  const toSlide = alignToSlide || n === 1
  return [
    { label: 'Align Left', icon: AlignStartVertical, onClick: () => A.align('left', toSlide), disabled: !n },
    { label: 'Align Center', icon: AlignCenterVertical, onClick: () => A.align('center', toSlide), disabled: !n },
    { label: 'Align Right', icon: AlignEndVertical, onClick: () => A.align('right', toSlide), disabled: !n },
    { label: 'Align Top', icon: AlignStartHorizontal, onClick: () => A.align('top', toSlide), disabled: !n },
    { label: 'Align Middle', icon: AlignCenterHorizontal, onClick: () => A.align('middle', toSlide), disabled: !n },
    { label: 'Align Bottom', icon: AlignEndHorizontal, onClick: () => A.align('bottom', toSlide), disabled: !n },
    { label: 'Distribute Horizontally', icon: AlignHorizontalSpaceAround, onClick: () => A.distribute('h', toSlide), disabled: toSlide ? !n : n < 3 },
    { label: 'Distribute Vertically', icon: AlignVerticalSpaceAround, onClick: () => A.distribute('v', toSlide), disabled: toSlide ? !n : n < 3 },
    'separator',
    { label: 'Align to Slide', active: toSlide, onClick: () => (alignToSlide = true) },
    { label: 'Align Selected Objects', active: !toSlide, disabled: n < 2, onClick: () => (alignToSlide = false) },
  ]
}

export function ArrangeButtons({ ui }: { ui: { openPane: (p: 'selection') => void } }) {
  const n = useStore((s) => s.selection.length)
  return (
    <div className="col">
      <div className="row">
        <SplitMenuButton icon={BringToFront} label="Bring Forward" showLabel disabled={!n} onClick={A.bringForward} items={[{ label: 'Bring Forward', onClick: A.bringForward }, { label: 'Bring to Front', onClick: A.bringToFront }]} />
      </div>
      <div className="row">
        <SplitMenuButton icon={SendToBack} label="Send Backward" showLabel disabled={!n} onClick={A.sendBackward} items={[{ label: 'Send Backward', onClick: A.sendBackward }, { label: 'Send to Back', onClick: A.sendToBack }]} />
      </div>
      <div className="row">
        <RibbonButton icon={Layers} label="Selection Pane" showLabel onClick={() => ui.openPane('selection')} />
      </div>
    </div>
  )
}

export function ArrangeExtraButtons() {
  const n = useStore((s) => s.selection.length)
  const hasGroup = useStore(() => selectedElements().some((e) => e.type === 'group'))
  return (
    <div className="col">
      <MenuButton icon={AlignStartVertical} label="Align" showLabel disabled={!n} items={() => alignItems()} />
      <MenuButton
        icon={Group}
        label="Group"
        showLabel
        disabled={n < 2 && !hasGroup}
        items={() => [
          { label: 'Group', icon: Group, onClick: A.groupSelection, disabled: store.get().selection.length < 2 },
          { label: 'Ungroup', icon: Ungroup, onClick: A.ungroupSelection, disabled: !selectedElements().some((e) => e.type === 'group') },
        ]}
      />
      <MenuButton
        icon={RotateCw}
        label="Rotate"
        showLabel
        disabled={!n}
        items={[
          { label: 'Rotate Right 90°', icon: RotateCw, onClick: () => A.rotateSelection(90) },
          { label: 'Rotate Left 90°', icon: RotateCcw, onClick: () => A.rotateSelection(-90) },
          { label: 'Flip Vertical', icon: FlipVertical2, onClick: () => A.flipSelection('v') },
          { label: 'Flip Horizontal', icon: FlipHorizontal2, onClick: () => A.flipSelection('h') },
        ]}
      />
    </div>
  )
}
