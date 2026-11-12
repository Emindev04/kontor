// Slides from Outline: plain text where every line without indentation starts a new slide (its
// title) and indented lines (tabs, or two spaces per level) become bullet points at that level.
import type { Slide, SlideSize, ShapeElement, Para } from './types'
import { createSlide } from './factory'

export function parseOutline(text: string): { title: string; points: { text: string; level: number }[] }[] {
  const slides: { title: string; points: { text: string; level: number }[] }[] = []
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!raw.trim()) continue
    const indent = /^[\t ]*/.exec(raw)![0]
    const level = [...indent].reduce((n, ch) => n + (ch === '\t' ? 2 : 1), 0) >> 1
    const content = raw.trim().replace(/^[-*•]\s+/, '')
    if (level === 0 || !slides.length) slides.push({ title: content, points: [] })
    else slides[slides.length - 1].points.push({ text: content, level: Math.min(8, level - 1) })
  }
  return slides
}

/** New slides (Title and Content, or Title Only without points) for an outline. */
export function slidesFromOutline(text: string, size: SlideSize): Slide[] {
  return parseOutline(text).map((o) => {
    const slide = createSlide(o.points.length ? 'titleContent' : 'titleOnly', size)
    slide.elements = slide.elements.map((e) => {
      if (e.type !== 'shape' || !e.placeholder || !e.text) return e
      const isTitle = e.placeholder.style === 'title'
      const content: Para[] = isTitle ? [{ type: 'paragraph', content: [{ type: 'text', text: o.title }] }] : o.points.map((p) => ({ type: 'paragraph', attrs: { level: p.level }, content: [{ type: 'text', text: p.text }] }))
      return { ...e, text: { ...e.text, doc: { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] } } } as ShapeElement
    })
    return slide
  })
}
