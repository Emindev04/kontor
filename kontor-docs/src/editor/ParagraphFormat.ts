import { Extension } from '@tiptap/core'
import type { EditorState, Transaction } from '@tiptap/pm/state'

// Paragraph-level formatting stored as node attributes: indents (inches), spacing (points),
// line spacing and the pagination options of the Paragraph dialog.

export const INDENT_STEP_IN = 0.5
export const PARAGRAPH_TYPES = ['paragraph', 'heading']

/** "1.15" = multiple of single spacing, "exact:12" / "atLeast:12" = points. */
export type LineSpacing = string

export type ParagraphAttrs = {
  lineHeight: LineSpacing | null
  spaceBefore: number | null
  spaceAfter: number | null
  indentLeft: number
  indentRight: number
  /** Positive: first-line indent, negative: hanging indent (inches). */
  indentFirstLine: number
  keepNext: boolean | null
  keepLines: boolean
  pageBreakBefore: boolean
  widowControl: boolean
  /** Paragraph shading color. */
  shading: string | null
  /** Paragraph border sides: any of "t", "b", "l", "r". */
  borders: string | null
  dropCap: 'dropped' | 'margin' | null
  /** Layout > Line Numbers > Suppress for Current Paragraph. */
  suppressLineNumbers: boolean | null
  /** Outline level for paragraphs that are not headings (1–9, null = body text). */
  outlineLevel: number | null
  /** Don't add space between paragraphs of the same style. */
  contextualSpacing: boolean | null
  tabStops: import('./TabStops').TabStop[] | null
  /** Text direction: right-to-left paragraphs (Arabic, Hebrew …). */
  dir: 'rtl' | null
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphFormat: {
      setLineSpacing: (lineHeight: LineSpacing | null) => ReturnType
      setParagraphFormat: (attrs: Partial<ParagraphAttrs>) => ReturnType
      changeIndent: (direction: 1 | -1) => ReturnType
      changeHangingIndent: (direction: 1 | -1) => ReturnType
      resetParagraphFormat: () => ReturnType
    }
  }
}

/** CSS line-height for a stored line spacing. Single spacing is about 1.22 em for the default fonts. */
export function lineHeightCss(value: LineSpacing | null | undefined): string | null {
  if (!value) return null
  if (value.startsWith('exact:')) return `${parseFloat(value.slice(6))}pt`
  if (value.startsWith('atLeast:')) return `max(${parseFloat(value.slice(8))}pt, calc(var(--single-line) * 1em))`
  const n = parseFloat(value)
  return isNaN(n) ? null : `calc(var(--single-line) * ${n})`
}

const num = (v: string | null) => (v == null || v === '' || isNaN(parseFloat(v)) ? null : parseFloat(v))

function inchesFromCss(value: string): number {
  const n = parseFloat(value)
  if (isNaN(n)) return 0
  if (value.endsWith('in')) return n
  if (value.endsWith('cm')) return n / 2.54
  if (value.endsWith('mm')) return n / 25.4
  if (value.endsWith('pt')) return n / 72
  if (value.endsWith('px')) return n / 96
  if (value.endsWith('em')) return (n * 11) / 72
  return 0
}

function pointsFromCss(value: string): number | null {
  const n = parseFloat(value)
  if (isNaN(n)) return null
  if (value.endsWith('px')) return Math.round(n * 0.75 * 10) / 10
  if (value.endsWith('in')) return n * 72
  if (value.endsWith('cm')) return (n / 2.54) * 72
  return n
}

/** Applies `fn` to every paragraph/heading touched by the selection. */
function eachParagraph(state: EditorState, tr: Transaction, fn: (attrs: Record<string, unknown>) => Record<string, unknown> | null) {
  const { from, to } = state.selection
  let changed = false
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!PARAGRAPH_TYPES.includes(node.type.name)) return
    const next = fn(node.attrs)
    if (next) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...next })
      changed = true
    }
    return false
  })
  return changed
}

export const ParagraphFormat = Extension.create({
  name: 'paragraphFormat',

  addGlobalAttributes() {
    return [
      {
        types: PARAGRAPH_TYPES,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-line-height') || (num(el.style.lineHeight) && !/[a-z%]/.test(el.style.lineHeight) ? el.style.lineHeight : null),
            renderHTML: (a) => {
              const css = lineHeightCss(a.lineHeight)
              return css ? { 'data-line-height': a.lineHeight, style: `line-height: ${css}` } : {}
            },
          },
          spaceBefore: {
            default: null,
            parseHTML: (el) => (el.style.marginTop ? pointsFromCss(el.style.marginTop) : null),
            renderHTML: (a) => (a.spaceBefore != null ? { style: `margin-top: ${a.spaceBefore}pt` } : {}),
          },
          spaceAfter: {
            default: null,
            parseHTML: (el) => (el.style.marginBottom ? pointsFromCss(el.style.marginBottom) : null),
            renderHTML: (a) => (a.spaceAfter != null ? { style: `margin-bottom: ${a.spaceAfter}pt` } : {}),
          },
          indentLeft: {
            default: 0,
            parseHTML: (el) => (el.style.marginLeft ? Math.max(0, inchesFromCss(el.style.marginLeft)) : 0),
            renderHTML: (a) => (a.indentLeft ? { style: `margin-left: ${a.indentLeft}in` } : {}),
          },
          indentRight: {
            default: 0,
            parseHTML: (el) => (el.style.marginRight ? Math.max(0, inchesFromCss(el.style.marginRight)) : 0),
            renderHTML: (a) => (a.indentRight ? { style: `margin-right: ${a.indentRight}in` } : {}),
          },
          indentFirstLine: {
            default: 0,
            parseHTML: (el) => (el.style.textIndent ? inchesFromCss(el.style.textIndent) : 0),
            renderHTML: (a) => (a.indentFirstLine ? { style: `text-indent: ${a.indentFirstLine}in` } : {}),
          },
          keepNext: {
            default: null,
            parseHTML: (el) => (el.hasAttribute('data-keep-next') ? el.getAttribute('data-keep-next') === 'true' : null),
            renderHTML: (a) => (a.keepNext != null ? { 'data-keep-next': String(a.keepNext) } : {}),
          },
          keepLines: {
            default: false,
            parseHTML: (el) => el.hasAttribute('data-keep-lines'),
            renderHTML: (a) => (a.keepLines ? { 'data-keep-lines': '' } : {}),
          },
          pageBreakBefore: {
            default: false,
            parseHTML: (el) => el.hasAttribute('data-break-before') || el.style.breakBefore === 'page' || el.style.pageBreakBefore === 'always',
            renderHTML: (a) => (a.pageBreakBefore ? { 'data-break-before': '' } : {}),
          },
          shading: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-shading'),
            renderHTML: (a) => (a.shading ? { 'data-shading': a.shading, style: `background-color: ${a.shading}` } : {}),
          },
          borders: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-borders'),
            renderHTML: (a) => (a.borders ? { 'data-borders': a.borders } : {}),
          },
          dropCap: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-drop-cap'),
            renderHTML: (a) => (a.dropCap ? { 'data-drop-cap': a.dropCap } : {}),
          },
          suppressLineNumbers: {
            default: null,
            parseHTML: (el) => (el.hasAttribute('data-no-line-numbers') ? true : null),
            renderHTML: (a) => (a.suppressLineNumbers ? { 'data-no-line-numbers': '' } : {}),
          },
          outlineLevel: {
            default: null,
            parseHTML: (el) => num(el.getAttribute('data-outline-level')),
            renderHTML: (a) => (a.outlineLevel ? { 'data-outline-level': String(a.outlineLevel) } : {}),
          },
          contextualSpacing: {
            default: null,
            parseHTML: (el) => (el.hasAttribute('data-contextual') ? true : null),
            renderHTML: (a) => (a.contextualSpacing ? { 'data-contextual': '' } : {}),
          },
          widowControl: {
            default: true,
            parseHTML: (el) => !el.hasAttribute('data-no-widow-control'),
            renderHTML: (a) => (a.widowControl ? {} : { 'data-no-widow-control': '' }),
          },
          dir: {
            default: null,
            parseHTML: (el) => (el.getAttribute('dir') === 'rtl' ? 'rtl' : null),
            renderHTML: (a) => (a.dir === 'rtl' ? { dir: 'rtl' } : {}),
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setLineSpacing:
        (lineHeight) =>
        ({ state, tr }) =>
          eachParagraph(state, tr, () => ({ lineHeight })),

      setParagraphFormat:
        (attrs) =>
        ({ state, tr }) =>
          eachParagraph(state, tr, () => attrs),

      // Like the original: moves the left indent to the next/previous 0.5" stop.
      changeIndent:
        (direction) =>
        ({ state, tr }) =>
          eachParagraph(state, tr, (a) => {
            const left = (a.indentLeft as number) ?? 0
            const next =
              direction > 0
                ? Math.floor(left / INDENT_STEP_IN + 1e-6) * INDENT_STEP_IN + INDENT_STEP_IN
                : Math.ceil(left / INDENT_STEP_IN - 1e-6) * INDENT_STEP_IN - INDENT_STEP_IN
            const indentLeft = Math.max(0, Math.min(next, 10))
            return indentLeft === left ? null : { indentLeft }
          }),

      // Ctrl+T / Ctrl+Shift+T: hanging indent in 0.5" steps.
      changeHangingIndent:
        (direction) =>
        ({ state, tr }) =>
          eachParagraph(state, tr, (a) => {
            const left = ((a.indentLeft as number) ?? 0) + direction * INDENT_STEP_IN
            if (left < 0) return { indentLeft: 0, indentFirstLine: 0 }
            return { indentLeft: left, indentFirstLine: left > 0 ? -INDENT_STEP_IN : 0 }
          }),

      resetParagraphFormat:
        () =>
        ({ state, tr }) =>
          eachParagraph(state, tr, () => ({
            lineHeight: null,
            spaceBefore: null,
            spaceAfter: null,
            indentLeft: 0,
            indentRight: 0,
            indentFirstLine: 0,
            textAlign: null,
          })),
    }
  },

  addKeyboardShortcuts() {
    const outsideListsAndTables = () => !this.editor.isActive('listItem') && !this.editor.isActive('table')
    return {
      // Tab inserts a tab character (default stops every 0.5"); lists and tables handle Tab themselves.
      Tab: () => outsideListsAndTables() && this.editor.commands.insertContent('\t'),
      'Mod-m': () => this.editor.commands.changeIndent(1),
      'Mod-Shift-m': () => this.editor.commands.changeIndent(-1),
      'Mod-t': () => this.editor.commands.changeHangingIndent(1),
      'Mod-Shift-t': () => this.editor.commands.changeHangingIndent(-1),
      'Mod-q': () => this.editor.commands.resetParagraphFormat(),
      'Mod-1': () => this.editor.commands.setLineSpacing('1'),
      'Mod-2': () => this.editor.commands.setLineSpacing('2'),
      'Mod-5': () => this.editor.commands.setLineSpacing('1.5'),
      'Mod-0': () => {
        const before = this.editor.getAttributes('paragraph').spaceBefore
        return this.editor.commands.setParagraphFormat({ spaceBefore: before ? null : 12 })
      },
    }
  },
})
