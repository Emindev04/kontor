import type { StylePatch } from './style'
import { BUILTIN_FORMATS } from './numfmt'

export type NamedStyle = { name: string; group: string; patch: StylePatch }

const ACCENTS = ['#2F6FC4', '#E3742F', '#9E9E9E', '#E8A600', '#4FA3D9', '#5FA84B']

function mix(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16)
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (255 - c) * amount))
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** The Cell Styles gallery. A style replaces the formatting it defines. */
export const CELL_STYLES: NamedStyle[] = [
  { group: 'Good, Bad and Neutral', name: 'Normal', patch: { fill: undefined, color: undefined, bold: undefined, italic: undefined, bt: undefined, bb: undefined, bl: undefined, br: undefined, size: undefined, font: undefined, fmt: undefined } },
  { group: 'Good, Bad and Neutral', name: 'Bad', patch: { fill: '#FFC9CE', color: '#9A0007' } },
  { group: 'Good, Bad and Neutral', name: 'Good', patch: { fill: '#C9EFD1', color: '#0B6118' } },
  { group: 'Good, Bad and Neutral', name: 'Neutral', patch: { fill: '#FFEBA0', color: '#8C5A00' } },
  { group: 'Data and Model', name: 'Calculation', patch: { fill: '#F2F2F2', color: '#F07A12', bold: true, ...box('#7F7F7F') } },
  { group: 'Data and Model', name: 'Check Cell', patch: { fill: '#A5A5A5', color: '#FFFFFF', bold: true, ...box('#3F3F3F', 'double') } },
  { group: 'Data and Model', name: 'Explanatory Text', patch: { color: '#7F7F7F', italic: true } },
  { group: 'Data and Model', name: 'Input', patch: { fill: '#FFCC99', color: '#3F3F76', ...box('#7F7F7F') } },
  { group: 'Data and Model', name: 'Linked Cell', patch: { color: '#F07A12', bb: { style: 'double', color: '#FF8001' } } },
  { group: 'Data and Model', name: 'Note', patch: { fill: '#FFFFCC', ...box('#B2B2B2') } },
  { group: 'Data and Model', name: 'Output', patch: { fill: '#F2F2F2', color: '#3F3F3F', bold: true, ...box('#3F3F3F') } },
  { group: 'Data and Model', name: 'Warning Text', patch: { color: '#FF0000' } },
  { group: 'Titles and Headings', name: 'Heading 1', patch: { bold: true, size: 15, color: '#2B3F5C', bb: { style: 'thick', color: '#2F6FC4' } } },
  { group: 'Titles and Headings', name: 'Heading 2', patch: { bold: true, size: 13, color: '#2B3F5C', bb: { style: 'thick', color: '#A9C4E8' } } },
  { group: 'Titles and Headings', name: 'Heading 3', patch: { bold: true, color: '#2B3F5C', bb: { style: 'medium', color: '#97B6E3' } } },
  { group: 'Titles and Headings', name: 'Heading 4', patch: { bold: true, color: '#2B3F5C' } },
  { group: 'Titles and Headings', name: 'Title', patch: { font: 'Calibri Light', size: 18, color: '#2B3F5C' } },
  { group: 'Titles and Headings', name: 'Total', patch: { bold: true, bt: { style: 'thin', color: '#2F6FC4' }, bb: { style: 'double', color: '#2F6FC4' } } },
  ...ACCENTS.flatMap((c, i): NamedStyle[] => [
    { group: 'Themed Cell Styles', name: `20% - Accent${i + 1}`, patch: { fill: mix(c, 0.8), color: '#000000' } },
    { group: 'Themed Cell Styles', name: `40% - Accent${i + 1}`, patch: { fill: mix(c, 0.6), color: '#000000' } },
    { group: 'Themed Cell Styles', name: `60% - Accent${i + 1}`, patch: { fill: mix(c, 0.4), color: '#FFFFFF' } },
    { group: 'Themed Cell Styles', name: `Accent${i + 1}`, patch: { fill: c, color: '#FFFFFF' } },
  ]),
  { group: 'Number Format', name: 'Comma', patch: { fmt: BUILTIN_FORMATS.comma } },
  { group: 'Number Format', name: 'Comma [0]', patch: { fmt: '_(* #,##0_);_(* \\(#,##0\\);_(* "-"_);_(@_)' } },
  { group: 'Number Format', name: 'Currency', patch: { fmt: BUILTIN_FORMATS.accounting } },
  { group: 'Number Format', name: 'Currency [0]', patch: { fmt: '_("$"* #,##0_);_("$"* \\(#,##0\\);_("$"* "-"_);_(@_)' } },
  { group: 'Number Format', name: 'Percent', patch: { fmt: '0%' } },
]

function box(color: string, style: 'thin' | 'double' = 'thin'): StylePatch {
  const b = { style, color }
  return { bt: b, bb: b, bl: b, br: b }
}
