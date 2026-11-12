import { Extension } from '@tiptap/core'
import { DOMParser as PMDOMParser, Fragment, Slice, type Node as PMNode, type Schema } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

// Pasting like the original: formatting of block elements is kept ("Keep Source Formatting"),
// pictures can be pasted and dropped, and after every paste a Paste Options button lets the user
// switch to "Merge Formatting" or "Keep Text Only".

export type PasteMode = 'keep' | 'merge' | 'text'

/** What was pasted last and where it landed, so the Paste Options button can redo it differently. */
export type LastPaste = { from: number; to: number; html: string | null; text: string; mode: PasteMode }

type State = { last: LastPaste | null }

export const pasteKey = new PluginKey<State>('pasteOptions')

/** Emphasis that "Merge Formatting" keeps; fonts, sizes, colors and paragraph formatting are dropped. */
const MERGE_MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'subscript', 'superscript', 'link'])
const BLOCK_STYLE_PROPS = ['font-family', 'font-size', 'color', 'font-weight', 'font-style']
const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, td, th, div, blockquote'

/**
 * Web pages often put text formatting on the block element itself (`<p style="color: red">`), which
 * the editor only reads from inline elements: move it onto a span around the block's content.
 */
export function hoistBlockStyles(html: string) {
  if (!/style\s*=/i.test(html)) return html
  const doc = new window.DOMParser().parseFromString(html, 'text/html')
  for (const el of Array.from(doc.body.querySelectorAll<HTMLElement>(BLOCKS))) {
    const props = BLOCK_STYLE_PROPS.filter((p) => el.style.getPropertyValue(p))
    if (!props.length || !el.textContent?.trim()) continue
    // Only blocks whose children are inline content; nested blocks get their own span.
    if (Array.from(el.children).some((c) => c.matches(BLOCKS + ', ul, ol, table'))) continue
    const span = doc.createElement('span')
    for (const p of props) {
      if (p === 'font-weight' || p === 'font-style') continue
      span.style.setProperty(p, el.style.getPropertyValue(p))
    }
    while (el.firstChild) span.appendChild(el.firstChild)
    let inner: HTMLElement = span
    const weight = el.style.fontWeight
    if (weight === 'bold' || Number(weight) >= 600) {
      const b = doc.createElement('strong')
      b.appendChild(inner)
      inner = b
    }
    if (el.style.fontStyle === 'italic') {
      const i = doc.createElement('em')
      i.appendChild(inner)
      inner = i
    }
    el.appendChild(inner)
  }
  return doc.body.innerHTML
}

/** Plain text as paragraphs; a single line stays inline so it joins the current paragraph. */
export function textSlice(schema: Schema, text: string): Slice {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n')
  const para = (line: string) => schema.nodes.paragraph.create(null, line ? schema.text(line) : null)
  if (lines.length === 1) return new Slice(Fragment.from(lines[0] ? schema.text(lines[0]) : []), 0, 0)
  return new Slice(Fragment.from(lines.map(para)), 1, 1)
}

/** Strips everything but emphasis and structure, so pasted text takes on the destination's look. */
export function mergeFormatting(schema: Schema, slice: Slice): Slice {
  const clean = (fragment: Fragment): Fragment => {
    const out: PMNode[] = []
    fragment.forEach((node) => {
      if (node.isText) {
        out.push(node.mark(node.marks.filter((m) => MERGE_MARKS.has(m.type.name))))
        return
      }
      const attrs = node.isTextblock ? Object.fromEntries(Object.entries(node.attrs).filter(([k]) => k === 'level' || k === 'pStyle')) : node.attrs
      const keep = node.isTextblock ? { ...node.type.create().attrs, ...attrs, pStyle: null } : attrs
      out.push(node.type.create(keep, clean(node.content), node.marks.filter((m) => MERGE_MARKS.has(m.type.name))))
    })
    return Fragment.from(out)
  }
  return new Slice(clean(slice.content), slice.openStart, slice.openEnd)
}

export function htmlSlice(view: EditorView, html: string): Slice {
  const dom = document.createElement('div')
  dom.innerHTML = hoistBlockStyles(html)
  const parser = view.someProp('clipboardParser') ?? PMDOMParser.fromSchema(view.state.schema)
  return parser.parseSlice(dom, { preserveWhitespace: true, context: view.state.selection.$from })
}

/** The content of a paste in the given mode. */
export function pasteSlice(view: EditorView, html: string | null, text: string, mode: PasteMode): Slice {
  if (mode === 'text' || !html) return textSlice(view.state.schema, text)
  const slice = htmlSlice(view, html)
  return mode === 'merge' ? mergeFormatting(view.state.schema, slice) : slice
}

/** Inserts clipboard content (from the Paste button or a Paste Options choice) and remembers it. */
export function insertPaste(view: EditorView, html: string | null, text: string, mode: PasteMode, range?: { from: number; to: number }) {
  const { state } = view
  const from = range?.from ?? state.selection.from
  const to = range?.to ?? state.selection.to
  const slice = pasteSlice(view, html, text, mode)
  const tr = state.tr.replaceRange(from, to, slice)
  const end = tr.mapping.map(to, 1)
  tr.setMeta(pasteKey, { last: { from: Math.min(from, end), to: end, html, text, mode } }).scrollIntoView()
  view.dispatch(tr)
  view.focus()
}

/** A paste option shown live while the pointer rests on it; `original` is what it replaced. */
export type PastePreview = { from: number; to: number; original: Slice; last: LastPaste }

/**
 * Live preview of a paste option: the pasted content is shown the other way at once, outside the
 * undo history and change tracking, until the pointer leaves the option (see `endPastePreview`).
 */
export function startPastePreview(view: EditorView, last: LastPaste, mode: PasteMode): PastePreview | null {
  if (mode === last.mode) return null
  const original = view.state.doc.slice(last.from, last.to)
  const tr = view.state.tr.replaceRange(last.from, last.to, pasteSlice(view, last.html, last.text, mode))
  const to = tr.mapping.map(last.to, 1)
  tr.setMeta('addToHistory', false).setMeta('trackChangesSkip', true).setMeta(pasteKey, { last })
  view.dispatch(tr)
  return { from: last.from, to, original, last }
}

export function endPastePreview(view: EditorView, preview: PastePreview) {
  const tr = view.state.tr.replaceRange(preview.from, preview.to, preview.original)
  tr.setMeta('addToHistory', false).setMeta('trackChangesSkip', true).setMeta(pasteKey, { last: preview.last })
  view.dispatch(tr)
}

export function getLastPaste(state: EditorState) {
  return pasteKey.getState(state)?.last ?? null
}

function readImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function insertImages(view: EditorView, files: File[], pos?: number) {
  const type = view.state.schema.nodes.image
  if (!type) return
  void Promise.all(files.map(readImage)).then((sources) => {
    const nodes = sources.map((src, i) => type.create({ src, alt: files[i].name.replace(/\.[^.]+$/, '') }))
    const at = pos ?? view.state.selection.from
    view.dispatch(view.state.tr.insert(Math.min(at, view.state.doc.content.size), Fragment.from(nodes)).scrollIntoView())
  })
}

const imageFiles = (list: FileList | null | undefined) => Array.from(list ?? []).filter((f) => f.type.startsWith('image/'))

export const PasteOptions = Extension.create<{ getDefaultMode: () => PasteMode }>({
  name: 'pasteOptions',

  addOptions() {
    return { getDefaultMode: () => 'keep' as PasteMode }
  },

  addProseMirrorPlugins() {
    const options = this.options
    let pending: { html: string | null; text: string; from: number } | null = null
    return [
      new Plugin<State>({
        key: pasteKey,
        state: {
          init: () => ({ last: null }),
          apply(tr, prev) {
            const meta = tr.getMeta(pasteKey) as State | undefined
            if (meta) return meta
            if (tr.getMeta('uiEvent') === 'paste' && pending) {
              const p = pending
              pending = null
              // The pasted content runs from the old selection start to the cursor.
              const to = tr.selection.to
              return { last: { from: Math.min(tr.mapping.map(p.from, -1), to), to, html: p.html, text: p.text, mode: 'keep' } }
            }
            // Any other edit hides the Paste Options button.
            return prev.last && tr.docChanged ? { last: null } : prev
          },
        },
        props: {
          transformPastedHTML: (html) => hoistBlockStyles(html),
          handlePaste(view, event) {
            const data = event.clipboardData
            const images = imageFiles(data?.files)
            const html = data?.getData('text/html') || null
            const text = data?.getData('text/plain') ?? ''
            if (images.length && !html && !text) {
              insertImages(view, images)
              return true
            }
            const mode = options.getDefaultMode()
            if (mode !== 'keep' && (html || text)) {
              insertPaste(view, html, text, mode)
              return true
            }
            pending = { html, text, from: view.state.selection.from }
            return false
          },
          handleDrop(view, event, _slice, moved) {
            if (moved) return false
            const images = imageFiles(event.dataTransfer?.files)
            if (!images.length) return false
            event.preventDefault()
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
            insertImages(view, images, pos)
            return true
          },
        },
      }),
    ]
  },
})
