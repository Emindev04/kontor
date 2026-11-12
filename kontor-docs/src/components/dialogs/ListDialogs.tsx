import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Modal, OkCancel, cls } from '../ui'
import { t } from '../../i18n'
import { pickFile, readFileAsDataUrl } from '../../editor/commands'
import { LEVEL_FORMATS, decodeMultilevel, defaultLevels, encodeMultilevel, levelLabel, pictureBullet, type LevelFormat, type ListLevel } from '../../editor/customLists'

const SYMBOLS = ['•', '◦', '▪', '▫', '■', '□', '●', '○', '◆', '◇', '►', '▸', '➢', '➤', '→', '⇒', '✓', '✔', '✗', '✦', '✧', '★', '☆', '♦', '♥', '♣', '♠', '❖', '❥', '☞', '–', '—', '~', '+', '*', '§', '¶', '※', '⁃', '⦿']
const CUSTOM_KEY = 'kontor-docs:custom-bullets'

/** Bullets defined with Define New Bullet, newest first (shown in the Bullet Library). */
export function customBullets(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '[]') as string[]
    return Array.isArray(list) ? list.filter((s) => typeof s === 'string').slice(0, 8) : []
  } catch {
    return []
  }
}

function rememberBullet(style: string) {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify([style, ...customBullets().filter((s) => s !== style)].slice(0, 8)))
  } catch {
    // Storage full: the bullet is still applied.
  }
}

/** Home › Bullets › Define New Bullet: any character or a small picture. */
export function DefineBulletDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const current = editor.getAttributes('bulletList').listStyle as string | null
  const [symbol, setSymbol] = useState(current?.startsWith('sym:') ? current.slice(4) : '★')
  const [picture, setPicture] = useState<string | null>(current?.startsWith('pic:') ? current.slice(4) : null)
  const [error, setError] = useState('')

  const apply = () => {
    const style = picture ? `pic:${picture}` : `sym:${Array.from(symbol.trim())[0] ?? '•'}`
    editor.chain().focus().setBulletStyle(style).run()
    rememberBullet(style)
    onClose()
  }

  const choosePicture = async () => {
    const file = await pickFile('image/*')
    if (!file) return
    try {
      setPicture(await pictureBullet(await readFileAsDataUrl(file)))
      setError('')
    } catch {
      setError(t('This picture could not be read.'))
    }
  }

  return (
    <Modal title={t('Define New Bullet')} onClose={onClose} width={460} footer={<OkCancel onOk={apply} onCancel={onClose} extra={error && <span className="dlg-error">{error}</span>} />}>
      <div className="dlg-stack">
        <fieldset className="dlg-fieldset">
          <legend>{t('Bullet character')}</legend>
          <div className="bullet-grid" role="listbox" aria-label={t('Symbol')}>
            {SYMBOLS.map((s) => (
              <button key={s} type="button" role="option" aria-selected={!picture && symbol === s} className={cls('bullet-cell', !picture && symbol === s && 'is-active')} onClick={() => (setSymbol(s), setPicture(null))}>
                {s}
              </button>
            ))}
          </div>
          <label className="dlg-inline">
            {t('Other character:')}
            <input value={symbol} maxLength={2} onChange={(e) => (setSymbol(e.target.value), setPicture(null))} style={{ width: 60 }} />
          </label>
          <div>
            <button type="button" className="btn" onClick={choosePicture}>
              {t('Picture…')}
            </button>
          </div>
        </fieldset>
        <fieldset className="dlg-fieldset">
          <legend>{t('Preview')}</legend>
          <ul className="bullet-preview" style={picture ? { listStyleImage: `url("${picture}")` } : { listStyleType: `"${(Array.from(symbol.trim())[0] ?? '•').replace(/"/g, '\\"')}  "` }}>
            <li>{t('First item')}</li>
            <li>{t('Second item')}</li>
            <li>{t('Third item')}</li>
          </ul>
        </fieldset>
      </div>
    </Modal>
  )
}

/** Home › Multilevel List › Define New Multilevel List: number style and number format for nine levels. */
export function DefineMultilevelDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const current = editor.getAttributes('orderedList').listStyle as string | null
  const [levels, setLevels] = useState<ListLevel[]>(() => (current && decodeMultilevel(current)) || defaultLevels())
  const [level, setLevel] = useState(0)
  const def = levels[level]
  const update = (patch: Partial<ListLevel>) => setLevels(levels.map((l, i) => (i === level ? { ...l, ...patch } : l)))

  const apply = () => {
    editor.chain().focus().setMultilevelList(encodeMultilevel(levels)).run()
    onClose()
  }

  // Preview: one item per level, each nested one deeper.
  const counts = Array(9).fill(1)
  return (
    <Modal title={t('Define New Multilevel List')} onClose={onClose} width={560} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <div className="ml-dialog">
        <div className="ml-levels" role="listbox" aria-label={t('Click level to modify:')}>
          <div className="dlg-label">{t('Click level to modify:')}</div>
          {levels.map((_, i) => (
            <button key={i} type="button" role="option" aria-selected={i === level} className={cls('ml-level', i === level && 'is-active')} onClick={() => setLevel(i)}>
              {i + 1}
            </button>
          ))}
        </div>
        <div className="ml-preview" aria-label={t('Preview')}>
          {levels.map((_, i) => (
            <div key={i} className={cls('ml-preview-row', i === level && 'is-active')} style={{ paddingLeft: i * 14 }}>
              <span className="ml-preview-num">{levelLabel(levels, i, counts)}</span>
              <span className="list-lines" />
            </div>
          ))}
        </div>
      </div>
      <fieldset className="dlg-fieldset">
        <legend>{t('Number format')}</legend>
        <label className="dlg-inline">
          {t('Number style for this level:')}
          <select
            value={def.f}
            onChange={(e) => {
              const f = e.target.value as LevelFormat
              update({ f, t: f === 'bullet' ? '•' : def.f === 'bullet' ? `%${level + 1}.` : def.t })
            }}
          >
            {LEVEL_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {t(f.label)}
              </option>
            ))}
          </select>
        </label>
        <label className="dlg-inline">
          {def.f === 'bullet' ? t('Bullet character:') : t('Enter formatting for number:')}
          <input value={def.t} onChange={(e) => update({ t: e.target.value })} />
        </label>
        {def.f !== 'bullet' && (
          <div className="dlg-inline">
            {t('Include level number from:')}
            {Array.from({ length: level + 1 }, (_, i) => (
              <button key={i} type="button" className="btn btn-small" onClick={() => update({ t: `${def.t}%${i + 1}` })} title={t('Level {n}', { n: i + 1 })}>
                %{i + 1}
              </button>
            ))}
          </div>
        )}
        <p className="dlg-hint">{t('%1 … %9 stand for the current numbers of levels 1 to 9, for example %1.%2. gives 1.1.')}</p>
      </fieldset>
    </Modal>
  )
}
