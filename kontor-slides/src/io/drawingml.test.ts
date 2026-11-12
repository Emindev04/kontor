import { describe, expect, it } from 'vitest'
import { fillXml, lineXml, txBodyXml, type TextExportCtx } from './drawingml'
import { transitionXml } from './pptxExport'
import { textBody } from '../model/factory'
import { THEMES } from '../model/themes'

const colors = THEMES[0].variants[0].colors

const ctx: TextExportCtx = {
  sizes: [28, 24],
  font: 'Calibri',
  color: '#000000',
  align: 'left',
  bullets: true,
  bulletChar: '•',
  lineHeight: 0.9,
  spaceBefore: [10, 5],
  colors,
  slideNumber: 2,
  dateText: '1/1/2026',
  majorFont: 'Calibri Light',
  minorFont: 'Calibri',
  defaultFont: 'minor',
  linkRel: () => 'rId9',
}

describe('DrawingML export', () => {
  it('writes gradients with angles in 60000ths of a degree', () => {
    const xml = fillXml({ type: 'gradient', kind: 'linear', angle: 90, stops: [{ pos: 0, color: '#FFFFFF' }, { pos: 1, color: 'theme:accent1' }] }, colors)
    expect(xml).toContain('<a:lin ang="5400000"')
    expect(xml).toContain(`val="${colors.accent1.slice(1)}"`)
  })

  it('writes arrowheads on lines', () => {
    expect(lineXml({ color: '#000000', width: 2, dash: 'dash', tail: 'triangle' }, colors)).toMatch(/w="25400".*prstDash val="dash".*tailEnd type="triangle"/)
  })

  it('writes bullets, levels, sizes and fields', () => {
    const body = textBody({
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'One & two', marks: [{ type: 'link', attrs: { href: 'https://x.test' } }] }] },
          { type: 'paragraph', attrs: { level: 1, bullet: 'num:arabicPeriod' }, content: [{ type: 'field', attrs: { kind: 'slidenum' } }] },
        ],
      },
    })
    const xml = txBodyXml(body, ctx)
    expect(xml).toContain('<a:buChar char="•"/>')
    expect(xml).toContain('<a:buAutoNum type="arabicPeriod"/>')
    expect(xml).toContain('lvl="1"')
    expect(xml).toContain('sz="2800"')
    expect(xml).toContain('sz="2400"')
    expect(xml).toContain('One &amp; two')
    expect(xml).toContain('<a:hlinkClick r:id="rId9"/>')
    expect(xml).toContain('type="slidenum"')
    expect(xml).toContain('typeface="+mn-lt"')
  })

  it('maps transitions to OOXML elements', () => {
    expect(transitionXml({ name: 'push', option: 'fromRight', duration: 0.5, advanceOnClick: true, advanceAfter: null })).toBe('<p:transition spd="fast"><p:push dir="l"/></p:transition>')
    expect(transitionXml({ name: 'none', duration: 1, advanceOnClick: false, advanceAfter: 3 })).toBe('<p:transition spd="slow" advClick="0" advTm="3000"></p:transition>')
    expect(transitionXml(null)).toBe('')
  })
})
