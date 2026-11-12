import type { Pane } from '../../store/store'

export type DialogKind =
  | 'find'
  | 'replace'
  | 'replaceFonts'
  | 'link'
  | 'headerFooter'
  | 'slideSize'
  | 'zoom'
  | 'font'
  | 'paragraph'
  | 'section'
  | 'shortcuts'
  | 'about'
  | 'setupShow'
  | 'accessibility'
  | 'altText'
  | 'dateTime'
  | 'icons'
  | 'insertTable'
  | 'splitCells'
  | 'cellMargins'
  | 'insertChart'
  | 'changeChart'
  | 'chartData'
  | 'insertDiagram'
  | 'effectOptions'
  | 'customShows'
  | 'trimMedia'
  | 'compressPictures'
  | 'reuseSlides'
  | 'photoAlbum'
  | 'columns'
  | 'bullets'
  | 'themeColors'
  | 'themeFonts'
  | 'gridGuides'
  | 'options'
  | 'thesaurus'

export type UiApi = {
  openDialog: (kind: DialogKind) => void
  openPane: (pane: Pane) => void
  insertPicture: () => void
  save: () => void
}

export type TabProps = { ui: UiApi }
