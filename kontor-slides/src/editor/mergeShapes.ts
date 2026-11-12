// Merge Shapes (Union, Combine, Fragment, Intersect, Subtract) using polygon boolean operations.
import type { ShapeElement, SlideElement } from '../model/types'
import { geometry, LINE_SHAPES } from '../model/shapes'
import { ringsPath } from '../render/ElementView'
import { uid } from '../model/factory'
import { commit, currentSlide, store, updateSlide } from '../store/store'

type Ring = [number, number][]
type Poly = Ring[]
type Multi = Poly[]

export type MergeOp = 'union' | 'combine' | 'fragment' | 'intersect' | 'subtract'

function sample(d: string): Ring[] {
  const rings: Ring[] = []
  for (const sub of d.split(/(?=M)/).filter((x) => x.trim())) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    p.setAttribute('d', sub)
    const len = p.getTotalLength()
    if (!len) continue
    const n = Math.max(8, Math.min(240, Math.ceil(len / 4)))
    const ring: Ring = []
    for (let i = 0; i < n; i++) {
      const q = p.getPointAtLength((len * i) / n)
      ring.push([q.x, q.y])
    }
    rings.push(ring)
  }
  return rings
}

function toSlide(el: ShapeElement, rings: Ring[]): Multi {
  const cx = el.w / 2
  const cy = el.h / 2
  const a = (el.rot * Math.PI) / 180
  const tr = ([x, y]: [number, number]): [number, number] => {
    let lx = (el.flipH ? el.w - x : x) - cx
    let ly = (el.flipV ? el.h - y : y) - cy
    ;[lx, ly] = [lx * Math.cos(a) - ly * Math.sin(a), lx * Math.sin(a) + ly * Math.cos(a)]
    return [el.x + cx + lx, el.y + cy + ly]
  }
  return rings.map((r) => [[...r.map(tr), tr(r[0])]])
}

function shapePolygon(el: ShapeElement): Multi {
  const d = el.prst === 'custom' && el.rings ? ringsPath(el) : geometry(el.prst, el.w, el.h, el.adj).paths.filter((p) => p.fill !== 'none').map((p) => p.d).join(' ')
  return toSlide(el, sample(d))
}

export function canMerge(els: SlideElement[]) {
  return els.length >= 2 && els.every((e) => e.type === 'shape' && !LINE_SHAPES.has(e.prst) && !e.placeholder)
}

export async function mergeShapes(op: MergeOp) {
  const s = store.get()
  const slide = currentSlide(s)
  const els = slide.elements.filter((e): e is ShapeElement => s.selection.includes(e.id) && e.type === 'shape')
  if (!canMerge(els)) return
  const { default: pc } = await import('polygon-clipping')
  // Each shape may consist of several outlines; union them first.
  const polys = els.map((e) => pc.union(...(shapePolygon(e) as [Poly, ...Poly[]])))
  let results: Multi[] = []
  const [first, ...rest] = polys
  if (op === 'union') results = [pc.union(first, ...rest)]
  else if (op === 'intersect') results = [pc.intersection(first, ...rest)]
  else if (op === 'subtract') results = [pc.difference(first, ...rest)]
  else if (op === 'combine') results = [pc.xor(first, ...rest)]
  else {
    let pieces: Multi[] = [first]
    let covered: Multi = first
    for (const b of rest) {
      const next: Multi[] = []
      for (const a of pieces) {
        const inter = pc.intersection(a, b)
        const diff = pc.difference(a, b)
        if (inter.length) next.push(inter)
        if (diff.length) next.push(diff)
      }
      const fresh = pc.difference(b, covered)
      if (fresh.length) next.push(fresh)
      covered = pc.union(covered, b)
      pieces = next
    }
    // Every separate region becomes its own shape.
    results = pieces.flatMap((m) => m.map((poly) => [poly]))
  }
  const base = els[0]
  const created: ShapeElement[] = results
    .filter((m) => m.length)
    .map((m, i) => {
      const pts = m.flat(2) as [number, number][]
      const xs = pts.map((p) => p[0])
      const ys = pts.map((p) => p[1])
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      const w = Math.max(1, Math.max(...xs) - x)
      const h = Math.max(1, Math.max(...ys) - y)
      return {
        id: uid(),
        type: 'shape',
        name: `Freeform ${slide.elements.length + i + 1}`,
        prst: 'custom',
        x,
        y,
        w,
        h,
        rot: 0,
        fill: base.fill,
        line: base.line,
        effects: base.effects,
        rings: m.flatMap((poly) => poly.map((ring) => ring.slice(0, -1).map(([px, py]) => [Math.round((px - x) * 100) / 100, Math.round((py - y) * 100) / 100] as [number, number]))),
        ringsBox: { w, h },
      }
    })
  const ids = new Set(els.map((e) => e.id))
  const at = slide.elements.findIndex((e) => ids.has(e.id))
  commit(
    (p) =>
      updateSlide(p, s.slideId, (sl) => {
        const remaining = sl.elements.filter((e) => !ids.has(e.id))
        return { ...sl, elements: [...remaining.slice(0, at), ...created, ...remaining.slice(at)] }
      }),
    { selection: created.map((c) => c.id) },
  )
}
