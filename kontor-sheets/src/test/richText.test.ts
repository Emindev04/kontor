import { describe, expect, it } from 'vitest'
import { normalizeRuns, spliceRuns, styleRuns, stripRunKeys, runsText } from '../commands/richText'
import { Doc } from '../commands/doc'

describe('rich text runs', () => {
  const runs = [{ t: 'Hello ' }, { t: 'big', s: { bold: true } }, { t: ' world' }]
  it('splices text keeping neighbouring styles', () => {
    expect(runsText(spliceRuns(runs, 9, 0, '!'))).toBe('Hello big! world')
    expect(normalizeRuns(spliceRuns(runs, 9, 0, '!'))![1]).toEqual({ t: 'big!', s: { bold: true } })
    expect(normalizeRuns(spliceRuns(runs, 6, 3, 'x'))).toEqual([{ t: 'Hello ' }, { t: 'x', s: { bold: true } }, { t: ' world' }])
    expect(normalizeRuns(spliceRuns(runs, 0, 15, 'gone'))).toBeUndefined()
  })
  it('restyles a character range', () => {
    const r = styleRuns(runs, 0, 5, (s) => ({ ...s, italic: true }))
    expect(normalizeRuns(r)).toEqual([{ t: 'Hello', s: { italic: true } }, { t: ' ' }, { t: 'big', s: { bold: true } }, { t: ' world' }])
  })
  it('drops run settings the whole cell gets', () => {
    expect(stripRunKeys(runs, ['bold'])).toBeUndefined()
  })
  it('stores runs on commit and drops them for numbers', () => {
    const doc = new Doc()
    doc.setInput(0, 0, 'Hello big world', false, runs)
    expect(doc.sheet.get(0, 0)?.rich).toEqual(runs)
    doc.beginEdit('edit')
    expect(doc.edit?.rich).toEqual(runs)
    doc.updateEdit({ text: 'Hello big world!' })
    expect(runsText(doc.edit!.rich!)).toBe('Hello big world!')
    doc.commitEdit()
    expect(doc.sheet.get(0, 0)?.v).toBe('Hello big world!')
    expect(doc.sheet.get(0, 0)?.rich?.[1]).toEqual({ t: 'big', s: { bold: true } })
    doc.applyStyle({ bold: true })
    expect(doc.sheet.get(0, 0)?.rich).toBeUndefined()
    doc.setInput(1, 0, '42', false, [{ t: '4', s: { bold: true } }, { t: '2' }])
    expect(doc.sheet.get(1, 0)?.rich).toBeUndefined()
  })
})
