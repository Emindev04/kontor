import { Image } from '@tiptap/extension-image'
import { DrawingView, drawingAttributes, type DrawingRenderer } from './Drawing'

// Pictures: the image node with drawing behaviour (wrap, position, rotation, resize handles) and the
// Picture Format options – crop, corrections, color, transparency, border and effects.

export type Recolor = 'none' | 'grayscale' | 'sepia' | 'washout' | 'blackWhite' | 'invert'
export type PictureEffect = 'none' | 'shadow' | 'glow' | 'softEdges' | 'reflection' | 'blur'

const num = (name: string, def: number) => ({
  default: def,
  parseHTML: (el: HTMLElement) => {
    const v = el.getAttribute(`data-${name}`)
    return v == null || isNaN(Number(v)) ? def : Number(v)
  },
  renderHTML: (a: Record<string, unknown>) => (a[camel(name)] == null || a[camel(name)] === def ? {} : { [`data-${name}`]: String(a[camel(name)]) }),
})
const str = (name: string, def: string | null) => ({
  default: def,
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`) ?? def,
  renderHTML: (a: Record<string, unknown>) => (a[camel(name)] == null || a[camel(name)] === def ? {} : { [`data-${name}`]: String(a[camel(name)]) }),
})
function camel(s: string) {
  return s.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())
}

/** CSS filter for the picture corrections and color options. */
export function pictureFilter(a: Record<string, unknown>) {
  const f: string[] = []
  const b = Number(a.brightness) || 0
  const c = Number(a.contrast) || 0
  const s = a.saturation == null ? 1 : Number(a.saturation)
  if (b) f.push(`brightness(${1 + b})`)
  if (c) f.push(`contrast(${1 + c})`)
  if (s !== 1) f.push(`saturate(${s})`)
  switch (a.recolor) {
    case 'grayscale': f.push('grayscale(1)'); break
    case 'sepia': f.push('sepia(1)'); break
    case 'washout': f.push('brightness(1.5) contrast(0.5) saturate(0.6)'); break
    case 'blackWhite': f.push('grayscale(1) contrast(4)'); break
    case 'invert': f.push('invert(1)'); break
  }
  if (a.effect === 'blur') f.push('blur(2px)')
  if (a.effect === 'shadow') f.push('drop-shadow(4px 4px 4px rgba(0,0,0,.45))')
  if (a.effect === 'glow') f.push(`drop-shadow(0 0 6px ${a.glowColor ?? '#4472C4'})`)
  return f.join(' ')
}

export const renderPicture: DrawingRenderer = (node, box, { width, height }) => {
  const a = node.attrs
  let img = box.querySelector('img')
  if (!img) {
    img = document.createElement('img')
    img.draggable = false
    box.appendChild(img)
  }
  if (img.getAttribute('src') !== a.src) img.src = a.src
  img.alt = a.alt ?? ''
  const l = Number(a.cropLeft) || 0
  const r = Number(a.cropRight) || 0
  const t = Number(a.cropTop) || 0
  const b = Number(a.cropBottom) || 0
  const cw = Math.max(0.05, 1 - l - r)
  const ch = Math.max(0.05, 1 - t - b)
  const iw = width / cw
  const ih = height / ch
  Object.assign(img.style, { position: 'absolute', width: `${iw}px`, height: `${ih}px`, left: `${-l * iw}px`, top: `${-t * ih}px`, maxWidth: 'none' })
  const flips = [a.flip?.includes('h') ? 'scaleX(-1)' : '', a.flip?.includes('v') ? 'scaleY(-1)' : ''].filter(Boolean).join(' ')
  img.style.transform = flips
  img.style.filter = pictureFilter(a)
  box.style.opacity = a.transparency ? String(1 - Number(a.transparency)) : ''
  box.className = `drawing-box picture-box${a.frame && a.frame !== 'none' ? ` img-frame-${a.frame}` : ''}${a.effect === 'softEdges' ? ' is-soft' : ''}${a.effect === 'reflection' ? ' is-reflection' : ''}`
  box.style.clipPath = a.cropShape === 'ellipse' ? 'ellipse(50% 50% at 50% 50%)' : a.cropShape === 'roundRect' ? 'inset(0 round 12%)' : ''
  box.style.outline = a.borderWidth ? `${a.borderWidth}pt ${a.borderDash ?? 'solid'} ${a.borderColor ?? '#000'}` : ''
  box.style.outlineOffset = a.borderWidth ? `-${a.borderWidth}pt` : ''
}

export const Picture = Image.extend({
  draggable: true,

  addAttributes() {
    const { width: _w, height: _h, ...drawing } = drawingAttributes()
    return {
      ...this.parent?.(),
      ...drawing,
      cropTop: num('crop-top', 0),
      cropRight: num('crop-right', 0),
      cropBottom: num('crop-bottom', 0),
      cropLeft: num('crop-left', 0),
      cropShape: str('crop-shape', null),
      brightness: num('brightness', 0),
      contrast: num('contrast', 0),
      saturation: num('saturation', 1),
      recolor: str('recolor', 'none'),
      transparency: num('transparency', 0),
      effect: str('effect', 'none'),
      glowColor: str('glow-color', null),
      borderColor: str('border-color', null),
      borderWidth: num('border-width', 0),
      borderDash: str('border-dash', 'solid'),
    }
  },

  addNodeView() {
    return ({ node, view, getPos }) => {
      const nodeView = new DrawingView(node, view, getPos as () => number | undefined, renderPicture, {
        keepRatio: true,
        className: 'picture',
        naturalSize: (n, box) => {
          const img = box.querySelector('img')
          if (!img?.naturalWidth) return null
          // Like the original: a large picture is scaled down to fit the text width and the page height.
          const ratio = img.naturalHeight / img.naturalWidth
          if (n.attrs.width != null) return { width: n.attrs.width as number, height: (n.attrs.height as number) ?? Math.round((n.attrs.width as number) * ratio) }
          const maxW = Math.max(48, view.dom.clientWidth || 624)
          const maxH = parseFloat(getComputedStyle(view.dom).getPropertyValue('--body-h')) || Infinity
          const w = Math.min(img.naturalWidth, maxW, maxH / ratio)
          return { width: Math.round(w), height: (n.attrs.height as number) ?? Math.round(w * ratio) }
        },
      })
      // Once the picture has loaded its natural size is known.
      const img = nodeView.dom.querySelector('img')
      img?.addEventListener('load', () => nodeView.refresh())
      return nodeView
    }
  },
})
