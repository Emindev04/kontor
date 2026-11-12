import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { DialogTabs, Modal, OkCancel } from '../ui'
import { FONTS } from '../tabs/HomeTab'
import { FONT_SIZES, currentFont, currentFontSize, formatSize, parseSize } from '../../editor/commands'
import type { UnderlineStyle } from '../../editor/TextEffects'

type Style = 'Regular' | 'Italic' | 'Bold' | 'Bold Italic'
type Tab = 'font' | 'advanced'

const UNDERLINES: { id: UnderlineStyle | 'none'; label: string }[] = [
  { id: 'none', label: '(none)' },
  { id: 'single', label: 'Single' },
  { id: 'words', label: 'Words only' },
  { id: 'double', label: 'Double' },
  { id: 'thick', label: 'Thick' },
  { id: 'dotted', label: 'Dotted' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'wavy', label: 'Wave' },
]

/** Font dialog (Ctrl+D) with the Font and Advanced tabs. */
export function FontDialog({ editor, onClose, onSetDefault }: { editor: Editor; onClose: () => void; onSetDefault?: (font: string, size: number) => void }) {
  const ts = editor.getAttributes('textStyle')
  const u = editor.getAttributes('underline')
  const [tab, setTab] = useState<Tab>('font')
  const [font, setFont] = useState(currentFont(editor))
  const [style, setStyle] = useState<Style>(
    editor.isActive('bold') && editor.isActive('italic') ? 'Bold Italic' : editor.isActive('bold') ? 'Bold' : editor.isActive('italic') ? 'Italic' : 'Regular',
  )
  const [size, setSize] = useState(formatSize(currentFontSize(editor)))
  const [color, setColor] = useState<string>((ts.color as string) ?? '')
  const [underline, setUnderline] = useState<UnderlineStyle | 'none'>(editor.isActive('underline') ? ((u.underlineStyle as UnderlineStyle) ?? 'single') : 'none')
  const [underlineColor, setUnderlineColor] = useState<string>((u.underlineColor as string) ?? '')
  const [fx, setFx] = useState({
    strike: editor.isActive('strike'),
    doubleStrike: !!ts.doubleStrike,
    superscript: editor.isActive('superscript'),
    subscript: editor.isActive('subscript'),
    smallCaps: !!ts.smallCaps,
    allCaps: !!ts.allCaps,
    hidden: !!ts.hidden,
  })
  const [scale, setScale] = useState<number>((ts.scale as number) ?? 100)
  const [spacing, setSpacing] = useState<number>((ts.letterSpacing as number) ?? 0)
  const [position, setPosition] = useState<number>((ts.baselineShift as number) ?? 0)
  const [kerning, setKerning] = useState<number | null>((ts.kerning as number) ?? null)
  const [ligatures, setLigatures] = useState<string>((ts.ligatures as string) ?? 'none')
  const [numForms, setNumForms] = useState<string>((ts.numForms as string) ?? 'default')
  const [numSpacing, setNumSpacing] = useState<string>((ts.numSpacing as string) ?? 'default')

  const toggle = (key: keyof typeof fx) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = { ...fx, [key]: e.target.checked }
    if (key === 'strike' && e.target.checked) next.doubleStrike = false
    if (key === 'doubleStrike' && e.target.checked) next.strike = false
    if (key === 'superscript' && e.target.checked) next.subscript = false
    if (key === 'subscript' && e.target.checked) next.superscript = false
    if (key === 'smallCaps' && e.target.checked) next.allCaps = false
    if (key === 'allCaps' && e.target.checked) next.smallCaps = false
    setFx(next)
  }

  const apply = () => {
    const c = editor.chain().focus()
    if (font) c.setFontFamily(font)
    const pt = parseSize(size)
    if (pt >= 1 && pt <= 1638) c.setFontSize(`${pt}pt`)
    if (style.includes('Bold')) c.setBold()
    else c.unsetBold()
    if (style.includes('Italic')) c.setItalic()
    else c.unsetItalic()
    if (color) c.setColor(color)
    else c.unsetColor()
    if (underline === 'none') c.unsetUnderline()
    else c.setUnderlineStyle(underline, underlineColor || null)
    if (fx.strike) c.setStrike()
    else c.unsetStrike()
    if (fx.superscript) c.unsetSubscript().setSuperscript()
    else if (fx.subscript) c.unsetSuperscript().setSubscript()
    else c.unsetSuperscript().unsetSubscript()
    c.setTextEffects({
      doubleStrike: fx.doubleStrike || null,
      smallCaps: fx.smallCaps || null,
      allCaps: fx.allCaps || null,
      hidden: fx.hidden || null,
      scale: scale !== 100 ? scale : null,
      letterSpacing: spacing || null,
      baselineShift: position || null,
      kerning,
      ligatures: ligatures === 'none' ? null : (ligatures as 'standard'),
      numForms: numForms === 'default' ? null : (numForms as 'lining'),
      numSpacing: numSpacing === 'default' ? null : (numSpacing as 'tabular'),
    })
    c.run()
    onClose()
  }

  const previewStyle: React.CSSProperties = {
    fontFamily: `'${font}'`,
    fontSize: `${Math.min(36, parseSize(size) || 11)}pt`,
    fontWeight: style.includes('Bold') ? 700 : 400,
    fontStyle: style.includes('Italic') ? 'italic' : 'normal',
    color: color || '#000',
    textDecorationLine: [underline !== 'none' && 'underline', (fx.strike || fx.doubleStrike) && 'line-through'].filter(Boolean).join(' ') || 'none',
    textDecorationStyle: fx.doubleStrike ? 'double' : underline === 'double' ? 'double' : underline === 'dotted' ? 'dotted' : underline === 'dashed' ? 'dashed' : underline === 'wavy' ? 'wavy' : 'solid',
    textDecorationColor: underlineColor || undefined,
    fontVariant: fx.smallCaps ? 'small-caps' : undefined,
    textTransform: fx.allCaps ? 'uppercase' : undefined,
    letterSpacing: spacing ? `${spacing}pt` : undefined,
    fontKerning: kerning ? 'normal' : undefined,
    fontVariantLigatures: ligatures === 'none' ? undefined : ligatures === 'all' ? 'common-ligatures discretionary-ligatures historical-ligatures contextual' : ligatures === 'historical' ? 'historical-ligatures' : 'common-ligatures',
    fontVariantNumeric: [numForms === 'oldstyle' ? 'oldstyle-nums' : numForms === 'lining' ? 'lining-nums' : '', numSpacing === 'tabular' ? 'tabular-nums' : numSpacing === 'proportional' ? 'proportional-nums' : ''].filter(Boolean).join(' ') || undefined,
    verticalAlign: fx.superscript ? 'super' : fx.subscript ? 'sub' : undefined,
  }

  return (
    <Modal
      title="Font"
      onClose={onClose}
      width={520}
      footer={
        <OkCancel
          onOk={apply}
          onCancel={onClose}
          extra={
            onSetDefault && (
              <button
                type="button"
                className="btn"
                title="Use this font and size for the Normal style of new documents"
                onClick={() => {
                  if (!confirm(`Set ${font}, ${size} pt as the default font for new documents?`)) return
                  onSetDefault(font, parseSize(size) || 11)
                  apply()
                }}
              >
                Set As Default
              </button>
            )
          }
        />
      }
    >
      <DialogTabs
        tabs={[
          { id: 'font', label: 'Font' },
          { id: 'advanced', label: 'Advanced' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'font' ? (
        <div className="dlg-grid font-grid">
          <label>
            Font:
            <input value={font} onChange={(e) => setFont(e.target.value)} />
            <select size={6} value={font} onChange={(e) => setFont(e.target.value)}>
              {FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label>
            Font style:
            <input value={style} readOnly />
            <select size={6} value={style} onChange={(e) => setStyle(e.target.value as Style)}>
              {(['Regular', 'Italic', 'Bold', 'Bold Italic'] as Style[]).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Size:
            <input value={size} onChange={(e) => setSize(e.target.value)} />
            <select size={6} value={size} onChange={(e) => setSize(e.target.value)}>
              {FONT_SIZES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Font color:
            <span className="color-field">
              <input type="color" value={color || '#000000'} onChange={(e) => setColor(e.target.value.toUpperCase())} />
              <button type="button" className="link-btn" onClick={() => setColor('')}>
                Automatic
              </button>
            </span>
          </label>
          <label>
            Underline style:
            <select value={underline} onChange={(e) => setUnderline(e.target.value as UnderlineStyle | 'none')}>
              {UNDERLINES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Underline color:
            <span className="color-field">
              <input type="color" value={underlineColor || '#000000'} disabled={underline === 'none'} onChange={(e) => setUnderlineColor(e.target.value.toUpperCase())} />
              <button type="button" className="link-btn" disabled={underline === 'none'} onClick={() => setUnderlineColor('')}>
                Automatic
              </button>
            </span>
          </label>
          <fieldset className="dlg-fieldset span-3">
            <legend>Effects</legend>
            <div className="effects-grid">
              <label><input type="checkbox" checked={fx.strike} onChange={toggle('strike')} /> Strikethrough</label>
              <label><input type="checkbox" checked={fx.smallCaps} onChange={toggle('smallCaps')} /> Small caps</label>
              <label><input type="checkbox" checked={fx.doubleStrike} onChange={toggle('doubleStrike')} /> Double strikethrough</label>
              <label><input type="checkbox" checked={fx.allCaps} onChange={toggle('allCaps')} /> All caps</label>
              <label><input type="checkbox" checked={fx.superscript} onChange={toggle('superscript')} /> Superscript</label>
              <label><input type="checkbox" checked={fx.hidden} onChange={toggle('hidden')} /> Hidden</label>
              <label><input type="checkbox" checked={fx.subscript} onChange={toggle('subscript')} /> Subscript</label>
            </div>
          </fieldset>
        </div>
      ) : (
        <div className="dlg-grid advanced-grid">
          <fieldset className="dlg-fieldset">
            <legend>Character Spacing</legend>
            <label className="dlg-inline">
              Scale:
              <select value={scale} onChange={(e) => setScale(Number(e.target.value))}>
                {[200, 150, 100, 90, 80, 66, 50, 33].map((s) => (
                  <option key={s} value={s}>
                    {s}%
                  </option>
                ))}
              </select>
            </label>
            <label className="dlg-inline">
              Spacing:
              <select value={spacing === 0 ? 'normal' : spacing > 0 ? 'expanded' : 'condensed'} onChange={(e) => setSpacing(e.target.value === 'normal' ? 0 : e.target.value === 'expanded' ? Math.abs(spacing) || 1 : -(Math.abs(spacing) || 1))}>
                <option value="normal">Normal</option>
                <option value="expanded">Expanded</option>
                <option value="condensed">Condensed</option>
              </select>
              By:
              <input type="number" step={0.1} min={0} value={Math.abs(spacing)} onChange={(e) => setSpacing(Math.sign(spacing || 1) * Number(e.target.value))} /> pt
            </label>
            <label className="dlg-inline">
              Position:
              <select value={position === 0 ? 'normal' : position > 0 ? 'raised' : 'lowered'} onChange={(e) => setPosition(e.target.value === 'normal' ? 0 : e.target.value === 'raised' ? Math.abs(position) || 3 : -(Math.abs(position) || 3))}>
                <option value="normal">Normal</option>
                <option value="raised">Raised</option>
                <option value="lowered">Lowered</option>
              </select>
              By:
              <input type="number" step={0.5} min={0} value={Math.abs(position)} onChange={(e) => setPosition(Math.sign(position || 1) * Number(e.target.value))} /> pt
            </label>
            <label className="dlg-inline">
              <input type="checkbox" checked={kerning != null} onChange={(e) => setKerning(e.target.checked ? 14 : null)} /> Kerning for fonts:
              <input type="number" min={1} step={0.5} value={kerning ?? 14} disabled={kerning == null} onChange={(e) => setKerning(Number(e.target.value) || 1)} /> Points and above
            </label>
          </fieldset>
          <fieldset className="dlg-fieldset">
            <legend>OpenType Features</legend>
            <label className="dlg-inline">
              Ligatures:
              <select value={ligatures} onChange={(e) => setLigatures(e.target.value)}>
                <option value="none">None</option>
                <option value="standard">Standard Only</option>
                <option value="contextual">Standard and Contextual</option>
                <option value="historical">Historical and Discretionary</option>
                <option value="all">All</option>
              </select>
            </label>
            <label className="dlg-inline">
              Number spacing:
              <select value={numSpacing} onChange={(e) => setNumSpacing(e.target.value)}>
                <option value="default">Default</option>
                <option value="proportional">Proportional</option>
                <option value="tabular">Tabular</option>
              </select>
            </label>
            <label className="dlg-inline">
              Number forms:
              <select value={numForms} onChange={(e) => setNumForms(e.target.value)}>
                <option value="default">Default</option>
                <option value="lining">Lining</option>
                <option value="oldstyle">Old-style</option>
              </select>
            </label>
          </fieldset>
        </div>
      )}
      <fieldset className="dlg-fieldset">
        <legend>Preview</legend>
        <div className="font-preview">
          <span style={previewStyle}>{editor.state.selection.empty ? font : editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ').slice(0, 40) || font}</span>
        </div>
      </fieldset>
    </Modal>
  )
}
