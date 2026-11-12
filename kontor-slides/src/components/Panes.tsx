import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, Eye, EyeOff, MessageSquarePlus, Trash2, X, Check } from 'lucide-react'
import type { ColorRef, Comment, Fill, ImageElement, Line, ShapeElement, SlideElement, TextBody } from '../model/types'
import { resolveColor } from '../model/color'
import { uid } from '../model/factory'
import { commit, currentSlide, selectedElements, store, updateSlide, useStore } from '../store/store'
import * as A from '../store/actions'
import { readImageFile } from '../io/images'
import { fillToCss, slideBackground, makeRenderCtx } from '../render/context'
import { PATTERNS, patternTile } from '../model/patterns'
import { getOptions } from '../io/options'
import { ColorPalette } from './palettes'
import { NumberField, Popup, cls, keepFocus, pickFile, usePopover } from './ui'
import { useThemeColors } from './tabs/common'
import { t, tx, formatDate } from '../i18n'

const IN = 96

export function PaneShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <aside className="task-pane" aria-label={title}>
      <div className="tp-title">
        <span>{title}</span>
        <button type="button" className="modal-close" aria-label={t('Close')} onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="tp-body">{children}</div>
    </aside>
  )
}

function Section({ title, children, open: initial = true }: { title: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial)
  return (
    <section className="tp-section">
      <button type="button" className="tp-section-title" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {title}
      </button>
      {open && <div className="tp-section-body">{children}</div>}
    </section>
  )
}

export function ColorPickerButton({ value, onChange, label }: { value: ColorRef; onChange: (c: ColorRef) => void; label: string }) {
  const colors = useThemeColors()
  const { open, setOpen, ref, popRef } = usePopover()
  return (
    <div className="popover-anchor" ref={ref}>
      <button type="button" className="color-btn" aria-label={label} title={label} onMouseDown={keepFocus} onClick={() => setOpen(!open)}>
        <span className="color-btn-swatch" style={{ background: resolveColor(value, colors) }} />
        <ChevronDown size={12} />
      </button>
      {open && (
        <Popup anchor={ref} popRef={popRef} className="palette-menu">
          <ColorPalette colors={colors} onPick={(c) => (setOpen(false), onChange(c))} />
        </Popup>
      )}
    </div>
  )
}

function Slider({ value, onChange, label, max = 100 }: { value: number; onChange: (v: number) => void; label: string; max?: number }) {
  return (
    <label className="tp-row">
      <span>{label}</span>
      <input type="range" min={0} max={max} value={Math.round(value)} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="tp-value">{Math.round(value)}%</span>
    </label>
  )
}

/** Fill editor shared by the shape and background panes. */
function FillEditor({ fill, onChange, allowNone, onPicture }: { fill: Fill; onChange: (f: Fill) => void; allowNone: boolean; onPicture: () => void }) {
  const colors = useThemeColors()
  const kinds: [Fill['type'], string][] = [...(allowNone ? [['none', t('No fill')] as [Fill['type'], string]] : []), ['solid', t('Solid fill')], ['gradient', t('Gradient fill')], ['picture', t('Picture or texture fill')], ['pattern', t('Pattern fill')]]
  const baseColor = fill.type === 'solid' ? fill.color : fill.type === 'gradient' ? fill.stops[0].color : fill.type === 'pattern' ? fill.fg : 'theme:accent1'
  return (
    <>
      {kinds.map(([k, label]) => (
        <label key={k} className="tp-radio">
          <input
            type="radio"
            checked={fill.type === k}
            onChange={() => {
              if (k === 'none') onChange({ type: 'none' })
              if (k === 'solid') onChange({ type: 'solid', color: baseColor })
              if (k === 'gradient') onChange({ type: 'gradient', kind: 'linear', angle: 90, stops: [{ pos: 0, color: `${baseColor.split(':').slice(0, 2).join(':')}:l40` }, { pos: 1, color: baseColor }] })
              if (k === 'picture') onPicture()
              if (k === 'pattern') onChange({ type: 'pattern', preset: 'pct5', fg: baseColor, bg: 'theme:bg1' })
            }}
          />
          {label}
        </label>
      ))}
      {fill.type === 'solid' && (
        <>
          <div className="tp-row">
            <span>{t('Color')}</span>
            <ColorPickerButton label={t('Fill color')} value={fill.color} onChange={(c) => onChange({ ...fill, color: c })} />
          </div>
          <Slider label={t('Transparency')} value={(1 - (fill.alpha ?? 1)) * 100} onChange={(v) => onChange({ ...fill, alpha: 1 - v / 100 })} />
        </>
      )}
      {fill.type === 'gradient' && (
        <>
          <div className="tp-row">
            <span>{t('Type')}</span>
            <select value={fill.kind} onChange={(e) => onChange({ ...fill, kind: e.target.value as 'linear' | 'radial' })}>
              <option value="linear">{t('Linear')}</option>
              <option value="radial">{t('Radial')}</option>
            </select>
          </div>
          {fill.kind === 'linear' && (
            <div className="tp-row">
              <span>{t('Angle')}</span>
              <NumberField label={t('Gradient angle')} value={fill.angle} step={15} min={0} max={359.9} suffix="°" onChange={(v) => onChange({ ...fill, angle: v })} />
            </div>
          )}
          <div className="tp-row">
            <span>{t('Gradient stops')}</span>
            <span className="gradient-bar" style={{ background: fillToCss({ ...fill, kind: 'linear', angle: 0 }, colors) }} />
          </div>
          {fill.stops.map((stop, i) => (
            <div key={i} className="tp-row">
              <span>{t('Stop {n}', { n: i + 1 })}</span>
              <ColorPickerButton label={t('Stop {n} color', { n: i + 1 })} value={stop.color} onChange={(c) => onChange({ ...fill, stops: fill.stops.map((s, j) => (j === i ? { ...s, color: c } : s)) })} />
              <NumberField label={t('Stop {n} position', { n: i + 1 })} value={stop.pos * 100} step={5} min={0} max={100} suffix="%" width={64} onChange={(v) => onChange({ ...fill, stops: fill.stops.map((s, j) => (j === i ? { ...s, pos: v / 100 } : s)) })} />
            </div>
          ))}
          <div className="tp-row">
            <button type="button" className="btn btn-small" onClick={() => onChange({ ...fill, stops: [...fill.stops, { pos: 1, color: fill.stops[fill.stops.length - 1].color }].sort((a, b) => a.pos - b.pos) })}>
              {t('Add stop')}
            </button>
            <button type="button" className="btn btn-small" disabled={fill.stops.length <= 2} onClick={() => onChange({ ...fill, stops: fill.stops.slice(0, -1) })}>
              {t('Remove stop')}
            </button>
          </div>
        </>
      )}
      {fill.type === 'picture' && (
        <>
          <div className="tp-row">
            <button type="button" className="btn btn-small" onClick={onPicture}>
              {t('Insert…')}
            </button>
          </div>
          <label className="tp-check">
            <input type="checkbox" checked={!!fill.tile} onChange={(e) => onChange({ ...fill, tile: e.target.checked })} /> {t('Tile picture as texture')}
          </label>
          <Slider label={t('Transparency')} value={(1 - (fill.alpha ?? 1)) * 100} onChange={(v) => onChange({ ...fill, alpha: 1 - v / 100 })} />
        </>
      )}
      {fill.type === 'pattern' && (
        <>
          <div className="pattern-grid" role="listbox" aria-label={t('Pattern')}>
            {PATTERNS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={fill.preset === p.id}
                title={t(p.label)}
                className={cls('pattern-swatch', fill.preset === p.id && 'is-active')}
                style={{ background: `url("${patternTile(p.id, resolveColor(fill.fg, colors), resolveColor(fill.bg, colors), 2)}") repeat` }}
                onClick={() => onChange({ ...fill, preset: p.id })}
              />
            ))}
          </div>
          <div className="tp-row">
            <span>{t('Foreground')}</span>
            <ColorPickerButton label={t('Pattern foreground color')} value={fill.fg} onChange={(c) => onChange({ ...fill, fg: c })} />
          </div>
          <div className="tp-row">
            <span>{t('Background')}</span>
            <ColorPickerButton label={t('Pattern background color')} value={fill.bg} onChange={(c) => onChange({ ...fill, bg: c })} />
          </div>
        </>
      )}
    </>
  )
}

async function pickPictureFill(): Promise<Fill | null> {
  const [file] = await pickFile('image/*')
  if (!file) return null
  const { src } = await readImageFile(file, store.get().pres.size)
  return { type: 'picture', src }
}

function LineEditor({ line, onChange }: { line: Line; onChange: (l: Line) => void }) {
  const l = line ?? { color: 'theme:accent1', width: 1, dash: 'solid' as const }
  return (
    <>
      <label className="tp-radio">
        <input type="radio" checked={!line} onChange={() => onChange(null)} /> {t('No line')}
      </label>
      <label className="tp-radio">
        <input type="radio" checked={!!line} onChange={() => onChange(l)} /> {t('Solid line')}
      </label>
      {line && (
        <>
          <div className="tp-row">
            <span>{t('Color')}</span>
            <ColorPickerButton label={t('Line color')} value={line.color} onChange={(c) => onChange({ ...line, color: c })} />
          </div>
          <Slider label={t('Transparency')} value={(1 - (line.alpha ?? 1)) * 100} onChange={(v) => onChange({ ...line, alpha: 1 - v / 100 })} />
          <div className="tp-row">
            <span>{t('Width')}</span>
            <NumberField label={t('Line width')} value={line.width} step={0.25} min={0} max={1584} suffix={t(' pt')} onChange={(v) => onChange({ ...line, width: v })} />
          </div>
          <div className="tp-row">
            <span>{t('Dash type')}</span>
            <select value={line.dash} onChange={(e) => onChange({ ...line, dash: e.target.value as NonNullable<Line>['dash'] })}>
              {['solid', 'sysDot', 'sysDash', 'dash', 'dashDot', 'lgDash', 'lgDashDot', 'lgDashDotDot'].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          {(['head', 'tail'] as const).map((end) => (
            <div key={end} className="tp-row">
              <span>{end === 'head' ? t('Begin arrow') : t('End arrow')}</span>
              <select value={line[end] ?? 'none'} onChange={(e) => onChange({ ...line, [end]: e.target.value })}>
                {['none', 'triangle', 'arrow', 'stealth', 'diamond', 'oval'].map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </>
      )}
    </>
  )
}

export function FormatShapePane({ onClose }: { onClose: () => void }) {
  const sel = useStore(() => selectedElements())
  const el = sel[0]
  if (!el)
    return (
      <PaneShell title={t('Format Shape')} onClose={onClose}>
        <p className="tp-hint">{t('Select a shape, picture or text box to format it.')}</p>
      </PaneShell>
    )
  const update = (fn: (e: SlideElement) => SlideElement) => A.updateSelected(fn)
  const shape = el.type === 'shape' ? (el as ShapeElement) : null
  const image = el.type === 'image' ? (el as ImageElement) : null
  const text = shape?.text
  const setText = (patch: Partial<TextBody>) => update((e) => (e.type === 'shape' && e.text ? { ...e, text: { ...e.text, ...patch } } : e))
  const shadow = (el.type === 'shape' || el.type === 'image') ? el.effects?.shadow : null
  return (
    <PaneShell title={image ? t('Format Picture') : t('Format Shape')} onClose={onClose}>
      {shape && (
        <Section title={t('Fill')}>
          <FillEditor fill={shape.fill} allowNone onChange={(f) => update((e) => (e.type === 'shape' ? { ...e, fill: f } : e))} onPicture={async () => {
            const f = await pickPictureFill()
            if (f) update((e) => (e.type === 'shape' ? { ...e, fill: f } : e))
          }} />
        </Section>
      )}
      {(shape || image) && (
        <Section title={image ? t('Border') : t('Line')}>
          <LineEditor line={(shape ?? image)!.line} onChange={(l) => update((e) => (e.type === 'shape' || e.type === 'image' ? ({ ...e, line: l } as SlideElement) : e))} />
        </Section>
      )}
      {(shape || image) && (
        <Section title={t('Shadow')} open={false}>
          <label className="tp-check">
            <input
              type="checkbox"
              checked={!!shadow}
              onChange={(e) => update((x) => (x.type === 'shape' || x.type === 'image' ? ({ ...x, effects: { ...x.effects, shadow: e.target.checked ? { color: '#000000', alpha: 0.4, blur: 4, dist: 3, angle: 45 } : null } } as SlideElement) : x))}
            />
            {t('Shadow')}
          </label>
          {shadow && (
            <>
              <div className="tp-row">
                <span>{t('Color')}</span>
                <ColorPickerButton label={t('Shadow color')} value={shadow.color} onChange={(c) => update((x) => (x.type === 'shape' || x.type === 'image' ? ({ ...x, effects: { ...x.effects, shadow: { ...shadow, color: c } } } as SlideElement) : x))} />
              </div>
              <Slider label={t('Transparency')} value={(1 - shadow.alpha) * 100} onChange={(v) => update((x) => (x.type === 'shape' || x.type === 'image' ? ({ ...x, effects: { ...x.effects, shadow: { ...shadow, alpha: 1 - v / 100 } } } as SlideElement) : x))} />
              {(['blur', 'dist', 'angle'] as const).map((k) => (
                <div key={k} className="tp-row">
                  <span>{{ blur: t('Blur'), dist: t('Distance'), angle: t('Angle') }[k]}</span>
                  <NumberField label={{ blur: t('Shadow blur'), dist: t('Shadow distance'), angle: t('Shadow angle') }[k]} value={shadow[k]} step={k === 'angle' ? 15 : 1} min={0} max={k === 'angle' ? 359 : 100} suffix={k === 'angle' ? '°' : t(' pt')} onChange={(v) => update((x) => (x.type === 'shape' || x.type === 'image' ? ({ ...x, effects: { ...x.effects, shadow: { ...shadow, [k]: v } } } as SlideElement) : x))} />
                </div>
              ))}
            </>
          )}
        </Section>
      )}
      {image && (
        <Section title={t('Picture Corrections')} open={false}>
          {(['brightness', 'contrast', 'saturation'] as const).map((k) => (
            <div key={k} className="tp-row">
              <span>{{ brightness: t('Brightness'), contrast: t('Contrast'), saturation: t('Saturation') }[k]}</span>
              <NumberField label={{ brightness: t('Brightness'), contrast: t('Contrast'), saturation: t('Saturation') }[k]} value={(image.adjust?.[k] ?? 0) * 100} step={5} min={-100} max={100} suffix="%" onChange={(v) => update((x) => (x.type === 'image' ? { ...x, adjust: { ...x.adjust, [k]: v / 100 } } : x))} />
            </div>
          ))}
          <Slider label={t('Transparency')} value={(image.adjust?.transparency ?? 0) * 100} onChange={(v) => update((x) => (x.type === 'image' ? { ...x, adjust: { ...x.adjust, transparency: v / 100 } } : x))} />
        </Section>
      )}
      <Section title={t('Size & Position')}>
        {(
          [
            ['h', t('Height')],
            ['w', t('Width')],
          ] as const
        ).map(([k, label]) => (
          <div key={k} className="tp-row">
            <span>{label}</span>
            <NumberField label={label} value={el[k] / IN} step={0.1} min={0.01} max={56} suffix='"' onChange={(v) => A.setSelectionSize(k === 'w' ? v * IN : null, k === 'h' ? v * IN : null, image !== null)} />
          </div>
        ))}
        <label className="tp-check">
          <input type="checkbox" checked={!!el.lockAspect} onChange={(e) => update((x) => ({ ...x, lockAspect: e.target.checked || undefined }))} /> {t('Lock aspect ratio')}
        </label>
        <div className="tp-row">
          <span>{t('Rotation')}</span>
          <NumberField label={t('Rotation')} value={el.rot} step={1} min={-3600} max={3600} suffix="°" onChange={(v) => update((e) => ({ ...e, rot: ((v % 360) + 360) % 360 }))} />
        </div>
        {(
          [
            ['x', t('Horizontal position')],
            ['y', t('Vertical position')],
          ] as const
        ).map(([k, label]) => (
          <div key={k} className="tp-row">
            <span>{label}</span>
            <NumberField label={label} value={el[k] / IN} step={0.1} min={-100} max={100} suffix='"' onChange={(v) => update((e) => ({ ...e, [k]: v * IN }))} />
          </div>
        ))}
      </Section>
      {text && (
        <Section title={t('Text Box')}>
          <div className="tp-row">
            <span>{t('Vertical alignment')}</span>
            <select value={text.anchor} onChange={(e) => setText({ anchor: e.target.value as TextBody['anchor'] })}>
              <option value="top">{t('Top')}</option>
              <option value="middle">{t('Middle')}</option>
              <option value="bottom">{t('Bottom')}</option>
            </select>
          </div>
          <div className="tp-row">
            <span>{t('Text direction')}</span>
            <select value={text.vert ?? 'horz'} onChange={(e) => setText({ vert: e.target.value as TextBody['vert'] })}>
              <option value="horz">{t('Horizontal')}</option>
              <option value="vert">{t('Rotate all text 90°')}</option>
              <option value="vert270">{t('Rotate all text 270°')}</option>
            </select>
          </div>
          {(
            [
              ['none', t('Do not Autofit')],
              ['shrink', t('Shrink text on overflow')],
              ['resize', t('Resize shape to fit text')],
            ] as const
          ).map(([v, label]) => (
            <label key={v} className="tp-radio">
              <input type="radio" checked={text.autofit === v} onChange={() => setText({ autofit: v, fontScale: v === 'shrink' ? text.fontScale : 1, lnSpcReduction: v === 'shrink' ? text.lnSpcReduction : 0 })} /> {label}
            </label>
          ))}
          {([t('Left margin'), t('Top margin'), t('Right margin'), t('Bottom margin')] as const).map((side, i) => (
            <div key={side} className="tp-row">
              <span>{side}</span>
              <NumberField label={side} value={text.inset[i] / IN} step={0.05} min={0} max={10} suffix='"' onChange={(v) => setText({ inset: text.inset.map((x, j) => (j === i ? v * IN : x)) as TextBody['inset'] })} />
            </div>
          ))}
          <label className="tp-check">
            <input type="checkbox" checked={text.wrap} onChange={(e) => setText({ wrap: e.target.checked })} /> {t('Wrap text in shape')}
          </label>
          <div className="tp-row">
            <span>{t('Columns')}</span>
            <NumberField label={t('Columns')} value={text.columns ?? 1} step={1} min={1} max={16} decimals={0} onChange={(v) => setText({ columns: Math.round(v) })} />
          </div>
        </Section>
      )}
      <Section title={t('Alt Text')} open={false}>
        <textarea className="tp-textarea" aria-label={t('Alt text description')} placeholder={t('Describe this object for people who use screen readers')} value={el.alt ?? ''} onChange={(e) => update((x) => ({ ...x, alt: e.target.value }))} />
      </Section>
    </PaneShell>
  )
}

export function FormatBackgroundPane({ onClose }: { onClose: () => void }) {
  const pres = useStore((s) => s.pres)
  const slide = useStore((s) => currentSlide(s))
  const rc = makeRenderCtx(pres, 1, slide.layout)
  const fill = slideBackground(slide.background, rc)
  return (
    <PaneShell title={t('Format Background')} onClose={onClose}>
      <Section title={t('Fill')}>
        <FillEditor
          fill={fill}
          allowNone={false}
          onChange={(f) => A.setBackground(f)}
          onPicture={async () => {
            const f = await pickPictureFill()
            if (f) A.setBackground(f)
          }}
        />
        <label className="tp-check">
          <input type="checkbox" checked={!!slide.hideBackgroundGraphics} onChange={(e) => A.setHideBackgroundGraphics(e.target.checked)} /> {t('Hide background graphics')}
        </label>
      </Section>
      <div className="tp-actions">
        <button type="button" className="btn" onClick={() => A.setBackground(slide.background ?? fill, true, !!slide.hideBackgroundGraphics)}>
          {t('Apply to All')}
        </button>
        <button type="button" className="btn" onClick={() => A.setBackground(null)}>
          {t('Reset Background')}
        </button>
      </div>
    </PaneShell>
  )
}

export function SelectionPane({ onClose }: { onClose: () => void }) {
  const slide = useStore((s) => currentSlide(s))
  const selection = useStore((s) => s.selection)
  const [renaming, setRenaming] = useState<string | null>(null)
  const sid = slide.id
  const setHidden = (id: string | null, hidden: boolean) => commit((p) => updateSlide(p, sid, (sl) => ({ ...sl, elements: sl.elements.map((e) => (id === null || e.id === id ? { ...e, hidden } : e)) })))
  const ordered = [...slide.elements].reverse()
  return (
    <PaneShell title={t('Selection')} onClose={onClose}>
      <div className="tp-actions">
        <button type="button" className="btn btn-small" onClick={() => setHidden(null, false)}>
          {t('Show All')}
        </button>
        <button type="button" className="btn btn-small" onClick={() => setHidden(null, true)}>
          {t('Hide All')}
        </button>
        <span className="spacer" />
        <button type="button" className="btn btn-icon" aria-label={t('Bring Forward')} title={t('Bring Forward')} disabled={!selection.length} onClick={A.bringForward}>
          <ChevronUp size={14} />
        </button>
        <button type="button" className="btn btn-icon" aria-label={t('Send Backward')} title={t('Send Backward')} disabled={!selection.length} onClick={A.sendBackward}>
          <ChevronDown size={14} />
        </button>
      </div>
      <ul className="sel-list">
        {ordered.map((e) => (
          <li key={e.id} className={cls(selection.includes(e.id) && 'is-selected', e.hidden && 'is-hidden')}>
            {renaming === e.id ? (
              <input
                autoFocus
                defaultValue={e.name}
                aria-label={t('Object name')}
                onBlur={(ev) => {
                  const name = ev.target.value.trim()
                  if (name) A.updateElement(e.id, (x) => ({ ...x, name }))
                  setRenaming(null)
                }}
                onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()}
              />
            ) : (
              <button type="button" className="sel-name" onClick={(ev) => A.select(ev.ctrlKey || ev.metaKey || ev.shiftKey ? [...selection, e.id] : [e.id])} onDoubleClick={() => setRenaming(e.id)}>
                {e.name}
              </button>
            )}
            <button type="button" className="btn btn-icon" aria-label={e.hidden ? t('Show') : t('Hide')} title={e.hidden ? t('Show') : t('Hide')} onClick={() => setHidden(e.id, !e.hidden)}>
              {e.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </li>
        ))}
      </ul>
      {!ordered.length && <p className="tp-hint">{t('There are no objects on this slide.')}</p>}
    </PaneShell>
  )
}

// ---------- Comments ----------

const AUTHOR = tx('Author')

export function addComment(text: string) {
  const s = store.get()
  const c: Comment = { id: uid('c'), author: getOptions().userName || s.pres.author || t(AUTHOR), text, date: new Date().toISOString(), x: 24, y: 24, replies: [] }
  commit((p) => updateSlide(p, s.slideId, (sl) => ({ ...sl, comments: [...(sl.comments ?? []), c] })))
}

let composeRequested = false

/** Opens the Comments pane with a new comment box (Insert > Comment, Review > New Comment). */
export function requestNewComment() {
  composeRequested = true
  store.set({ pane: 'comments' })
  window.dispatchEvent(new CustomEvent('kontor:compose'))
}

export function navigateComments(dir: number) {
  const s = store.get()
  const idx = s.pres.slides.findIndex((x) => x.id === s.slideId)
  const order = dir > 0 ? s.pres.slides.slice(idx + 1) : s.pres.slides.slice(0, idx).reverse()
  const next = order.find((x) => x.comments?.length)
  if (next) {
    A.goToSlide(next.id)
    store.set({ pane: 'comments' })
  }
}

export function deleteComments(scope: 'slide' | 'all') {
  const s = store.get()
  commit((p) => ({ ...p, slides: p.slides.map((x) => (scope === 'all' || x.id === s.slideId ? { ...x, comments: [] } : x)) }))
}

function updateComments(slideId: string, fn: (cs: Comment[]) => Comment[]) {
  commit((p) => updateSlide(p, slideId, (sl) => ({ ...sl, comments: fn(sl.comments ?? []) })))
}

export function CommentsPane({ onClose }: { onClose: () => void }) {
  const slide = useStore((s) => currentSlide(s))
  const pres = useStore((s) => s.pres)
  const [draft, setDraft] = useState('')
  const [composing, setComposing] = useState(() => {
    const v = composeRequested
    composeRequested = false
    return v
  })
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const comments = slide.comments ?? []

  useEffect(() => {
    const onCompose = () => {
      composeRequested = false
      setComposing(true)
    }
    window.addEventListener('kontor:compose', onCompose)
    return () => window.removeEventListener('kontor:compose', onCompose)
  }, [])

  const fmt = (d: string) => formatDate(new Date(d), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return (
    <PaneShell title={t('Comments')} onClose={onClose}>
      <button type="button" className="btn" onClick={() => setComposing(true)}>
        <MessageSquarePlus size={14} /> {t('New')}
      </button>
      {composing && (
        <div className="comment-card is-new">
          <textarea autoFocus className="tp-textarea" placeholder={t('Start a conversation')} aria-label={t('New comment')} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="tp-actions">
            <button type="button" className="btn btn-primary btn-small" disabled={!draft.trim()} onClick={() => (addComment(draft.trim()), setDraft(''), setComposing(false))}>
              {t('Post')}
            </button>
            <button type="button" className="btn btn-small" onClick={() => (setDraft(''), setComposing(false))}>
              {t('Cancel')}
            </button>
          </div>
        </div>
      )}
      {comments.map((c) => (
        <div key={c.id} className={cls('comment-card', c.resolved && 'is-resolved')}>
          <div className="comment-head">
            <span className="avatar">{c.author.slice(0, 1).toUpperCase()}</span>
            <strong>{c.author}</strong>
            <small>{fmt(c.date)}</small>
            <span className="spacer" />
            <button type="button" className="btn btn-icon" title={c.resolved ? t('Reopen') : t('Resolve thread')} aria-label={c.resolved ? t('Reopen') : t('Resolve thread')} onClick={() => updateComments(slide.id, (cs) => cs.map((x) => (x.id === c.id ? { ...x, resolved: !x.resolved } : x)))}>
              <Check size={14} />
            </button>
            <button type="button" className="btn btn-icon" title={t('Delete thread')} aria-label={t('Delete thread')} onClick={() => updateComments(slide.id, (cs) => cs.filter((x) => x.id !== c.id))}>
              <Trash2 size={14} />
            </button>
          </div>
          <p>{c.text}</p>
          {c.replies.map((r) => (
            <div key={r.id} className="comment-reply">
              <strong>{r.author}</strong> <small>{fmt(r.date)}</small>
              <p>{r.text}</p>
            </div>
          ))}
          {replyTo === c.id ? (
            <div>
              <textarea autoFocus className="tp-textarea" aria-label={t('Reply')} placeholder={t('Reply')} value={reply} onChange={(e) => setReply(e.target.value)} />
              <button
                type="button"
                className="btn btn-primary btn-small"
                disabled={!reply.trim()}
                onClick={() => {
                  updateComments(slide.id, (cs) => cs.map((x) => (x.id === c.id ? { ...x, replies: [...x.replies, { id: uid('r'), author: getOptions().userName || pres.author || t(AUTHOR), text: reply.trim(), date: new Date().toISOString() }] } : x)))
                  setReply('')
                  setReplyTo(null)
                }}
              >
                {t('Reply')}
              </button>
            </div>
          ) : (
            <button type="button" className="link-btn" onClick={() => setReplyTo(c.id)}>
              {t('Reply')}
            </button>
          )}
        </div>
      ))}
      {!comments.length && !composing && <p className="tp-hint">{t('There are no comments on this slide.')}</p>}
    </PaneShell>
  )
}
