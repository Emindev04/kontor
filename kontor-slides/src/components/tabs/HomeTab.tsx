import {
  AArrowDown,
  AArrowUp,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  CaseSensitive,
  ClipboardPaste,
  Columns2,
  Copy,
  Eraser,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListOrdered,
  Paintbrush,
  Replace,
  RotateCcw,
  Scissors,
  Search,
  MousePointer2,
  Strikethrough,
  Subscript,
  Superscript,
  TextCursorInput,
  Type,
  Underline,
  FolderPlus,
  ArrowDownUp,
  Shapes,
  Layers,
  Space,
  Heading,
  Network,
  AlignHorizontalSpaceAround,
} from 'lucide-react'
import { DIAGRAM_LAYOUTS, createDiagram, nodesFromParagraphs } from '../../model/diagram'
import type { DiagramLayout } from '../../model/types'
import { useState } from 'react'
import type { ShapeElement } from '../../model/types'
import { BULLET_CHARS, NUMBER_SCHEMES, type CaseMode } from '../../model/richtext'
import { FONT_LIST, fontStack, getTheme } from '../../model/themes'
import { STYLE_DEFS } from '../../model/layouts'
import { resolveColor } from '../../model/color'
import { commit, currentSlide, store, updateSlide, useStore } from '../../store/store'
import * as A from '../../store/actions'
import * as T from '../../editor/textCommands'
import { useEditorVersion } from '../../editor/activeEditor'
import { pickFormat } from '../../editor/formatPainter'
import { styleKey } from '../../render/context'
import { ColorPalette, HighlightPalette } from '../palettes'
import { ColorSplitButton, ComboBox, MenuButton, PopoverButton, RibbonButton, RibbonGroup, SplitMenuButton, keepFocus, cls, type MenuItem } from '../ui'
import { FillButtons, LayoutButton, NewSlideButton, QuickStylesGallery, ShapeGallery, arrangeItems, startShapeTool, useThemeColors } from './common'
import type { TabProps } from './types'

export function pasteFromSystem() {
  if (A.getClipboard()) {
    A.pasteClipboard()
    return
  }
  navigator.clipboard
    ?.readText()
    .then((text) => {
      if (!text) return
      if (store.get().editingId) T.insertText(text)
      else window.dispatchEvent(new CustomEvent('kontor:paste-text', { detail: text }))
    })
    .catch(() => undefined)
}

function useTextState() {
  useEditorVersion()
  const selection = useStore((s) => s.selection)
  useStore((s) => s.pres)
  const has = T.hasTextTarget()
  return { has, selection }
}

/** Shape whose default text style drives the font and size boxes. */
function firstTextShape(): ShapeElement | undefined {
  return A.selectedTextShapes()[0]
}

function effectiveBullet(): string | null {
  const raw = T.paraValue('bullet')
  if (raw === 'none') return null
  if (raw) return raw
  const el = firstTextShape()
  if (!el) return null
  const def = STYLE_DEFS[styleKey(el)]
  return def.bullets ? getTheme(store.get().pres.themeId).bulletChar : null
}

export function FontGroup({ ui }: TabProps) {
  const { has } = useTextState()
  const colors = useThemeColors()
  const pres = useStore((s) => s.pres)
  const theme = getTheme(pres.themeId)
  const fonts = pres.fonts ?? theme.fonts
  const [fontColor, setFontColor] = useState('#FF0000')
  const [hl, setHl] = useState('#FFFF00')
  const el = firstTextShape()
  const def = el ? STYLE_DEFS[styleKey(el)] : null
  const themeFont = def ? (def.font === 'major' ? fonts.major : fonts.minor) : fonts.minor
  const family = T.textStyleValue('fontFamily') ?? themeFont
  const size = has ? T.currentFontSize() : 18
  const HEAD = `${fonts.major} (Headings)`
  const BODY = `${fonts.minor} (Body)`
  return (
    <RibbonGroup label="Font" onLauncher={() => ui.openDialog('font')} launcherTitle="Font (Ctrl+T)">
      <div className="col">
        <div className="row">
          <ComboBox
            value={has ? family : ''}
            width={150}
            title="Font"
            disabled={!has}
            options={[{ heading: 'Theme Fonts' }, HEAD, BODY, { heading: 'All Fonts' }, ...FONT_LIST]}
            renderOption={(o) => <span style={{ fontFamily: fontStack(o.replace(/ \((Headings|Body)\)$/, '')) }}>{o}</span>}
            onCommit={(v) => {
              const name = v === HEAD ? fonts.major : v === BODY ? fonts.minor : v
              if (name) T.setTextStyle({ fontFamily: name === themeFont ? null : name })
            }}
          />
          <ComboBox
            value={has ? String(size) : ''}
            width={58}
            title="Font Size"
            disabled={!has}
            options={T.FONT_SIZES.map(String)}
            onCommit={(v) => {
              const n = parseFloat(v.replace(',', '.'))
              if (n > 0 && n <= 4000) T.setTextStyle({ fontSize: Math.round(n * 2) / 2 })
            }}
          />
          <RibbonButton icon={AArrowUp} label="Increase Font Size" title="Increase Font Size (Ctrl+Shift+>)" disabled={!has} onClick={() => T.stepFontSize(1)} />
          <RibbonButton icon={AArrowDown} label="Decrease Font Size" title="Decrease Font Size (Ctrl+Shift+<)" disabled={!has} onClick={() => T.stepFontSize(-1)} />
          <span className="row-sep" />
          <RibbonButton icon={Eraser} label="Clear All Formatting" disabled={!has} onClick={T.clearFormatting} />
        </div>
        <div className="row">
          <RibbonButton icon={Bold} label="Bold" title="Bold (Ctrl+B)" active={has && T.isMarkActive('bold')} disabled={!has} onClick={() => T.toggleMark('bold')} />
          <RibbonButton icon={Italic} label="Italic" title="Italic (Ctrl+I)" active={has && T.isMarkActive('italic')} disabled={!has} onClick={() => T.toggleMark('italic')} />
          <RibbonButton icon={Underline} label="Underline" title="Underline (Ctrl+U)" active={has && T.isMarkActive('underline')} disabled={!has} onClick={() => T.toggleMark('underline')} />
          <RibbonButton
            iconNode={<span className="icon-text icon-shadow">S</span>}
            label="Text Shadow"
            active={has && !!T.textStyleValue('shadow')}
            disabled={!has}
            onClick={() => T.setTextStyle({ shadow: T.textStyleValue('shadow') ? null : true })}
          />
          <RibbonButton icon={Strikethrough} label="Strikethrough" active={has && T.isMarkActive('strike')} disabled={!has} onClick={() => T.toggleMark('strike')} />
          <MenuButton
            icon={Space}
            label="Character Spacing"
            disabled={!has}
            items={[
              ...(
                [
                  ['Very Tight', -3],
                  ['Tight', -1.5],
                  ['Normal', 0],
                  ['Loose', 3],
                  ['Very Loose', 6],
                ] as const
              ).map(([label, v]) => ({ label, active: (T.textStyleValue('letterSpacing') ?? 0) === v, onClick: () => T.setTextStyle({ letterSpacing: v || null }) })),
              'separator',
              { label: 'More Spacing…', onClick: () => ui.openDialog('font') },
            ]}
          />
          <MenuButton
            icon={CaseSensitive}
            label="Change Case"
            disabled={!has}
            items={(
              [
                ['sentence', 'Sentence case.'],
                ['lower', 'lowercase'],
                ['upper', 'UPPERCASE'],
                ['title', 'Capitalize Each Word'],
                ['toggle', 'tOGGLE cASE'],
              ] as [CaseMode, string][]
            ).map(([mode, label]) => ({ label, onClick: () => T.changeCase(mode) }))}
          />
          <ColorSplitButton icon={Highlighter} label="Text Highlight Color" color={hl} disabled={!has} onApply={() => T.setHighlight(hl)}>
            {(close) => (
              <HighlightPalette
                onPick={(c) => {
                  close()
                  setHl(c)
                  T.setHighlight(c)
                }}
                onNone={() => {
                  close()
                  T.setHighlight(null)
                }}
              />
            )}
          </ColorSplitButton>
          <ColorSplitButton icon={Baseline} label="Font Color" color={resolveColor(fontColor, colors)} disabled={!has} onApply={() => T.setTextStyle({ color: fontColor })}>
            {(close) => (
              <ColorPalette
                colors={colors}
                auto={{ label: 'Automatic', color: '#000', onClick: () => (close(), T.setTextStyle({ color: null })) }}
                onPick={(c) => {
                  close()
                  setFontColor(c)
                  T.setTextStyle({ color: c })
                }}
              />
            )}
          </ColorSplitButton>
        </div>
      </div>
    </RibbonGroup>
  )
}

/** Convert to Diagram: the bullet text of the selected text box becomes a diagram in its place. */
function convertToDiagram(layout: DiagramLayout) {
  const el = A.selectedTextShapes()[0]
  if (!el?.text) return
  A.exitEditing()
  const nodes = nodesFromParagraphs(el.text.doc.content.map((p) => ({ text: (p.content ?? []).map((n) => (n.type === 'text' ? n.text : ' ')).join(''), level: p.attrs?.level ?? 0 })))
  if (!nodes.length) return
  const d = { ...createDiagram(layout, { x: el.x, y: el.y, w: el.w, h: el.h }, el.id + 'd', `Diagram ${currentSlide().elements.length}`), nodes }
  const sid = store.get().slideId
  commit((p) => updateSlide(p, sid, (sl) => ({ ...sl, elements: sl.elements.map((e) => (e.id === el.id ? d : e)) })), { selection: [d.id], tab: 'diagramDesign' })
}

export function ParagraphGroup({ ui }: TabProps) {
  const { has } = useTextState()
  const bullet = has ? effectiveBullet() : null
  const align = has ? (T.paraValue('align') ?? null) : null
  const el = firstTextShape()
  const defAlign = el ? STYLE_DEFS[styleKey(el)].align : 'left'
  const effAlign = align ?? (defAlign === 'title' ? getTheme(store.get().pres.themeId).titleAlign : defAlign)
  const lh = T.paraValue('lineHeight') ?? (el ? STYLE_DEFS[styleKey(el)].lineHeight : 1)
  const setText = (patch: Partial<NonNullable<ShapeElement['text']>>) => A.updateSelected((e) => (e.type === 'shape' && e.text ? { ...e, text: { ...e.text, ...patch } } : e))
  return (
    <RibbonGroup label="Paragraph" onLauncher={() => ui.openDialog('paragraph')} launcherTitle="Paragraph">
      <div className="col">
        <div className="row">
          <SplitMenuButton
            icon={List}
            label="Bullets"
            active={!!bullet && !bullet.startsWith('num:')}
            disabled={!has}
            onClick={() => T.setPara({ bullet: bullet && !bullet.startsWith('num:') ? 'none' : '•' })}
            custom
            items={(close: () => void) => (
              <div className="bullet-gallery">
                <button type="button" className="bullet-item" onMouseDown={keepFocus} onClick={() => (close(), T.setPara({ bullet: 'none' }))}>
                  None
                </button>
                {BULLET_CHARS.map((b) => (
                  <button key={b.char} type="button" className={cls('bullet-item', bullet === b.char && 'is-active')} title={b.label} onMouseDown={keepFocus} onClick={() => (close(), T.setPara({ bullet: b.char }))}>
                    <span>{b.char}</span>
                    <span>{b.char}</span>
                    <span>{b.char}</span>
                  </button>
                ))}
                <button type="button" className="bullet-more" onMouseDown={keepFocus} onClick={() => (close(), ui.openDialog('bullets'))}>
                  Bullets and Numbering…
                </button>
              </div>
            )}
          />
          <SplitMenuButton
            icon={ListOrdered}
            label="Numbering"
            active={!!bullet?.startsWith('num:')}
            disabled={!has}
            onClick={() => T.setPara({ bullet: bullet?.startsWith('num:') ? 'none' : 'num:arabicPeriod' })}
            custom
            items={(close: () => void) => (
              <div className="bullet-gallery">
                <button type="button" className="bullet-item" onMouseDown={keepFocus} onClick={() => (close(), T.setPara({ bullet: 'none' }))}>
                  None
                </button>
                {NUMBER_SCHEMES.map((n) => (
                  <button key={n.id} type="button" className={cls('bullet-item', bullet === `num:${n.id}` && 'is-active')} title={n.label} onMouseDown={keepFocus} onClick={() => (close(), T.setPara({ bullet: `num:${n.id}` }))}>
                    <span>{n.sample(1)}</span>
                    <span>{n.sample(2)}</span>
                    <span>{n.sample(3)}</span>
                  </button>
                ))}
                <button type="button" className="bullet-more" onMouseDown={keepFocus} onClick={() => (close(), ui.openDialog('bullets'))}>
                  Bullets and Numbering…
                </button>
              </div>
            )}
          />
          <RibbonButton icon={IndentDecrease} label="Decrease List Level" title="Decrease List Level (Shift+Tab)" disabled={!has} onClick={() => T.changeLevel(-1)} />
          <RibbonButton icon={IndentIncrease} label="Increase List Level" title="Increase List Level (Tab)" disabled={!has} onClick={() => T.changeLevel(1)} />
          <MenuButton
            icon={ArrowDownUp}
            label="Line Spacing"
            disabled={!has}
            items={[
              ...[1, 1.5, 2, 2.5, 3].map((v) => ({ label: v.toFixed(1), active: Math.abs(lh - v) < 0.01, onClick: () => T.setPara({ lineHeight: v }) })),
              'separator' as const,
              { label: 'Line Spacing Options…', onClick: () => ui.openDialog('paragraph') },
            ]}
          />
        </div>
        <div className="row">
          <RibbonButton icon={AlignLeft} label="Align Left" title="Align Left (Ctrl+L)" active={has && effAlign === 'left'} disabled={!has} onClick={() => T.setPara({ align: 'left' })} />
          <RibbonButton icon={AlignCenter} label="Center" title="Center (Ctrl+E)" active={has && effAlign === 'center'} disabled={!has} onClick={() => T.setPara({ align: 'center' })} />
          <RibbonButton icon={AlignRight} label="Align Right" title="Align Right (Ctrl+R)" active={has && effAlign === 'right'} disabled={!has} onClick={() => T.setPara({ align: 'right' })} />
          <RibbonButton icon={AlignJustify} label="Justify" title="Justify (Ctrl+J)" active={has && effAlign === 'justify'} disabled={!has} onClick={() => T.setPara({ align: 'justify' })} />
          <RibbonButton icon={AlignHorizontalSpaceAround} label="Distributed" title="Distributed (Ctrl+Shift+J): spread the text evenly across the line" active={has && effAlign === 'distributed'} disabled={!has} onClick={() => T.setPara({ align: 'distributed' })} />
          <span className="row-sep" />
          <MenuButton
            icon={Columns2}
            label="Add or Remove Columns"
            disabled={!has}
            items={[
              ...[1, 2, 3].map((n) => ({ label: ['One Column', 'Two Columns', 'Three Columns'][n - 1], active: (el?.text?.columns ?? 1) === n, onClick: () => setText({ columns: n }) })),
              'separator' as const,
              { label: 'More Columns…', onClick: () => ui.openDialog('columns') },
            ]}
          />
          <MenuButton
            icon={Type}
            label="Text Direction"
            disabled={!has}
            items={[
              { label: 'Horizontal', active: !el?.text?.vert || el.text.vert === 'horz', onClick: () => setText({ vert: 'horz' }) },
              { label: 'Rotate all text 90°', active: el?.text?.vert === 'vert', onClick: () => setText({ vert: 'vert' }) },
              { label: 'Rotate all text 270°', active: el?.text?.vert === 'vert270', onClick: () => setText({ vert: 'vert270' }) },
              { label: 'Stacked', active: el?.text?.vert === 'stacked', onClick: () => setText({ vert: 'stacked' }) },
            ]}
          />
          <MenuButton
            icon={TextCursorInput}
            label="Align Text"
            disabled={!has}
            items={(['top', 'middle', 'bottom'] as const).map((a) => ({ label: a[0].toUpperCase() + a.slice(1), active: el?.text?.anchor === a, onClick: () => setText({ anchor: a }) }))}
          />
          <MenuButton icon={Network} label="Convert to Diagram" disabled={!has} items={DIAGRAM_LAYOUTS.map((l) => ({ label: l.label, onClick: () => convertToDiagram(l.id) }))} />
        </div>
      </div>
    </RibbonGroup>
  )
}

export function DrawingGroup({ ui }: TabProps) {
  const n = useStore((s) => s.selection.length)
  return (
    <RibbonGroup label="Drawing" onLauncher={() => ui.openPane('formatShape')} launcherTitle="Format Shape">
      <PopoverButton icon={Shapes} label="Shapes" large panelClass="shape-panel">
        {(close) => <ShapeGallery onPick={(p) => (close(), startShapeTool(p))} />}
      </PopoverButton>
      <MenuButton icon={Layers} label="Arrange" large items={() => arrangeItems(ui)} />
      <PopoverButton icon={Paintbrush} label="Quick Styles" large disabled={!n} panelClass="menu-wide">
        {(close) => <QuickStylesGallery close={close} />}
      </PopoverButton>
      <div className="col">
        <FillButtons disabled={!n} onPicture={() => ui.openPane('formatShape')} />
      </div>
    </RibbonGroup>
  )
}

export function HomeTab({ ui }: TabProps) {
  const painter = useStore((s) => s.painter)
  const hasSel = useStore((s) => s.selection.length > 0 || !!s.editingId)
  const slide = useStore((s) => currentSlide(s))
  const sectionItems: MenuItem[] = [
    { label: 'Add Section', icon: FolderPlus, onClick: () => ui.openDialog('section') },
    { label: 'Rename Section', disabled: !slide.section, onClick: () => ui.openDialog('section') },
    { label: 'Remove Section', disabled: !slide.section, onClick: () => A.setSection(null) },
  ]
  return (
    <>
      <RibbonGroup label="Clipboard">
        <SplitMenuButton
          icon={ClipboardPaste}
          label="Paste"
          large
          keep
          onClick={pasteFromSystem}
          items={[
            { label: 'Use Destination Theme', onClick: pasteFromSystem },
            { label: 'Keep Text Only', onClick: () => navigator.clipboard?.readText().then((t) => t && T.insertText(t)).catch(() => undefined) },
          ]}
        />
        <div className="col">
          <RibbonButton icon={Scissors} label="Cut" title="Cut (Ctrl+X)" showLabel disabled={!hasSel} onClick={() => (store.get().editingId ? document.execCommand('cut') : A.cutSelection())} />
          <RibbonButton icon={Copy} label="Copy" title="Copy (Ctrl+C)" showLabel disabled={!hasSel} onClick={() => (store.get().editingId ? document.execCommand('copy') : A.copySelection())} />
          <RibbonButton
            icon={Paintbrush}
            label="Format Painter"
            title="Format Painter (double-click to keep it on)"
            showLabel
            active={!!painter}
            disabled={!hasSel && !painter}
            onClick={() => (painter ? store.set({ painter: null }) : pickFormat())}
            onDoubleClick={() => pickFormat(true)}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Slides">
        <NewSlideButton />
        <div className="col">
          <LayoutButton />
          <RibbonButton icon={RotateCcw} label="Reset" title="Reset the position, size and formatting of the slide placeholders" showLabel onClick={() => A.resetSlides()} />
          <MenuButton icon={FolderPlus} label="Section" showLabel items={sectionItems} />
        </div>
      </RibbonGroup>
      <FontGroup ui={ui} />
      <ParagraphGroup ui={ui} />
      <DrawingGroup ui={ui} />
      <RibbonGroup label="Editing">
        <div className="col">
          <RibbonButton icon={Search} label="Find" title="Find (Ctrl+F)" showLabel onClick={() => ui.openDialog('find')} />
          <SplitMenuButton
            icon={Replace}
            label="Replace"
            title="Replace (Ctrl+H)"
            showLabel
            onClick={() => ui.openDialog('replace')}
            items={[
              { label: 'Replace…', icon: Replace, onClick: () => ui.openDialog('replace') },
              { label: 'Replace Fonts…', icon: Heading, onClick: () => ui.openDialog('replaceFonts') },
            ]}
          />
          <MenuButton
            icon={MousePointer2}
            label="Select"
            showLabel
            items={[
              { label: 'Select All', shortcut: 'Ctrl+A', onClick: A.selectAll },
              { label: 'Select Objects', onClick: () => store.set({ tool: { kind: 'select' } }) },
              { label: 'Selection Pane…', icon: Layers, onClick: () => ui.openPane('selection') },
            ]}
          />
        </div>
      </RibbonGroup>
    </>
  )
}
