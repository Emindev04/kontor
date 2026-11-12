import { useMemo, useState } from 'react'
import { BUILTIN_FORMATS, CUSTOM_FORMATS, classifyFormat, formatValue } from '../../model/numfmt'
import { DEFAULT_FONT, DEFAULT_SIZE, type Border, type BorderStyle, type Style, type StylePatch } from '../../model/style'
import { FontColorPalette } from '../palettes'
import { DialogTabs, Modal, OkCancel, cls } from '../ui'
import { useApp } from '../appContext'
import { FONTS, SIZES, activeStyle } from '../tabs/actions'

type Tab = 'number' | 'alignment' | 'font' | 'border' | 'fill' | 'protection'
type Category = 'General' | 'Number' | 'Currency' | 'Accounting' | 'Date' | 'Time' | 'Percentage' | 'Fraction' | 'Scientific' | 'Text' | 'Special' | 'Custom'
const CATEGORIES: Category[] = ['General', 'Number', 'Currency', 'Accounting', 'Date', 'Time', 'Percentage', 'Fraction', 'Scientific', 'Text', 'Special', 'Custom']

const DATE_FORMATS = ['m/d/yyyy', 'dddd, mmmm d, yyyy', 'm/d', 'm/d/yy', 'mm/dd/yy', 'd-mmm', 'd-mmm-yy', 'dd-mmm-yy', 'mmm-yy', 'mmmm-yy', 'mmmm d, yyyy', 'm/d/yyyy h:mm AM/PM', 'm/d/yyyy h:mm', 'mmmmm', 'mmmmm-yy', 'yyyy-mm-dd']
const TIME_FORMATS = ['h:mm:ss AM/PM', 'h:mm', 'h:mm AM/PM', 'h:mm:ss', 'mm:ss', 'mm:ss.0', '[h]:mm:ss', 'm/d/yyyy h:mm']
const FRACTIONS: [string, string][] = [['# ?/?', 'Up to one digit (1/4)'], ['# ??/??', 'Up to two digits (21/25)'], ['# ???/???', 'Up to three digits (312/943)'], ['# ?/2', 'As halves (1/2)'], ['# ?/4', 'As quarters (2/4)'], ['# ?/8', 'As eighths (4/8)'], ['# ??/16', 'As sixteenths (8/16)'], ['# ?/10', 'As tenths (3/10)'], ['# ??/100', 'As hundredths (30/100)']]
const SPECIAL: [string, string][] = [['00000', 'Zip Code'], ['00000-0000', 'Zip Code + 4'], ['[<=9999999]###-####;(###) ###-####', 'Phone Number'], ['000-00-0000', 'Social Security Number']]
const SYMBOLS: [string, string][] = [['None', ''], ['$', '"$"'], ['€', '[$€-x-euro2] '], ['£', '[$£-809]'], ['¥', '[$¥-804]'], ['CHF', '[$CHF-100C] ']]

function numberCode(dec: number, sep: boolean, neg: number, sym = '') {
  const base = `${sep ? '#,##0' : '0'}${dec ? '.' + '0'.repeat(dec) : ''}`
  const pos = sym + base
  switch (neg) {
    case 1: return `${pos};[Red]${pos}`
    case 2: return `${pos}_);\\(${pos}\\)`
    case 3: return `${pos}_);[Red]\\(${pos}\\)`
    default: return pos
  }
}

function accountingCode(dec: number, sym: string) {
  const d = dec ? '.' + '0'.repeat(dec) : ''
  const s = sym ? `${sym}* ` : '* '
  return `_(${s}#,##0${d}_);_(${s}\\(#,##0${d}\\);_(${s}"-"${dec ? '?'.repeat(dec) : ''}_);_(@_)`
}

const LINE_STYLES: BorderStyle[] = ['hair', 'dotted', 'dashDotDot', 'dashDot', 'dashed', 'thin', 'mediumDashDotDot', 'slantDashDot', 'mediumDashDot', 'mediumDashed', 'medium', 'thick', 'double']

type Edges = { top?: Border | null; bottom?: Border | null; left?: Border | null; right?: Border | null; insideH?: Border | null; insideV?: Border | null; diagDown?: Border | null; diagUp?: Border | null }

export function FormatCellsDialog({ initialTab, onClose }: { initialTab?: string; onClose: () => void }) {
  const app = useApp()
  const doc = app.doc
  const st = activeStyle(doc)
  const a = doc.sel.active
  const value = doc.value(a.r, a.c)
  const [tab, setTab] = useState<Tab>((initialTab as Tab) ?? 'number')

  // ----- number -----
  const kind = classifyFormat(st.fmt)
  const initialCat: Category = st.fmt === undefined || st.fmt === 'General' ? 'General' : kind === 'number' ? 'Number' : kind === 'currency' ? 'Currency' : kind === 'accounting' ? 'Accounting' : kind === 'date' ? 'Date' : kind === 'time' ? 'Time' : kind === 'percentage' ? 'Percentage' : kind === 'fraction' ? 'Fraction' : kind === 'scientific' ? 'Scientific' : kind === 'text' ? 'Text' : 'Custom'
  const [cat, setCat] = useState<Category>(initialCat)
  const decInit = /\.(0+)/.exec(st.fmt ?? '')?.[1].length ?? 2
  const [dec, setDec] = useState(decInit)
  const [sep, setSep] = useState((st.fmt ?? '').includes(','))
  const [neg, setNeg] = useState(0)
  const [sym, setSym] = useState('$')
  const [dateFmt, setDateFmt] = useState(kind === 'date' ? st.fmt! : DATE_FORMATS[0])
  const [timeFmt, setTimeFmt] = useState(kind === 'time' ? st.fmt! : TIME_FORMATS[0])
  const [fracFmt, setFracFmt] = useState(kind === 'fraction' ? st.fmt! : FRACTIONS[0][0])
  const [specialFmt, setSpecialFmt] = useState(SPECIAL[0][0])
  const [custom, setCustom] = useState(st.fmt ?? 'General')

  const code = useMemo((): string => {
    const symCode = SYMBOLS.find(([s]) => s === sym)?.[1] ?? ''
    switch (cat) {
      case 'General': return 'General'
      case 'Number': return numberCode(dec, sep, neg)
      case 'Currency': return numberCode(dec, true, neg, symCode)
      case 'Accounting': return accountingCode(dec, symCode)
      case 'Date': return dateFmt
      case 'Time': return timeFmt
      case 'Percentage': return `0${dec ? '.' + '0'.repeat(dec) : ''}%`
      case 'Fraction': return fracFmt
      case 'Scientific': return `0${dec ? '.' + '0'.repeat(dec) : ''}E+00`
      case 'Text': return '@'
      case 'Special': return specialFmt
      case 'Custom': return custom
    }
  }, [cat, dec, sep, neg, sym, dateFmt, timeFmt, fracFmt, specialFmt, custom])
  const sample = value === null ? '' : formatValue(value, code).text

  // ----- alignment -----
  const [h, setH] = useState(st.h ?? 'general')
  const [v, setV] = useState(st.v ?? 'bottom')
  const [ind, setInd] = useState(st.indent ?? 0)
  const [wrap, setWrap] = useState(!!st.wrap)
  const [shrink, setShrink] = useState(!!st.shrink)
  const [mergeCells, setMergeCells] = useState(!!doc.sheet.mergeAt(a.r, a.c))
  const [rot, setRot] = useState(st.rotate === 255 ? 0 : st.rotate ?? 0)
  const [vertical, setVertical] = useState(st.rotate === 255)

  // ----- font -----
  const [font, setFont] = useState(st.font ?? DEFAULT_FONT)
  const [style, setStyle] = useState(st.bold && st.italic ? 'Bold Italic' : st.bold ? 'Bold' : st.italic ? 'Italic' : 'Regular')
  const [size, setSize] = useState(String(st.size ?? DEFAULT_SIZE))
  const [underline, setUnderline] = useState<string>(st.underline ?? 'none')
  const [color, setColor] = useState(st.color)
  const [strike, setStrike] = useState(!!st.strike)
  const [script, setScript] = useState(st.script)

  // ----- border -----
  const [lineStyle, setLineStyle] = useState<BorderStyle>('thin')
  const [lineColor, setLineColor] = useState('#000000')
  const [edges, setEdges] = useState<Edges>({})
  const rg = doc.activeRange
  const multiRow = rg.r2 > rg.r1
  const multiCol = rg.c2 > rg.c1
  const shown = (k: keyof Edges): Border | undefined => {
    if (edges[k] !== undefined) return edges[k] ?? undefined
    const map: Record<string, keyof Style> = { top: 'bt', bottom: 'bb', left: 'bl', right: 'br', diagDown: 'bdd', diagUp: 'bdu' }
    return map[k] ? (st[map[k]] as Border | undefined) : undefined
  }
  const toggleEdge = (k: keyof Edges) => {
    const cur = shown(k)
    const same = cur && cur.style === lineStyle && cur.color === lineColor
    setEdges({ ...edges, [k]: same ? null : { style: lineStyle, color: lineColor } })
  }

  // ----- fill -----
  const [fill, setFill] = useState(st.fill)

  // ----- protection -----
  const [locked, setLocked] = useState(st.locked !== false)
  const [hidden, setHidden] = useState(!!st.hideFormula)

  const ok = () => {
    const patch: StylePatch = {}
    if (code !== (st.fmt ?? 'General')) patch.fmt = code === 'General' ? undefined : code
    if (h !== (st.h ?? 'general')) patch.h = h === 'general' ? undefined : h
    if (v !== (st.v ?? 'bottom')) patch.v = v === 'bottom' ? undefined : v
    if (ind !== (st.indent ?? 0)) patch.indent = ind || undefined
    if (wrap !== !!st.wrap) patch.wrap = wrap || undefined
    if (shrink !== !!st.shrink) patch.shrink = shrink || undefined
    const newRot = vertical ? 255 : rot
    if (newRot !== (st.rotate ?? 0)) patch.rotate = newRot || undefined
    if (font !== (st.font ?? DEFAULT_FONT)) patch.font = font
    const bold = style.includes('Bold')
    const italic = style.includes('Italic')
    if (bold !== !!st.bold) patch.bold = bold || undefined
    if (italic !== !!st.italic) patch.italic = italic || undefined
    const sz = Number(size)
    if (sz >= 1 && sz <= 409 && sz !== (st.size ?? DEFAULT_SIZE)) patch.size = sz
    if (underline !== (st.underline ?? 'none')) patch.underline = underline === 'none' ? undefined : (underline as Style['underline'])
    if (color !== st.color) patch.color = color
    if (strike !== !!st.strike) patch.strike = strike || undefined
    if (script !== st.script) patch.script = script
    if (fill !== st.fill) patch.fill = fill
    if (locked !== (st.locked !== false)) patch.locked = locked ? undefined : false
    if (hidden !== !!st.hideFormula) patch.hideFormula = hidden || undefined
    const hasEdges = Object.keys(edges).length > 0
    if (Object.keys(patch).length || hasEdges) {
      doc.applyStyle((_s, r, c) => {
        const p: StylePatch = { ...patch }
        const range = doc.sel.ranges.find((x) => r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2) ?? rg
        const set = (key: keyof Style, b: Border | null | undefined) => {
          if (b === undefined) return
          ;(p as Record<string, unknown>)[key] = b ?? undefined
        }
        set('bt', r === range.r1 ? edges.top : edges.insideH)
        set('bb', r === range.r2 ? edges.bottom : edges.insideH)
        set('bl', c === range.c1 ? edges.left : edges.insideV)
        set('br', c === range.c2 ? edges.right : edges.insideV)
        set('bdd', edges.diagDown)
        set('bdu', edges.diagUp)
        return p
      }, doc.sel.ranges, 'Format Cells')
    }
    const merged = !!doc.sheet.mergeAt(a.r, a.c)
    if (mergeCells !== merged) doc.merge(mergeCells ? 'merge' : 'unmerge')
    onClose()
  }

  const decimals = (
    <label className="dlg-inline">
      Decimal places:
      <input type="number" min={0} max={30} value={dec} onChange={(e) => setDec(Math.max(0, Math.min(30, Number(e.target.value) || 0)))} />
    </label>
  )
  const negList = (symCode: string) => (
    <label className="dlg-stack">
      Negative numbers:
      <select size={4} value={neg} onChange={(e) => setNeg(Number(e.target.value))}>
        {[0, 1, 2, 3].map((n) => (
          <option key={n} value={n} style={{ color: n % 2 ? 'red' : undefined }}>
            {formatValue(-1234.1, numberCode(dec, sep || cat === 'Currency', n, symCode)).text}
          </option>
        ))}
      </select>
    </label>
  )
  const symbolPick = (
    <label className="dlg-inline">
      Symbol:
      <select value={sym} onChange={(e) => setSym(e.target.value)}>
        {SYMBOLS.map(([s]) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </label>
  )

  const bs = (k: keyof Edges) => {
    const b = shown(k)
    return b ? `${b.style === 'thick' ? 3 : b.style.startsWith('medium') ? 2 : 1}px ${b.style === 'double' ? 'double' : b.style.includes('ash') ? 'dashed' : b.style === 'dotted' || b.style === 'hair' ? 'dotted' : 'solid'} ${b.color}` : '1px dashed transparent'
  }

  return (
    <Modal title="Format Cells" onClose={onClose} width={620} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <DialogTabs<Tab>
        tabs={[
          { id: 'number', label: 'Number' },
          { id: 'alignment', label: 'Alignment' },
          { id: 'font', label: 'Font' },
          { id: 'border', label: 'Border' },
          { id: 'fill', label: 'Fill' },
          { id: 'protection', label: 'Protection' },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="fc-body">
        {tab === 'number' && (
          <div className="fc-number">
            <label className="dlg-stack">
              Category:
              <select size={12} value={cat} onChange={(e) => setCat(e.target.value as Category)}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <div className="dlg-stack fc-options">
              <fieldset className="dlg-fieldset">
                <legend>Sample</legend>
                <div className="fc-sample">{sample || ' '}</div>
              </fieldset>
              {cat === 'General' && <p className="dlg-hint">General format cells have no specific number format.</p>}
              {cat === 'Number' && (
                <>
                  {decimals}
                  <label className="check-item">
                    <input type="checkbox" checked={sep} onChange={(e) => setSep(e.target.checked)} /> Use 1000 Separator (,)
                  </label>
                  {negList('')}
                </>
              )}
              {cat === 'Currency' && (
                <>
                  {decimals}
                  {symbolPick}
                  {negList(SYMBOLS.find(([s]) => s === sym)?.[1] ?? '')}
                </>
              )}
              {cat === 'Accounting' && (
                <>
                  {decimals}
                  {symbolPick}
                </>
              )}
              {(cat === 'Date' || cat === 'Time') && (
                <label className="dlg-stack">
                  Type:
                  <select size={8} value={cat === 'Date' ? dateFmt : timeFmt} onChange={(e) => (cat === 'Date' ? setDateFmt(e.target.value) : setTimeFmt(e.target.value))}>
                    {(cat === 'Date' ? DATE_FORMATS : TIME_FORMATS).map((f) => (
                      <option key={f} value={f}>
                        {formatValue(cat === 'Date' ? 45351.5625 : 0.5625, f).text}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(cat === 'Percentage' || cat === 'Scientific') && decimals}
              {cat === 'Fraction' && (
                <label className="dlg-stack">
                  Type:
                  <select size={8} value={fracFmt} onChange={(e) => setFracFmt(e.target.value)}>
                    {FRACTIONS.map(([f, l]) => (
                      <option key={f} value={f}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {cat === 'Text' && <p className="dlg-hint">Text format cells are treated as text even when a number is in the cell. The cell is displayed exactly as entered.</p>}
              {cat === 'Special' && (
                <label className="dlg-stack">
                  Type:
                  <select size={5} value={specialFmt} onChange={(e) => setSpecialFmt(e.target.value)}>
                    {SPECIAL.map(([f, l]) => (
                      <option key={f} value={f}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {cat === 'Custom' && (
                <label className="dlg-stack">
                  Type:
                  <input value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom format code" />
                  <select size={8} value={custom} onChange={(e) => setCustom(e.target.value)}>
                    {CUSTOM_FORMATS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>
        )}
        {tab === 'alignment' && (
          <div className="fc-two">
            <div className="dlg-stack">
              <fieldset className="dlg-fieldset">
                <legend>Text alignment</legend>
                <label className="dlg-stack">
                  Horizontal:
                  <select value={h} onChange={(e) => setH(e.target.value as Style['h'] & string)}>
                    <option value="general">General</option>
                    <option value="left">Left (Indent)</option>
                    <option value="center">Center</option>
                    <option value="right">Right (Indent)</option>
                    <option value="fill">Fill</option>
                    <option value="justify">Justify</option>
                    <option value="centerContinuous">Center Across Selection</option>
                    <option value="distributed">Distributed (Indent)</option>
                  </select>
                </label>
                <label className="dlg-inline">
                  Indent:
                  <input type="number" min={0} max={250} value={ind} onChange={(e) => setInd(Math.max(0, Math.min(250, Number(e.target.value) || 0)))} />
                </label>
                <label className="dlg-stack">
                  Vertical:
                  <select value={v} onChange={(e) => setV(e.target.value as Style['v'] & string)}>
                    <option value="top">Top</option>
                    <option value="middle">Center</option>
                    <option value="bottom">Bottom</option>
                    <option value="justify">Justify</option>
                    <option value="distributed">Distributed</option>
                  </select>
                </label>
              </fieldset>
              <fieldset className="dlg-fieldset">
                <legend>Text control</legend>
                <label className="check-item">
                  <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} /> Wrap text
                </label>
                <label className="check-item">
                  <input type="checkbox" checked={shrink} onChange={(e) => setShrink(e.target.checked)} /> Shrink to fit
                </label>
                <label className="check-item">
                  <input type="checkbox" checked={mergeCells} onChange={(e) => setMergeCells(e.target.checked)} /> Merge cells
                </label>
              </fieldset>
            </div>
            <fieldset className="dlg-fieldset">
              <legend>Orientation</legend>
              <label className="check-item">
                <input type="checkbox" checked={vertical} onChange={(e) => setVertical(e.target.checked)} /> Vertical text
              </label>
              <div className="fc-orient" style={{ opacity: vertical ? 0.4 : 1 }}>
                <span style={{ transform: `rotate(${-rot}deg)` }}>Text ———</span>
              </div>
              <input type="range" min={-90} max={90} value={rot} disabled={vertical} aria-label="Degrees" onChange={(e) => setRot(Number(e.target.value))} />
              <label className="dlg-inline">
                <input type="number" min={-90} max={90} value={rot} disabled={vertical} onChange={(e) => setRot(Math.max(-90, Math.min(90, Number(e.target.value) || 0)))} /> Degrees
              </label>
            </fieldset>
          </div>
        )}
        {tab === 'font' && (
          <div className="dlg-stack">
            <div className="dlg-grid font-grid">
              <label>
                Font:
                <input value={font} onChange={(e) => setFont(e.target.value)} />
                <select size={6} value={font} onChange={(e) => setFont(e.target.value)}>
                  {FONTS.map((f) => (
                    <option key={f} style={{ fontFamily: `"${f}"` }}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Font style:
                <input value={style} readOnly />
                <select size={6} value={style} onChange={(e) => setStyle(e.target.value)}>
                  {['Regular', 'Italic', 'Bold', 'Bold Italic'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Size:
                <input value={size} onChange={(e) => setSize(e.target.value)} />
                <select size={6} value={size} onChange={(e) => setSize(e.target.value)}>
                  {SIZES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="fc-two">
              <label className="dlg-stack">
                Underline:
                <select value={underline} onChange={(e) => setUnderline(e.target.value)}>
                  <option value="none">None</option>
                  <option value="single">Single</option>
                  <option value="double">Double</option>
                  <option value="singleAccounting">Single Accounting</option>
                  <option value="doubleAccounting">Double Accounting</option>
                </select>
              </label>
              <div className="dlg-stack">
                Color:
                <div className="fc-palette">
                  <FontColorPalette onAuto={() => setColor(undefined)} onPick={setColor} />
                </div>
              </div>
            </div>
            <fieldset className="dlg-fieldset">
              <legend>Effects</legend>
              <div className="effects-grid">
                <label className="check-item">
                  <input type="checkbox" checked={strike} onChange={(e) => setStrike(e.target.checked)} /> Strikethrough
                </label>
                <label className="check-item">
                  <input type="checkbox" checked={script === 'superscript'} onChange={(e) => setScript(e.target.checked ? 'superscript' : undefined)} /> Superscript
                </label>
                <label className="check-item">
                  <input type="checkbox" checked={script === 'subscript'} onChange={(e) => setScript(e.target.checked ? 'subscript' : undefined)} /> Subscript
                </label>
              </div>
            </fieldset>
            <div className="font-preview" style={{ fontFamily: `"${font}", Carlito, sans-serif`, fontWeight: style.includes('Bold') ? 700 : 400, fontStyle: style.includes('Italic') ? 'italic' : undefined, fontSize: `${Number(size) || 11}pt`, color: color ?? '#000', textDecoration: `${underline !== 'none' ? 'underline' : ''} ${strike ? 'line-through' : ''}` }}>
              AaBbCcYyZz
            </div>
          </div>
        )}
        {tab === 'border' && (
          <div className="fc-two">
            <div className="dlg-stack">
              <fieldset className="dlg-fieldset">
                <legend>Line</legend>
                <div className="line-styles">
                  {LINE_STYLES.map((s) => (
                    <button key={s} type="button" className={cls('line-style', lineStyle === s && 'is-active')} title={s} onClick={() => setLineStyle(s)}>
                      <span style={{ borderTop: `${s === 'thick' ? 3 : s.startsWith('medium') ? 2 : s === 'double' ? 3 : 1}px ${s === 'double' ? 'double' : s.includes('ash') ? 'dashed' : s === 'dotted' || s === 'hair' ? 'dotted' : 'solid'} #000` }} />
                    </button>
                  ))}
                </div>
                <label className="dlg-inline">
                  Color: <input type="color" value={lineColor} onChange={(e) => setLineColor(e.target.value.toUpperCase())} />
                </label>
              </fieldset>
            </div>
            <div className="dlg-stack">
              <fieldset className="dlg-fieldset">
                <legend>Presets</legend>
                <div className="dlg-inline">
                  <button type="button" className="btn" onClick={() => setEdges({ top: null, bottom: null, left: null, right: null, insideH: null, insideV: null, diagDown: null, diagUp: null })}>None</button>
                  <button type="button" className="btn" onClick={() => { const b = { style: lineStyle, color: lineColor }; setEdges({ ...edges, top: b, bottom: b, left: b, right: b }) }}>Outline</button>
                  <button type="button" className="btn" disabled={!multiRow && !multiCol} onClick={() => { const b = { style: lineStyle, color: lineColor }; setEdges({ ...edges, insideH: multiRow ? b : undefined, insideV: multiCol ? b : undefined }) }}>Inside</button>
                </div>
              </fieldset>
              <fieldset className="dlg-fieldset">
                <legend>Border</legend>
                <div className="border-editor">
                  <div className="be-buttons">
                    <button type="button" className="btn" onClick={() => toggleEdge('top')}>Top</button>
                    {multiRow && <button type="button" className="btn" onClick={() => toggleEdge('insideH')}>Middle</button>}
                    <button type="button" className="btn" onClick={() => toggleEdge('bottom')}>Bottom</button>
                    <button type="button" className="btn" onClick={() => toggleEdge('diagUp')}>Diagonal ↗</button>
                  </div>
                  <div className="be-preview" style={{ borderTop: bs('top'), borderBottom: bs('bottom'), borderLeft: bs('left'), borderRight: bs('right') }}>
                    <span>Text</span>
                    {multiCol && <span>Text</span>}
                  </div>
                  <div className="be-buttons">
                    <button type="button" className="btn" onClick={() => toggleEdge('left')}>Left</button>
                    {multiCol && <button type="button" className="btn" onClick={() => toggleEdge('insideV')}>Center</button>}
                    <button type="button" className="btn" onClick={() => toggleEdge('right')}>Right</button>
                    <button type="button" className="btn" onClick={() => toggleEdge('diagDown')}>Diagonal ↘</button>
                  </div>
                </div>
              </fieldset>
            </div>
          </div>
        )}
        {tab === 'fill' && (
          <div className="fc-two">
            <div className="dlg-stack">
              Background Color:
              <div className="fc-palette">
                <FontColorPalette autoLabel="No Color" onAuto={() => setFill(undefined)} onPick={setFill} />
              </div>
            </div>
            <fieldset className="dlg-fieldset">
              <legend>Sample</legend>
              <div className="fc-fill-sample" style={{ background: fill ?? '#fff' }} />
            </fieldset>
          </div>
        )}
        {tab === 'protection' && (
          <div className="dlg-stack">
            <label className="check-item">
              <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} /> Locked
            </label>
            <label className="check-item">
              <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Hidden
            </label>
            <p className="dlg-hint">Hidden cells do not show their formula in the formula bar. Locking cells has an effect once sheet protection is available.</p>
          </div>
        )}
      </div>
    </Modal>
  )
}

void BUILTIN_FORMATS
