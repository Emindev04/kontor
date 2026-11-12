import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { DialogTabs, Modal, OkCancel } from '../ui'
import { formatLength, parseLength, type Unit } from '../../units'

type Tab = 'indents' | 'breaks'
type Special = 'none' | 'firstLine' | 'hanging'
type LineRule = 'single' | '1.5' | 'double' | 'atLeast' | 'exact' | 'multiple'

function parseLine(value: string | null): { rule: LineRule; at: string } {
  if (!value) return { rule: 'multiple', at: '1.08' }
  if (value.startsWith('exact:')) return { rule: 'exact', at: `${parseFloat(value.slice(6))} pt` }
  if (value.startsWith('atLeast:')) return { rule: 'atLeast', at: `${parseFloat(value.slice(8))} pt` }
  const n = parseFloat(value)
  if (n === 1) return { rule: 'single', at: '' }
  if (n === 1.5) return { rule: '1.5', at: '' }
  if (n === 2) return { rule: 'double', at: '' }
  return { rule: 'multiple', at: String(n) }
}

/** Paragraph dialog: Indents and Spacing, Line and Page Breaks. */
export function ParagraphDialog({ editor, unit, onClose }: { editor: Editor; unit: Unit; onClose: () => void }) {
  const p = editor.isActive('heading') ? editor.getAttributes('heading') : editor.getAttributes('paragraph')
  const fmt = (n: number) => formatLength(n, unit)
  const [tab, setTab] = useState<Tab>('indents')
  const [align, setAlign] = useState<string>((p.textAlign as string) ?? 'left')
  const [left, setLeft] = useState(fmt((p.indentLeft as number) ?? 0))
  const [right, setRight] = useState(fmt((p.indentRight as number) ?? 0))
  const first = (p.indentFirstLine as number) ?? 0
  const [special, setSpecial] = useState<Special>(first > 0 ? 'firstLine' : first < 0 ? 'hanging' : 'none')
  const [by, setBy] = useState(first ? fmt(Math.abs(first)) : fmt(0.5))
  const [before, setBefore] = useState(String((p.spaceBefore as number) ?? (editor.isActive('heading') ? 12 : 0)))
  const [after, setAfter] = useState(String((p.spaceAfter as number) ?? (editor.isActive('heading') ? 0 : 8)))
  const initialLine = parseLine((p.lineHeight as string) ?? null)
  const [rule, setRule] = useState<LineRule>(initialLine.rule)
  const [at, setAt] = useState(initialLine.at)
  const [widow, setWidow] = useState(p.widowControl !== false)
  const [keepNext, setKeepNext] = useState(p.keepNext ?? editor.isActive('heading'))
  const [keepLines, setKeepLines] = useState(!!p.keepLines)
  const [breakBefore, setBreakBefore] = useState(!!p.pageBreakBefore)

  const apply = () => {
    const len = (s: string, fallback: number) => parseLength(s, unit) ?? fallback
    const firstBy = len(by, 0.5)
    let lineHeight: string | null = null
    if (rule === 'single') lineHeight = '1'
    else if (rule === '1.5') lineHeight = '1.5'
    else if (rule === 'double') lineHeight = '2'
    else if (rule === 'multiple') lineHeight = String(parseFloat(at) || 1.08)
    else lineHeight = `${rule}:${parseFloat(at) || 12}`
    editor
      .chain()
      .focus()
      .setTextAlign(align)
      .setParagraphFormat({
        indentLeft: len(left, 0),
        indentRight: len(right, 0),
        indentFirstLine: special === 'none' ? 0 : special === 'firstLine' ? firstBy : -firstBy,
        spaceBefore: parseFloat(before) || 0,
        spaceAfter: parseFloat(after) || 0,
        lineHeight: lineHeight === '1.08' ? null : lineHeight,
        widowControl: widow,
        keepNext,
        keepLines,
        pageBreakBefore: breakBefore,
      })
      .run()
    onClose()
  }

  const lineHeightPreview = rule === 'single' ? 1.22 : rule === '1.5' ? 1.83 : rule === 'double' ? 2.44 : rule === 'multiple' ? 1.22 * (parseFloat(at) || 1.08) : 1.4

  return (
    <Modal title="Paragraph" onClose={onClose} width={500} footer={
        <OkCancel
          onOk={apply}
          onCancel={onClose}
          extra={
            <button
              type="button"
              className="btn"
              onClick={() => {
                onClose()
                window.dispatchEvent(new CustomEvent('kontor:open-dialog', { detail: 'tabs' }))
              }}
            >
              Tabs…
            </button>
          }
        />
      }
    >
      <DialogTabs
        tabs={[
          { id: 'indents', label: 'Indents and Spacing' },
          { id: 'breaks', label: 'Line and Page Breaks' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'indents' ? (
        <div className="dlg-stack">
          <fieldset className="dlg-fieldset">
            <legend>General</legend>
            <label className="dlg-inline">
              Alignment:
              <select value={align} onChange={(e) => setAlign(e.target.value)}>
                <option value="left">Left</option>
                <option value="center">Centered</option>
                <option value="right">Right</option>
                <option value="justify">Justified</option>
              </select>
            </label>
          </fieldset>
          <fieldset className="dlg-fieldset dlg-two">
            <legend>Indentation</legend>
            <label className="dlg-inline">
              Left: <input value={left} onChange={(e) => setLeft(e.target.value)} />
            </label>
            <label className="dlg-inline">
              Special:
              <select value={special} onChange={(e) => setSpecial(e.target.value as Special)}>
                <option value="none">(none)</option>
                <option value="firstLine">First line</option>
                <option value="hanging">Hanging</option>
              </select>
            </label>
            <label className="dlg-inline">
              Right: <input value={right} onChange={(e) => setRight(e.target.value)} />
            </label>
            <label className="dlg-inline">
              By: <input value={by} disabled={special === 'none'} onChange={(e) => setBy(e.target.value)} />
            </label>
          </fieldset>
          <fieldset className="dlg-fieldset dlg-two">
            <legend>Spacing</legend>
            <label className="dlg-inline">
              Before: <input value={before} onChange={(e) => setBefore(e.target.value)} /> pt
            </label>
            <label className="dlg-inline">
              Line spacing:
              <select value={rule} onChange={(e) => setRule(e.target.value as LineRule)}>
                <option value="single">Single</option>
                <option value="1.5">1.5 lines</option>
                <option value="double">Double</option>
                <option value="atLeast">At least</option>
                <option value="exact">Exactly</option>
                <option value="multiple">Multiple</option>
              </select>
            </label>
            <label className="dlg-inline">
              After: <input value={after} onChange={(e) => setAfter(e.target.value)} /> pt
            </label>
            <label className="dlg-inline">
              At: <input value={at} disabled={rule === 'single' || rule === '1.5' || rule === 'double'} onChange={(e) => setAt(e.target.value)} />
            </label>
          </fieldset>
          <fieldset className="dlg-fieldset">
            <legend>Preview</legend>
            <div className="para-preview">
              <p className="pp-gray">Previous paragraph previous paragraph previous paragraph previous paragraph.</p>
              <p style={{ textAlign: align as React.CSSProperties['textAlign'], lineHeight: lineHeightPreview, marginLeft: `${(parseLength(left, unit) ?? 0) * 12}px`, marginRight: `${(parseLength(right, unit) ?? 0) * 12}px`, textIndent: special === 'none' ? 0 : `${(special === 'hanging' ? -1 : 1) * (parseLength(by, unit) ?? 0.5) * 12}px`, marginTop: `${parseFloat(before) / 3 || 0}px`, marginBottom: `${parseFloat(after) / 3 || 0}px` }}>
                Sample text sample text sample text sample text sample text sample text sample text sample text sample text sample text.
              </p>
              <p className="pp-gray">Following paragraph following paragraph following paragraph following paragraph.</p>
            </div>
          </fieldset>
        </div>
      ) : (
        <div className="dlg-stack">
          <fieldset className="dlg-fieldset">
            <legend>Pagination</legend>
            <label><input type="checkbox" checked={widow} onChange={(e) => setWidow(e.target.checked)} /> Widow/Orphan control</label>
            <label><input type="checkbox" checked={!!keepNext} onChange={(e) => setKeepNext(e.target.checked)} /> Keep with next</label>
            <label><input type="checkbox" checked={keepLines} onChange={(e) => setKeepLines(e.target.checked)} /> Keep lines together</label>
            <label><input type="checkbox" checked={breakBefore} onChange={(e) => setBreakBefore(e.target.checked)} /> Page break before</label>
          </fieldset>
        </div>
      )}
    </Modal>
  )
}
