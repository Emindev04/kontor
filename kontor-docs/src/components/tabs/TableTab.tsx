import {
  Brush, Calculator, PanelTopDashed, Settings2, SquareSplitVertical, TextQuote as TextDirectionIcon, AlignCenter, AlignLeft, AlignRight, ArrowDownAZ, BetweenHorizontalEnd, BetweenHorizontalStart, BetweenVerticalEnd, BetweenVerticalStart,
  Columns3, Combine, Grid2x2, LayoutGrid, MousePointerClick, PaintBucket, SquareSplitHorizontal, Table2, TextCursorInput, Trash2,
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

/** Sorts the body rows by the text of the column the cursor is in. */
function sortRows(editor: Editor, dir: 1 | -1) {
  const t = tableAt(editor)
  const cp = cellPos(editor)
  if (!t || cp == null) return
  const map = TableMap.get(t.node)
  const col = map.colCount(cp - t.pos - 1)
  const rows: PMNode[] = []
  t.node.forEach((row) => rows.push(row))
  const hasHeader = t.node.attrs.headerRow !== false && rows.length > 1
  const head = hasHeader ? rows.slice(0, 1) : []
  const body = rows.slice(head.length)
  if (body.some((r) => r.childCount !== map.width)) return alert('Rows with merged cells cannot be sorted.')
  const key = (r: PMNode) => r.child(Math.min(col, r.childCount - 1)).textContent
  body.sort((a, b) => dir * key(a).localeCompare(key(b), 'en-US', { numeric: true, sensitivity: 'base' }))
  const table = t.node.type.create(t.node.attrs, [...head, ...body])
  editor.view.dispatch(editor.state.tr.replaceWith(t.pos, t.pos + t.node.nodeSize, table))
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
      <RibbonGroup label="Table" priority={1}>
        <div className="col">
          <MenuButton
            icon={MousePointerClick}
            label="Select"
            showLabel
            items={[
              { label: 'Select Cell', onClick: () => select(editor, 'cell') },
              { label: 'Select Column', onClick: () => select(editor, 'column') },
              { label: 'Select Row', onClick: () => select(editor, 'row') },
              { label: 'Select Table', onClick: () => select(editor, 'table') },
            ]}
          />
          <RibbonButton icon={Grid2x2} label="View Gridlines" showLabel onClick={() => document.body.classList.toggle('show-table-gridlines')} />
          <RibbonButton icon={Settings2} label="Properties" showLabel onClick={() => app.openDialog('tableProperties')} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Rows & Columns" priority={4}>
        <MenuButton
          large
          icon={Trash2}
          label="Delete"
          items={[
            { label: 'Delete Cells (Shift Cells Left)', onClick: () => chain().deleteCellsShiftLeft().run() },
            { label: 'Delete Columns', onClick: () => chain().deleteColumn().run() },
            { label: 'Delete Rows', onClick: () => chain().deleteRow().run() },
            { label: 'Delete Table', onClick: () => chain().deleteTable().run() },
          ]}
        />
        <RibbonButton large icon={BetweenHorizontalStart} label="Insert Above" onClick={() => chain().addRowBefore().run()} />
        <div className="col">
          <RibbonButton icon={BetweenHorizontalEnd} label="Insert Below" showLabel onClick={() => chain().addRowAfter().run()} />
          <RibbonButton icon={BetweenVerticalStart} label="Insert Left" showLabel onClick={() => chain().addColumnBefore().run()} />
          <RibbonButton icon={BetweenVerticalEnd} label="Insert Right" showLabel onClick={() => chain().addColumnAfter().run()} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Merge" priority={3}>
        <RibbonButton large icon={Combine} label="Merge Cells" disabled={!editor.can().mergeCells()} onClick={() => chain().mergeCells().run()} />
        <RibbonButton large icon={SquareSplitHorizontal} label="Split Cells" disabled={!editor.can().splitCell()} onClick={() => chain().splitCell().run()} />
        <RibbonButton large icon={SquareSplitVertical} label="Split Table" title="Split the table above the current row" onClick={() => chain().splitTable().run()} />
      </RibbonGroup>
      <RibbonGroup label="Cell Size" priority={2}>
        <MenuButton
          large
          icon={Table2}
          label="AutoFit"
          items={[
            { label: 'AutoFit Contents', onClick: () => autofit(editor) },
            { label: 'AutoFit Window', onClick: () => autofit(editor) },
            { label: 'Fixed Column Width', onClick: () => distributeColumns(editor) },
          ]}
        />
        <div className="col spinners">
          <Spinner
            label="Height"
            value={((editor.state.selection.$from.node(Math.max(1, editor.state.selection.$from.depth - 2))?.attrs.rowHeight as number) ?? 0) / PX_PER_IN}
            step={0.1}
            max={22}
            width={70}
            format={(v) => (v ? formatLength(v, app.settings.unit) : 'Auto')}
            parse={(t) => (/auto/i.test(t) ? 0 : parseLength(t, app.settings.unit))}
            onChange={(v) => chain().setRowHeight(v ? Math.round(v * PX_PER_IN) : null).run()}
          />
          <RibbonButton icon={Columns3} label="Distribute Rows" showLabel onClick={() => chain().distributeRows().run()} />
          <RibbonButton icon={Columns3} label="Distribute Columns" showLabel onClick={() => distributeColumns(editor)} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Alignment" priority={3}>
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
                  title={`Align ${v === 'middle' ? 'Center' : v[0].toUpperCase() + v.slice(1)} ${h[0].toUpperCase() + h.slice(1)}`}
                  aria-label={`Align ${v} ${h}`}
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
            label="Text Direction"
            showLabel
            items={[
              { label: 'Horizontal', onClick: () => chain().setCellAttribute('textDirection', null).run() },
              { label: 'Rotate All Text 90°', onClick: () => chain().setCellAttribute('textDirection', 'tbRl').run() },
              { label: 'Rotate All Text 270°', onClick: () => chain().setCellAttribute('textDirection', 'btLr').run() },
            ]}
          />
          <RibbonButton icon={PanelTopDashed} label="Cell Margins" showLabel onClick={() => app.openDialog('cellMargins')} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Data" priority={1}>
        <MenuButton
          large
          icon={ArrowDownAZ}
          label="Sort"
          items={[
            { label: 'Sort Ascending (A to Z)', detail: 'By the column of the cursor; the header row stays on top', onClick: () => sortRows(editor, 1) },
            { label: 'Sort Descending (Z to A)', onClick: () => sortRows(editor, -1) },
          ]}
        />
        <div className="col">
          <RibbonButton
            icon={LayoutGrid}
            label="Repeat Header Rows"
            showLabel
            title="Repeat the first row at the top of each page"
            active={!!currentTableAttrs(editor.state)?.repeatHeader}
            onClick={() => {
              const on = !currentTableAttrs(editor.state)?.repeatHeader
              const c = chain().setTableAttribute('repeatHeader', on)
              if (on && !editor.isActive('tableHeader')) c.toggleHeaderRow()
              c.run()
            }}
          />
          <RibbonButton icon={TextCursorInput} label="Convert to Text" showLabel onClick={() => convertToText(editor)} />
          <RibbonButton icon={Calculator} label="Formula" showLabel onClick={() => app.openDialog('formula')} />
        </div>
      </RibbonGroup>
    </>
  )
}

const OPTIONS: { id: TableOption; label: string }[] = [
  { id: 'headerRow', label: 'Header Row' },
  { id: 'totalRow', label: 'Total Row' },
  { id: 'bandedRows', label: 'Banded Rows' },
  { id: 'firstColumn', label: 'First Column' },
  { id: 'lastColumn', label: 'Last Column' },
  { id: 'bandedColumns', label: 'Banded Columns' },
]

const PEN_STYLES: { id: BorderPen['style']; label: string }[] = [
  { id: 'solid', label: 'Single solid line' },
  { id: 'dashed', label: 'Dashed line' },
  { id: 'dotted', label: 'Dotted line' },
  { id: 'double', label: 'Double line' },
  { id: 'none', label: 'No Border' },
]

const BORDER_TARGETS: { id: BorderTarget; label: string }[] = [
  { id: 'bottom', label: 'Bottom Border' },
  { id: 'top', label: 'Top Border' },
  { id: 'left', label: 'Left Border' },
  { id: 'right', label: 'Right Border' },
  { id: 'none', label: 'No Border' },
  { id: 'all', label: 'All Borders' },
  { id: 'outside', label: 'Outside Borders' },
  { id: 'inside', label: 'Inside Borders' },
  { id: 'insideH', label: 'Inside Horizontal Border' },
  { id: 'insideV', label: 'Inside Vertical Border' },
]

export function TableDesignTab({ editor, app }: TabProps) {
  const attrs = currentTableAttrs(editor.state) ?? {}
  const chain = () => editor.chain().focus()
  const current = (attrs.tableStyle as TableStyleId) ?? 'grid'
  const cellBg = (editor.isActive('tableHeader') ? editor.getAttributes('tableHeader') : editor.getAttributes('tableCell')).backgroundColor as string | null
  return (
    <>
      <RibbonGroup label="Table Style Options" priority={2}>
        <div className="options-grid">
          {OPTIONS.map((o) => (
            <CheckItem key={o.id} label={o.label} checked={o.id === 'headerRow' ? attrs.headerRow !== false : !!attrs[o.id]} onChange={(v) => chain().setTableOption(o.id, v).run()} />
          ))}
        </div>
      </RibbonGroup>
      <RibbonGroup label="Table Styles" priority={3}>
        <div className="table-style-gallery">
          {TABLE_STYLES.map((s) => (
            <button key={s.id} type="button" title={s.label} className={cls('table-style-tile', `tsp-${s.id}`, current === s.id && 'is-active')} onMouseDown={keepFocus} onClick={() => chain().setTableStyle(s.id).run()}>
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i} />
              ))}
            </button>
          ))}
        </div>
        <ColorSplitButton large icon={PaintBucket} label="Shading" color={cellBg ?? '#FFFFFF'} onApply={() => chain().setCellBackground(cellBg ?? '#D9E2F3').run()}>
          {(close) => (
            <FontColorPalette
              autoLabel="No Color"
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
      <RibbonGroup label="Borders" priority={3} onLauncher={() => app.openDialog('bordersShading')} launcherTitle="Borders and Shading">
        <div className="col">
          <MenuButton
            icon={Grid2x2}
            label={PEN_STYLES.find((p) => p.id === app.tablePen.style)?.label ?? 'Line Style'}
            showLabel
            items={PEN_STYLES.map((p) => ({ label: p.label, active: app.tablePen.style === p.id, onClick: () => app.setTablePen({ ...app.tablePen, style: p.id }) }))}
          />
          <MenuButton
            icon={Grid2x2}
            label={`${app.tablePen.width} pt`}
            showLabel
            items={[0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6].map((w) => ({ label: `${w} pt`, active: app.tablePen.width === w, onClick: () => app.setTablePen({ ...app.tablePen, width: w }) }))}
          />
          <PopoverButton icon={PaintBucket} label="Pen Color" showLabel className="palette-menu">
            {(close) => (
              <FontColorPalette
                autoLabel="Automatic"
                onAuto={() => (close(), app.setTablePen({ ...app.tablePen, color: '#000000' }))}
                onPick={(c) => (close(), app.setTablePen({ ...app.tablePen, color: c }))}
              />
            )}
          </PopoverButton>
        </div>
        <MenuButton
          large
          icon={Grid2x2}
          label="Borders"
          items={[
            ...BORDER_TARGETS.map((b) => ({ label: b.label, onClick: () => chain().setCellBorders(b.id, app.tablePen).run() })),
            'separator',
            { label: 'Table Style: All Borders', active: current === 'grid', onClick: () => chain().setTableStyle('grid').run() },
            { label: 'Table Style: No Borders', active: current === 'plain', onClick: () => chain().setTableStyle('plain').run() },
            'separator',
            { label: 'View Gridlines', onClick: () => document.body.classList.toggle('show-table-gridlines') },
            { label: 'Borders and Shading…', onClick: () => app.openDialog('bordersShading') },
          ]}
        />
        <RibbonButton large icon={Brush} label="Border Painter" active={app.borderPainter} title="Click the edges of cells to draw borders with the current pen (Esc to stop)" onClick={() => app.setBorderPainter(!app.borderPainter)} />
        <MenuButton
          large
          icon={AlignCenter}
          label="Table Alignment"
          items={[
            { label: 'Left', active: !attrs.tableAlign, onClick: () => chain().setTableAlign('left').run() },
            { label: 'Center', active: attrs.tableAlign === 'center', onClick: () => chain().setTableAlign('center').run() },
            { label: 'Right', active: attrs.tableAlign === 'right', onClick: () => chain().setTableAlign('right').run() },
          ]}
        />
      </RibbonGroup>
    </>
  )
}
