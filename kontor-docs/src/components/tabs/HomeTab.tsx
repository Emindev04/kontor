import {
  AArrowDown, AArrowUp, ALargeSmall, SwatchBook, AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowDownAZ, ArrowUpDown, Baseline, Bold, ClipboardPaste,
  Copy, Highlighter, IndentDecrease, IndentIncrease, Italic, List, ListOrdered, ListTree, MousePointer2, PaintBucket, Paintbrush,
  Pilcrow, PilcrowLeft, PilcrowRight, RemoveFormatting, Replace, Scissors, Search, SquareDashed, Strikethrough, Subscript, Superscript, Type, Underline, Wand2,
} from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { ColorSplitButton, ComboBox, MenuButton, PopoverButton, RibbonButton, RibbonGroup, SplitButton, cls, keepFocus, type MenuItem } from '../ui'
import { FontColorPalette, HighlightPalette } from '../palettes'
import {
  FONT_SIZES, changeCase, clipboardCommand, currentFont, currentFontSize, formatSize, parseSize, pasteFromClipboard, setFontSize,
  stepFontSize,
} from '../../editor/commands'
import { BULLET_STYLES, MULTILEVEL_STYLES, NUMBER_STYLES } from '../../editor/ListStyles'
import type { CharStyleId, ParagraphStyleId } from '../../editor/Styles'
import { allStyles, applyStyle, currentStyleId } from '../../editor/styleDefs'
import type { TextEffect, UnderlineStyle } from '../../editor/TextEffects'
import { themeFonts } from '../../pageSetup'
import type { TabProps } from './types'
import { t, tx } from '../../i18n'
import { customBullets } from '../dialogs/ListDialogs'
import { bulletCss } from '../../editor/customLists'
import { useFontList } from '../../editor/installedFonts'

export const FONTS = [
  'Arial', 'Arial Black', 'Book Antiqua', 'Calibri', 'Calibri Light', 'Cambria', 'Candara', 'Century Gothic', 'Comic Sans MS', 'Consolas',
  'Constantia', 'Corbel', 'Courier New', 'Franklin Gothic Medium', 'Garamond', 'Georgia', 'Helvetica', 'Impact', 'Lucida Console',
  'Lucida Sans Unicode', 'Palatino Linotype', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
]

export const LINE_SPACINGS = ['1.0', '1.15', '1.5', '2.0', '2.5', '3.0']

type StyleDef = {
  id: string
  label: string
  isActive: (e: Editor) => boolean
  apply: (e: Editor) => void
}

const paragraphStyle = (id: ParagraphStyleId | null, label: string): StyleDef => ({
  id: id ?? 'normal',
  label,
  isActive: (e) => e.isActive('paragraph') && (e.getAttributes('paragraph').pStyle ?? null) === id && !e.isActive('charStyle'),
  apply: (e) => e.chain().focus().setParagraphStyle(id).run(),
})

const charStyle = (id: CharStyleId, label: string): StyleDef => ({
  id,
  label,
  isActive: (e) => e.isActive('charStyle', { id }),
  apply: (e) => (e.isActive('charStyle', { id }) ? e.chain().focus().unsetCharStyle().run() : e.chain().focus().setCharStyle(id).run()),
})

const HEADING_LABELS = [tx('Heading 1'), tx('Heading 2'), tx('Heading 3'), tx('Heading 4'), tx('Heading 5'), tx('Heading 6')]

const heading = (level: 1 | 2 | 3 | 4 | 5 | 6): StyleDef => ({
  id: `h${level}`,
  label: HEADING_LABELS[level - 1],
  isActive: (e) => e.isActive('heading', { level }),
  apply: (e) => e.chain().focus().setHeading({ level }).run(),
})

export const STYLES: StyleDef[] = [
  paragraphStyle(null, tx('Normal')),
  paragraphStyle('noSpacing', tx('No Spacing')),
  heading(1),
  heading(2),
  paragraphStyle('title', tx('Title')),
  paragraphStyle('subtitle', tx('Subtitle')),
  charStyle('subtleEmphasis', tx('Subtle Emphasis')),
  charStyle('emphasis', tx('Emphasis')),
  charStyle('intenseEmphasis', tx('Intense Emphasis')),
  charStyle('strong', tx('Strong')),
  paragraphStyle('quote', tx('Quote')),
  paragraphStyle('intenseQuote', tx('Intense Quote')),
  charStyle('subtleReference', tx('Subtle Reference')),
  charStyle('intenseReference', tx('Intense Reference')),
  charStyle('bookTitle', tx('Book Title')),
  paragraphStyle('listParagraph', tx('List Paragraph')),
  heading(3),
  heading(4),
  heading(5),
  heading(6),
  paragraphStyle('caption', tx('Caption')),
]

const UNDERLINES: { id: UnderlineStyle; label: string }[] = [
  { id: 'single', label: tx('Single') },
  { id: 'double', label: tx('Double') },
  { id: 'thick', label: tx('Thick') },
  { id: 'dotted', label: tx('Dotted') },
  { id: 'dashed', label: tx('Dashed') },
  { id: 'wavy', label: tx('Wave') },
]

const BORDERS: { id: string; label: string; sides: string | null }[] = [
  { id: 'b', label: tx('Bottom Border'), sides: 'b' },
  { id: 't', label: tx('Top Border'), sides: 't' },
  { id: 'l', label: tx('Left Border'), sides: 'l' },
  { id: 'r', label: tx('Right Border'), sides: 'r' },
  { id: 'none', label: tx('No Border'), sides: null },
  { id: 'all', label: tx('All Borders'), sides: 'tblr' },
  { id: 'outside', label: tx('Outside Borders'), sides: 'tblr' },
]

function StyleGallery({ editor, app }: { editor: Editor; app: TabProps['app'] }) {
  // Built-in styles (from STYLES, for their gallery order) plus the document's own styles.
  const custom = allStyles(app.styleDefs).filter((s) => s.custom)
  const list: StyleDef[] = [
    ...STYLES,
    ...custom.map((c) => ({ id: c.id, label: c.name, isActive: (e: Editor) => currentStyleId(e) === c.id, apply: (e: Editor) => applyStyle(e, c) })),
  ]
  const visible = [...custom.length ? list.slice(0, 10) : list.slice(0, 12), ...(custom.length ? list.slice(STYLES.length, STYLES.length + 2) : [])]
  const item = (s: StyleDef, close?: () => void) => (
    <button
      key={s.id}
      type="button"
      className={cls('style-item', s.isActive(editor) && 'is-active')}
      title={t(s.label)}
      onMouseDown={keepFocus}
      onClick={() => {
        s.apply(editor)
        close?.()
      }}
    >
      <span className={`style-preview style-${s.id} ps-${s.id}`}>AaBbCcDd</span>
      <span className="style-name">{t(s.label)}</span>
    </button>
  )
  return (
    <div className="style-gallery">
      <div className="style-row">{visible.map((s) => item(s))}</div>
      <PopoverButton icon={ListTree} label={t('More styles')} className="style-popup">
        {(close) => (
          <>
            <div className="style-grid">{list.map((s) => item(s, close))}</div>
            <div className="menu-sep" />
            <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), app.editStyle(null))}>
              <ListTree size={16} /> {t('Create a Style')}</button>
            <button
              type="button"
              className="menu-item"
              onMouseDown={keepFocus}
              onClick={() => {
                editor.chain().focus().unsetAllMarks().setParagraph().updateAttributes('paragraph', { pStyle: null }).run()
                close()
              }}
            >
              <RemoveFormatting size={16} /> {t('Clear Formatting')}</button>
            <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), app.setShowStylesPane(true))}>
              <ListTree size={16} /> {t('Apply Styles… (Styles Pane)')}</button>
          </>
        )}
      </PopoverButton>
    </div>
  )
}

export function HomeTab({ editor, app }: TabProps) {
  const chain = () => editor.chain().focus()
  const fontList = useFontList(FONTS)
  const size = currentFontSize(editor)
  const inList = editor.isActive('listItem')
  const para = editor.isActive('heading') ? editor.getAttributes('heading') : editor.getAttributes('paragraph')
  const lineHeight = (para.lineHeight as string | null) ?? null
  const align = (['center', 'right', 'justify'] as const).find((a) => editor.isActive({ textAlign: a })) ?? 'left'
  const fonts = themeFonts(app.design)
  const effect = editor.getAttributes('textStyle').textEffect as TextEffect | undefined

  const setEffect = (value: TextEffect | null) => chain().setTextEffects({ textEffect: value }).run()

  const lineItems: MenuItem[] = [
    ...LINE_SPACINGS.map((lh) => ({ label: lh, active: parseFloat(lineHeight ?? '1.08') === parseFloat(lh), onClick: () => chain().setLineSpacing(lh).run() })),
    'separator',
    { label: t('Line Spacing Options…'), onClick: () => app.openDialog('paragraph') },
    'separator',
    para.spaceBefore
      ? { label: t('Remove Space Before Paragraph'), onClick: () => chain().setParagraphFormat({ spaceBefore: 0 }).run() }
      : { label: t('Add Space Before Paragraph'), onClick: () => chain().setParagraphFormat({ spaceBefore: 12 }).run() },
    para.spaceAfter === 0
      ? { label: t('Add Space After Paragraph'), onClick: () => chain().setParagraphFormat({ spaceAfter: null }).run() }
      : { label: t('Remove Space After Paragraph'), onClick: () => chain().setParagraphFormat({ spaceAfter: 0 }).run() },
  ]

  return (
    <>
      <RibbonGroup label={t('Clipboard')} icon={ClipboardPaste} priority={2} onLauncher={() => app.setShowClipboardPane(!app.showClipboardPane)} launcherTitle={t('Clipboard pane')}>
        <SplitButton
          large
          icon={ClipboardPaste}
          label={t('Paste')}
          title={t('Paste (Ctrl+V)')}
          onClick={() => pasteFromClipboard(editor)}
          items={[
            { heading: t('Paste Options:') },
            { label: t('Keep Source Formatting (K)'), onClick: () => pasteFromClipboard(editor, 'keep') },
            { label: t('Merge Formatting (M)'), onClick: () => pasteFromClipboard(editor, 'merge') },
            { label: t('Keep Text Only (T)'), onClick: () => pasteFromClipboard(editor, 'text') },
            'separator',
            { label: t('Paste Special…'), onClick: () => app.openDialog('pasteSpecial') },
            { label: t('Set Default Paste…'), onClick: () => app.openDialog('options') },
          ]}
        />
        <div className="col">
          <RibbonButton icon={Scissors} label={t('Cut')} showLabel title={t('Cut (Ctrl+X)')} onClick={() => clipboardCommand(editor, 'cut')} />
          <RibbonButton icon={Copy} label={t('Copy')} showLabel title={t('Copy (Ctrl+C)')} onClick={() => clipboardCommand(editor, 'copy')} />
          <RibbonButton
            icon={Paintbrush}
            label={t('Format Painter')}
            showLabel
            title={t('Format Painter: click once, or double-click to keep it on (Esc stops)')}
            active={app.painterActive}
            onClick={app.togglePainter}
            onDoubleClick={app.lockPainter}
          />
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('Font')} icon={ALargeSmall} priority={4} onLauncher={() => app.openDialog('font')} launcherTitle={t('Font (Ctrl+D)')}>
        <div className="col">
          <div className="row">
            <ComboBox
              title={t('Font')}
              width={150}
              compactWidth={92}
              value={currentFont(editor)}
              options={fontList}
              groups={[
                { heading: t('Theme Fonts'), options: [fonts.heading, fonts.body].filter((f, i, a) => a.indexOf(f) === i) },
                { heading: t('All Fonts'), options: fontList },
              ]}
              renderOption={(f) => <span style={{ fontFamily: `'${f}'` }}>{f}</span>}
              onCommit={(f) => (f ? chain().setFontFamily(f).run() : chain().unsetFontFamily().run())}
            />
            <ComboBox title={t('Font Size')} width={56} compactWidth={44} value={formatSize(size)} options={FONT_SIZES} onCommit={(v) => setFontSize(editor, parseSize(v))} />
            <RibbonButton icon={AArrowUp} label={t('Increase Font Size')} title={t('Increase Font Size (Ctrl+Shift+>)')} onClick={() => stepFontSize(editor, 1)} />
            <RibbonButton icon={AArrowDown} label={t('Decrease Font Size')} title={t('Decrease Font Size (Ctrl+Shift+<)')} onClick={() => stepFontSize(editor, -1)} />
            <MenuButton
              icon={Type}
              label={t('Change Case')}
              title={t('Change Case (Shift+F3)')}
              items={[
                { label: t('Sentence case.'), onClick: () => changeCase(editor, 'sentence') },
                { label: t('lowercase'), onClick: () => changeCase(editor, 'lower') },
                { label: t('UPPERCASE'), onClick: () => changeCase(editor, 'upper') },
                { label: t('Capitalize Each Word'), onClick: () => changeCase(editor, 'title') },
                { label: t('tOGGLE cASE'), onClick: () => changeCase(editor, 'toggle') },
              ]}
            />
            <RibbonButton
              icon={RemoveFormatting}
              label={t('Clear All Formatting')}
              onClick={() => chain().unsetAllMarks().setParagraph().updateAttributes('paragraph', { pStyle: null }).resetParagraphFormat().run()}
            />
          </div>
          <div className="row">
            <RibbonButton icon={Bold} label={t('Bold')} title={t('Bold (Ctrl+B)')} active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()} />
            <RibbonButton icon={Italic} label={t('Italic')} title={t('Italic (Ctrl+I)')} active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()} />
            <SplitButton
              icon={Underline}
              label={t('Underline')}
              title={t('Underline (Ctrl+U)')}
              active={editor.isActive('underline')}
              onClick={() => chain().toggleUnderline().run()}
              items={[
                ...UNDERLINES.map((u) => ({
                  label: t(u.label),
                  active: editor.isActive('underline') && (editor.getAttributes('underline').underlineStyle ?? 'single') === u.id,
                  onClick: () => chain().setUnderlineStyle(u.id, editor.getAttributes('underline').underlineColor ?? null).run(),
                })),
                'separator' as const,
                { heading: t('Underline Color') },
                ...['#000000', '#FF0000', '#0070C0', '#00B050', '#7030A0'].map((c) => ({
                  label: { '#000000': t('Automatic'), '#FF0000': t('Red'), '#0070C0': t('Blue'), '#00B050': t('Green'), '#7030A0': t('Purple') }[c]!,
                  preview: <span className="swatch swatch-inline" style={{ background: c }} />,
                  onClick: () => chain().setUnderlineStyle(editor.getAttributes('underline').underlineStyle ?? 'single', c === '#000000' ? null : c).run(),
                })),
              ]}
            />
            <RibbonButton icon={Strikethrough} label={t('Strikethrough')} active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()} />
            <RibbonButton icon={Subscript} label={t('Subscript')} title={t('Subscript (Ctrl+=)')} active={editor.isActive('subscript')} onClick={() => chain().unsetSuperscript().toggleSubscript().run()} />
            <RibbonButton icon={Superscript} label={t('Superscript')} title={t('Superscript (Ctrl+Shift++)')} active={editor.isActive('superscript')} onClick={() => chain().unsetSubscript().toggleSuperscript().run()} />
            <span className="row-sep" />
            <MenuButton
              icon={Wand2}
              label={t('Text Effects and Typography')}
              active={!!effect}
              items={[
                { label: t('No Effect'), active: !effect, onClick: () => chain().setTextEffects({ textEffect: null, glow: null, reflection: null, gradient: null }).run() },
                { label: t('Shadow'), active: effect === 'shadow', onClick: () => setEffect('shadow') },
                { label: t('Outline'), active: effect === 'outline', onClick: () => setEffect('outline') },
                { label: t('Emboss'), active: effect === 'emboss', onClick: () => setEffect('emboss') },
                { label: t('Engrave'), active: effect === 'engrave', onClick: () => setEffect('engrave') },
                'separator',
                { label: t('Small Caps'), checked: !!editor.getAttributes('textStyle').smallCaps, onClick: () => chain().toggleSmallCaps().run() },
                { label: t('All Caps'), checked: !!editor.getAttributes('textStyle').allCaps, onClick: () => chain().toggleAllCaps().run() },
                'separator',
                { label: t('Glow'), checked: !!editor.getAttributes('textStyle').glow, onClick: () => chain().setTextEffects({ glow: editor.getAttributes('textStyle').glow ? null : '#FFC000' }).run() },
                { label: t('Reflection'), checked: !!editor.getAttributes('textStyle').reflection, onClick: () => chain().setTextEffects({ reflection: editor.getAttributes('textStyle').reflection ? null : true }).run() },
                { label: t('Gradient fill'), checked: !!editor.getAttributes('textStyle').gradient, onClick: () => chain().setTextEffects({ gradient: editor.getAttributes('textStyle').gradient ? null : '#4472C4,#ED7D31' }).run() },
                { label: t('More Text Effects…'), onClick: () => app.openDialog('textEffects') },
              ]}
            />
            <ColorSplitButton icon={Highlighter} label={t('Text Highlight Color')} color={app.highlightColor} onApply={() => chain().setHighlight({ color: app.highlightColor }).run()}>
              {(close) => (
                <HighlightPalette
                  onPick={(c) => {
                    app.setHighlightColor(c)
                    chain().setHighlight({ color: c }).run()
                    close()
                  }}
                  onNone={() => {
                    chain().unsetHighlight().run()
                    close()
                  }}
                />
              )}
            </ColorSplitButton>
            <ColorSplitButton icon={Baseline} label={t('Font Color')} color={app.fontColor} onApply={() => chain().setColor(app.fontColor).run()}>
              {(close) => (
                <FontColorPalette
                  onPick={(c) => {
                    app.setFontColor(c)
                    chain().setColor(c).run()
                    close()
                  }}
                  onAuto={() => {
                    chain().unsetColor().run()
                    close()
                  }}
                />
              )}
            </ColorSplitButton>
          </div>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('Paragraph')} icon={Pilcrow} priority={3} onLauncher={() => app.openDialog('paragraph')} launcherTitle={t('Paragraph Settings')}>
        <div className="col">
          <div className="row">
            <SplitButton
              icon={List}
              label={t('Bullets')}
              active={editor.isActive('bulletList')}
              onClick={() => chain().toggleBulletList().run()}
              menuClassName="list-library"
            >
              {(close) => (
                <>
                  <div className="palette-heading">{t('Bullet Library')}</div>
                  <div className="list-grid">
                    <button type="button" className="list-tile" onMouseDown={keepFocus} onClick={() => (editor.isActive('bulletList') && chain().toggleBulletList().run(), close())}>
                      {t('None')}</button>
                    {BULLET_STYLES.map((b) => (
                      <button key={b.id} type="button" className="list-tile" title={t(b.label)} onMouseDown={keepFocus} onClick={() => (chain().setBulletStyle(b.id).run(), close())}>
                        <span className="list-symbol">{b.symbol}</span>
                        <span className="list-lines" />
                      </button>
                    ))}
                  </div>
                  {customBullets().length > 0 && (
                    <>
                      <div className="palette-heading">{t('Recently Defined Bullets')}</div>
                      <div className="list-grid">
                        {customBullets().map((style) => (
                          <button key={style} type="button" className="list-tile" onMouseDown={keepFocus} onClick={() => (chain().setBulletStyle(style).run(), close())}>
                            {style.startsWith('sym:') ? <span className="list-symbol">{style.slice(4)}</span> : <ul className="list-picture" style={{ cssText: bulletCss(style) } as unknown as React.CSSProperties}><li /></ul>}
                            <span className="list-lines" />
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <div className="menu-sep" />
                  <button
                    type="button"
                    className="menu-item"
                    onMouseDown={keepFocus}
                    onClick={() => {
                      close()
                      app.openDialog('defineBullet')
                    }}
                  >
                    {t('Define New Bullet…')}
                  </button>
                </>
              )}
            </SplitButton>
            <SplitButton
              icon={ListOrdered}
              label={t('Numbering')}
              active={editor.isActive('orderedList')}
              onClick={() => chain().toggleOrderedList().run()}
              menuClassName="list-library"
            >
              {(close) => (
                <>
                  <div className="palette-heading">{t('Numbering Library')}</div>
                  <div className="list-grid">
                    <button type="button" className="list-tile" onMouseDown={keepFocus} onClick={() => (editor.isActive('orderedList') && chain().toggleOrderedList().run(), close())}>
                      {t('None')}</button>
                    {NUMBER_STYLES.map((n) => (
                      <button key={n.id} type="button" className="list-tile" title={t(n.label)} onMouseDown={keepFocus} onClick={() => (chain().setNumberStyle(n.id).run(), close())}>
                        {[0, 1, 2].map((i) => (
                          <span key={i} className="list-num-line">
                            {n.sample.replace(/1|a|A|I|i/, (m) => ({ '1': ['1', '2', '3'], a: ['a', 'b', 'c'], A: ['A', 'B', 'C'], I: ['I', 'II', 'III'], i: ['i', 'ii', 'iii'] })[m]![i])}
                            <span className="list-lines" />
                          </span>
                        ))}
                      </button>
                    ))}
                  </div>
                  <div className="menu-sep" />
                  <button
                    type="button"
                    className="menu-item"
                    disabled={!editor.isActive('orderedList')}
                    onMouseDown={keepFocus}
                    onClick={() => {
                      close()
                      const value = prompt(t('Set numbering value. Start at:'), String(editor.getAttributes('orderedList').start ?? 1))
                      const n = Number(value)
                      if (value && Number.isInteger(n) && n >= 0) chain().setNumberingStart(n).run()
                    }}
                  >
                    {t('Set Numbering Value…')}</button>
                </>
              )}
            </SplitButton>
            <MenuButton
              icon={ListTree}
              label={t('Multilevel List')}
              items={[
                ...MULTILEVEL_STYLES.map((s): MenuItem => ({
                  label: t(s.label),
                  detail: s.sample.join('  '),
                  onClick: () => chain().setNumberStyle(s.id).run(),
                })),
                'separator',
                { label: t('Define New Multilevel List…'), onClick: () => app.openDialog('defineMultilevel') },
              ]}
            />
            <span className="row-sep" />
            <RibbonButton icon={IndentDecrease} label={t('Decrease Indent')} onClick={() => (inList ? chain().liftListItem('listItem').run() : chain().changeIndent(-1).run())} />
            <RibbonButton icon={IndentIncrease} label={t('Increase Indent')} onClick={() => (inList ? chain().sinkListItem('listItem').run() : chain().changeIndent(1).run())} />
            <span className="row-sep" />
            <RibbonButton icon={ArrowDownAZ} label={t('Sort')} title={t('Sort Text: alphabetize the selected text or sort numerical data')} onClick={() => app.openDialog('sortText')} />
            <RibbonButton icon={Pilcrow} label={t('Show/Hide ¶')} title={t('Show/Hide formatting marks (Ctrl+*)')} active={app.showMarks} onClick={() => app.setShowMarks(!app.showMarks)} />
          </div>
          <div className="row">
            <RibbonButton icon={AlignLeft} label={t('Align Left')} title={t('Align Left (Ctrl+L)')} active={align === 'left'} onClick={() => chain().setTextAlign('left').run()} />
            <RibbonButton icon={AlignCenter} label={t('Center')} title={t('Center (Ctrl+E)')} active={align === 'center'} onClick={() => chain().setTextAlign('center').run()} />
            <RibbonButton icon={AlignRight} label={t('Align Right')} title={t('Align Right (Ctrl+R)')} active={align === 'right'} onClick={() => chain().setTextAlign('right').run()} />
            <RibbonButton icon={AlignJustify} label={t('Justify')} title={t('Justify (Ctrl+J)')} active={align === 'justify'} onClick={() => chain().setTextAlign('justify').run()} />
            <RibbonButton icon={PilcrowRight} label={t('Left-to-Right Text Direction')} className="rb-optional" active={para.dir !== 'rtl'} onClick={() => chain().setParagraphFormat({ dir: null }).run()} />
            <RibbonButton icon={PilcrowLeft} label={t('Right-to-Left Text Direction')} className="rb-optional" active={para.dir === 'rtl'} onClick={() => chain().setParagraphFormat({ dir: 'rtl' }).run()} />
            <span className="row-sep" />
            <MenuButton icon={ArrowUpDown} label={t('Line and Paragraph Spacing')} items={lineItems} />
            <ColorSplitButton icon={PaintBucket} label={t('Shading')} color={(para.shading as string) ?? '#FFFFFF'} onApply={() => chain().setParagraphFormat({ shading: (para.shading as string) ?? '#D9D9D9' }).run()}>
              {(close) => (
                <FontColorPalette
                  autoLabel={t('No Color')}
                  onPick={(c) => {
                    chain().setParagraphFormat({ shading: c }).run()
                    close()
                  }}
                  onAuto={() => {
                    chain().setParagraphFormat({ shading: null }).run()
                    close()
                  }}
                />
              )}
            </ColorSplitButton>
            <MenuButton
              icon={SquareDashed}
              label={t('Borders')}
              items={[
                ...BORDERS.map((b) => ({
                  label: t(b.label),
                  active: b.sides ? para.borders === b.sides || (b.sides.length === 1 && ((para.borders as string) ?? '').includes(b.sides)) : !para.borders,
                  onClick: () => {
                    if (!b.sides || b.sides.length > 1) return void chain().setParagraphFormat({ borders: b.sides }).run()
                    const current = (para.borders as string) ?? ''
                    const next = current.includes(b.sides) ? current.replace(b.sides, '') : current + b.sides
                    chain().setParagraphFormat({ borders: next || null }).run()
                  },
                })),
                'separator',
                { label: t('Horizontal Line'), onClick: () => chain().setHorizontalRule().run() },
                { label: t('Borders and Shading…'), onClick: () => app.openDialog('bordersShading') },
              ]}
            />
          </div>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('Styles')} icon={SwatchBook} priority={1} className="rg-shrink" onLauncher={() => app.setShowStylesPane(!app.showStylesPane)} launcherTitle={t('Styles (Alt+Ctrl+Shift+S)')}>
        <StyleGallery editor={editor} app={app} />
      </RibbonGroup>

      <RibbonGroup label={t('Editing')} icon={Search} priority={0}>
        <div className="col">
          <SplitButton
            icon={Search}
            label={t('Find')}
            showLabel
            title={t('Find (Ctrl+F)')}
            onClick={() => app.openDialog('find')}
            items={[
              { label: t('Find'), shortcut: 'Ctrl+F', onClick: () => app.openDialog('find') },
              { label: t('Advanced Find…'), onClick: () => app.openDialog('replace') },
              { label: t('Go To…'), shortcut: 'Ctrl+G', onClick: () => app.openDialog('goto') },
            ]}
          />
          <RibbonButton icon={Replace} label={t('Replace')} showLabel title={t('Replace (Ctrl+H)')} onClick={() => app.openDialog('replace')} />
          <MenuButton
            icon={MousePointer2}
            label={t('Select')}
            showLabel
            items={[
              { label: t('Select All'), shortcut: 'Ctrl+A', onClick: () => chain().selectAll().run() },
              { label: t('Select Paragraph'), onClick: () => {
                const $f = editor.state.selection.$from
                chain().setTextSelection({ from: $f.start(), to: $f.end() }).run()
              } },
              { label: t('Select Text with Similar Formatting'), onClick: () => chain().selectSimilarFormatting().run() },
              'separator',
              { label: t('Selection Pane…'), onClick: () => app.setShowSelectionPane(true) },
            ]}
          />
        </div>
      </RibbonGroup>
    </>
  )
}
