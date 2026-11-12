import type { Editor } from '@tiptap/core'
import type { Mark, Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { insertPaste, type PasteMode } from './Paste'
import { t } from '../i18n'

export const FONT_SIZES = ['8', '9', '10', '10.5', '11', '12', '14', '16', '18', '20', '22', '24', '26', '28', '36', '48', '72']
const SIZE_STEPS = FONT_SIZES.map(Number)
const HEADING_SIZES: Record<number, number> = { 1: 16, 2: 13, 3: 12, 4: 11, 5: 11, 6: 11 }
const STYLE_SIZES: Record<string, number> = { title: 28, subtitle: 11, caption: 9 }
export const DEFAULT_FONT = 'Calibri'
export const HEADING_FONT = 'Calibri Light'
export const DEFAULT_SIZE = 11

export const parseSize = (value: string) => parseFloat(value.replace(',', '.'))
export const formatSize = (n: number) => String(Math.round(n * 2) / 2)

/** Effective font size in points at the cursor. */
export function currentFontSize(editor: Editor): number {
  const size = editor.getAttributes('textStyle').fontSize as string | undefined
  if (size) {
    const n = parseFloat(size)
    return size.endsWith('px') ? Math.round(n * 0.75 * 2) / 2 : n
  }
  if (editor.isActive('heading')) return HEADING_SIZES[editor.getAttributes('heading').level as number] ?? DEFAULT_SIZE
  const style = editor.getAttributes('paragraph').pStyle as string | undefined
  return (style && STYLE_SIZES[style]) || DEFAULT_SIZE
}

export function currentFont(editor: Editor): string {
  const family = editor.getAttributes('textStyle').fontFamily as string | undefined
  if (family) return family.split(',')[0].replace(/["']/g, '').trim()
  const style = editor.getAttributes('paragraph').pStyle as string | undefined
  return editor.isActive('heading') || style === 'title' ? HEADING_FONT : DEFAULT_FONT
}

export function setFontSize(editor: Editor, pt: number) {
  if (!(pt >= 1 && pt <= 1638)) return
  editor.chain().focus().setFontSize(`${pt}pt`).run()
}

/** Grow/Shrink Font. Without `step` it jumps along the size list like the original. */
export function stepFontSize(editor: Editor, direction: 1 | -1, step?: number) {
  const now = currentFontSize(editor)
  let next: number
  if (step) next = Math.max(1, now + direction * step)
  else
    next =
      direction > 0
        ? (SIZE_STEPS.find((s) => s > now) ?? Math.ceil((now + 1) / 10) * 10)
        : ([...SIZE_STEPS].reverse().find((s) => s < now) ?? Math.max(1, now - 1))
  setFontSize(editor, next)
}

export type CaseMode = 'sentence' | 'lower' | 'upper' | 'title' | 'toggle'

const isWordChar = (c: string) => /[\p{L}\p{N}]/u.test(c)

/** Change Case without losing formatting. */
export function changeCase(editor: Editor, mode: CaseMode) {
  const { state } = editor
  const { from, to, empty } = state.selection
  if (empty) return
  const parts: { start: number; end: number; text: string; marks: readonly Mark[] }[] = []
  let lastParent: PMNode | null = null
  let prev = ''
  let sentenceStart = true
  const mapped: string[] = []

  state.doc.nodesBetween(from, to, (node, pos, parent) => {
    if (!node.isText || !node.text) return
    const start = Math.max(from, pos)
    const end = Math.min(to, pos + node.text.length)
    if (parent !== lastParent) {
      lastParent = parent
      prev = ''
      sentenceStart = true
    }
    let out = ''
    for (const ch of node.text.slice(start - pos, end - pos)) {
      const upper = ch.toLocaleUpperCase('en-US')
      const lower = ch.toLocaleLowerCase('en-US')
      switch (mode) {
        case 'lower': out += lower; break
        case 'upper': out += upper; break
        case 'toggle': out += ch === lower ? upper : lower; break
        case 'title': out += !isWordChar(prev) && isWordChar(ch) ? upper : lower; break
        case 'sentence':
          if (sentenceStart && isWordChar(ch)) {
            out += upper
            sentenceStart = false
          } else out += isWordChar(ch) ? lower : ch
          if (/[.!?]/.test(ch)) sentenceStart = true
          break
      }
      prev = ch
    }
    parts.push({ start, end, text: node.text.slice(start - pos, end - pos), marks: node.marks })
    mapped.push(out)
  })

  const tr = state.tr
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]
    if (mapped[i] !== p.text) tr.replaceWith(p.start, p.end, state.schema.text(mapped[i], p.marks))
  }
  tr.setSelection(TextSelection.create(tr.doc, from, tr.mapping.map(to)))
  editor.view.dispatch(tr)
  editor.commands.focus()
}

/** Shift+F3 cycles lowercase → UPPERCASE → Capitalize Each Word, like the original. */
export function cycleCase(editor: Editor) {
  const { from, to, empty } = editor.state.selection
  if (empty) return
  const text = editor.state.doc.textBetween(from, to, ' ')
  const mode: CaseMode = text === text.toLowerCase() ? 'upper' : text === text.toUpperCase() ? 'title' : 'lower'
  changeCase(editor, mode)
}

/** Format Painter: clears the target's character formatting and applies the remembered marks. */
export function applyMarks(editor: Editor, marks: readonly Mark[]) {
  const { state } = editor
  const { from, to, empty } = state.selection
  if (empty) return
  const tr = state.tr
  for (const type of Object.values(state.schema.marks)) {
    if (type.name !== 'link') tr.removeMark(from, to, type)
  }
  for (const mark of marks) {
    if (mark.type.name !== 'link') tr.addMark(from, to, mark)
  }
  editor.view.dispatch(tr)
}

/** Reads what the clipboard holds: formatted (HTML) text, plain text and a picture. */
export async function readClipboard() {
  const out: { html: string | null; text: string; image: Blob | null } = { html: null, text: '', image: null }
  if (navigator.clipboard.read) {
    for (const item of await navigator.clipboard.read()) {
      if (!out.html && item.types.includes('text/html')) out.html = await (await item.getType('text/html')).text()
      if (!out.text && item.types.includes('text/plain')) out.text = await (await item.getType('text/plain')).text()
      const image = item.types.find((t) => t.startsWith('image/'))
      if (!out.image && image) out.image = await item.getType(image)
    }
  } else out.text = await navigator.clipboard.readText()
  return out
}

/** Text of an HTML fragment, one line per block. */
export function htmlToText(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
  doc.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, tr').forEach((el) => el.append('\n'))
  return (doc.body.textContent ?? '').replace(/\n{2,}/g, '\n').trim()
}

export function insertPicture(editor: Editor, blob: Blob) {
  const reader = new FileReader()
  reader.onload = () => editor.chain().focus().setImage({ src: String(reader.result), alt: '' }).run()
  reader.readAsDataURL(blob)
}

/** Paste button and Paste Options: Keep Source Formatting, Merge Formatting or Keep Text Only. */
export async function pasteFromClipboard(editor: Editor, mode: PasteMode = 'keep') {
  try {
    const clip = await readClipboard()
    if (clip.image && !clip.html && !clip.text) return insertPicture(editor, clip.image)
    const text = clip.text || (clip.html ? htmlToText(clip.html) : '')
    if (!text && !clip.html) return
    insertPaste(editor.view, clip.html, text, mode)
  } catch {
    alert(t('Your browser does not allow direct clipboard access. Please use Ctrl+V (⌘+V on a Mac).'))
  }
}

export function clipboardCommand(editor: Editor, command: 'cut' | 'copy') {
  editor.view.focus()
  if (!document.execCommand(command)) {
    alert(command === 'cut' ? t('Please use Ctrl+X (⌘ on a Mac).') : t('Please use Ctrl+C (⌘ on a Mac).'))
  }
}

export const DATE_FORMATS: ((d: Date) => string)[] = [
  (d) => d.toLocaleDateString('en-US'),
  (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
  (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
  (d) => d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }),
  (d) => d.toISOString().slice(0, 10),
  (d) => d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: '2-digit' }).replace(',', ''),
  (d) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  (d) => d.toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
  (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
  (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
]

export function insertDate(editor: Editor, format = 0) {
  editor.chain().focus().insertContent(DATE_FORMATS[format](new Date())).run()
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

/** Statistics for the Word Count dialog. */
export function documentStats(editor: Editor, pages: number) {
  const { from, to, empty } = editor.state.selection
  const text = empty ? editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', ' ') : editor.state.doc.textBetween(from, to, '\n', ' ')
  const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
  let paragraphs = 0
  editor.state.doc.nodesBetween(empty ? 0 : from, empty ? editor.state.doc.content.size : to, (node) => {
    if (node.isTextblock && node.textContent.trim()) paragraphs++
  })
  const lines = Array.from(editor.view.dom.querySelectorAll(':scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > ul, :scope > ol')).reduce(
    (sum, el) => sum + Math.max(1, Math.round(el.getBoundingClientRect().height / (parseFloat(getComputedStyle(el).lineHeight) || 19))),
    0,
  )
  return {
    selection: !empty,
    pages,
    words,
    characters: text.replace(/\n/g, '').length,
    charactersNoSpaces: text.replace(/\s/g, '').length,
    paragraphs,
    lines,
  }
}
