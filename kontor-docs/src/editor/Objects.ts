import { Extension, Node, mergeAttributes } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { mathMarkup } from './math'
import { DrawingView, drawingAttributes, wrapStyle, type DrawingRenderer } from './Drawing'
import { collectNotes } from './Notes'
import { t } from '../i18n'

// Inline objects: equations, bookmarks, cross-references and signature lines.

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    objects: {
      insertEquation: (latex: string, display?: boolean) => ReturnType
      insertBookmark: (name: string) => ReturnType
      insertCrossRef: (attrs: CrossRefAttrs) => ReturnType
      insertSignatureLine: (attrs: Partial<SignatureAttrs>) => ReturnType
    }
  }
}

// ---- Equations ----

export const Equation = Node.create<{ onEdit: ((pos: number) => void) | null }>({
  name: 'equation',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { onEdit: null }
  },

  addAttributes() {
    return {
      latex: { default: 'x', parseHTML: (el) => el.getAttribute('data-latex') ?? 'x', renderHTML: (a) => ({ 'data-latex': a.latex }) },
      display: { default: false, parseHTML: (el) => el.getAttribute('data-display') === 'true', renderHTML: (a) => (a.display ? { 'data-display': 'true' } : {}) },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="equation"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const span = document.createElement('span')
    span.innerHTML = mathMarkup(node.attrs.latex, node.attrs.display)
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'equation', class: `equation${node.attrs.display ? ' is-display' : ''}` }), span.firstChild ?? '']
  },

  renderText({ node }) {
    return node.attrs.latex
  },

  addNodeView() {
    return ({ node, getPos }) => {
      const dom = document.createElement('span')
      dom.className = 'equation'
      dom.contentEditable = 'false'
      const paint = (n: PMNode) => {
        dom.classList.toggle('is-display', !!n.attrs.display)
        dom.innerHTML = mathMarkup(n.attrs.latex, n.attrs.display)
        dom.title = t('Double-click to edit the equation')
      }
      paint(node)
      dom.addEventListener('dblclick', (e) => {
        e.preventDefault()
        const pos = (getPos as () => number | undefined)()
        if (pos != null) this.options.onEdit?.(pos)
      })
      return {
        dom,
        update: (n) => {
          if (n.type.name !== 'equation') return false
          paint(n)
          return true
        },
        ignoreMutation: () => true,
      }
    }
  },

  addCommands() {
    return {
      insertEquation:
        (latex, display = false) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { latex, display } }),
    }
  },

  addKeyboardShortcuts() {
    return { 'Alt-=': () => this.editor.commands.insertEquation('x') }
  },
})

// ---- Bookmarks ----

export const Bookmark = Node.create({
  name: 'bookmark',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return { name: { default: '', parseHTML: (el) => el.getAttribute('data-bookmark') ?? el.getAttribute('id') ?? '', renderHTML: (a) => ({ 'data-bookmark': a.name, id: a.name }) } }
  },

  parseHTML() {
    return [{ tag: 'span[data-bookmark]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'bookmark' })]
  },

  renderText() {
    return ''
  },

  addCommands() {
    return {
      insertBookmark:
        (name) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { name } }),
    }
  },
})

/** Bookmarks in document order. Names starting with "_" are hidden (cross-reference targets). */
export function collectBookmarks(doc: PMNode) {
  const out: { name: string; pos: number }[] = []
  doc.descendants((n, pos) => {
    if (n.type.name === 'bookmark' && n.attrs.name) out.push({ name: n.attrs.name, pos })
  })
  return out
}

// ---- Cross-references ----

export type CrossRefAttrs = { target: string; refType: 'heading' | 'bookmark' | 'footnote' | 'endnote' | 'caption'; show: 'text' | 'page' | 'number' | 'aboveBelow' }

type RefContext = { pageOf: (pos: number) => number; pageLabel: (page: number) => string }
let refContext: RefContext = { pageOf: () => 0, pageLabel: (p) => String(p + 1) }

/** The pagination tells cross-references which page a position is on. */
export function setRefContext(ctx: RefContext) {
  refContext = ctx
}

/** The page label of a document position (for cross-references and the index). */
export const refPage = (pos: number) => refContext.pageLabel(refContext.pageOf(pos))

/** The text a cross-reference shows. */
export function crossRefText(doc: PMNode, a: CrossRefAttrs, refPos: number): string {
  if (a.refType === 'footnote' || a.refType === 'endnote') {
    const note = collectNotes(doc).find((n) => n.id === a.target)
    if (!note) return t('Error! Reference source not found.')
    if (a.show === 'page') return refContext.pageLabel(refContext.pageOf(note.pos))
    if (a.show === 'aboveBelow') return note.pos < refPos ? t('above') : t('below')
    return note.label
  }
  const mark = collectBookmarks(doc).find((b) => b.name === a.target)
  if (!mark) return t('Error! Reference source not found.')
  if (a.show === 'page') return refContext.pageLabel(refContext.pageOf(mark.pos))
  if (a.show === 'aboveBelow') return mark.pos < refPos ? t('above') : t('below')
  const $pos = doc.resolve(mark.pos)
  const text = $pos.parent.textContent.trim()
  if (a.show === 'number') {
    const m = text.match(/^(?:Figure|Table|Equation)?\s*(\d+(?:\.\d+)*)/)
    return m ? m[1] : text
  }
  return text || '(empty)'
}

export const CrossRef = Node.create({
  name: 'crossRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    const attr = (name: string, def: string) => ({ default: def, parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`) ?? def, renderHTML: (a: Record<string, string>) => ({ [`data-${name}`]: a[name] }) })
    return { target: attr('target', ''), refType: attr('refType', 'bookmark'), show: attr('show', 'text') }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="crossref"]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'crossref', class: 'crossref' }), node.attrs.target]
  },

  renderText({ node }) {
    return node.attrs.target
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('span')
      dom.className = 'crossref'
      dom.dataset.crossref = ''
      dom.contentEditable = 'false'
      const paint = (n: PMNode) => {
        const pos = (getPos as () => number | undefined)() ?? 0
        dom.textContent = crossRefText(editor.state.doc, n.attrs as CrossRefAttrs, pos)
        dom.title = t('Cross-reference to {target}. Ctrl+Click to follow.', { target: n.attrs.target })
      }
      paint(node)
      dom.addEventListener('click', (e) => {
        if (!(e.ctrlKey || e.metaKey)) return
        const target = node.attrs.target as string
        const mark = collectBookmarks(editor.state.doc).find((b) => b.name === target) ?? collectNotes(editor.state.doc).find((n) => n.id === target)
        if (mark) editor.chain().focus().setTextSelection(mark.pos + 1).scrollIntoView().run()
      })
      return {
        dom,
        update: (n) => {
          if (n.type.name !== 'crossRef') return false
          node = n
          paint(n)
          return true
        },
        ignoreMutation: () => true,
      }
    }
  },

  addCommands() {
    return {
      insertCrossRef:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    }
  },
})

/** Keeps cross-reference texts current: they depend on text and pages elsewhere in the document. */
export const CrossRefRefresh = Extension.create({
  name: 'crossRefRefresh',
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey('crossRefRefresh'),
        view: () => ({
          update: (view) => {
            view.dom.querySelectorAll<HTMLElement>('[data-crossref]').forEach((dom) => {
              const pos = view.posAtDOM(dom, 0)
              const node = view.state.doc.nodeAt(pos)
              if (node?.type.name === 'crossRef') {
                const text = crossRefText(editor.state.doc, node.attrs as CrossRefAttrs, pos)
                if (dom.textContent !== text) dom.textContent = text
              }
            })
          },
        }),
      }),
    ]
  },
})

// ---- Signature lines ----

export type SignatureAttrs = { signer: string; signerTitle: string; email: string; instructions: string; showDate: boolean }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function signatureSvg(a: Record<string, unknown>, w: number, h: number) {
  const font = 'font-family="Calibri, Carlito, Arial, sans-serif"'
  const lineY = h * 0.55
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#fff"/><text x="6" y="${lineY - 6}" font-size="26" ${font} fill="#404040">X</text>${a.showDate ? `<text x="${w - 6}" y="${lineY - 8}" font-size="10" text-anchor="end" ${font} fill="#7f7f7f">Date</text>` : ''}<line x1="4" y1="${lineY}" x2="${w - 4}" y2="${lineY}" stroke="#404040" stroke-width="1.2"/><text x="6" y="${lineY + 16}" font-size="12" ${font} fill="#000">${esc(String(a.signer ?? ''))}</text><text x="6" y="${lineY + 30}" font-size="11" ${font} fill="#595959">${esc(String(a.signerTitle ?? ''))}</text></svg>`
}

const renderSignature: DrawingRenderer = (node, box, { width, height }) => {
  box.className = 'drawing-box signature-box'
  box.innerHTML = signatureSvg(node.attrs, width, height)
}

export const SignatureLine = Node.create<{ onEdit: ((pos: number) => void) | null }>({
  name: 'signatureLine',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { onEdit: null }
  },

  addAttributes() {
    const attr = (name: string, def: unknown) => ({ default: def, parseHTML: (el: HTMLElement) => (el.getAttribute(`data-${name}`) ?? def) as unknown, renderHTML: (a: Record<string, unknown>) => ({ [`data-${name}`]: String(a[name]) }) })
    return {
      ...drawingAttributes({ width: 192, height: 96 }),
      signer: attr('signer', ''),
      signerTitle: attr('signer-title', ''),
      email: attr('email', ''),
      instructions: attr('instructions', ''),
      showDate: { default: true, parseHTML: (el: HTMLElement) => el.getAttribute('data-show-date') !== 'false', renderHTML: (a: Record<string, unknown>) => ({ 'data-show-date': String(a.showDate) }) },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="signature-line"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const w = node.attrs.width ?? 192
    const h = node.attrs.height ?? 96
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'signature-line', class: 'drawing', style: `${wrapStyle(node.attrs)}; display: inline-block; width: ${w}px; height: ${h}px; background: url("data:image/svg+xml,${encodeURIComponent(signatureSvg(node.attrs, w, h))}") no-repeat` })]
  },

  addNodeView() {
    return ({ node, view, getPos }) =>
      new DrawingView(node, view, getPos as () => number | undefined, renderSignature, {
        className: 'signature',
        onDoubleClick: (_n, _v, gp) => {
          const pos = gp()
          if (pos != null) this.options.onEdit?.(pos)
        },
      })
  },

  addCommands() {
    return {
      insertSignatureLine:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    }
  },
})
