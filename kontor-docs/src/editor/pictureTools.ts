import { t } from '../i18n'
// Picture Format › Compress Pictures and Remove Background, done on a canvas in the program.

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(t('The picture could not be read.')))
    img.src = src
  })
}

/** Size in bytes of a data URL's content. */
export function dataUrlBytes(src: string): number {
  const i = src.indexOf(',')
  if (i < 0 || !src.startsWith('data:')) return 0
  const body = src.slice(i + 1)
  if (!/;base64,/.test(src.slice(0, i + 8))) return decodeURIComponent(body).length
  const pad = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0
  return Math.floor((body.length * 3) / 4) - pad
}

/** Target size in pixels for a picture shown at `shown` CSS px at the given resolution (CSS px are 96 per inch). */
export function targetPixels(shown: number, ppi: number) {
  return Math.max(1, Math.round((shown * ppi) / 96))
}

function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const data = ctx.getImageData(0, 0, w, h).data
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true
  return false
}

export type CompressOptions = {
  /** Resolution in pixels per inch for the size the picture is shown at. */
  ppi: number
  /** Crop margins (fractions) to cut away for good. */
  crop?: { top: number; right: number; bottom: number; left: number } | null
  /** JPEG quality for pictures without transparency. */
  quality?: number
}

/**
 * Scales a picture down to the resolution needed for the size it is shown at (and cuts away cropped
 * areas). Returns the new data URL, or null when it would not get smaller.
 */
export async function compressPicture(src: string, shownWidth: number, shownHeight: number, options: CompressOptions): Promise<string | null> {
  const img = await loadImage(src)
  const crop = options.crop ?? { top: 0, right: 0, bottom: 0, left: 0 }
  const sx = img.naturalWidth * crop.left
  const sy = img.naturalHeight * crop.top
  const sw = img.naturalWidth * (1 - crop.left - crop.right)
  const sh = img.naturalHeight * (1 - crop.top - crop.bottom)
  const w = Math.min(Math.round(sw), targetPixels(shownWidth, options.ppi))
  const h = Math.min(Math.round(sh), targetPixels(shownHeight, options.ppi))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, w)
  canvas.height = Math.max(1, h)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  const out = hasTransparency(ctx, canvas.width, canvas.height) ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', options.quality ?? 0.85)
  return dataUrlBytes(out) < dataUrlBytes(src) || options.crop ? out : null
}

/** Distance of two RGB colors (0 … 441). */
const distance = (d: Uint8ClampedArray, i: number, c: [number, number, number]) => Math.hypot(d[i] - c[0], d[i + 1] - c[1], d[i + 2] - c[2])

/**
 * Makes the background transparent: the color found along the picture's edges is removed wherever
 * it is connected to an edge (flood fill), within `tolerance` (0–100).
 */
export function removeBackgroundPixels(data: Uint8ClampedArray, width: number, height: number, tolerance = 25) {
  // The background color: the average of the edge pixels that are most common (corners first).
  const corners = [0, width - 1, (height - 1) * width, height * width - 1].map((p) => p * 4)
  const avg: [number, number, number] = [0, 0, 0]
  for (const i of corners) {
    avg[0] += data[i] / 4
    avg[1] += data[i + 1] / 4
    avg[2] += data[i + 2] / 4
  }
  const limit = (tolerance / 100) * 441
  const seen = new Uint8Array(width * height)
  const stack: number[] = []
  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x)
  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1)
  let removed = 0
  while (stack.length) {
    const p = stack.pop()!
    if (seen[p]) continue
    seen[p] = 1
    const i = p * 4
    if (data[i + 3] === 0 || distance(data, i, avg) > limit) continue
    data[i + 3] = 0
    removed++
    const x = p % width
    const y = (p - x) / width
    if (x > 0) stack.push(p - 1)
    if (x < width - 1) stack.push(p + 1)
    if (y > 0) stack.push(p - width)
    if (y < height - 1) stack.push(p + width)
  }
  return removed
}

export async function removeBackground(src: string, tolerance = 25): Promise<string | null> {
  const img = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  if (!removeBackgroundPixels(image.data, canvas.width, canvas.height, tolerance)) return null
  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}
