import { BulletsDialog, ColumnsDialog, GridGuidesDialog, OptionsDialog, ThemeColorsDialog, ThemeFontsDialog, ThesaurusDialog } from './ExtraDialogs'
import { lazy, Suspense, useMemo, useState } from 'react'
import type { ImageElement, RichDoc, ShapeElement, SlideElement, SlideSize } from '../model/types'
import { findInText, fontsInDoc, replaceFontInDoc, replaceInDoc, isDocEmpty } from '../model/richtext'
import { FONT_LIST, getTheme } from '../model/themes'
import { findElement, mapElements, SIZE_16_9, SIZE_4_3 } from '../model/factory'
import { DEFAULT_PPI, downscale, maxEdgeFor } from '../io/images'
import { commit, currentSlide, selectedElements, store, useStore } from '../store/store'
import * as A from '../store/actions'
import * as T from '../editor/textCommands'
import { getActiveEditor } from '../editor/activeEditor'
import { Modal, NumberField } from './ui'
import type { DialogKind } from './tabs/types'
import { formatDate } from '../render/context'
import { checkAccessibility, slideTitleText, sortedByPosition } from '../model/accessibility'
import { CellMarginsDialog, ChartDataDialog, InsertChartDialog, InsertDiagramDialog, InsertTableDialog, SplitCellsDialog, EffectOptionsDialog, CustomShowsDialog, TrimMediaDialog } from './ObjectDialogs'

type Props = { kind: DialogKind; onClose: () => void; query?: string }

const IconsDialog = lazy(() => import('./IconsDialog'))
const ReuseSlidesDialog = lazy(() => import('./MoreDialogs').then((m) => ({ default: m.ReuseSlidesDialog })))
const PhotoAlbumDialog = lazy(() => import('./MoreDialogs').then((m) => ({ default: m.PhotoAlbumDialog })))

// ---------- Find & Replace ----------

type Match = { slideId: string; elId: string; index: number }

function docIndex(doc: RichDoc) {
  let text = ''
  const pos: number[] = []
  let p = 0
  for (const para of doc.content) {
    p += 1
    for (const n of para.content ?? []) {
      if (n.type === 'text') {
        for (const ch of n.text) {
          pos.push(p)
          text += ch
          p += ch.length
        }
      } else {
        pos.push(p)
        text += n.type === 'hardBreak' ? '\n' : '￼'
        p += 1
      }
    }
    pos.push(p)
    text += '\n'
    p += 1
  }
  return { text, pos }
}

function allMatches(query: string, opts: { matchCase: boolean; wholeWords: boolean }): Match[] {
  const out: Match[] = []
  for (const slide of store.get().pres.slides)
    for (const el of slide.elements) {
      if (el.type !== 'shape' || !el.text) continue
      const { text } = docIndex(el.text.doc)
      for (const index of findInText(text, query, opts)) out.push({ slideId: slide.id, elId: el.id, index })
    }
  return out
}

function selectMatch(m: Match, length: number) {
  const s = store.get()
  if (s.slideId !== m.slideId) A.goToSlide(m.slideId)
  const el = findElement(currentSlide().elements, m.elId) as ShapeElement | undefined
  if (!el?.text) return
  const { pos } = docIndex(el.text.doc)
  const from = pos[m.index]
  const to = pos[m.index + length - 1] + 1
  const apply = () => {
    const ed = getActiveEditor()
    if (!ed) return false
    ed.chain().focus().setTextSelection({ from, to }).scrollIntoView().run()
    return true
  }
  if (store.get().editingId === m.elId && apply()) return
  A.select([m.elId])
  A.enterEditing(m.elId, { kind: 'end' })
  let tries = 12
  const loop = () => {
    if (!apply() && tries-- > 0) requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

function FindDialog({ replace, onClose, initial }: { replace: boolean; onClose: () => void; initial?: string }) {
  const [query, setQuery] = useState(initial ?? '')
  const [replacement, setReplacement] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [wholeWords, setWholeWords] = useState(false)
  const [message, setMessage] = useState('')
  const [cursor, setCursor] = useState(-1)
  const opts = { matchCase, wholeWords }

  function findNext() {
    const matches = allMatches(query, opts)
    if (!matches.length) {
      setMessage(`We couldn't find what you were looking for.`)
      return
    }
    const next = (cursor + 1) % matches.length
    setCursor(next)
    setMessage(`${next + 1} of ${matches.length}`)
    selectMatch(matches[next], query.length)
  }

  function replaceOne() {
    const ed = getActiveEditor()
    if (ed) {
      const { from, to } = ed.state.selection
      const selected = ed.state.doc.textBetween(from, to)
      const same = matchCase ? selected === query : selected.toLowerCase() === query.toLowerCase()
      if (same && selected) {
        ed.chain().focus().insertContentAt({ from, to }, replacement).run()
        setCursor((c) => c - 1)
      }
    }
    findNext()
  }

  function replaceAll() {
    let total = 0
    if (store.get().editingId) A.exitEditing()
    commit((p) => ({
      ...p,
      slides: p.slides.map((sl) => ({
        ...sl,
        elements: sl.elements.map((el) => {
          if (el.type !== 'shape' || !el.text) return el
          const { doc, count } = replaceInDoc(el.text.doc, query, replacement, opts)
          total += count
          return count ? { ...el, text: { ...el.text, doc } } : el
        }),
      })),
    }))
    setMessage(total ? `Replaced ${total} item${total === 1 ? '' : 's'}.` : `We couldn't find what you were looking for.`)
  }

  return (
    <Modal
      title={replace ? 'Replace' : 'Find'}
      onClose={onClose}
      footer={
        <>
          <span className="dialog-msg" role="status">
            {message}
          </span>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" disabled={!query} onClick={findNext}>
            Find Next
          </button>
          {replace && (
            <>
              <button type="button" className="btn" disabled={!query} onClick={replaceOne}>
                Replace
              </button>
              <button type="button" className="btn" disabled={!query} onClick={replaceAll}>
                Replace All
              </button>
            </>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="form">
        <label>
          Find what:
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setCursor(-1)
              setMessage('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && query && findNext()}
          />
        </label>
        {replace && (
          <label>
            Replace with:
            <input value={replacement} onChange={(e) => setReplacement(e.target.value)} />
          </label>
        )}
        <label className="check">
          <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} /> Match case
        </label>
        <label className="check">
          <input type="checkbox" checked={wholeWords} onChange={(e) => setWholeWords(e.target.checked)} /> Find whole words only
        </label>
      </div>
    </Modal>
  )
}

function ReplaceFontsDialog({ onClose }: { onClose: () => void }) {
  const pres = useStore((s) => s.pres)
  const theme = getTheme(pres.themeId)
  const fonts = pres.fonts ?? theme.fonts
  const used = useMemo(() => {
    const set = new Set<string>([fonts.major, fonts.minor])
    for (const sl of pres.slides) for (const el of sl.elements) if (el.type === 'shape' && el.text) fontsInDoc(el.text.doc, set)
    return [...set].sort()
  }, [pres, fonts])
  const [from, setFrom] = useState(used[0] ?? '')
  const [to, setTo] = useState(FONT_LIST[0])
  return (
    <Modal
      title="Replace Font"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              commit((p) => ({
                ...p,
                fonts: fonts.major === from || fonts.minor === from ? { major: fonts.major === from ? to : fonts.major, minor: fonts.minor === from ? to : fonts.minor } : p.fonts,
                slides: p.slides.map((sl) => ({ ...sl, elements: sl.elements.map((el) => (el.type === 'shape' && el.text ? { ...el, text: { ...el.text, doc: replaceFontInDoc(el.text.doc, from, to) } } : el)) })),
              }))
              onClose()
            }}
          >
            Replace
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="form">
        <label>
          Replace:
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {used.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label>
          With:
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {FONT_LIST.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  )
}

function LinkDialog({ onClose }: { onClose: () => void }) {
  const ed = getActiveEditor()
  const el = selectedElements()[0]
  const [address, setAddress] = useState(T.linkValue() ?? el?.link ?? '')
  const [display, setDisplay] = useState(() => (ed ? ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to) : ''))
  const normalized = () => {
    const a = address.trim()
    if (!a) return ''
    if (/^(https?:|mailto:|#)/i.test(a)) return a
    if (/^[^@\s]+@[^@\s]+$/.test(a)) return `mailto:${a}`
    return `https://${a}`
  }
  const apply = () => {
    const href = normalized()
    if (ed) {
      const { from, to, empty } = ed.state.selection
      if (empty && display) ed.chain().focus().insertContentAt(from, { type: 'text', text: display, marks: [{ type: 'link', attrs: { href } }] }).run()
      else if (display && display !== ed.state.doc.textBetween(from, to)) ed.chain().focus().insertContentAt({ from, to }, { type: 'text', text: display, marks: [{ type: 'link', attrs: { href } }] }).run()
      else T.setLink(href || null)
    } else if (el) A.updateSelected((e) => ({ ...e, link: href || undefined }))
    onClose()
  }
  return (
    <Modal
      title="Insert Hyperlink"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={() => (ed ? T.setLink(null) : A.updateSelected((e) => ({ ...e, link: undefined })), onClose())}>
            Remove Link
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" disabled={!address.trim() || (!ed && !el)} onClick={apply}>
            OK
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="form">
        {ed && (
          <label>
            Text to display:
            <input value={display} onChange={(e) => setDisplay(e.target.value)} />
          </label>
        )}
        <label>
          Address:
          <input autoFocus value={address} placeholder="https://example.com" onChange={(e) => setAddress(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && address.trim() && apply()} />
        </label>
        <label>
          Or a place in this document:
          <select value={address.startsWith('#') ? address : ''} onChange={(e) => setAddress(e.target.value)}>
            <option value="">(Web page or e-mail address)</option>
            <option value="#first">First Slide</option>
            <option value="#last">Last Slide</option>
            <option value="#next">Next Slide</option>
            <option value="#prev">Previous Slide</option>
            {store.get().pres.slides.map((sl, i) => (
              <option key={sl.id} value={`#slide${i + 1}`}>
                {i + 1}. {slideTitleText(sl) || 'Slide'}
              </option>
            ))}
          </select>
        </label>
        {!ed && !el && <p className="dialog-msg">Select text or an object first.</p>}
        {!ed && el && <p className="dialog-msg">The link opens when the object is clicked during a slide show.</p>}
      </div>
    </Modal>
  )
}

function HeaderFooterDialog({ onClose }: { onClose: () => void }) {
  const hf = useStore((s) => s.pres.headerFooter)
  const [v, setV] = useState(hf)
  const set = (patch: Partial<typeof v>) => setV({ ...v, ...patch })
  return (
    <Modal
      title="Header and Footer"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" onClick={() => (A.setHeaderFooter(v), onClose())}>
            Apply to All
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="form">
        <span className="field-caption">Include on slide</span>
        <label className="check">
          <input type="checkbox" checked={v.date} onChange={(e) => set({ date: e.target.checked })} /> Date and time
        </label>
        <div className="indent form">
          <label className="check">
            <input type="radio" disabled={!v.date} checked={v.dateAuto} onChange={() => set({ dateAuto: true })} /> Update automatically ({formatDate()})
          </label>
          <label className="check">
            <input type="radio" disabled={!v.date} checked={!v.dateAuto} onChange={() => set({ dateAuto: false })} /> Fixed
            <input disabled={!v.date || v.dateAuto} value={v.dateText} onChange={(e) => set({ dateText: e.target.value })} aria-label="Fixed date" />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={v.slideNumber} onChange={(e) => set({ slideNumber: e.target.checked })} /> Slide number
        </label>
        <label className="check">
          <input type="checkbox" checked={v.footer} onChange={(e) => set({ footer: e.target.checked })} /> Footer
        </label>
        <input className="indent" disabled={!v.footer} value={v.footerText} onChange={(e) => set({ footerText: e.target.value })} aria-label="Footer text" />
        <label className="check">
          <input type="checkbox" checked={v.notOnTitle} onChange={(e) => set({ notOnTitle: e.target.checked })} /> Don't show on title slide
        </label>
      </div>
    </Modal>
  )
}

const SIZE_PRESETS: { label: string; w: number; h: number; name: SlideSize['name'] }[] = [
  { label: 'Widescreen', w: 13.333, h: 7.5, name: '16:9' },
  { label: 'On-screen Show (4:3)', w: 10, h: 7.5, name: '4:3' },
  { label: 'On-screen Show (16:10)', w: 10, h: 6.25, name: 'custom' },
  { label: 'Letter Paper (8.5x11 in)', w: 10, h: 7.5, name: 'custom' },
  { label: 'A4 Paper (210x297 mm)', w: 10.833, h: 7.5, name: 'custom' },
  { label: 'Banner', w: 8, h: 1, name: 'custom' },
]

function SlideSizeDialog({ onClose }: { onClose: () => void }) {
  const size = useStore((s) => s.pres.size)
  const [w, setW] = useState(size.w / 96)
  const [h, setH] = useState(size.h / 96)
  const [step, setStep] = useState<'size' | 'scale'>('size')
  const target = (): SlideSize => {
    const tw = Math.round(w * 96)
    const th = Math.round(h * 96)
    if (tw === SIZE_16_9.w && th === SIZE_16_9.h) return SIZE_16_9
    if (tw === SIZE_4_3.w && th === SIZE_4_3.h) return SIZE_4_3
    return { w: tw, h: th, name: 'custom' }
  }
  if (step === 'scale')
    return (
      <Modal
        title="Slide Size"
        onClose={onClose}
        footer={
          <>
            <span className="spacer" />
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
          </>
        }
      >
        <p>You are scaling to a new slide size. Do you want to maximize the size of your content, or scale it down to make sure it will fit on the new slide?</p>
        <div className="row gap">
          <button type="button" className="btn" onClick={() => (A.setSlideSize(target(), 'maximize'), onClose())}>
            Maximize
          </button>
          <button type="button" className="btn btn-primary" onClick={() => (A.setSlideSize(target(), 'fit'), onClose())}>
            Ensure Fit
          </button>
        </div>
      </Modal>
    )
  return (
    <Modal
      title="Slide Size"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" onClick={() => setStep('scale')}>
            OK
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="form">
        <label>
          Slides sized for:
          <select
            onChange={(e) => {
              const p = SIZE_PRESETS[Number(e.target.value)]
              setW(p.w)
              setH(p.h)
            }}
            defaultValue=""
          >
            <option value="" disabled>
              Custom
            </option>
            {SIZE_PRESETS.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field-row">
          <span>Width:</span>
          <NumberField label="Width" value={w} step={0.1} min={1} max={56} suffix=" in" onChange={setW} />
        </label>
        <label className="field-row">
          <span>Height:</span>
          <NumberField label="Height" value={h} step={0.1} min={1} max={56} suffix=" in" onChange={setH} />
        </label>
        <span className="field-caption">Orientation</span>
        <div className="row gap">
          <label className="check">
            <input type="radio" checked={w >= h} onChange={() => w < h && (setW(h), setH(w))} /> Landscape
          </label>
          <label className="check">
            <input type="radio" checked={h > w} onChange={() => w >= h && (setW(h), setH(w))} /> Portrait
          </label>
        </div>
      </div>
    </Modal>
  )
}

function ZoomDialog({ onClose }: { onClose: () => void }) {
  const zoom = useStore((s) => s.zoom)
  const [v, setV] = useState<number | 'fit'>(zoom)
  return (
    <Modal
      title="Zoom"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" onClick={() => (store.set(v === 'fit' ? { fit: true } : { zoom: Math.max(10, Math.min(400, Math.round(v))), fit: false }), onClose())}>
            OK
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="form">
        <label className="check">
          <input type="radio" checked={v === 'fit'} onChange={() => setV('fit')} /> Fit
        </label>
        {[400, 300, 200, 100, 66, 50, 33].map((z) => (
          <label key={z} className="check">
            <input type="radio" checked={v === z} onChange={() => setV(z)} /> {z}%
          </label>
        ))}
        <label className="field-row">
          <span>Percent:</span>
          <NumberField label="Percent" value={v === 'fit' ? zoom : v} step={1} min={10} max={400} suffix="%" decimals={0} onChange={setV} />
        </label>
      </div>
    </Modal>
  )
}

function FontDialog({ onClose }: { onClose: () => void }) {
  const [family, setFamily] = useState<string>(T.textStyleValue('fontFamily') ?? '')
  const [size, setSize] = useState(T.currentFontSize())
  const [bold, setBold] = useState(T.isMarkActive('bold'))
  const [italic, setItalic] = useState(T.isMarkActive('italic'))
  const [underline, setUnderline] = useState(T.isMarkActive('underline'))
  const [strike, setStrike] = useState(T.isMarkActive('strike'))
  const [sup, setSup] = useState(T.isMarkActive('superscript'))
  const [sub, setSub] = useState(T.isMarkActive('subscript'))
  const [caps, setCaps] = useState<'all' | 'small' | null>(T.textStyleValue('caps') ?? null)
  const [spacing, setSpacing] = useState<number>(T.textStyleValue('letterSpacing') ?? 0)
  const apply = () => {
    T.setTextStyle({ fontFamily: family || null, fontSize: size, caps, letterSpacing: spacing || null })
    const marks = [
      ['bold', bold],
      ['italic', italic],
      ['underline', underline],
      ['strike', strike],
      ['superscript', sup],
      ['subscript', sub],
    ] as const
    for (const [m, on] of marks) if (T.isMarkActive(m) !== on) T.toggleMark(m)
    onClose()
  }
  return (
    <Modal
      title="Font"
      width={520}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" disabled={!T.hasTextTarget()} onClick={apply}>
            OK
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="form">
        <div className="row gap">
          <label>
            Latin text font:
            <select value={family} onChange={(e) => setFamily(e.target.value)}>
              <option value="">+Theme font</option>
              {FONT_LIST.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label>
            Font style:
            <select
              value={bold && italic ? 'bi' : bold ? 'b' : italic ? 'i' : 'r'}
              onChange={(e) => {
                setBold(e.target.value.includes('b'))
                setItalic(e.target.value.includes('i'))
              }}
            >
              <option value="r">Regular</option>
              <option value="i">Italic</option>
              <option value="b">Bold</option>
              <option value="bi">Bold Italic</option>
            </select>
          </label>
          <label>
            Size:
            <NumberField label="Size" value={size} step={1} min={1} max={4000} onChange={setSize} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={underline} onChange={(e) => setUnderline(e.target.checked)} /> Underline
        </label>
        <span className="field-caption">Effects</span>
        <div className="grid-2">
          <label className="check">
            <input type="checkbox" checked={strike} onChange={(e) => setStrike(e.target.checked)} /> Strikethrough
          </label>
          <label className="check">
            <input type="checkbox" checked={caps === 'small'} onChange={(e) => setCaps(e.target.checked ? 'small' : null)} /> Small Caps
          </label>
          <label className="check">
            <input type="checkbox" checked={sup} onChange={(e) => (setSup(e.target.checked), e.target.checked && setSub(false))} /> Superscript
          </label>
          <label className="check">
            <input type="checkbox" checked={caps === 'all'} onChange={(e) => setCaps(e.target.checked ? 'all' : null)} /> All Caps
          </label>
          <label className="check">
            <input type="checkbox" checked={sub} onChange={(e) => (setSub(e.target.checked), e.target.checked && setSup(false))} /> Subscript
          </label>
        </div>
        <span className="field-caption">Character Spacing</span>
        <div className="row gap">
          <select value={spacing > 0 ? 'e' : spacing < 0 ? 'c' : 'n'} onChange={(e) => setSpacing(e.target.value === 'n' ? 0 : e.target.value === 'e' ? Math.abs(spacing) || 1 : -(Math.abs(spacing) || 1))}>
            <option value="n">Normal</option>
            <option value="e">Expanded</option>
            <option value="c">Condensed</option>
          </select>
          <label className="field-row">
            <span>By:</span>
            <NumberField label="Spacing" value={Math.abs(spacing)} step={0.1} min={0} max={1584} suffix=" pt" onChange={(v) => setSpacing(spacing < 0 ? -v : v)} />
          </label>
        </div>
      </div>
    </Modal>
  )
}

function ParagraphDialog({ onClose }: { onClose: () => void }) {
  const [align, setAlign] = useState(T.paraValue('align') ?? 'left')
  const [level, setLevel] = useState(T.paraValue('level') ?? 0)
  const [before, setBefore] = useState<number>(T.paraValue('spaceBefore') ?? 0)
  const [after, setAfter] = useState<number>(T.paraValue('spaceAfter') ?? 0)
  const [lh, setLh] = useState<number>(T.paraValue('lineHeight') ?? 1)
  return (
    <Modal
      title="Paragraph"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" disabled={!T.hasTextTarget()} onClick={() => (T.setPara({ align, level, spaceBefore: before, spaceAfter: after, lineHeight: lh }), onClose())}>
            OK
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="form">
        <span className="field-caption">General</span>
        <label className="field-row">
          <span>Alignment:</span>
          <select value={align} onChange={(e) => setAlign(e.target.value as typeof align)}>
            <option value="left">Left</option>
            <option value="center">Centered</option>
            <option value="right">Right</option>
            <option value="justify">Justified</option>
          </select>
        </label>
        <span className="field-caption">Indentation</span>
        <label className="field-row">
          <span>List level:</span>
          <NumberField label="List level" value={level + 1} step={1} min={1} max={9} decimals={0} onChange={(v) => setLevel(Math.round(v) - 1)} />
        </label>
        <span className="field-caption">Spacing</span>
        <label className="field-row">
          <span>Before:</span>
          <NumberField label="Spacing before" value={before} step={6} min={0} max={1584} suffix=" pt" onChange={setBefore} />
        </label>
        <label className="field-row">
          <span>After:</span>
          <NumberField label="Spacing after" value={after} step={6} min={0} max={1584} suffix=" pt" onChange={setAfter} />
        </label>
        <label className="field-row">
          <span>Line Spacing:</span>
          <select value={[1, 1.5, 2].includes(lh) ? String(lh) : 'm'} onChange={(e) => e.target.value !== 'm' && setLh(Number(e.target.value))}>
            <option value="1">Single</option>
            <option value="1.5">1.5 lines</option>
            <option value="2">Double</option>
            <option value="m">Multiple</option>
          </select>
          <NumberField label="Line spacing multiple" value={lh} step={0.1} min={0} max={9.99} onChange={setLh} />
        </label>
      </div>
    </Modal>
  )
}

function SectionDialog({ onClose }: { onClose: () => void }) {
  const slide = useStore((s) => currentSlide(s))
  const [name, setName] = useState(slide.section ?? 'Untitled Section')
  return (
    <Modal
      title={slide.section ? 'Rename Section' : 'Add Section'}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" disabled={!name.trim()} onClick={() => (A.setSection(name.trim()), onClose())}>
            {slide.section ? 'Rename' : 'Add'}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="form">
        <label>
          Section name:
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} onKeyDown={(e) => e.key === 'Enter' && name.trim() && (A.setSection(name.trim()), onClose())} />
        </label>
      </div>
    </Modal>
  )
}

export const SHORTCUTS: [string, string][] = [
  ['Ctrl+N', 'New presentation'],
  ['Ctrl+O', 'Open'],
  ['Ctrl+S', 'Save as .pptx'],
  ['Ctrl+P', 'Print'],
  ['Ctrl+M', 'New slide'],
  ['Ctrl+D', 'Duplicate object or slide'],
  ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'],
  ['Ctrl+X / C / V', 'Cut / Copy / Paste'],
  ['Ctrl+A', 'Select all'],
  ['Ctrl+G / Ctrl+Shift+G', 'Group / Ungroup'],
  ['Ctrl+B / I / U', 'Bold / Italic / Underline'],
  ['Ctrl+E / L / R / J', 'Center / Left / Right / Justify'],
  ['Ctrl+Shift+> / <', 'Increase / decrease font size'],
  ['Ctrl+] / [', 'Increase / decrease font size'],
  ['Ctrl+T', 'Font dialog'],
  ['Ctrl+K', 'Insert hyperlink'],
  ['Ctrl+F / Ctrl+H', 'Find / Replace'],
  ['Tab / Shift+Tab', 'Demote / promote list level (in text); next / previous object'],
  ['Arrow keys', 'Nudge object (Ctrl for fine steps)'],
  ['Shift+drag', 'Constrain movement or keep proportions'],
  ['Ctrl+drag', 'Copy object'],
  ['Alt+drag', 'Move without snapping'],
  ['F2', 'Edit text of the selected object'],
  ['Esc', 'Leave text editing / clear selection'],
  ['F5 / Shift+F5', 'Slide show from beginning / current slide'],
  ['Slide show: N, Space, →, ↓, PgDn', 'Next'],
  ['Slide show: P, Backspace, ←, ↑, PgUp', 'Previous'],
  ['Slide show: number + Enter', 'Go to slide'],
  ['Slide show: B / W', 'Black / white screen'],
  ['Slide show: Esc', 'End show'],
]

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Keyboard Shortcuts"
      width={560}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <table className="shortcut-table">
        <tbody>
          {SHORTCUTS.map(([k, v]) => (
            <tr key={k}>
              <td>
                <kbd>{k}</kbd>
              </td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  )
}

function SetupShowDialog({ onClose }: { onClose: () => void }) {
  const pres = useStore((s) => s.pres)
  const [type, setType] = useState(pres.showType ?? 'speaker')
  const [loop, setLoop] = useState(!!pres.loop)
  const [noAnim, setNoAnim] = useState(!!pres.showNoAnimation)
  const [pen, setPen] = useState(pres.penColor ?? '#E03131')
  const [laser, setLaser] = useState(pres.laserColor ?? '#FF0000')
  const [range, setRange] = useState<'all' | 'range' | 'custom'>(pres.showCustom ? 'custom' : pres.showRange ? 'range' : 'all')
  const [from, setFrom] = useState(pres.showRange?.from ?? 1)
  const [to, setTo] = useState(pres.showRange?.to ?? pres.slides.length)
  const [custom, setCustom] = useState(pres.showCustom ?? pres.customShows?.[0]?.id ?? '')
  const [timings, setTimings] = useState(pres.useTimings !== false)
  const [presenter, setPresenter] = useState(!!pres.presenterView)
  const ok = () => {
    commit((p) => ({
      ...p,
      showType: type,
      loop: type === 'kiosk' ? true : loop,
      showNoAnimation: noAnim,
      penColor: pen,
      laserColor: laser,
      showRange: range === 'range' ? { from: Math.max(1, Math.round(from)), to: Math.max(Math.round(from), Math.round(to)) } : null,
      showCustom: range === 'custom' && custom ? custom : null,
      useTimings: timings,
      presenterView: presenter,
    }))
    onClose()
  }
  return (
    <Modal
      title="Set Up Show"
      onClose={onClose}
      width={560}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" onClick={ok}>
            OK
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="setup-grid">
        <fieldset>
          <legend>Show type</legend>
          <label className="check">
            <input type="radio" checked={type === 'speaker'} onChange={() => setType('speaker')} /> Presented by a speaker (full screen)
          </label>
          <label className="check">
            <input type="radio" checked={type === 'individual'} onChange={() => setType('individual')} /> Browsed by an individual (window)
          </label>
          <label className="check">
            <input type="radio" checked={type === 'kiosk'} onChange={() => setType('kiosk')} /> Browsed at a kiosk (full screen)
          </label>
        </fieldset>
        <fieldset>
          <legend>Show slides</legend>
          <label className="check">
            <input type="radio" checked={range === 'all'} onChange={() => setRange('all')} /> All
          </label>
          <label className="check">
            <input type="radio" checked={range === 'range'} onChange={() => setRange('range')} /> From:
            <NumberField label="From slide" value={from} min={1} max={pres.slides.length} step={1} decimals={0} width={56} disabled={range !== 'range'} onChange={setFrom} /> To:
            <NumberField label="To slide" value={to} min={1} max={pres.slides.length} step={1} decimals={0} width={56} disabled={range !== 'range'} onChange={setTo} />
          </label>
          <label className="check">
            <input type="radio" checked={range === 'custom'} disabled={!pres.customShows?.length} onChange={() => setRange('custom')} /> Custom show:
            <select value={custom} disabled={range !== 'custom'} onChange={(e) => setCustom(e.target.value)}>
              {(pres.customShows ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>Show options</legend>
          <label className="check">
            <input type="checkbox" checked={loop || type === 'kiosk'} disabled={type === 'kiosk'} onChange={(e) => setLoop(e.target.checked)} /> Loop continuously until 'Esc'
          </label>
          <label className="check">
            <input type="checkbox" checked={noAnim} onChange={(e) => setNoAnim(e.target.checked)} /> Show without animation
          </label>
          <label className="check">
            Pen color: <input type="color" value={pen} onChange={(e) => setPen(e.target.value.toUpperCase())} />
          </label>
          <label className="check">
            Laser pointer color: <input type="color" value={laser} onChange={(e) => setLaser(e.target.value.toUpperCase())} />
          </label>
        </fieldset>
        <fieldset>
          <legend>Advance slides</legend>
          <label className="check">
            <input type="radio" checked={!timings} onChange={() => setTimings(false)} /> Manually
          </label>
          <label className="check">
            <input type="radio" checked={timings} onChange={() => setTimings(true)} /> Using timings, if present
          </label>
          <legend className="sub">Multiple monitors</legend>
          <label className="check">
            <input type="checkbox" checked={presenter} onChange={(e) => setPresenter(e.target.checked)} /> Use Presenter View
          </label>
        </fieldset>
      </div>
    </Modal>
  )
}

function AccessibilityDialog({ onClose }: { onClose: () => void }) {
  const pres = useStore((s) => s.pres)
  const issues = checkAccessibility(pres)
  const groups: { level: 'error' | 'warning' | 'tip'; label: string }[] = [
    { level: 'error', label: 'Errors' },
    { level: 'warning', label: 'Warnings' },
    { level: 'tip', label: 'Tips' },
  ]
  const go = (it: (typeof issues)[number]) => {
    A.goToSlide(it.slideId)
    if (it.elId) A.select([it.elId])
  }
  const sortSlide = (slideId: string) =>
    commit((p) => ({ ...p, slides: p.slides.map((sl) => (sl.id !== slideId ? sl : { ...sl, elements: [...sl.elements.filter((e) => e.locked), ...sortedByPosition(sl.elements.filter((e) => !e.locked))] })) }))
  return (
    <Modal
      title="Accessibility"
      width={520}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      {issues.length ? (
        <div className="a11y">
          <p className="hint">Inspection results. Click an item to go to it.</p>
          {groups.map((g) => {
            const list = issues.filter((i) => i.level === g.level)
            if (!list.length) return null
            return (
              <section key={g.level}>
                <h3 className={`a11y-${g.level}`}>
                  {g.label} ({list.length})
                </h3>
                <ul className="issue-list">
                  {list.map((it, i) => (
                    <li key={i}>
                      <button type="button" className="link-btn" onClick={() => go(it)}>
                        <strong>{it.kind}</strong> — {it.name ? `${it.name} (Slide ${it.slideIndex + 1})` : `Slide ${it.slideIndex + 1}`}
                      </button>
                      {it.fix === 'alt' && (
                        <>
                          <button type="button" className="btn btn-small" onClick={() => (go(it), onClose(), setTimeout(() => window.dispatchEvent(new CustomEvent('kontor:dialog', { detail: 'altText' }))))}>
                            Add a Description
                          </button>
                          <button type="button" className="btn btn-small" onClick={() => it.elId && A.updateElement(it.elId, (e) => ({ ...e, alt: 'decorative' }))}>
                            Mark as Decorative
                          </button>
                        </>
                      )}
                      {it.fix === 'header' && (
                        <button type="button" className="btn btn-small" onClick={() => it.elId && A.updateElement(it.elId, (e) => (e.type === 'table' ? { ...e, opts: { ...e.opts, headerRow: true } } : e))}>
                          Use First Row as Header
                        </button>
                      )}
                      {it.fix === 'order' && (
                        <button type="button" className="btn btn-small" title="Orders the objects top to bottom, left to right (this also changes which object is in front)" onClick={() => sortSlide(it.slideId)}>
                          Sort by Position
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      ) : (
        <p>No accessibility issues found. People with disabilities should not have difficulty reading this presentation.</p>
      )}
    </Modal>
  )
}

function AltTextDialog({ onClose }: { onClose: () => void }) {
  const el = selectedElements()[0]
  const [text, setText] = useState(el?.alt ?? '')
  return (
    <Modal
      title="Alt Text"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" disabled={!el} onClick={() => (A.updateSelected((e) => ({ ...e, alt: text })), onClose())}>
            OK
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="form">
        <label>
          How would you describe this object and its context to someone who is blind or low vision?
          <textarea autoFocus rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={text === 'decorative'} onChange={(e) => setText(e.target.checked ? 'decorative' : '')} /> Mark as decorative
        </label>
      </div>
    </Modal>
  )
}

function CompressPicturesDialog({ onClose }: { onClose: () => void }) {
  const selected = selectedElements().filter((e): e is ImageElement => e.type === 'image')
  const [onlySelected, setOnlySelected] = useState(selected.length > 0)
  const [deleteCropped, setDeleteCropped] = useState(true)
  const [ppi, setPpi] = useState<number>(DEFAULT_PPI)
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    const ids = new Set(selected.map((e) => e.id))
    const results = new Map<string, Partial<ImageElement>>()
    const jobs: Promise<void>[] = []
    const visit = (els: SlideElement[]) => {
      for (const e of els) {
        if (e.type === 'group') visit(e.children)
        if (e.type !== 'image' || (onlySelected && !ids.has(e.id))) continue
        const crop = deleteCropped && e.crop && (e.crop.l || e.crop.t || e.crop.r || e.crop.b) ? e.crop : undefined
        const maxEdge = ppi ? maxEdgeFor(e.w, e.h, ppi) : Infinity
        if (!crop && !Number.isFinite(maxEdge)) continue
        jobs.push(
          downscale(e.src, maxEdge, crop)
            .then((r) => {
              if (r.changed) results.set(e.id, { src: r.src, natW: r.natW, natH: r.natH, ...(crop ? { crop: undefined } : {}) })
            })
            .catch(() => undefined),
        )
      }
    }
    for (const slide of store.get().pres.slides) visit(slide.elements)
    await Promise.all(jobs)
    if (results.size)
      commit((p) => ({ ...p, slides: p.slides.map((sl) => ({ ...sl, elements: mapElements(sl.elements, (e) => (results.has(e.id) ? ({ ...e, ...results.get(e.id) } as SlideElement) : e)) })) }))
    onClose()
  }
  return (
    <Modal
      title="Compress Pictures"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" disabled={busy} onClick={run}>
            {busy ? 'Compressing…' : 'OK'}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="form">
        <fieldset>
          <legend>Compression options</legend>
          <label className="check">
            <input type="checkbox" checked={onlySelected} disabled={!selected.length} onChange={(e) => setOnlySelected(e.target.checked)} /> Apply only to this picture
          </label>
          <label className="check">
            <input type="checkbox" checked={deleteCropped} onChange={(e) => setDeleteCropped(e.target.checked)} /> Delete cropped areas of pictures
          </label>
        </fieldset>
        <fieldset>
          <legend>Resolution</legend>
          {[
            [0, 'High fidelity: preserves the quality of the original picture'],
            [330, 'HD (330 ppi): good quality for high-definition displays'],
            [220, 'Print (220 ppi): excellent quality on most printers and screens'],
            [150, 'Web (150 ppi): good for web pages and projectors'],
            [96, 'E-mail (96 ppi): minimize document size for sharing'],
          ].map(([v, label]) => (
            <label key={v} className="check">
              <input type="radio" name="ppi" checked={ppi === v} onChange={() => setPpi(Number(v))} /> {label}
            </label>
          ))}
        </fieldset>
      </div>
    </Modal>
  )
}

function DateTimeDialog({ onClose }: { onClose: () => void }) {
  const now = new Date()
  const formats = [
    now.toLocaleDateString('en-US'),
    now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    now.toISOString().slice(0, 10),
    now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    now.toLocaleString('en-US'),
  ]
  const [pick, setPick] = useState(0)
  const [auto, setAuto] = useState(false)
  return (
    <Modal
      title="Date and Time"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" onClick={() => (auto ? T.insertField('date') : T.insertText(formats[pick]), onClose())}>
            OK
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="form">
        <select size={8} value={pick} onChange={(e) => setPick(Number(e.target.value))} aria-label="Available formats">
          {formats.map((f, i) => (
            <option key={i} value={i}>
              {f}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Update automatically
        </label>
      </div>
    </Modal>
  )
}

function AboutDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="About"
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" onClick={onClose}>
            OK
          </button>
        </>
      }
    >
      <p>
        <strong>Kontor Slides</strong> — a free presentation program that runs in your browser.
      </p>
      <p>Presentations are saved automatically in this browser. Use File › Save As to download a .pptx file that opens in other presentation programs.</p>
    </Modal>
  )
}

export function Dialogs({ kind, onClose, query }: Props) {
  switch (kind) {
    case 'find':
      return <FindDialog replace={false} onClose={onClose} initial={query} />
    case 'replace':
      return <FindDialog replace onClose={onClose} initial={query} />
    case 'replaceFonts':
      return <ReplaceFontsDialog onClose={onClose} />
    case 'link':
      return <LinkDialog onClose={onClose} />
    case 'headerFooter':
      return <HeaderFooterDialog onClose={onClose} />
    case 'slideSize':
      return <SlideSizeDialog onClose={onClose} />
    case 'zoom':
      return <ZoomDialog onClose={onClose} />
    case 'font':
      return <FontDialog onClose={onClose} />
    case 'paragraph':
      return <ParagraphDialog onClose={onClose} />
    case 'section':
      return <SectionDialog onClose={onClose} />
    case 'shortcuts':
      return <ShortcutsDialog onClose={onClose} />
    case 'about':
      return <AboutDialog onClose={onClose} />
    case 'setupShow':
      return <SetupShowDialog onClose={onClose} />
    case 'accessibility':
      return <AccessibilityDialog onClose={onClose} />
    case 'altText':
      return <AltTextDialog onClose={onClose} />
    case 'dateTime':
      return <DateTimeDialog onClose={onClose} />
    case 'insertTable':
      return <InsertTableDialog onClose={onClose} />
    case 'splitCells':
      return <SplitCellsDialog onClose={onClose} />
    case 'cellMargins':
      return <CellMarginsDialog onClose={onClose} />
    case 'insertChart':
      return <InsertChartDialog onClose={onClose} />
    case 'changeChart':
      return <InsertChartDialog onClose={onClose} change />
    case 'chartData':
      return <ChartDataDialog onClose={onClose} />
    case 'insertDiagram':
      return <InsertDiagramDialog onClose={onClose} />
    case 'effectOptions':
      return <EffectOptionsDialog onClose={onClose} />
    case 'customShows':
      return <CustomShowsDialog onClose={onClose} />
    case 'trimMedia':
      return <TrimMediaDialog onClose={onClose} />
    case 'reuseSlides':
      return (
        <Suspense fallback={null}>
          <ReuseSlidesDialog onClose={onClose} />
        </Suspense>
      )
    case 'photoAlbum':
      return (
        <Suspense fallback={null}>
          <PhotoAlbumDialog onClose={onClose} />
        </Suspense>
      )
    case 'compressPictures':
      return <CompressPicturesDialog onClose={onClose} />
    case 'icons':
      return (
        <Suspense fallback={null}>
          <IconsDialog onClose={onClose} />
        </Suspense>
      )
    case 'columns':
      return <ColumnsDialog onClose={onClose} />
    case 'bullets':
      return <BulletsDialog onClose={onClose} />
    case 'themeColors':
      return <ThemeColorsDialog onClose={onClose} />
    case 'themeFonts':
      return <ThemeFontsDialog onClose={onClose} />
    case 'gridGuides':
      return <GridGuidesDialog onClose={onClose} />
    case 'options':
      return <OptionsDialog onClose={onClose} />
    case 'thesaurus':
      return <ThesaurusDialog onClose={onClose} />
  }
}

