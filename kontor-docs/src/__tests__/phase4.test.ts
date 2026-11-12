// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import type { JSONContent } from '@tiptap/core'
import { exportDocx } from '../io/docxExport'
import { importDocx } from '../io/docxImport'
import { DEFAULT_DESIGN, DEFAULT_SETUP, EMPTY_HEADER_FOOTER } from '../pageSetup'

const base = { setup: DEFAULT_SETUP, design: DEFAULT_DESIGN, headerFooter: EMPTY_HEADER_FOOTER, title: 'Test' }

async function documentXml(blob: Blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer())
  return zip.file('word/document.xml')!.async('string')
}

function find(doc: JSONContent, pred: (n: JSONContent) => boolean, out: JSONContent[] = []) {
  if (pred(doc)) out.push(doc)
  for (const c of doc.content ?? []) find(c, pred, out)
  return out
}

describe('grouped objects', () => {
  const group = { wrap: 'front', groupId: 'g1', offsetX: 40, offsetY: 10 }
  const doc: JSONContent = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Before ' },
          { type: 'shape', attrs: { ...group, kind: 'rectangle', width: 120, height: 60, fill: '#2F6FC4', stroke: '#1F4E8C', text: 'A', groupX: 0, groupY: 0 } },
          { type: 'shape', attrs: { ...group, kind: 'ellipse', width: 80, height: 80, fill: '#E3742F', stroke: null, text: '', offsetX: 200, offsetY: 30, groupX: 160, groupY: 20 } },
        ],
      },
    ],
  }

  it('writes them as one drawing group', async () => {
    const xml = await documentXml(await exportDocx({ ...base, doc }))
    expect(xml.match(/<wpg:wgp>/g)?.length).toBe(1)
    expect(xml.match(/<wps:wsp>/g)?.length).toBe(2)
  })

  it('reads the group back with the same layout', async () => {
    const result = await importDocx(await exportDocx({ ...base, doc }))
    const shapes = find(result.content, (n) => n.type === 'shape')
    expect(shapes).toHaveLength(2)
    expect(shapes[0].attrs?.groupId).toBeTruthy()
    expect(shapes[0].attrs?.groupId).toBe(shapes[1].attrs?.groupId)
    const [a, b] = shapes.map((s) => s.attrs!)
    expect(Math.abs(Number(b.groupX) - Number(a.groupX) - 160)).toBeLessThanOrEqual(1)
    expect(Math.abs(Number(b.groupY) - Number(a.groupY) - 20)).toBeLessThanOrEqual(1)
    expect(Math.abs(Number(a.offsetX) - 40)).toBeLessThanOrEqual(1)
    expect(b.kind).toBe('ellipse')
  })
})

describe('diagrams', () => {
  const data = { layout: 'hierarchy', colors: 'colorful', style: 'flat', items: [{ text: 'CEO', level: 0 }, { text: 'CTO', level: 1 }, { text: 'CFO', level: 1 }, { text: 'Dev', level: 2 }] }
  const doc: JSONContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'diagram', attrs: { width: 480, height: 300, data } }] }] }

  it('writes a diagram as a shape group and a custom XML part with its outline', async () => {
    const blob = await exportDocx({ ...base, doc })
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('<wpg:wgp>')
    expect((xml.match(/<wps:wsp>/g) ?? []).length).toBeGreaterThanOrEqual(4)
    const types = await zip.file('[Content_Types].xml')!.async('string')
    expect(types).toContain('/customXml/itemProps1.xml')
    expect(types).toContain('/customXml/item1.xml')
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
    expect(rels).toContain('../customXml/item1.xml')
    expect(await zip.file('customXml/item1.xml')!.async('string')).toContain('CFO')
  })

  it('opens it as the same diagram again', async () => {
    const result = await importDocx(await exportDocx({ ...base, doc }))
    const [d] = find(result.content, (n) => n.type === 'diagram')
    expect(d?.attrs?.data).toEqual(data)
  })

  it('edits the outline like the text pane and ribbon', async () => {
    const { editItems, textToItems, itemsToText } = await import('../editor/Diagram')
    const items = textToItems('A\n\tB\n\tC\nD')
    expect(items.map((i) => i.level)).toEqual([0, 1, 1, 0])
    expect(itemsToText(items)).toBe('A\n\tB\n\tC\nD')
    expect(editItems(items, 0, 'after').items.map((i) => i.text)).toEqual(['A', 'B', 'C', '', 'D'])
    expect(editItems(items, 2, 'promote').items.map((i) => i.level)).toEqual([0, 1, 0, 0])
    expect(editItems(items, 3, 'up').items.map((i) => i.text)).toEqual(['D', 'A', 'B', 'C'])
    expect(editItems(items, 0, 'above').items.map((i) => i.level)).toEqual([0, 1, 2, 2, 0])
  })
})

describe('combine documents', () => {
  it("credits the copy's edits to its author and keeps its own tracked changes", async () => {
    const { compareDocuments } = await import('../editor/compare')
    const p = (content: JSONContent[]) => ({ type: 'paragraph', content })
    const mine: JSONContent = { type: 'doc', content: [p([{ type: 'text', text: 'The quick fox.' }])] }
    const theirs: JSONContent = {
      type: 'doc',
      content: [p([{ type: 'text', text: 'The quick ' }, { type: 'text', text: 'brown ', marks: [{ type: 'insertion', attrs: { author: 'Ann', date: '' } }] }, { type: 'text', text: 'fox jumps.' }])],
    }
    const { doc } = compareDocuments(mine, theirs, 'Ben')
    const runs = doc.content![0].content!
    const authors = runs.flatMap((r) => r.marks?.filter((m) => m.type === 'insertion').map((m) => `${r.text?.trim()}:${m.attrs?.author}`) ?? [])
    expect(authors).toContain('jumps:Ben')
    expect(authors.some((a) => a.startsWith('brown') && a.endsWith(':Ann') || a.endsWith(':Ben'))).toBe(true)
  })
})

describe('tracked formatting changes', () => {
  it('records, describes, rejects and saves a formatting change', async () => {
    const { Editor } = await import('@tiptap/core')
    const { createExtensions } = await import('../editor/extensions')
    const { collectChanges, describeFormat } = await import('../editor/Review')
    const editor = new Editor({ extensions: createExtensions({ getAuthor: () => 'Ann' }), content: '<p>Hello world</p>' })
    editor.commands.setTrackChanges(true)
    editor.commands.setTextSelection({ from: 1, to: 6 })
    editor.commands.toggleBold()
    let changes = collectChanges(editor.state.doc)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ kind: 'format', author: 'Ann', text: 'Hello' })
    expect(describeFormat(changes[0].old, editor.state.doc.nodeAt(1)!.marks)).toBe('Formatted: Bold')
    // Saved as w:rPrChange and read back as the same change.
    const blob = await exportDocx({ ...base, doc: editor.getJSON() })
    expect(await documentXml(blob)).toContain('<w:rPrChange')
    const back = await importDocx(blob)
    const runs = find(back.content, (n) => n.type === 'text' && !!n.marks?.some((m) => m.type === 'formatChange'))
    expect(runs[0]?.text).toBe('Hello')
    // Rejecting restores the old formatting.
    editor.commands.rejectChange(changes[0])
    expect(editor.state.doc.nodeAt(1)!.marks.some((m) => m.type.name === 'bold')).toBe(false)
    changes = collectChanges(editor.state.doc)
    expect(changes).toHaveLength(0)
    editor.destroy()
  })
})

describe('repeat and history labels', () => {
  it('repeats the last formatting and names undo entries', async () => {
    const { Editor } = await import('@tiptap/core')
    const { createExtensions } = await import('../editor/extensions')
    const { historyLabels } = await import('../editor/HistoryLabels')
    const editor = new Editor({ extensions: createExtensions(), content: '<p>one two</p>' })
    editor.commands.setTextSelection({ from: 1, to: 4 })
    editor.commands.toggleBold()
    editor.commands.setTextSelection({ from: 5, to: 8 })
    expect(editor.commands.repeatLast()).toBe(true)
    expect(editor.state.doc.nodeAt(5)!.marks.some((m) => m.type.name === 'bold')).toBe(true)
    expect(historyLabels(editor.state).undo.at(-1)).toBe('Bold')
    editor.commands.undo()
    expect(historyLabels(editor.state).redo.at(-1)).toBe('Bold')
    editor.destroy()
  })
})

describe('command KeyTips', () => {
  it('gives every command a unique key that is not the start of another', async () => {
    const { assignKeyTips } = await import('../components/Ribbon')
    const make = (label: string) => Object.assign(document.createElement('button'), { ariaLabel: label }) as HTMLElement
    const buttons = ['Bold', 'Italic', 'Underline', 'Bullets', 'Borders', 'Bold Again', 'Center', 'Copy', 'Cut'].map((l) => {
      const b = make(l)
      b.setAttribute('aria-label', l)
      return b
    })
    const codes = assignKeyTips(buttons).map((t) => t.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const a of codes) for (const b of codes) if (a !== b) expect(b.startsWith(a)).toBe(false)
  })
})

describe('command KeyTips with many commands', () => {
  it('finishes for a crowded tab', async () => {
    const { assignKeyTips } = await import('../components/Ribbon')
    const buttons = Array.from({ length: 80 }, (_, i) => {
      const b = document.createElement('button')
      b.setAttribute('aria-label', i % 2 ? 'Insert' : `Item ${i}`)
      return b
    })
    const codes = assignKeyTips(buttons).map((t) => t.code)
    expect(new Set(codes).size).toBe(80)
  })
})

describe('mail merge', () => {
  it('honours excluded recipients, matched fields, directories and missing fields', async () => {
    const mm = await import('../editor/MailMerge')
    mm.loadRecipients('FirstName,Surname,Email\nAnn,Lee,ann@x.org\nBen,Ray,ben@x.org\n', 'test.csv')
    mm.mergeStore.set({ excluded: [1] })
    expect(mm.includedRows().map((r) => r.FirstName)).toEqual(['Ann'])
    expect(mm.matchedColumn('First Name')).toBe('FirstName')
    expect(mm.matchedColumn('Last Name')).toBe('Surname')
    const doc: JSONContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'mergeField', attrs: { name: 'FirstName' } }, { type: 'mergeField', attrs: { name: 'City' } }] }] }
    expect(mm.missingFields(doc)).toEqual(['City'])
    const dir = mm.mergeAll(doc, mm.mergeStore.get().rows, 'directory')
    expect(dir.content!.some((n) => n.type === 'pageBreak')).toBe(false)
    expect(mm.mergeAll(doc, mm.mergeStore.get().rows, 'letters').content!.filter((n) => n.type === 'pageBreak')).toHaveLength(1)
    expect(mm.toCsv(['A', 'B'], [{ A: 'x,y', B: 'q"z' }])).toBe('A,B\r\n"x,y","q""z"')
  })
})

describe('wildcard search', () => {
  it('finds with wildcards and special characters and expands replacements', async () => {
    const { getSchema } = await import('@tiptap/core')
    const { staticExtensions } = await import('../editor/extensions')
    const { findMatches, expandReplacement } = await import('../editor/Search')
    const schema = getSchema(staticExtensions)
    const doc = schema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cat cot cart 2024 Smith, John\tend' }] }] })
    const text = (r: { from: number; to: number }) => doc.textBetween(r.from, r.to)
    expect(findMatches(doc, 'c?t', { wildcards: true }).map(text)).toEqual(['cat', 'cot'])
    expect(findMatches(doc, '<c*t>', { wildcards: true }).map(text)).toEqual(['cat', 'cot', 'cart'])
    expect(findMatches(doc, '[0-9]{4}', { wildcards: true }).map(text)).toEqual(['2024'])
    expect(findMatches(doc, '^#^#', {}).map(text)).toEqual(['20', '24'])
    expect(findMatches(doc, '^t', {}).length).toBe(1)
    expect(expandReplacement('\\2 \\1', 'Smith, John', '(<*), (<*>)', { wildcards: true })).toBe('John Smith')
    expect(expandReplacement('[^&]', 'cat', 'cat', {})).toBe('[cat]')
  })
})

describe('online video and hyphenation', () => {
  it('embeds YouTube and Vimeo addresses and writes a link to .docx', async () => {
    const { embedUrl } = await import('../editor/OnlineVideo')
    expect(embedUrl('https://www.youtube.com/watch?v=abc123')).toBe('https://www.youtube-nocookie.com/embed/abc123')
    expect(embedUrl('https://youtu.be/xyz')).toBe('https://www.youtube-nocookie.com/embed/xyz')
    expect(embedUrl('https://vimeo.com/76979871')).toBe('https://player.vimeo.com/video/76979871')
    expect(embedUrl('https://example.com/video')).toBeNull()
    const doc: JSONContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'onlineVideo', attrs: { src: 'https://player.vimeo.com/video/1', url: 'https://vimeo.com/1' } }] }] }
    expect(await documentXml(await exportDocx({ ...base, doc }))).toContain('Online video: https://vimeo.com/1')
  })

  it('finds hyphenation points in long words only', async () => {
    const { hyphenPoints } = await import('../editor/hyphenate')
    expect(hyphenPoints('cat')).toEqual([])
    const word = 'documentation'
    const points = hyphenPoints(word)
    expect(points.length).toBeGreaterThan(0)
    expect(points.every((p) => p >= 2 && p <= word.length - 2)).toBe(true)
  })
})
