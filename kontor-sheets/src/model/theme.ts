// Workbook themes (Page Layout > Themes): our own color schemes and font pairs. The current theme
// drives the theme colors of the palettes, the default chart colors and the table styles, and is
// written to the theme part of .xlsx files.
export type Theme = {
  name: string
  /** dk1, lt1, dk2, lt2, accent1–6, hlink, folHlink */
  colors: { dk1: string; lt1: string; dk2: string; lt2: string; accents: string[]; hlink: string; folHlink: string }
  fonts: { major: string; minor: string }
}

export const THEMES: Theme[] = [
  { name: 'Kontor', colors: { dk1: '#000000', lt1: '#FFFFFF', dk2: '#3D4B5C', lt2: '#E8E6E3', accents: ['#2F6FC4', '#E3742F', '#9E9E9E', '#F2B705', '#4FA3D9', '#5FA84B'], hlink: '#0563C1', folHlink: '#954F72' }, fonts: { major: 'Calibri Light', minor: 'Calibri' } },
  { name: 'Harbor', colors: { dk1: '#000000', lt1: '#FFFFFF', dk2: '#1E3A5F', lt2: '#DDE6EE', accents: ['#1F6E8C', '#2E8BC0', '#76B5C5', '#E89F3C', '#C25B56', '#5A7D3A'], hlink: '#1F6E8C', folHlink: '#7A5C8E' }, fonts: { major: 'Georgia', minor: 'Verdana' } },
  { name: 'Meadow', colors: { dk1: '#000000', lt1: '#FFFFFF', dk2: '#2F4F2F', lt2: '#EEF3E6', accents: ['#4E8B3A', '#9BBB59', '#D9A441', '#7A9E9F', '#B5651D', '#5C7A99'], hlink: '#3B7A2A', folHlink: '#8A6D3B' }, fonts: { major: 'Trebuchet MS', minor: 'Trebuchet MS' } },
  { name: 'Ember', colors: { dk1: '#000000', lt1: '#FFFFFF', dk2: '#4A2C2A', lt2: '#F4E9E1', accents: ['#C0392B', '#E67E22', '#F1C40F', '#8E5B3E', '#D35400', '#7F8C8D'], hlink: '#C0392B', folHlink: '#8E5B3E' }, fonts: { major: 'Cambria', minor: 'Calibri' } },
  { name: 'Slate', colors: { dk1: '#000000', lt1: '#FFFFFF', dk2: '#2C3E50', lt2: '#ECF0F1', accents: ['#34495E', '#16A085', '#2980B9', '#8E44AD', '#F39C12', '#C0392B'], hlink: '#2980B9', folHlink: '#8E44AD' }, fonts: { major: 'Segoe UI', minor: 'Segoe UI' } },
  { name: 'Orchid', colors: { dk1: '#000000', lt1: '#FFFFFF', dk2: '#4B2E5C', lt2: '#F3EAF5', accents: ['#8E44AD', '#C06C84', '#F67280', '#6C5B7B', '#355C7D', '#F8B195'], hlink: '#8E44AD', folHlink: '#6C5B7B' }, fonts: { major: 'Garamond', minor: 'Garamond' } },
  { name: 'Sandstone', colors: { dk1: '#000000', lt1: '#FFFFFF', dk2: '#5B4636', lt2: '#F2EBDD', accents: ['#A0522D', '#C9A66B', '#7D8B5E', '#D98E04', '#6B8E9F', '#8C6A5D'], hlink: '#A0522D', folHlink: '#7D8B5E' }, fonts: { major: 'Book Antiqua', minor: 'Arial' } },
  { name: 'Glacier', colors: { dk1: '#000000', lt1: '#FFFFFF', dk2: '#21455C', lt2: '#E6F2F8', accents: ['#3A86C8', '#5BC0EB', '#9BC53D', '#FDE74C', '#E55934', '#7A8B99'], hlink: '#3A86C8', folHlink: '#7A8B99' }, fonts: { major: 'Tahoma', minor: 'Tahoma' } },
]

let current: Theme = THEMES[0]

export const currentTheme = () => current
export function setCurrentTheme(t: Theme | undefined) {
  current = t ?? THEMES[0]
}

/** The ten theme colors in palette order: background, text, background 2, text 2, accents 1–6. */
export const themePalette = () => [current.colors.lt1, current.colors.dk1, current.colors.lt2, current.colors.dk2, ...current.colors.accents]
