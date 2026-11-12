import {
  Columns2, Columns3, ListOrdered, ArrowDownToLine, ArrowUpToLine, File, IndentDecrease, IndentIncrease, RectangleHorizontal, RectangleVertical,
  SeparatorHorizontal, Square, WrapText,
} from 'lucide-react'
import { MenuButton, RibbonGroup, Spinner } from '../ui'
import { MARGIN_PRESETS, PAPER, type PaperSize } from '../../pageSetup'
import { formatLength, parseLength } from '../../units'
import { ArrangeGroup } from './DrawingGroups'
import type { TabProps } from './types'
import { hyphenateManually } from '../../editor/hyphenate'
import type { ColumnsAttrs } from '../../editor/Sections'

const pt = (n: number) => `${Math.round(n * 10) / 10} pt`
const parsePt = (s: string) => {
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

export function LayoutTab({ editor, app }: TabProps) {
  const { setup, setSetup, settings } = app
  const chain = () => editor.chain().focus()
  const m = setup.margins
  const same = (o: typeof m) => o.top === m.top && o.bottom === m.bottom && o.left === m.left && o.right === m.right
  const unit = settings.unit
  const fmt = (n: number) => formatLength(n, unit)
  const parse = (s: string) => parseLength(s, unit)
  const para = editor.isActive('heading') ? editor.getAttributes('heading') : editor.getAttributes('paragraph')
  const cols = editor.isActive('columns') ? (editor.getAttributes('columns') as ColumnsAttrs) : null
  const setCols = (count: number, preset: ColumnsAttrs['preset'] = 'equal') => chain().setColumns({ count, preset, gap: cols?.gap ?? 0.5, line: cols?.line ?? false }, editor.state.selection.empty ? 'section' : 'selection').run()

  return (
    <>
      <RibbonGroup label="Page Setup" priority={4} onLauncher={() => app.openDialog('pageSetup')} launcherTitle="Page Setup">
        <MenuButton
          large
          wide
          icon={Square}
          label="Margins"
          items={[
            ...MARGIN_PRESETS.map((p) => ({
              label: p.label,
              detail: p.mirrored
                ? `Top: ${fmt(p.margins.top)}  Bottom: ${fmt(p.margins.bottom)}  Inside: ${fmt(p.margins.left)}  Outside: ${fmt(p.margins.right)}`
                : `Top: ${fmt(p.margins.top)}  Bottom: ${fmt(p.margins.bottom)}  Left: ${fmt(p.margins.left)}  Right: ${fmt(p.margins.right)}`,
              active: same(p.margins) && !!p.mirrored === setup.mirrored,
              onClick: () => setSetup({ ...setup, margins: p.margins, mirrored: !!p.mirrored }),
            })),
            'separator' as const,
            { label: 'Custom Margins…', onClick: () => app.openDialog('pageSetup') },
          ]}
        />
        <MenuButton
          large
          icon={setup.orientation === 'portrait' ? RectangleVertical : RectangleHorizontal}
          label="Orientation"
          items={[
            { label: 'Portrait', icon: RectangleVertical, active: setup.orientation === 'portrait', onClick: () => setSetup({ ...setup, orientation: 'portrait' }) },
            { label: 'Landscape', icon: RectangleHorizontal, active: setup.orientation === 'landscape', onClick: () => setSetup({ ...setup, orientation: 'landscape' }) },
          ]}
        />
        <MenuButton
          large
          wide
          icon={File}
          label="Size"
          items={[
            ...(Object.keys(PAPER) as PaperSize[]).map((key) => ({
              label: PAPER[key].label,
              detail: `${fmt(PAPER[key].w)} × ${fmt(PAPER[key].h)}`,
              active: setup.size === key,
              onClick: () => setSetup({ ...setup, size: key }),
            })),
            'separator' as const,
            { label: 'More Paper Sizes…', onClick: () => app.openDialog('pageSetup') },
          ]}
        />
        <MenuButton
          large
          icon={cols && cols.count >= 3 ? Columns3 : Columns2}
          label="Columns"
          items={[
            { label: 'One', active: !cols, onClick: () => setCols(1) },
            { label: 'Two', active: cols?.count === 2 && cols.preset === 'equal', onClick: () => setCols(2) },
            { label: 'Three', active: cols?.count === 3, onClick: () => setCols(3) },
            { label: 'Left', detail: 'Two columns, the left one narrower', active: cols?.preset === 'left', onClick: () => setCols(2, 'left') },
            { label: 'Right', detail: 'Two columns, the right one narrower', active: cols?.preset === 'right', onClick: () => setCols(2, 'right') },
            'separator' as const,
            { label: 'More Columns…', onClick: () => app.openDialog('columns') },
          ]}
        />
        <div className="col">
          <MenuButton
            icon={SeparatorHorizontal}
            label="Breaks"
            showLabel
            wide
            items={[
              { heading: 'Page Breaks' },
              { label: 'Page', detail: 'Mark the point at which one page ends and the next page begins (Ctrl+Enter).', onClick: () => chain().setPageBreak().run() },
              { label: 'Column', detail: 'Indicate that the text following the column break will begin in the next column (Ctrl+Shift+Enter).', onClick: () => chain().insertColumnBreak().run() },
              { label: 'Text Wrapping', detail: 'Start a new line in the same paragraph (Shift+Enter).', onClick: () => chain().setHardBreak().run() },
              { heading: 'Section Breaks' },
              { label: 'Next Page', detail: 'Insert a section break and start the new section on the next page.', onClick: () => chain().insertSectionBreak('nextPage').run() },
              { label: 'Continuous', detail: 'Insert a section break and start the new section on the same page.', onClick: () => chain().insertSectionBreak('continuous').run() },
              { label: 'Even Page', detail: 'Insert a section break and start the new section on the next even-numbered page.', onClick: () => chain().insertSectionBreak('evenPage').run() },
              { label: 'Odd Page', detail: 'Insert a section break and start the new section on the next odd-numbered page.', onClick: () => chain().insertSectionBreak('oddPage').run() },
            ]}
          />
          <MenuButton
            icon={ListOrdered}
            label="Line Numbers"
            showLabel
            items={[
              { label: 'None', active: setup.lineNumbers === 'none', onClick: () => setSetup({ ...setup, lineNumbers: 'none' }) },
              { label: 'Continuous', active: setup.lineNumbers === 'continuous', onClick: () => setSetup({ ...setup, lineNumbers: 'continuous' }) },
              { label: 'Restart Each Page', active: setup.lineNumbers === 'restartPage', onClick: () => setSetup({ ...setup, lineNumbers: 'restartPage' }) },
              { label: 'Suppress for Current Paragraph', checked: !!para.suppressLineNumbers, onClick: () => chain().setParagraphFormat({ suppressLineNumbers: !para.suppressLineNumbers || null }).run() },
            ]}
          />
          <MenuButton
            icon={WrapText}
            label="Hyphenation"
            showLabel
            items={[
              { label: 'None', active: !app.design.hyphenation, onClick: () => app.setDesign({ ...app.design, hyphenation: false }) },
              { label: 'Automatic', active: app.design.hyphenation, onClick: () => app.setDesign({ ...app.design, hyphenation: true }) },
              { label: 'Manual', detail: 'Add optional hyphens to the long words of the selection or document', onClick: () => {
                const n = hyphenateManually(editor)
                alert(n ? `Optional hyphens were added to ${n} word${n === 1 ? '' : 's'}. They show only where a word breaks at the end of a line.` : 'No words long enough to hyphenate were found.')
              } },
              'separator',
              { label: 'Hyphenation Options…', onClick: () => app.openDialog('hyphenation') },
            ]}
          />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Paragraph" priority={3} onLauncher={() => app.openDialog('paragraph')} launcherTitle="Paragraph Settings">
        <div className="col spinners">
          <div className="spinner-heading">Indent</div>
          <Spinner icon={IndentIncrease} label="Left" value={(para.indentLeft as number) ?? 0} step={0.1} min={-5} max={10} format={fmt} parse={parse} onChange={(v) => chain().setParagraphFormat({ indentLeft: v }).run()} />
          <Spinner icon={IndentDecrease} label="Right" value={(para.indentRight as number) ?? 0} step={0.1} min={-5} max={10} format={fmt} parse={parse} onChange={(v) => chain().setParagraphFormat({ indentRight: v }).run()} />
        </div>
        <div className="col spinners">
          <div className="spinner-heading">Spacing</div>
          <Spinner icon={ArrowUpToLine} label="Before" value={(para.spaceBefore as number) ?? 0} step={6} max={1584} format={pt} parse={parsePt} onChange={(v) => chain().setParagraphFormat({ spaceBefore: v }).run()} />
          <Spinner icon={ArrowDownToLine} label="After" value={(para.spaceAfter as number) ?? 8} step={6} max={1584} format={pt} parse={parsePt} onChange={(v) => chain().setParagraphFormat({ spaceAfter: v }).run()} />
        </div>
      </RibbonGroup>
      <ArrangeGroup editor={editor} app={app} />
    </>
  )
}
