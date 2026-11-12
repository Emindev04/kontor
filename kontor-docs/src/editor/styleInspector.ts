import type { Editor } from '@tiptap/core'
import { t, tx } from '../i18n'

const ALIGN: Record<string, string> = { center: tx('Centered'), right: tx('Right'), justify: tx('Justified') }

// Style Inspector: the style at the cursor and the direct formatting added on top of it, for the
// paragraph and for the text.

const inch = (v: number) => `${Math.round(v * 100) / 100}"`

/** Direct paragraph formatting (beyond the style) as readable lines. */
export function paragraphFormatting(editor: Editor): string[] {
  const a = editor.isActive('heading') ? editor.getAttributes('heading') : editor.getAttributes('paragraph')
  const out: string[] = []
  if (a.textAlign && a.textAlign !== 'left') out.push(t('Alignment: {value}', { value: t(ALIGN[a.textAlign] ?? 'Left') }))
  if (a.indentLeft) out.push(t('Left indent: {value}', { value: inch(a.indentLeft) }))
  if (a.indentRight) out.push(t('Right indent: {value}', { value: inch(a.indentRight) }))
  if (a.indentFirstLine > 0) out.push(t('First line: {value}', { value: inch(a.indentFirstLine) }))
  if (a.indentFirstLine < 0) out.push(t('Hanging: {value}', { value: inch(-a.indentFirstLine) }))
  if (a.spaceBefore != null) out.push(t('Space before: {value} pt', { value: a.spaceBefore }))
  if (a.spaceAfter != null) out.push(t('Space after: {value} pt', { value: a.spaceAfter }))
  if (a.lineHeight) out.push(t('Line spacing: {value}', { value: String(a.lineHeight).replace('exact:', '= ').replace('atLeast:', '≥ ') }))
  if (a.shading) out.push(t('Shading: {value}', { value: a.shading }))
  if (a.borders) out.push(t('Borders'))
  if (a.keepNext && !editor.isActive('heading')) out.push(t('Keep with next'))
  if (a.keepLines) out.push(t('Keep lines together'))
  if (a.pageBreakBefore) out.push(t('Page break before'))
  if (a.outlineLevel) out.push(t('Level {n}', { n: a.outlineLevel }))
  if (a.dir === 'rtl') out.push(t('Right-to-left'))
  return out
}

/** Direct character formatting at the cursor as readable lines. */
export function textFormatting(editor: Editor): string[] {
  const out: string[] = []
  const ts = editor.getAttributes('textStyle')
  if (ts.fontFamily) out.push(String(ts.fontFamily).split(',')[0].replace(/["']/g, ''))
  if (ts.fontSize) out.push(String(ts.fontSize))
  if (editor.isActive('bold')) out.push(t('Bold'))
  if (editor.isActive('italic')) out.push(t('Italic'))
  if (editor.isActive('underline')) out.push(t('Underline'))
  if (editor.isActive('strike')) out.push(t('Strikethrough'))
  if (editor.isActive('superscript')) out.push(t('Superscript'))
  if (editor.isActive('subscript')) out.push(t('Subscript'))
  if (ts.color) out.push(t('Font color: {value}', { value: ts.color }))
  if (editor.isActive('highlight')) out.push(t('Highlight'))
  return out
}

/** Clears the direct paragraph formatting (keeps the style). */
export function clearParagraphFormatting(editor: Editor) {
  editor.chain().focus().resetParagraphFormat().setParagraphFormat({ shading: null, borders: null, keepLines: false, pageBreakBefore: false, outlineLevel: null, dir: null }).run()
}

/** Clears the direct character formatting (keeps the character style). */
export function clearTextFormatting(editor: Editor) {
  const charStyle = editor.getAttributes('charStyle').id as string | undefined
  const chain = editor.chain().focus().unsetAllMarks()
  if (charStyle) chain.setCharStyle(charStyle as never)
  chain.run()
}
