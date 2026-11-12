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
import { AlignCenterHorizontal, BringToFront, Group, Layers, PanelRight, SendToBack, SquareSplitVertical } from 'lucide-react'
import { alignMenuItems, groupMenuItems } from './ContextTabs'
import { arrangeObject } from '../../commands/objects'
import { printScale } from '../../grid/pages'
import { t, tx } from '../../i18n'

function insertBreak(app: ReturnType<typeof useApp>) {
  const doc = app.doc
  const sheet = doc.sheet
  const a = doc.sel.active
  doc.transact(tx('Insert Page Break'), () => {
    doc.noteProps(sheet)
    if (a.r > 0 && !sheet.x.rowBreaks.includes(a.r)) sheet.x.rowBreaks = [...sheet.x.rowBreaks, a.r].sort((x, y) => x - y)
    if (a.c > 0 && !sheet.x.colBreaks.includes(a.c)) sheet.x.colBreaks = [...sheet.x.colBreaks, a.c].sort((x, y) => x - y)
  })
}

function removeBreak(app: ReturnType<typeof useApp>) {
  const doc = app.doc
  const sheet = doc.sheet
  const a = doc.sel.active
  doc.transact(tx('Remove Page Break'), () => {
    doc.noteProps(sheet)
    sheet.x.rowBreaks = sheet.x.rowBreaks.filter((r) => r !== a.r)
    sheet.x.colBreaks = sheet.x.colBreaks.filter((c) => c !== a.c)
  })
}

function resetBreaks(app: ReturnType<typeof useApp>) {
  const doc = app.doc
  const sheet = doc.sheet
  doc.transact(tx('Reset All Page Breaks'), () => {
    doc.noteProps(sheet)
    sheet.x.rowBreaks = []
    sheet.x.colBreaks = []
  })
}

const PENS = [
  { color: '#000000', label: tx('Black Pen') },
  { color: '#E03131', label: tx('Red Pen') },
  { color: '#1C7ED6', label: tx('Blue Pen') },
]

export function DrawTab() {
  const app = useApp()
  const doc = app.doc
  useDocVersion(doc)
  const tool = doc.tool
  const set = (tool: typeof doc.tool) => {
    doc.tool = tool
    doc.emit()
  }
  return (
    <>
      <RibbonGroup label={t('Drawing Tools')} icon={Pen}>
        <RibbonButton icon={MousePointer2} label={t('Select')} large active={!tool} onClick={() => set(null)} />
        {PENS.map((p) => (
          <RibbonButton key={p.color} icon={Pen} label={t(p.label)} large active={tool?.kind === 'pen' && tool.color === p.color} onClick={() => set({ kind: 'pen', color: p.color, width: 2 })} />
        ))}
        <RibbonButton icon={Highlighter} label={t('Highlighter')} large active={tool?.kind === 'highlighter'} onClick={() => set({ kind: 'highlighter', color: '#FFE066', width: 12 })} />
        <PopoverButton icon={Pen} label={t('Pen Color')} large>
          {(close) => (
            <div className="palette-menu">
              <FontColorPalette onAuto={() => { set({ kind: 'pen', color: '#000000', width: 2 }); close() }} onPick={(c) => { set({ kind: 'pen', color: c, width: tool?.width ?? 2 }); close() }} />
            </div>
          )}
        </PopoverButton>
        <RibbonButton icon={Eraser} label={t('Eraser')} large active={tool?.kind === 'eraser'} onClick={() => set({ kind: 'eraser', color: '#000', width: 10 })} />
      </RibbonGroup>
      <RibbonGroup label={t('Edit')}>
        <RibbonButton
          icon={Trash2}
          label={t('Clear Ink')}
          large
          disabled={!doc.sheet.ink.length}
          onClick={() =>
            doc.transact(tx('Clear Ink'), () => {
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
  { label: tx('Normal'), detail: tx('Top 0.75"  Bottom 0.75"  Left 0.7"  Right 0.7"'), m: { top: 0.75, bottom: 0.75, left: 0.7, right: 0.7, header: 0.3, footer: 0.3 } },
  { label: tx('Wide'), detail: tx('Top 1"  Bottom 1"  Left 1"  Right 1"'), m: { top: 1, bottom: 1, left: 1, right: 1, header: 0.5, footer: 0.5 } },
  { label: tx('Narrow'), detail: tx('Top 0.75"  Bottom 0.75"  Left 0.25"  Right 0.25"'), m: { top: 0.75, bottom: 0.75, left: 0.25, right: 0.25, header: 0.3, footer: 0.3 } },
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
      reader.onload = () => setPage({ background: doc.wb.addImage(String(reader.result)) }, tx('Background'))
      reader.readAsDataURL(file)
    }
    input.click()
  }
  const setPage = (patch: Partial<typeof page>, label = tx('Page Setup')) =>
    doc.transact(label, () => {
      doc.noteProps(sheet)
      sheet.page = { ...sheet.page, ...patch }
    })
  return (
    <>
      <RibbonGroup label={t('Themes')} icon={Swatches} priority={1}>
        <PopoverButton icon={Swatches} label={t('Themes')} large className="theme-menu">
          {(close) => (
            <div className="theme-gallery">
              <div className="menu-heading">{t('Built-In')}</div>
              <div className="theme-grid">
                {THEMES.map((th) => (
                  <button key={th.name} type="button" className={currentTheme().name === th.name ? 'theme-tile is-active' : 'theme-tile'} title={`${th.name} (${th.fonts.major} / ${th.fonts.minor})`} onMouseDown={keepFocus} onClick={() => { close(); applyTheme(th) }}>
                    <span className="theme-aa" style={{ fontFamily: th.fonts.major, color: th.colors.dk2 }}>Aa</span>
                    <span className="theme-bars">{th.colors.accents.map((c) => <i key={c} style={{ background: c }} />)}</span>
                    <span className="theme-name">{th.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </PopoverButton>
        <div className="col">
          <MenuButton icon={Palette} label={t('Colors')} showLabel items={THEMES.map((th): MenuItem => ({ label: th.name, active: currentTheme().colors.accents[0] === th.colors.accents[0], preview: <span className="theme-bars small">{th.colors.accents.map((c) => <i key={c} style={{ background: c }} />)}</span>, onClick: () => applyTheme({ ...currentTheme(), name: `${currentTheme().name} (${th.name} colors)`, colors: th.colors }) }))} />
          <MenuButton icon={Type} label={t('Fonts')} showLabel items={THEMES.map((t): MenuItem => ({ label: `${t.fonts.major} / ${t.fonts.minor}`, active: currentTheme().fonts.minor === t.fonts.minor && currentTheme().fonts.major === t.fonts.major, onClick: () => applyTheme({ ...currentTheme(), fonts: t.fonts }) }))} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Page Setup')} icon={Square} onLauncher={() => app.dialog({ kind: 'pageSetup' })} launcherTitle={t('Page Setup')}>
        <MenuButton
          icon={Square}
          label={t('Margins')}
          large
          wide
          items={[...MARGINS.map((x): MenuItem => ({ label: t(x.label), detail: t(x.detail), active: page.margins.left === x.m.left && page.margins.top === x.m.top, onClick: () => setPage({ margins: x.m }, tx('Margins')) })), 'separator', { label: t('Custom Margins…'), onClick: () => app.dialog({ kind: 'pageSetup', tab: 'margins' }) }]}
        />
        <MenuButton
          icon={page.orientation === 'portrait' ? RectangleVertical : RectangleHorizontal}
          label={t('Orientation')}
          large
          items={[
            { label: t('Portrait'), icon: RectangleVertical, active: page.orientation === 'portrait', onClick: () => setPage({ orientation: 'portrait' }, tx('Orientation')) },
            { label: t('Landscape'), icon: RectangleHorizontal, active: page.orientation === 'landscape', onClick: () => setPage({ orientation: 'landscape' }, tx('Orientation')) },
          ]}
        />
        <MenuButton
          icon={Scaling}
          label={t('Size')}
          large
          items={(
            [
              ['letter', t('Letter'), '8.5" x 11"'],
              ['legal', t('Legal'), '8.5" x 14"'],
              ['tabloid', t('Tabloid'), '11" x 17"'],
              ['a4', 'A4', '8.27" x 11.69"'],
              ['a3', 'A3', '11.69" x 16.54"'],
            ] as const
          ).map(([id, label, detail]) => ({ label, detail, active: page.paper === id, onClick: () => setPage({ paper: id }, tx('Size')) }))}
        />
        <MenuButton
          icon={SquareDashed}
          label={t('Print Area')}
          large
          items={[
            { label: t('Set Print Area'), onClick: () => setPage({ printArea: rangeName(doc.activeRange) }, tx('Set Print Area')) },
            { label: t('Clear Print Area'), disabled: !page.printArea, onClick: () => setPage({ printArea: undefined }, tx('Clear Print Area')) },
          ]}
        />
        <MenuButton
          icon={SquareSplitVertical}
          label={t('Breaks')}
          large
          items={[
            { label: t('Insert Page Break'), onClick: () => insertBreak(app) },
            { label: t('Remove Page Break'), onClick: () => removeBreak(app) },
            { label: t('Reset All Page Breaks'), onClick: () => resetBreaks(app) },
          ]}
        />
        {page.background ? (
          <RibbonButton icon={ImageOff} label={t('Delete Background')} large onClick={() => setPage({ background: undefined }, tx('Delete Background'))} />
        ) : (
          <RibbonButton icon={ImagePlus} label={t('Background')} large onClick={() => pickBackground()} />
        )}
        <RibbonButton icon={Rows2} label={t('Print Titles')} large onClick={() => app.dialog({ kind: 'pageSetup', tab: 'sheet' })} />
        <RibbonButton icon={LayoutPanelTop} label={t('Header & Footer')} large onClick={() => app.dialog({ kind: 'headerFooter' })} />
      </RibbonGroup>
      <RibbonGroup label={t('Scale to Fit')} icon={Scaling} onLauncher={() => app.dialog({ kind: 'pageSetup' })} launcherTitle={t('Page Setup')}>
        <div className="col checks">
          {(['fitWide', 'fitTall'] as const).map((key) => {
            const value = page.fitToPage ? (page[key] ?? (key === 'fitWide' ? 1 : 0)) : 0
            return (
              <label key={key} className="check-item">
                {key === 'fitWide' ? t('Width:') : t('Height:')}
                <select
                  value={value}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    const other = key === 'fitWide' ? 'fitTall' : 'fitWide'
                    const otherValue = page.fitToPage ? (page[other] ?? (other === 'fitWide' ? 1 : 0)) : 0
                    setPage({ fitToPage: n > 0 || otherValue > 0, [key]: n, [other]: otherValue }, tx('Scale to Fit'))
                  }}
                >
                  <option value={0}>{t('Automatic')}</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? t('1 page') : t('{n} pages', { n })}
                    </option>
                  ))}
                </select>
              </label>
            )
          })}
          <label className="check-item">
            {t('Scale:')}
            <input className="mini-num" type="number" min={10} max={400} disabled={page.fitToPage} value={page.fitToPage ? Math.round(printScale(sheet) * 100) : page.scale} onChange={(e) => setPage({ scale: Math.max(10, Math.min(400, Number(e.target.value) || 100)) }, tx('Scale'))} />%
          </label>
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Sheet Options')} icon={Grid2x2} onLauncher={() => app.dialog({ kind: 'pageSetup', tab: 'sheet' })} launcherTitle={t('Page Setup: Sheet')}>
        <div className="col checks">
          <div className="menu-heading">{t('Gridlines')}</div>
          <CheckItem label={t('View')} checked={sheet.showGrid} onChange={(v) => { sheet.showGrid = v; doc.emit() }} />
          <CheckItem label={t('Print')} checked={page.printGridlines} onChange={(v) => setPage({ printGridlines: v }, tx('Print Gridlines'))} />
        </div>
        <div className="col checks">
          <div className="menu-heading">{t('Headings')}</div>
          <CheckItem label={t('View')} checked={sheet.showHeadings} onChange={(v) => { sheet.showHeadings = v; doc.emit() }} />
          <CheckItem label={t('Print')} checked={page.printHeadings} onChange={(v) => setPage({ printHeadings: v }, tx('Print Headings'))} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Arrange')} icon={Layers}>
        <RibbonButton icon={BringToFront} label={t('Bring Forward')} large disabled={doc.selObj === null} onClick={() => doc.selObj !== null && arrangeObject(doc, doc.selObj, 'forward')} />
        <RibbonButton icon={SendToBack} label={t('Send Backward')} large disabled={doc.selObj === null} onClick={() => doc.selObj !== null && arrangeObject(doc, doc.selObj, 'backward')} />
        <RibbonButton icon={PanelRight} label={t('Selection Pane')} large onClick={() => app.setPane('selection')} />
        <div className="col">
          <MenuButton icon={AlignCenterHorizontal} label={t('Align')} showLabel disabled={doc.selObj === null} items={alignMenuItems(doc)} />
          <MenuButton icon={Group} label={t('Group')} showLabel disabled={doc.selObj === null} items={groupMenuItems(doc)} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Print')} icon={Printer}>
        <RibbonButton icon={Printer} label={t('Print')} large title={t('Print (Ctrl+P)')} onClick={app.print} />
      </RibbonGroup>
    </>
  )
}


export function HelpTab() {
  const app = useApp()
  return (
    <>
      <RibbonGroup label={t('Help')}>
        <RibbonButton icon={CircleQuestionMark} label={t('Function Reference')} large onClick={() => app.dialog({ kind: 'insertFunction' })} />
        <RibbonButton icon={Keyboard} label={t('Keyboard Shortcuts')} large onClick={() => app.dialog({ kind: 'shortcuts' })} />
        <RibbonButton icon={Info} label={t('About')} large onClick={() => app.dialog({ kind: 'about' })} />
      </RibbonGroup>
    </>
  )
}

void Grid2x2
void Scissors
void Ruler
