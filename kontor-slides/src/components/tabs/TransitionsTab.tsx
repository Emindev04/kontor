import { Play, Settings2 } from 'lucide-react'
import type { TransitionName } from '../../model/types'
import { TRANSITIONS, transitionDef } from '../../model/effects'
import { currentSlide, useStore } from '../../store/store'
import * as A from '../../store/actions'
import { TRANSITION_SOUNDS, playSound } from '../../model/sounds'
import { MenuButton, NumberField, RibbonButton, RibbonGroup, keepFocus, cls } from '../ui'
import { t } from '../../i18n'

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
      <RibbonGroup label={t('Preview')}>
        <RibbonButton icon={Play} label={t('Preview')} large disabled={tr.name === 'none'} onClick={() => preview('transition')} />
      </RibbonGroup>
      <RibbonGroup label={t('Transition to This Slide')}>
        <div className="effect-gallery">
          {TRANSITIONS.map((item) => (
            <button
              key={item.name}
              type="button"
              className={cls('effect-item', tr.name === item.name && 'is-active')}
              onMouseDown={keepFocus}
              onClick={() => {
                A.setTransition({ name: item.name, option: item.options?.[0]?.id })
                if (item.name !== 'none') preview('transition')
              }}
            >
              <TransitionIcon name={item.name} />
              <span>{t(item.label)}</span>
            </button>
          ))}
        </div>
        <MenuButton
          icon={Settings2}
          label={t('Effect Options')}
          large
          disabled={!def.options}
          items={(def.options ?? []).map((o) => ({ label: t(o.label), active: (tr.option ?? def.options?.[0]?.id) === o.id, onClick: () => (A.setTransition({ option: o.id }), preview('transition')) }))}
        />
      </RibbonGroup>
      <RibbonGroup label={t('Timing')}>
        <div className="col timing">
          <label className="field-row">
            <span>{t('Sound:')}</span>
            <select
              value={tr.sound ?? ''}
              aria-label={t('Transition sound')}
              onChange={(e) => {
                A.setTransition({ sound: e.target.value || null })
                playSound(e.target.value)
              }}
            >
              <option value="">{t('[No Sound]')}</option>
              {TRANSITION_SOUNDS.map((snd) => (
                <option key={snd.id} value={snd.id}>
                  {t(snd.label)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>{t('Duration:')}</span>
            <NumberField label={t('Duration')} value={tr.duration} step={0.25} min={0.01} max={59} suffix={t(' s')} onChange={(v) => A.setTransition({ duration: v })} />
          </label>
          <button type="button" className="rb" onMouseDown={keepFocus} onClick={() => A.setTransition({ ...tr }, true)}>
            {t('Apply To All')}
          </button>
        </div>
        <div className="col timing">
          <span className="field-caption">{t('Advance Slide')}</span>
          <label className="check">
            <input type="checkbox" checked={tr.advanceOnClick} onChange={(e) => A.setTransition({ advanceOnClick: e.target.checked })} /> {t('On Mouse Click')}
          </label>
          <label className="check">
            <input type="checkbox" checked={tr.advanceAfter !== null} onChange={(e) => A.setTransition({ advanceAfter: e.target.checked ? 5 : null })} /> {t('After:')}
            <NumberField label={t('Advance after')} value={tr.advanceAfter ?? 0} step={1} min={0} max={3600} suffix={t(' s')} disabled={tr.advanceAfter === null} onChange={(v) => A.setTransition({ advanceAfter: v })} />
          </label>
        </div>
      </RibbonGroup>
    </>
  )
}
