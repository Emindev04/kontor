import { Authorities } from './Authorities'
import { SimilarFormatting } from './SimilarFormatting'
import { Extension, type Extensions } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { TextAlign } from '@tiptap/extension-text-align'
import { Highlight } from '@tiptap/extension-highlight'
import { TableKit } from '@tiptap/extension-table'
import { Subscript } from '@tiptap/extension-subscript'
import { Superscript } from '@tiptap/extension-superscript'
import { CharacterCount } from '@tiptap/extensions'
import { PageBreak } from './PageBreak'
import { ParagraphFormat } from './ParagraphFormat'
import { CharStyle, ParagraphStyles } from './Styles'
import { TextEffects } from './TextEffects'
import { Search } from './Search'
import { Field, type FieldKind } from './Fields'
import { Pagination, type PaginationController } from './Pagination'
import { StyledTableView, TableStyles } from './TableStyles'
import { ListStyles } from './ListStyles'
import { TableOfContents } from './TableOfContents'
import { MergeField, MergeRule } from './MailMerge'
import { ImageFormat } from './ImageFormat'
import { stepFontSize } from './commands'
import { Review } from './Review'
import { DEFAULT_NOTE_SETTINGS, NoteRef, type NoteSettings } from './Notes'
import { ColumnBreak, Columns, SectionBreak } from './Sections'
import { Picture } from './Picture'
import { TableExtras } from './TableExtras'
import { TabStops } from './TabStops'
import { AutoCorrect, type AutoCorrectOptions } from './AutoCorrect'
import { Shape } from './Shape'
import { TextBox } from './TextBox'
import { Chart } from './Chart'
import { Diagram } from './Diagram'
import { HistoryLabels } from './HistoryLabels'
import { Repeat } from './Repeat'
import { OnlineVideo } from './OnlineVideo'
import { Bookmark, CrossRef, CrossRefRefresh, Equation, SignatureLine } from './Objects'
import { PasteOptions, type PasteMode } from './Paste'
import { DrawingSelection } from './DrawingSelection'
import { Citations } from './Citations'
import { t } from '../i18n'

/** Callbacks for objects that open a dialog when double-clicked. */
export type ObjectEditors = { chart?: (pos: number) => void; diagram?: (pos: number) => void; equation?: (pos: number) => void; signature?: (pos: number) => void }

/** Keyboard shortcuts of the original that differ from the editor library's defaults. */
const WordShortcuts = Extension.create({
  name: 'wordShortcuts',
  priority: 1000,
  addKeyboardShortcuts() {
    const e = this.editor
    return {
      'Mod-e': () => e.commands.setTextAlign('center'),
      'Mod-l': () => e.commands.setTextAlign('left'),
      'Mod-r': () => e.commands.setTextAlign('right'),
      'Mod-j': () => e.commands.setTextAlign('justify'),
      'Mod-Shift-l': () => e.commands.toggleBulletList(),
      'Mod-=': () => e.chain().unsetSuperscript().toggleSubscript().run(),
      'Mod-Shift-=': () => e.chain().unsetSubscript().toggleSuperscript().run(),
      'Mod-+': () => e.chain().unsetSubscript().toggleSuperscript().run(),
      'Mod-Shift->': () => (stepFontSize(e, 1), true),
      'Mod-Shift-<': () => (stepFontSize(e, -1), true),
      'Mod->': () => (stepFontSize(e, 1), true),
      'Mod-<': () => (stepFontSize(e, -1), true),
      'Mod-]': () => (stepFontSize(e, 1, 1), true),
      'Mod-[': () => (stepFontSize(e, -1, 1), true),
      'Mod- ': () => e.chain().unsetAllMarks().run(),
      // Word underline and hidden text.
      'Mod-Shift-w': () => (e.isActive('underline', { underlineStyle: 'words' }) ? e.chain().unsetUnderline().run() : e.chain().setUnderlineStyle('words', null).run()),
      'Mod-Shift-h': () => e.chain().setTextEffects({ hidden: !e.getAttributes('textStyle').hidden || null }).run(),
    }
  },
})

type Options = {
  pagination?: PaginationController
  resolveField?: (kind: FieldKind) => string
  placeholder?: boolean
  getAuthor?: () => string
  getNoteSettings?: () => NoteSettings
  editors?: ObjectEditors
  getAutoCorrect?: AutoCorrectOptions['getSettings']
  getPasteMode?: () => PasteMode
}

export function createExtensions({ pagination, resolveField, getAuthor, getNoteSettings, editors, getAutoCorrect, getPasteMode }: Options = {}): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: { openOnClick: false, autolink: true },
      code: false,
      codeBlock: false,
    }),
    TextStyleKit.configure({ lineHeight: false }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Highlight.configure({ multicolor: true }),
    TableKit.configure({ table: { resizable: true, View: StyledTableView } }),
    TableStyles,
    TableExtras,
    Picture.configure({ inline: true, allowBase64: true }),
    Shape,
    TextBox,
    Chart.configure({ onEdit: editors?.chart ?? null }),
    Diagram.configure({ onEdit: editors?.diagram ?? null }),
    Equation.configure({ onEdit: editors?.equation ?? null }),
    Bookmark,
    CrossRef,
    CrossRefRefresh,
    SignatureLine.configure({ onEdit: editors?.signature ?? null }),
    DrawingSelection,
    HistoryLabels,
    Repeat,
    OnlineVideo,
    Citations,
    Authorities,
    ImageFormat,
    Subscript,
    Superscript,
    CharacterCount,
    PageBreak,
    SectionBreak,
    ColumnBreak,
    Columns,
    ParagraphFormat,
    TabStops,
    ParagraphStyles,
    ListStyles,
    TableOfContents,
    MergeField,
    MergeRule,
    CharStyle,
    TextEffects,
    Search,
    SimilarFormatting,
    Field.configure({ resolve: resolveField ?? null }),
    WordShortcuts,
    PasteOptions.configure({ getDefaultMode: getPasteMode ?? (() => 'keep') }),
    ...(getAutoCorrect ? [AutoCorrect.configure({ getSettings: getAutoCorrect })] : []),
    Review.configure({ getAuthor: getAuthor ?? (() => t('Author')) }),
    NoteRef.configure({ getSettings: getNoteSettings ?? (() => DEFAULT_NOTE_SETTINGS) }),
    ...(pagination ? [Pagination.configure({ controller: pagination })] : []),
  ]
}

/** Schema-only extension list for static rendering (generateHTML) of headers, footers and exports. */
export const staticExtensions = createExtensions()
