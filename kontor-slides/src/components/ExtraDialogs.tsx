// Dialogs added in phase 4: Columns, Bullets and Numbering, theme colors and fonts, Grid and Guides,
// Options and Customize Quick Access Toolbar.
import { useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { ParaAttrs, ShapeElement, ThemeSlot } from '../model/types'
import { resolveColor, THEME_SLOTS } from '../model/color'
import { BULLET_CHARS, NUMBER_SCHEMES } from '../model/richtext'
import { FONT_LIST, fontStack, getTheme, getVariant } from '../model/themes'
import { store, useStore } from '../store/store'
import * as A from '../store/actions'
import * as T from '../editor/textCommands'
import { DEFAULT_OPTIONS, QAT_COMMANDS, initialsOf, setOptions, useOptions, type AppOptions, type QatId } from '../io/options'
import { Modal, NumberField, cls } from './ui'
import { getActiveEditor } from '../editor/activeEditor'
import { matchCase, synonyms } from '../editor/thesaurus'
import { ColorPickerButton } from './Panes'
import { getLanguage, LANGUAGES, setLanguage, t, tx, type Language } from '../i18n'
import { saveLocal } from '../io/storage'

function OkCancel({ onOk, onClose, okLabel }: { onOk: () => void; onClose: () => void; okLabel?: string }) {
  return (
    <>
      <span className="spacer" />
      <button type="button" className="btn btn-primary" onClick={onOk}>
        {okLabel ?? t('OK')}
      </button>
      <button type="button" className="btn" onClick={onClose}>
        {t('Cancel')}
      </button>
    </>
  )
}

const IN = 96

// ---------- Columns ----------

export function ColumnsDialog({ onClose }: { onClose: () => void }) {
  const el = A.selectedTextShapes()[0] as ShapeElement | undefined
  const [n, setN] = useState(el?.text?.columns ?? 1)
  const [spacing, setSpacing] = useState((el?.text?.colSpacing ?? 24) / IN)
  const ok = () => {
    A.updateSelected((e) => (e.type === 'shape' && e.text ? { ...e, text: { ...e.text, columns: Math.max(1, Math.round(n)), colSpacing: Math.max(0, spacing) * IN } } : e))
    onClose()
  }
  return (
    <Modal title={t('Columns')} onClose={onClose} width={320} footer={<OkCancel onOk={ok} onClose={onClose} />}>
      <div className="form-grid">
        <label>{t('Number:')}</label>
        <NumberField label={t('Number of columns')} value={n} min={1} max={16} step={1} decimals={0} onChange={setN} />
        <label>{t('Spacing:')}</label>
        <NumberField label={t('Spacing between columns')} value={spacing} min={0} max={10} step={0.1} suffix='"' onChange={setSpacing} />
      </div>
    </Modal>
  )
}

// ---------- Bullets and Numbering ----------

export function BulletsDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'bullets' | 'numbers'>(() => (String(T.paraValue('bullet') ?? '').startsWith('num:') ? 'numbers' : 'bullets'))
  const cur = T.paraValue('bullet') ?? null
  const [bullet, setBullet] = useState<string>(cur && !cur.startsWith('num:') && cur !== 'none' ? cur : BULLET_CHARS[0].char)
  const [scheme, setScheme] = useState<string>(cur?.startsWith('num:') ? cur.slice(4) : NUMBER_SCHEMES[0].id)
  const [size, setSize] = useState<number>(T.paraValue('bulletSize') ?? 100)
  const [color, setColor] = useState<string | null>(T.paraValue('bulletColor') ?? null)
  const [start, setStart] = useState<number>(T.paraValue('startAt') ?? 1)
  const [custom, setCustom] = useState('')
  const colors = useStore((s) => s.pres) && getVariant(getTheme(store.get().pres.themeId), store.get().pres.variant).colors
  const apply = (none = false) => {
    const patch: Partial<ParaAttrs> = none
      ? { bullet: 'none' }
      : { bullet: tab === 'bullets' ? bullet : `num:${scheme}`, bulletSize: size === 100 ? null : size, bulletColor: color, startAt: tab === 'numbers' && start > 1 ? start : null }
    T.setPara(patch)
    onClose()
  }
  const chars = [...new Set([...BULLET_CHARS.map((b) => b.char), '–', '✓', '➢', '★', '♦', '→'])]
  return (
    <Modal
      title={t('Bullets and Numbering')}
      onClose={onClose}
      width={460}
      footer={
        <>
          <button type="button" className="btn" onClick={() => apply(true)}>
            {t('None')}
          </button>
          <OkCancel onOk={() => apply()} onClose={onClose} />
        </>
      }
    >
      <div className="dlg-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'bullets'} className={cls('dlg-tab', tab === 'bullets' && 'is-active')} onClick={() => setTab('bullets')}>
          {t('Bulleted')}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'numbers'} className={cls('dlg-tab', tab === 'numbers' && 'is-active')} onClick={() => setTab('numbers')}>
          {t('Numbered')}
        </button>
      </div>
      {tab === 'bullets' ? (
        <div className="bullet-grid">
          {chars.map((c) => (
            <button key={c} type="button" className={cls('bullet-cell', bullet === c && 'is-active')} onClick={() => setBullet(c)} style={{ color: color ? resolveColor(color, colors) : undefined, fontSize: `${(18 * size) / 100}px` }}>
              {c}
            </button>
          ))}
          <label className="bullet-custom">
            {t('Customize…')}
            <input value={custom} maxLength={2} placeholder={t('Character')} onChange={(e) => (setCustom(e.target.value), e.target.value && setBullet(e.target.value))} />
          </label>
        </div>
      ) : (
        <div className="bullet-grid numbers">
          {NUMBER_SCHEMES.map((sch) => (
            <button key={sch.id} type="button" className={cls('bullet-cell', scheme === sch.id && 'is-active')} onClick={() => setScheme(sch.id)}>
              {[0, 1, 2].map((i) => (
                <span key={i}>{sch.sample(start + i)}</span>
              ))}
            </button>
          ))}
        </div>
      )}
      <div className="form-grid">
        <label>{t('Size:')}</label>
        <NumberField label={t('Bullet size in percent of text')} value={size} min={25} max={400} step={5} decimals={0} suffix={t('% of text')} width={120} onChange={setSize} />
        <label>{t('Color:')}</label>
        <span className="row">
          <ColorPickerButton label={t('Bullet color')} value={color ?? 'theme:tx1'} onChange={(c) => setColor(c)} />
          {color && (
            <button type="button" className="btn btn-small" onClick={() => setColor(null)}>
              {t('Automatic')}
            </button>
          )}
        </span>
        {tab === 'numbers' && (
          <>
            <label>{t('Start at:')}</label>
            <NumberField label={t('Start at')} value={start} min={1} max={32767} step={1} decimals={0} onChange={setStart} />
          </>
        )}
      </div>
    </Modal>
  )
}

// ---------- Theme colors and fonts ----------

const SLOT_LABELS: [ThemeSlot, string][] = [
  ['tx1', tx('Text/Background – Dark 1')],
  ['bg1', tx('Text/Background – Light 1')],
  ['tx2', tx('Text/Background – Dark 2')],
  ['bg2', tx('Text/Background – Light 2')],
  ['accent1', tx('Accent 1')],
  ['accent2', tx('Accent 2')],
  ['accent3', tx('Accent 3')],
  ['accent4', tx('Accent 4')],
  ['accent5', tx('Accent 5')],
  ['accent6', tx('Accent 6')],
  ['hlink', tx('Hyperlink')],
]

export function ThemeColorsDialog({ onClose }: { onClose: () => void }) {
  const pres = useStore((s) => s.pres)
  const base = getVariant(getTheme(pres.themeId), pres.variant).colors
  const [cols, setCols] = useState<Record<string, string>>(() => ({ ...base, ...(pres.colors ?? {}) }))
  const [name, setName] = useState(pres.colorsName || t('Custom 1'))
  const ok = () => {
    const diff = Object.fromEntries(Object.entries(cols).filter(([k, v]) => (base as Record<string, string>)[k]?.toUpperCase() !== v.toUpperCase()))
    A.setThemeColors(Object.keys(diff).length ? diff : null, name)
    onClose()
  }
  return (
    <Modal title={t('Create New Theme Colors')} onClose={onClose} width={520} footer={<OkCancel onOk={ok} onClose={onClose} okLabel={t('Save')} />}>
      <div className="theme-colors-dlg">
        <div className="form-grid">
          {SLOT_LABELS.map(([slot, label]) => (
            <label key={slot} className="tc-row">
              <span>{t(label)}</span>
              <input type="color" value={(cols[slot] ?? '#000000').slice(0, 7)} onChange={(e) => setCols((c) => ({ ...c, [slot]: e.target.value.toUpperCase() }))} />
            </label>
          ))}
        </div>
        <div className="tc-sample" style={{ background: cols.bg1, color: cols.tx1 }}>
          <strong>{t('Text')}</strong>
          <div className="tc-bars">
            {THEME_SLOTS.filter((s) => s.startsWith('accent')).map((s) => (
              <span key={s} style={{ background: cols[s] }} />
            ))}
          </div>
          <span style={{ color: cols.hlink ?? cols.accent1, textDecoration: 'underline' }}>{t('Hyperlink')}</span>
        </div>
      </div>
      <div className="form-grid">
        <label>{t('Name:')}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <button type="button" className="btn btn-small" onClick={() => setCols({ ...base })}>
        {t('Reset')}
      </button>
    </Modal>
  )
}

export function ThemeFontsDialog({ onClose }: { onClose: () => void }) {
  const pres = useStore((s) => s.pres)
  const theme = getTheme(pres.themeId)
  const [major, setMajor] = useState(pres.fonts?.major ?? theme.fonts.major)
  const [minor, setMinor] = useState(pres.fonts?.minor ?? theme.fonts.minor)
  const [name, setName] = useState(t('Custom 1'))
  const ok = () => {
    A.setThemeFonts(major === theme.fonts.major && minor === theme.fonts.minor ? null : { major, minor })
    onClose()
  }
  return (
    <Modal title={t('Create New Theme Fonts')} onClose={onClose} width={480} footer={<OkCancel onOk={ok} onClose={onClose} okLabel={t('Save')} />}>
      <div className="form-grid">
        <label>{t('Heading font:')}</label>
        <select value={major} onChange={(e) => setMajor(e.target.value)}>
          {FONT_LIST.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <label>{t('Body font:')}</label>
        <select value={minor} onChange={(e) => setMinor(e.target.value)}>
          {FONT_LIST.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <label>{t('Name:')}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="tf-sample">
        <div style={{ fontFamily: fontStack(major), fontSize: 22 }}>{t('Heading')}</div>
        <div style={{ fontFamily: fontStack(minor) }}>{t('Body text body text body text. Body text body text.')}</div>
      </div>
    </Modal>
  )
}

// ---------- Grid and Guides ----------

export function GridGuidesDialog({ onClose }: { onClose: () => void }) {
  const s = useStore((x) => x)
  const [snap, setSnap] = useState(s.snapToGrid)
  const [spacing, setSpacing] = useState(s.gridSpacing / IN)
  const [grid, setGrid] = useState(s.showGrid)
  const [guides, setGuides] = useState(s.showGuides)
  const [smart, setSmart] = useState(s.smartGuides)
  const ok = () => {
    store.set({ snapToGrid: snap, gridSpacing: Math.max(0.02, spacing) * IN, showGrid: grid, showGuides: guides, smartGuides: smart })
    onClose()
  }
  return (
    <Modal title={t('Grid and Guides')} onClose={onClose} width={380} footer={<OkCancel onOk={ok} onClose={onClose} />}>
      <fieldset className="dlg-fieldset">
        <legend>{t('Snap to')}</legend>
        <label className="check">
          <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> {t('Snap objects to grid')}
        </label>
      </fieldset>
      <fieldset className="dlg-fieldset">
        <legend>{t('Grid settings')}</legend>
        <div className="form-grid">
          <label>{t('Spacing:')}</label>
          <NumberField label={t('Grid spacing')} value={spacing} min={0.02} max={2} step={0.042} decimals={3} suffix='"' width={90} onChange={setSpacing} />
        </div>
        <label className="check">
          <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> {t('Display grid on screen')}
        </label>
      </fieldset>
      <fieldset className="dlg-fieldset">
        <legend>{t('Guide settings')}</legend>
        <label className="check">
          <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} /> {t('Display drawing guides on screen')}
        </label>
        <label className="check">
          <input type="checkbox" checked={smart} onChange={(e) => setSmart(e.target.checked)} /> {t('Display smart guides when shapes are aligned')}
        </label>
      </fieldset>
      <button
        type="button"
        className="btn btn-small"
        onClick={() => {
          setSnap(false)
          setSpacing(1 / 12)
          setGrid(false)
          setGuides(false)
          setSmart(true)
          store.set({ guides: null })
        }}
      >
        {t('Set as Default')}
      </button>
    </Modal>
  )
}

// ---------- Options ----------

export function OptionsDialog({ onClose }: { onClose: () => void }) {
  const opts = useOptions()
  const [draft, setDraft] = useState<AppOptions>(opts)
  const [page, setPage] = useState<'general' | 'proofing' | 'advanced' | 'qat'>('general')
  const spell = useStore((s) => s.spellcheck)
  const [spellDraft, setSpellDraft] = useState(spell)
  const [language, setLanguageDraft] = useState<Language>(getLanguage())
  const up = (p: Partial<AppOptions>) => setDraft((d) => ({ ...d, ...p }))
  const ok = () => {
    setOptions({ ...draft, initials: draft.initials || initialsOf(draft.userName) })
    store.set({ spellcheck: spellDraft })
    onClose()
    if (language !== getLanguage()) {
      // The program reloads in the new language: store the presentation first so nothing is lost.
      const s = store.get()
      void saveLocal(s.title, s.pres)
        .catch(() => undefined)
        .finally(() => setLanguage(language))
    }
  }
  return (
    <Modal title={t('Options')} onClose={onClose} width={640} footer={<OkCancel onOk={ok} onClose={onClose} />}>
      <div className="options-dlg">
        <nav className="options-nav">
          {(
            [
              ['general', tx('General')],
              ['proofing', tx('Proofing')],
              ['advanced', tx('Advanced')],
              ['qat', tx('Quick Access Toolbar')],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className={cls(page === id && 'is-active')} onClick={() => setPage(id)}>
              {t(label)}
            </button>
          ))}
        </nav>
        <div className="options-page">
          {page === 'general' && (
            <>
              <h3>{t('Personalize your copy')}</h3>
              <div className="form-grid">
                <label>{t('User name:')}</label>
                <input value={draft.userName} placeholder={t('Shown on comments')} onChange={(e) => up({ userName: e.target.value })} />
                <label>{t('Initials:')}</label>
                <input value={draft.initials} maxLength={4} placeholder={initialsOf(draft.userName)} onChange={(e) => up({ initials: e.target.value })} />
                <label>{t('App theme:')}</label>
                <select value={draft.officeTheme} onChange={(e) => up({ officeTheme: e.target.value as AppOptions['officeTheme'] })}>
                  <option value="colorful">{t('Colorful')}</option>
                  <option value="white">{t('White')}</option>
                  <option value="dark">{t('Dark Gray')}</option>
                </select>
              </div>
              <h3>{t('Language')}</h3>
              <div className="form-grid">
                <label htmlFor="ui-language">{t('Display language:')}</label>
                <select id="ui-language" value={language} onChange={(e) => setLanguageDraft(e.target.value as Language)}>
                  {LANGUAGES.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              {language !== getLanguage() && <p className="muted">{t('The program restarts in the new language when you click OK.')}</p>}
              <h3>{t('User interface options')}</h3>
              <label className="check">
                <input type="checkbox" checked={draft.miniToolbar} onChange={(e) => up({ miniToolbar: e.target.checked })} /> {t('Show Mini Toolbar on selection')}
              </label>
            </>
          )}
          {page === 'proofing' && (
            <>
              <h3>{t('AutoCorrect options')}</h3>
              <label className="check">
                <input type="checkbox" checked={draft.autoCorrect} onChange={(e) => up({ autoCorrect: e.target.checked })} /> {t('Replace text as you type ((c) → ©, (tm) → ™, -- → —, -> → →)')}
              </label>
              <label className="check">
                <input type="checkbox" checked={draft.smartQuotes} onChange={(e) => up({ smartQuotes: e.target.checked })} /> {t('Replace "straight quotes" with “smart quotes”')}
              </label>
              <label className="check">
                <input type="checkbox" checked={draft.autoLists} onChange={(e) => up({ autoLists: e.target.checked })} /> {t('Automatic bulleted and numbered lists')}
              </label>
              <h3>{t('When correcting spelling')}</h3>
              <label className="check">
                <input type="checkbox" checked={spellDraft} onChange={(e) => setSpellDraft(e.target.checked)} /> {t('Check spelling as you type')}
              </label>
            </>
          )}
          {page === 'advanced' && (
            <>
              <h3>{t('Editing options')}</h3>
              <p className="muted">{t('Undo keeps the last 200 actions. Presentations are saved automatically in this browser while AutoSave is on.')}</p>
              <button type="button" className="btn btn-small" onClick={() => setDraft({ ...DEFAULT_OPTIONS, userName: draft.userName, initials: draft.initials })}>
                {t('Reset all options')}
              </button>
            </>
          )}
          {page === 'qat' && <QatEditor value={draft.qat} below={draft.qatBelow} onChange={(qat, qatBelow) => up({ qat, qatBelow })} />}
        </div>
      </div>
    </Modal>
  )
}

function QatEditor({ value, below, onChange }: { value: QatId[]; below: boolean; onChange: (v: QatId[], below: boolean) => void }) {
  const [sel, setSel] = useState<QatId | null>(null)
  const move = (d: -1 | 1) => {
    if (!sel) return
    const i = value.indexOf(sel)
    const j = i + d
    if (i < 0 || j < 0 || j >= value.length) return
    const next = [...value]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next, below)
  }
  return (
    <>
      <h3>{t('Customize the Quick Access Toolbar')}</h3>
      <div className="qat-editor">
        <div className="qat-list" role="listbox" aria-label={t('Available commands')}>
          {QAT_COMMANDS.filter((c) => !value.includes(c.id)).map((c) => (
            <button key={c.id} type="button" onDoubleClick={() => onChange([...value, c.id], below)} onClick={() => onChange([...value, c.id], below)}>
              {t(c.label)}
            </button>
          ))}
        </div>
        <div className="qat-list" role="listbox" aria-label={t('Quick Access Toolbar')}>
          {value.map((id) => (
            <button key={id} type="button" className={cls(sel === id && 'is-active')} onClick={() => setSel(id)} onDoubleClick={() => onChange(value.filter((x) => x !== id), below)}>
              {t(QAT_COMMANDS.find((c) => c.id === id)?.label ?? id)}
            </button>
          ))}
        </div>
        <div className="qat-buttons">
          <button type="button" className="btn btn-small" aria-label={t('Move up')} disabled={!sel} onClick={() => move(-1)}>
            <ArrowUp size={14} />
          </button>
          <button type="button" className="btn btn-small" aria-label={t('Move down')} disabled={!sel} onClick={() => move(1)}>
            <ArrowDown size={14} />
          </button>
          <button type="button" className="btn btn-small" disabled={!sel} onClick={() => sel && (onChange(value.filter((x) => x !== sel), below), setSel(null))}>
            {t('Remove')}
          </button>
          <button type="button" className="btn btn-small" onClick={() => onChange(DEFAULT_OPTIONS.qat, false)}>
            {t('Reset')}
          </button>
        </div>
      </div>
      <p className="muted">{t('Click a command on the left to add it; double-click one on the right to remove it.')}</p>
      <label className="check">
        <input type="checkbox" checked={below} onChange={(e) => onChange(value, e.target.checked)} /> {t('Show Quick Access Toolbar below the ribbon')}
      </label>
    </>
  )
}

// ---------- Thesaurus ----------

/** Review > Thesaurus: synonyms for the word at the cursor in the text being edited. */
export function ThesaurusDialog({ onClose }: { onClose: () => void }) {
  const ed = getActiveEditor()
  const initial = (() => {
    if (!ed) return { word: '', from: 0, to: 0 }
    const { from, to, empty } = ed.state.selection
    if (!empty) return { word: ed.state.doc.textBetween(from, to, ' ').trim(), from, to }
    const $pos = ed.state.doc.resolve(from)
    const text = $pos.parent.textContent
    let a = $pos.parentOffset
    let b = a
    while (a > 0 && /[\p{L}'-]/u.test(text[a - 1])) a--
    while (b < text.length && /[\p{L}'-]/u.test(text[b])) b++
    return { word: text.slice(a, b), from: $pos.start() + a, to: $pos.start() + b }
  })()
  const [query, setQuery] = useState(initial.word)
  const [picked, setPicked] = useState<string | null>(null)
  const list = synonyms(query)
  const replace = (word: string) => {
    if (ed && initial.to > initial.from) ed.chain().focus().insertContentAt({ from: initial.from, to: initial.to }, matchCase(initial.word, word)).run()
    else ed?.chain().focus().insertContent(word).run()
    onClose()
  }
  return (
    <Modal title={t('Thesaurus')} onClose={onClose} width={380} footer={<OkCancel onOk={() => picked && ed && replace(picked)} onClose={onClose} okLabel={t('Insert')} />}>
      <div className="form-grid">
        <label>{t('Search for:')}</label>
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {list.length ? (
        <div className="qat-list" role="listbox" aria-label={t('Synonyms')}>
          {list.map((w) => (
            <button key={w} type="button" role="option" aria-selected={picked === w} className={cls(picked === w && 'is-active')} onClick={() => setPicked(w)} onDoubleClick={() => ed && replace(w)}>
              {w}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">{query ? t('No results found for “{query}”.', { query }) : t('Type a word to look up.')}</p>
      )}
      {!ed && <p className="muted">{t('Click into text on a slide to insert a synonym.')}</p>}
    </Modal>
  )
}
