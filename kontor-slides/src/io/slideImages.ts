// Slides as pictures (PNG/JPEG) and as a picture-based PDF, rendered with the same SlideView as the editor.
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { Presentation, Slide, SlideElement } from '../model/types'
import { bounds } from '../model/geometry'
import { SlideView, presProps } from '../render/SlideView'
import { t } from '../i18n'

export type ImageFormat = 'png' | 'jpeg'

const frame = () => new Promise<void>((resolve) => setTimeout(resolve, 30))

/** A word on a rendered slide, in slide pixels (top-left origin), for the PDF text layer. */
export type TextRun = { text: string; x: number; y: number; w: number; h: number; size: number }

/** Positions of every word drawn on a rendered slide. */
function collectText(node: HTMLElement): TextRun[] {
  const base = node.getBoundingClientRect()
  const sx = node.offsetWidth ? base.width / node.offsetWidth : 1
  const runs: TextRun[] = []
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
    const parent = t.parentElement
    if (!parent || !t.data.trim()) continue
    const cs = getComputedStyle(parent)
    if (cs.visibility === 'hidden' || cs.display === 'none') continue
    const size = parseFloat(cs.fontSize) || 12
    const re = /\S+/g
    let m: RegExpExecArray | null
    while ((m = re.exec(t.data))) {
      range.setStart(t, m.index)
      range.setEnd(t, m.index + m[0].length)
      const r = range.getClientRects()[0]
      if (!r || r.width < 0.5) continue
      runs.push({ text: m[0], x: (r.left - base.left) / sx, y: (r.top - base.top) / sx, w: r.width / sx, h: r.height / sx, size: size / sx })
    }
  }
  return runs
}

/** Renders one slide to a picture `width` pixels wide (optionally with the positions of its words). */
async function renderSlide(pres: Presentation, index: number, format: ImageFormat, width: number, withText: boolean): Promise<{ blob: Blob; text: TextRun[] }> {
  const { toCanvas } = await import('html-to-image')
  const slide = pres.slides[index]
  const host = document.createElement('div')
  host.className = 'export-host'
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${pres.size.w}px;height:${pres.size.h}px;pointer-events:none;`
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    flushSync(() => root.render(createElement(SlideView, { slide, index, ...presProps(pres), mode: 'show' })))
    await document.fonts.ready
    await Promise.all(Array.from(host.querySelectorAll('img')).map((img) => img.decode().catch(() => undefined)))
    await frame()
    const node = host.firstElementChild as HTMLElement
    const text = withText ? collectText(node) : []
    // Draw to a canvas and encode it ourselves: html-to-image's toBlob always writes PNG.
    const canvas = await toCanvas(node, { pixelRatio: width / pres.size.w, width: pres.size.w, height: pres.size.h, backgroundColor: '#FFFFFF' })
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, format === 'png' ? 'image/png' : 'image/jpeg', 0.92))
    if (!blob) throw new Error(t('The slide could not be drawn.'))
    return { blob, text }
  } finally {
    root.unmount()
    host.remove()
  }
}

/** Renders one slide to a picture `width` pixels wide. */
export async function slideImage(pres: Presentation, index: number, format: ImageFormat, width = 1920): Promise<Blob> {
  return (await renderSlide(pres, index, format, width, false)).blob
}

/** Every slide as a picture, packed into one .zip file (Slide1.png, Slide2.png …). */
export async function slideImagesZip(pres: Presentation, format: ImageFormat, width = 1920): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (let i = 0; i < pres.slides.length; i++) zip.file(`Slide${i + 1}.${format === 'png' ? 'png' : 'jpg'}`, await slideImage(pres, i, format, width))
  return zip.generateAsync({ type: 'blob' })
}

function jpegSize(bytes: Uint8Array): { w: number; h: number } {
  let i = 2
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) break
    const marker = bytes[i + 1]
    const len = (bytes[i + 2] << 8) | bytes[i + 3]
    if (marker >= 0xc0 && marker <= 0xc3) return { h: (bytes[i + 5] << 8) | bytes[i + 6], w: (bytes[i + 7] << 8) | bytes[i + 8] }
    i += 2 + len
  }
  return { w: 0, h: 0 }
}

/**
 * A PDF with one page per slide (hidden slides are left out). Each page holds the slide as a picture
 * with an invisible text layer on top, so the text can be selected, copied and searched.
 */
export async function slidesPdf(pres: Presentation, width = 2400, title = ''): Promise<Blob> {
  const pages: PdfPage[] = []
  const scale = 0.75
  for (let i = 0; i < pres.slides.length; i++) {
    if (pres.slides[i].hidden) continue
    const { blob, text } = await renderSlide(pres, i, 'jpeg', width, true)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    pages.push({ bytes, ...jpegSize(bytes), text: text.map((r) => ({ ...r, x: r.x * scale, y: r.y * scale, w: r.w * scale, h: r.h * scale, size: r.size * scale })) })
  }
  return buildPdf(pages, pres.size.w * scale, pres.size.h * scale, title)
}

export type PdfPage = { bytes: Uint8Array; w: number; h: number; text?: TextRun[] }

// Characters of the PDF standard encoding (WinAnsi) above 127 that are not Latin-1.
const WIN_ANSI: Record<number, number> = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f }

/** A PDF string literal in WinAnsi encoding (characters outside it become "?"). */
function pdfString(text: string) {
  let out = '('
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    const code = cp < 128 || (cp >= 0xa0 && cp <= 0xff) ? cp : (WIN_ANSI[cp] ?? 63)
    if (code === 40 || code === 41 || code === 92) out += '\\' + String.fromCharCode(code)
    else if (code < 32 || code > 126) out += '\\' + code.toString(8).padStart(3, '0')
    else out += String.fromCharCode(code)
  }
  return out + ')'
}

let measureCtx: CanvasRenderingContext2D | null = null
/** Width of a word in Helvetica (Arial has the same metrics), at 1 pt. */
function helveticaWidth(text: string) {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return text.length * 0.5
  measureCtx.font = '100px Helvetica, Arial, sans-serif'
  return measureCtx.measureText(text).width / 100
}

/** Invisible (render mode 3) words stretched to the size of the visible ones. */
function textLayer(runs: TextRun[], pageH: number) {
  const ops: string[] = []
  for (const r of runs) {
    const size = Math.max(1, r.h * 0.8)
    const natural = helveticaWidth(r.text) * size
    const tz = natural > 0 ? Math.max(1, Math.min(1000, (r.w / natural) * 100)) : 100
    const baseline = pageH - (r.y + r.h * 0.8)
    ops.push(`BT 3 Tr /F1 ${size.toFixed(2)} Tf ${tz.toFixed(1)} Tz 1 0 0 1 ${r.x.toFixed(2)} ${baseline.toFixed(2)} Tm ${pdfString(r.text)} Tj ET`)
  }
  return ops.join('\n')
}

/** Minimal PDF writer: one JPEG per page, scaled to the page (sizes in points), with an optional text layer. */
export function buildPdf(pages: PdfPage[], pageW: number, pageH: number, title = ''): Blob {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (part: string | Uint8Array) => {
    const b = typeof part === 'string' ? enc.encode(part) : part
    chunks.push(b)
    length += b.length
  }
  const obj = (n: number, body: string | (() => void)) => {
    offsets[n] = length
    push(`${n} 0 obj\n`)
    if (typeof body === 'string') push(body)
    else body()
    push('\nendobj\n')
  }
  push('%PDF-1.4\n%âãÏÓ\n')
  // 1 catalog, 2 pages, 3 font, 4 info, then three objects per page.
  const pageIds = pages.map((_, i) => 5 + i * 3)
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obj(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`)
  obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  obj(4, `<< /Producer (Kontor Slides) /Title ${pdfString(title || 'Presentation')} >>`)
  const w = pageW.toFixed(2)
  const h = pageH.toFixed(2)
  pages.forEach((p, i) => {
    const id = pageIds[i]
    const text = p.text?.length ? `\n${textLayer(p.text, pageH)}` : ''
    const content = enc.encode(`q ${w} 0 0 ${h} 0 0 cm /Im${i + 1} Do Q${text}`)
    obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im${i + 1} ${id + 2} 0 R >> /Font << /F1 3 0 R >> >> /Contents ${id + 1} 0 R >>`)
    obj(id + 1, () => {
      push(`<< /Length ${content.length} >>\nstream\n`)
      push(content)
      push('\nendstream')
    })
    obj(id + 2, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`)
      push(p.bytes)
      push('\nendstream')
    })
  })
  const xref = length
  const count = 5 + pages.length * 3
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`
  for (let n = 1; n < count; n++) table += `${String(offsets[n] ?? 0).padStart(10, '0')} 00000 n \n`
  push(table)
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' })
}

/**
 * One object drawn on its own as a PNG data URL (transparent around it), at `scale` × its size.
 * Used where a format has no equivalent object, e.g. charts and diagrams in .odp files.
 */
export async function elementImage(pres: Presentation, el: SlideElement, scale = 2): Promise<string | null> {
  const { toCanvas } = await import('html-to-image')
  const b = bounds(el)
  if (b.w < 1 || b.h < 1) return null
  const slide: Slide = { id: 'raster', layout: 'blank', elements: [{ ...el, x: el.x - b.x, y: el.y - b.y } as SlideElement], notes: '', background: { type: 'none' }, hideBackgroundGraphics: true }
  const host = document.createElement('div')
  host.className = 'export-host'
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${b.w}px;height:${b.h}px;pointer-events:none;`
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    const props = { ...presProps(pres), size: { w: Math.ceil(b.w), h: Math.ceil(b.h), name: 'custom' as const }, headerFooter: { ...pres.headerFooter, date: false, footer: false, slideNumber: false } }
    flushSync(() => root.render(createElement(SlideView, { slide, index: 0, ...props, mode: 'show' })))
    await document.fonts.ready
    await Promise.all(Array.from(host.querySelectorAll('img')).map((img) => img.decode().catch(() => undefined)))
    await frame()
    const node = host.firstElementChild as HTMLElement
    const canvas = await toCanvas(node, { pixelRatio: scale, width: Math.ceil(b.w), height: Math.ceil(b.h) })
    return canvas.toDataURL('image/png')
  } finally {
    root.unmount()
    host.remove()
  }
}
