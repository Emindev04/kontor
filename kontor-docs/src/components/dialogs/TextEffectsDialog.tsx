import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Modal, OkCancel } from '../ui'
import { t } from '../../i18n'
import type { TextEffect } from '../../editor/TextEffects'

/** Format Text Effects: text fill (solid or gradient), shadow/outline/emboss/engrave, glow and reflection. */
export function TextEffectsDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const a = editor.getAttributes('textStyle')
  const [gradientOn, setGradientOn] = useState(!!a.gradient)
  const [from, setFrom] = useState(String(a.gradient ?? '#4472C4,#ED7D31').split(',')[0])
  const [to, setTo] = useState(String(a.gradient ?? '#4472C4,#ED7D31').split(',')[1] ?? '#ED7D31')
  const [effect, setEffect] = useState<TextEffect | ''>((a.textEffect as TextEffect) ?? '')
  const [glowOn, setGlowOn] = useState(!!a.glow)
  const [glow, setGlow] = useState(String(a.glow ?? '#FFC000'))
  const [reflection, setReflection] = useState(!!a.reflection)

  const apply = () => {
    editor
      .chain()
      .focus()
      .setTextEffects({ gradient: gradientOn ? `${from},${to}` : null, textEffect: effect || null, glow: glowOn ? glow : null, reflection: reflection || null })
      .run()
    onClose()
  }

  const previewStyle: React.CSSProperties = {
    ...(gradientOn ? { backgroundImage: `linear-gradient(90deg, ${from}, ${to})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' } : {}),
    ...(glowOn ? { filter: `drop-shadow(0 0 2px ${glow}) drop-shadow(0 0 3px ${glow})` } : {}),
    ...(reflection ? { WebkitBoxReflect: 'below -0.15em linear-gradient(transparent 45%, rgba(255, 255, 255, 0.45))' } : {}),
    ...(effect === 'shadow' ? { textShadow: '1px 1px 1px rgba(0,0,0,.45)' } : effect === 'outline' ? { textShadow: '-0.6px -0.6px 0 #000, 0.6px -0.6px 0 #000, -0.6px 0.6px 0 #000, 0.6px 0.6px 0 #000', color: '#fff' } : effect === 'emboss' ? { textShadow: '-1px -1px 0 rgba(255,255,255,.9), 1px 1px 0 rgba(0,0,0,.35)' } : effect === 'engrave' ? { textShadow: '1px 1px 0 rgba(255,255,255,.9), -1px -1px 0 rgba(0,0,0,.35)' } : {}),
  } as React.CSSProperties

  return (
    <Modal title={t('Format Text Effects')} onClose={onClose} width={440} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <fieldset className="dlg-fieldset">
        <legend>{t('Text Fill')}</legend>
        <div className="dlg-inline">
          <label>
            <input type="radio" name="fill" checked={!gradientOn} onChange={() => setGradientOn(false)} /> {t('Solid fill (font color)')}
          </label>
          <label>
            <input type="radio" name="fill" checked={gradientOn} onChange={() => setGradientOn(true)} /> {t('Gradient fill')}
          </label>
        </div>
        {gradientOn && (
          <div className="dlg-inline">
            {t('From:')} <input type="color" value={from} onChange={(e) => setFrom(e.target.value.toUpperCase())} />
            {t('To:')} <input type="color" value={to} onChange={(e) => setTo(e.target.value.toUpperCase())} />
          </div>
        )}
      </fieldset>
      <fieldset className="dlg-fieldset">
        <legend>{t('Effects')}</legend>
        <label className="dlg-inline">
          {t('Shadow and outline:')}
          <select value={effect} onChange={(e) => setEffect(e.target.value as TextEffect | '')}>
            <option value="">{t('(none)')}</option>
            <option value="shadow">{t('Shadow')}</option>
            <option value="outline">{t('Outline')}</option>
            <option value="emboss">{t('Emboss')}</option>
            <option value="engrave">{t('Engrave')}</option>
          </select>
        </label>
        <div className="dlg-inline">
          <label>
            <input type="checkbox" checked={glowOn} onChange={(e) => setGlowOn(e.target.checked)} /> {t('Glow')}
          </label>
          {glowOn && <input type="color" aria-label={t('Glow color')} value={glow} onChange={(e) => setGlow(e.target.value.toUpperCase())} />}
        </div>
        <label>
          <input type="checkbox" checked={reflection} onChange={(e) => setReflection(e.target.checked)} /> {t('Reflection')}
        </label>
      </fieldset>
      <div className="font-preview">
        <span style={{ fontSize: 28, display: 'inline-block', ...previewStyle }}>{t('Sample Text')}</span>
      </div>
    </Modal>
  )
}
