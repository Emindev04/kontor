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

const heading = (level: 1 | 2 | 3 | 4 | 5 | 6): StyleDef => ({
  id: `h${level}`,
  label: `Heading ${level}`,
  isActive: (e) => e.isActive('heading', { level }),
  apply: (e) => e.chain().focus().setHeading({ level }).run(),
})

export const STYLES: StyleDef[] = [
  paragraphStyle(null, 'Normal'),
  paragraphStyle('noSpacing', 'No Spacing'),
  heading(1),
  heading(2),
  paragraphStyle('title', 'Title'),
  paragraphStyle('subtitle', 'Subtitle'),
  charStyle('subtleEmphasis', 'Subtle Emphasis'),
  charStyle('emphasis', 'Emphasis'),
  charStyle('intenseEmphasis', 'Intense Emphasis'),
  charStyle('strong', 'Strong'),
  paragraphStyle('quote', 'Quote'),
  paragraphStyle('intenseQuote', 'Intense Quote'),
  charStyle('subtleReference', 'Subtle Reference'),
  charStyle('intenseReference', 'Intense Reference'),
  charStyle('bookTitle', 'Book Title'),
  paragraphStyle('listParagraph', 'List Paragraph'),
  heading(3),
  heading(4),
  heading(5),
  heading(6),
  paragraphStyle('caption', 'Caption'),
]

const UNDERLINES: { id: UnderlineStyle; label: string }[] = [
  { id: 'single', label: 'Single' },
  { id: 'double', label: 'Double' },
  { id: 'thick', label: 'Thick' },
  { id: 'dotted', label: 'Dotted' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'wavy', label: 'Wave' },
]

const BORDERS: { id: string; label: string; sides: string | null }[] = [
  { id: 'b', label: 'Bottom Border', sides: 'b' },
  { id: 't', label: 'Top Border', sides: 't' },
  { id: 'l', label: 'Left Border', sides: 'l' },
  { id: 'r', label: 'Right Border', sides: 'r' },
  { id: 'none', label: 'No Border', sides: null },
  { id: 'all', label: 'All Borders', sides: 'tblr' },
  { id: 'outside', label: 'Outside Borders', sides: 'tblr' },
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
      title={s.label}
      onMouseDown={keepFocus}
      onClick={() => {
        s.apply(editor)
        close?.()
      }}
    >
      <span className={`style-preview style-${s.id} ps-${s.id}`}>AaBbCcDd</span>
      <span className="style-name">{s.label}</span>
    </button>
  )
  return (
    <div className="style-gallery">
      <div className="style-row">{visible.map((s) => item(s))}</div>
      <PopoverButton icon={ListTree} label="More styles" className="style-popup">
        {(close) => (
          <>
            <div className="style-grid">{list.map((s) => item(s, close))}</div>
            <div className="menu-sep" />
            <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), app.editStyle(null))}>
              <ListTree size={16} /> Create a Style
            </button>
            <button
              type="button"
              className="menu-item"
              onMouseDown={keepFocus}
              onClick={() => {
                editor.chain().focus().unsetAllMarks().setParagraph().updateAttributes('paragraph', { pStyle: null }).run()
                close()
              }}
            >
              <RemoveFormatting size={16} /> Clear Formatting
            </button>
            <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), app.setShowStylesPane(true))}>
              <ListTree size={16} /> Apply Styles… (Styles Pane)
            </button>
          </>
        )}
      </PopoverButton>
    </div>
  )
}

export function HomeTab({ editor, app }: TabProps) {
  const chain = () => editor.chain().focus()
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
    { label: 'Line Spacing Options…', onClick: () => app.openDialog('paragraph') },
    'separator',
    para.spaceBefore
      ? { label: 'Remove Space Before Paragraph', onClick: () => chain().setParagraphFormat({ spaceBefore: 0 }).run() }
      : { label: 'Add Space Before Paragraph', onClick: () => chain().setParagraphFormat({ spaceBefore: 12 }).run() },
    para.spaceAfter === 0
      ? { label: 'Add Space After Paragraph', onClick: () => chain().setParagraphFormat({ spaceAfter: null }).run() }
      : { label: 'Remove Space After Paragraph', onClick: () => chain().setParagraphFormat({ spaceAfter: 0 }).run() },
  ]

  const sortParagraphs = (dir: 1 | -1) => {
    const { from, to } = editor.state.selection
    const $from = editor.state.doc.resolve(from)
    const parent = $from.depth > 1 ? $from.node($from.depth - 1) : editor.state.doc
    const start = $from.depth > 1 ? $from.start($from.depth - 1) : 0
    const children: { node: import('@tiptap/pm/model').Node; pos: number }[] = []
    parent.forEach((node, offset) => {
      const pos = start + offset
      if (pos + node.nodeSize > from && pos < to) children.push({ node, pos })
    })
    if (children.length < 2) return
    const sorted = [...children].sort((a, b) => dir * a.node.textContent.localeCompare(b.node.textContent, 'en-US', { numeric: true, sensitivity: 'base' }))
    const range = { from: children[0].pos, to: children[children.length - 1].pos + children[children.length - 1].node.nodeSize }
    editor.chain().focus().command(({ tr }) => {
      tr.replaceWith(range.from, range.to, sorted.map((c) => c.node))
      return true
    }).run()
  }

  return (
    <>
      <RibbonGroup label="Clipboard" icon={ClipboardPaste} priority={2} onLauncher={() => app.setShowClipboardPane(!app.showClipboardPane)} launcherTitle="Clipboard pane">
        <SplitButton
          large
          icon={ClipboardPaste}
          label="Paste"
          title="Paste (Ctrl+V)"
          onClick={() => pasteFromClipboard(editor)}
          items={[
            { heading: 'Paste Options:' },
            { label: 'Keep Source Formatting (K)', onClick: () => pasteFromClipboard(editor, 'keep') },
            { label: 'Merge Formatting (M)', onClick: () => pasteFromClipboard(editor, 'merge') },
            { label: 'Keep Text Only (T)', onClick: () => pasteFromClipboard(editor, 'text') },
            'separator',
            { label: 'Paste Special…', onClick: () => app.openDialog('pasteSpecial') },
            { label: 'Set Default Paste…', onClick: () => app.openDialog('options') },
          ]}
        />
        <div className="col">
          <RibbonButton icon={Scissors} label="Cut" showLabel title="Cut (Ctrl+X)" onClick={() => clipboardCommand(editor, 'cut')} />
          <RibbonButton icon={Copy} label="Copy" showLabel title="Copy (Ctrl+C)" onClick={() => clipboardCommand(editor, 'copy')} />
          <RibbonButton
            icon={Paintbrush}
            label="Format Painter"
            showLabel
            title="Format Painter: click once, or double-click to keep it on (Esc stops)"
            active={app.painterActive}
            onClick={app.togglePainter}
            onDoubleClick={app.lockPainter}
          />
        </div>
      </RibbonGroup>

      <RibbonGroup label="Font" icon={ALargeSmall} priority={4} onLauncher={() => app.openDialog('font')} launcherTitle="Font (Ctrl+D)">
        <div className="col">
          <div className="row">
            <ComboBox
              title="Font"
              width={150}
              compactWidth={92}
              value={currentFont(editor)}
              options={FONTS}
              groups={[
                { heading: 'Theme Fonts', options: [fonts.heading, fonts.body].filter((f, i, a) => a.indexOf(f) === i) },
                { heading: 'All Fonts', options: FONTS },
              ]}
              renderOption={(f) => <span style={{ fontFamily: `'${f}'` }}>{f}</span>}
              onCommit={(f) => (f ? chain().setFontFamily(f).run() : chain().unsetFontFamily().run())}
            />
            <ComboBox title="Font Size" width={56} compactWidth={44} value={formatSize(size)} options={FONT_SIZES} onCommit={(v) => setFontSize(editor, parseSize(v))} />
            <RibbonButton icon={AArrowUp} label="Increase Font Size" title="Increase Font Size (Ctrl+Shift+>)" onClick={() => stepFontSize(editor, 1)} />
            <RibbonButton icon={AArrowDown} label="Decrease Font Size" title="Decrease Font Size (Ctrl+Shift+<)" onClick={() => stepFontSize(editor, -1)} />
            <MenuButton
              icon={Type}
              label="Change Case"
              title="Change Case (Shift+F3)"
              items={[
                { label: 'Sentence case.', onClick: () => changeCase(editor, 'sentence') },
                { label: 'lowercase', onClick: () => changeCase(editor, 'lower') },
                { label: 'UPPERCASE', onClick: () => changeCase(editor, 'upper') },
                { label: 'Capitalize Each Word', onClick: () => changeCase(editor, 'title') },
                { label: 'tOGGLE cASE', onClick: () => changeCase(editor, 'toggle') },
              ]}
            />
            <RibbonButton
              icon={RemoveFormatting}
              label="Clear All Formatting"
              onClick={() => chain().unsetAllMarks().setParagraph().updateAttributes('paragraph', { pStyle: null }).resetParagraphFormat().run()}
            />
          </div>
          <div className="row">
            <RibbonButton icon={Bold} label="Bold" title="Bold (Ctrl+B)" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()} />
            <RibbonButton icon={Italic} label="Italic" title="Italic (Ctrl+I)" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()} />
            <SplitButton
              icon={Underline}
              label="Underline"
              title="Underline (Ctrl+U)"
              active={editor.isActive('underline')}
              onClick={() => chain().toggleUnderline().run()}
              items={[
                ...UNDERLINES.map((u) => ({
                  label: u.label,
                  active: editor.isActive('underline') && (editor.getAttributes('underline').underlineStyle ?? 'single') === u.id,
                  onClick: () => chain().setUnderlineStyle(u.id, editor.getAttributes('underline').underlineColor ?? null).run(),
                })),
                'separator' as const,
                { heading: 'Underline Color' },
                ...['#000000', '#FF0000', '#0070C0', '#00B050', '#7030A0'].map((c) => ({
                  label: { '#000000': 'Automatic', '#FF0000': 'Red', '#0070C0': 'Blue', '#00B050': 'Green', '#7030A0': 'Purple' }[c]!,
                  preview: <span className="swatch swatch-inline" style={{ background: c }} />,
                  onClick: () => chain().setUnderlineStyle(editor.getAttributes('underline').underlineStyle ?? 'single', c === '#000000' ? null : c).run(),
                })),
              ]}
            />
            <RibbonButton icon={Strikethrough} label="Strikethrough" active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()} />
            <RibbonButton icon={Subscript} label="Subscript" title="Subscript (Ctrl+=)" active={editor.isActive('subscript')} onClick={() => chain().unsetSuperscript().toggleSubscript().run()} />
            <RibbonButton icon={Superscript} label="Superscript" title="Superscript (Ctrl+Shift++)" active={editor.isActive('superscript')} onClick={() => chain().unsetSubscript().toggleSuperscript().run()} />
            <span className="row-sep" />
            <MenuButton
              icon={Wand2}
              label="Text Effects and Typography"
              active={!!effect}
              items={[
                { label: 'No Effect', active: !effect, onClick: () => setEffect(null) },
                { label: 'Shadow', active: effect === 'shadow', onClick: () => setEffect('shadow') },
                { label: 'Outline', active: effect === 'outline', onClick: () => setEffect('outline') },
                { label: 'Emboss', active: effect === 'emboss', onClick: () => setEffect('emboss') },
                { label: 'Engrave', active: effect === 'engrave', onClick: () => setEffect('engrave') },
                'separator',
                { label: 'Small Caps', checked: !!editor.getAttributes('textStyle').smallCaps, onClick: () => chain().toggleSmallCaps().run() },
                { label: 'All Caps', checked: !!editor.getAttributes('textStyle').allCaps, onClick: () => chain().toggleAllCaps().run() },
              ]}
            />
            <ColorSplitButton icon={Highlighter} label="Text Highlight Color" color={app.highlightColor} onApply={() => chain().setHighlight({ color: app.highlightColor }).run()}>
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
            <ColorSplitButton icon={Baseline} label="Font Color" color={app.fontColor} onApply={() => chain().setColor(app.fontColor).run()}>
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

      <RibbonGroup label="Paragraph" icon={Pilcrow} priority={3} onLauncher={() => app.openDialog('paragraph')} launcherTitle="Paragraph Settings">
        <div className="col">
          <div className="row">
            <SplitButton
              icon={List}
              label="Bullets"
              active={editor.isActive('bulletList')}
              onClick={() => chain().toggleBulletList().run()}
              menuClassName="list-library"
            >
              {(close) => (
                <>
                  <div className="palette-heading">Bullet Library</div>
                  <div className="list-grid">
                    <button type="button" className="list-tile" onMouseDown={keepFocus} onClick={() => (editor.isActive('bulletList') && chain().toggleBulletList().run(), close())}>
                      None
                    </button>
                    {BULLET_STYLES.map((b) => (
                      <button key={b.id} type="button" className="list-tile" title={b.label} onMouseDown={keepFocus} onClick={() => (chain().setBulletStyle(b.id).run(), close())}>
                        <span className="list-symbol">{b.symbol}</span>
                        <span className="list-lines" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </SplitButton>
            <SplitButton
              icon={ListOrdered}
              label="Numbering"
              active={editor.isActive('orderedList')}
              onClick={() => chain().toggleOrderedList().run()}
              menuClassName="list-library"
            >
              {(close) => (
                <>
                  <div className="palette-heading">Numbering Library</div>
                  <div className="list-grid">
                    <button type="button" className="list-tile" onMouseDown={keepFocus} onClick={() => (editor.isActive('orderedList') && chain().toggleOrderedList().run(), close())}>
                      None
                    </button>
                    {NUMBER_STYLES.map((n) => (
                      <button key={n.id} type="button" className="list-tile" title={n.label} onMouseDown={keepFocus} onClick={() => (chain().setNumberStyle(n.id).run(), close())}>
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
                      const value = prompt('Set numbering value. Start at:', String(editor.getAttributes('orderedList').start ?? 1))
                      const n = Number(value)
                      if (value && Number.isInteger(n) && n >= 0) chain().setNumberingStart(n).run()
                    }}
                  >
                    Set Numbering Value…
                  </button>
                </>
              )}
            </SplitButton>
            <MenuButton
              icon={ListTree}
              label="Multilevel List"
              items={MULTILEVEL_STYLES.map((s) => ({
                label: s.label,
                detail: s.sample.join('  '),
                onClick: () => chain().setNumberStyle(s.id).run(),
              }))}
            />
            <span className="row-sep" />
            <RibbonButton icon={IndentDecrease} label="Decrease Indent" onClick={() => (inList ? chain().liftListItem('listItem').run() : chain().changeIndent(-1).run())} />
            <RibbonButton icon={IndentIncrease} label="Increase Indent" onClick={() => (inList ? chain().sinkListItem('listItem').run() : chain().changeIndent(1).run())} />
            <span className="row-sep" />
            <MenuButton
              icon={ArrowDownAZ}
              label="Sort"
              items={[
                { label: 'Sort Paragraphs A to Z', onClick: () => sortParagraphs(1) },
                { label: 'Sort Paragraphs Z to A', onClick: () => sortParagraphs(-1) },
              ]}
            />
            <RibbonButton icon={Pilcrow} label="Show/Hide ¶" title="Show/Hide formatting marks (Ctrl+*)" active={app.showMarks} onClick={() => app.setShowMarks(!app.showMarks)} />
          </div>
          <div className="row">
            <RibbonButton icon={AlignLeft} label="Align Left" title="Align Left (Ctrl+L)" active={align === 'left'} onClick={() => chain().setTextAlign('left').run()} />
            <RibbonButton icon={AlignCenter} label="Center" title="Center (Ctrl+E)" active={align === 'center'} onClick={() => chain().setTextAlign('center').run()} />
            <RibbonButton icon={AlignRight} label="Align Right" title="Align Right (Ctrl+R)" active={align === 'right'} onClick={() => chain().setTextAlign('right').run()} />
            <RibbonButton icon={AlignJustify} label="Justify" title="Justify (Ctrl+J)" active={align === 'justify'} onClick={() => chain().setTextAlign('justify').run()} />
            <RibbonButton icon={PilcrowRight} label="Left-to-Right Text Direction" className="rb-optional" active={para.dir !== 'rtl'} onClick={() => chain().setParagraphFormat({ dir: null }).run()} />
            <RibbonButton icon={PilcrowLeft} label="Right-to-Left Text Direction" className="rb-optional" active={para.dir === 'rtl'} onClick={() => chain().setParagraphFormat({ dir: 'rtl' }).run()} />
            <span className="row-sep" />
            <MenuButton icon={ArrowUpDown} label="Line and Paragraph Spacing" items={lineItems} />
            <ColorSplitButton icon={PaintBucket} label="Shading" color={(para.shading as string) ?? '#FFFFFF'} onApply={() => chain().setParagraphFormat({ shading: (para.shading as string) ?? '#D9D9D9' }).run()}>
              {(close) => (
                <FontColorPalette
                  autoLabel="No Color"
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
              label="Borders"
              items={[
                ...BORDERS.map((b) => ({
                  label: b.label,
                  active: b.sides ? para.borders === b.sides || (b.sides.length === 1 && ((para.borders as string) ?? '').includes(b.sides)) : !para.borders,
                  onClick: () => {
                    if (!b.sides || b.sides.length > 1) return void chain().setParagraphFormat({ borders: b.sides }).run()
                    const current = (para.borders as string) ?? ''
                    const next = current.includes(b.sides) ? current.replace(b.sides, '') : current + b.sides
                    chain().setParagraphFormat({ borders: next || null }).run()
                  },
                })),
                'separator',
                { label: 'Horizontal Line', onClick: () => chain().setHorizontalRule().run() },
                { label: 'Borders and Shading…', onClick: () => app.openDialog('bordersShading') },
              ]}
            />
          </div>
        </div>
      </RibbonGroup>

      <RibbonGroup label="Styles" icon={SwatchBook} priority={1} className="rg-shrink" onLauncher={() => app.setShowStylesPane(!app.showStylesPane)} launcherTitle="Styles (Alt+Ctrl+Shift+S)">
        <StyleGallery editor={editor} app={app} />
      </RibbonGroup>

      <RibbonGroup label="Editing" icon={Search} priority={0}>
        <div className="col">
          <SplitButton
            icon={Search}
            label="Find"
            showLabel
            title="Find (Ctrl+F)"
            onClick={() => app.openDialog('find')}
            items={[
              { label: 'Find', shortcut: 'Ctrl+F', onClick: () => app.openDialog('find') },
              { label: 'Advanced Find…', onClick: () => app.openDialog('replace') },
              { label: 'Go To…', shortcut: 'Ctrl+G', onClick: () => app.openDialog('goto') },
            ]}
          />
          <RibbonButton icon={Replace} label="Replace" showLabel title="Replace (Ctrl+H)" onClick={() => app.openDialog('replace')} />
          <MenuButton
            icon={MousePointer2}
            label="Select"
            showLabel
            items={[
              { label: 'Select All', shortcut: 'Ctrl+A', onClick: () => chain().selectAll().run() },
              { label: 'Select Paragraph', onClick: () => {
                const $f = editor.state.selection.$from
                chain().setTextSelection({ from: $f.start(), to: $f.end() }).run()
              } },
              'separator',
              { label: 'Selection Pane…', onClick: () => app.setShowSelectionPane(true) },
            ]}
          />
        </div>
      </RibbonGroup>
    </>
  )
}
