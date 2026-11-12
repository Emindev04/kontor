import { describe, expect, it } from 'vitest'
import { equationDoc, equationText, parseEquation } from './equation'

describe('Equation', () => {
  it('turns the linear format into symbols, italics and scripts', () => {
    expect(parseEquation('a^2+b^2=c^2')).toEqual([
      { text: 'a', italic: true, pos: 0 },
      { text: '2', italic: false, pos: 1 },
      { text: ' + ', italic: false, pos: 0 },
      { text: 'b', italic: true, pos: 0 },
      { text: '2', italic: false, pos: 1 },
      { text: ' = ', italic: false, pos: 0 },
      { text: 'c', italic: true, pos: 0 },
      { text: '2', italic: false, pos: 1 },
    ])
    expect(equationText('x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}')).toBe('x = (−b±√(b^(2)−4ac))/(2a)')
    expect(equationText('\\sum_{k=0}^n x_k')).toBe('∑_(k=0)^(n)x_(k)')
  })

  it('builds a centered paragraph with superscript marks', () => {
    const doc = equationDoc('E=mc^2')
    const p = doc.content[0]
    expect(p.attrs?.align).toBe('center')
    expect(p.content?.at(-1)?.marks?.some((m) => m.type === 'superscript')).toBe(true)
  })
})
