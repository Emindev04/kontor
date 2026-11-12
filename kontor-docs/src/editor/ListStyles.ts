import { Extension } from '@tiptap/core'
import { bulletCss, ensureListCss, isMultilevel } from './customLists'
import { tx } from '../i18n'

// Bullet and numbering library styles, stored on the list node.

export const BULLET_STYLES: { id: string; label: string; symbol: string }[] = [
  { id: 'disc', label: tx('Filled round bullet'), symbol: '•' },
  { id: 'circle', label: tx('Hollow round bullet'), symbol: '○' },
  { id: 'square', label: tx('Filled square bullet'), symbol: '■' },
  { id: 'diamond', label: tx('Diamond bullet'), symbol: '◆' },
  { id: 'arrow', label: tx('Arrow bullet'), symbol: '➢' },
  { id: 'check', label: tx('Check mark bullet'), symbol: '✓' },
  { id: 'dash', label: tx('Dash bullet'), symbol: '–' },
  { id: 'star', label: tx('Star bullet'), symbol: '★' },
]

export const NUMBER_STYLES: { id: string; label: string; sample: string }[] = [
  { id: 'decimal', label: '1. 2. 3.', sample: '1.' },
  { id: 'decimal-paren', label: '1) 2) 3)', sample: '1)' },
  { id: 'upper-roman', label: tx('I. II. III.'), sample: 'I.' },
  { id: 'upper-alpha', label: 'A. B. C.', sample: 'A.' },
  { id: 'lower-alpha-paren', label: 'a) b) c)', sample: 'a)' },
  { id: 'lower-alpha', label: 'a. b. c.', sample: 'a.' },
  { id: 'lower-roman', label: tx('i. ii. iii.'), sample: 'i.' },
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
      /** Applies a multilevel list definition to the whole (outermost) list. */
      setMultilevelList: (style: string) => ReturnType
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
            renderHTML: (a) => {
              if (!a.listStyle) return {}
              if (isMultilevel(a.listStyle)) ensureListCss(a.listStyle)
              const style = bulletCss(a.listStyle)
              return style ? { 'data-list-style': a.listStyle, style } : { 'data-list-style': a.listStyle }
            },
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
      setMultilevelList:
        (style) =>
        ({ editor, state, tr, dispatch }) => {
          if (!editor.isActive('orderedList')) {
            if (!editor.chain().toggleOrderedList().run()) return false
            return editor.commands.setMultilevelList(style)
          }
          const { $from } = state.selection
          let outer = -1
          for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === 'orderedList' || $from.node(d).type.name === 'bulletList') outer = d
          if (outer < 0) return false
          const pos = $from.before(outer)
          const list = $from.node(outer)
          if (!dispatch) return true
          // The outer list becomes an ordered list with the definition; nested lists follow its levels.
          tr.setNodeMarkup(pos, state.schema.nodes.orderedList, { ...list.attrs, listStyle: style })
          list.descendants((child, rel) => {
            if (child.type.name === 'orderedList' || child.type.name === 'bulletList') tr.setNodeMarkup(pos + 1 + rel, state.schema.nodes.orderedList, { ...child.attrs, listStyle: null, start: 1 })
          })
          return true
        },
      setNumberingStart:
        (start) =>
        ({ commands }) =>
          commands.updateAttributes('orderedList', { start }),
    }
  },
})
