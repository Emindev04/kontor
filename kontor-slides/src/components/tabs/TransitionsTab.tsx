import { Play, Settings2 } from 'lucide-react'
import type { TransitionName } from '../../model/types'
import { TRANSITIONS, transitionDef } from '../../model/effects'
import { currentSlide, useStore } from '../../store/store'
import * as A from '../../store/actions'
import { TRANSITION_SOUNDS, playSound } from '../../model/sounds'
import { MenuButton, NumberField, RibbonButton, RibbonGroup, keepFocus, cls } from '../ui'

function TransitionIcon({ name }: { name: TransitionName }) {
  return <span className={`tr-icon tr-icon-${name}`} aria-hidden="true" />
}

export function preview(kind: 'transition' | 'animations') {
  window.dispatchEvent(new CustomEvent('kontor:preview', { detail: kind }))
}

export function TransitionsTab() {
  const slide = useStore((s) => currentSlide(s))
  const tr = slide.transition ?? A.DEFAULT_TRANSITION
  const def = transitionDef(tr.name)
  return (
    <>
      <RibbonGroup label="Preview">
        <RibbonButton icon={Play} label="Preview" large disabled={tr.name === 'none'} onClick={() => preview('transition')} />
      </RibbonGroup>
      <RibbonGroup label="Transition to This Slide">
        <div className="effect-gallery">
          {TRANSITIONS.map((t) => (
            <button
              key={t.name}
              type="button"
              className={cls('effect-item', tr.name === t.name && 'is-active')}
              onMouseDown={keepFocus}
              onClick={() => {
                A.setTransition({ name: t.name, option: t.options?.[0]?.id })
                if (t.name !== 'none') preview('transition')
              }}
            >
              <TransitionIcon name={t.name} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <MenuButton
          icon={Settings2}
          label="Effect Options"
          large
          disabled={!def.options}
          items={(def.options ?? []).map((o) => ({ label: o.label, active: (tr.option ?? def.options?.[0]?.id) === o.id, onClick: () => (A.setTransition({ option: o.id }), preview('transition')) }))}
        />
      </RibbonGroup>
      <RibbonGroup label="Timing">
        <div className="col timing">
          <label className="field-row">
            <span>Sound:</span>
            <select
              value={tr.sound ?? ''}
              aria-label="Transition sound"
              onChange={(e) => {
                A.setTransition({ sound: e.target.value || null })
                playSound(e.target.value)
              }}
            >
              <option value="">[No Sound]</option>
              {TRANSITION_SOUNDS.map((snd) => (
                <option key={snd.id} value={snd.id}>
                  {snd.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Duration:</span>
            <NumberField label="Duration" value={tr.duration} step={0.25} min={0.01} max={59} suffix=" s" onChange={(v) => A.setTransition({ duration: v })} />
          </label>
          <button type="button" className="rb" onMouseDown={keepFocus} onClick={() => A.setTransition({ ...tr }, true)}>
            Apply To All
          </button>
        </div>
        <div className="col timing">
          <span className="field-caption">Advance Slide</span>
          <label className="check">
            <input type="checkbox" checked={tr.advanceOnClick} onChange={(e) => A.setTransition({ advanceOnClick: e.target.checked })} /> On Mouse Click
          </label>
          <label className="check">
            <input type="checkbox" checked={tr.advanceAfter !== null} onChange={(e) => A.setTransition({ advanceAfter: e.target.checked ? 5 : null })} /> After:
            <NumberField label="Advance after" value={tr.advanceAfter ?? 0} step={1} min={0} max={3600} suffix=" s" disabled={tr.advanceAfter === null} onChange={(v) => A.setTransition({ advanceAfter: v })} />
          </label>
        </div>
      </RibbonGroup>
    </>
  )
}
