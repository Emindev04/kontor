// Export > Create a Video and Animated GIF: slides are drawn into a canvas with their transitions and
// recorded with MediaRecorder (WebM, or MP4 where the browser can write it). Animations inside a slide
// are shown in their final state.
import type { Presentation, TransitionName } from '../model/types'
import { slideImage } from './slideImages'

export type VideoQuality = { label: string; width: number }
export const VIDEO_QUALITIES: VideoQuality[] = [
  { label: 'Full HD (1080p)', width: 1920 },
  { label: 'HD (720p)', width: 1280 },
  { label: 'Standard (480p)', width: 852 },
]

export type VideoOptions = {
  width: number
  secondsPerSlide: number
  /** Use each slide's "advance after" time and its transition, like the original's recorded timings. */
  useTimings: boolean
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

/** The video formats this browser can record, best first. */
export function videoMime(): { mime: string; ext: 'mp4' | 'webm' } | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const [mime, ext] of [
    ['video/mp4;codecs=avc1.42E01E', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9', 'webm'],
    ['video/webm;codecs=vp8', 'webm'],
    ['video/webm', 'webm'],
  ] as const)
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext }
  return null
}

type Frame = { img: ImageBitmap; seconds: number; transition: TransitionName; tDur: number; option?: string }

async function renderFrames(pres: Presentation, width: number, opts: Pick<VideoOptions, 'secondsPerSlide' | 'useTimings' | 'onProgress' | 'signal'>, share = 0.5): Promise<Frame[]> {
  const visible = pres.slides.map((s, i) => ({ s, i })).filter(({ s }) => !s.hidden)
  const frames: Frame[] = []
  for (const [k, { s, i }] of visible.entries()) {
    if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    const blob = await slideImage(pres, i, 'png', width)
    const img = await createImageBitmap(blob)
    const tr = s.transition
    const seconds = opts.useTimings && tr?.advanceAfter ? tr.advanceAfter : opts.secondsPerSlide
    frames.push({ img, seconds: Math.max(0.5, seconds), transition: opts.useTimings && tr ? tr.name : 'none', tDur: tr?.duration ?? 1, option: tr?.option })
    opts.onProgress?.(((k + 1) / visible.length) * share)
  }
  return frames
}

/** Draws the transition from `prev` to `next` at progress t (0…1); unknown effects fade. */
function drawTransition(ctx: CanvasRenderingContext2D, prev: ImageBitmap | null, next: ImageBitmap, name: TransitionName, t: number, option: string | undefined, w: number, h: number) {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
  const fromRight = !option || /right|fromRight/i.test(option) || option === 'left'
  const dir = fromRight ? 1 : -1
  switch (name) {
    case 'push':
      if (prev) ctx.drawImage(prev, -dir * ease * w, 0, w, h)
      ctx.drawImage(next, dir * (1 - ease) * w, 0, w, h)
      return
    case 'cover':
      if (prev) ctx.drawImage(prev, 0, 0, w, h)
      ctx.drawImage(next, dir * (1 - ease) * w, 0, w, h)
      return
    case 'uncover':
    case 'reveal':
      ctx.drawImage(next, 0, 0, w, h)
      if (prev) ctx.drawImage(prev, -dir * ease * w, 0, w, h)
      return
    case 'wipe': {
      if (prev) ctx.drawImage(prev, 0, 0, w, h)
      ctx.save()
      ctx.beginPath()
      if (dir > 0) ctx.rect(w * (1 - ease), 0, w * ease, h)
      else ctx.rect(0, 0, w * ease, h)
      ctx.clip()
      ctx.drawImage(next, 0, 0, w, h)
      ctx.restore()
      return
    }
    case 'split': {
      if (prev) ctx.drawImage(prev, 0, 0, w, h)
      ctx.save()
      ctx.beginPath()
      ctx.rect(w / 2 - (w / 2) * ease, 0, w * ease, h)
      ctx.clip()
      ctx.drawImage(next, 0, 0, w, h)
      ctx.restore()
      return
    }
    case 'none':
      ctx.drawImage(next, 0, 0, w, h)
      return
    default:
      if (prev) ctx.drawImage(prev, 0, 0, w, h)
      ctx.globalAlpha = ease
      ctx.drawImage(next, 0, 0, w, h)
      ctx.globalAlpha = 1
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Records the presentation as a video file. */
export async function slidesVideo(pres: Presentation, opts: VideoOptions): Promise<{ blob: Blob; ext: string }> {
  const fmt = videoMime()
  if (!fmt) throw new Error('This browser cannot record video.')
  const w = even(opts.width)
  const h = even((opts.width * pres.size.h) / pres.size.w)
  const frames = await renderFrames(pres, w, opts)
  if (!frames.length) throw new Error('There are no slides to show.')
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(frames[0].img, 0, 0, w, h)
  const stream = canvas.captureStream(30)
  const recorder = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: w >= 1900 ? 8_000_000 : w >= 1200 ? 5_000_000 : 2_500_000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()))
  recorder.start(1000)
  const total = frames.reduce((a, f) => a + f.seconds + (f.transition !== 'none' ? f.tDur : 0), 0)
  let elapsed = 0
  try {
    for (let k = 0; k < frames.length; k++) {
      const f = frames[k]
      const prev = k ? frames[k - 1].img : null
      const tDur = f.transition !== 'none' ? f.tDur : 0
      const start = performance.now()
      // Transition, then hold the slide.
      for (let now = start; now - start < (tDur + f.seconds) * 1000; now = performance.now()) {
        if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
        const t = tDur ? Math.min(1, (now - start) / (tDur * 1000)) : 1
        drawTransition(ctx, prev, f.img, t < 1 ? f.transition : 'none', t, f.option, w, h)
        opts.onProgress?.(0.5 + 0.5 * Math.min(1, (elapsed + (now - start) / 1000) / total))
        await sleep(1000 / 30)
      }
      elapsed += tDur + f.seconds
    }
  } finally {
    recorder.stop()
    stream.getTracks().forEach((t) => t.stop())
    frames.forEach((f) => f.img.close())
  }
  await stopped
  return { blob: new Blob(chunks, { type: fmt.mime.split(';')[0] }), ext: fmt.ext }
}

/** The presentation as an animated GIF (one frame per slide, short cross-fades between slides). */
export async function slidesGif(pres: Presentation, opts: Omit<VideoOptions, 'useTimings'> & { fade?: boolean }): Promise<Blob> {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc')
  const w = even(opts.width)
  const h = even((opts.width * pres.size.h) / pres.size.w)
  const frames = await renderFrames(pres, w, { ...opts, useTimings: false }, 0.6)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const gif = GIFEncoder()
  const add = (delay: number) => {
    const { data } = ctx.getImageData(0, 0, w, h)
    const palette = quantize(data, 256)
    gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay })
  }
  for (let k = 0; k < frames.length; k++) {
    if (opts.signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    if (k && opts.fade !== false)
      for (const t of [0.25, 0.5, 0.75]) {
        drawTransition(ctx, frames[k - 1].img, frames[k].img, 'fade', t, undefined, w, h)
        add(60)
      }
    drawTransition(ctx, null, frames[k].img, 'none', 1, undefined, w, h)
    add(Math.round(frames[k].seconds * 1000))
    opts.onProgress?.(0.6 + (0.4 * (k + 1)) / frames.length)
    await sleep(0)
  }
  frames.forEach((f) => f.img.close())
  gif.finish()
  return new Blob([gif.bytes() as BlobPart], { type: 'image/gif' })
}
