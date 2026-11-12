// Copy as Picture: draws a range of cells (fills, gridlines, borders and text as displayed) into a PNG.
import type { Range } from '../model/address'
import { cellView } from './display'
import type { Doc } from './doc'
import { newPicture, addObject } from './objects'
import { t, tx } from '../i18n'

const DEFAULT_FONT = 'Calibri, Carlito, Arial, sans-serif'

export function renderRangeCanvas(doc: Doc, rg: Range, scale = 2): HTMLCanvasElement {
  const sheet = doc.sheet
  const xs: number[] = [0]
  for (let c = rg.c1; c <= rg.c2; c++) xs.push(xs[xs.length - 1] + sheet.cols.size(c))
  const ys: number[] = [0]
  for (let r = rg.r1; r <= rg.r2; r++) ys.push(ys[ys.length - 1] + sheet.rows.size(r))
  const W = Math.max(1, xs[xs.length - 1])
  const H = Math.max(1, ys[ys.length - 1])
  const cv = document.createElement('canvas')
  cv.width = Math.ceil(W * scale)
  cv.height = Math.ceil(H * scale)
  const ctx = cv.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'alphabetic'
  for (let r = rg.r1; r <= rg.r2; r++) {
    for (let c = rg.c1; c <= rg.c2; c++) {
      const m = sheet.mergeAt(r, c)
      if (m && (m.r1 !== r || m.c1 !== c)) continue
      const x = xs[c - rg.c1]
      const y = ys[r - rg.r1]
      const w = (m ? xs[Math.min(m.c2, rg.c2) - rg.c1 + 1] : xs[c - rg.c1 + 1]) - x
      const h = (m ? ys[Math.min(m.r2, rg.r2) - rg.r1 + 1] : ys[r - rg.r1 + 1]) - y
      if (w <= 0 || h <= 0) continue
      const st = doc.style(r, c)
      if (st.fill) {
        ctx.fillStyle = st.fill
        ctx.fillRect(x, y, w, h)
      }
      if (sheet.showGrid) {
        ctx.strokeStyle = '#D9D9D9'
        ctx.lineWidth = 1
        ctx.strokeRect(x + 0.5, y + 0.5, w, h)
      }
      const edge = (b: { style: string; color: string } | undefined, x1: number, y1: number, x2: number, y2: number) => {
        if (!b) return
        ctx.strokeStyle = b.color || '#000'
        ctx.lineWidth = b.style === 'thick' ? 3 : b.style === 'medium' ? 2 : 1
        ctx.setLineDash(b.style === 'dashed' ? [4, 2] : b.style === 'dotted' ? [1, 2] : [])
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
        ctx.setLineDash([])
      }
      edge(st.bt, x, y + 0.5, x + w, y + 0.5)
      edge(st.bb, x, y + h - 0.5, x + w, y + h - 0.5)
      edge(st.bl, x + 0.5, y, x + 0.5, y + h)
      edge(st.br, x + w - 0.5, y, x + w - 0.5, y + h)
      const view = cellView(doc, sheet, r, c, st, w)
      if (!view.text) continue
      const size = (st.size ?? 11) * (96 / 72)
      ctx.font = `${st.italic ? 'italic ' : ''}${st.bold ? 'bold ' : ''}${size.toFixed(1)}px ${st.font ? `"${st.font}", ` : ''}${DEFAULT_FONT}`
      ctx.fillStyle = view.color ?? st.color ?? '#000'
      ctx.save()
      ctx.beginPath()
      ctx.rect(x, y, w, h)
      ctx.clip()
      const tw = ctx.measureText(view.text).width
      const tx = view.align === 'right' ? x + w - 3 - tw : view.align === 'center' ? x + (w - tw) / 2 : x + 3
      const ty = st.v === 'top' ? y + size + 1 : st.v === 'middle' ? y + (h + size * 0.72) / 2 : y + h - 4
      ctx.fillText(view.text, tx, ty)
      if (st.underline) ctx.fillRect(tx, ty + 2, tw, 1)
      ctx.restore()
    }
  }
  return cv
}

/** Home > Copy > Copy as Picture: the selection as a PNG on the clipboard (kept for Paste > Picture too). */
export async function copyAsPicture(doc: Doc): Promise<string | null> {
  const rg = doc.boundToUsed(doc.activeRange)
  const cv = renderRangeCanvas(doc, rg)
  doc.pictureClip = cv.toDataURL('image/png')
  try {
    const blob = await new Promise<Blob | null>((resolve) => cv.toBlob(resolve, 'image/png'))
    const Item = (globalThis as { ClipboardItem?: new (items: Record<string, Blob>) => unknown }).ClipboardItem
    if (blob && Item && navigator.clipboard?.write) await navigator.clipboard.write([new Item({ 'image/png': blob }) as ClipboardItem])
  } catch {
    // the browser refused clipboard access: Paste > Picture still works inside the workbook
  }
  return null
}

/** Paste > Picture: inserts the copied cells (or the last Copy as Picture) as a picture. */
export function pasteAsPicture(doc: Doc): string | null {
  let url = doc.pictureClip
  if (doc.clip) {
    const sheet = doc.wb.sheetById(doc.clip.sheetId)
    if (sheet === doc.sheet) url = renderRangeCanvas(doc, doc.clip.range).toDataURL('image/png')
  }
  if (!url) return t('Copy cells first.')
  const img = url
  const probe = new Image()
  probe.src = img
  const id = doc.wb.addImage(img)
  const rg = doc.clip?.range
  const w = rg ? Array.from({ length: rg.c2 - rg.c1 + 1 }, (_, i) => doc.sheet.cols.size(rg.c1 + i)).reduce((a, b) => a + b, 0) : 240
  const h = rg ? Array.from({ length: rg.r2 - rg.r1 + 1 }, (_, i) => doc.sheet.rows.size(rg.r1 + i)).reduce((a, b) => a + b, 0) : 120
  addObject(doc, newPicture(doc, id, Math.min(w, 1600), Math.min(h, 1200)), tx('Paste Picture'))
  return null
}
