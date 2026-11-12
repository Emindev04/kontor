import { describe, expect, it } from 'vitest'
import { parseOutline, slidesFromOutline } from './slidesFromOutline'
import { SIZE_16_9 } from './factory'
import type { ShapeElement } from './types'

describe('Slides from Outline', () => {
  it('reads titles and indented points', () => {
    const o = parseOutline('Intro\n\tFirst\n\t\tDetail\n  Second\nEnd\n')
    expect(o).toEqual([
      { title: 'Intro', points: [{ text: 'First', level: 0 }, { text: 'Detail', level: 1 }, { text: 'Second', level: 0 }] },
      { title: 'End', points: [] },
    ])
  })

  it('creates slides with the text in the placeholders', () => {
    const slides = slidesFromOutline('A\n\tb\nC', SIZE_16_9)
    expect(slides.map((s) => s.layout)).toEqual(['titleContent', 'titleOnly'])
    const body = slides[0].elements.find((e) => e.type === 'shape' && e.placeholder?.style === 'body') as ShapeElement
    expect(body.text!.doc.content[0].content?.[0]).toMatchObject({ text: 'b' })
  })
})
