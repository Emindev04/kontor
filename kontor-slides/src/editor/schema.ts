import { Extension, InputRule, Mark, Node, type Editor } from '@tiptap/core'
import { getOptions } from '../io/options'
import { Document } from '@tiptap/extension-document'
import { Text } from '@tiptap/extension-text'
import { HardBreak } from '@tiptap/extension-hard-break'
import { changeLevel } from './levels'

export { changeLevel }
import { Bold } from '@tiptap/extension-bold'
import { Italic } from '@tiptap/extension-italic'
import { Underline } from '@tiptap/extension-underline'
import { Strike } from '@tiptap/extension-strike'
import { Subscript } from '@tiptap/extension-subscript'
import { Superscript } from '@tiptap/extension-superscript'
import { Highlight } from '@tiptap/extension-highlight'
import { Link } from '@tiptap/extension-link'
import { UndoRedo } from '@tiptap/extensions'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Para } from '../model/types'
import { computeMarkers, effectiveBullet, paraStyle, textStyleCss, type TextCtx, type TextStyleAttrs } from '../model/richtext'
import { cssToHex } from '../model/color'

export type CtxRef = { current: TextCtx }

const attr = (def: unknown) => ({ default: def, rendered: false })

function Paragraph(ctx: CtxRef) {
  return Node.create({
    name: 'paragraph',
    priority: 1000,
    group: 'block',
    content: 'inline*',
    addAttributes() {
      return { align: attr(null), level: attr(0), bullet: attr(null), bulletSize: attr(null), bulletColor: attr(null), startAt: attr(null), lineHeight: attr(null), spaceBefore: attr(null), spaceAfter: attr(null), lineExact: attr(null), indent: attr(null), firstLine: attr(null) }
    },
    parseHTML() {
      return [{ tag: 'p', getAttrs: (el) => ({ align: ((el as HTMLElement).style.textAlign || null) as string | null }) }]
    },
    renderHTML({ node }) {
      const hasMarker = !!effectiveBullet(node.attrs, ctx.current)
      return ['p', { style: paraStyle(node.attrs, ctx.current, hasMarker) }, 0]
    },
  })
}

function TextStyle(ctx: CtxRef) {
  return Mark.create({
    name: 'textStyle',
    priority: 101,
    addAttributes() {
      return { fontFamily: attr(null), fontSize: attr(null), color: attr(null), letterSpacing: attr(null), shadow: attr(null), caps: attr(null), uStyle: attr(null), uColor: attr(null), strike2: attr(null), baseline: attr(null), equalize: attr(null), glow: attr(null), glowSize: attr(null) }
    },
    parseHTML() {
      return [
        {
          tag: 'span',
          getAttrs: (node) => {
            const st = (node as HTMLElement).style
            const out: TextStyleAttrs = {}
            if (st.fontFamily) out.fontFamily = st.fontFamily.split(',')[0].replace(/['"]/g, '').trim()
            const size = st.fontSize
            if (size.endsWith('pt')) out.fontSize = parseFloat(size)
            else if (size.endsWith('px')) out.fontSize = Math.round(parseFloat(size) * 0.75 * 2) / 2
            if (st.color) out.color = cssToHex(st.color)
            return Object.keys(out).length ? out : false
          },
        },
      ]
    },
    renderHTML({ mark }) {
      return ['span', { style: textStyleCss(mark.attrs as TextStyleAttrs, ctx.current.colors) }, 0]
    },
  })
}

function Field(ctx: CtxRef) {
  return Node.create({
    name: 'field',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes() {
      return { kind: attr('slidenum') }
    },
    parseHTML() {
      return [{ tag: 'span[data-field]', getAttrs: (el) => ({ kind: (el as HTMLElement).getAttribute('data-field') }) }]
    },
    renderHTML({ node }) {
      return ['span', { class: 'field', 'data-field': node.attrs.kind }, node.attrs.kind === 'slidenum' ? String(ctx.current.slideNumber) : ctx.current.dateText]
    },
  })
}

const markersKey = new PluginKey('markers')

function Markers(ctx: CtxRef) {
  return Extension.create({
    name: 'markers',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: markersKey,
          props: {
            decorations(state) {
              const paras: Para[] = []
              const pos: [number, number][] = []
              state.doc.forEach((node, offset) => {
                paras.push({ type: 'paragraph', attrs: node.attrs })
                pos.push([offset, offset + node.nodeSize])
              })
              const markers = computeMarkers(paras, ctx.current)
              return DecorationSet.create(
                state.doc,
                markers.flatMap((m, i) => (m ? [Decoration.node(pos[i][0], pos[i][1], { 'data-marker': m })] : [])),
              )
            },
          },
        }),
      ]
    },
  })
}

/** Changes the indent level of every paragraph touched by the selection. */

const SlideKeys = Extension.create({
  name: 'slideKeys',
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const sel = editor.state.selection
        if (sel.empty && sel.$from.parentOffset > 0) return editor.commands.insertContent('\t')
        return changeLevel(editor, 1)
      },
      'Shift-Tab': ({ editor }) => changeLevel(editor, -1),
      Backspace: ({ editor }) => {
        const sel = editor.state.selection
        if (sel.empty && sel.$from.parentOffset === 0 && (sel.$from.parent.attrs.level ?? 0) > 0) return changeLevel(editor, -1)
        return false
      },
    }
  },
})

// AutoCorrect replacements while typing (File > Options > Proofing).
const AUTOCORRECT: [RegExp, string][] = [
  [/\(c\)$/i, '©'],
  [/\(r\)$/i, '®'],
  [/\(tm\)$/i, '™'],
  [/\.\.\.$/, '…'],
  [/(?<=\S ?)--$/, '—'],
  [/->$/, '→'],
  [/<-$/, '←'],
  [/=>$/, '⇒'],
  [/:\)$/, '☺'],
  [/(?<=\d)\/2 $/, '½ '],
]

const replaceRule = (find: RegExp, text: string, option: 'autoCorrect' | 'smartQuotes') =>
  new InputRule({
    find,
    handler: ({ state, range }) => {
      if (!getOptions()[option]) return null
      state.tr.insertText(text, range.from, range.to)
    },
  })

/** AutoCorrect, smart quotes and automatic bulleted/numbered lists (like the original's AutoFormat as you type). */
const AutoFormat = Extension.create({
  name: 'autoFormat',
  addInputRules() {
    return [
      ...AUTOCORRECT.map(([find, text]) => replaceRule(find, text, 'autoCorrect')),
      // Smart quotes: opening after a space or bracket, closing otherwise.
      replaceRule(/(?<=^|[\s([{\u2018\u201C])"$/, '“', 'smartQuotes'),
      replaceRule(/"$/, '”', 'smartQuotes'),
      replaceRule(/(?<=^|[\s([{\u201C])'$/, '‘', 'smartQuotes'),
      replaceRule(/'$/, '’', 'smartQuotes'),
      new InputRule({
        find: /^\s*([*\-•>])\s$/,
        handler: ({ state, range, match }) => {
          if (!getOptions().autoLists) return null
          const $from = state.doc.resolve(range.from)
          const para = $from.node($from.depth)
          if (para.type.name !== 'paragraph') return null
          state.tr.delete(range.from, range.to).setNodeMarkup($from.before($from.depth), undefined, { ...para.attrs, bullet: match[1] === '>' ? '➢' : '•' })
        },
      }),
      new InputRule({
        find: /^(\d{1,3}|[aA])([.)])\s$/,
        handler: ({ state, range, match }) => {
          if (!getOptions().autoLists) return null
          const $from = state.doc.resolve(range.from)
          const para = $from.node($from.depth)
          if (para.type.name !== 'paragraph') return null
          const n = match[1]
          const paren = match[2] === ')'
          const scheme = /\d/.test(n) ? (paren ? 'arabicParenR' : 'arabicPeriod') : n === n.toUpperCase() ? (paren ? 'alphaUcParenR' : 'alphaUcPeriod') : paren ? 'alphaLcParenR' : 'alphaLcPeriod'
          const start = /\d/.test(n) ? Number(n) : n.toLowerCase().charCodeAt(0) - 96
          state.tr.delete(range.from, range.to).setNodeMarkup($from.before($from.depth), undefined, { ...para.attrs, bullet: `num:${scheme}`, startAt: start > 1 ? start : null })
        },
      }),
    ]
  },
})

export function buildExtensions(ctx: CtxRef) {
  return [
    Document,
    Paragraph(ctx),
    Text,
    // Ctrl/Cmd+Enter moves to the next placeholder, so only Shift+Enter inserts a line break.
    HardBreak.extend({ addKeyboardShortcuts: () => ({ 'Shift-Enter': ({ editor }) => editor.commands.setHardBreak() }) }),
    Bold,
    Italic,
    Underline,
    Strike,
    Subscript,
    Superscript,
    Highlight.configure({ multicolor: true }),
    Link.configure({ openOnClick: false, autolink: true }),
    TextStyle(ctx),
    Field(ctx),
    Markers(ctx),
    SlideKeys,
    AutoFormat,
    UndoRedo,
  ]
}
