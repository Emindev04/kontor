// Reading and compressing pictures. Like the original program, pictures larger than needed for the
// slide are scaled down when they are inserted (default 220 ppi), which keeps files and AutoSave small.

/** Pixels per inch used for inserted pictures; the slide is 96 px per inch in the model. */
export const DEFAULT_PPI = 220

export function readDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

export function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('The picture could not be read.'))
    i.src = src
  })
}

/** Formats that are kept as they are (vector or animated). */
function keepAsIs(src: string) {
  return src.startsWith('data:image/svg') || src.startsWith('data:image/gif')
}

function hasAlpha(img: HTMLImageElement, w: number, h: number) {
  const c = document.createElement('canvas')
  const sw = Math.min(64, w)
  const sh = Math.min(64, h)
  c.width = sw
  c.height = sh
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(img, 0, 0, sw, sh)
  const d = g.getImageData(0, 0, sw, sh).data
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true
  return false
}

/**
 * Re-encodes a picture so its long edge is at most `maxEdge` pixels. Pictures that are already small
 * enough (or SVG/GIF) are returned unchanged. JPEGs stay JPEG; pictures with transparency stay PNG.
 */
export async function downscale(src: string, maxEdge: number, crop?: { l: number; t: number; r: number; b: number }): Promise<{ src: string; natW: number; natH: number; changed: boolean }> {
  const img = await loadImage(src)
  const nw = img.naturalWidth || 1
  const nh = img.naturalHeight || 1
  const c0 = crop ?? { l: 0, t: 0, r: 0, b: 0 }
  const sx = Math.round(nw * c0.l)
  const sy = Math.round(nh * c0.t)
  const sw = Math.max(1, Math.round(nw * (1 - c0.l - c0.r)))
  const sh = Math.max(1, Math.round(nh * (1 - c0.t - c0.b)))
  const scale = Math.min(1, maxEdge / Math.max(sw, sh))
  if (keepAsIs(src) || (scale >= 1 && !crop)) return { src, natW: nw, natH: nh, changed: false }
  const w = Math.max(1, Math.round(sw * scale))
  const h = Math.max(1, Math.round(sh * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h)
  const png = src.startsWith('data:image/png') && hasAlpha(img, nw, nh)
  const out = png ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9)
  // Keep the original when re-encoding would not make it smaller.
  if (!crop && out.length >= src.length) return { src, natW: nw, natH: nh, changed: false }
  return { src: out, natW: w, natH: h, changed: true }
}

/** Long edge in pixels needed to show a picture of `boxW` × `boxH` model px at `ppi`. */
export function maxEdgeFor(boxW: number, boxH: number, ppi: number) {
  return Math.ceil((Math.max(boxW, boxH) / 96) * ppi)
}

/** Reads a picture file for inserting: pictures bigger than the slide needs at 220 ppi are scaled down. */
export async function readImageFile(file: Blob, slide: { w: number; h: number }) {
  const original = await readDataUrl(file)
  try {
    return await downscale(original, maxEdgeFor(slide.w, slide.h, DEFAULT_PPI))
  } catch {
    const img = await loadImage(original)
    return { src: original, natW: img.naturalWidth || 400, natH: img.naturalHeight || 300, changed: false }
  }
}
