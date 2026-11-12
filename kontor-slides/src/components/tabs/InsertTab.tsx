import { CalendarClock, Hash, Image, Link2, MessageSquarePlus, Omega, PanelBottom, Smile, Type, Highlighter, Pen, Eraser, MousePointer2, Brush, Table, TableProperties, PenLine, BarChart3, Network, Film, Music, ZoomIn, BookImage } from 'lucide-react'
import { useState } from 'react'
import type { ShapeElement } from '../../model/types'
import { createTextBox } from '../../model/factory'
import { docFromText } from '../../model/richtext'
import { currentSlide, store, useStore } from '../../store/store'
import * as A from '../../store/actions'
import * as T from '../../editor/textCommands'
import { getActiveEditor } from '../../editor/activeEditor'
import { SymbolPicker } from '../palettes'
import { MenuButton, PopoverButton, RibbonButton, RibbonGroup, SplitMenuButton, keepFocus, cls } from '../ui'
import { NewSlideButton, ShapesButton, useThemeColors } from './common'
import { resolveColor } from '../../model/color'
import type { TabProps } from './types'

/** Opens the text editor on the selected shape if needed, then runs `fn` inside it. */
export function withEditor(fn: () => void) {
  if (getActiveEditor()) {
    fn()
    return
  }
  const shape = A.selectedTextShapes()[0]
  if (!shape) return
  A.enterEditing(shape.id, { kind: 'end' })
  const tryRun = (n: number) => {
    if (getActiveEditor()) fn()
    else if (n > 0) requestAnimationFrame(() => tryRun(n - 1))
  }
  requestAnimationFrame(() => tryRun(10))
}

type WordArtStyle = { label: string; color: string; outline?: { color: string; width: number }; shadow?: boolean }

export const WORDART_STYLES: WordArtStyle[] = [
  { label: 'Fill: Black, Text color 1; Shadow', color: 'theme:tx1', shadow: true },
  { label: 'Fill: Accent color 1; Shadow', color: 'theme:accent1', shadow: true },
  { label: 'Fill: Accent color 2; Outline', color: 'theme:accent2', outline: { color: 'theme:accent2:d50', width: 0.75 } },
  { label: 'Fill: White; Outline: Accent color 1', color: 'theme:bg1', outline: { color: 'theme:accent1', width: 1.5 } },
  { label: 'Fill: Accent color 4; Soft Bevel', color: 'theme:accent4', shadow: true },
  { label: 'Fill: Gray; Outline: Black', color: 'theme:tx1:l50', outline: { color: 'theme:tx1', width: 0.75 } },
  { label: 'Fill: Accent color 5; Outline: White', color: 'theme:accent5', outline: { color: 'theme:bg1', width: 1 }, shadow: true },
  { label: 'Fill: Accent color 6', color: 'theme:accent6' },
  { label: 'Outline only: Accent color 1', color: 'theme:bg1', outline: { color: 'theme:accent1', width: 1.25 } },
]

export function WordArtGallery({ onPick }: { onPick: (w: WordArtStyle) => void }) {
  const colors = useThemeColors()
  return (
    <div className="wordart-grid">
      {WORDART_STYLES.map((w) => (
        <button
          key={w.label}
          type="button"
          title={w.label}
          aria-label={w.label}
          onMouseDown={keepFocus}
          onClick={() => onPick(w)}
          style={{
            color: resolveColor(w.color, colors),
            WebkitTextStroke: w.outline ? `${w.outline.width}px ${resolveColor(w.outline.color, colors)}` : undefined,
            textShadow: w.shadow ? '2px 2px 2px rgba(0,0,0,.35)' : undefined,
          }}
        >
          A
        </button>
      ))}
    </div>
  )
}

export function insertWordArt(w: WordArtStyle) {
  const s = store.get()
  const slide = currentSlide(s)
  const tb = createTextBox({ x: s.pres.size.w * 0.2, y: s.pres.size.h * 0.38, w: s.pres.size.w * 0.6, h: 90 }, slide.elements, true)
  const el: ShapeElement = {
    ...tb,
    name: `WordArt ${slide.elements.length + 1}`,
    text: { ...tb.text!, doc: docFromText('Your text here', { align: 'center' }, [{ type: 'textStyle', attrs: { fontSize: 54, color: w.color, shadow: w.shadow || null } }]), textOutline: w.outline ?? null },
  }
  A.addElements([el], { kind: 'all' })
}

export function applyWordArt(w: WordArtStyle) {
  T.setTextStyle({ color: w.color, shadow: w.shadow || null })
  A.updateSelected((e) => (e.type === 'shape' && e.text ? { ...e, text: { ...e.text, textOutline: w.outline ?? null } } : e))
}

export function TableGridPicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [hover, setHover] = useState<{ r: number; c: number }>({ r: 0, c: 0 })
  return (
    <div className="table-picker" onMouseLeave={() => setHover({ r: 0, c: 0 })}>
      <div className="palette-heading">{hover.r ? `${hover.c}x${hover.r} Table` : 'Insert Table'}</div>
      <div className="table-picker-grid">
        {Array.from({ length: 8 }, (_, r) =>
          Array.from({ length: 10 }, (__, c) => (
            <button
              key={`${r}-${c}`}
              type="button"
              aria-label={`${c + 1} by ${r + 1} table`}
              className={cls('tp-cell', r < hover.r && c < hover.c && 'is-on')}
              onMouseEnter={() => setHover({ r: r + 1, c: c + 1 })}
              onMouseDown={keepFocus}
              onClick={() => onPick(r + 1, c + 1)}
            />
          )),
        )}
      </div>
    </div>
  )
}

export function TableButton({ ui }: TabProps) {
  return (
    <PopoverButton icon={Table} label="Table" large panelClass="palette-menu">
      {(close) => (
        <>
          <TableGridPicker
            onPick={(r, c) => {
              close()
              A.insertTable(r, c)
            }}
          />
          <div className="menu-sep" />
          <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), ui.openDialog('insertTable'))}>
            <TableProperties size={16} /> Insert Table…
          </button>
          <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => (close(), store.set({ tool: { kind: 'drawTable' } }))}>
            <PenLine size={16} /> Draw Table
          </button>
        </>
      )}
    </PopoverButton>
  )
}

export function InsertTab({ ui }: TabProps) {
  const editing = useStore((s) => !!s.editingId)
  const tool = useStore((s) => s.tool)
  return (
    <>
      <RibbonGroup label="Slides">
        <NewSlideButton />
      </RibbonGroup>
      <RibbonGroup label="Tables">
        <TableButton ui={ui} />
      </RibbonGroup>
      <RibbonGroup label="Images">
        <RibbonButton icon={Image} label="Pictures" title="Insert a picture from this device" large onClick={ui.insertPicture} />
        <RibbonButton icon={BookImage} label="Photo Album" title="Create a photo album from several pictures" large onClick={() => ui.openDialog('photoAlbum')} />
      </RibbonGroup>
      <RibbonGroup label="Illustrations">
        <ShapesButton />
        <RibbonButton icon={Smile} label="Icons" large onClick={() => ui.openDialog('icons')} />
        <RibbonButton icon={Network} label="Diagram" title="Insert a diagram (lists, processes, cycles, hierarchies …)" large onClick={() => ui.openDialog('insertDiagram')} />
        <RibbonButton icon={BarChart3} label="Chart" large onClick={() => ui.openDialog('insertChart')} />
      </RibbonGroup>
      <RibbonGroup label="Links">
        <MenuButton
          icon={ZoomIn}
          label="Zoom"
          large
          items={() => {
            const pres = store.get().pres
            const sections = pres.slides.filter((x) => x.section)
            return [
              { label: 'Summary Zoom', detail: 'One slide that links to each section', onClick: () => A.insertSummaryZoom() },
              { heading: 'Section Zoom' },
              ...(sections.length ? sections.map((x) => ({ label: x.section!, onClick: () => A.insertZoom([x.id], 'section') })) : [{ label: 'No sections yet', disabled: true, onClick: () => undefined }]),
              { heading: 'Slide Zoom' },
              ...pres.slides.slice(0, 20).map((x, i) => ({ label: `Slide ${i + 1}`, onClick: () => A.insertZoom([x.id], 'slide') })),
            ]
          }}
        />
        <RibbonButton icon={Link2} label="Link" title="Link (Ctrl+K)" large onClick={() => ui.openDialog('link')} />
      </RibbonGroup>
      <RibbonGroup label="Comments">
        <RibbonButton icon={MessageSquarePlus} label="Comment" large onClick={() => window.dispatchEvent(new CustomEvent('kontor:new-comment'))} />
      </RibbonGroup>
      <RibbonGroup label="Text">
        <SplitMenuButton
          icon={Type}
          label="Text Box"
          large
          active={tool.kind === 'textbox'}
          onClick={() => store.set({ tool: { kind: 'textbox' } })}
          items={[
            { label: 'Draw Horizontal Text Box', onClick: () => store.set({ tool: { kind: 'textbox' } }) },
            { label: 'Vertical Text Box', onClick: () => store.set({ tool: { kind: 'textbox', vertical: true } }) },
          ]}
        />
        <RibbonButton icon={PanelBottom} label="Header & Footer" large onClick={() => ui.openDialog('headerFooter')} />
        <PopoverButton iconNode={<span className="icon-wordart">A</span>} label="WordArt" large panelClass="palette-menu">
          {(close) => <WordArtGallery onPick={(w) => (close(), insertWordArt(w))} />}
        </PopoverButton>
        <div className="col">
          <RibbonButton icon={CalendarClock} label="Date & Time" showLabel onClick={() => ui.openDialog(editing ? 'dateTime' : 'headerFooter')} />
          <RibbonButton icon={Hash} label="Slide Number" showLabel onClick={() => (editing ? T.insertField('slidenum') : ui.openDialog('headerFooter'))} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Media">
        <RibbonButton icon={Film} label="Video" title="Insert a video from this device" large onClick={() => window.dispatchEvent(new CustomEvent('kontor:insert-media', { detail: { kind: 'video' } }))} />
        <RibbonButton icon={Music} label="Audio" title="Insert audio from this device" large onClick={() => window.dispatchEvent(new CustomEvent('kontor:insert-media', { detail: { kind: 'audio' } }))} />
      </RibbonGroup>
      <RibbonGroup label="Symbols">
        <PopoverButton icon={Omega} label="Symbol" large panelClass="palette-menu">
          {(close) => (
            <SymbolPicker
              onPick={(sym) => {
                close()
                withEditor(() => T.insertText(sym))
              }}
            />
          )}
        </PopoverButton>
      </RibbonGroup>
    </>
  )
}

const PENS = [
  { color: '#000000', width: 2.5, label: 'Pen: Black, 1 mm' },
  { color: '#E03131', width: 2.5, label: 'Pen: Red, 1 mm' },
  { color: '#1C7ED6', width: 2.5, label: 'Pen: Blue, 1 mm' },
  { color: '#2F9E44', width: 4, label: 'Pencil: Green, 2 mm' },
]
const HIGHLIGHTERS = [
  { color: '#FFE600', width: 14, label: 'Highlighter: Yellow, 6 mm' },
  { color: '#5CFF7A', width: 14, label: 'Highlighter: Green, 6 mm' },
]

export function DrawTab() {
  const tool = useStore((s) => s.tool)
  const pen = tool.kind === 'pen' ? tool : null
  return (
    <>
      <RibbonGroup label="Drawing Tools">
        <RibbonButton icon={MousePointer2} label="Select" title="Select Objects" large active={tool.kind === 'select'} onClick={() => store.set({ tool: { kind: 'select' } })} />
        <RibbonButton icon={Eraser} label="Eraser" title="Eraser (erases ink strokes)" large active={tool.kind === 'eraser'} onClick={() => store.set({ tool: { kind: 'eraser' } })} />
        {PENS.map((p) => (
          <button
            key={p.label}
            type="button"
            className={cls('rb rb-large pen-btn', pen && !pen.highlighter && pen.color === p.color && 'is-active')}
            title={p.label}
            aria-label={p.label}
            onMouseDown={keepFocus}
            onClick={() => {
              if (store.get().editingId) A.exitEditing()
              store.set({ tool: { kind: 'pen', color: p.color, width: p.width }, selection: [] })
            }}
          >
            <Pen size={28} strokeWidth={1.3} color={p.color} />
            <span className="rb-text">Pen</span>
          </button>
        ))}
        {HIGHLIGHTERS.map((p) => (
          <button
            key={p.label}
            type="button"
            className={cls('rb rb-large pen-btn', pen?.highlighter && pen.color === p.color && 'is-active')}
            title={p.label}
            aria-label={p.label}
            onMouseDown={keepFocus}
            onClick={() => store.set({ tool: { kind: 'pen', color: p.color, width: p.width, highlighter: true }, selection: [] })}
          >
            <Highlighter size={28} strokeWidth={1.3} color={p.color} />
            <span className="rb-text">Highlighter</span>
          </button>
        ))}
        <MenuButton
          icon={Brush}
          label="Thickness"
          large
          disabled={!pen}
          items={(pen?.highlighter ? [8, 14, 20, 28] : [1, 2.5, 4, 6, 9]).map((w) => ({ label: `${w} px`, active: pen?.width === w, onClick: () => pen && store.set({ tool: { ...pen, width: w } }) }))}
        />
        <label className="rb rb-large color-pick" title="Pen color">
          <span className="color-dot" style={{ background: pen?.color ?? '#000' }} />
          <span className="rb-text">Color</span>
          <input type="color" value={pen?.color ?? '#000000'} disabled={!pen} onChange={(e) => pen && store.set({ tool: { ...pen, color: e.target.value.toUpperCase() } })} />
        </label>
      </RibbonGroup>
    </>
  )
}
