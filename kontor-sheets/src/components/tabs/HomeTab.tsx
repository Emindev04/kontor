import {
  AArrowDown, AArrowUp, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, ArrowDownAZ, ArrowDownToLine, ArrowUpZA, Baseline, Bold,
  ClipboardPaste, Columns3, Copy, DollarSign, Eraser, Grid3x3, Italic, ListIndentDecrease, ListIndentIncrease, PaintBucket, Paintbrush, Palette, Percent, Rows3,
  Scissors, ScanSearch, Sigma, Strikethrough, TableCellsMerge, TextAlignCenter, TextAlignEnd, TextAlignStart, TextWrap, Underline, RotateCw, Hash,
} from 'lucide-react'
import { classifyFormat, formatValue } from '../../model/numfmt'
import { DEFAULT_FONT, DEFAULT_SIZE } from '../../model/style'
import { CELL_STYLES } from '../../model/cellStyles'
import type { BorderMode } from '../../commands/doc'
import { fillDirection } from '../../commands/fill'
import { DEFAULT_PASTE, pasteInternal, type PasteWhat } from '../../commands/clipboard'
import { quickSort } from '../../commands/sort'
import { addSheet, autofitColumns, autofitRows, deleteSheet, hideSheet, selectedIndexes, setHidden, setTabColor } from '../../commands/ops'
import { goToSpecial } from '../../commands/find'
import { FontColorPalette } from '../palettes'
import { ColorSplitButton, ComboBox, MenuButton, PopoverButton, RibbonButton, RibbonGroup, SplitButton, keepFocus, type MenuItem } from '../ui'
import { useApp, useDocVersion } from '../appContext'
import {
  ACCOUNTING_SYMBOLS, FONTS, NUMBER_FORMATS, SIZES, activeStyle, changeDecimals, deleteSmart, indent, insertSmart, setFormat, stepFontSize, toggleStyle, toggleUnderline,
} from './actions'
import { useState } from 'react'
import { insertDelete } from '../../commands/ops'
import { LayoutList, Table2 } from 'lucide-react'
import { TableStyleGallery } from './ContextTabs'
import { CFMenu } from './CFMenu'
import { tableAt } from '../../commands/objects'
import { updateTable } from '../../commands/tables'
import { clearFilters, hasActiveFilters, reapplyFilters, toggleAutoFilter } from '../../commands/filter'
import { clearNotesAndComments, fillJustify } from '../../commands/tools'
import { flashFill } from '../../commands/flashFill'
import { t, tx } from '../../i18n'

const TAB_COLORS: [string, string][] = [[tx('Red'), '#C00000'], [tx('Orange'), '#ED7D31'], [tx('Yellow'), '#FFC000'], [tx('Green'), '#70AD47'], [tx('Blue'), '#4472C4'], [tx('Purple'), '#7030A0']]

export const BORDER_ITEMS: [BorderMode, string][] = [
  ['bottom', tx('Bottom Border')], ['top', tx('Top Border')], ['left', tx('Left Border')], ['right', tx('Right Border')], ['none', tx('No Border')], ['all', tx('All Borders')],
  ['outside', tx('Outside Borders')], ['thickOutside', tx('Thick Outside Borders')], ['bottomDouble', tx('Bottom Double Border')], ['thickBottom', tx('Thick Bottom Border')],
  ['topBottom', tx('Top and Bottom Border')], ['topThickBottom', tx('Top and Thick Bottom Border')], ['topDoubleBottom', tx('Top and Double Bottom Border')],
]

/** The shown name of a built-in cell style (the stored name stays English). */
function cellStyleName(name: string) {
  const m = /^(?:(\d+)% - )?Accent(\d)$/.exec(name)
  if (!m) return t(name)
  return m[1] ? t('{percent}% - Accent{n}', { percent: m[1], n: m[2] }) : t('Accent{n}', { n: m[2] })
}

export function HomeTab() {
  const app = useApp()
  const doc = app.doc
  useDocVersion(doc)
  const st = activeStyle(doc)
  const [fillColor, setFillColor] = useState('#FFFF00')
  const [fontColor, setFontColor] = useState('#FF0000')
  const [border, setBorder] = useState<BorderMode>('bottom')
  const [lineColor, setLineColor] = useState('#000000')
  const [lineStyle, setLineStyle] = useState<'thin' | 'medium' | 'thick' | 'dashed' | 'dotted' | 'double'>('thin')
  const a = doc.sel.active
  const value = doc.value(a.r, a.c)
  const kind = classifyFormat(st.fmt)

  const pasteItems: MenuItem[] = [
    { heading: t('Paste') },
    { label: t('Paste'), shortcut: 'Ctrl+V', onClick: () => app.paste() },
    { label: t('Formulas'), onClick: () => pasteWith('formulas') },
    { label: t('Formulas & Number Formatting'), onClick: () => pasteWith('formulasAndFormats') },
    { label: t('No Borders'), onClick: () => pasteWith('allNoBorders') },
    { label: t('Keep Source Column Widths'), onClick: () => pasteWith('keepWidths') },
    { label: t('Transpose'), onClick: () => pasteWith('all', true) },
    { heading: t('Paste Values') },
    { label: t('Values'), onClick: () => pasteWith('values') },
    { label: t('Values & Number Formatting'), onClick: () => pasteWith('valuesAndFormats') },
    { heading: t('Other Paste Options') },
    { label: t('Formatting'), onClick: () => pasteWith('formats') },
    { label: t('Paste Link'), onClick: () => pasteWith('link') },
    { label: t('Picture'), onClick: () => void import('../../commands/picture').then((m) => { const e = m.pasteAsPicture(doc); if (e) app.alert(e) }) },
    'separator',
    { label: t('Paste Special…'), shortcut: 'Ctrl+Alt+V', onClick: () => app.dialog({ kind: 'pasteSpecial' }) },
  ]
  function pasteWith(what: PasteWhat, transpose = false) {
    if (!doc.clip) return app.alert(t('Copy cells in this workbook first to use this paste option.'))
    const err = pasteInternal(doc, { ...DEFAULT_PASTE, what, transpose })
    if (err) app.alert(err)
  }

  const borderStyle = { style: lineStyle, color: lineColor }
  const borderItems: MenuItem[] = [
    { heading: t('Borders') },
    ...BORDER_ITEMS.map(([m, label]): MenuItem => ({ label: t(label), onClick: () => { setBorder(m); doc.applyBorders(m, borderStyle) } })),
    { heading: t('Draw Borders') },
    { label: t('Draw Border'), checked: doc.borderPen?.mode === 'outside', onClick: () => pen('outside') },
    { label: t('Draw Border Grid'), checked: doc.borderPen?.mode === 'all', onClick: () => pen('all') },
    { label: t('Erase Border'), checked: doc.borderPen?.mode === 'none', onClick: () => pen('none') },
    ...(['thin', 'medium', 'thick', 'dashed', 'dotted', 'double'] as const).map((s): MenuItem => ({ label: t('Line Style: {style}', { style: t(s[0].toUpperCase() + s.slice(1)) }), checked: lineStyle === s, onClick: () => setLineStyle(s) })),
    { label: t('More Borders…'), onClick: () => app.dialog({ kind: 'formatCells', tab: 'border' }) },
  ]

  function pen(mode: 'outside' | 'all' | 'none') {
    doc.borderPen = doc.borderPen?.mode === mode ? null : { mode, style: borderStyle }
    doc.emit()
    app.focusGrid()
  }

  const numberPreview = (fmt: string) => {
    if (value === null || value === undefined) return ''
    const t = formatValue(value, fmt).text
    return t.length > 24 ? t.slice(0, 24) + '…' : t
  }

  const sizes = (axis: 'row' | 'col') => selectedIndexes(doc, axis)

  const formatItems: MenuItem[] = [
    { heading: t('Cell Size') },
    { label: t('Row Height…'), onClick: () => app.dialog({ kind: 'rowHeight' }) },
    { label: t('AutoFit Row Height'), onClick: () => autofitRows(doc, sizes('row')) },
    { label: t('Column Width…'), onClick: () => app.dialog({ kind: 'colWidth' }) },
    { label: t('AutoFit Column Width'), onClick: () => autofitColumns(doc, sizes('col')) },
    { label: t('Default Width…'), onClick: () => app.dialog({ kind: 'defaultWidth' }) },
    { heading: t('Visibility') },
    { label: t('Hide Rows'), shortcut: 'Ctrl+9', onClick: () => setHidden(doc, 'row', sizes('row'), true) },
    { label: t('Hide Columns'), shortcut: 'Ctrl+0', onClick: () => setHidden(doc, 'col', sizes('col'), true) },
    { label: t('Hide Sheet'), onClick: () => { const e = hideSheet(doc); if (e) app.alert(e) } },
    { label: t('Unhide Rows'), shortcut: 'Ctrl+Shift+(', onClick: () => unhide('row') },
    { label: t('Unhide Columns'), onClick: () => unhide('col') },
    { label: t('Unhide Sheet…'), disabled: !doc.wb.sheets.some((s) => s.hidden), onClick: () => app.dialog({ kind: 'unhideSheet' }) },
    { heading: t('Organize Sheets') },
    { label: t('Rename Sheet'), onClick: () => (document.querySelector('.st-tab.is-active') as HTMLElement | null)?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })) },
    { label: t('Move or Copy Sheet…'), onClick: () => app.dialog({ kind: 'moveCopy' }) },
    ...TAB_COLORS.map(([name, color]): MenuItem => ({ label: t('Tab Color: {color}', { color: t(name) }), preview: <span className="swatch" style={{ background: color }} />, onClick: () => setTabColor(doc, doc.activeIndex, color) })),
    { label: t('Tab Color: No Color'), onClick: () => setTabColor(doc, doc.activeIndex, undefined) },
    { heading: t('Protection') },
    { label: doc.sheet.x.protection ? t('Unprotect Sheet…') : t('Protect Sheet…'), onClick: () => app.dialog({ kind: doc.sheet.x.protection ? 'unprotectSheet' : 'protectSheet' }) },
    { label: t('Lock Cell'), checked: st.locked !== false, onClick: () => doc.applyStyle({ locked: st.locked === false ? undefined : false }, doc.sel.ranges, tx('Lock Cell')) },
    { label: t('Format Cells…'), shortcut: 'Ctrl+1', onClick: () => app.dialog({ kind: 'formatCells' }) },
  ]
  function unhide(axis: 'row' | 'col') {
    const idx = sizes(axis)
    const rg = doc.activeRange
    const ax = axis === 'row' ? doc.sheet.rows : doc.sheet.cols
    const all = new Set(idx)
    // include hidden neighbours just outside a single selected boundary
    const lo = axis === 'row' ? rg.r1 : rg.c1
    for (let i = lo - 1; i >= 0 && ax.hidden.has(i); i--) all.add(i)
    setHidden(doc, axis, [...all], false)
  }

  const styleGroups = [...new Set(CELL_STYLES.map((s) => s.group))]

  return (
    <>
      <RibbonGroup label={t('Clipboard')} icon={ClipboardPaste} priority={4} onLauncher={() => app.setPane(app.pane === 'clipboard' ? null : 'clipboard')} launcherTitle={t('Clipboard pane')}>
        <SplitButton icon={ClipboardPaste} label={t('Paste')} large pin onClick={() => app.paste()} items={pasteItems} />
        <div className="col">
          <RibbonButton icon={Scissors} label={t('Cut')} showLabel title={t('Cut (Ctrl+X)')} onClick={() => app.copy(true)} />
          <SplitButton
            icon={Copy}
            label={t('Copy')}
            showLabel
            title={t('Copy (Ctrl+C)')}
            onClick={() => app.copy(false)}
            items={[
              { label: t('Copy'), shortcut: 'Ctrl+C', onClick: () => app.copy(false) },
              { label: t('Copy as Picture…'), onClick: () => void import('../../commands/picture').then((m) => m.copyAsPicture(doc)).then(() => app.alert(t('The selection was copied as a picture. Paste it with Paste > Picture or in another program.'), t('Copy as Picture'))) },
            ]}
          />
          <RibbonButton icon={Paintbrush} label={t('Format Painter')} showLabel title={t('Format Painter (double-click to keep it on)')} active={app.painter.active} onClick={() => app.startPainter(false)} onDoubleClick={() => app.startPainter(true)} />
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('Font')} icon={Baseline} priority={5} onLauncher={() => app.dialog({ kind: 'formatCells', tab: 'font' })} launcherTitle={t('Format Cells: Font')}>
        <div className="col">
          <div className="row">
            <ComboBox value={st.font ?? DEFAULT_FONT} options={FONTS} width={128} title={t('Font')} renderOption={(f) => <span style={{ fontFamily: `"${f}"` }}>{f}</span>} onCommit={(f) => f && doc.applyStyle({ font: f }, doc.sel.ranges, tx('Font'))} />
            <ComboBox
              value={String(st.size ?? DEFAULT_SIZE)}
              options={SIZES}
              width={52}
              title={t('Font Size')}
              onCommit={(v) => {
                const n = Number(v)
                if (n >= 1 && n <= 409) doc.applyStyle({ size: n }, doc.sel.ranges, tx('Font Size'))
                else app.alert(t('The number must be between 1 and 409.'))
              }}
            />
            <RibbonButton icon={AArrowUp} label={t('Increase Font Size')} title={t('Increase Font Size (Ctrl+Shift+>)')} onClick={() => stepFontSize(doc, 1)} />
            <RibbonButton icon={AArrowDown} label={t('Decrease Font Size')} title={t('Decrease Font Size (Ctrl+Shift+<)')} onClick={() => stepFontSize(doc, -1)} />
          </div>
          <div className="row">
            <RibbonButton icon={Bold} label={t('Bold')} title={t('Bold (Ctrl+B)')} active={!!st.bold} onClick={() => toggleStyle(doc, 'bold')} />
            <RibbonButton icon={Italic} label={t('Italic')} title={t('Italic (Ctrl+I)')} active={!!st.italic} onClick={() => toggleStyle(doc, 'italic')} />
            <SplitButton
              icon={Underline}
              label={t('Underline')}
              title={t('Underline (Ctrl+U)')}
              active={!!st.underline}
              onClick={() => toggleUnderline(doc)}
              items={[
                { label: t('Underline'), checked: st.underline === 'single', onClick: () => toggleUnderline(doc, 'single') },
                { label: t('Double Underline'), checked: st.underline === 'double', onClick: () => toggleUnderline(doc, 'double') },
              ]}
            />
            <RibbonButton icon={Strikethrough} label={t('Strikethrough')} title={t('Strikethrough (Ctrl+5)')} minor active={!!st.strike} onClick={() => toggleStyle(doc, 'strike')} />
            <span className="row-sep" />
            <SplitButton icon={Grid3x3} label={t(BORDER_ITEMS.find(([m]) => m === border)?.[1] ?? 'Borders')} onClick={() => doc.applyBorders(border, borderStyle)} items={borderItems} menuClassName="menu-wide" />
            <PopoverButton icon={Palette} label={t('Line Color')} title={t('Border Line Color')} minor>
              {(close) => (
                <div className="palette-menu">
                  <FontColorPalette onAuto={() => { setLineColor('#000000'); close() }} onPick={(c) => { setLineColor(c); close() }} />
                </div>
              )}
            </PopoverButton>
            <ColorSplitButton icon={PaintBucket} label={t('Fill Color')} color={fillColor} onApply={() => doc.applyStyle({ fill: fillColor }, doc.sel.ranges, tx('Fill Color'))}>
              {(close) => (
                <FontColorPalette
                  autoLabel={t('No Fill')}
                  onAuto={() => {
                    doc.applyStyle({ fill: undefined }, doc.sel.ranges, tx('Fill Color'))
                    close()
                  }}
                  onPick={(c) => {
                    setFillColor(c)
                    doc.applyStyle({ fill: c }, doc.sel.ranges, tx('Fill Color'))
                    close()
                  }}
                />
              )}
            </ColorSplitButton>
            <ColorSplitButton icon={Baseline} label={t('Font Color')} color={fontColor} onApply={() => doc.applyStyle({ color: fontColor }, doc.sel.ranges, tx('Font Color'))}>
              {(close) => (
                <FontColorPalette
                  onAuto={() => {
                    doc.applyStyle({ color: undefined }, doc.sel.ranges, tx('Font Color'))
                    close()
                  }}
                  onPick={(c) => {
                    setFontColor(c)
                    doc.applyStyle({ color: c }, doc.sel.ranges, tx('Font Color'))
                    close()
                  }}
                />
              )}
            </ColorSplitButton>
          </div>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('Alignment')} icon={TextAlignCenter} priority={4} onLauncher={() => app.dialog({ kind: 'formatCells', tab: 'alignment' })} launcherTitle={t('Format Cells: Alignment')}>
        <div className="col">
          <div className="row">
            <RibbonButton icon={AlignVerticalJustifyStart} label={t('Top Align')} active={st.v === 'top'} onClick={() => doc.applyStyle({ v: 'top' }, doc.sel.ranges, tx('Top Align'))} />
            <RibbonButton icon={AlignVerticalJustifyCenter} label={t('Middle Align')} active={st.v === 'middle'} onClick={() => doc.applyStyle({ v: 'middle' }, doc.sel.ranges, tx('Middle Align'))} />
            <RibbonButton icon={AlignVerticalJustifyEnd} label={t('Bottom Align')} active={!st.v || st.v === 'bottom'} onClick={() => doc.applyStyle({ v: undefined }, doc.sel.ranges, tx('Bottom Align'))} />
            <MenuButton
              icon={RotateCw}
              label={t('Orientation')}
              items={[
                { label: t('Angle Counterclockwise'), checked: st.rotate === 45, onClick: () => doc.applyStyle({ rotate: st.rotate === 45 ? undefined : 45 }) },
                { label: t('Angle Clockwise'), checked: st.rotate === -45, onClick: () => doc.applyStyle({ rotate: st.rotate === -45 ? undefined : -45 }) },
                { label: t('Vertical Text'), checked: st.rotate === 255, onClick: () => doc.applyStyle({ rotate: st.rotate === 255 ? undefined : 255 }) },
                { label: t('Rotate Text Up'), checked: st.rotate === 90, onClick: () => doc.applyStyle({ rotate: st.rotate === 90 ? undefined : 90 }) },
                { label: t('Rotate Text Down'), checked: st.rotate === -90, onClick: () => doc.applyStyle({ rotate: st.rotate === -90 ? undefined : -90 }) },
                'separator',
                { label: t('Format Cell Alignment'), onClick: () => app.dialog({ kind: 'formatCells', tab: 'alignment' }) },
              ]}
            />
            <RibbonButton icon={TextWrap} label={t('Wrap Text')} showLabel active={!!st.wrap} onClick={() => doc.applyStyle({ wrap: !st.wrap || undefined }, doc.sel.ranges, tx('Wrap Text'))} />
          </div>
          <div className="row">
            <RibbonButton icon={TextAlignStart} label={t('Align Left')} active={st.h === 'left'} onClick={() => doc.applyStyle({ h: st.h === 'left' ? undefined : 'left' }, doc.sel.ranges, tx('Align Left'))} />
            <RibbonButton icon={TextAlignCenter} label={t('Center')} active={st.h === 'center'} onClick={() => doc.applyStyle({ h: st.h === 'center' ? undefined : 'center' }, doc.sel.ranges, tx('Center'))} />
            <RibbonButton icon={TextAlignEnd} label={t('Align Right')} active={st.h === 'right'} onClick={() => doc.applyStyle({ h: st.h === 'right' ? undefined : 'right' }, doc.sel.ranges, tx('Align Right'))} />
            <RibbonButton icon={ListIndentDecrease} label={t('Decrease Indent')} title={t('Decrease Indent (Ctrl+Alt+Shift+Tab)')} onClick={() => indent(doc, -1)} />
            <RibbonButton icon={ListIndentIncrease} label={t('Increase Indent')} title={t('Increase Indent (Ctrl+Alt+Tab)')} onClick={() => indent(doc, 1)} />
            <SplitButton
              icon={TableCellsMerge}
              label={t('Merge & Center')}
              showLabel
              onClick={() => merge('center')}
              items={[
                { label: t('Merge & Center'), onClick: () => merge('center') },
                { label: t('Merge Across'), onClick: () => merge('across') },
                { label: t('Merge Cells'), onClick: () => merge('merge') },
                { label: t('Unmerge Cells'), onClick: () => doc.merge('unmerge') },
              ]}
            />
          </div>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('Number')} icon={Hash} priority={3} onLauncher={() => app.dialog({ kind: 'formatCells', tab: 'number' })} launcherTitle={t('Format Cells: Number')}>
        <div className="col">
          <div className="row">
            <MenuButton
              icon={Hash}
              label={t(NUMBER_FORMATS.find((f) => f.id === kindToId(kind))?.label ?? 'Custom')}
              showLabel
              pin
              wide
              title={t('Number Format')}
              items={[
                ...NUMBER_FORMATS.map((f): MenuItem => ({ label: t(f.label), detail: numberPreview(f.fmt) || undefined, active: f.id === kindToId(kind), onClick: () => setFormat(doc, f.fmt) })),
                'separator',
                { label: t('More Number Formats…'), onClick: () => app.dialog({ kind: 'formatCells', tab: 'number' }) },
              ]}
            />
          </div>
          <div className="row">
            <SplitButton
              icon={DollarSign}
              label={t('Accounting Number Format')}
              onClick={() => setFormat(doc, ACCOUNTING_SYMBOLS[0].fmt)}
              items={[...ACCOUNTING_SYMBOLS.map((s): MenuItem => ({ label: t(s.label), onClick: () => setFormat(doc, s.fmt) })), 'separator', { label: t('More Accounting Formats…'), onClick: () => app.dialog({ kind: 'formatCells', tab: 'number' }) }]}
            />
            <RibbonButton icon={Percent} label={t('Percent Style')} title={t('Percent Style (Ctrl+Shift+%)')} onClick={() => setFormat(doc, '0%')} />
            <button type="button" className="rb" title={t('Comma Style')} aria-label={t('Comma Style')} onMouseDown={keepFocus} onClick={() => setFormat(doc, '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)')}>
              <b style={{ fontSize: 14, lineHeight: 1 }}>,</b>
            </button>
            <span className="row-sep" />
            <button type="button" className="rb rb-dec" title={t('Increase Decimal')} aria-label={t('Increase Decimal')} onMouseDown={keepFocus} onClick={() => changeDecimals(doc, 1)}>
              <small>←.0</small>
              <small>.00</small>
            </button>
            <button type="button" className="rb rb-dec" title={t('Decrease Decimal')} aria-label={t('Decrease Decimal')} onMouseDown={keepFocus} onClick={() => changeDecimals(doc, -1)}>
              <small>.00</small>
              <small>→.0</small>
            </button>
          </div>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t('Styles')} icon={Palette} priority={1}>
        <PopoverButton icon={LayoutList} label={t('Conditional Formatting')} large className="cf-menu">
          {(close) => <CFMenu close={close} />}
        </PopoverButton>
        <PopoverButton icon={Table2} label={t('Format as Table')} large className="tstyle-menu">
          {(close) => (
            <TableStyleGallery
              onPick={(id) => {
                close()
                const a = doc.sel.active
                const t = tableAt(doc.sheet, a.r, a.c)
                if (t) updateTable(doc, t.id, (tb) => (tb.style = id), tx('Table Style'))
                else app.dialog({ kind: 'createTable', data: id })
              }}
            />
          )}
        </PopoverButton>
        <PopoverButton icon={Palette} label={t('Cell Styles')} large className="cellstyle-menu">
          {(close) => (
            <div className="cellstyles">
              {styleGroups.map((g) => (
                <div key={g}>
                  <div className="menu-heading">{t(g)}</div>
                  <div className="cellstyle-grid">
                    {CELL_STYLES.filter((s) => s.group === g).map((s) => (
                      <button
                        key={s.name}
                        type="button"
                        className="cellstyle"
                        style={{ background: s.patch.fill ?? '#fff', color: s.patch.color ?? '#000', fontWeight: s.patch.bold ? 700 : 400, fontStyle: s.patch.italic ? 'italic' : undefined, borderBottom: s.patch.bb ? `${s.patch.bb.style === 'thick' ? 3 : 1}px ${s.patch.bb.style === 'double' ? 'double' : 'solid'} ${s.patch.bb.color}` : undefined }}
                        onMouseDown={keepFocus}
                        onClick={() => {
                          close()
                          doc.applyStyle(s.patch, doc.sel.ranges, tx('Cell Style'))
                        }}
                      >
                        {cellStyleName(s.name)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {doc.wb.customStyles.length > 0 && (
                <div>
                  <div className="menu-heading">{t('Custom')}</div>
                  <div className="cellstyle-grid">
                    {doc.wb.customStyles.map((cs) => (
                      <button key={cs.name} type="button" className="cellstyle" style={{ background: cs.patch.fill ?? '#fff', color: cs.patch.color ?? '#000', fontWeight: cs.patch.bold ? 700 : 400, fontStyle: cs.patch.italic ? 'italic' : undefined }} onMouseDown={keepFocus} onClick={() => { close(); doc.applyStyle(cs.patch, doc.sel.ranges, tx('Cell Style')) }}>
                        {cs.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="menu-sep" />
              <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => { close(); newCellStyle() }}>{t('New Cell Style…')}</button>
              <button type="button" className="menu-item" disabled={!doc.wb.customStyles.length} onMouseDown={keepFocus} onClick={() => { close(); doc.wb.customStyles = []; doc.modified = true; doc.emit() }}>{t('Delete Custom Styles')}</button>
            </div>
          )}
        </PopoverButton>
      </RibbonGroup>

      <RibbonGroup label={t('Cells')} icon={Rows3} priority={1}>
        <SplitButton
          icon={Rows3}
          label={t('Insert')}
          large
          onClick={() => insertSmart(doc, () => app.dialog({ kind: 'insertCells' }))}
          items={[
            { label: t('Insert Cells…'), onClick: () => app.dialog({ kind: 'insertCells' }) },
            { label: t('Insert Sheet Rows'), onClick: () => insertDelete(doc, 'row', doc.activeRange.r1, doc.activeRange.r2 - doc.activeRange.r1 + 1) },
            { label: t('Insert Sheet Columns'), onClick: () => insertDelete(doc, 'col', doc.activeRange.c1, doc.activeRange.c2 - doc.activeRange.c1 + 1) },
            { label: t('Insert Sheet'), shortcut: 'Shift+F11', onClick: () => addSheet(doc) },
          ]}
        />
        <SplitButton
          icon={Columns3}
          label={t('Delete')}
          large
          onClick={() => deleteSmart(doc, () => app.dialog({ kind: 'deleteCells' }))}
          items={[
            { label: t('Delete Cells…'), onClick: () => app.dialog({ kind: 'deleteCells' }) },
            { label: t('Delete Sheet Rows'), onClick: () => insertDelete(doc, 'row', doc.activeRange.r1, -(doc.activeRange.r2 - doc.activeRange.r1 + 1)) },
            { label: t('Delete Sheet Columns'), onClick: () => insertDelete(doc, 'col', doc.activeRange.c1, -(doc.activeRange.c2 - doc.activeRange.c1 + 1)) },
            { label: t('Delete Sheet'), onClick: () => app.confirm(t('"{name}" will be permanently deleted.', { name: doc.sheet.name }), () => { const e = deleteSheet(doc); if (e) app.alert(e) }, t('Delete Sheet')) },
          ]}
        />
        <MenuButton icon={Grid3x3} label={t('Format')} large items={formatItems} />
      </RibbonGroup>

      <RibbonGroup label={t('Editing')} icon={Sigma} priority={1}>
        <div className="col">
          <SplitButton
            icon={Sigma}
            label={t('AutoSum')}
            showLabel
            title={t('AutoSum (Alt+=)')}
            onClick={() => app.autoSum('SUM')}
            items={[
              { label: t('Sum'), onClick: () => app.autoSum('SUM') },
              { label: t('Average'), onClick: () => app.autoSum('AVERAGE') },
              { label: t('Count Numbers'), onClick: () => app.autoSum('COUNT') },
              { label: t('Max'), onClick: () => app.autoSum('MAX') },
              { label: t('Min'), onClick: () => app.autoSum('MIN') },
              'separator',
              { label: t('More Functions…'), onClick: () => app.dialog({ kind: 'insertFunction' }) },
            ]}
          />
          <MenuButton
            icon={ArrowDownToLine}
            label={t('Fill')}
            showLabel
            items={[
              { label: t('Down'), shortcut: 'Ctrl+D', onClick: () => fillDirection(doc, 'down') },
              { label: t('Right'), shortcut: 'Ctrl+R', onClick: () => fillDirection(doc, 'right') },
              { label: t('Up'), onClick: () => fillDirection(doc, 'up') },
              { label: t('Left'), onClick: () => fillDirection(doc, 'left') },
              'separator',
              { label: t('Series…'), onClick: () => app.dialog({ kind: 'series' }) },
              { label: t('Justify'), onClick: () => { const e = fillJustify(doc); if (e) app.alert(e) } },
              { label: t('Flash Fill'), shortcut: 'Ctrl+E', onClick: () => { const r = flashFill(doc); if (typeof r === 'string') app.alert(r, t('Flash Fill')) } },
            ]}
          />
          <MenuButton
            icon={Eraser}
            label={t('Clear')}
            showLabel
            items={[
              { label: t('Clear All'), onClick: () => doc.clear('all') },
              { label: t('Clear Formats'), onClick: () => doc.clear('formats') },
              { label: t('Clear Contents'), shortcut: 'Delete', onClick: () => doc.clear('contents') },
              { label: t('Clear Comments and Notes'), onClick: () => clearNotesAndComments(doc) },
              { label: t('Clear Hyperlinks'), onClick: () => doc.clear('links') },
            ]}
          />
        </div>
        <MenuButton
          icon={ArrowDownAZ}
          label={t('Sort & Filter')}
          large
          items={[
            { label: t('Sort A to Z'), icon: ArrowDownAZ, onClick: () => quickSort(doc, false) },
            { label: t('Sort Z to A'), icon: ArrowUpZA, onClick: () => quickSort(doc, true) },
            { label: t('Custom Sort…'), onClick: () => app.dialog({ kind: 'sort' }) },
            'separator',
            { label: t('Filter'), shortcut: 'Ctrl+Shift+L', checked: !!doc.sheet.x.autoFilter, onClick: () => { const e = toggleAutoFilter(doc); if (e) app.alert(e) } },
            { label: t('Clear'), disabled: !hasActiveFilters(doc.sheet), onClick: () => clearFilters(doc) },
            { label: t('Reapply'), onClick: () => reapplyFilters(doc) },
          ]}
        />
        <MenuButton
          icon={ScanSearch}
          label={t('Find & Select')}
          large
          items={[
            { label: t('Find…'), shortcut: 'Ctrl+F', onClick: () => app.dialog({ kind: 'find' }) },
            { label: t('Replace…'), shortcut: 'Ctrl+H', onClick: () => app.dialog({ kind: 'replace' }) },
            { label: t('Go To…'), shortcut: 'Ctrl+G', onClick: () => app.dialog({ kind: 'goto' }) },
            { label: t('Go To Special…'), onClick: () => app.dialog({ kind: 'gotoSpecial' }) },
            'separator',
            { label: t('Formulas'), onClick: () => special('formulas') },
            { label: t('Notes'), onClick: () => special('notes') },
            { label: t('Conditional Formatting'), onClick: () => special('cf') },
            { label: t('Constants'), onClick: () => special('constants') },
            { label: t('Data Validation'), onClick: () => special('validation') },
            'separator',
            { label: t('Select Objects'), onClick: () => special('objects') },
            { label: t('Selection Pane…'), onClick: () => app.setPane('selection') },
          ]}
        />
      </RibbonGroup>
    </>
  )

  function newCellStyle() {
    app.dialog({
      kind: 'prompt',
      title: t('Style'),
      message: t('Style name (it takes the formatting of the active cell):'),
      onText: (name) => {
        const n = name.trim()
        if (!n) return
        const { fill, color, bold, italic, underline, font, size, fmt, h, v, wrap, bt, bb, bl, br } = st
        const patch = Object.fromEntries(Object.entries({ fill, color, bold, italic, underline, font, size, fmt, h, v, wrap, bt, bb, bl, br }).filter(([, x]) => x !== undefined))
        doc.wb.customStyles = [...doc.wb.customStyles.filter((x) => x.name.toUpperCase() !== n.toUpperCase()), { name: n, patch }]
        doc.modified = true
        doc.emit()
      },
    })
  }

  function special(kind: 'formulas' | 'constants' | 'notes' | 'cf' | 'validation' | 'objects') {
    if (!goToSpecial(doc, kind)) app.alert(t('No cells were found.'))
  }

  function merge(mode: 'center' | 'across' | 'merge') {
    if (doc.mergeLosesData()) app.confirm(t('Merging cells only keeps the upper-left value and discards other values.'), () => doc.merge(mode), t('Merge Cells'))
    else doc.merge(mode)
  }
}

function kindToId(kind: string) {
  return kind === 'date' ? 'shortDate' : kind
}

export { setHidden }
