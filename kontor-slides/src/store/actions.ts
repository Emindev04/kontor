import type { ChartElement, ChartGrouping, ChartType, DiagramElement, DiagramLayout, ImageElement, MediaElement, ZoomElement, Fill, GroupElement, LayoutId, Presentation, ShapeElement, Slide, SlideElement, SlideSize, TableElement, Transition } from '../model/types'
import { createChart } from '../model/chart'
import { createDiagram } from '../model/diagram'
import { isMasterId } from '../model/master'
import { createTable, expandRange, fullRange, insertRow, nextCell, normRange, originOf, scaleTable, type CellRange } from '../model/table'
import { applyLayout, cloneElement, cloneSlide, createImage, createSlide, createTextBox, defaultFill, defaultLine, findElement, resetSlide, uid } from '../model/factory'
import { DRAW_TOOLS, geometry } from '../model/shapes'
import { pathToPoints, simplify } from '../model/pathPoints'
import { bounds, makeGroup, scaleGroup, union, ungroup, type Box } from '../model/geometry'
import { isDocEmpty } from '../model/richtext'
import { beginTransaction, commit, currentIndex, currentSlide, endTransaction, selectedElements, store, updateElements, updateSlide } from './store'
import type { EditEntry } from '../editor/TextEditor'
import { deletePoint, emptyHandles, hasCurves, normHandles, outlineBounds, pathToOutline, scaleOutline, setPointType, setSegmentCurved, smoothThrough, splitSegment, translateOutline, type Outline, type PointType } from '../model/outline'
import { readImageFile } from '../io/images'
import { makeRenderCtx, textCtxFor } from '../render/context'
import { layoutBoxes, STYLE_DEFS } from '../model/layouts'
import { getActiveEditor } from '../editor/activeEditor'
import { layoutArea, pictureLayout, type PictureLayoutId } from '../model/pictureLayout'
import { presColors } from '../model/themes'
import { resolveColor } from '../model/color'
import { mapStrings } from '../io/package'
import { slideBackground } from '../render/context'
import { slidesFromOutline } from '../model/slidesFromOutline'
import { equationDoc, equationText } from '../model/equation'
import { t } from '../i18n'
import { APP_NAME } from '../brand'

// ---------- Slides ----------

export function goToSlide(id: string, opts: { shift?: boolean; ctrl?: boolean } = {}) {
  const s = store.get()
  if (s.editingId) exitEditing()
  if (opts.ctrl) {
    const has = s.selectedSlides.includes(id)
    const next = has ? s.selectedSlides.filter((x) => x !== id) : [...s.selectedSlides, id]
    store.set({ slideId: id, selectedSlides: next.length ? next : [id], selection: [] })
    return
  }
  if (opts.shift) {
    const ids = s.pres.slides.map((x) => x.id)
    const a = ids.indexOf(s.slideId)
    const b = ids.indexOf(id)
    const range = ids.slice(Math.min(a, b), Math.max(a, b) + 1)
    store.set({ slideId: id, selectedSlides: range, selection: [] })
    return
  }
  store.set({ slideId: id, selectedSlides: [id], selection: [] })
}

export function goToIndex(index: number) {
  const slides = store.get().pres.slides
  const slide = slides[Math.max(0, Math.min(slides.length - 1, index))]
  if (slide) goToSlide(slide.id)
}

export function newSlide(layout?: LayoutId) {
  const s = store.get()
  const cur = currentSlide(s)
  const empty = !s.pres.slides.length
  const nextLayout = layout ?? (empty ? 'title' : cur.layout === 'title' ? 'titleContent' : cur.layout)
  const slide = createSlide(nextLayout, s.pres.size)
  const index = empty ? 0 : currentIndex(s) + 1
  commit((p) => ({ ...p, slides: [...p.slides.slice(0, index), slide, ...p.slides.slice(index)] }), { slideId: slide.id, selectedSlides: [slide.id], selection: [], editingId: null })
}

function slideTargets() {
  const s = store.get()
  if (isMasterId(s.slideId)) return [s.slideId]
  return s.selectedSlides.length ? s.selectedSlides : [s.slideId]
}

export function duplicateSlides(ids = slideTargets()) {
  const s = store.get()
  const order = s.pres.slides.filter((x) => ids.includes(x.id))
  const copies = order.map(cloneSlide)
  const last = Math.max(...order.map((x) => s.pres.slides.indexOf(x)))
  commit((p) => ({ ...p, slides: [...p.slides.slice(0, last + 1), ...copies, ...p.slides.slice(last + 1)] }), { slideId: copies[0].id, selectedSlides: copies.map((c) => c.id), selection: [] })
}

export function deleteSlides(ids = slideTargets()) {
  const s = store.get()
  const remaining = s.pres.slides.filter((x) => !ids.includes(x.id))
  const firstIdx = s.pres.slides.findIndex((x) => ids.includes(x.id))
  if (!remaining.length) {
    // Like the original, a presentation can be left without slides ("Click to add first slide").
    commit((p) => ({ ...p, slides: [] }), { slideId: '', selectedSlides: [], selection: [], editingId: null, tableSel: null })
    return
  }
  const next = remaining[Math.max(0, Math.min(remaining.length - 1, firstIdx - 1 < 0 ? 0 : firstIdx - 1))]
  commit((p) => ({ ...p, slides: remaining }), { slideId: next.id, selectedSlides: [next.id], selection: [], editingId: null })
}

export function moveSlides(ids: string[], toIndex: number) {
  commit((p) => {
    const moving = p.slides.filter((x) => ids.includes(x.id))
    const before = p.slides.slice(0, toIndex).filter((x) => !ids.includes(x.id))
    const after = p.slides.slice(toIndex).filter((x) => !ids.includes(x.id))
    return { ...p, slides: [...before, ...moving, ...after] }
  })
}

export function moveSlidesBy(delta: number) {
  const s = store.get()
  const ids = slideTargets()
  const indices = s.pres.slides.map((x, i) => (ids.includes(x.id) ? i : -1)).filter((i) => i >= 0)
  const target = delta < 0 ? Math.max(0, indices[0] + delta) : Math.min(s.pres.slides.length, indices[indices.length - 1] + delta + 1)
  moveSlides(ids, target)
}

export function toggleHideSlides(ids = slideTargets()) {
  const s = store.get()
  const hide = !s.pres.slides.filter((x) => ids.includes(x.id)).every((x) => x.hidden)
  commit((p) => ({ ...p, slides: p.slides.map((x) => (ids.includes(x.id) ? { ...x, hidden: hide } : x)) }))
}

export function setLayout(layout: LayoutId, ids = slideTargets()) {
  commit((p) => ({ ...p, slides: p.slides.map((x) => (ids.includes(x.id) ? applyLayout(x, layout, p.size) : x)) }), { selection: [], editingId: null })
}

export function resetSlides(ids = slideTargets()) {
  commit((p) => ({ ...p, slides: p.slides.map((x) => (ids.includes(x.id) ? resetSlide(x, p.size) : x)) }))
}

export function setBackground(fill: Fill | null, all = false, hideGraphics?: boolean) {
  const ids = all && !isMasterId(store.get().slideId) ? store.get().pres.slides.map((x) => x.id) : slideTargets()
  commit((p) => ids.reduce((acc, id) => updateSlide(acc, id, (x) => ({ ...x, background: fill, ...(hideGraphics !== undefined ? { hideBackgroundGraphics: hideGraphics } : {}) })), p))
}

export function setHideBackgroundGraphics(hide: boolean) {
  const ids = slideTargets()
  commit((p) => ids.reduce((acc, id) => updateSlide(acc, id, (x) => ({ ...x, hideBackgroundGraphics: hide })), p))
}

export const DEFAULT_TRANSITION: Transition = { name: 'none', duration: 1, advanceOnClick: true, advanceAfter: null }

export function setTransition(patch: Partial<Transition>, all = false) {
  const ids = all ? store.get().pres.slides.map((x) => x.id) : slideTargets()
  const base = currentSlide().transition ?? DEFAULT_TRANSITION
  commit((p) => ({
    ...p,
    slides: p.slides.map((x) => (ids.includes(x.id) ? { ...x, transition: all ? { ...base, ...patch } : { ...(x.transition ?? DEFAULT_TRANSITION), ...patch } } : x)),
  }))
}

export function setNotes(text: string) {
  const id = store.get().slideId
  commit((p) => updateSlide(p, id, (s) => ({ ...s, notes: text })))
}

export function setSection(name: string | null, slideId = store.get().slideId) {
  commit((p) => updateSlide(p, slideId, (s) => ({ ...s, section: name })))
}

/** Slides grouped by section: each block starts at a slide with a section name (or at slide 0). */
export function sectionBlocks(slides: Slide[]) {
  const blocks: { start: number; end: number; name: string | null }[] = []
  slides.forEach((sl, i) => {
    if (i === 0 || sl.section) blocks.push({ start: i, end: i, name: sl.section ?? null })
    else blocks[blocks.length - 1].end = i
  })
  return blocks
}

/** Moves the section that starts at `slideId` one section up or down. */
export function moveSection(slideId: string, dir: -1 | 1) {
  const slides = store.get().pres.slides
  const blocks = sectionBlocks(slides)
  const bi = blocks.findIndex((b) => slides[b.start].id === slideId)
  const other = bi + dir
  if (bi < 0 || other < 0 || other >= blocks.length) return
  const [a, b] = dir < 0 ? [blocks[other], blocks[bi]] : [blocks[bi], blocks[other]]
  commit((p) => ({ ...p, slides: [...p.slides.slice(0, a.start), ...p.slides.slice(b.start, b.end + 1), ...p.slides.slice(a.start, a.end + 1), ...p.slides.slice(b.end + 1)] }))
}

/** Removes a section together with its slides. */
export function removeSectionWithSlides(slideId: string) {
  const slides = store.get().pres.slides
  const block = sectionBlocks(slides).find((b) => slides[b.start].id === slideId)
  if (block) deleteSlides(slides.slice(block.start, block.end + 1).map((x) => x.id))
}

// ---------- Presentation ----------

export function setTheme(themeId: string, variant = 0) {
  commit((p) => ({ ...p, themeId, variant, fonts: null, colors: null, colorsName: null }))
}

export function setVariant(variant: number) {
  commit((p) => ({ ...p, variant, colors: null, colorsName: null }))
}

/** Custom theme colors (null goes back to the variant's colors). */
export function setThemeColors(colors: Presentation['colors'], name: string | null = null) {
  commit((p) => ({ ...p, colors, colorsName: colors ? name : null }))
}

export function setThemeFonts(fonts: Presentation['fonts']) {
  commit((p) => ({ ...p, fonts }))
}

/** Changes the slide size; 'fit' scales content down, 'maximize' keeps sizes and centers. */
export function setSlideSize(size: SlideSize, mode: 'fit' | 'maximize' = 'fit') {
  commit((p) => {
    const sx = size.w / p.size.w
    const sy = size.h / p.size.h
    const s = mode === 'fit' ? Math.min(sx, sy) : Math.max(sx, sy)
    const ox = (size.w - p.size.w * s) / 2
    const oy = (size.h - p.size.h * s) / 2
    const scale = (e: SlideElement): SlideElement => {
      const next = { ...e, x: e.x * s + ox, y: e.y * s + oy, w: e.w * s, h: e.h * s } as SlideElement
      if (next.type === 'group') return scaleGroup({ ...next, w: e.w, h: e.h } as GroupElement, e.w * s, e.h * s)
      if (e.type === 'table') return { ...scaleTable(e, e.w * s, e.h * s), x: next.x, y: next.y }
      if (next.type === 'ink') next.points = next.points.map(([x, y]) => [x * s, y * s])
      return next
    }
    return { ...p, size, slides: p.slides.map((sl) => ({ ...sl, elements: sl.elements.map(scale) })) }
  })
}

export function setHeaderFooter(patch: Partial<Presentation['headerFooter']>) {
  commit((p) => ({ ...p, headerFooter: { ...p.headerFooter, ...patch } }))
}

// ---------- Selection ----------

export function select(ids: string[]) {
  const s = store.get()
  if (s.editingId && !ids.includes(s.editingId)) exitEditing()
  const ts = store.get().tableSel
  store.set({ selection: ids, focus: 'canvas', tableSel: ts && ids.length === 1 && ids[0] === ts.id ? ts : null })
}

export function selectAll() {
  const slide = currentSlide()
  select(slide.elements.filter((e) => !e.hidden).map((e) => e.id))
}

export function clearSelection() {
  select([])
}

export function cycleSelection(dir: 1 | -1) {
  const slide = currentSlide()
  const ids = slide.elements.filter((e) => !e.hidden).map((e) => e.id)
  if (!ids.length) return
  const cur = store.get().selection[0]
  const i = cur ? ids.indexOf(cur) : -1
  select([ids[(i + dir + ids.length) % ids.length]])
}

// ---------- Elements ----------

export function addElements(els: SlideElement[], edit?: EditEntry) {
  const slideId = store.get().slideId
  commit((p) => updateSlide(p, slideId, (s) => ({ ...s, elements: [...s.elements, ...els] })), { selection: els.map((e) => e.id), tool: { kind: 'select' } })
  if (edit && els.length === 1) enterEditing(els[0].id, edit)
}

export function updateSelected(fn: (e: SlideElement) => SlideElement) {
  const s = store.get()
  if (!s.selection.length) return
  commit((p) => updateElements(p, s.slideId, s.selection, fn))
}

export function updateElement(id: string, fn: (e: SlideElement) => SlideElement) {
  commit((p) => updateElements(p, store.get().slideId, [id], fn))
}

export function deleteSelection() {
  const s = store.get()
  if (!s.selection.length) return
  const ids = new Set(s.selection)
  const prune = (els: SlideElement[]): SlideElement[] =>
    els.filter((e) => !ids.has(e.id)).map((e) => (e.type === 'group' ? ({ ...e, children: prune(e.children) } as GroupElement) : e)).filter((e) => e.type !== 'group' || e.children.length > 0)
  commit((p) => updateSlide(p, s.slideId, (sl) => ({ ...sl, elements: prune(sl.elements) })), { selection: [], editingId: null })
}

export function nudge(dx: number, dy: number) {
  updateSelected((e) => ({ ...e, x: e.x + dx, y: e.y + dy }))
}

export function duplicateSelection() {
  const els = topLevelSelected()
  if (!els.length) return
  const copies = els.map((e) => ({ ...cloneElement(e), x: e.x + 16, y: e.y + 16 }))
  addElements(copies)
}

function topLevelSelected(): SlideElement[] {
  const s = store.get()
  const slide = currentSlide(s)
  return slide.elements.filter((e) => s.selection.includes(e.id))
}

// ---------- Clipboard ----------

/** Copied objects or slides, with the presentation they came from (for Keep Source Formatting and Picture). */
type Clip = ({ kind: 'elements'; els: SlideElement[]; slideId: string; pastes: number } | { kind: 'slides'; slides: Slide[] }) & { source?: Presentation }
let clip: Clip | null = null

export function getClipboard() {
  return clip
}

export function copySelection() {
  const s = store.get()
  if (s.focus === 'thumbs' && !s.selection.length) {
    clip = { kind: 'slides', slides: s.pres.slides.filter((x) => s.selectedSlides.includes(x.id)).map((x) => structuredClone(x)), source: s.pres }
    return clip
  }
  const els = topLevelSelected()
  if (!els.length) return null
  clip = { kind: 'elements', els: structuredClone(els), slideId: s.slideId, pastes: 0, source: s.pres }
  return clip
}

export function cutSelection() {
  const s = store.get()
  const c = copySelection()
  if (!c) return
  if (c.kind === 'slides') deleteSlides(s.selectedSlides)
  else {
    c.pastes = -1
    deleteSelection()
  }
}

/** Paste options: Use Destination Theme (default), Keep Source Formatting, or Picture. */
export type PasteMode = 'destination' | 'keepSource' | 'picture'

/** Theme colors of the source written out as plain colors, so the copy keeps its look in another design. */
function keepSourceLook<T>(value: T, source: Presentation): T {
  const colors = presColors(source)
  return mapStrings(value, (str) => (str.startsWith('theme:') ? resolveColor(str, colors) : str))
}

export async function pasteClipboard(c: Clip | null = clip, mode: PasteMode = 'destination') {
  if (!c) return
  const s = store.get()
  if (mode === 'picture' && c.source) {
    const { elementImage } = await import('../io/slideImages')
    const src = c.source
    const items = c.kind === 'elements' ? c.els : []
    if (c.kind === 'slides') {
      const { slideImage } = await import('../io/slideImages')
      const index = src.slides.findIndex((x) => x.id === c.slides[0]?.id)
      if (index < 0) return
      const url = await new Promise<string>((resolve) => {
        slideImage(src, index, 'png', 1280).then((blob) => {
          const r = new FileReader()
          r.onload = () => resolve(String(r.result))
          r.readAsDataURL(blob)
        })
      })
      const img = createImage(url, 1280, Math.round((1280 * src.size.h) / src.size.w), s.pres.size, currentSlide(s).elements)
      addElements([img])
      return
    }
    if (!items.length) return
    const whole = items.length === 1 ? items[0] : makeGroup(items.map((e) => cloneElement(e)), uid(), 'Group')
    const url = await elementImage(src, whole)
    if (!url) return
    const b = bounds(whole)
    const img = createImage(url, Math.round(b.w * 2), Math.round(b.h * 2), s.pres.size, currentSlide(s).elements)
    addElements([{ ...img, x: b.x + 16, y: b.y + 16, w: b.w, h: b.h }])
    return
  }
  if (mode === 'keepSource' && c.source) {
    const source = c.source
    if (c.kind === 'slides') {
      const copies = c.slides.map((sl, i) => {
        const copy = keepSourceLook(cloneSlide(sl), source)
        const rc = makeRenderCtx(source, source.slides.indexOf(sl) + 1 || i + 1, sl.layout)
        return { ...copy, background: keepSourceLook(slideBackground(sl.background, rc), source) }
      })
      const index = currentIndex(s) + 1
      commit((p) => ({ ...p, slides: [...p.slides.slice(0, index), ...copies, ...p.slides.slice(index)] }), { slideId: copies[0].id, selectedSlides: copies.map((x) => x.id), selection: [] })
      return
    }
    await pasteClipboard({ ...c, els: keepSourceLook(c.els, source), source: undefined })
    c.pastes++
    return
  }
  if (c.kind === 'slides') {
    const copies = c.slides.map(cloneSlide)
    const index = currentIndex(s) + 1
    commit((p) => ({ ...p, slides: [...p.slides.slice(0, index), ...copies, ...p.slides.slice(index)] }), { slideId: copies[0].id, selectedSlides: copies.map((x) => x.id), selection: [] })
    return
  }
  c.pastes++
  const offset = c.slideId === s.slideId ? 16 * Math.max(0, c.pastes) : 0
  // A placeholder pasted where the slide already has one of its kind becomes a text box with the same look.
  const slide = currentSlide(s)
  // So does one whose kind the slide's layout does not have.
  const taken = new Set(slide.elements.flatMap((e) => (e.type === 'shape' && e.placeholder ? [phKey(e.placeholder.style, e.placeholder.idx)] : [])))
  const offered = new Set(layoutBoxes(slide.layout, s.pres.size.w, s.pres.size.h, s.pres.master).map((b) => phKey(b.style, b.idx)))
  const copies = c.els.map((e) => {
    const copy = { ...cloneElement(e), x: e.x + offset, y: e.y + offset } as SlideElement
    if (copy.type !== 'shape' || !copy.placeholder) return copy
    const key = phKey(copy.placeholder.style, copy.placeholder.idx)
    if (!taken.has(key) && offered.has(key)) {
      taken.add(key)
      return copy
    }
    return detachPlaceholder(copy, s.pres, slide)
  })
  addElements(copies)
}

const phKey = (style: string, idx: number) => (['title', 'ctrTitle', 'sectionTitle', 'captionTitle'].includes(style) ? 'title' : `${style}:${idx}`)

/** Turns a placeholder into a plain text box, writing its inherited text style into the text. */
function detachPlaceholder(el: ShapeElement, pres: Presentation, slide: Slide): ShapeElement {
  if (!el.text) return { ...el, placeholder: undefined }
  const rc = makeRenderCtx(pres, currentIndex() + 1, slide.layout)
  const ctx = textCtxFor(el, rc)
  const font = STYLE_DEFS[el.placeholder!.style].font === 'major' ? rc.fonts.major : rc.fonts.minor
  const doc = {
    ...el.text.doc,
    content: el.text.doc.content.map((p) => {
      const level = p.attrs?.level ?? 0
      const style = { type: 'textStyle' as const, attrs: { fontFamily: font, fontSize: ctx.sizes[Math.min(level, ctx.sizes.length - 1)], color: ctx.color, ...(ctx.caps ? { caps: 'all' as const } : {}) } }
      const bullet = p.attrs?.bullet ?? (ctx.bullets ? ctx.bulletChar : 'none')
      return {
        ...p,
        attrs: { ...p.attrs, align: p.attrs?.align ?? ctx.align, bullet, lineHeight: p.attrs?.lineHeight ?? ctx.lineHeight, spaceBefore: p.attrs?.spaceBefore ?? ctx.spaceBefore[Math.min(level, ctx.spaceBefore.length - 1)] ?? 0 },
        content: p.content?.map((n) => {
          const own = n.marks?.find((m) => m.type === 'textStyle')
          const merged = own ? { ...own, attrs: { ...style.attrs, ...Object.fromEntries(Object.entries(own.attrs).filter(([, v]) => v !== null && v !== undefined)) } } : style
          const marks = [...(n.marks ?? []).filter((m) => m.type !== 'textStyle'), merged, ...(ctx.bold && !n.marks?.some((m) => m.type === 'bold') ? [{ type: 'bold' as const }] : [])]
          return { ...n, marks }
        }),
      }
    }),
  }
  return { ...el, placeholder: undefined, textBox: true, name: el.name.replace(/^(Title|Subtitle|Content Placeholder|Text Placeholder)/, 'TextBox'), text: { ...el.text, doc, autofit: 'none' } }
}

export async function insertImageFile(file: File, at?: { x: number; y: number }, replaceId?: string) {
  const { src, natW, natH } = await readImageFile(file, store.get().pres.size)
  const s = store.get()
  const slide = currentSlide(s)
  const el = createImage(src, natW, natH, s.pres.size, slide.elements)
  if (replaceId) {
    const ph = findElement(slide.elements, replaceId)
    if (ph) {
      // Fill the placeholder, cropping the picture to its frame.
      const ratio = el.natW / el.natH
      const boxRatio = ph.w / ph.h
      const crop = ratio > boxRatio ? { l: (1 - boxRatio / ratio) / 2, r: (1 - boxRatio / ratio) / 2, t: 0, b: 0 } : { t: (1 - ratio / boxRatio) / 2, b: (1 - ratio / boxRatio) / 2, l: 0, r: 0 }
      const filled = { ...el, x: ph.x, y: ph.y, w: ph.w, h: ph.h, crop, placeholder: (ph as ShapeElement).placeholder }
      commit((p) => updateSlide(p, s.slideId, (sl) => ({ ...sl, elements: sl.elements.map((e) => (e.id === replaceId ? filled : e)) })), { selection: [filled.id] })
      return
    }
  }
  if (at) {
    el.x = at.x - el.w / 2
    el.y = at.y - el.h / 2
  }
  addElements([el])
}

// ---------- Arrange ----------

function reorder(fn: (els: SlideElement[], ids: Set<string>) => SlideElement[]) {
  const s = store.get()
  const ids = new Set(s.selection)
  commit((p) => updateSlide(p, s.slideId, (sl) => ({ ...sl, elements: fn(sl.elements, ids) })))
}

export function bringToFront() {
  reorder((els, ids) => [...els.filter((e) => !ids.has(e.id)), ...els.filter((e) => ids.has(e.id))])
}

export function sendToBack() {
  reorder((els, ids) => [...els.filter((e) => ids.has(e.id)), ...els.filter((e) => !ids.has(e.id))])
}

export function bringForward() {
  reorder((els, ids) => {
    const out = [...els]
    for (let i = out.length - 2; i >= 0; i--) if (ids.has(out[i].id) && !ids.has(out[i + 1].id)) [out[i], out[i + 1]] = [out[i + 1], out[i]]
    return out
  })
}

export function sendBackward() {
  reorder((els, ids) => {
    const out = [...els]
    for (let i = 1; i < out.length; i++) if (ids.has(out[i].id) && !ids.has(out[i - 1].id)) [out[i], out[i - 1]] = [out[i - 1], out[i]]
    return out
  })
}

export type AlignKind = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

export function align(kind: AlignKind, toSlide?: boolean) {
  const s = store.get()
  const els = topLevelSelected()
  if (!els.length) return
  const relSlide = toSlide ?? els.length === 1
  const ref: Box = relSlide ? { x: 0, y: 0, w: s.pres.size.w, h: s.pres.size.h } : union(els.map(bounds))
  updateSelected((e) => {
    const b = bounds(e)
    let dx = 0
    let dy = 0
    if (kind === 'left') dx = ref.x - b.x
    if (kind === 'center') dx = ref.x + ref.w / 2 - (b.x + b.w / 2)
    if (kind === 'right') dx = ref.x + ref.w - (b.x + b.w)
    if (kind === 'top') dy = ref.y - b.y
    if (kind === 'middle') dy = ref.y + ref.h / 2 - (b.y + b.h / 2)
    if (kind === 'bottom') dy = ref.y + ref.h - (b.y + b.h)
    return { ...e, x: e.x + dx, y: e.y + dy }
  })
}

export function distribute(axis: 'h' | 'v', toSlide?: boolean) {
  const s = store.get()
  const els = topLevelSelected()
  if (els.length < (toSlide ? 1 : 3) && !(toSlide && els.length >= 1)) return
  const items = els.map((e) => ({ e, b: bounds(e) })).sort((a, b) => (axis === 'h' ? a.b.x - b.b.x : a.b.y - b.b.y))
  const total = items.reduce((n, it) => n + (axis === 'h' ? it.b.w : it.b.h), 0)
  const start = toSlide ? 0 : axis === 'h' ? items[0].b.x : items[0].b.y
  const end = toSlide ? (axis === 'h' ? s.pres.size.w : s.pres.size.h) : axis === 'h' ? items[items.length - 1].b.x + items[items.length - 1].b.w : items[items.length - 1].b.y + items[items.length - 1].b.h
  const gap = (end - start - total) / Math.max(1, items.length - 1)
  const targets = new Map<string, number>()
  let pos = start
  for (const it of items) {
    targets.set(it.e.id, pos - (axis === 'h' ? it.b.x : it.b.y))
    pos += (axis === 'h' ? it.b.w : it.b.h) + gap
  }
  updateSelected((e) => {
    const d = targets.get(e.id) ?? 0
    return axis === 'h' ? { ...e, x: e.x + d } : { ...e, y: e.y + d }
  })
}

export function groupSelection() {
  const s = store.get()
  const els = topLevelSelected()
  if (els.length < 2) return
  const slide = currentSlide(s)
  const firstIdx = Math.min(...els.map((e) => slide.elements.indexOf(e)))
  const group = makeGroup(els, uid(), `Group ${slide.elements.length + 1}`)
  commit(
    (p) =>
      updateSlide(p, s.slideId, (sl) => {
        const rest = sl.elements.filter((e) => !s.selection.includes(e.id))
        const insertAt = Math.min(firstIdx, rest.length)
        return { ...sl, elements: [...rest.slice(0, insertAt), group, ...rest.slice(insertAt)] }
      }),
    { selection: [group.id] },
  )
}

export function ungroupSelection() {
  const s = store.get()
  const groups = topLevelSelected().filter((e): e is GroupElement => e.type === 'group')
  if (!groups.length) return
  const newSel: string[] = []
  commit(
    (p) =>
      updateSlide(p, s.slideId, (sl) => ({
        ...sl,
        elements: sl.elements.flatMap((e) => {
          if (e.type === 'group' && groups.some((g) => g.id === e.id)) {
            const kids = ungroup(e)
            newSel.push(...kids.map((k) => k.id))
            return kids
          }
          return [e]
        }),
      })),
    { selection: newSel },
  )
}

export function rotateSelection(delta: number) {
  updateSelected((e) => ({ ...e, rot: (((e.rot + delta) % 360) + 360) % 360 }))
}

export function flipSelection(axis: 'h' | 'v') {
  updateSelected((e) => (axis === 'h' ? { ...e, flipH: !e.flipH } : { ...e, flipV: !e.flipV }))
}

export function setSelectionSize(w: number | null, h: number | null, keepRatio: boolean) {
  updateSelected((e) => {
    let nw = w ?? e.w
    let nh = h ?? e.h
    if ((keepRatio || e.lockAspect) && e.w && e.h) {
      if (w !== null && h === null) nh = (e.h * nw) / e.w
      if (h !== null && w === null) nw = (e.w * nh) / e.h
    }
    if (e.type === 'group') return { ...scaleGroup(e, nw, nh) }
    if (e.type === 'table') return scaleTable(e, nw, nh)
    return { ...e, w: nw, h: nh }
  })
}

// ---------- Text editing ----------

let pendingEntry: EditEntry = { kind: 'end' }
let typedAhead = ''

/** Keys typed after a click but before the editor has mounted. */
export function queueTyped(text: string) {
  typedAhead += text
}

export function takeTyped() {
  const t = typedAhead
  typedAhead = ''
  return t
}

export function editEntry() {
  return pendingEntry
}

export function enterEditing(id: string, entry: EditEntry = { kind: 'end' }) {
  const slide = currentSlide()
  const el = findElement(slide.elements, id)
  if (!el || el.type !== 'shape') return
  if (!el.text) {
    // Shapes without a text body get one when the user starts typing.
    updateElement(id, (e) => ({ ...e, text: { doc: { type: 'doc', content: [{ type: 'paragraph' }] }, anchor: 'middle', autofit: 'none', wrap: true, inset: [9.6, 4.8, 9.6, 4.8] } }) as SlideElement)
  }
  pendingEntry = entry
  typedAhead = ''
  beginTransaction({ editingId: id })
  store.set({ editingId: id, selection: [id], focus: 'canvas', tool: { kind: 'select' } })
}

/** Text typed while the editor was still loading: put it into the object directly. */
function flushTypedAhead(id: string) {
  const entry = pendingEntry
  const text = (entry.kind === 'type' ? entry.text : '') + takeTyped()
  if (!text) return
  const s = store.get()
  const el = findElement(currentSlide(s).elements, id)
  if (!el || el.type !== 'shape' || !el.text) return
  const doc = el.text.doc
  const replace = entry.kind === 'type' || entry.kind === 'all' || isDocEmpty(doc)
  const paras = replace ? [{ ...doc.content[0], content: undefined }] : doc.content
  const last = paras[paras.length - 1]
  const marks = last.content?.[last.content.length - 1]?.marks
  const nextLast = { ...last, content: [...(last.content ?? []), { type: 'text' as const, text, ...(marks ? { marks } : {}) }] }
  const next = { ...doc, content: [...paras.slice(0, -1), nextLast] }
  commit((p) => updateElements(p, s.slideId, [id], (e) => (e.type === 'shape' && e.text ? { ...e, text: { ...e.text, doc: next } } : e)))
}

export function exitEditing() {
  const s = store.get()
  const id = s.editingId
  if (!id) return
  if (!getActiveEditor()) flushTypedAhead(id)
  store.set({ editingId: null, tableSel: s.tableSel ? { ...s.tableSel, editing: false } : null })
  const el = findElement(currentSlide(s).elements, id)
  if (el && el.type === 'shape' && el.textBox && !el.placeholder && isDocEmpty(el.text?.doc)) {
    commit((p) => updateSlide(p, s.slideId, (sl) => ({ ...sl, elements: sl.elements.filter((e) => e.id !== id) })), { selection: [] })
  }
  endTransaction()
}

/**
 * Ctrl+Enter: moves to the next text placeholder on the slide; after the last one it adds a new slide
 * and starts typing in its title, like the original program.
 */
export function nextPlaceholder() {
  const s = store.get()
  const slide = currentSlide(s)
  const current = s.editingId ?? s.selection[0] ?? null
  const phs = slide.elements.filter((e): e is ShapeElement => e.type === 'shape' && !!e.placeholder && !!e.text && e.placeholder.style !== 'pic')
  const at = phs.findIndex((e) => e.id === current)
  const next = phs[at + 1]
  exitEditing()
  if (next) {
    enterEditing(next.id, { kind: 'all' })
    return
  }
  if (isMasterId(s.slideId)) return
  newSlide()
  const fresh = currentSlide()
  const first = fresh.elements.find((e): e is ShapeElement => e.type === 'shape' && !!e.placeholder && !!e.text)
  if (first) enterEditing(first.id, { kind: 'all' })
}

export function selectedTextShapes(): ShapeElement[] {
  const out: ShapeElement[] = []
  const walk = (els: SlideElement[]) => {
    for (const e of els) {
      if (e.type === 'group') walk(e.children)
      else if (e.type === 'shape' && e.text) out.push(e)
    }
  }
  walk(selectedElements())
  return out
}

// ---------- Tables ----------

export function insertTable(rows: number, cols: number, box?: { x: number; y: number; w: number }) {
  const s = store.get()
  const slide = currentSlide(s)
  const w = box?.w ?? Math.min(s.pres.size.w * 0.86, cols * 160)
  const t = createTable(rows, cols, { x: box?.x ?? (s.pres.size.w - w) / 2, y: box?.y ?? s.pres.size.h * 0.28, w }, uid(), `Table ${slide.elements.length + 1}`)
  // A table inserted into an empty content placeholder takes its place.
  const ph = !box && slide.elements.find((e) => e.type === 'shape' && e.placeholder && (e.placeholder.style === 'body' || e.placeholder.style === 'captionBody') && isDocEmpty(e.text?.doc) && s.selection.includes(e.id))
  if (ph) {
    t.x = ph.x
    t.y = ph.y
    t.cols = t.cols.map(() => ph.w / cols)
    t.w = ph.w
    commit((p) => updateSlide(p, s.slideId, (sl) => ({ ...sl, elements: sl.elements.map((e) => (e.id === ph.id ? t : e)) })), { selection: [t.id], tool: { kind: 'select' } })
  } else addElements([t])
  store.set({ tab: 'tableDesign' })
  enterCellEditing(t.id, 0, 0, { kind: 'end' })
}

/** The single selected table and the cells the next command applies to (all cells without a cell selection). */
export function currentTable(): { t: TableElement; range: CellRange; hasCellSel: boolean } | null {
  const s = store.get()
  const sel = selectedElements(s)
  if (sel.length !== 1 || sel[0].type !== 'table') return null
  const t = sel[0]
  const ts = s.tableSel
  if (ts && ts.id === t.id) return { t, range: expandRange(t, normRange(ts.anchor, ts.focus)), hasCellSel: true }
  return { t, range: fullRange(t), hasCellSel: false }
}

/** Updates the selected table; returning null deletes it. */
export function updateTable(fn: (t: TableElement, range: CellRange) => TableElement | null, extra: Partial<ReturnType<typeof store.get>> = {}) {
  const cur = currentTable()
  if (!cur) return
  const next = fn(cur.t, cur.range)
  const sid = store.get().slideId
  if (next === null) {
    commit((p) => updateSlide(p, sid, (sl) => ({ ...sl, elements: sl.elements.filter((e) => e.id !== cur.t.id) })), { selection: [], editingId: null, tableSel: null, ...extra })
    return
  }
  if (next === cur.t) return
  commit((p) => updateElements(p, sid, [cur.t.id], () => next), extra)
}

export function selectCells(id: string, anchor: { r: number; c: number }, focus: { r: number; c: number } = anchor) {
  const s = store.get()
  if (s.editingId) exitEditing()
  store.set({ selection: [id], tableSel: { id, anchor, focus, editing: false }, focus: 'canvas' })
}

export function enterCellEditing(id: string, r: number, c: number, entry: EditEntry = { kind: 'end' }) {
  const s = store.get()
  const t = findElement(currentSlide(s).elements, id)
  if (!t || t.type !== 'table') return
  if (s.editingId && s.editingId !== id) exitEditing()
  const o = originOf(t, r, c)
  pendingEntry = entry
  typedAhead = ''
  if (store.get().editingId !== id) beginTransaction({ editingId: id })
  store.set({ editingId: id, selection: [id], tableSel: { id, anchor: o, focus: o, editing: true }, focus: 'canvas', tool: { kind: 'select' } })
}

/** Tab / Shift+Tab inside a table: next or previous cell; Tab in the last cell adds a row. */
export function moveCell(dir: 1 | -1) {
  const s = store.get()
  const ts = s.tableSel
  if (!ts) return
  const t = findElement(currentSlide(s).elements, ts.id)
  if (!t || t.type !== 'table') return
  let next = nextCell(t, ts.anchor.r, ts.anchor.c, dir)
  if (!next && dir === 1) {
    const grown = insertRow(t, t.rows.length, t.rows.length - 1)
    commit((p) => updateElements(p, s.slideId, [t.id], () => grown))
    next = { r: t.rows.length, c: 0 }
  }
  if (!next) return
  store.set({ editingId: null })
  endTransaction()
  enterCellEditing(t.id, next.r, next.c, { kind: 'all' })
}

// ---------- Charts ----------

/** Inserts a chart; an empty selected content placeholder is replaced, as in the original. */
export function insertChart(type: ChartType, grouping: ChartGrouping) {
  const s = store.get()
  const slide = currentSlide(s)
  const w = s.pres.size.w * 0.6
  const h = s.pres.size.h * 0.6
  const ph = slide.elements.find((e) => e.type === 'shape' && e.placeholder && (e.placeholder.style === 'body' || e.placeholder.style === 'captionBody') && isDocEmpty(e.text?.doc) && s.selection.includes(e.id))
  const box = ph ? { x: ph.x, y: ph.y, w: ph.w, h: ph.h } : { x: (s.pres.size.w - w) / 2, y: (s.pres.size.h - h) / 2 + 20, w, h }
  const chart = createChart(type, grouping, box, uid(), `Chart ${slide.elements.length + 1}`)
  if (ph) commit((p) => updateSlide(p, s.slideId, (sl) => ({ ...sl, elements: sl.elements.map((e) => (e.id === ph.id ? chart : e)) })), { selection: [chart.id], tool: { kind: 'select' } })
  else addElements([chart])
  store.set({ tab: 'chartDesign' })
  return chart
}

export function currentChart(): ChartElement | null {
  const sel = selectedElements()
  return sel.length === 1 && sel[0].type === 'chart' ? sel[0] : null
}

export function updateChart(fn: (c: ChartElement) => ChartElement) {
  const c = currentChart()
  if (!c) return
  updateElement(c.id, (e) => (e.type === 'chart' ? fn(e) : e))
}

// ---------- Diagrams ----------

export function insertDiagram(layout: DiagramLayout) {
  const s = store.get()
  const slide = currentSlide(s)
  const ph = slide.elements.find((e) => e.type === 'shape' && e.placeholder && (e.placeholder.style === 'body' || e.placeholder.style === 'captionBody') && isDocEmpty(e.text?.doc) && s.selection.includes(e.id))
  const w = s.pres.size.w * 0.62
  const h = s.pres.size.h * 0.6
  const box = ph ? { x: ph.x, y: ph.y, w: ph.w, h: ph.h } : { x: (s.pres.size.w - w) / 2, y: (s.pres.size.h - h) / 2 + 30, w, h }
  const d = createDiagram(layout, box, uid(), `Diagram ${slide.elements.length + 1}`)
  if (ph) commit((p) => updateSlide(p, s.slideId, (sl) => ({ ...sl, elements: sl.elements.map((e) => (e.id === ph.id ? d : e)) })), { selection: [d.id], tool: { kind: 'select' } })
  else addElements([d])
  store.set({ tab: 'diagramDesign', diagramPane: true })
  return d
}

export function currentDiagram(): DiagramElement | null {
  const sel = selectedElements()
  return sel.length === 1 && sel[0].type === 'diagram' ? sel[0] : null
}

export function updateDiagram(fn: (d: DiagramElement) => DiagramElement) {
  const d = currentDiagram()
  if (!d) return
  updateElement(d.id, (e) => (e.type === 'diagram' ? fn(e) : e))
}

// ---------- Video and audio ----------

function readDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

/** Captures a still of a video at `time` seconds (used for the poster frame). */
export function captureFrame(src: string, time = 0.5): Promise<{ poster: string | null; w: number; h: number; duration: number }> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.muted = true
    v.preload = 'auto'
    v.src = src
    const done = (poster: string | null) => resolve({ poster, w: v.videoWidth || 1280, h: v.videoHeight || 720, duration: Number.isFinite(v.duration) ? v.duration : 0 })
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(time, Math.max(0, (v.duration || 1) - 0.1))
    }
    v.onseeked = () => {
      try {
        const c = document.createElement('canvas')
        c.width = v.videoWidth || 640
        c.height = v.videoHeight || 360
        c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
        done(c.toDataURL('image/jpeg', 0.85))
      } catch {
        done(null)
      }
    }
    v.onerror = () => done(null)
    setTimeout(() => done(null), 8000)
  })
}

function audioDuration(src: string): Promise<number> {
  return new Promise((resolve) => {
    const a = document.createElement('audio')
    a.preload = 'metadata'
    a.src = src
    a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : 0)
    a.onerror = () => resolve(0)
    setTimeout(() => resolve(0), 5000)
  })
}

export async function insertMediaFile(file: File, replaceId?: string) {
  const src = await readDataUrl(file)
  const kind: MediaElement['kind'] = file.type.startsWith('audio') ? 'audio' : 'video'
  const s = store.get()
  const slide = currentSlide(s)
  let el: MediaElement
  if (kind === 'video') {
    const { poster, w, h, duration } = await captureFrame(src)
    const scale = Math.min((s.pres.size.w * 0.6) / w, (s.pres.size.h * 0.6) / h)
    el = { id: uid(), type: 'media', name: `Video ${slide.elements.length + 1}`, kind, src, mime: file.type || 'video/mp4', poster, x: (s.pres.size.w - w * scale) / 2, y: (s.pres.size.h - h * scale) / 2, w: w * scale, h: h * scale, rot: 0, duration, volume: 1 }
  } else {
    const duration = await audioDuration(src)
    el = { id: uid(), type: 'media', name: `Audio ${slide.elements.length + 1}`, kind, src, mime: file.type || 'audio/mpeg', x: (s.pres.size.w - 48) / 2, y: (s.pres.size.h - 48) / 2, w: 48, h: 48, rot: 0, duration, volume: 1 }
  }
  const ph = replaceId ? findElement(slide.elements, replaceId) : undefined
  if (ph && kind === 'video') {
    const scale = Math.min(ph.w / el.w, ph.h / el.h)
    el = { ...el, w: el.w * scale, h: el.h * scale, x: ph.x + (ph.w - el.w * scale) / 2, y: ph.y + (ph.h - el.h * scale) / 2 }
    commit((p) => updateSlide(p, s.slideId, (sl) => ({ ...sl, elements: sl.elements.map((e) => (e.id === ph.id ? el : e)) })), { selection: [el.id] })
  } else addElements([el])
  store.set({ tab: 'playback' })
}

export function currentMedia(): MediaElement | null {
  const sel = selectedElements()
  return sel.length === 1 && sel[0].type === 'media' ? sel[0] : null
}

export function updateMedia(patch: Partial<MediaElement>) {
  const m = currentMedia()
  if (m) updateElement(m.id, (e) => (e.type === 'media' ? { ...e, ...patch } : e))
}

// ---------- Zoom ----------

function zoomEl(targetId: string, kind: ZoomElement['kind'], box: { x: number; y: number; w: number; h: number }, n: number): ZoomElement {
  return { id: uid(), type: 'zoom', name: `${kind === 'section' ? 'Section' : 'Slide'} Zoom ${n}`, targetId, kind, ...box, rot: 0, line: { color: 'theme:tx1:l50', width: 0.75, dash: 'solid' } }
}

export function insertZoom(targetIds: string[], kind: ZoomElement['kind']) {
  const s = store.get()
  const slide = currentSlide(s)
  const w = s.pres.size.w * 0.24
  const h = (w * s.pres.size.h) / s.pres.size.w
  const els = targetIds.map((id, i) => zoomEl(id, kind, { x: s.pres.size.w * 0.1 + (i % 3) * (w + 24), y: s.pres.size.h * 0.3 + Math.floor(i / 3) * (h + 24), w, h }, slide.elements.length + i + 1))
  addElements(els)
}

/** Summary Zoom: a new slide with a zoom for the first slide of every section (or the chosen slides). */
export function insertSummaryZoom(targetIds?: string[]) {
  const s = store.get()
  const sections = s.pres.slides.filter((x) => x.section).map((x) => x.id)
  const ids = (targetIds?.length ? targetIds : sections.length ? sections : s.pres.slides.slice(0, 6).map((x) => x.id)).slice(0, 12)
  const slide = createSlide('titleOnly', s.pres.size)
  const title = slide.elements[0]
  if (title?.type === 'shape' && title.text) title.text = { ...title.text, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t('Summary') }] }] } }
  const cols = Math.min(3, ids.length)
  const w = Math.min(s.pres.size.w * 0.26, (s.pres.size.w * 0.84 - (cols - 1) * 24) / cols)
  const h = (w * s.pres.size.h) / s.pres.size.w
  const left = (s.pres.size.w - (cols * w + (cols - 1) * 24)) / 2
  slide.elements.push(...ids.map((id, i) => zoomEl(id, 'summary', { x: left + (i % cols) * (w + 24), y: s.pres.size.h * 0.3 + Math.floor(i / cols) * (h + 24), w, h }, i + 1)))
  const index = s.pres.slides.findIndex((x) => x.id === ids[0])
  commit((p) => ({ ...p, slides: [...p.slides.slice(0, Math.max(0, index)), slide, ...p.slides.slice(Math.max(0, index))] }), { slideId: slide.id, selectedSlides: [slide.id], selection: [] })
}

// ---------- Free-form shapes and Edit Points ----------

const CONNECTORS = new Set(['bentConnector3', 'curvedConnector3', 'straightConnector1'])

export function canEditPoints(el: SlideElement | undefined): el is ShapeElement {
  return !!el && el.type === 'shape' && !CONNECTORS.has(el.prst) && !DRAW_TOOLS.has(el.prst)
}

/**
 * A free-form shape from points in slide coordinates. Freeform draws straight segments; Curve and Scribble
 * (smooth) run a smooth curve through the points.
 */
export function addFreeform(points: [number, number][], closed: boolean, smooth = false, clicked = false) {
  const unique = points.filter((p, i) => i === 0 || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 0.5)
  const pts = unique.length > 2 && !clicked ? simplify(unique, smooth ? 1.6 : 0.8) : unique
  if (pts.length < 2) return
  const outline: Outline = { rings: [pts], handles: [smooth ? smoothThrough(pts, closed) : pts.map(() => null)] }
  const b = outlineBounds(outline, !closed)
  if (!b) return
  const slide = currentSlide()
  const base: ShapeElement = {
    id: uid(),
    type: 'shape',
    name: `Freeform ${slide.elements.length + 1}`,
    prst: 'custom',
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    rot: 0,
    fill: closed ? defaultFill() : { type: 'none' },
    line: defaultLine(),
    rings: [],
    open: !closed || undefined,
  }
  addElements([withRings(base, outline)])
  store.set({ tool: { kind: 'select' } })
}

/** Converts a preset shape into a free-form outline (curves kept) so its points can be edited. */
function toFreeform(el: ShapeElement): ShapeElement {
  if (el.prst === 'custom' && el.rings) return el
  const parts = geometry(el.prst, el.w, el.h, el.adj).paths.map((p) => pathToOutline(p.d))
  const outline: Outline = { rings: parts.flatMap((p) => p.outline.rings), handles: parts.flatMap((p) => p.outline.handles) }
  if (!outline.rings.length) return el
  const open = parts.every((p) => p.closed.every((c) => !c))
  return { ...el, prst: 'custom', adj: undefined, ...store2(el, outline), ringsBox: { w: el.w, h: el.h }, open: open || undefined }
}

export function startEditPoints(id: string) {
  const el = findElement(currentSlide().elements, id)
  if (!canEditPoints(el)) return
  if (store.get().editingId) exitEditing()
  const next = toFreeform(el)
  if (next !== el) commit((p) => updateElements(p, store.get().slideId, [id], () => next), { selection: [id] })
  store.set({ editPointsId: id, selection: [id] })
}

export function exitEditPoints() {
  if (store.get().editPointsId) store.set({ editPointsId: null })
}

/** Outline scaled to the shape's current size (Edit Points works in shape pixels). */
function scaledOutline(el: ShapeElement): Outline {
  const sx = el.ringsBox?.w ? el.w / el.ringsBox.w : 1
  const sy = el.ringsBox?.h ? el.h / el.ringsBox.h : 1
  const rings = el.rings ?? []
  return scaleOutline({ rings, handles: normHandles(rings, el.handles) }, sx, sy)
}

const round2 = (o: Outline): Outline => {
  const r = (p: [number, number]): [number, number] => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]
  return { rings: o.rings.map((x) => x.map(r)), handles: o.handles.map((x) => x.map((h) => (h ? { ...h, i: h.i && r(h.i), o: h.o && r(h.o) } : null))) }
}

function store2(el: ShapeElement, o: Outline): Pick<ShapeElement, 'rings' | 'handles'> {
  const q = round2(o)
  return { rings: q.rings, handles: hasCurves(q.handles) || q.handles.some((r) => r.some((h) => h?.t)) ? q.handles : undefined }
}

/** Replaces the outline (in shape pixels) and fits the shape's box around it, keeping the outline in place. */
export function withRings(el: ShapeElement, outline: Outline | [number, number][][]): ShapeElement {
  const o: Outline = Array.isArray(outline) ? { rings: outline, handles: emptyHandles(outline) } : outline
  const b = outlineBounds(o, !!el.open)
  if (!b) return el
  if (el.rot) return { ...el, ...store2(el, o), ringsBox: { w: el.w, h: el.h } }
  const w = Math.max(1, b.w)
  const h = Math.max(1, b.h)
  // With flips, the outline is mirrored inside the box, so the box moves the other way.
  const x = el.flipH ? el.x + (el.w - (b.x + w)) : el.x + b.x
  const y = el.flipV ? el.y + (el.h - (b.y + h)) : el.y + b.y
  return { ...el, x, y, w, h, ...store2(el, translateOutline(o, -b.x, -b.y)), ringsBox: { w, h } }
}

export function updateRings(id: string, fn: (outline: Outline) => Outline, fit = true) {
  const sid = store.get().slideId
  commit((p) =>
    updateElements(p, sid, [id], (e) => {
      if (e.type !== 'shape' || !e.rings) return e
      const o = fn(scaledOutline(e))
      return fit ? withRings(e, o) : { ...e, ...store2(e, o), ringsBox: { w: e.w, h: e.h } }
    }),
  )
}

export function deleteVertex(id: string, ring: number, index: number) {
  const el = findElement(currentSlide().elements, id)
  if (!el || el.type !== 'shape' || !el.rings) return
  const min = el.open ? 2 : 3
  if ((el.rings[ring]?.length ?? 0) <= min) return
  updateRings(id, (o) => deletePoint(o, ring, index))
}

/** Adds a point on segment `seg` at curve parameter t (curves are split without changing their shape). */
export function insertVertex(id: string, ring: number, seg: number, t: number) {
  const el = findElement(currentSlide().elements, id)
  if (!el || el.type !== 'shape') return
  updateRings(id, (o) => splitSegment(o, ring, seg, t, !!el.open))
}

export function setVertexType(id: string, ring: number, index: number, type: PointType) {
  const el = findElement(currentSlide().elements, id)
  if (!el || el.type !== 'shape') return
  updateRings(id, (o) => setPointType(o, ring, index, type, !!el.open))
}

export function setSegmentType(id: string, ring: number, seg: number, curved: boolean) {
  updateRings(id, (o) => setSegmentCurved(o, ring, seg, curved))
}

/** Opens a closed outline at a point or closes an open one (vertex context menu). */
export function togglePathOpen(id: string) {
  const sid = store.get().slideId
  commit((p) => updateElements(p, sid, [id], (e) => (e.type === 'shape' && e.rings ? { ...e, open: !e.open || undefined, fill: e.open && e.fill.type === 'none' ? defaultFill() : e.fill } : e)))
}

// ---------- Reuse Slides and Photo Album ----------

/** Scales an object from one slide size to another. */
function scaleToSize(el: SlideElement, sx: number, sy: number): SlideElement {
  const box = { x: el.x * sx, y: el.y * sy, w: el.w * sx, h: el.h * sy }
  if (el.type === 'group') return { ...scaleGroup(el, box.w, box.h), x: box.x, y: box.y }
  if (el.type === 'table') return { ...scaleTable(el, box.w, box.h), x: box.x, y: box.y }
  if (el.type === 'ink') return { ...el, ...box, points: el.points.map(([x, y]) => [x * sx, y * sy] as [number, number]) }
  return { ...el, ...box } as SlideElement
}

/** Inserts slides of another presentation after the current slide (they take this presentation's theme). */
export function insertSlidesFrom(src: Presentation, indices: number[]) {
  const s = store.get()
  const sx = s.pres.size.w / src.size.w
  const sy = s.pres.size.h / src.size.h
  const copies = indices
    .map((i) => src.slides[i])
    .filter(Boolean)
    .map((sl) => {
      const c = cloneSlide(sl)
      return sx === 1 && sy === 1 ? c : { ...c, elements: c.elements.map((e) => scaleToSize(e, sx, sy)) }
    })
  if (!copies.length) return
  const index = currentIndex(s) + 1
  commit((p) => ({ ...p, slides: [...p.slides.slice(0, index), ...copies, ...p.slides.slice(index)] }), { slideId: copies[copies.length - 1].id, selectedSlides: copies.map((c) => c.id), selection: [] })
}

export type AlbumOptions = { perSlide: 0 | 1 | 2 | 4; titles: boolean; captions: boolean; grayscale: boolean; frame: 'none' | 'rect' | 'rounded' | 'white' | 'shadow' | 'soft' }

/** Photo Album: a title slide and the pictures laid out on new slides after the current one. */
export async function createPhotoAlbum(files: File[], o: AlbumOptions) {
  const s = store.get()
  const size = s.pres.size
  const pics = await Promise.all(files.map(async (f) => ({ name: f.name.replace(/\.[^.]+$/, ''), ...(await readImageFile(f, size)) })))
  const slides: Slide[] = []
  const title = createSlide('title', size)
  const [head, sub] = title.elements
  if (head?.type === 'shape' && head.text) head.text = { ...head.text, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t('Photo Album') }] }] } }
  if (sub?.type === 'shape' && sub.text) sub.text = { ...sub.text, doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t('by {name}', { name: s.pres.author || APP_NAME }) }] }] } }
  slides.push(title)
  const per = o.perSlide || 1
  const frameOf = (img: ImageElement): ImageElement => {
    switch (o.frame) {
      case 'rect':
        return { ...img, line: { color: '#000000', width: 1, dash: 'solid' } }
      case 'rounded':
        return { ...img, mask: 'roundRect' }
      case 'white':
        return { ...img, line: { color: '#FFFFFF', width: 6, dash: 'solid' }, effects: { shadow: { color: '#000000', alpha: 0.35, blur: 6, dist: 3, angle: 45 } } }
      case 'shadow':
        return { ...img, effects: { shadow: { color: '#000000', alpha: 0.45, blur: 10, dist: 6, angle: 45 } } }
      case 'soft':
        return { ...img, effects: { softEdge: 6 } }
      default:
        return img
    }
  }
  for (let i = 0; i < pics.length; i += per) {
    const group = pics.slice(i, i + per)
    const slide = createSlide(o.titles && o.perSlide ? 'titleOnly' : 'blank', size)
    const top = o.titles && o.perSlide ? size.h * 0.26 : 0
    const area = o.perSlide === 0 ? { x: 0, y: 0, w: size.w, h: size.h } : { x: size.w * 0.06, y: top + size.h * 0.05, w: size.w * 0.88, h: size.h - top - size.h * 0.1 }
    const cols = per === 4 ? 2 : per
    const rows = per === 4 ? 2 : 1
    const gap = per > 1 ? 24 : 0
    const capH = o.captions ? 30 : 0
    group.forEach((pic, k) => {
      const cw = (area.w - gap * (cols - 1)) / cols
      const ch = (area.h - gap * (rows - 1)) / rows - capH
      const ratio = pic.natW / pic.natH
      const w = Math.min(cw, ch * ratio)
      const h = w / ratio
      const cx = area.x + (k % cols) * (cw + gap) + (cw - w) / 2
      const cy = area.y + Math.floor(k / cols) * (ch + capH + gap) + (ch - h) / 2
      let img = createImage(pic.src, pic.natW, pic.natH, size, slide.elements)
      img = frameOf({ ...img, x: cx, y: cy, w, h, name: pic.name, alt: pic.name, ...(o.grayscale ? { adjust: { grayscale: true } } : {}) })
      slide.elements.push(img)
      if (o.captions) {
        const cap = createTextBox({ x: cx, y: cy + h + 4, w, h: 26 }, slide.elements, true)
        cap.text = { ...cap.text!, doc: { type: 'doc', content: [{ type: 'paragraph', attrs: { align: 'center' }, content: [{ type: 'text', text: pic.name, marks: [{ type: 'textStyle', attrs: { fontSize: 14 } }] }] }] } }
        slide.elements.push(cap)
      }
    })
    slides.push(slide)
  }
  const index = currentIndex(s) + 1
  commit((p) => ({ ...p, slides: [...p.slides.slice(0, index), ...slides, ...p.slides.slice(index)] }), { slideId: slides[0].id, selectedSlides: [slides[0].id], selection: [] })
}

// ---------- Set Transparent Color ----------

/** Makes every pixel close to the color at (fx, fy) — fractions of the visible picture — transparent. */
export async function setTransparentColor(id: string, fx: number, fy: number, tolerance = 32) {
  const el = findElement(currentSlide().elements, id)
  if (!el || el.type !== 'image') return
  const img = new Image()
  // onload rather than decode(): decode() can stall while the page is in the background.
  await new Promise<void>((resolve) => {
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = el.src
  })
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (!w || !h) return
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  ctx.drawImage(img, 0, 0)
  const c = el.crop ?? { l: 0, t: 0, r: 0, b: 0 }
  const px = Math.max(0, Math.min(w - 1, Math.floor((c.l + fx * (1 - c.l - c.r)) * w)))
  const py = Math.max(0, Math.min(h - 1, Math.floor((c.t + fy * (1 - c.t - c.b)) * h)))
  const data = ctx.getImageData(0, 0, w, h)
  const d = data.data
  const k = (py * w + px) * 4
  const [r, g, b] = [d[k], d[k + 1], d[k + 2]]
  for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - r) <= tolerance && Math.abs(d[i + 1] - g) <= tolerance && Math.abs(d[i + 2] - b) <= tolerance) d[i + 3] = 0
  ctx.putImageData(data, 0, 0)
  const src = canvas.toDataURL('image/png')
  const sid = store.get().slideId
  commit((p) => updateElements(p, sid, [id], (e) => (e.type === 'image' ? { ...e, src } : e)))
}

// ---------- Picture Layout and Remove Background ----------

/** Turns the selected pictures into a captioned picture layout (one group). */
export function applyPictureLayout(layout: PictureLayoutId, caption: string) {
  const s = store.get()
  const pics = topLevelSelected().filter((e): e is ImageElement => e.type === 'image')
  if (!pics.length) return
  const slide = currentSlide(s)
  const group = pictureLayout(pics, layout, layoutArea(pics, s.pres.size), caption)
  const ids = new Set(pics.map((p) => p.id))
  const firstIdx = Math.min(...pics.map((e) => slide.elements.indexOf(e)))
  commit(
    (p) =>
      updateSlide(p, s.slideId, (sl) => {
        const rest = sl.elements.filter((e) => !ids.has(e.id))
        const at = Math.min(firstIdx, rest.length)
        return { ...sl, elements: [...rest.slice(0, at), group, ...rest.slice(at)] }
      }),
    { selection: [group.id] },
  )
}

/** Replaces a picture's image (Remove Background keeps its size, crop and formatting). */
export function replacePictureSource(id: string, src: string) {
  const sid = store.get().slideId
  commit((p) => updateElements(p, sid, [id], (e) => (e.type === 'image' ? { ...e, src } : e)))
}

/** Home > New Slide > Slides from Outline: slides for every top-level line of a text outline. */
export function insertSlidesFromOutline(text: string) {
  const s = store.get()
  const slides = slidesFromOutline(text, s.pres.size)
  if (!slides.length) return
  const index = currentIndex(s) + 1
  commit((p) => ({ ...p, slides: [...p.slides.slice(0, index), ...slides, ...p.slides.slice(index)] }), { slideId: slides[0].id, selectedSlides: slides.map((x) => x.id), selection: [] })
}

/** Insert > Equation: a text box with the equation, centered on the slide. */
export function insertEquation(src: string) {
  const s = store.get()
  const size = s.pres.size
  const tb = createTextBox({ x: size.w / 2 - 240, y: size.h / 2 - 40, w: 480, h: 80 }, currentSlide(s).elements)
  const el: ShapeElement = { ...tb, name: 'Equation', alt: equationText(src), text: { ...tb.text!, doc: equationDoc(src), autofit: 'resize', anchor: 'middle' } }
  addElements([el])
}

/** Design > Variants > Effects. */
export function setEffectScheme(id: string | null) {
  commit((p) => ({ ...p, effectScheme: id && id !== 'none' ? id : null }))
}
