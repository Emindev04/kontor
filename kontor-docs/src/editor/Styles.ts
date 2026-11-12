import { Extension, Mark, mergeAttributes } from '@tiptap/core'

// Named styles like the original's Styles gallery. Paragraph styles are an attribute on paragraphs
// (headings stay heading nodes); character styles are a mark.

export type ParagraphStyleId = 'noSpacing' | 'title' | 'subtitle' | 'quote' | 'intenseQuote' | 'listParagraph' | 'caption'
export type CharStyleId = 'strong' | 'emphasis' | 'subtleEmphasis' | 'intenseEmphasis' | 'subtleReference' | 'intenseReference' | 'bookTitle'

export const PARAGRAPH_STYLE_NAMES: Record<ParagraphStyleId, string> = {
  noSpacing: 'No Spacing',
  title: 'Title',
  subtitle: 'Subtitle',
  quote: 'Quote',
  intenseQuote: 'Intense Quote',
  listParagraph: 'List Paragraph',
  caption: 'Caption',
}

export const CHAR_STYLE_NAMES: Record<CharStyleId, string> = {
  strong: 'Strong',
  emphasis: 'Emphasis',
  subtleEmphasis: 'Subtle Emphasis',
  intenseEmphasis: 'Intense Emphasis',
  subtleReference: 'Subtle Reference',
  intenseReference: 'Intense Reference',
  bookTitle: 'Book Title',
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    styles: {
      setParagraphStyle: (id: ParagraphStyleId | null) => ReturnType
      setCharStyle: (id: CharStyleId) => ReturnType
      unsetCharStyle: () => ReturnType
    }
  }
}

export const ParagraphStyles = Extension.create({
  name: 'paragraphStyles',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          pStyle: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-style'),
            renderHTML: (a) => (a.pStyle ? { 'data-style': a.pStyle, class: `ps-${a.pStyle}` } : {}),
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setParagraphStyle:
        (id) =>
        ({ chain, editor }) => {
          const c = chain()
          if (editor.isActive('blockquote')) c.lift('blockquote')
          return c.setParagraph().updateAttributes('paragraph', { pStyle: id }).run()
        },
      setCharStyle:
        (id) =>
        ({ commands }) =>
          commands.setMark('charStyle', { id }),
      unsetCharStyle:
        () =>
        ({ commands }) =>
          commands.unsetMark('charStyle'),
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-n': () => this.editor.chain().setParagraph().updateAttributes('paragraph', { pStyle: null }).run(),
    }
  },
})

export const CharStyle = Mark.create({
  name: 'charStyle',
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-char-style'),
        renderHTML: (a) => ({ 'data-char-style': a.id, class: `cs-${a.id}` }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-char-style]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0]
  },
})
