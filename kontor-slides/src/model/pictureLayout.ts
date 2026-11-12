// Picture Layout: arranges selected pictures into a captioned layout (like a picture diagram) and
// returns it as one group of pictures and caption shapes.
import type { GroupElement, ImageElement, ShapeElement, SlideElement } from './types'
import { docFromText } from './richtext'
import { textBody, uid } from './factory'
import { makeGroup, union, bounds, type Box } from './geometry'
import { tx } from '../i18n'

export type PictureLayoutId = 'captioned' | 'strips' | 'circles' | 'banner' | 'mosaic'

export const PICTURE_LAYOUTS: { id: PictureLayoutId; label: string }[] = [
  { id: 'captioned', label: tx('Captioned Pictures') },
  { id: 'strips', label: tx('Picture Strips') },
  { id: 'circles', label: tx('Circular Pictures') },
  { id: 'banner', label: tx('Pictures with Banners') },
  { id: 'mosaic', label: tx('Picture Mosaic') },
]

/** Crop so the picture fills a w×h frame without distortion. */
export function fillCrop(img: Pick<ImageElement, 'natW' | 'natH'>, w: number, h: number) {
  const ar = (img.natW || 1) / (img.natH || 1)
  const frame = w / h
  if (ar > frame) {
    const cut = (1 - frame / ar) / 2
    return { l: cut, t: 0, r: cut, b: 0 }
  }
  const cut = (1 - ar / frame) / 2
  return { l: 0, t: cut, r: 0, b: cut }
}

function placed(img: ImageElement, b: Box, mask?: string): ImageElement {
  return { ...img, id: uid(), x: b.x, y: b.y, w: b.w, h: b.h, rot: 0, crop: fillCrop(img, b.w, b.h), mask }
}

function caption(text: string, b: Box, opts: { fill?: string; color?: string; align?: 'left' | 'center' } = {}): ShapeElement {
  return {
    id: uid(),
    type: 'shape',
    name: 'Caption',
    prst: 'rect',
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    rot: 0,
    fill: opts.fill ? { type: 'solid', color: opts.fill, alpha: 0.85 } : { type: 'none' },
    line: null,
    textBox: !opts.fill,
    text: { ...textBody({ anchor: 'middle', autofit: 'shrink' }), doc: docFromText(text, { align: opts.align ?? 'center' }, opts.color ? [{ type: 'textStyle', attrs: { color: opts.color, fontSize: 16 } }] : [{ type: 'textStyle', attrs: { fontSize: 16 } }]) },
  }
}

/** The selected pictures arranged in `layout` inside `area`; captions use each picture's alt text. */
export function pictureLayout(images: ImageElement[], layout: PictureLayoutId, area: Box, fallbackCaption: string): GroupElement {
  const n = images.length
  const gap = 12
  const text = (img: ImageElement) => img.alt?.trim() || fallbackCaption
  const els: SlideElement[] = []
  if (layout === 'strips') {
    const rowH = (area.h - gap * (n - 1)) / n
    images.forEach((img, i) => {
      const y = area.y + i * (rowH + gap)
      const pic = { x: area.x, y, w: Math.min(rowH * 1.3, area.w * 0.4), h: rowH }
      els.push(placed(img, pic))
      els.push(caption(text(img), { x: pic.x + pic.w, y, w: area.w - pic.w, h: rowH }, { fill: 'theme:accent1', color: 'theme:bg1', align: 'left' }))
    })
  } else if (layout === 'circles' || layout === 'banner' || layout === 'captioned') {
    const cols = layout === 'captioned' ? Math.ceil(Math.sqrt(n)) : n
    const rows = Math.ceil(n / cols)
    const cellW = (area.w - gap * (cols - 1)) / cols
    const cellH = (area.h - gap * (rows - 1)) / rows
    images.forEach((img, i) => {
      const x = area.x + (i % cols) * (cellW + gap)
      const y = area.y + Math.floor(i / cols) * (cellH + gap)
      if (layout === 'banner') {
        els.push(placed(img, { x, y, w: cellW, h: cellH }))
        els.push(caption(text(img), { x, y: y + cellH * 0.78, w: cellW, h: cellH * 0.22 }, { fill: 'theme:accent1', color: 'theme:bg1' }))
        return
      }
      const capH = Math.min(48, cellH * 0.2)
      if (layout === 'circles') {
        const d = Math.min(cellW, cellH - capH)
        els.push(placed(img, { x: x + (cellW - d) / 2, y, w: d, h: d }, 'ellipse'))
        els.push(caption(text(img), { x, y: y + d, w: cellW, h: capH }))
      } else {
        els.push(placed(img, { x, y, w: cellW, h: cellH - capH }))
        els.push(caption(text(img), { x, y: y + cellH - capH, w: cellW, h: capH }))
      }
    })
  } else {
    // Mosaic: the first picture large on the left, the others stacked on the right.
    const [first, ...rest] = images
    const leftW = rest.length ? area.w * 0.6 : area.w
    els.push(placed(first, { x: area.x, y: area.y, w: leftW, h: area.h }))
    const h = (area.h - gap * (rest.length - 1)) / Math.max(1, rest.length)
    rest.forEach((img, i) => els.push(placed(img, { x: area.x + leftW + gap, y: area.y + i * (h + gap), w: area.w - leftW - gap, h })))
  }
  return makeGroup(els, uid(), 'Picture Layout')
}

/** Area used for the layout: the pictures' current bounds, at least a reasonable size on the slide. */
export function layoutArea(images: ImageElement[], slide: { w: number; h: number }): Box {
  const b = union(images.map((i) => bounds(i)))
  const w = Math.max(b.w, slide.w * 0.6)
  const h = Math.max(b.h, slide.h * 0.5)
  return { x: Math.max(0, Math.min(b.x, slide.w - w)), y: Math.max(0, Math.min(b.y, slide.h - h)), w: Math.min(w, slide.w), h: Math.min(h, slide.h) }
}
