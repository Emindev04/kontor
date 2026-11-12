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

function OkCancel({ onOk, onClose, okLabel = 'OK' }: { onOk: () => void; onClose: () => void; okLabel?: string }) {
  return (
    <>
      <span className="spacer" />
      <button type="button" className="btn btn-primary" onClick={onOk}>
        {okLabel}
      </button>
      <button type="button" className="btn" onClick={onClose}>
        Cancel
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
    <Modal title="Columns" onClose={onClose} width={320} footer={<OkCancel onOk={ok} onClose={onClose} />}>
      <div className="form-grid">
        <label>Number:</label>
        <NumberField label="Number of columns" value={n} min={1} max={16} step={1} decimals={0} onChange={setN} />
        <label>Spacing:</label>
        <NumberField label="Spacing between columns" value={spacing} min={0} max={10} step={0.1} suffix='"' onChange={setSpacing} />
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
      title="Bullets and Numbering"
      onClose={onClose}
      width={460}
      footer={
        <>
          <button type="button" className="btn" onClick={() => apply(true)}>
            None
          </button>
          <OkCancel onOk={() => apply()} onClose={onClose} />
        </>
      }
    >
      <div className="dlg-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'bullets'} className={cls('dlg-tab', tab === 'bullets' && 'is-active')} onClick={() => setTab('bullets')}>
          Bulleted
        </button>
        <button type="button" role="tab" aria-selected={tab === 'numbers'} className={cls('dlg-tab', tab === 'numbers' && 'is-active')} onClick={() => setTab('numbers')}>
          Numbered
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
            Customize…
            <input value={custom} maxLength={2} placeholder="Character" onChange={(e) => (setCustom(e.target.value), e.target.value && setBullet(e.target.value))} />
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
        <label>Size:</label>
        <NumberField label="Bullet size in percent of text" value={size} min={25} max={400} step={5} decimals={0} suffix="% of text" width={120} onChange={setSize} />
        <label>Color:</label>
        <span className="row">
          <ColorPickerButton label="Bullet color" value={color ?? 'theme:tx1'} onChange={(c) => setColor(c)} />
          {color && (
            <button type="button" className="btn btn-small" onClick={() => setColor(null)}>
              Automatic
            </button>
          )}
        </span>
        {tab === 'numbers' && (
          <>
            <label>Start at:</label>
            <NumberField label="Start at" value={start} min={1} max={32767} step={1} decimals={0} onChange={setStart} />
          </>
        )}
      </div>
    </Modal>
  )
}

// ---------- Theme colors and fonts ----------

const SLOT_LABELS: [ThemeSlot, string][] = [
  ['tx1', 'Text/Background – Dark 1'],
  ['bg1', 'Text/Background – Light 1'],
  ['tx2', 'Text/Background – Dark 2'],
  ['bg2', 'Text/Background – Light 2'],
  ['accent1', 'Accent 1'],
  ['accent2', 'Accent 2'],
  ['accent3', 'Accent 3'],
  ['accent4', 'Accent 4'],
  ['accent5', 'Accent 5'],
  ['accent6', 'Accent 6'],
  ['hlink', 'Hyperlink'],
]

export function ThemeColorsDialog({ onClose }: { onClose: () => void }) {
  const pres = useStore((s) => s.pres)
  const base = getVariant(getTheme(pres.themeId), pres.variant).colors
  const [cols, setCols] = useState<Record<string, string>>(() => ({ ...base, ...(pres.colors ?? {}) }))
  const [name, setName] = useState(pres.colorsName || 'Custom 1')
  const ok = () => {
    const diff = Object.fromEntries(Object.entries(cols).filter(([k, v]) => (base as Record<string, string>)[k]?.toUpperCase() !== v.toUpperCase()))
    A.setThemeColors(Object.keys(diff).length ? diff : null, name)
    onClose()
  }
  return (
    <Modal title="Create New Theme Colors" onClose={onClose} width={520} footer={<OkCancel onOk={ok} onClose={onClose} okLabel="Save" />}>
      <div className="theme-colors-dlg">
        <div className="form-grid">
          {SLOT_LABELS.map(([slot, label]) => (
            <label key={slot} className="tc-row">
              <span>{label}</span>
              <input type="color" value={(cols[slot] ?? '#000000').slice(0, 7)} onChange={(e) => setCols((c) => ({ ...c, [slot]: e.target.value.toUpperCase() }))} />
            </label>
          ))}
        </div>
        <div className="tc-sample" style={{ background: cols.bg1, color: cols.tx1 }}>
          <strong>Text</strong>
          <div className="tc-bars">
            {THEME_SLOTS.filter((s) => s.startsWith('accent')).map((s) => (
              <span key={s} style={{ background: cols[s] }} />
            ))}
          </div>
          <span style={{ color: cols.hlink ?? cols.accent1, textDecoration: 'underline' }}>Hyperlink</span>
        </div>
      </div>
      <div className="form-grid">
        <label>Name:</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <button type="button" className="btn btn-small" onClick={() => setCols({ ...base })}>
        Reset
      </button>
    </Modal>
  )
}

export function ThemeFontsDialog({ onClose }: { onClose: () => void }) {
  const pres = useStore((s) => s.pres)
  const theme = getTheme(pres.themeId)
  const [major, setMajor] = useState(pres.fonts?.major ?? theme.fonts.major)
  const [minor, setMinor] = useState(pres.fonts?.minor ?? theme.fonts.minor)
  const [name, setName] = useState('Custom 1')
  const ok = () => {
    A.setThemeFonts(major === theme.fonts.major && minor === theme.fonts.minor ? null : { major, minor })
    onClose()
  }
  return (
    <Modal title="Create New Theme Fonts" onClose={onClose} width={480} footer={<OkCancel onOk={ok} onClose={onClose} okLabel="Save" />}>
      <div className="form-grid">
        <label>Heading font:</label>
        <select value={major} onChange={(e) => setMajor(e.target.value)}>
          {FONT_LIST.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <label>Body font:</label>
        <select value={minor} onChange={(e) => setMinor(e.target.value)}>
          {FONT_LIST.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <label>Name:</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="tf-sample">
        <div style={{ fontFamily: fontStack(major), fontSize: 22 }}>Heading</div>
        <div style={{ fontFamily: fontStack(minor) }}>Body text body text body text. Body text body text.</div>
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
    <Modal title="Grid and Guides" onClose={onClose} width={380} footer={<OkCancel onOk={ok} onClose={onClose} />}>
      <fieldset className="dlg-fieldset">
        <legend>Snap to</legend>
        <label className="check">
          <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap objects to grid
        </label>
      </fieldset>
      <fieldset className="dlg-fieldset">
        <legend>Grid settings</legend>
        <div className="form-grid">
          <label>Spacing:</label>
          <NumberField label="Grid spacing" value={spacing} min={0.02} max={2} step={0.042} decimals={3} suffix='"' width={90} onChange={setSpacing} />
        </div>
        <label className="check">
          <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Display grid on screen
        </label>
      </fieldset>
      <fieldset className="dlg-fieldset">
        <legend>Guide settings</legend>
        <label className="check">
          <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} /> Display drawing guides on screen
        </label>
        <label className="check">
          <input type="checkbox" checked={smart} onChange={(e) => setSmart(e.target.checked)} /> Display smart guides when shapes are aligned
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
        Set as Default
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
  const up = (p: Partial<AppOptions>) => setDraft((d) => ({ ...d, ...p }))
  const ok = () => {
    setOptions({ ...draft, initials: draft.initials || initialsOf(draft.userName) })
    store.set({ spellcheck: spellDraft })
    onClose()
  }
  return (
    <Modal title="Options" onClose={onClose} width={640} footer={<OkCancel onOk={ok} onClose={onClose} />}>
      <div className="options-dlg">
        <nav className="options-nav">
          {(
            [
              ['general', 'General'],
              ['proofing', 'Proofing'],
              ['advanced', 'Advanced'],
              ['qat', 'Quick Access Toolbar'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className={cls(page === id && 'is-active')} onClick={() => setPage(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="options-page">
          {page === 'general' && (
            <>
              <h3>Personalize your copy</h3>
              <div className="form-grid">
                <label>User name:</label>
                <input value={draft.userName} placeholder="Shown on comments" onChange={(e) => up({ userName: e.target.value })} />
                <label>Initials:</label>
                <input value={draft.initials} maxLength={4} placeholder={initialsOf(draft.userName)} onChange={(e) => up({ initials: e.target.value })} />
                <label>App theme:</label>
                <select value={draft.officeTheme} onChange={(e) => up({ officeTheme: e.target.value as AppOptions['officeTheme'] })}>
                  <option value="colorful">Colorful</option>
                  <option value="white">White</option>
                  <option value="dark">Dark Gray</option>
                </select>
              </div>
              <h3>User interface options</h3>
              <label className="check">
                <input type="checkbox" checked={draft.miniToolbar} onChange={(e) => up({ miniToolbar: e.target.checked })} /> Show Mini Toolbar on selection
              </label>
            </>
          )}
          {page === 'proofing' && (
            <>
              <h3>AutoCorrect options</h3>
              <label className="check">
                <input type="checkbox" checked={draft.autoCorrect} onChange={(e) => up({ autoCorrect: e.target.checked })} /> Replace text as you type ((c) → ©, (tm) → ™, -- → —, -&gt; → →)
              </label>
              <label className="check">
                <input type="checkbox" checked={draft.smartQuotes} onChange={(e) => up({ smartQuotes: e.target.checked })} /> Replace "straight quotes" with “smart quotes”
              </label>
              <label className="check">
                <input type="checkbox" checked={draft.autoLists} onChange={(e) => up({ autoLists: e.target.checked })} /> Automatic bulleted and numbered lists
              </label>
              <h3>When correcting spelling</h3>
              <label className="check">
                <input type="checkbox" checked={spellDraft} onChange={(e) => setSpellDraft(e.target.checked)} /> Check spelling as you type
              </label>
            </>
          )}
          {page === 'advanced' && (
            <>
              <h3>Editing options</h3>
              <p className="muted">Undo keeps the last 200 actions. Presentations are saved automatically in this browser while AutoSave is on.</p>
              <button type="button" className="btn btn-small" onClick={() => setDraft({ ...DEFAULT_OPTIONS, userName: draft.userName, initials: draft.initials })}>
                Reset all options
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
      <h3>Customize the Quick Access Toolbar</h3>
      <div className="qat-editor">
        <div className="qat-list" role="listbox" aria-label="Available commands">
          {QAT_COMMANDS.filter((c) => !value.includes(c.id)).map((c) => (
            <button key={c.id} type="button" onDoubleClick={() => onChange([...value, c.id], below)} onClick={() => onChange([...value, c.id], below)}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="qat-list" role="listbox" aria-label="Quick Access Toolbar">
          {value.map((id) => (
            <button key={id} type="button" className={cls(sel === id && 'is-active')} onClick={() => setSel(id)} onDoubleClick={() => onChange(value.filter((x) => x !== id), below)}>
              {QAT_COMMANDS.find((c) => c.id === id)?.label ?? id}
            </button>
          ))}
        </div>
        <div className="qat-buttons">
          <button type="button" className="btn btn-small" aria-label="Move up" disabled={!sel} onClick={() => move(-1)}>
            <ArrowUp size={14} />
          </button>
          <button type="button" className="btn btn-small" aria-label="Move down" disabled={!sel} onClick={() => move(1)}>
            <ArrowDown size={14} />
          </button>
          <button type="button" className="btn btn-small" disabled={!sel} onClick={() => sel && (onChange(value.filter((x) => x !== sel), below), setSel(null))}>
            Remove
          </button>
          <button type="button" className="btn btn-small" onClick={() => onChange(DEFAULT_OPTIONS.qat, false)}>
            Reset
          </button>
        </div>
      </div>
      <p className="muted">Click a command on the left to add it; double-click one on the right to remove it.</p>
      <label className="check">
        <input type="checkbox" checked={below} onChange={(e) => onChange(value, e.target.checked)} /> Show Quick Access Toolbar below the ribbon
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
    <Modal title="Thesaurus" onClose={onClose} width={380} footer={<OkCancel onOk={() => picked && ed && replace(picked)} onClose={onClose} okLabel="Insert" />}>
      <div className="form-grid">
        <label>Search for:</label>
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {list.length ? (
        <div className="qat-list" role="listbox" aria-label="Synonyms">
          {list.map((w) => (
            <button key={w} type="button" role="option" aria-selected={picked === w} className={cls(picked === w && 'is-active')} onClick={() => setPicked(w)} onDoubleClick={() => ed && replace(w)}>
              {w}
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">{query ? `No results found for “${query}”.` : 'Type a word to look up.'}</p>
      )}
      {!ed && <p className="muted">Click into text on a slide to insert a synonym.</p>}
    </Modal>
  )
}
