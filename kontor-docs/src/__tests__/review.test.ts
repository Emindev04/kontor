// @vitest-environment jsdom
// Checks added during review: Draw Table / Eraser on real tables.
import { describe, expect, it } from 'vitest'
import { Editor, type JSONContent } from '@tiptap/core'
import { TableMap } from '@tiptap/pm/tables'
import { createExtensions } from '../editor/extensions'
import { eraseEdge, splitDrawnCell } from '../editor/drawTable'

type Loc = Parameters<typeof splitDrawnCell>[1]
const cell = (t: string) => ({ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
const grid = (rows: string[][]): JSONContent => ({ type: 'doc', content: [{ type: 'table', content: rows.map((r) => ({ type: 'tableRow', content: r.map(cell) })) }] })

function locate(editor: Editor, text: string): Loc {
  const table = editor.state.doc.child(0)
  const map = TableMap.get(table)
  let cellPos = -1
  editor.state.doc.descendants((n, pos) => {
    if (n.type.name === 'tableCell' && n.textContent === text) cellPos = pos
  })
  return { table, tablePos: 0, map, cellPos, rect: map.findCell(cellPos - 1) }
}
const shape = (editor: Editor) =>
  (editor.getJSON() as JSONContent).content![0].content!.map((r: JSONContent) =>
    r.content!.map((c: JSONContent) => `${(c.content ?? []).map((p: JSONContent) => p.content?.[0]?.text ?? '').join('')}:${c.attrs?.colspan ?? 1}x${c.attrs?.rowspan ?? 1}`),
  )

describe('Draw Table and Eraser', () => {
  it('splits only the drawn cell into two rows', () => {
    const editor = new Editor({ extensions: createExtensions(), content: grid([['a', 'b'], ['c', 'd']]) })
    splitDrawnCell(editor.view, locate(editor, 'a'), 'rows')
    const map = TableMap.get(editor.state.doc.child(0))
    expect(map.height).toBe(3)
    expect(shape(editor)[0]).toEqual(['a:1x1', 'b:1x2'])
    expect(shape(editor)[1]).toEqual([':1x1'])
    editor.destroy()
  })

  it('splits only the drawn cell into two columns', () => {
    const editor = new Editor({ extensions: createExtensions(), content: grid([['a', 'b'], ['c', 'd']]) })
    splitDrawnCell(editor.view, locate(editor, 'd'), 'columns')
    expect(TableMap.get(editor.state.doc.child(0)).width).toBe(3)
    expect(shape(editor)).toEqual([['a:1x1', 'b:2x1'], ['c:1x1', 'd:1x1', ':1x1']])
    editor.destroy()
  })

  it('erases the line between two cells', () => {
    const editor = new Editor({ extensions: createExtensions(), content: grid([['a', 'b'], ['c', 'd']]) })
    expect(eraseEdge(editor.view, locate(editor, 'a'), 'right')).toBe(true)
    expect(shape(editor)[0]).toEqual(['ab:2x1'])
    expect(eraseEdge(editor.view, locate(editor, 'c'), 'left')).toBe(false)
    editor.destroy()
  })
})
