import {
  ArrowDownAZ, ArrowUpZA, ArrowDownWideNarrow, CircleQuestionMark, Columns2, Eraser, FileInput, FileSpreadsheet, Grid2x2, Highlighter, Info, Keyboard,
  LayoutPanelTop, Link, Maximize, MousePointer2, Omega, Pen, Printer, RectangleHorizontal, RectangleVertical, ScanSearch, Snowflake, SquareDashed, Target,
  Trash2, ZoomIn, Scaling, Scissors, Ruler, Rows2, CopyMinus, StretchHorizontal, Square,
  ImageOff, ImagePlus, SwatchBook as Swatches, Palette, Type,
} from 'lucide-react'
import { MAX_COLS, MAX_ROWS, rangeName } from '../../model/address'
import { quickSort } from '../../commands/sort'
import { freezePanes } from '../../commands/ops'
import { CheckItem, MenuButton, PopoverButton, RibbonButton, RibbonGroup, keepFocus, type MenuItem } from '../ui'
import { THEMES, currentTheme, setCurrentTheme, type Theme } from '../../model/theme'
import { useApp, useDocVersion } from '../appContext'
import { FontColorPalette } from '../palettes'
import { BringToFront, Layers, PanelRight, SendToBack, SquareSplitVertical } from 'lucide-react'
import { arrangeObject } from '../../commands/objects'

function insertBreak(app: ReturnType<typeof useApp>) {
  const doc = app.doc
  const sheet = doc.sheet
  const a = doc.sel.active
  doc.transact('Insert Page Break', () => {
    doc.noteProps(sheet)
    if (a.r > 0 && !sheet.x.rowBreaks.includes(a.r)) sheet.x.rowBreaks = [...sheet.x.rowBreaks, a.r].sort((x, y) => x - y)
    if (a.c > 0 && !sheet.x.colBreaks.includes(a.c)) sheet.x.colBreaks = [...sheet.x.colBreaks, a.c].sort((x, y) => x - y)
  })
}

function removeBreak(app: ReturnType<typeof useApp>) {
  const doc = app.doc
  const sheet = doc.sheet
  const a = doc.sel.active
  doc.transact('Remove Page Break', () => {
    doc.noteProps(sheet)
    sheet.x.rowBreaks = sheet.x.rowBreaks.filter((r) => r !== a.r)
    sheet.x.colBreaks = sheet.x.colBreaks.filter((c) => c !== a.c)
  })
}

function resetBreaks(app: ReturnType<typeof useApp>) {
  const doc = app.doc
  const sheet = doc.sheet
  doc.transact('Reset All Page Breaks', () => {
    doc.noteProps(sheet)
    sheet.x.rowBreaks = []
    sheet.x.colBreaks = []
  })
}

const PENS = [
  { color: '#000000', label: 'Black Pen' },
  { color: '#E03131', label: 'Red Pen' },
  { color: '#1C7ED6', label: 'Blue Pen' },
]

export function DrawTab() {
  const app = useApp()
  const doc = app.doc
  useDocVersion(doc)
  const t = doc.tool
  const set = (tool: typeof doc.tool) => {
    doc.tool = tool
    doc.emit()
  }
  return (
    <>
      <RibbonGroup label="Drawing Tools" icon={Pen}>
        <RibbonButton icon={MousePointer2} label="Select" large active={!t} onClick={() => set(null)} />
        {PENS.map((p) => (
          <RibbonButton key={p.color} icon={Pen} label={p.label} large active={t?.kind === 'pen' && t.color === p.color} onClick={() => set({ kind: 'pen', color: p.color, width: 2 })} />
        ))}
        <RibbonButton icon={Highlighter} label="Highlighter" large active={t?.kind === 'highlighter'} onClick={() => set({ kind: 'highlighter', color: '#FFE066', width: 12 })} />
        <PopoverButton icon={Pen} label="Pen Color" large>
          {(close) => (
            <div className="palette-menu">
              <FontColorPalette onAuto={() => { set({ kind: 'pen', color: '#000000', width: 2 }); close() }} onPick={(c) => { set({ kind: 'pen', color: c, width: t?.width ?? 2 }); close() }} />
            </div>
          )}
        </PopoverButton>
        <RibbonButton icon={Eraser} label="Eraser" large active={t?.kind === 'eraser'} onClick={() => set({ kind: 'eraser', color: '#000', width: 10 })} />
      </RibbonGroup>
      <RibbonGroup label="Edit">
        <RibbonButton
          icon={Trash2}
          label="Clear Ink"
          large
          disabled={!doc.sheet.ink.length}
          onClick={() =>
            doc.transact('Clear Ink', () => {
              doc.noteProps(doc.sheet)
              doc.sheet.ink = []
            })
          }
        />
      </RibbonGroup>
    </>
  )
}

const MARGINS: { label: string; detail: string; m: { top: number; bottom: number; left: number; right: number; header: number; footer: number } }[] = [
  { label: 'Normal', detail: 'Top 0.75"  Bottom 0.75"  Left 0.7"  Right 0.7"', m: { top: 0.75, bottom: 0.75, left: 0.7, right: 0.7, header: 0.3, footer: 0.3 } },
  { label: 'Wide', detail: 'Top 1"  Bottom 1"  Left 1"  Right 1"', m: { top: 1, bottom: 1, left: 1, right: 1, header: 0.5, footer: 0.5 } },
  { label: 'Narrow', detail: 'Top 0.75"  Bottom 0.75"  Left 0.25"  Right 0.25"', m: { top: 0.75, bottom: 0.75, left: 0.25, right: 0.25, header: 0.3, footer: 0.3 } },
]

export function PageLayoutTab() {
  const app = useApp()
  const doc = app.doc
  useDocVersion(doc)
  const sheet = doc.sheet
  const page = sheet.page
  const applyTheme = (t: Theme) => {
    doc.wb.theme = t
    setCurrentTheme(t)
    doc.modified = true
    doc.emit()
  }
  const pickBackground = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => setPage({ background: doc.wb.addImage(String(reader.result)) }, 'Background')
      reader.readAsDataURL(file)
    }
    input.click()
  }
  const setPage = (patch: Partial<typeof page>, label = 'Page Setup') =>
    doc.transact(label, () => {
      doc.noteProps(sheet)
      sheet.page = { ...sheet.page, ...patch }
    })
  return (
    <>
      <RibbonGroup label="Themes" icon={Swatches} priority={1}>
        <PopoverButton icon={Swatches} label="Themes" large className="theme-menu">
          {(close) => (
            <div className="theme-gallery">
              <div className="menu-heading">Built-In</div>
              <div className="theme-grid">
                {THEMES.map((t) => (
                  <button key={t.name} type="button" className={currentTheme().name === t.name ? 'theme-tile is-active' : 'theme-tile'} title={`${t.name} (${t.fonts.major} / ${t.fonts.minor})`} onMouseDown={keepFocus} onClick={() => { close(); applyTheme(t) }}>
                    <span className="theme-aa" style={{ fontFamily: t.fonts.major, color: t.colors.dk2 }}>Aa</span>
                    <span className="theme-bars">{t.colors.accents.map((c) => <i key={c} style={{ background: c }} />)}</span>
                    <span className="theme-name">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </PopoverButton>
        <div className="col">
          <MenuButton icon={Palette} label="Colors" showLabel items={THEMES.map((t): MenuItem => ({ label: t.name, active: currentTheme().colors.accents[0] === t.colors.accents[0], preview: <span className="theme-bars small">{t.colors.accents.map((c) => <i key={c} style={{ background: c }} />)}</span>, onClick: () => applyTheme({ ...currentTheme(), name: `${currentTheme().name} (${t.name} colors)`, colors: t.colors }) }))} />
          <MenuButton icon={Type} label="Fonts" showLabel items={THEMES.map((t): MenuItem => ({ label: `${t.fonts.major} / ${t.fonts.minor}`, active: currentTheme().fonts.minor === t.fonts.minor && currentTheme().fonts.major === t.fonts.major, onClick: () => applyTheme({ ...currentTheme(), fonts: t.fonts }) }))} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Page Setup" icon={Square} onLauncher={() => app.dialog({ kind: 'pageSetup' })} launcherTitle="Page Setup">
        <MenuButton
          icon={Square}
          label="Margins"
          large
          wide
          items={[...MARGINS.map((x): MenuItem => ({ label: x.label, detail: x.detail, active: page.margins.left === x.m.left && page.margins.top === x.m.top, onClick: () => setPage({ margins: x.m }, 'Margins') })), 'separator', { label: 'Custom Margins…', onClick: () => app.dialog({ kind: 'pageSetup', tab: 'margins' }) }]}
        />
        <MenuButton
          icon={page.orientation === 'portrait' ? RectangleVertical : RectangleHorizontal}
          label="Orientation"
          large
          items={[
            { label: 'Portrait', icon: RectangleVertical, active: page.orientation === 'portrait', onClick: () => setPage({ orientation: 'portrait' }, 'Orientation') },
            { label: 'Landscape', icon: RectangleHorizontal, active: page.orientation === 'landscape', onClick: () => setPage({ orientation: 'landscape' }, 'Orientation') },
          ]}
        />
        <MenuButton
          icon={Scaling}
          label="Size"
          large
          items={(
            [
              ['letter', 'Letter', '8.5" x 11"'],
              ['legal', 'Legal', '8.5" x 14"'],
              ['tabloid', 'Tabloid', '11" x 17"'],
              ['a4', 'A4', '8.27" x 11.69"'],
              ['a3', 'A3', '11.69" x 16.54"'],
            ] as const
          ).map(([id, label, detail]) => ({ label, detail, active: page.paper === id, onClick: () => setPage({ paper: id }, 'Size') }))}
        />
        <MenuButton
          icon={SquareDashed}
          label="Print Area"
          large
          items={[
            { label: 'Set Print Area', onClick: () => setPage({ printArea: rangeName(doc.activeRange) }, 'Set Print Area') },
            { label: 'Clear Print Area', disabled: !page.printArea, onClick: () => setPage({ printArea: undefined }, 'Clear Print Area') },
          ]}
        />
        <MenuButton
          icon={SquareSplitVertical}
          label="Breaks"
          large
          items={[
            { label: 'Insert Page Break', onClick: () => insertBreak(app) },
            { label: 'Remove Page Break', onClick: () => removeBreak(app) },
            { label: 'Reset All Page Breaks', onClick: () => resetBreaks(app) },
          ]}
        />
        {page.background ? (
          <RibbonButton icon={ImageOff} label="Delete Background" large onClick={() => setPage({ background: undefined }, 'Delete Background')} />
        ) : (
          <RibbonButton icon={ImagePlus} label="Background" large onClick={() => pickBackground()} />
        )}
        <RibbonButton icon={Rows2} label="Print Titles" large onClick={() => app.dialog({ kind: 'pageSetup', tab: 'sheet' })} />
        <RibbonButton icon={LayoutPanelTop} label="Header & Footer" large onClick={() => app.dialog({ kind: 'headerFooter' })} />
      </RibbonGroup>
      <RibbonGroup label="Scale to Fit" icon={Scaling} onLauncher={() => app.dialog({ kind: 'pageSetup' })} launcherTitle="Page Setup">
        <div className="col checks">
          <CheckItem label="Fit sheet on one page" checked={page.fitToPage} onChange={(v) => setPage({ fitToPage: v }, 'Scale to Fit')} />
          <label className="check-item">
            Scale:
            <input className="mini-num" type="number" min={10} max={400} value={page.scale} onChange={(e) => setPage({ scale: Math.max(10, Math.min(400, Number(e.target.value) || 100)) }, 'Scale')} />%
          </label>
        </div>
      </RibbonGroup>
      <RibbonGroup label="Sheet Options" icon={Grid2x2} onLauncher={() => app.dialog({ kind: 'pageSetup', tab: 'sheet' })} launcherTitle="Page Setup: Sheet">
        <div className="col checks">
          <div className="menu-heading">Gridlines</div>
          <CheckItem label="View" checked={sheet.showGrid} onChange={(v) => { sheet.showGrid = v; doc.emit() }} />
          <CheckItem label="Print" checked={page.printGridlines} onChange={(v) => setPage({ printGridlines: v }, 'Print Gridlines')} />
        </div>
        <div className="col checks">
          <div className="menu-heading">Headings</div>
          <CheckItem label="View" checked={sheet.showHeadings} onChange={(v) => { sheet.showHeadings = v; doc.emit() }} />
          <CheckItem label="Print" checked={page.printHeadings} onChange={(v) => setPage({ printHeadings: v }, 'Print Headings')} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Arrange" icon={Layers}>
        <RibbonButton icon={BringToFront} label="Bring Forward" large disabled={doc.selObj === null} onClick={() => doc.selObj !== null && arrangeObject(doc, doc.selObj, 'forward')} />
        <RibbonButton icon={SendToBack} label="Send Backward" large disabled={doc.selObj === null} onClick={() => doc.selObj !== null && arrangeObject(doc, doc.selObj, 'backward')} />
        <RibbonButton icon={PanelRight} label="Selection Pane" large onClick={() => app.setPane('selection')} />
      </RibbonGroup>
      <RibbonGroup label="Print" icon={Printer}>
        <RibbonButton icon={Printer} label="Print" large title="Print (Ctrl+P)" onClick={app.print} />
      </RibbonGroup>
    </>
  )
}


export function HelpTab() {
  const app = useApp()
  return (
    <>
      <RibbonGroup label="Help">
        <RibbonButton icon={CircleQuestionMark} label="Function Reference" large onClick={() => app.dialog({ kind: 'insertFunction' })} />
        <RibbonButton icon={Keyboard} label="Keyboard Shortcuts" large onClick={() => app.dialog({ kind: 'shortcuts' })} />
        <RibbonButton icon={Info} label="About" large onClick={() => app.dialog({ kind: 'about' })} />
      </RibbonGroup>
    </>
  )
}

void Grid2x2
void Scissors
void Ruler
