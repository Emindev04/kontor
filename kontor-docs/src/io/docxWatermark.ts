import { HorizontalPositionAlign, HorizontalPositionRelativeFrom, ImageRun, Paragraph, TextWrappingType, VerticalPositionAlign, VerticalPositionRelativeFrom } from 'docx'
import type { Watermark } from '../pageSetup'
import { imageSize } from './imageSize'

// Watermarks live in the headers, like the original stores them: text as a VML WordArt shape behind
// the text (so the original's Watermark dialog recognizes it), pictures as a centered picture behind
// the text.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The standard WordArt text-path shape type that text watermarks refer to. */
const TEXTPATH_SHAPETYPE =
  '<v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" path="m@7,l@8,m@5,21600l@6,21600e"><v:formulas>' +
  ['sum #0 0 10800', 'prod #0 2 1', 'sum 21600 0 @1', 'sum 0 0 @2', 'sum 21600 0 @3', 'if @0 @3 0', 'if @0 21600 @1', 'if @0 0 @2', 'if @0 @4 21600', 'mid @5 @6', 'mid @8 @5', 'mid @7 @8', 'mid @6 @7', 'sum @6 0 @5']
    .map((f) => `<v:f eqn="${f}"/>`)
    .join('') +
  '</v:formulas><v:path textpathok="t" o:connecttype="custom" o:connectlocs="@9,0;@10,10800;@11,21600;@12,10800" o:connectangles="270,180,90,0"/>' +
  '<v:textpath on="t" fitshape="t"/><v:handles><v:h position="#0,bottomRight" xrange="6629,14971"/></v:handles><o:lock v:ext="edit" text="t" shapetype="t"/></v:shapetype>'

/** A header paragraph holding a text watermark across the text column (`widthPt` wide). */
export function textWatermarkXml(w: Watermark, widthPt: number, font: string, index: number) {
  const width = Math.round(widthPt * 100) / 100
  const height = Math.round((width / 4) * 100) / 100
  const style = [
    'position:absolute',
    'margin-left:0',
    'margin-top:0',
    `width:${width}pt`,
    `height:${height}pt`,
    ...(w.layout === 'diagonal' ? ['rotation:315'] : []),
    'z-index:-251654144',
    'mso-position-horizontal:center',
    'mso-position-horizontal-relative:margin',
    'mso-position-vertical:center',
    'mso-position-vertical-relative:margin',
  ].join(';')
  return (
    `<w:p><w:r><w:rPr><w:noProof/></w:rPr><w:pict>${TEXTPATH_SHAPETYPE}` +
    `<v:shape id="PowerPlusWaterMarkObject${index}" o:spid="_x0000_s${2049 + index}" type="#_x0000_t136" style="${style}" o:allowincell="f" fillcolor="${esc(w.color)}" stroked="f">` +
    `${w.semitransparent ? '<v:fill opacity=".5"/>' : ''}<v:textpath style="font-family:&quot;${esc(font)}&quot;;font-size:1pt" string="${esc(w.text)}"/>` +
    '<w10:wrap anchorx="margin" anchory="margin"/></v:shape></w:pict></w:r></w:p>'
  )
}

/** Adds the text watermark to every header part of a written package. */
export function injectTextWatermark(xml: string, paragraph: string) {
  return xml.replace(/(<w:hdr\b[^>]*>)/, `$1${paragraph}`)
}

/** A paragraph with the picture watermark, centered on the page behind the text. */
export async function pictureWatermark(w: Watermark, maxWidthPx: number, maxHeightPx: number): Promise<Paragraph | null> {
  const match = w.image?.match(/^data:image\/(png|jpe?g|gif);base64,(.*)$/)
  if (!match) return null
  let data: Uint8Array = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0))
  const size = imageSize(data)
  if (!size) return null
  const scale = w.scale ?? 1
  let width = size.width * scale
  let height = size.height * scale
  const fit = Math.min(1, maxWidthPx / width, maxHeightPx / height)
  width = Math.round(width * fit)
  height = Math.round(height * fit)
  if (w.washout) data = (await washout(w.image!)) ?? data
  return new Paragraph({
    children: [
      new ImageRun({
        type: w.washout ? 'png' : match[1] === 'jpeg' || match[1] === 'jpg' ? 'jpg' : (match[1] as 'png' | 'gif'),
        data,
        transformation: { width, height },
        floating: {
          horizontalPosition: { relative: HorizontalPositionRelativeFrom.MARGIN, align: HorizontalPositionAlign.CENTER },
          verticalPosition: { relative: VerticalPositionRelativeFrom.MARGIN, align: VerticalPositionAlign.CENTER },
          behindDocument: true,
          allowOverlap: true,
          wrap: { type: TextWrappingType.NONE },
        },
        altText: { name: 'Watermark', description: 'Watermark', title: 'Watermark' },
      }),
    ],
  })
}

/** "Washout": the picture lightened and faded, baked into the exported file. */
async function washout(src: string): Promise<Uint8Array | null> {
  try {
    const img = new window.Image()
    img.src = src
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const g = canvas.getContext('2d')
    if (!g) return null
    g.fillStyle = '#fff'
    g.fillRect(0, 0, canvas.width, canvas.height)
    g.globalAlpha = 0.3
    g.filter = 'grayscale(0.4) brightness(1.3)'
    g.drawImage(img, 0, 0)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null
  } catch {
    return null
  }
}
