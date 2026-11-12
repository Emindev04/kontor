import type { Editor } from '@tiptap/core'
import { currentFont, currentFontSize } from './commands'

// Named styles: the built-in ones (Normal, Headings, Title, Quote …) can be modified, and documents
// can have their own paragraph and character styles. Definitions become CSS for the page and
// style definitions in .docx files.

export type StyleFormat = {
  font?: string
  size?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  allCaps?: boolean
  smallCaps?: boolean
  letterSpacing?: number
  align?: 'left' | 'center' | 'right' | 'justify'
  spaceBefore?: number
  spaceAfter?: number
  lineHeight?: string
  indentLeft?: number
  indentFirstLine?: number
  borderBottom?: string
  shading?: string
}

export type StyleKind = 'paragraph' | 'character' | 'heading'
export type StyleDef = { id: string; name: string; kind: StyleKind; basedOn?: string; next?: string; custom?: boolean; format: StyleFormat }
export type StyleDefs = Record<string, StyleDef>

/** The built-in styles in gallery order, with the look the stylesheet gives them. */
export const BUILTIN_STYLES: StyleDef[] = [
  { id: 'normal', name: 'Normal', kind: 'paragraph', format: { size: 11, spaceAfter: 8, lineHeight: '1.08' } },
  { id: 'noSpacing', name: 'No Spacing', kind: 'paragraph', basedOn: 'normal', format: { spaceAfter: 0, lineHeight: '1' } },
  { id: 'h1', name: 'Heading 1', kind: 'heading', basedOn: 'normal', next: 'normal', format: { size: 16, spaceBefore: 12, spaceAfter: 0 } },
  { id: 'h2', name: 'Heading 2', kind: 'heading', basedOn: 'normal', next: 'normal', format: { size: 13, spaceBefore: 2, spaceAfter: 0 } },
  { id: 'title', name: 'Title', kind: 'paragraph', basedOn: 'normal', format: { size: 28, spaceAfter: 0, letterSpacing: -0.5 } },
  { id: 'subtitle', name: 'Subtitle', kind: 'paragraph', basedOn: 'normal', format: { color: '#5A5A5A', letterSpacing: 0.75 } },
  { id: 'subtleEmphasis', name: 'Subtle Emphasis', kind: 'character', format: { italic: true, color: '#404040' } },
  { id: 'emphasis', name: 'Emphasis', kind: 'character', format: { italic: true } },
  { id: 'intenseEmphasis', name: 'Intense Emphasis', kind: 'character', format: { italic: true } },
  { id: 'strong', name: 'Strong', kind: 'character', format: { bold: true } },
  { id: 'quote', name: 'Quote', kind: 'paragraph', basedOn: 'normal', format: { italic: true, color: '#404040', align: 'center' } },
  { id: 'intenseQuote', name: 'Intense Quote', kind: 'paragraph', basedOn: 'normal', format: { italic: true, align: 'center' } },
  { id: 'subtleReference', name: 'Subtle Reference', kind: 'character', format: { smallCaps: true, color: '#5A5A5A' } },
  { id: 'intenseReference', name: 'Intense Reference', kind: 'character', format: { bold: true, smallCaps: true } },
  { id: 'bookTitle', name: 'Book Title', kind: 'character', format: { bold: true, italic: true } },
  { id: 'listParagraph', name: 'List Paragraph', kind: 'paragraph', basedOn: 'normal', format: { indentLeft: 0.5 } },
  { id: 'h3', name: 'Heading 3', kind: 'heading', basedOn: 'normal', next: 'normal', format: { size: 12, spaceBefore: 2, spaceAfter: 0 } },
  { id: 'h4', name: 'Heading 4', kind: 'heading', basedOn: 'normal', next: 'normal', format: { size: 11, italic: true, spaceBefore: 2, spaceAfter: 0 } },
  { id: 'h5', name: 'Heading 5', kind: 'heading', basedOn: 'normal', next: 'normal', format: { size: 11, spaceBefore: 2, spaceAfter: 0 } },
  { id: 'h6', name: 'Heading 6', kind: 'heading', basedOn: 'normal', next: 'normal', format: { size: 11, spaceBefore: 2, spaceAfter: 0 } },
  { id: 'caption', name: 'Caption', kind: 'paragraph', basedOn: 'normal', format: { size: 9, italic: true, color: '#44546A' } },
]

/** Style sets (Design > Document Formatting): own looks for title and headings. */
export const STYLE_SETS: { id: string; label: string; styles: Record<string, StyleFormat> }[] = [
  { id: 'default', label: 'Default', styles: {} },
  { id: 'classic', label: 'Classic', styles: { title: { font: 'Cambria', align: 'center' }, h1: { font: 'Cambria', bold: true, color: '#000000' }, h2: { font: 'Cambria', bold: true, color: '#000000' }, h3: { font: 'Cambria', italic: true, color: '#000000' } } },
  { id: 'modern', label: 'Modern', styles: { title: { allCaps: true, letterSpacing: 2, size: 26 }, h1: { allCaps: true, letterSpacing: 1, size: 14 }, h2: { allCaps: true, size: 12 } } },
  { id: 'centered', label: 'Centered', styles: { title: { align: 'center' }, subtitle: { align: 'center' }, h1: { align: 'center', size: 15 }, h2: { align: 'center' } } },
  { id: 'lined', label: 'Lined', styles: { title: { borderBottom: '#2F6FC4' }, h1: { borderBottom: '#2F6FC4' }, h2: { borderBottom: '#BFBFBF' } } },
  { id: 'shaded', label: 'Shaded', styles: { title: { shading: '#DCE6F2' }, h1: { shading: '#2F6FC4', color: '#FFFFFF' }, h2: { shading: '#DCE6F2' } } },
  { id: 'bold', label: 'Bold', styles: { title: { bold: true, size: 30 }, h1: { bold: true, size: 17 }, h2: { bold: true, size: 14 }, h3: { bold: true } } },
  { id: 'minimal', label: 'Minimal', styles: { title: { size: 24, color: '#404040' }, h1: { size: 14, color: '#404040' }, h2: { size: 12, color: '#595959' }, h3: { color: '#595959' } } },
]

export function builtin(id: string) {
  return BUILTIN_STYLES.find((s) => s.id === id)
}

/** All styles: built-ins (with modifications) followed by the document's own styles. */
export function allStyles(defs: StyleDefs): StyleDef[] {
  const out = BUILTIN_STYLES.map((s) => (defs[s.id] ? { ...s, ...defs[s.id], format: { ...s.format, ...defs[s.id].format } } : s))
  for (const d of Object.values(defs)) if (d.custom && !builtin(d.id)) out.push(d)
  return out
}

/** CSS selector of a style on the page. */
export function styleSelector(s: StyleDef) {
  if (s.id === 'normal') return '.pages .ProseMirror p:not([data-style])'
  if (s.kind === 'heading') return `.pages .ProseMirror ${s.id}`
  if (s.kind === 'character') return `.pages .ProseMirror .cs-${s.id}`
  return `.pages .ProseMirror p.ps-${s.id}`
}

function formatCss(f: StyleFormat) {
  const css: string[] = []
  if (f.font) css.push(`font-family: '${f.font}', var(--doc-font)`)
  if (f.size) css.push(`font-size: ${f.size}pt`)
  if (f.bold != null) css.push(`font-weight: ${f.bold ? 'bold' : 'normal'}`)
  if (f.italic != null) css.push(`font-style: ${f.italic ? 'italic' : 'normal'}`)
  if (f.underline != null) css.push(`text-decoration: ${f.underline ? 'underline' : 'none'}`)
  if (f.color) css.push(`color: ${f.color}`)
  if (f.allCaps != null) css.push(`text-transform: ${f.allCaps ? 'uppercase' : 'none'}`)
  if (f.smallCaps != null) css.push(`font-variant: ${f.smallCaps ? 'small-caps' : 'normal'}`)
  if (f.letterSpacing != null) css.push(`letter-spacing: ${f.letterSpacing}pt`)
  if (f.align) css.push(`text-align: ${f.align}`)
  if (f.spaceBefore != null) css.push(`margin-top: ${f.spaceBefore}pt`)
  if (f.spaceAfter != null) css.push(`margin-bottom: ${f.spaceAfter}pt`)
  if (f.lineHeight) css.push(`line-height: calc(var(--single-line) * ${parseFloat(f.lineHeight) || 1})`)
  if (f.indentLeft != null) css.push(`margin-left: ${f.indentLeft}in`)
  if (f.indentFirstLine != null) css.push(`text-indent: ${f.indentFirstLine}in`)
  if (f.borderBottom) css.push(`border-bottom: 1pt solid ${f.borderBottom}`, 'padding-bottom: 2pt')
  if (f.shading) css.push(`background: ${f.shading}`, 'padding: 1pt 3pt')
  return css.join('; ')
}

/** CSS for the style set and the document's style modifications and own styles. */
export function stylesCss(defs: StyleDefs, styleSet: string | undefined) {
  const set = STYLE_SETS.find((s) => s.id === styleSet)?.styles ?? {}
  const rules: string[] = []
  for (const [id, f] of Object.entries(set)) {
    const s = builtin(id)
    if (s) rules.push(`${styleSelector(s)} { ${formatCss(f)} }`)
  }
  for (const d of Object.values(defs)) {
    const base = builtin(d.id) ?? d
    // Own styles start from the style they are based on.
    const basedOn = d.custom && d.basedOn ? (defs[d.basedOn]?.format ?? builtin(d.basedOn)?.format ?? {}) : {}
    rules.push(`${styleSelector({ ...base, kind: d.kind })} { ${formatCss({ ...basedOn, ...d.format })} }`)
  }
  return rules.join('\n')
}

/** Formatting of the text at the cursor, as a style would store it. */
export function formatOfSelection(editor: Editor): StyleFormat {
  const ts = editor.getAttributes('textStyle')
  const para = editor.isActive('heading') ? editor.getAttributes('heading') : editor.getAttributes('paragraph')
  const f: StyleFormat = { font: currentFont(editor), size: currentFontSize(editor) }
  if (editor.isActive('bold')) f.bold = true
  if (editor.isActive('italic')) f.italic = true
  if (editor.isActive('underline')) f.underline = true
  if (ts.color) f.color = ts.color
  if (para.textAlign && para.textAlign !== 'left') f.align = para.textAlign
  if (para.spaceBefore != null) f.spaceBefore = para.spaceBefore
  if (para.spaceAfter != null) f.spaceAfter = para.spaceAfter
  if (para.lineHeight && !String(para.lineHeight).includes(':')) f.lineHeight = para.lineHeight
  if (para.indentLeft) f.indentLeft = para.indentLeft
  if (para.indentFirstLine) f.indentFirstLine = para.indentFirstLine
  return f
}

/** The style at the cursor (id), as the Styles pane highlights it. */
export function currentStyleId(editor: Editor) {
  const cs = editor.getAttributes('charStyle').id as string | undefined
  if (cs) return cs
  if (editor.isActive('heading')) return `h${editor.getAttributes('heading').level}`
  return (editor.getAttributes('paragraph').pStyle as string | null) ?? 'normal'
}

export function applyStyle(editor: Editor, s: StyleDef) {
  const chain = editor.chain().focus()
  if (s.kind === 'heading') return chain.setHeading({ level: Number(s.id.slice(1)) as 1 }).run()
  if (s.kind === 'character') return editor.isActive('charStyle', { id: s.id }) ? chain.unsetCharStyle().run() : chain.setCharStyle(s.id as never).run()
  return chain.setParagraphStyle(s.id === 'normal' ? null : (s.id as never)).run()
}

export const newStyleId = (name: string) => `u${name.replace(/[^A-Za-z0-9]/g, '').slice(0, 24) || 'Style'}${Math.floor(Math.random() * 1000)}`
