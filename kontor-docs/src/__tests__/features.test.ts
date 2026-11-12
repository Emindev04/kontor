// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Editor, type JSONContent } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import JSZip from 'jszip'
import { createExtensions } from '../editor/extensions'
import { decodeMultilevel, defaultLevels, encodeMultilevel, levelLabel, multilevelCss, formatLevelNumber } from '../editor/customLists'
import { compareValues, fieldOf, sortRows, sortSelection } from '../editor/sortText'
import { MultiRangeSelection, similarRanges } from '../editor/SimilarFormatting'
import { findMatches } from '../editor/Search'
import { authorityLines } from '../editor/Authorities'
import { mergeAll, ruleMatches, type RuleAttrs } from '../editor/MailMerge'
import { parsePageRange, printOrder } from '../io/print'
import { dataUrlBytes, removeBackgroundPixels, targetPixels } from '../editor/pictureTools'
import { syllablePoints, withSyllables } from '../editor/hyphenate'
import { appendStep, describeStep, validMacroName } from '../editor/macros'
import { coverPage, coverPageRange } from '../hf/presets'
import { parseStyleFile } from '../components/dialogs/ManageStylesDialog'
import { exportDocx } from '../io/docxExport'
import { hiddenFieldNode, importDocx } from '../io/docxImport'
import { DEFAULT_DESIGN, DEFAULT_SETUP, EMPTY_HEADER_FOOTER } from '../pageSetup'

const base = { setup: DEFAULT_SETUP, design: DEFAULT_DESIGN, headerFooter: EMPTY_HEADER_FOOTER, title: 'T' }
const p = (text: string, marks?: JSONContent['marks']): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] })
const makeEditor = (content: JSONContent) => new Editor({ extensions: createExtensions(), content })
function all(doc: JSONContent, pred: (n: JSONContent) => boolean, out: JSONContent[] = []) {
  if (pred(doc)) out.push(doc)
  for (const c of doc.content ?? []) all(c, pred, out)
  return out
}
async function docXml(blob: Blob) {
  return (await JSZip.loadAsync(await blob.arrayBuffer())).file('word/document.xml')!.async('string')
}

describe('custom bullets and multilevel lists', () => {
  it('encodes, decodes and labels multilevel definitions', () => {
    const levels = defaultLevels()
    levels[1] = { f: 'lower-alpha', t: '%1.%2)' }
    const style = encodeMultilevel(levels)
    expect(decodeMultilevel(style)?.[1]).toEqual({ f: 'lower-alpha', t: '%1.%2)' })
    expect(levelLabel(levels, 1, [3, 2])).toBe('3.b)')
    expect(formatLevelNumber(14, 'upper-roman')).toBe('XIV')
    expect(formatLevelNumber(28, 'lower-alpha')).toBe('ab')
    expect(multilevelCss(style)).toContain('counter(kml1, decimal) "." counter(kml2, lower-alpha) ")"')
    expect(decodeMultilevel('ml:not json')).toBeNull()
  })

  it('writes multilevel lists and symbol bullets to .docx and reads them back', async () => {
    const levels = defaultLevels()
    levels[1] = { f: 'upper-alpha', t: '%1-%2' }
    const ml = encodeMultilevel(levels)
    const doc: JSONContent = {
      type: 'doc',
      content: [
        { type: 'orderedList', attrs: { listStyle: ml }, content: [{ type: 'listItem', content: [p('One'), { type: 'orderedList', content: [{ type: 'listItem', content: [p('Inner')] }] }] }] },
        { type: 'bulletList', attrs: { listStyle: 'sym:☆' }, content: [{ type: 'listItem', content: [p('Star')] }] },
        { type: 'orderedList', attrs: { listStyle: 'legal' }, content: [{ type: 'listItem', content: [p('Legal')] }] },
      ],
    }
    const blob = await exportDocx({ ...base, doc })
    const numbering = await (await JSZip.loadAsync(await blob.arrayBuffer())).file('word/numbering.xml')!.async('string')
    expect(numbering).toContain('w:val="%1-%2"')
    expect(numbering).toContain('w:val="☆"')
    const back = await importDocx(blob)
    const lists = all(back.content, (n) => n.type === 'orderedList' || n.type === 'bulletList')
    expect(lists.some((l) => l.attrs?.listStyle === ml || decodeMultilevel(String(l.attrs?.listStyle))?.[1]?.t === '%1-%2')).toBe(true)
    expect(lists.some((l) => l.attrs?.listStyle === 'sym:☆')).toBe(true)
    expect(lists.some((l) => l.attrs?.listStyle === 'legal')).toBe(true)
  })

  it('applies a definition to the whole list', () => {
    const editor = makeEditor({ type: 'doc', content: [{ type: 'orderedList', content: [{ type: 'listItem', content: [p('A'), { type: 'bulletList', content: [{ type: 'listItem', content: [p('B')] }] }] }] }] })
    editor.commands.setTextSelection(10)
    const style = encodeMultilevel(defaultLevels())
    expect(editor.commands.setMultilevelList(style)).toBe(true)
    const json = editor.getJSON()
    expect(json.content![0].attrs?.listStyle).toBe(style)
    expect(all(json, (n) => n.type === 'bulletList')).toHaveLength(0)
    editor.destroy()
  })
})

describe('Sort Text', () => {
  it('compares text, numbers and dates', () => {
    expect(compareValues('10', '9', 'number', false)).toBeGreaterThan(0)
    expect(compareValues('item 2', 'item 10', 'text', false)).toBeLessThan(0)
    expect(compareValues('1.2.2024', '3.1.2024', 'date', false)).toBeGreaterThan(0)
    expect(compareValues('2024-01-05', '2023-12-31', 'date', false)).toBeGreaterThan(0)
    expect(compareValues('n/a', '5', 'number', false)).toBeLessThan(0)
    expect(fieldOf('a\tb\tc', 2, '\t')).toBe('b')
  })

  it('sorts by several keys, stable', () => {
    const rows = [['Smith', '30'], ['Adams', '30'], ['Brown', '25']]
    const sorted = sortRows(rows, (r, f) => r[f - 1] ?? '', { keys: [{ field: 2, type: 'number', descending: true }, { field: 1, type: 'text', descending: false }], caseSensitive: false })
    expect(sorted.map((r) => r[0])).toEqual(['Adams', 'Smith', 'Brown'])
  })

  it('sorts paragraphs and table rows in the editor', () => {
    const editor = makeEditor({ type: 'doc', content: [p('pear\t3'), p('apple\t10'), p('fig\t2')] })
    sortSelection(editor, { keys: [{ field: 2, type: 'number', descending: false }], separator: '\t', headerRow: false, caseSensitive: false })
    expect(editor.getText({ blockSeparator: '|' })).toBe('fig\t2|pear\t3|apple\t10')
    const cell = (t: string) => ({ type: 'tableCell', content: [p(t)] })
    editor.commands.setContent({ type: 'doc', content: [{ type: 'table', content: [['Name', 'Age'], ['Zoe', '5'], ['Al', '7']].map((r) => ({ type: 'tableRow', content: r.map(cell) })) }] })
    editor.commands.setTextSelection(5)
    sortSelection(editor, { keys: [{ field: 1, type: 'text', descending: false }], separator: '\t', headerRow: true, caseSensitive: false })
    expect(all(editor.getJSON(), (n) => n.type === 'tableRow').map((r) => r.content![0].content![0].content![0].text)).toEqual(['Name', 'Al', 'Zoe'])
    editor.destroy()
  })
})

describe('similar formatting and search by format', () => {
  const doc: JSONContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one ', marks: [{ type: 'bold' }] }, { type: 'text', text: 'two ' }, { type: 'text', text: 'three', marks: [{ type: 'bold' }] }] }] }

  it('selects every stretch with the same formatting', () => {
    const editor = makeEditor(doc)
    const bold = editor.schema.marks.bold.create()
    expect(similarRanges(editor.state.doc, [bold])).toEqual([{ from: 1, to: 5 }, { from: 9, to: 14 }])
    editor.commands.setTextSelection(2)
    editor.commands.selectSimilarFormatting()
    expect(editor.state.selection).toBeInstanceOf(MultiRangeSelection)
    editor.commands.toggleItalic()
    const italic = all(editor.getJSON(), (n) => n.type === 'text' && !!n.marks?.some((m) => m.type === 'italic')).map((n) => n.text)
    expect(italic).toEqual(['one ', 'three'])
    editor.destroy()
  })

  it('finds text with or without the requested formatting', () => {
    const editor = makeEditor(doc)
    expect(findMatches(editor.state.doc, '', { format: { bold: true } })).toHaveLength(2)
    expect(findMatches(editor.state.doc, 'o', { format: { bold: false } })).toEqual([{ from: 7, to: 8 }])
    expect(findMatches(editor.state.doc, 't', { format: { paragraphStyle: 'h1' } })).toHaveLength(0)
    editor.destroy()
  })
})

describe('Table of Authorities and hidden fields', () => {
  it('groups citations by category with pages and passim', () => {
    const entries = [
      { long: 'Roe v. Wade, 410 U.S. 113 (1973)', short: 'Roe', category: 1, pos: 1 },
      { long: '', short: 'Roe', category: 1, pos: 2 },
      { long: 'Clean Air Act', short: 'CAA', category: 2, pos: 3 },
    ]
    const pages: Record<number, string> = { 1: '1', 2: '4', 3: '2' }
    const lines = authorityLines(entries, (pos) => pages[pos], { category: 0, passim: true })
    expect(lines).toEqual([
      { category: 1, entries: [{ text: 'Roe v. Wade, 410 U.S. 113 (1973)', pages: '1, 4' }] },
      { category: 2, entries: [{ text: 'Clean Air Act', pages: '2' }] },
    ])
    const many = Array.from({ length: 5 }, (_, i) => ({ long: 'X', short: 'X', category: 3, pos: i }))
    expect(authorityLines(many, (pos) => String(pos + 1), { category: 3, passim: true })[0].entries[0].pages).toBe('passim')
  })

  it('reads XE and TA field codes', () => {
    expect(hiddenFieldNode('XE "Apple:Green"')).toEqual({ type: 'indexEntry', attrs: { term: 'Apple', sub: 'Green' } })
    expect(hiddenFieldNode('TA \\l "Roe v. Wade" \\s "Roe" \\c 1')).toEqual({ type: 'authorityEntry', attrs: { long: 'Roe v. Wade', short: 'Roe', category: 1 } })
    expect(hiddenFieldNode('PAGE')).toBeNull()
  })

  it('keeps citation and index entries through .docx', async () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Case' }, { type: 'authorityEntry', attrs: { long: 'Long cite', short: 'Short', category: 2 } }, { type: 'indexEntry', attrs: { term: 'Term', sub: '' } }] }],
    }
    const back = await importDocx(await exportDocx({ ...base, doc }))
    expect(all(back.content, (n) => n.type === 'authorityEntry')[0]?.attrs).toMatchObject({ long: 'Long cite', short: 'Short', category: 2 })
    expect(all(back.content, (n) => n.type === 'indexEntry')[0]?.attrs).toMatchObject({ term: 'Term' })
  })
})

describe('mail merge rules', () => {
  const rule = (attrs: Partial<RuleAttrs>): JSONContent => ({ type: 'mergeRule', attrs: { kind: 'if', field: '', op: 'eq', value: '', then: '', otherwise: '', prompt: '', id: 'r1', ...attrs } })
  it('compares values', () => {
    expect(ruleMatches('10', 'gt', '9')).toBe(true)
    expect(ruleMatches('Berlin', 'eq', 'berlin')).toBe(true)
    expect(ruleMatches('', 'empty', '')).toBe(true)
  })

  it('fills If, record numbers, Fill-in and Next Record', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            rule({ kind: 'if', field: 'City', op: 'eq', value: 'Berlin', then: 'Hallo', otherwise: 'Hello' }),
            { type: 'text', text: ' ' },
            { type: 'mergeField', attrs: { name: 'Name' } },
            { type: 'text', text: ' #' },
            rule({ kind: 'sequence' }),
            { type: 'text', text: ' ' },
            rule({ kind: 'fillIn', id: 'q', value: 'default' }),
          ],
        },
      ],
    }
    const rows = [{ Name: 'Ana', City: 'Berlin' }, { Name: 'Bo', City: 'Rome' }]
    const merged = mergeAll(doc, rows, 'letters', { q: 'answer' })
    const texts = merged.content!.filter((n) => n.type === 'paragraph').map((n) => n.content!.map((c) => c.text).join(''))
    expect(texts).toEqual(['Hallo Ana #1 answer', 'Hello Bo #2 answer'])
    const labels: JSONContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'mergeField', attrs: { name: 'Name' } }, rule({ kind: 'nextRecord' }), { type: 'text', text: '/' }, { type: 'mergeField', attrs: { name: 'Name' } }] }] }
    const sheet = mergeAll(labels, [{ Name: 'A' }, { Name: 'B' }, { Name: 'C' }], 'letters')
    expect(sheet.content!.filter((n) => n.type === 'paragraph').map((n) => n.content!.map((c) => c.text).join(''))).toEqual(['A/B', 'C/C'])
  })
})

describe('print settings', () => {
  it('parses page ranges', () => {
    expect(parsePageRange('1-3, 5, 8-', 9)).toEqual([1, 2, 3, 5, 8, 9])
    expect(parsePageRange('x', 9)).toBeNull()
    expect(parsePageRange('3-1', 9)).toBeNull()
  })
  it('orders copies collated or not and odd/even pages', () => {
    expect(printOrder(3, { copies: 2 })).toEqual([0, 1, 2, 0, 1, 2])
    expect(printOrder(3, { copies: 2, collate: false })).toEqual([0, 0, 1, 1, 2, 2])
    expect(printOrder(5, { only: 'even' })).toEqual([1, 3])
    expect(printOrder(5, { range: '2-4', only: 'odd' })).toEqual([2])
  })
})

describe('pictures', () => {
  it('measures data URLs and target sizes', () => {
    expect(dataUrlBytes('data:image/png;base64,AAAA')).toBe(3)
    expect(targetPixels(96, 220)).toBe(220)
  })
  it('removes a background connected to the edges', () => {
    // 4×3 white picture with a red pixel in the middle row.
    const w = 4
    const h = 3
    const data = new Uint8ClampedArray(w * h * 4).fill(255)
    const red = (1 * w + 1) * 4
    data[red + 1] = 0
    data[red + 2] = 0
    expect(removeBackgroundPixels(data, w, h, 10)).toBe(11)
    expect(data[red + 3]).toBe(255)
    expect(data[3]).toBe(0)
  })
})

describe('small helpers', () => {
  it('splits syllables', () => {
    expect(syllablePoints('window')).toEqual([3])
    expect(withSyllables('The window opens')).toBe('The win·dow o·pens')
  })
  it('records macro steps', () => {
    let steps = appendStep([], { kind: 'text', text: 'a' })
    steps = appendStep(steps, { kind: 'text', text: 'b' })
    steps = appendStep(steps, { kind: 'key', key: 'b', ctrl: true })
    expect(steps).toEqual([{ kind: 'text', text: 'ab' }, { kind: 'key', key: 'b', ctrl: true }])
    expect(describeStep({ kind: 'command', tab: 'Home', label: 'Bullets', item: 'Define New Bullet…' })).toBe('Home › Bullets › Define New Bullet…')
    expect(validMacroName('Macro_1')).toBe(true)
    expect(validMacroName('1abc')).toBe(false)
  })
  it('finds and removes the cover page', () => {
    const editor = makeEditor({ type: 'doc', content: [...coverPage('simple', 'X'), p('Body')] })
    const range = coverPageRange(editor.state.doc)
    expect(range).not.toBeNull()
    editor.commands.deleteRange(range!)
    expect(editor.getText().trim()).toBe('Body')
    expect(coverPageRange(editor.state.doc)).toBeNull()
    editor.destroy()
  })
  it('reads style files', () => {
    expect(parseStyleFile('{"kontorStyles":{"u1":{"name":"Mine","kind":"paragraph","format":{"bold":true}}}}')).toEqual({ u1: { id: 'u1', name: 'Mine', kind: 'paragraph', format: { bold: true } } })
    expect(parseStyleFile('nope')).toBeNull()
  })
})

describe('table editing', () => {
  const cell = (t: string) => ({ type: 'tableCell', content: [p(t)] })
  const grid = (rows: string[][]): JSONContent => ({ type: 'doc', content: [{ type: 'table', content: rows.map((r) => ({ type: 'tableRow', content: r.map(cell) })) }] })
  const texts = (editor: Editor) => all(editor.getJSON(), (n) => n.type === 'tableRow').map((r) => r.content!.map((c) => c.content![0].content?.[0]?.text ?? ''))

  it('deletes cells and shifts the cells below up', () => {
    const editor = makeEditor(grid([['a', 'b'], ['c', 'd'], ['e', 'f']]))
    // Cursor in "b".
    let pos = 0
    editor.state.doc.descendants((n, at) => {
      if (n.isText && n.text === 'b') pos = at
    })
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)))
    expect(editor.commands.deleteCellsShiftUp()).toBe(true)
    expect(texts(editor)).toEqual([['a', 'd'], ['c', 'f'], ['e', '']])
    editor.destroy()
  })

  it('sets the width of the column', () => {
    const editor = makeEditor(grid([['a', 'b'], ['c', 'd']]))
    editor.commands.setTextSelection(4)
    editor.commands.setColumnWidth(150)
    const widths = all(editor.getJSON(), (n) => n.type === 'tableCell').map((c) => c.attrs?.colwidth)
    expect(widths).toEqual([[150], null, [150], null])
    editor.destroy()
  })
})

describe('text effects in .docx', () => {
  it('writes glow, reflection and gradient fill and reads them back', async () => {
    const doc: JSONContent = { type: 'doc', content: [p('Shine', [{ type: 'textStyle', attrs: { glow: '#FFC000', reflection: true, gradient: '#4472C4,#ED7D31' } }])] }
    const blob = await exportDocx({ ...base, doc })
    const xml = await docXml(blob)
    expect(xml).toContain('<w14:glow')
    expect(xml).toContain('<w14:reflection')
    expect(xml).toContain('<w14:gradFill>')
    expect(xml).not.toContain('kontor-fx')
    const back = await importDocx(blob)
    const ts = all(back.content, (n) => n.text === 'Shine')[0].marks!.find((m) => m.type === 'textStyle')!.attrs
    expect(ts).toMatchObject({ glow: '#FFC000', reflection: true, gradient: '#4472C4,#ED7D31' })
  })
})
