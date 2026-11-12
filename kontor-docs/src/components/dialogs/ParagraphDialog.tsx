import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { DialogTabs, Modal, OkCancel } from '../ui'
import { formatLength, parseLength, type Unit } from '../../units'
import { t } from '../../i18n'

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
  const isHeading = editor.isActive('heading')
  const [outlineLevel, setOutlineLevel] = useState<number>(isHeading ? ((p.level as number) ?? 1) : ((p.outlineLevel as number) ?? 0))
  const [mirror, setMirror] = useState(!!p.mirrorIndents)
  const [contextual, setContextual] = useState(!!p.contextualSpacing)
  const [noLineNumbers, setNoLineNumbers] = useState(!!p.suppressLineNumbers)
  const [noHyphenate, setNoHyphenate] = useState(!!p.noHyphenate)

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
        mirrorIndents: mirror || null,
        contextualSpacing: contextual || null,
        suppressLineNumbers: noLineNumbers || null,
        noHyphenate: noHyphenate || null,
        ...(isHeading ? {} : { outlineLevel: outlineLevel || null }),
      })
      .run()
    onClose()
  }

  const lineHeightPreview = rule === 'single' ? 1.22 : rule === '1.5' ? 1.83 : rule === 'double' ? 2.44 : rule === 'multiple' ? 1.22 * (parseFloat(at) || 1.08) : 1.4

  return (
    <Modal title={t('Paragraph')} onClose={onClose} width={500} footer={
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
              {t('Tabs…')}</button>
          }
        />
      }
    >
      <DialogTabs
        tabs={[
          { id: 'indents', label: t('Indents and Spacing') },
          { id: 'breaks', label: t('Line and Page Breaks') },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'indents' ? (
        <div className="dlg-stack">
          <fieldset className="dlg-fieldset">
            <legend>{t('General')}</legend>
            <label className="dlg-inline">
              {t('Alignment:')}<select value={align} onChange={(e) => setAlign(e.target.value)}>
                <option value="left">{t('Left')}</option>
                <option value="center">{t('Centered')}</option>
                <option value="right">{t('Right')}</option>
                <option value="justify">{t('Justified')}</option>
              </select>
            </label>
            <label className="dlg-inline">
              {t('Outline level:')}
              <select value={outlineLevel} disabled={isHeading} onChange={(e) => setOutlineLevel(Number(e.target.value))}>
                <option value={0}>{t('Body Text')}</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (
                  <option key={l} value={l}>{t('Level {n}', { n: l })}</option>
                ))}
              </select>
            </label>
          </fieldset>
          <fieldset className="dlg-fieldset dlg-two">
            <legend>{t('Indentation')}</legend>
            <label className="dlg-inline">
              {mirror ? t('Inside:') : t('Left:')} <input value={left} onChange={(e) => setLeft(e.target.value)} />
            </label>
            <label className="dlg-inline">
              {t('Special:')}<select value={special} onChange={(e) => setSpecial(e.target.value as Special)}>
                <option value="none">{t('(none)')}</option>
                <option value="firstLine">{t('First line')}</option>
                <option value="hanging">{t('Hanging')}</option>
              </select>
            </label>
            <label className="dlg-inline">
              {mirror ? t('Outside:') : t('Right:')} <input value={right} onChange={(e) => setRight(e.target.value)} />
            </label>
            <label className="dlg-inline">
              {t('By:')}{' '}<input value={by} disabled={special === 'none'} onChange={(e) => setBy(e.target.value)} />
            </label>
            <label><input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> {t('Mirror indents')}</label>
          </fieldset>
          <fieldset className="dlg-fieldset dlg-two">
            <legend>{t('Spacing')}</legend>
            <label className="dlg-inline">
              {t('Before:')}{' '}<input value={before} onChange={(e) => setBefore(e.target.value)} /> {t('pt')}</label>
            <label className="dlg-inline">
              {t('Line spacing:')}<select value={rule} onChange={(e) => setRule(e.target.value as LineRule)}>
                <option value="single">{t('Single')}</option>
                <option value="1.5">{t('1.5 lines')}</option>
                <option value="double">{t('Double')}</option>
                <option value="atLeast">{t('At least')}</option>
                <option value="exact">{t('Exactly')}</option>
                <option value="multiple">{t('Multiple')}</option>
              </select>
            </label>
            <label className="dlg-inline">
              {t('After:')}{' '}<input value={after} onChange={(e) => setAfter(e.target.value)} /> {t('pt')}</label>
            <label className="dlg-inline">
              {t('At:')}{' '}<input value={at} disabled={rule === 'single' || rule === '1.5' || rule === 'double'} onChange={(e) => setAt(e.target.value)} />
            </label>
            <label><input type="checkbox" checked={contextual} onChange={(e) => setContextual(e.target.checked)} /> {t("Don't add space between paragraphs of the same style")}</label>
          </fieldset>
          <fieldset className="dlg-fieldset">
            <legend>{t('Preview')}</legend>
            <div className="para-preview">
              <p className="pp-gray">{t('Previous paragraph previous paragraph previous paragraph previous paragraph.')}</p>
              <p style={{ textAlign: align as React.CSSProperties['textAlign'], lineHeight: lineHeightPreview, marginLeft: `${(parseLength(left, unit) ?? 0) * 12}px`, marginRight: `${(parseLength(right, unit) ?? 0) * 12}px`, textIndent: special === 'none' ? 0 : `${(special === 'hanging' ? -1 : 1) * (parseLength(by, unit) ?? 0.5) * 12}px`, marginTop: `${parseFloat(before) / 3 || 0}px`, marginBottom: `${parseFloat(after) / 3 || 0}px` }}>
                {t('Sample text sample text sample text sample text sample text sample text sample text sample text sample text sample text.')}</p>
              <p className="pp-gray">{t('Following paragraph following paragraph following paragraph following paragraph.')}</p>
            </div>
          </fieldset>
        </div>
      ) : (
        <div className="dlg-stack">
          <fieldset className="dlg-fieldset">
            <legend>{t('Pagination')}</legend>
            <label><input type="checkbox" checked={widow} onChange={(e) => setWidow(e.target.checked)} /> {t('Widow/Orphan control')}</label>
            <label><input type="checkbox" checked={!!keepNext} onChange={(e) => setKeepNext(e.target.checked)} /> {t('Keep with next')}</label>
            <label><input type="checkbox" checked={keepLines} onChange={(e) => setKeepLines(e.target.checked)} /> {t('Keep lines together')}</label>
            <label><input type="checkbox" checked={breakBefore} onChange={(e) => setBreakBefore(e.target.checked)} /> {t('Page break before')}</label>
          </fieldset>
          <fieldset className="dlg-fieldset">
            <legend>{t('Formatting exceptions')}</legend>
            <label><input type="checkbox" checked={noLineNumbers} onChange={(e) => setNoLineNumbers(e.target.checked)} /> {t('Suppress line numbers')}</label>
            <label><input type="checkbox" checked={noHyphenate} onChange={(e) => setNoHyphenate(e.target.checked)} /> {t("Don't hyphenate")}</label>
          </fieldset>
        </div>
      )}
    </Modal>
  )
}
