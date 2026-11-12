import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Columns2,
  Eraser,
  Grid3x3,
  MousePointerClick,
  PaintBucket,
  PenLine,
  Rows2,
  Sparkles,
  SquareSplitHorizontal,
  TableCellsMerge,
  TableProperties,
  Trash2,
  Type,
  Baseline,
  Square,
} from 'lucide-react'
import type { CellSide, Dash, Line, TableElement, TextAlign } from '../../model/types'
import { resolveColor, type ThemeColors } from '../../model/color'
import {
  TABLE_STYLES,
  tableStyleName,
  applyBorders,
  cellLook,
  deleteCols,
  deleteRows,
  distributeCols,
  distributeRows,
  insertCol,
  insertRow,
  mapCells,
  mergeCells,
  setCellAlign,
  syncSize,
  type BorderKind,
  type TableStyleDef,
} from '../../model/table'
import { setTextStyleAll } from '../../model/richtext'
import { fillToCss } from '../../render/context'
import { store, useStore } from '../../store/store'
import * as A from '../../store/actions'
import { ColorPalette } from '../palettes'
import { ColorSplitButton, MenuButton, NumberField, PopoverButton, RibbonButton, RibbonGroup, SplitMenuButton, cls, keepFocus, type MenuItem } from '../ui'
import { ArrangeButtons, ArrangeExtraButtons, useThemeColors } from './common'
import type { TabProps } from './types'
import { t, tx, formatNumber } from '../../i18n'

const IN = 96

function useTable() {
  return useStore((s) => {
    void s.pres
    void s.tableSel
    return A.currentTable()
  })
}

// ---------- Style gallery ----------

const SAMPLE: TableElement = {
  id: 'sample',
  type: 'table',
  name: 'sample',
  x: 0,
  y: 0,
  w: 60,
  h: 40,
  rot: 0,
  cols: [12, 12, 12, 12, 12],
  rows: Array.from({ length: 5 }, () => ({ h: 8, cells: Array.from({ length: 5 }, () => ({ doc: { type: 'doc' as const, content: [] } })) })),
  styleId: 'none',
  opts: { headerRow: true, totalRow: false, bandedRows: true, firstCol: false, lastCol: false, bandedCols: false },
}

export function TableStyleThumb({ style, opts, colors }: { style: TableStyleDef; opts: TableElement['opts']; colors: ThemeColors }) {
  const t = { ...SAMPLE, styleId: style.id, opts }
  const stroke = (l: Line) => (l ? resolveColor(l.color, colors) : 'none')
  return (
    <svg width="62" height="42" viewBox="-1 -1 62 42" aria-hidden="true">
      {t.rows.map((_, r) =>
        t.cols.map((__, c) => {
          const look = cellLook(t, r, c)
          const x = c * 12
          const y = r * 8
          return (
            <g key={`${r}-${c}`}>
              <rect x={x} y={y} width={12} height={8} fill={look.fill.type === 'none' ? '#fff' : fillToCss(look.fill, colors)} />
              <line x1={x} y1={y} x2={x + 12} y2={y} stroke={stroke(look.borders.t)} strokeWidth={look.borders.t ? 0.8 : 0} />
              <line x1={x} y1={y + 8} x2={x + 12} y2={y + 8} stroke={stroke(look.borders.b)} strokeWidth={look.borders.b ? 0.8 : 0} />
              <line x1={x} y1={y} x2={x} y2={y + 8} stroke={stroke(look.borders.l)} strokeWidth={look.borders.l ? 0.8 : 0} />
              <line x1={x + 12} y1={y} x2={x + 12} y2={y + 8} stroke={stroke(look.borders.r)} strokeWidth={look.borders.r ? 0.8 : 0} />
              <rect x={x + 3} y={y + 3.5} width={6} height={1} fill={resolveColor(look.color, colors)} opacity={0.55} />
            </g>
          )
        }),
      )}
    </svg>
  )
}

const FAMILY_LABELS: Record<TableStyleDef['family'], string> = { Plain: tx('Plain'), Light: tx('Light'), Medium: tx('Medium'), Dark: tx('Dark') }

function StyleGallery({ onPick, current, close }: { onPick: (id: string) => void; current?: string; close?: () => void }) {
  const colors = useThemeColors()
  const cur = useTable()
  const opts = cur?.t.opts ?? SAMPLE.opts
  const families: TableStyleDef['family'][] = ['Plain', 'Light', 'Medium', 'Dark']
  return (
    <div className="table-style-gallery">
      {families.map((f) => (
        <div key={f}>
          <div className="palette-heading">{t(FAMILY_LABELS[f])}</div>
          <div className="table-style-grid">
            {TABLE_STYLES.filter((s) => s.family === f).map((s) => (
              <button
                key={s.id}
                type="button"
                title={tableStyleName(s)}
                aria-label={tableStyleName(s)}
                className={cls('table-style-item', current === s.id && 'is-active')}
                onMouseDown={keepFocus}
                onClick={() => {
                  close?.()
                  onPick(s.id)
                }}
              >
                <TableStyleThumb style={s} opts={opts} colors={colors} />
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="menu-sep" />
      <button
        type="button"
        className="menu-item"
        onMouseDown={keepFocus}
        onClick={() => {
          close?.()
          onPick('none')
        }}
      >
        <span className="menu-icon-space" /> {t('Clear Table')}
      </button>
    </div>
  )
}

function setStyle(id: string) {
  A.updateTable((t) => ({ ...t, styleId: id, rows: t.rows.map((r) => ({ ...r, cells: r.cells.map((c) => ({ ...c, fill: undefined, borders: undefined })) })) }))
}

// ---------- Borders ----------

const BORDER_ITEMS: { kind: BorderKind; label: string }[] = [
  { kind: 'none', label: tx('No Border') },
  { kind: 'all', label: tx('All Borders') },
  { kind: 'outside', label: tx('Outside Borders') },
  { kind: 'inside', label: tx('Inside Borders') },
  { kind: 'top', label: tx('Top Border') },
  { kind: 'bottom', label: tx('Bottom Border') },
  { kind: 'left', label: tx('Left Border') },
  { kind: 'right', label: tx('Right Border') },
  { kind: 'insideH', label: tx('Inside Horizontal Border') },
  { kind: 'insideV', label: tx('Inside Vertical Border') },
]

let lastBorder: BorderKind = 'all'

function pen(): Line {
  const p = store.get().tablePen
  return { color: p.color, width: p.width, dash: p.dash }
}

export function applyBorderKind(kind: BorderKind) {
  lastBorder = kind
  A.updateTable((t, rg) => applyBorders(t, rg, kind, pen()))
}

function BorderIcon({ kind }: { kind: BorderKind }) {
  const thick = (on: boolean) => (on ? 1.8 : 0.6)
  const dash = (on: boolean) => (on ? undefined : '1.5 1.5')
  const has = (part: 'o' | 'h' | 'v' | CellSide) => {
    switch (kind) {
      case 'all':
        return true
      case 'outside':
        return part !== 'h' && part !== 'v'
      case 'inside':
        return part === 'h' || part === 'v'
      case 'top':
        return part === 't'
      case 'bottom':
        return part === 'b'
      case 'left':
        return part === 'l'
      case 'right':
        return part === 'r'
      case 'insideH':
        return part === 'h'
      case 'insideV':
        return part === 'v'
      default:
        return false
    }
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" stroke="currentColor" fill="none">
      <line x1="2" y1="2" x2="14" y2="2" strokeWidth={thick(has('t'))} strokeDasharray={dash(has('t'))} />
      <line x1="2" y1="14" x2="14" y2="14" strokeWidth={thick(has('b'))} strokeDasharray={dash(has('b'))} />
      <line x1="2" y1="2" x2="2" y2="14" strokeWidth={thick(has('l'))} strokeDasharray={dash(has('l'))} />
      <line x1="14" y1="2" x2="14" y2="14" strokeWidth={thick(has('r'))} strokeDasharray={dash(has('r'))} />
      <line x1="2" y1="8" x2="14" y2="8" strokeWidth={thick(has('h'))} strokeDasharray={dash(has('h'))} />
      <line x1="8" y1="2" x2="8" y2="14" strokeWidth={thick(has('v'))} strokeDasharray={dash(has('v'))} />
    </svg>
  )
}

const DASHES: { dash: Dash; label: string }[] = [
  { dash: 'solid', label: tx('Solid') },
  { dash: 'sysDot', label: tx('Round Dot') },
  { dash: 'sysDash', label: tx('Square Dot') },
  { dash: 'dash', label: tx('Dash') },
  { dash: 'dashDot', label: tx('Dash Dot') },
  { dash: 'lgDash', label: tx('Long Dash') },
]

const WEIGHTS = [0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6]

// ---------- Table Design ----------

export function TableDesignTab(_props: TabProps) {
  const cur = useTable()
  const colors = useThemeColors()
  const tablePen = useStore((s) => s.tablePen)
  const tool = useStore((s) => s.tool)
  const tbl = cur?.t
  const opts = tbl?.opts
  const setOpt = (k: keyof TableElement['opts'], v: boolean) => A.updateTable((tt) => ({ ...tt, opts: { ...tt.opts, [k]: v } }))
  const firstFill = tbl ? cellLook(tbl, cur!.range.r0, cur!.range.c0).fill : null
  const shading = firstFill?.type === 'solid' ? resolveColor(firstFill.color, colors) : '#FFFFFF'
  const shade = (color: string | null) => A.updateTable((tt, rg) => mapCells(tt, rg, (c) => ({ ...c, fill: color ? { type: 'solid', color } : null })))
  const textFill = (color: string) => A.updateTable((tt, rg) => mapCells(tt, rg, (c) => ({ ...c, doc: setTextStyleAll(c.doc, { color }) })))
  const styleChoices = TABLE_STYLES.filter((s) => s.family === 'Medium').slice(0, 6)
  return (
    <>
      <RibbonGroup label={t('Table Style Options')}>
        <div className="col checks">
          <label>
            <input type="checkbox" checked={!!opts?.headerRow} disabled={!tbl} onChange={(e) => setOpt('headerRow', e.target.checked)} /> {t('Header Row')}
          </label>
          <label>
            <input type="checkbox" checked={!!opts?.totalRow} disabled={!tbl} onChange={(e) => setOpt('totalRow', e.target.checked)} /> {t('Total Row')}
          </label>
          <label>
            <input type="checkbox" checked={!!opts?.bandedRows} disabled={!tbl} onChange={(e) => setOpt('bandedRows', e.target.checked)} /> {t('Banded Rows')}
          </label>
        </div>
        <div className="col checks">
          <label>
            <input type="checkbox" checked={!!opts?.firstCol} disabled={!tbl} onChange={(e) => setOpt('firstCol', e.target.checked)} /> {t('First Column')}
          </label>
          <label>
            <input type="checkbox" checked={!!opts?.lastCol} disabled={!tbl} onChange={(e) => setOpt('lastCol', e.target.checked)} /> {t('Last Column')}
          </label>
          <label>
            <input type="checkbox" checked={!!opts?.bandedCols} disabled={!tbl} onChange={(e) => setOpt('bandedCols', e.target.checked)} /> {t('Banded Columns')}
          </label>
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Table Styles')} icon={TableProperties}>
        <div className="inline-gallery">
          {styleChoices.map((s) => (
            <button key={s.id} type="button" title={tableStyleName(s)} aria-label={tableStyleName(s)} className={cls('table-style-item', tbl?.styleId === s.id && 'is-active')} onMouseDown={keepFocus} onClick={() => setStyle(s.id)} disabled={!tbl}>
              <TableStyleThumb style={s} opts={opts ?? SAMPLE.opts} colors={colors} />
            </button>
          ))}
          <PopoverButton icon={TableProperties} label={t('More Table Styles')} panelClass="menu-wide" disabled={!tbl}>
            {(close) => <StyleGallery current={tbl?.styleId} onPick={setStyle} close={close} />}
          </PopoverButton>
        </div>
        <div className="col">
          <ColorSplitButton icon={PaintBucket} label={t('Shading')} color={shading} disabled={!tbl} onApply={() => shade(shading)}>
            {(close) => <ColorPalette colors={colors} onPick={(c) => (close(), shade(c))} none={{ label: t('No Fill'), onClick: () => (close(), shade(null)) }} />}
          </ColorSplitButton>
          <SplitMenuButton
            iconNode={<BorderIcon kind={lastBorder} />}
            label={t('Borders')}
            disabled={!tbl}
            onClick={() => applyBorderKind(lastBorder)}
            items={BORDER_ITEMS.map((b) => ({ label: t(b.label), onClick: () => applyBorderKind(b.kind) }))}
          />
          <MenuButton
            icon={Sparkles}
            label={t('Effects')}
            disabled={!tbl}
            items={[
              { label: t('No Shadow'), onClick: () => A.updateTable((tt) => ({ ...tt, effects: { ...tt.effects, shadow: null } })) },
              { label: t('Outer Shadow'), onClick: () => A.updateTable((tt) => ({ ...tt, effects: { ...tt.effects, shadow: { color: '#000000', alpha: 0.4, blur: 4, dist: 3, angle: 45 } } })) },
              { label: t('Reflection'), active: !!tbl?.effects?.reflection, onClick: () => A.updateTable((tt) => ({ ...tt, effects: { ...tt.effects, reflection: !tt.effects?.reflection } })) },
            ]}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('WordArt Styles')}>
        <div className="col">
          <ColorSplitButton icon={Baseline} label={t('Text Fill')} color="#000000" disabled={!tbl} onApply={() => textFill('theme:tx1')}>
            {(close) => <ColorPalette colors={colors} onPick={(c) => (close(), textFill(c))} />}
          </ColorSplitButton>
          <RibbonButton icon={Type} label={t('Bold Text')} showLabel disabled={!tbl} onClick={() => A.updateTable((tt, rg) => mapCells(tt, rg, (c) => ({ ...c, doc: toggleBoldDoc(c.doc) })))} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Draw Borders')}>
        <div className="col">
          <label className="field-row">
            <select aria-label={t('Pen Style')} value={tablePen.dash} onChange={(e) => store.set({ tablePen: { ...tablePen, dash: e.target.value as Dash } })}>
              {DASHES.map((d) => (
                <option key={d.dash} value={d.dash}>
                  {t(d.label)}
                </option>
              ))}
            </select>
          </label>
          <MenuButton icon={PenLine} label={t('{n} pt', { n: formatNumber(tablePen.width) })} title={t('Pen Weight')} showLabel items={WEIGHTS.map((w) => ({ label: t('{n} pt', { n: formatNumber(w) }), active: tablePen.width === w, onClick: () => store.set({ tablePen: { ...tablePen, width: w } }) }))} />
          <PopoverButton iconNode={<span className="pen-color-swatch" style={{ background: resolveColor(tablePen.color, colors) }} />} label={t('Pen Color')} showLabel panelClass="palette-menu">
            {(close) => <ColorPalette colors={colors} onPick={(c) => (close(), store.set({ tablePen: { ...tablePen, color: c } }))} />}
          </PopoverButton>
        </div>
        <RibbonButton icon={PenLine} label={t('Draw Table')} large active={tool.kind === 'drawTable'} onClick={() => store.set({ tool: tool.kind === 'drawTable' ? { kind: 'select' } : { kind: 'drawTable' } })} />
        <RibbonButton icon={Eraser} label={t('Eraser')} large active={tool.kind === 'eraseTable'} disabled={!tbl} onClick={() => store.set({ tool: tool.kind === 'eraseTable' ? { kind: 'select' } : { kind: 'eraseTable' } })} />
      </RibbonGroup>
    </>
  )
}

function toggleBoldDoc(doc: import('../../model/types').RichDoc) {
  const all = doc.content.flatMap((p) => p.content ?? []).filter((n) => n.type === 'text')
  const on = !all.every((n) => n.marks?.some((m) => m.type === 'bold'))
  return {
    ...doc,
    content: doc.content.map((p) => ({ ...p, content: p.content?.map((n) => (n.type === 'text' ? { ...n, marks: on ? [...(n.marks ?? []).filter((m) => m.type !== 'bold'), { type: 'bold' as const }] : (n.marks ?? []).filter((m) => m.type !== 'bold') } : n)) })),
  }
}

// ---------- Table Layout ----------

function selectPart(kind: 'table' | 'row' | 'col' | 'cell') {
  const cur = A.currentTable()
  if (!cur) return
  const { t, range } = cur
  const ts = store.get().tableSel
  const a = ts?.anchor ?? { r: 0, c: 0 }
  if (kind === 'table') A.selectCells(t.id, { r: 0, c: 0 }, { r: t.rows.length - 1, c: t.cols.length - 1 })
  if (kind === 'row') A.selectCells(t.id, { r: range.r0, c: 0 }, { r: range.r1, c: t.cols.length - 1 })
  if (kind === 'col') A.selectCells(t.id, { r: 0, c: range.c0 }, { r: t.rows.length - 1, c: range.c1 })
  if (kind === 'cell') A.selectCells(t.id, a, a)
}

const MARGINS: { label: string; detail: string; m: [number, number, number, number] }[] = [
  { label: tx('Normal'), detail: tx('Top: 0.05" Bottom: 0.05" Left: 0.1" Right: 0.1"'), m: [9.6, 4.8, 9.6, 4.8] },
  { label: tx('None'), detail: tx('All: 0"'), m: [0, 0, 0, 0] },
  { label: tx('Narrow'), detail: tx('All: 0.05"'), m: [4.8, 4.8, 4.8, 4.8] },
  { label: tx('Wide'), detail: tx('All: 0.15"'), m: [14.4, 14.4, 14.4, 14.4] },
]

export function TableLayoutTab({ ui }: TabProps) {
  const cur = useTable()
  const gridlines = useStore((s) => s.tableGridlines)
  const tbl = cur?.t
  const rg = cur?.range
  const rowH = tbl && rg ? tbl.rows[rg.r0].h : null
  const colW = tbl && rg ? tbl.cols[rg.c0] : null
  const lock = useStore((s) => s.lockTableRatio)
  const align = (a: TextAlign) => A.updateTable((tt, r) => setCellAlign(tt, r, a))
  const anchor = (a: 'top' | 'middle' | 'bottom') => A.updateTable((tt, r) => mapCells(tt, r, (c) => ({ ...c, anchor: a })))
  const vert = (v: 'horz' | 'vert' | 'vert270') => A.updateTable((tt, r) => mapCells(tt, r, (c) => ({ ...c, vert: v })))
  const margins = (m: [number, number, number, number]) => A.updateTable((tt, r) => mapCells(tt, r, (c) => ({ ...c, margins: m })))
  const deleteItems: MenuItem[] = [
    { label: t('Delete Columns'), icon: Columns2, onClick: () => A.updateTable((tt, r) => deleteCols(tt, r.c0, r.c1) ?? null) },
    { label: t('Delete Rows'), icon: Rows2, onClick: () => A.updateTable((tt, r) => deleteRows(tt, r.r0, r.r1) ?? null) },
    { label: t('Delete Table'), icon: Trash2, onClick: () => A.updateTable(() => null) },
  ]
  return (
    <>
      <RibbonGroup label={t('Table')}>
        <MenuButton
          icon={MousePointerClick}
          label={t('Select')}
          large
          disabled={!tbl}
          items={[
            { label: t('Select Cell'), onClick: () => selectPart('cell') },
            { label: t('Select Column'), onClick: () => selectPart('col') },
            { label: t('Select Row'), onClick: () => selectPart('row') },
            { label: t('Select Table'), onClick: () => selectPart('table') },
          ]}
        />
        <RibbonButton icon={Grid3x3} label={t('View Gridlines')} large active={gridlines} onClick={() => store.set({ tableGridlines: !gridlines })} />
      </RibbonGroup>
      <RibbonGroup label={t('Rows & Columns')}>
        <MenuButton icon={Trash2} label={t('Delete')} large disabled={!tbl} items={deleteItems} />
        <RibbonButton icon={ArrowUpToLine} label={t('Insert Above')} large disabled={!tbl} onClick={() => A.updateTable((tt, r) => insertRow(tt, r.r0, r.r0))} />
        <RibbonButton icon={ArrowDownToLine} label={t('Insert Below')} large disabled={!tbl} onClick={() => A.updateTable((tt, r) => insertRow(tt, r.r1 + 1, r.r1))} />
        <div className="col">
          <RibbonButton icon={ArrowLeftToLine} label={t('Insert Left')} showLabel disabled={!tbl} onClick={() => A.updateTable((tt, r) => insertCol(tt, r.c0, r.c0))} />
          <RibbonButton icon={ArrowRightToLine} label={t('Insert Right')} showLabel disabled={!tbl} onClick={() => A.updateTable((tt, r) => insertCol(tt, r.c1 + 1, r.c1))} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Merge')}>
        <RibbonButton icon={TableCellsMerge} label={t('Merge Cells')} large disabled={!cur?.hasCellSel || (rg!.r0 === rg!.r1 && rg!.c0 === rg!.c1)} onClick={() => A.updateTable((tt, r) => mergeCells(tt, r))} />
        <RibbonButton icon={SquareSplitHorizontal} label={t('Split Cells')} large disabled={!tbl} onClick={() => ui.openDialog('splitCells')} />
      </RibbonGroup>
      <RibbonGroup label={t('Cell Size')}>
        <div className="col">
          <label className="field-row">
            <span>{t('Height:')}</span>
            <NumberField
              label={t('Table Row Height')}
              value={rowH !== null ? rowH / IN : null}
              step={0.1}
              min={0.1}
              max={20}
              suffix='"'
              disabled={!tbl}
              onChange={(v) => A.updateTable((tt, r) => syncSize({ ...tt, rows: tt.rows.map((row, i) => (i >= r.r0 && i <= r.r1 ? { ...row, h: v * IN } : row)) }))}
            />
          </label>
          <label className="field-row">
            <span>{t('Width:')}</span>
            <NumberField
              label={t('Table Column Width')}
              value={colW !== null ? colW / IN : null}
              step={0.1}
              min={0.1}
              max={50}
              suffix='"'
              disabled={!tbl}
              onChange={(v) => A.updateTable((tt, r) => syncSize({ ...tt, cols: tt.cols.map((w, i) => (i >= r.c0 && i <= r.c1 ? v * IN : w)) }))}
            />
          </label>
        </div>
        <div className="col">
          <RibbonButton icon={Rows2} label={t('Distribute Rows')} showLabel disabled={!tbl} onClick={() => A.updateTable((tt, r) => (r.r0 === r.r1 ? distributeRows(tt, 0, tt.rows.length - 1) : distributeRows(tt, r.r0, r.r1)))} />
          <RibbonButton icon={Columns2} label={t('Distribute Columns')} showLabel disabled={!tbl} onClick={() => A.updateTable((tt, r) => (r.c0 === r.c1 ? distributeCols(tt, 0, tt.cols.length - 1) : distributeCols(tt, r.c0, r.c1)))} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Alignment')}>
        <div className="col">
          <div className="row">
            <RibbonButton icon={AlignLeft} label={t('Align Left')} disabled={!tbl} onClick={() => align('left')} />
            <RibbonButton icon={AlignCenter} label={t('Center')} disabled={!tbl} onClick={() => align('center')} />
            <RibbonButton icon={AlignRight} label={t('Align Right')} disabled={!tbl} onClick={() => align('right')} />
          </div>
          <div className="row">
            <RibbonButton icon={AlignVerticalJustifyStart} label={t('Align Top')} disabled={!tbl} onClick={() => anchor('top')} />
            <RibbonButton icon={AlignVerticalJustifyCenter} label={t('Center Vertically')} disabled={!tbl} onClick={() => anchor('middle')} />
            <RibbonButton icon={AlignVerticalJustifyEnd} label={t('Align Bottom')} disabled={!tbl} onClick={() => anchor('bottom')} />
          </div>
        </div>
        <MenuButton
          icon={Type}
          label={t('Text Direction')}
          large
          disabled={!tbl}
          items={[
            { label: t('Horizontal'), onClick: () => vert('horz') },
            { label: t('Rotate all text 90°'), onClick: () => vert('vert') },
            { label: t('Rotate all text 270°'), onClick: () => vert('vert270') },
          ]}
        />
        <MenuButton
          icon={Square}
          label={t('Cell Margins')}
          large
          disabled={!tbl}
          items={[...MARGINS.map((m) => ({ label: t(m.label), detail: t(m.detail), onClick: () => margins(m.m) })), 'separator', { label: t('Custom Margins…'), onClick: () => ui.openDialog('cellMargins') }]}
        />
      </RibbonGroup>
      <RibbonGroup label={t('Table Size')}>
        <div className="col">
          <label className="field-row">
            <span>{t('Height:')}</span>
            <NumberField label={t('Table Height')} value={tbl ? tbl.h / IN : null} step={0.1} min={0.1} max={56} suffix='"' disabled={!tbl} onChange={(v) => A.setSelectionSize(null, v * IN, lock)} />
          </label>
          <label className="field-row">
            <span>{t('Width:')}</span>
            <NumberField label={t('Table Width')} value={tbl ? tbl.w / IN : null} step={0.1} min={0.1} max={56} suffix='"' disabled={!tbl} onChange={(v) => A.setSelectionSize(v * IN, null, lock)} />
          </label>
          <label className="check">
            <input type="checkbox" checked={lock} onChange={(e) => store.set({ lockTableRatio: e.target.checked })} /> {t('Lock Aspect Ratio')}
          </label>
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Arrange')}>
        <ArrangeButtons ui={ui} />
        <ArrangeExtraButtons />
      </RibbonGroup>
    </>
  )
}
