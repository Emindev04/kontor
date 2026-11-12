import { Extension } from '@tiptap/core'

// Bullet and numbering library styles, stored on the list node.

export const BULLET_STYLES: { id: string; label: string; symbol: string }[] = [
  { id: 'disc', label: 'Filled round bullet', symbol: '•' },
  { id: 'circle', label: 'Hollow round bullet', symbol: '○' },
  { id: 'square', label: 'Filled square bullet', symbol: '■' },
  { id: 'diamond', label: 'Diamond bullet', symbol: '◆' },
  { id: 'arrow', label: 'Arrow bullet', symbol: '➢' },
  { id: 'check', label: 'Check mark bullet', symbol: '✓' },
  { id: 'dash', label: 'Dash bullet', symbol: '–' },
  { id: 'star', label: 'Star bullet', symbol: '★' },
]

export const NUMBER_STYLES: { id: string; label: string; sample: string }[] = [
  { id: 'decimal', label: '1. 2. 3.', sample: '1.' },
  { id: 'decimal-paren', label: '1) 2) 3)', sample: '1)' },
  { id: 'upper-roman', label: 'I. II. III.', sample: 'I.' },
  { id: 'upper-alpha', label: 'A. B. C.', sample: 'A.' },
  { id: 'lower-alpha-paren', label: 'a) b) c)', sample: 'a)' },
  { id: 'lower-alpha', label: 'a. b. c.', sample: 'a.' },
  { id: 'lower-roman', label: 'i. ii. iii.', sample: 'i.' },
]

export const MULTILEVEL_STYLES: { id: string; label: string; sample: string[] }[] = [
  { id: 'decimal', label: '1. a. i.', sample: ['1.', 'a.', 'i.'] },
  { id: 'legal', label: '1. 1.1. 1.1.1.', sample: ['1.', '1.1.', '1.1.1.'] },
  { id: 'outline', label: 'I. A. 1.', sample: ['I.', 'A.', '1.'] },
]

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    listStyles: {
      setBulletStyle: (id: string) => ReturnType
      setNumberStyle: (id: string) => ReturnType
      setNumberingStart: (start: number) => ReturnType
    }
  }
}

export const ListStyles = Extension.create({
  name: 'listStyles',

  addGlobalAttributes() {
    return [
      {
        types: ['bulletList', 'orderedList'],
        attributes: {
          listStyle: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-list-style'),
            renderHTML: (a) => (a.listStyle ? { 'data-list-style': a.listStyle } : {}),
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setBulletStyle:
        (id) =>
        ({ editor, chain }) => {
          const c = chain()
          if (!editor.isActive('bulletList')) c.toggleBulletList()
          return c.updateAttributes('bulletList', { listStyle: id === 'disc' ? null : id }).run()
        },
      setNumberStyle:
        (id) =>
        ({ editor, chain }) => {
          const c = chain()
          if (!editor.isActive('orderedList')) c.toggleOrderedList()
          return c.updateAttributes('orderedList', { listStyle: id === 'decimal' ? null : id }).run()
        },
      setNumberingStart:
        (start) =>
        ({ commands }) =>
          commands.updateAttributes('orderedList', { start }),
    }
  },
})
