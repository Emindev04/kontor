import {
  Brush, Calculator, PanelTopDashed, Settings2, SquareSplitVertical, TextQuote as TextDirectionIcon, AlignCenter, AlignLeft, AlignRight, ArrowDownAZ, BetweenHorizontalEnd, BetweenHorizontalStart, BetweenVerticalEnd, BetweenVerticalStart,
  Columns3, Combine, Grid2x2, LayoutGrid, MousePointerClick, PaintBucket, SquareSplitHorizontal, Table2, TextCursorInput, Trash2, PencilLine, Eraser,
} from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { CellSelection, TableMap } from '@tiptap/pm/tables'
import type { Node as PMNode } from '@tiptap/pm/model'
import { CheckItem, ColorSplitButton, MenuButton, PopoverButton, RibbonButton, RibbonGroup, Spinner, cls, keepFocus } from '../ui'
import { formatLength, parseLength, PX_PER_IN } from '../../units'
import type { BorderPen, BorderTarget } from '../../editor/TableExtras'
import { FontColorPalette } from '../palettes'
import { TABLE_STYLES, currentTableAttrs, type TableOption, type TableStyleId } from '../../editor/TableStyles'
import type { TabProps } from './types'
import { t, tx } from '../../i18n'

function tableAt(editor: Editor) {
  const $from = editor.state.selection.$from
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'table') return { node: $from.node(d), pos: $from.before(d), depth: d }
  }
  return null
}

function cellPos(editor: Editor) {
  const $from = editor.state.selection.$from
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name
    if (name === 'tableCell' || name === 'tableHeader') return $from.before(d)
  }
  return null
}

function select(editor: Editor, what: 'cell' | 'row' | 'column' | 'table') {
  const t = tableAt(editor)
  const cp = cellPos(editor)
  if (!t || cp == null) return
  const doc = editor.state.doc
  const $cell = doc.resolve(cp)
  let sel: CellSelection
  if (what === 'cell') sel = new CellSelection($cell)
  else if (what === 'row') sel = CellSelection.rowSelection($cell)
  else if (what === 'column') sel = CellSelection.colSelection($cell)
  else {
    const map = TableMap.get(t.node)
    const start = t.pos + 1
    sel = new CellSelection(doc.resolve(start + map.map[0]), doc.resolve(start + map.map[map.map.length - 1]))
  }
  editor.view.dispatch(editor.state.tr.setSelection(sel))
  editor.view.focus()
}

function distributeColumns(editor: Editor) {
  const t = tableAt(editor)
  if (!t) return
  const dom = editor.view.nodeDOM(t.pos) as HTMLElement | null
  const map = TableMap.get(t.node)
  const total = (dom?.querySelector('table')?.getBoundingClientRect().width ?? 600) / (editor.view.dom.getBoundingClientRect().width / editor.view.dom.offsetWidth || 1)
  const width = Math.floor(total / map.width)
  const tr = editor.state.tr
  t.node.descendants((cell, pos) => {
    if (cell.type.name !== 'tableCell' && cell.type.name !== 'tableHeader') return
    tr.setNodeMarkup(t.pos + 1 + pos, undefined, { ...cell.attrs, colwidth: Array(cell.attrs.colspan).fill(width) })
    return false
  })
  editor.view.dispatch(tr)
}

/** Width (px) of the column of the cell at the cursor, 0 when automatic. */
function currentColumnWidth(editor: Editor): number {
  const $from = editor.state.selection.$from
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d)
    if (n.type.name === 'tableCell' || n.type.name === 'tableHeader') return (Array.isArray(n.attrs.colwidth) ? n.attrs.colwidth[0] : 0) ?? 0
  }
  return 0
}

function autofit(editor: Editor) {
  const t = tableAt(editor)
  if (!t) return
  const tr = editor.state.tr
  t.node.descendants((cell, pos) => {
    if (cell.type.name !== 'tableCell' && cell.type.name !== 'tableHeader') return
    tr.setNodeMarkup(t.pos + 1 + pos, undefined, { ...cell.attrs, colwidth: null })
    return false
  })
  editor.view.dispatch(tr)
}

/** Names of the nine cell alignment buttons, by vertical and horizontal alignment. */
const CELL_ALIGN_LABELS: Record<string, string> = {
  'top-left': tx('Align Top Left'), 'top-center': tx('Align Top Center'), 'top-right': tx('Align Top Right'),
  'middle-left': tx('Align Center Left'), 'middle-center': tx('Align Center'), 'middle-right': tx('Align Center Right'),
  'bottom-left': tx('Align Bottom Left'), 'bottom-center': tx('Align Bottom Center'), 'bottom-right': tx('Align Bottom Right'),
}

/** Sorts the body rows by the text of the column the cursor is in. */
function sortRows(editor: Editor, dir: 1 | -1) {
  const tbl = tableAt(editor)
  const cp = cellPos(editor)
  if (!tbl || cp == null) return
  const map = TableMap.get(tbl.node)
  const col = map.colCount(cp - tbl.pos - 1)
  const rows: PMNode[] = []
  tbl.node.forEach((row) => rows.push(row))
  const hasHeader = tbl.node.attrs.headerRow !== false && rows.length > 1
  const head = hasHeader ? rows.slice(0, 1) : []
  const body = rows.slice(head.length)
  if (body.some((r) => r.childCount !== map.width)) return alert(t('Rows with merged cells cannot be sorted.'))
  const key = (r: PMNode) => r.child(Math.min(col, r.childCount - 1)).textContent
  body.sort((a, b) => dir * key(a).localeCompare(key(b), 'en-US', { numeric: true, sensitivity: 'base' }))
  const table = tbl.node.type.create(tbl.node.attrs, [...head, ...body])
  editor.view.dispatch(editor.state.tr.replaceWith(tbl.pos, tbl.pos + tbl.node.nodeSize, table))
}

function convertToText(editor: Editor) {
  const t = tableAt(editor)
  if (!t) return
  const { schema } = editor.state
  const paragraphs: PMNode[] = []
  t.node.forEach((row) => {
    const parts: string[] = []
    row.forEach((cell) => parts.push(cell.textContent))
    const text = parts.join('\t')
    paragraphs.push(schema.nodes.paragraph.create(null, text ? schema.text(text) : null))
  })
  editor.view.dispatch(editor.state.tr.replaceWith(t.pos, t.pos + t.node.nodeSize, paragraphs))
}

export function TableLayoutTab({ editor, app }: TabProps) {
  const chain = () => editor.chain().focus()
  const align = (h: 'left' | 'center' | 'right', v: 'top' | 'middle' | 'bottom') => chain().setTextAlign(h).setCellVerticalAlign(v).run()
  const cellAlign = editor.isActive('tableHeader') ? editor.getAttributes('tableHeader').verticalAlign : editor.getAttributes('tableCell').verticalAlign
  return (
    <>
      <RibbonGroup label={t('Table')} priority={1}>
        <div className="col">
          <MenuButton
            icon={MousePointerClick}
            label={t('Select')}
            showLabel
            items={[
              { label: t('Select Cell'), onClick: () => select(editor, 'cell') },
              { label: t('Select Column'), onClick: () => select(editor, 'column') },
              { label: t('Select Row'), onClick: () => select(editor, 'row') },
              { label: t('Select Table'), onClick: () => select(editor, 'table') },
            ]}
          />
          <RibbonButton icon={Grid2x2} label={t('View Gridlines')} showLabel onClick={() => document.body.classList.toggle('show-table-gridlines')} />
          <RibbonButton icon={Settings2} label={t('Properties')} showLabel onClick={() => app.openDialog('tableProperties')} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Draw')} priority={1}>
        <RibbonButton large icon={PencilLine} label={t('Draw Table')} active={app.tableTool === 'draw'} title={t('Drag to draw a table, or a line inside a cell to split it (Esc to stop)')} onClick={() => app.setTableTool(app.tableTool === 'draw' ? null : 'draw')} />
        <RibbonButton large icon={Eraser} label={t('Eraser')} active={app.tableTool === 'eraser'} title={t('Click a line between two cells to merge them (Esc to stop)')} onClick={() => app.setTableTool(app.tableTool === 'eraser' ? null : 'eraser')} />
      </RibbonGroup>
      <RibbonGroup label={t('Rows & Columns')} priority={4}>
        <MenuButton
          large
          icon={Trash2}
          label={t('Delete')}
          items={[
            { label: t('Delete Cells (Shift Cells Left)'), onClick: () => chain().deleteCellsShiftLeft().run() },
            { label: t('Delete Cells (Shift Cells Up)'), onClick: () => chain().deleteCellsShiftUp().run() || alert(t('Cells can only be shifted up in tables without merged cells.')) },
            { label: t('Delete Columns'), onClick: () => chain().deleteColumn().run() },
            { label: t('Delete Rows'), onClick: () => chain().deleteRow().run() },
            { label: t('Delete Table'), onClick: () => chain().deleteTable().run() },
          ]}
        />
        <RibbonButton large icon={BetweenHorizontalStart} label={t('Insert Above')} onClick={() => chain().addRowBefore().run()} />
        <div className="col">
          <RibbonButton icon={BetweenHorizontalEnd} label={t('Insert Below')} showLabel onClick={() => chain().addRowAfter().run()} />
          <RibbonButton icon={BetweenVerticalStart} label={t('Insert Left')} showLabel onClick={() => chain().addColumnBefore().run()} />
          <RibbonButton icon={BetweenVerticalEnd} label={t('Insert Right')} showLabel onClick={() => chain().addColumnAfter().run()} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Merge')} priority={3}>
        <RibbonButton large icon={Combine} label={t('Merge Cells')} disabled={!editor.can().mergeCells()} onClick={() => chain().mergeCells().run()} />
        <RibbonButton large icon={SquareSplitHorizontal} label={t('Split Cells')} disabled={!editor.can().splitCell()} onClick={() => chain().splitCell().run()} />
        <RibbonButton large icon={SquareSplitVertical} label={t('Split Table')} title={t('Split the table above the current row')} onClick={() => chain().splitTable().run()} />
      </RibbonGroup>
      <RibbonGroup label={t('Cell Size')} priority={2}>
        <MenuButton
          large
          icon={Table2}
          label={t('AutoFit')}
          items={[
            { label: t('AutoFit Contents'), onClick: () => autofit(editor) },
            { label: t('AutoFit Window'), onClick: () => autofit(editor) },
            { label: t('Fixed Column Width'), onClick: () => distributeColumns(editor) },
          ]}
        />
        <div className="col spinners">
          <Spinner
            label={t('Height')}
            value={((editor.state.selection.$from.node(Math.max(1, editor.state.selection.$from.depth - 2))?.attrs.rowHeight as number) ?? 0) / PX_PER_IN}
            step={0.1}
            max={22}
            width={70}
            format={(v) => (v ? formatLength(v, app.settings.unit) : t('Auto'))}
            parse={(s) => (/auto/i.test(s) || s.trim().toLowerCase() === t('Auto').toLowerCase() ? 0 : parseLength(s, app.settings.unit))}
            onChange={(v) => chain().setRowHeight(v ? Math.round(v * PX_PER_IN) : null).run()}
          />
          <Spinner
            label={t('Width')}
            value={currentColumnWidth(editor) / PX_PER_IN}
            step={0.1}
            max={22}
            width={70}
            format={(v) => (v ? formatLength(v, app.settings.unit) : t('Auto'))}
            parse={(text) => (/auto/i.test(text) || text === t('Auto') ? 0 : parseLength(text, app.settings.unit))}
            onChange={(v) => chain().setColumnWidth(v ? Math.round(v * PX_PER_IN) : null).run()}
          />
          <RibbonButton icon={Columns3} label={t('Distribute Rows')} showLabel onClick={() => chain().distributeRows().run()} />
          <RibbonButton icon={Columns3} label={t('Distribute Columns')} showLabel onClick={() => distributeColumns(editor)} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Alignment')} priority={3}>
        <div className="align-grid">
          {(['top', 'middle', 'bottom'] as const).map((v) =>
            (['left', 'center', 'right'] as const).map((h) => {
              const Icon = h === 'left' ? AlignLeft : h === 'center' ? AlignCenter : AlignRight
              const active = (cellAlign ?? 'top') === v && editor.isActive({ textAlign: h === 'left' ? 'left' : h })
              return (
                <button
                  key={`${v}-${h}`}
                  type="button"
                  className={cls('rb', 'align-cell', `va-${v}`, active && 'is-active')}
                  title={t(CELL_ALIGN_LABELS[`${v}-${h}`])}
                  aria-label={t(CELL_ALIGN_LABELS[`${v}-${h}`])}
                  onMouseDown={keepFocus}
                  onClick={() => align(h, v)}
                >
                  <Icon size={13} />
                </button>
              )
            }),
          )}
        </div>
        <div className="col">
          <MenuButton
            icon={TextDirectionIcon}
            label={t('Text Direction')}
            showLabel
            items={[
              { label: t('Horizontal'), onClick: () => chain().setCellAttribute('textDirection', null).run() },
              { label: t('Rotate All Text 90°'), onClick: () => chain().setCellAttribute('textDirection', 'tbRl').run() },
              { label: t('Rotate All Text 270°'), onClick: () => chain().setCellAttribute('textDirection', 'btLr').run() },
            ]}
          />
          <RibbonButton icon={PanelTopDashed} label={t('Cell Margins')} showLabel onClick={() => app.openDialog('cellMargins')} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Data')} priority={1}>
        <MenuButton
          large
          icon={ArrowDownAZ}
          label={t('Sort')}
          items={[
            { label: t('Sort Ascending (A to Z)'), detail: t('By the column of the cursor; the header row stays on top'), onClick: () => sortRows(editor, 1) },
            { label: t('Sort Descending (Z to A)'), onClick: () => sortRows(editor, -1) },
            'separator',
            { label: t('Sort…'), detail: t('Sort by up to three columns as text, numbers or dates'), onClick: () => app.openDialog('sortText') },
          ]}
        />
        <div className="col">
          <RibbonButton
            icon={LayoutGrid}
            label={t('Repeat Header Rows')}
            showLabel
            title={t('Repeat the first row at the top of each page')}
            active={!!currentTableAttrs(editor.state)?.repeatHeader}
            onClick={() => {
              const on = !currentTableAttrs(editor.state)?.repeatHeader
              const c = chain().setTableAttribute('repeatHeader', on)
              if (on && !editor.isActive('tableHeader')) c.toggleHeaderRow()
              c.run()
            }}
          />
          <RibbonButton icon={TextCursorInput} label={t('Convert to Text')} showLabel onClick={() => convertToText(editor)} />
          <RibbonButton icon={Calculator} label={t('Formula')} showLabel onClick={() => app.openDialog('formula')} />
        </div>
      </RibbonGroup>
    </>
  )
}

const OPTIONS: { id: TableOption; label: string }[] = [
  { id: 'headerRow', label: tx('Header Row') },
  { id: 'totalRow', label: tx('Total Row') },
  { id: 'bandedRows', label: tx('Banded Rows') },
  { id: 'firstColumn', label: tx('First Column') },
  { id: 'lastColumn', label: tx('Last Column') },
  { id: 'bandedColumns', label: tx('Banded Columns') },
]

const PEN_STYLES: { id: BorderPen['style']; label: string }[] = [
  { id: 'solid', label: tx('Single solid line') },
  { id: 'dashed', label: tx('Dashed line') },
  { id: 'dotted', label: tx('Dotted line') },
  { id: 'double', label: tx('Double line') },
  { id: 'none', label: tx('No Border') },
]

const BORDER_TARGETS: { id: BorderTarget; label: string }[] = [
  { id: 'bottom', label: tx('Bottom Border') },
  { id: 'top', label: tx('Top Border') },
  { id: 'left', label: tx('Left Border') },
  { id: 'right', label: tx('Right Border') },
  { id: 'none', label: tx('No Border') },
  { id: 'all', label: tx('All Borders') },
  { id: 'outside', label: tx('Outside Borders') },
  { id: 'inside', label: tx('Inside Borders') },
  { id: 'insideH', label: tx('Inside Horizontal Border') },
  { id: 'insideV', label: tx('Inside Vertical Border') },
]

export function TableDesignTab({ editor, app }: TabProps) {
  const attrs = currentTableAttrs(editor.state) ?? {}
  const chain = () => editor.chain().focus()
  const current = (attrs.tableStyle as TableStyleId) ?? 'grid'
  const cellBg = (editor.isActive('tableHeader') ? editor.getAttributes('tableHeader') : editor.getAttributes('tableCell')).backgroundColor as string | null
  return (
    <>
      <RibbonGroup label={t('Table Style Options')} priority={2}>
        <div className="options-grid">
          {OPTIONS.map((o) => (
            <CheckItem key={o.id} label={t(o.label)} checked={o.id === 'headerRow' ? attrs.headerRow !== false : !!attrs[o.id]} onChange={(v) => chain().setTableOption(o.id, v).run()} />
          ))}
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Table Styles')} priority={3}>
        <div className="table-style-gallery">
          {TABLE_STYLES.map((s) => (
            <button key={s.id} type="button" title={t(s.label)} className={cls('table-style-tile', `tsp-${s.id}`, current === s.id && 'is-active')} onMouseDown={keepFocus} onClick={() => chain().setTableStyle(s.id).run()}>
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i} />
              ))}
            </button>
          ))}
        </div>
        <ColorSplitButton large icon={PaintBucket} label={t('Shading')} color={cellBg ?? '#FFFFFF'} onApply={() => chain().setCellBackground(cellBg ?? '#D9E2F3').run()}>
          {(close) => (
            <FontColorPalette
              autoLabel={t('No Color')}
              onPick={(c) => {
                chain().setCellBackground(c).run()
                close()
              }}
              onAuto={() => {
                chain().setCellBackground(null).run()
                close()
              }}
            />
          )}
        </ColorSplitButton>
      </RibbonGroup>
      <RibbonGroup label={t('Borders')} priority={3} onLauncher={() => app.openDialog('bordersShading')} launcherTitle={t('Borders and Shading')}>
        <div className="col">
          <MenuButton
            icon={Grid2x2}
            label={t(PEN_STYLES.find((p) => p.id === app.tablePen.style)?.label ?? tx('Line Style'))}
            showLabel
            items={PEN_STYLES.map((p) => ({ label: t(p.label), active: app.tablePen.style === p.id, onClick: () => app.setTablePen({ ...app.tablePen, style: p.id }) }))}
          />
          <MenuButton
            icon={Grid2x2}
            label={`${app.tablePen.width} pt`}
            showLabel
            items={[0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6].map((w) => ({ label: `${w} pt`, active: app.tablePen.width === w, onClick: () => app.setTablePen({ ...app.tablePen, width: w }) }))}
          />
          <PopoverButton icon={PaintBucket} label={t('Pen Color')} showLabel className="palette-menu">
            {(close) => (
              <FontColorPalette
                autoLabel={t('Automatic')}
                onAuto={() => (close(), app.setTablePen({ ...app.tablePen, color: '#000000' }))}
                onPick={(c) => (close(), app.setTablePen({ ...app.tablePen, color: c }))}
              />
            )}
          </PopoverButton>
        </div>
        <MenuButton
          large
          icon={Grid2x2}
          label={t('Borders')}
          items={[
            ...BORDER_TARGETS.map((b) => ({ label: t(b.label), onClick: () => chain().setCellBorders(b.id, app.tablePen).run() })),
            'separator',
            { label: t('Table Style: All Borders'), active: current === 'grid', onClick: () => chain().setTableStyle('grid').run() },
            { label: t('Table Style: No Borders'), active: current === 'plain', onClick: () => chain().setTableStyle('plain').run() },
            'separator',
            { label: t('View Gridlines'), onClick: () => document.body.classList.toggle('show-table-gridlines') },
            { label: t('Borders and Shading…'), onClick: () => app.openDialog('bordersShading') },
          ]}
        />
        <RibbonButton large icon={Brush} label={t('Border Painter')} active={app.borderPainter} title={t('Click the edges of cells to draw borders with the current pen (Esc to stop)')} onClick={() => app.setBorderPainter(!app.borderPainter)} />
        <MenuButton
          large
          icon={AlignCenter}
          label={t('Table Alignment')}
          items={[
            { label: t('Left'), active: !attrs.tableAlign, onClick: () => chain().setTableAlign('left').run() },
            { label: t('Center'), active: attrs.tableAlign === 'center', onClick: () => chain().setTableAlign('center').run() },
            { label: t('Right'), active: attrs.tableAlign === 'right', onClick: () => chain().setTableAlign('right').run() },
          ]}
        />
      </RibbonGroup>
    </>
  )
}
