import { Extension } from '@tiptap/core'

// Picture Format options stored on the image node: picture style (frame), rotation and flips.

export const PICTURE_STYLES: { id: string; label: string }[] = [
  { id: 'none', label: 'No Style' },
  { id: 'thin', label: 'Simple Frame, Black' },
  { id: 'white', label: 'Simple Frame, White' },
  { id: 'shadow', label: 'Drop Shadow Rectangle' },
  { id: 'rounded', label: 'Rounded Diagonal Corner' },
  { id: 'soft', label: 'Soft Edge Rectangle' },
  { id: 'oval', label: 'Oval' },
  { id: 'thick', label: 'Thick Matte, Black' },
]

export const ImageFormat = Extension.create({
  name: 'imageFormat',

  addGlobalAttributes() {
    return [
      {
        types: ['image'],
        attributes: {
          frame: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-frame'),
            renderHTML: (a) => (a.frame && a.frame !== 'none' ? { 'data-frame': a.frame, class: `img-frame-${a.frame}` } : {}),
          },
          flip: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-flip'),
            renderHTML: (a) => (a.flip || a.rotation ? { ...(a.flip ? { 'data-flip': a.flip } : {}), style: `transform: ${imageTransform(a)}` } : {}),
          },
        },
      },
    ]
  },
})

/** CSS transform for rotation and flips (rendered on the <img>). */
export function imageTransform(attrs: Record<string, unknown>) {
  const parts: string[] = []
  if (attrs.rotation) parts.push(`rotate(${attrs.rotation}deg)`)
  if (attrs.flip === 'h' || attrs.flip === 'hv') parts.push('scaleX(-1)')
  if (attrs.flip === 'v' || attrs.flip === 'hv') parts.push('scaleY(-1)')
  return parts.join(' ')
}
