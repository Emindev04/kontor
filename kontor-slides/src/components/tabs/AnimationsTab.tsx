import { useState } from 'react'
import { ArrowDown, ArrowUp, Clock, MousePointerClick, Paintbrush, PanelRight, Play, Plus, Sparkle, Star, Trash2, Zap } from 'lucide-react'
import type { AnimEntry } from '../../model/types'
import { ANIMATIONS, EFFECT_COLORS, MOTION_PATHS, PATH_OPTIONS, animationDef, type AnimationDef } from '../../model/effects'
import { currentSlide, store, useStore } from '../../store/store'
import { findElement } from '../../model/factory'
import * as AA from '../../store/animActions'
import { MenuButton, NumberField, PopoverButton, RibbonButton, RibbonGroup, cls, keepFocus, type MenuItem } from '../ui'
import { preview } from './TransitionsTab'
import { t, tx } from '../../i18n'

export function effectLabel(e: Pick<AnimEntry, 'name' | 'effect'>) {
  return t(animationDef(e.name)?.label ?? MOTION_PATHS[e.name]?.label ?? (e.name === 'custom' ? tx('Custom Path') : e.name))
}

function EffectIcon({ effect }: { effect: AnimEntry['effect'] }) {
  if (effect === 'path')
    return (
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path d="M3 14 C 6 2, 12 2, 15 10" fill="none" stroke={EFFECT_COLORS.path} strokeWidth="1.6" strokeDasharray="2 1.5" />
        <circle cx="3" cy="14" r="1.8" fill="#3FA34D" />
        <circle cx="15" cy="10" r="1.8" fill="#D9483B" />
      </svg>
    )
  return <Star size={18} color={EFFECT_COLORS[effect]} fill={EFFECT_COLORS[effect]} fillOpacity={0.25} />
}

const GROUPS: { effect: AnimEntry['effect']; title: string }[] = [
  { effect: 'entrance', title: tx('Entrance') },
  { effect: 'emphasis', title: tx('Emphasis') },
  { effect: 'exit', title: tx('Exit') },
  { effect: 'path', title: tx('Motion Paths') },
]

function EffectGallery({ onPick, current }: { onPick: (d: AnimationDef) => void; current?: string }) {
  return (
    <div className="anim-full-gallery">
      {GROUPS.map((g) => (
        <div key={g.effect}>
          <div className="palette-heading">{t(g.title)}</div>
          <div className="effect-gallery wrap">
            {ANIMATIONS.filter((a) => a.effect === g.effect).map((a) => (
              <button key={a.name} type="button" className={cls('effect-item', current === a.name && 'is-active')} title={`${t(a.label)} (${t(g.title)})`} onMouseDown={keepFocus} onClick={() => onPick(a)}>
                <EffectIcon effect={a.effect} />
                <span>{t(a.label)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const DIRS: { id: NonNullable<AnimEntry['direction']>; label: string; exitLabel: string }[] = [
  { id: 'down', label: tx('From Bottom'), exitLabel: tx('To Bottom') },
  { id: 'left', label: tx('From Left'), exitLabel: tx('To Left') },
  { id: 'right', label: tx('From Right'), exitLabel: tx('To Right') },
  { id: 'up', label: tx('From Top'), exitLabel: tx('To Top') },
]

function effectOptions(e: AnimEntry | undefined): MenuItem[] {
  if (!e) return []
  if (e.effect === 'path') {
    const group = Object.entries(PATH_OPTIONS).find(([, v]) => v.includes(e.name))?.[1] ?? []
    return [
      ...group.map((id) => ({ label: t(MOTION_PATHS[id].label), active: e.name === id, onClick: () => AA.updateEntries({ name: id, path: MOTION_PATHS[id].d }) })),
      'separator',
      { label: t('Reverse Path Direction'), onClick: () => AA.updateEntries({ path: reversePath(e.path ?? '') }) },
    ]
  }
  const exit = e.effect === 'exit'
  const dirs: MenuItem[] = animationDef(e.name)?.directional ? [{ heading: t('Direction') }, ...DIRS.map((d) => ({ label: t(exit ? d.exitLabel : d.label), active: (e.direction ?? 'down') === d.id, onClick: () => AA.updateEntries({ direction: d.id }) }))] : []
  const target = findElement(currentSlide().elements, e.targetId)
  const text = target?.type === 'shape' && target.text && target.text.doc.content.some((p) => p.content?.length)
  const seq: MenuItem[] = text
    ? [
        { heading: t('Sequence') },
        { label: t('As One Object'), active: !e.textBuild, onClick: () => AA.updateEntries({ textBuild: null }) },
        { label: t('By Paragraph'), active: e.textBuild === 'paragraph', onClick: () => AA.updateEntries({ textBuild: 'paragraph' }) },
      ]
    : []
  return [...dirs, ...seq]
}

/** Reverses simple line paths (M … L …) by mirroring the end point; other paths are mirrored too. */
function reversePath(d: string) {
  let i = 0
  return d.replace(/-?\d*\.?\d+(?:e-?\d+)?/gi, (m) => {
    i++
    return String(-Number(m))
  })
}

export function AnimationsTab() {
  const sel = useStore((s) => s.selection)
  const pane = useStore((s) => s.pane)
  const painter = useStore((s) => s.animPainter)
  const entries = useStore((s) => {
    void s.pres
    void s.animSel
    return AA.selectedEntries()
  })
  const has = sel.length > 0
  const first = entries[0]
  const slideHas = useStore((s) => (currentSlide(s).animations ?? []).length > 0)
  const shapes = useStore((s) => currentSlide(s).elements)
  const opts = effectOptions(first)
  return (
    <>
      <RibbonGroup label={t('Preview')}>
        <RibbonButton icon={Play} label={t('Preview')} large onClick={() => preview('animations')} disabled={!slideHas} />
      </RibbonGroup>
      <RibbonGroup label={t('Animation')}>
        <div className="effect-gallery anim-gallery">
          <button type="button" className={cls('effect-item', has && !entries.length && 'is-active')} disabled={!has} onMouseDown={keepFocus} onClick={() => AA.removeAnimation()}>
            <span className="anim-icon anim-none" aria-hidden="true" />
            <span>{t('None')}</span>
          </button>
          {ANIMATIONS.filter((a) => a.effect === 'entrance').slice(0, 9).map((a) => (
            <button
              key={a.name}
              type="button"
              className={cls('effect-item', first?.name === a.name && 'is-active')}
              disabled={!has}
              title={t('{name} (Entrance)', { name: t(a.label) })}
              onMouseDown={keepFocus}
              onClick={() => {
                AA.applyAnimation(a.name)
                preview('animations')
              }}
            >
              <EffectIcon effect={a.effect} />
              <span>{t(a.label)}</span>
            </button>
          ))}
          <PopoverButton icon={Sparkle} label={t('More Effects')} disabled={!has} panelClass="menu-wide">
            {(close) => (
              <EffectGallery
                current={first?.name}
                onPick={(a) => {
                  close()
                  AA.applyAnimation(a.name)
                  if (a.name !== 'custom') preview('animations')
                }}
              />
            )}
          </PopoverButton>
        </div>
        <MenuButton icon={Sparkle} label={t('Effect Options')} large disabled={!opts.length} items={opts} />
      </RibbonGroup>
      <RibbonGroup label={t('Advanced Animation')}>
        <PopoverButton icon={Plus} label={t('Add Animation')} large disabled={!has} panelClass="menu-wide">
          {(close) => (
            <EffectGallery
              onPick={(a) => {
                close()
                AA.addAnimation(a.name)
                if (a.name !== 'custom') preview('animations')
              }}
            />
          )}
        </PopoverButton>
        <div className="col">
          <RibbonButton icon={PanelRight} label={t('Animation Pane')} showLabel active={pane === 'animation'} onClick={() => store.set({ pane: pane === 'animation' ? null : 'animation' })} />
          <MenuButton
            icon={Zap}
            label={t('Trigger')}
            showLabel
            disabled={!first}
            items={() => [
              { heading: t('On Click of') },
              { label: t('None (part of the click sequence)'), active: !first?.triggerId, onClick: () => AA.updateEntries({ triggerId: null }) },
              ...shapes.filter((e) => e.id !== first?.targetId).map((e) => ({ label: e.name, active: first?.triggerId === e.id, onClick: () => AA.updateEntries({ triggerId: e.id, trigger: 'click' }) })),
            ]}
          />
          <RibbonButton icon={Paintbrush} label={t('Animation Painter')} showLabel active={!!painter} disabled={!first && !painter} onClick={() => (painter ? store.set({ animPainter: null }) : AA.startAnimationPainter())} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Timing')}>
        <div className="col timing">
          <label className="field-row">
            <span>{t('Start:')}</span>
            <select value={first?.trigger ?? 'click'} disabled={!first} onChange={(e) => AA.updateEntries({ trigger: e.target.value as AnimEntry['trigger'] })}>
              <option value="click">{t('On Click')}</option>
              <option value="with">{t('With Previous')}</option>
              <option value="after">{t('After Previous')}</option>
            </select>
          </label>
          <label className="field-row">
            <span>{t('Duration:')}</span>
            <NumberField label={t('Animation duration')} value={first?.duration ?? 0.5} step={0.25} min={0.01} max={59} suffix={t(' s')} disabled={!first} onChange={(v) => AA.updateEntries({ duration: v })} />
          </label>
          <label className="field-row">
            <span>{t('Delay:')}</span>
            <NumberField label={t('Animation delay')} value={first?.delay ?? 0} step={0.25} min={0} max={59} suffix={t(' s')} disabled={!first} onChange={(v) => AA.updateEntries({ delay: v })} />
          </label>
        </div>
        <div className="col timing">
          <span className="field-caption">{t('Reorder Animation')}</span>
          <RibbonButton icon={ArrowUp} label={t('Move Earlier')} showLabel disabled={!first} onClick={() => AA.moveEntry(-1)} />
          <RibbonButton icon={ArrowDown} label={t('Move Later')} showLabel disabled={!first} onClick={() => AA.moveEntry(1)} />
        </div>
      </RibbonGroup>
    </>
  )
}

// ---------- Animation Pane ----------

export function AnimationPane({ onClose }: { onClose: () => void }) {
  const slide = useStore((s) => currentSlide(s))
  const animSel = useStore((s) => s.animSel)
  const [drag, setDrag] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const list = (slide.animations ?? []).filter((a) => slide.elements.some((e) => e.id === a.targetId))
  const name = (id: string) => slide.elements.find((e) => e.id === id)?.name ?? '?'
  // Click numbers as shown next to the objects on the slide.
  let click = 0
  const numbers = list.map((a, i) => (a.triggerId ? null : a.trigger === 'click' || i === 0 ? (a.trigger === 'click' ? ++click : 0) : null))
  const maxEnd = Math.max(1, ...list.map((a) => a.delay + a.duration))
  const pick = (a: AnimEntry) => store.set({ animSel: a.id, selection: [a.targetId], focus: 'canvas' })
  return (
    <aside className="task-pane anim-pane" aria-label={t('Animation Pane')}>
      <div className="tp-title">
        <span>{t('Animation Pane')}</span>
        <button type="button" className="modal-close" aria-label={t('Close')} onClick={onClose}>
          ×
        </button>
      </div>
      <div className="tp-actions">
        <button type="button" className="btn btn-small" disabled={!list.length} onClick={() => preview('animations')}>
          <Play size={12} /> {animSel ? t('Play From') : t('Play All')}
        </button>
        <span className="spacer" />
        <button type="button" className="btn btn-icon" aria-label={t('Move Earlier')} title={t('Move Earlier')} disabled={!animSel} onClick={() => AA.moveEntry(-1, animSel ?? undefined)}>
          <ArrowUp size={14} />
        </button>
        <button type="button" className="btn btn-icon" aria-label={t('Move Later')} title={t('Move Later')} disabled={!animSel} onClick={() => AA.moveEntry(1, animSel ?? undefined)}>
          <ArrowDown size={14} />
        </button>
      </div>
      <ul className="anim-list">
        {list.map((a, i) => (
          <li
            key={a.id}
            className={cls(animSel === a.id && 'is-selected', drag === a.id && 'is-dragging')}
            draggable
            onDragStart={(e) => {
              setDrag(a.id)
              e.dataTransfer.setData('text/plain', a.id)
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (drag && drag !== a.id) AA.moveEntryTo(drag, i)
              setDrag(null)
            }}
            onDragEnd={() => setDrag(null)}
            onClick={() => pick(a)}
            onContextMenu={(e) => {
              e.preventDefault()
              pick(a)
              setMenu({ id: a.id, x: e.clientX, y: e.clientY })
            }}
          >
            <span className="al-num">{numbers[i] ? numbers[i] : ''}</span>
            <span className="al-trigger" title={a.triggerId ? t('On click of {name}', { name: name(a.triggerId) }) : a.trigger === 'click' ? t('On Click') : a.trigger === 'with' ? t('With Previous') : t('After Previous')}>
              {a.triggerId ? <Zap size={12} /> : a.trigger === 'click' ? <MousePointerClick size={12} /> : a.trigger === 'after' ? <Clock size={12} /> : null}
            </span>
            <EffectIcon effect={a.effect} />
            <span className="al-name">
              {name(a.targetId)}
              <small>{effectLabel(a)}</small>
            </span>
            <span className="al-bar" aria-hidden="true">
              <span style={{ left: `${(a.delay / maxEnd) * 100}%`, width: `${Math.max(4, (a.duration / maxEnd) * 100)}%`, background: EFFECT_COLORS[a.effect] }} />
            </span>
          </li>
        ))}
      </ul>
      {!list.length && <p className="tp-hint">{t('Select an object on the slide and choose an effect in Animations to add an animation.')}</p>}
      {menu && (
        <div className="menu context-menu" style={{ position: 'fixed', left: menu.x, top: menu.y }} onMouseLeave={() => setMenu(null)}>
          {(
            [
              [tx('Start On Click'), { trigger: 'click' }],
              [tx('Start With Previous'), { trigger: 'with' }],
              [tx('Start After Previous'), { trigger: 'after' }],
            ] as [string, Partial<AnimEntry>][]
          ).map(([label, patch]) => (
            <button key={label} type="button" className="menu-item" onClick={() => (AA.updateEntries(patch, [menu.id]), setMenu(null))}>
              <span className="menu-icon-space" />
              {t(label)}
            </button>
          ))}
          <div className="menu-sep" />
          <button type="button" className="menu-item" onClick={() => (window.dispatchEvent(new CustomEvent('kontor:dialog', { detail: 'effectOptions' })), setMenu(null))}>
            <span className="menu-icon-space" />
            {t('Effect Options…')}
          </button>
          <button type="button" className="menu-item" onClick={() => (AA.removeAnimation([menu.id]), setMenu(null))}>
            <Trash2 size={16} /> {t('Remove')}
          </button>
        </div>
      )}
    </aside>
  )
}

/** Effect Options dialog: direction, timing, repeat and trigger of one effect. */
export function EffectOptionsDialogBody({ entry, onChange }: { entry: AnimEntry; onChange: (patch: Partial<AnimEntry>) => void }) {
  const shapes = currentSlide().elements
  const def = animationDef(entry.name)
  return (
    <div className="form">
      {def?.directional && (
        <label className="field-row form-row">
          <span>{t('Direction:')}</span>
          <select value={entry.direction ?? 'down'} onChange={(e) => onChange({ direction: e.target.value as AnimEntry['direction'] })}>
            {DIRS.map((d) => (
              <option key={d.id} value={d.id}>
                {t(d.label)}
              </option>
            ))}
          </select>
        </label>
      )}
      {(() => {
        const target = shapes.find((x) => x.id === entry.targetId)
        if (target?.type !== 'shape' || !target.text || entry.effect === 'path') return null
        return (
          <>
            <label className="field-row form-row">
              <span>{t('Group text:')}</span>
              <select value={entry.textBuild ?? ''} onChange={(e) => onChange({ textBuild: e.target.value === 'paragraph' ? 'paragraph' : null })}>
                <option value="">{t('As One Object')}</option>
                <option value="paragraph">{t('By Paragraph')}</option>
              </select>
            </label>
            <label className="field-row form-row">
              <span>{t('Animate text:')}</span>
              <select value={entry.textUnit ?? ''} onChange={(e) => onChange({ textUnit: (e.target.value || null) as AnimEntry['textUnit'] })}>
                <option value="">{t('All at once')}</option>
                <option value="word">{t('By word')}</option>
                <option value="letter">{t('By letter')}</option>
              </select>
            </label>
          </>
        )
      })()}
      <label className="field-row form-row">
        <span>{t('Start:')}</span>
        <select value={entry.trigger} onChange={(e) => onChange({ trigger: e.target.value as AnimEntry['trigger'] })}>
          <option value="click">{t('On Click')}</option>
          <option value="with">{t('With Previous')}</option>
          <option value="after">{t('After Previous')}</option>
        </select>
      </label>
      <label className="field-row form-row">
        <span>{t('Delay:')}</span>
        <NumberField label={t('Delay')} value={entry.delay} step={0.25} min={0} max={59} suffix={t(' s')} onChange={(v) => onChange({ delay: v })} />
      </label>
      <label className="field-row form-row">
        <span>{t('Duration:')}</span>
        <NumberField label={t('Duration')} value={entry.duration} step={0.25} min={0.01} max={59} suffix={t(' s')} onChange={(v) => onChange({ duration: v })} />
      </label>
      <label className="field-row form-row">
        <span>{t('Repeat:')}</span>
        <NumberField label={t('Repeat')} value={entry.repeat ?? 1} step={1} min={1} max={99} decimals={0} onChange={(v) => onChange({ repeat: Math.round(v) })} />
      </label>
      <label className="field-row form-row">
        <span>{t('Triggers:')}</span>
        <select value={entry.triggerId ?? ''} onChange={(e) => onChange({ triggerId: e.target.value || null })}>
          <option value="">{t('Animate as part of click sequence')}</option>
          {shapes
            .filter((e) => e.id !== entry.targetId)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {t('Start effect on click of: {name}', { name: e.name })}
              </option>
            ))}
        </select>
      </label>
    </div>
  )
}
