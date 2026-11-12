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
import { t } from '../../i18n'
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
  const HEAD = t('{font} (Headings)', { font: fonts.major })
  const BODY = t('{font} (Body)', { font: fonts.minor })
  return (
    <RibbonGroup label={t('Font')} onLauncher={() => ui.openDialog('font')} launcherTitle={t('Font (Ctrl+T)')}>
      <div className="col">
        <div className="row">
          <ComboBox
            value={has ? family : ''}
            width={150}
            title={t('Font')}
            disabled={!has}
            options={[{ heading: t('Theme Fonts') }, HEAD, BODY, { heading: t('All Fonts') }, ...FONT_LIST]}
            renderOption={(o) => <span style={{ fontFamily: fontStack(o.replace(/ \((Headings|Body)\)$/, '')) }}>{o}</span>}
            onCommit={(v) => {
              const name = v === HEAD ? fonts.major : v === BODY ? fonts.minor : v
              if (name) T.setTextStyle({ fontFamily: name === themeFont ? null : name })
            }}
          />
          <ComboBox
            value={has ? String(size) : ''}
            width={58}
            title={t('Font Size')}
            disabled={!has}
            options={T.FONT_SIZES.map(String)}
            onCommit={(v) => {
              const n = parseFloat(v.replace(',', '.'))
              if (n > 0 && n <= 4000) T.setTextStyle({ fontSize: Math.round(n * 2) / 2 })
            }}
          />
          <RibbonButton icon={AArrowUp} label={t('Increase Font Size')} title={t('Increase Font Size (Ctrl+Shift+>)')} disabled={!has} onClick={() => T.stepFontSize(1)} />
          <RibbonButton icon={AArrowDown} label={t('Decrease Font Size')} title={t('Decrease Font Size (Ctrl+Shift+<)')} disabled={!has} onClick={() => T.stepFontSize(-1)} />
          <span className="row-sep" />
          <RibbonButton icon={Eraser} label={t('Clear All Formatting')} disabled={!has} onClick={T.clearFormatting} />
        </div>
        <div className="row">
          <RibbonButton icon={Bold} label={t('Bold')} title={t('Bold (Ctrl+B)')} active={has && T.isMarkActive('bold')} disabled={!has} onClick={() => T.toggleMark('bold')} />
          <RibbonButton icon={Italic} label={t('Italic')} title={t('Italic (Ctrl+I)')} active={has && T.isMarkActive('italic')} disabled={!has} onClick={() => T.toggleMark('italic')} />
          <RibbonButton icon={Underline} label={t('Underline')} title={t('Underline (Ctrl+U)')} active={has && T.isMarkActive('underline')} disabled={!has} onClick={() => T.toggleMark('underline')} />
          <RibbonButton
            iconNode={<span className="icon-text icon-shadow">S</span>}
            label={t('Text Shadow')}
            active={has && !!T.textStyleValue('shadow')}
            disabled={!has}
            onClick={() => T.setTextStyle({ shadow: T.textStyleValue('shadow') ? null : true })}
          />
          <RibbonButton icon={Strikethrough} label={t('Strikethrough')} active={has && T.isMarkActive('strike')} disabled={!has} onClick={() => T.toggleMark('strike')} />
          <MenuButton
            icon={Space}
            label={t('Character Spacing')}
            disabled={!has}
            items={[
              ...(
                [
                  [t('Very Tight'), -3],
                  [t('Tight'), -1.5],
                  [t('Normal'), 0],
                  [t('Loose'), 3],
                  [t('Very Loose'), 6],
                ] as const
              ).map(([label, v]) => ({ label, active: (T.textStyleValue('letterSpacing') ?? 0) === v, onClick: () => T.setTextStyle({ letterSpacing: v || null }) })),
              'separator',
              { label: t('More Spacing…'), onClick: () => ui.openDialog('font') },
            ]}
          />
          <MenuButton
            icon={CaseSensitive}
            label={t('Change Case')}
            disabled={!has}
            items={(
              [
                ['sentence', t('Sentence case.')],
                ['lower', t('lowercase')],
                ['upper', t('UPPERCASE')],
                ['title', t('Capitalize Each Word')],
                ['toggle', t('tOGGLE cASE')],
              ] as [CaseMode, string][]
            ).map(([mode, label]) => ({ label, onClick: () => T.changeCase(mode) }))}
          />
          <ColorSplitButton icon={Highlighter} label={t('Text Highlight Color')} color={hl} disabled={!has} onApply={() => T.setHighlight(hl)}>
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
          <ColorSplitButton icon={Baseline} label={t('Font Color')} color={resolveColor(fontColor, colors)} disabled={!has} onApply={() => T.setTextStyle({ color: fontColor })}>
            {(close) => (
              <ColorPalette
                colors={colors}
                auto={{ label: t('Automatic'), color: '#000', onClick: () => (close(), T.setTextStyle({ color: null })) }}
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
    <RibbonGroup label={t('Paragraph')} onLauncher={() => ui.openDialog('paragraph')} launcherTitle={t('Paragraph')}>
      <div className="col">
        <div className="row">
          <SplitMenuButton
            icon={List}
            label={t('Bullets')}
            active={!!bullet && !bullet.startsWith('num:')}
            disabled={!has}
            onClick={() => T.setPara({ bullet: bullet && !bullet.startsWith('num:') ? 'none' : '•' })}
            custom
            items={(close: () => void) => (
              <div className="bullet-gallery">
                <button type="button" className="bullet-item" onMouseDown={keepFocus} onClick={() => (close(), T.setPara({ bullet: 'none' }))}>
                  {t('None')}
                </button>
                {BULLET_CHARS.map((b) => (
                  <button key={b.char} type="button" className={cls('bullet-item', bullet === b.char && 'is-active')} title={t(b.label)} onMouseDown={keepFocus} onClick={() => (close(), T.setPara({ bullet: b.char }))}>
                    <span>{b.char}</span>
                    <span>{b.char}</span>
                    <span>{b.char}</span>
                  </button>
                ))}
                <button type="button" className="bullet-more" onMouseDown={keepFocus} onClick={() => (close(), ui.openDialog('bullets'))}>
                  {t('Bullets and Numbering…')}
                </button>
              </div>
            )}
          />
          <SplitMenuButton
            icon={ListOrdered}
            label={t('Numbering')}
            active={!!bullet?.startsWith('num:')}
            disabled={!has}
            onClick={() => T.setPara({ bullet: bullet?.startsWith('num:') ? 'none' : 'num:arabicPeriod' })}
            custom
            items={(close: () => void) => (
              <div className="bullet-gallery">
                <button type="button" className="bullet-item" onMouseDown={keepFocus} onClick={() => (close(), T.setPara({ bullet: 'none' }))}>
                  {t('None')}
                </button>
                {NUMBER_SCHEMES.map((n) => (
                  <button key={n.id} type="button" className={cls('bullet-item', bullet === `num:${n.id}` && 'is-active')} title={t(n.label)} onMouseDown={keepFocus} onClick={() => (close(), T.setPara({ bullet: `num:${n.id}` }))}>
                    <span>{n.sample(1)}</span>
                    <span>{n.sample(2)}</span>
                    <span>{n.sample(3)}</span>
                  </button>
                ))}
                <button type="button" className="bullet-more" onMouseDown={keepFocus} onClick={() => (close(), ui.openDialog('bullets'))}>
                  {t('Bullets and Numbering…')}
                </button>
              </div>
            )}
          />
          <RibbonButton icon={IndentDecrease} label={t('Decrease List Level')} title={t('Decrease List Level (Shift+Tab)')} disabled={!has} onClick={() => T.changeLevel(-1)} />
          <RibbonButton icon={IndentIncrease} label={t('Increase List Level')} title={t('Increase List Level (Tab)')} disabled={!has} onClick={() => T.changeLevel(1)} />
          <MenuButton
            icon={ArrowDownUp}
            label={t('Line Spacing')}
            disabled={!has}
            items={[
              ...[1, 1.5, 2, 2.5, 3].map((v) => ({ label: v.toFixed(1), active: Math.abs(lh - v) < 0.01, onClick: () => T.setPara({ lineHeight: v }) })),
              'separator' as const,
              { label: t('Line Spacing Options…'), onClick: () => ui.openDialog('paragraph') },
            ]}
          />
        </div>
        <div className="row">
          <RibbonButton icon={AlignLeft} label={t('Align Left')} title={t('Align Left (Ctrl+L)')} active={has && effAlign === 'left'} disabled={!has} onClick={() => T.setPara({ align: 'left' })} />
          <RibbonButton icon={AlignCenter} label={t('Center')} title={t('Center (Ctrl+E)')} active={has && effAlign === 'center'} disabled={!has} onClick={() => T.setPara({ align: 'center' })} />
          <RibbonButton icon={AlignRight} label={t('Align Right')} title={t('Align Right (Ctrl+R)')} active={has && effAlign === 'right'} disabled={!has} onClick={() => T.setPara({ align: 'right' })} />
          <RibbonButton icon={AlignJustify} label={t('Justify')} title={t('Justify (Ctrl+J)')} active={has && effAlign === 'justify'} disabled={!has} onClick={() => T.setPara({ align: 'justify' })} />
          <RibbonButton icon={AlignHorizontalSpaceAround} label={t('Distributed')} title={t('Distributed (Ctrl+Shift+J): spread the text evenly across the line')} active={has && effAlign === 'distributed'} disabled={!has} onClick={() => T.setPara({ align: 'distributed' })} />
          <span className="row-sep" />
          <MenuButton
            icon={Columns2}
            label={t('Add or Remove Columns')}
            disabled={!has}
            items={[
              ...[1, 2, 3].map((n) => ({ label: [t('One Column'), t('Two Columns'), t('Three Columns')][n - 1], active: (el?.text?.columns ?? 1) === n, onClick: () => setText({ columns: n }) })),
              'separator' as const,
              { label: t('More Columns…'), onClick: () => ui.openDialog('columns') },
            ]}
          />
          <MenuButton
            icon={Type}
            label={t('Text Direction')}
            disabled={!has}
            items={[
              { label: t('Horizontal'), active: !el?.text?.vert || el.text.vert === 'horz', onClick: () => setText({ vert: 'horz' }) },
              { label: t('Rotate all text 90°'), active: el?.text?.vert === 'vert', onClick: () => setText({ vert: 'vert' }) },
              { label: t('Rotate all text 270°'), active: el?.text?.vert === 'vert270', onClick: () => setText({ vert: 'vert270' }) },
              { label: t('Stacked'), active: el?.text?.vert === 'stacked', onClick: () => setText({ vert: 'stacked' }) },
            ]}
          />
          <MenuButton
            icon={TextCursorInput}
            label={t('Align Text')}
            disabled={!has}
            items={(['top', 'middle', 'bottom'] as const).map((a) => ({ label: a[0].toUpperCase() + a.slice(1), active: el?.text?.anchor === a, onClick: () => setText({ anchor: a }) }))}
          />
          <MenuButton icon={Network} label={t('Convert to Diagram')} disabled={!has} items={DIAGRAM_LAYOUTS.map((l) => ({ label: t(l.label), onClick: () => convertToDiagram(l.id) }))} />
        </div>
      </div>
    </RibbonGroup>
  )
}

export function DrawingGroup({ ui }: TabProps) {
  const n = useStore((s) => s.selection.length)
  return (
    <RibbonGroup label={t('Drawing')} onLauncher={() => ui.openPane('formatShape')} launcherTitle={t('Format Shape')}>
      <PopoverButton icon={Shapes} label={t('Shapes')} large panelClass="shape-panel">
        {(close) => <ShapeGallery onPick={(p) => (close(), startShapeTool(p))} />}
      </PopoverButton>
      <MenuButton icon={Layers} label={t('Arrange')} large items={() => arrangeItems(ui)} />
      <PopoverButton icon={Paintbrush} label={t('Quick Styles')} large disabled={!n} panelClass="menu-wide">
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
    { label: t('Add Section'), icon: FolderPlus, onClick: () => ui.openDialog('section') },
    { label: t('Rename Section'), disabled: !slide.section, onClick: () => ui.openDialog('section') },
    { label: t('Remove Section'), disabled: !slide.section, onClick: () => A.setSection(null) },
  ]
  return (
    <>
      <RibbonGroup label={t('Clipboard')}>
        <SplitMenuButton
          icon={ClipboardPaste}
          label={t('Paste')}
          large
          keep
          onClick={pasteFromSystem}
          items={[
            { label: t('Use Destination Theme'), onClick: pasteFromSystem },
            { label: t('Keep Source Formatting'), disabled: !A.getClipboard(), onClick: () => void A.pasteClipboard(A.getClipboard(), 'keepSource') },
            { label: t('Picture'), disabled: !A.getClipboard(), onClick: () => void A.pasteClipboard(A.getClipboard(), 'picture') },
            { label: t('Keep Text Only'), onClick: () => navigator.clipboard?.readText().then((text) => text && T.insertText(text)).catch(() => undefined) },
          ]}
        />
        <div className="col">
          <RibbonButton icon={Scissors} label={t('Cut')} title={t('Cut (Ctrl+X)')} showLabel disabled={!hasSel} onClick={() => (store.get().editingId ? document.execCommand('cut') : A.cutSelection())} />
          <RibbonButton icon={Copy} label={t('Copy')} title={t('Copy (Ctrl+C)')} showLabel disabled={!hasSel} onClick={() => (store.get().editingId ? document.execCommand('copy') : A.copySelection())} />
          <RibbonButton
            icon={Paintbrush}
            label={t('Format Painter')}
            title={t('Format Painter (double-click to keep it on)')}
            showLabel
            active={!!painter}
            disabled={!hasSel && !painter}
            onClick={() => (painter ? store.set({ painter: null }) : pickFormat())}
            onDoubleClick={() => pickFormat(true)}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Slides')}>
        <NewSlideButton />
        <div className="col">
          <LayoutButton />
          <RibbonButton icon={RotateCcw} label={t('Reset')} title={t('Reset the position, size and formatting of the slide placeholders')} showLabel onClick={() => A.resetSlides()} />
          <MenuButton icon={FolderPlus} label={t('Section')} showLabel items={sectionItems} />
        </div>
      </RibbonGroup>
      <FontGroup ui={ui} />
      <ParagraphGroup ui={ui} />
      <DrawingGroup ui={ui} />
      <RibbonGroup label={t('Editing')}>
        <div className="col">
          <RibbonButton icon={Search} label={t('Find')} title={t('Find (Ctrl+F)')} showLabel onClick={() => ui.openDialog('find')} />
          <SplitMenuButton
            icon={Replace}
            label={t('Replace')}
            title={t('Replace (Ctrl+H)')}
            showLabel
            onClick={() => ui.openDialog('replace')}
            items={[
              { label: t('Replace…'), icon: Replace, onClick: () => ui.openDialog('replace') },
              { label: t('Replace Fonts…'), icon: Heading, onClick: () => ui.openDialog('replaceFonts') },
            ]}
          />
          <MenuButton
            icon={MousePointer2}
            label={t('Select')}
            showLabel
            items={[
              { label: t('Select All'), shortcut: 'Ctrl+A', onClick: A.selectAll },
              { label: t('Select Objects'), onClick: () => store.set({ tool: { kind: 'select' } }) },
              { label: t('Selection Pane…'), icon: Layers, onClick: () => ui.openPane('selection') },
            ]}
          />
        </div>
      </RibbonGroup>
    </>
  )
}
