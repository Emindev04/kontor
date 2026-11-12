import { Node, mergeAttributes } from '@tiptap/core'

// Inline fields for headers and footers. In static HTML they render as placeholders that the page
// renderer replaces per page; in a live header editor they show the value for the edited page.

export type FieldKind = 'page' | 'numPages' | 'date' | 'time' | 'title' | 'author'
export const FIELD_TOKEN: Record<FieldKind, string> = {
  page: '{{PAGE}}',
  numPages: '{{NUMPAGES}}',
  date: '{{DATE}}',
  time: '{{TIME}}',
  title: '{{TITLE}}',
  author: '{{AUTHOR}}',
}

export type FieldOptions = { resolve: ((kind: FieldKind) => string) | null }

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    field: {
      insertField: (kind: FieldKind) => ReturnType
    }
  }
}

export const Field = Node.create<FieldOptions>({
  name: 'field',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { resolve: null }
  },

  addAttributes() {
    return {
      kind: {
        default: 'page',
        parseHTML: (el) => el.getAttribute('data-field'),
        renderHTML: (a) => ({ 'data-field': a.kind }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-field]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'field' }), FIELD_TOKEN[node.attrs.kind as FieldKind] ?? '']
  },

  renderText({ node }) {
    return this.options.resolve?.(node.attrs.kind) ?? FIELD_TOKEN[node.attrs.kind as FieldKind] ?? ''
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span')
      dom.className = 'field'
      dom.dataset.field = node.attrs.kind
      dom.textContent = this.options.resolve?.(node.attrs.kind) ?? FIELD_TOKEN[node.attrs.kind as FieldKind]
      return { dom }
    }
  },

  addCommands() {
    return {
      insertField:
        (kind) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { kind } }),
    }
  },
})

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Replaces field placeholders in rendered header/footer HTML with their values. */
export function resolveFieldTokens(html: string, values: Partial<Record<FieldKind, string>>) {
  let out = html
  for (const [kind, token] of Object.entries(FIELD_TOKEN) as [FieldKind, string][]) {
    if (values[kind] != null) out = out.split(token).join(escapeHtml(values[kind]!))
  }
  return out
}

export function fieldValue(kind: FieldKind, ctx: { page: string; pages: number; title: string }) {
  const now = new Date()
  switch (kind) {
    case 'page': return ctx.page
    case 'numPages': return String(ctx.pages)
    case 'date': return now.toLocaleDateString('en-US')
    case 'time': return now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    case 'title': return ctx.title
    case 'author': return ''
  }
}
