import type { AnimEntry, Slide, SlideElement, TransitionName } from './types'
import { tx } from '../i18n'

export type EffectOption = { id: string; label: string }

const DIRS: EffectOption[] = [
  { id: 'fromRight', label: tx('From Right') },
  { id: 'fromLeft', label: tx('From Left') },
  { id: 'fromTop', label: tx('From Top') },
  { id: 'fromBottom', label: tx('From Bottom') },
]

export const TRANSITIONS: { name: TransitionName; label: string; options?: EffectOption[] }[] = [
  { name: 'none', label: tx('None') },
  { name: 'cut', label: tx('Cut') },
  { name: 'fade', label: tx('Fade'), options: [{ id: 'smooth', label: tx('Smoothly') }, { id: 'black', label: tx('Through Black') }] },
  { name: 'push', label: tx('Push'), options: [DIRS[3], DIRS[1], DIRS[0], DIRS[2]] },
  { name: 'wipe', label: tx('Wipe'), options: DIRS },
  { name: 'split', label: tx('Split'), options: [{ id: 'verticalOut', label: tx('Vertical Out') }, { id: 'verticalIn', label: tx('Vertical In') }, { id: 'horizontalOut', label: tx('Horizontal Out') }, { id: 'horizontalIn', label: tx('Horizontal In') }] },
  { name: 'reveal', label: tx('Reveal'), options: [DIRS[0], DIRS[1]] },
  { name: 'cover', label: tx('Cover'), options: DIRS },
  { name: 'randomBars', label: tx('Random Bars'), options: [{ id: 'vertical', label: tx('Vertical') }, { id: 'horizontal', label: tx('Horizontal') }] },
  { name: 'shape', label: tx('Shape'), options: [{ id: 'circle', label: tx('Circle') }, { id: 'diamond', label: tx('Diamond') }, { id: 'plus', label: tx('Plus') }] },
  { name: 'zoom', label: tx('Zoom'), options: [{ id: 'in', label: tx('In') }, { id: 'out', label: tx('Out') }] },
  { name: 'dissolve', label: tx('Dissolve') },
  { name: 'blinds', label: tx('Blinds'), options: [{ id: 'vertical', label: tx('Vertical') }, { id: 'horizontal', label: tx('Horizontal') }] },
  { name: 'checker', label: tx('Checkerboard'), options: [{ id: 'fromLeft', label: tx('From Left') }, { id: 'fromTop', label: tx('From Top') }] },
  { name: 'morph', label: tx('Morph') },
  { name: 'uncover', label: tx('Uncover'), options: [DIRS[1], DIRS[0], DIRS[3], DIRS[2]] },
  { name: 'flash', label: tx('Flash') },
  { name: 'clock', label: tx('Clock') },
  { name: 'wedge', label: tx('Wedge') },
  { name: 'strips', label: tx('Strips'), options: [{ id: 'rightDown', label: tx('Right-Down') }, { id: 'leftDown', label: tx('Left-Down') }] },
  { name: 'newsflash', label: tx('Newsflash') },
  { name: 'flip', label: tx('Flip'), options: [{ id: 'right', label: tx('Right') }, { id: 'left', label: tx('Left') }] },
  { name: 'cube', label: tx('Cube'), options: [{ id: 'fromRight', label: tx('From Right') }, { id: 'fromLeft', label: tx('From Left') }] },
  { name: 'fallOver', label: tx('Fall Over') },
  { name: 'curtains', label: tx('Curtains') },
  { name: 'gallery', label: tx('Gallery'), options: [{ id: 'fromRight', label: tx('From Right') }, { id: 'fromLeft', label: tx('From Left') }] },
  { name: 'vortex', label: tx('Vortex') },
]

export function transitionDef(name: TransitionName) {
  return TRANSITIONS.find((t) => t.name === name) ?? TRANSITIONS[0]
}

export type AnimationDef = { name: string; label: string; effect: AnimEntry['effect']; directional?: boolean }

export const ANIMATIONS: AnimationDef[] = [
  { name: 'appear', label: tx('Appear'), effect: 'entrance' },
  { name: 'fade', label: tx('Fade'), effect: 'entrance' },
  { name: 'flyIn', label: tx('Fly In'), effect: 'entrance', directional: true },
  { name: 'floatIn', label: tx('Float In'), effect: 'entrance', directional: true },
  { name: 'split', label: tx('Split'), effect: 'entrance' },
  { name: 'wipe', label: tx('Wipe'), effect: 'entrance', directional: true },
  { name: 'shape', label: tx('Shape'), effect: 'entrance' },
  { name: 'wheel', label: tx('Wheel'), effect: 'entrance' },
  { name: 'randomBars', label: tx('Random Bars'), effect: 'entrance' },
  { name: 'grow', label: tx('Grow & Turn'), effect: 'entrance' },
  { name: 'zoom', label: tx('Zoom'), effect: 'entrance' },
  { name: 'swivel', label: tx('Swivel'), effect: 'entrance' },
  { name: 'bounce', label: tx('Bounce'), effect: 'entrance' },
  { name: 'pulse', label: tx('Pulse'), effect: 'emphasis' },
  { name: 'colorPulse', label: tx('Color Pulse'), effect: 'emphasis' },
  { name: 'teeter', label: tx('Teeter'), effect: 'emphasis' },
  { name: 'spin', label: tx('Spin'), effect: 'emphasis' },
  { name: 'growShrink', label: tx('Grow/Shrink'), effect: 'emphasis' },
  { name: 'desaturate', label: tx('Desaturate'), effect: 'emphasis' },
  { name: 'darken', label: tx('Darken'), effect: 'emphasis' },
  { name: 'lighten', label: tx('Lighten'), effect: 'emphasis' },
  { name: 'transparency', label: tx('Transparency'), effect: 'emphasis' },
  { name: 'flash', label: tx('Blink'), effect: 'emphasis' },
  { name: 'wave', label: tx('Wave'), effect: 'emphasis' },
  { name: 'disappear', label: tx('Disappear'), effect: 'exit' },
  { name: 'fadeOut', label: tx('Fade'), effect: 'exit' },
  { name: 'flyOut', label: tx('Fly Out'), effect: 'exit', directional: true },
  { name: 'floatOut', label: tx('Float Out'), effect: 'exit', directional: true },
  { name: 'splitOut', label: tx('Split'), effect: 'exit' },
  { name: 'wipeOut', label: tx('Wipe'), effect: 'exit', directional: true },
  { name: 'shapeOut', label: tx('Shape'), effect: 'exit' },
  { name: 'randomBarsOut', label: tx('Random Bars'), effect: 'exit' },
  { name: 'shrinkTurn', label: tx('Shrink & Turn'), effect: 'exit' },
  { name: 'zoomOut', label: tx('Zoom'), effect: 'exit' },
  { name: 'swivelOut', label: tx('Swivel'), effect: 'exit' },
  { name: 'bounceOut', label: tx('Bounce'), effect: 'exit' },
  { name: 'lineDown', label: tx('Lines'), effect: 'path' },
  { name: 'arcDown', label: tx('Arcs'), effect: 'path' },
  { name: 'turnDown', label: tx('Turns'), effect: 'path' },
  { name: 'circle', label: tx('Shapes'), effect: 'path' },
  { name: 'loop', label: tx('Loops'), effect: 'path' },
  { name: 'custom', label: tx('Custom Path'), effect: 'path' },
]

export function animationDef(name: string) {
  return ANIMATIONS.find((a) => a.name === name)
}

/** Motion path presets in px, starting at 0,0 (the object's center moves along the path). */
export const MOTION_PATHS: Record<string, { label: string; d: string }> = {
  lineDown: { label: tx('Down'), d: 'M0 0 L0 200' },
  lineUp: { label: tx('Up'), d: 'M0 0 L0 -200' },
  lineLeft: { label: tx('Left'), d: 'M0 0 L-200 0' },
  lineRight: { label: tx('Right'), d: 'M0 0 L200 0' },
  arcDown: { label: tx('Arc Down'), d: 'M0 0 C0 140 200 140 200 0' },
  arcUp: { label: tx('Arc Up'), d: 'M0 0 C0 -140 200 -140 200 0' },
  arcLeft: { label: tx('Arc Left'), d: 'M0 0 C-140 0 -140 200 0 200' },
  arcRight: { label: tx('Arc Right'), d: 'M0 0 C140 0 140 200 0 200' },
  turnDown: { label: tx('Turn Down'), d: 'M0 0 L120 0 Q200 0 200 80 L200 200' },
  turnUp: { label: tx('Turn Up'), d: 'M0 0 L120 0 Q200 0 200 -80 L200 -200' },
  circle: { label: tx('Circle'), d: 'M0 0 C0 -110 220 -110 220 0 C220 110 0 110 0 0' },
  square: { label: tx('Square'), d: 'M0 0 L180 0 L180 180 L0 180 Z' },
  triangle: { label: tx('Triangle'), d: 'M0 0 L100 -170 L200 0 Z' },
  diamond: { label: tx('Diamond'), d: 'M0 0 L100 -100 L200 0 L100 100 Z' },
  loop: { label: tx('Loop de Loop'), d: 'M0 0 C80 0 160 -40 160 -100 C160 -160 80 -160 80 -100 C80 -40 160 0 240 0' },
  wave: { label: tx('Sine Wave'), d: 'M0 0 C50 -80 100 -80 150 0 C200 80 250 80 300 0' },
}

export const PATH_OPTIONS: Record<string, string[]> = {
  lineDown: ['lineDown', 'lineUp', 'lineLeft', 'lineRight'],
  arcDown: ['arcDown', 'arcUp', 'arcLeft', 'arcRight'],
  turnDown: ['turnDown', 'turnUp'],
  circle: ['circle', 'square', 'triangle', 'diamond'],
  loop: ['loop', 'wave'],
}

/** End point of a path (last coordinate pair; closed paths end where they start). */
export function pathEnd(d: string): { x: number; y: number } {
  if (/[zZ]\s*$/.test(d)) return { x: 0, y: 0 }
  const nums = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number)
  if (nums.length < 2) return { x: 0, y: 0 }
  return { x: nums[nums.length - 2], y: nums[nums.length - 1] }
}

/** Scales a path so that its end point lands on (x, y). */
export function retargetPath(d: string, x: number, y: number) {
  const end = pathEnd(d)
  const sx = end.x ? x / end.x : 1
  const sy = end.y ? y / end.y : 1
  let i = 0
  return d.replace(/-?\d*\.?\d+(?:e-?\d+)?/gi, (m) => {
    const v = Number(m) * (i++ % 2 === 0 ? sx : sy)
    return String(Math.round(v * 100) / 100)
  })
}

// ---------- Sequence ----------

let animCounter = 0
export function animId() {
  animCounter = (animCounter + 1) % 1e6
  return `a${Date.now().toString(36)}${animCounter.toString(36)}`
}

/** Converts single per-object animations from older files into the slide's animation sequence. */
export function migrateSlide(slide: Slide): Slide {
  if (!slide.elements.some((e) => e.anim)) return slide
  const legacy = slide.elements.filter((e) => e.anim).sort((a, b) => a.anim!.order - b.anim!.order)
  const entries: AnimEntry[] = legacy.map((e) => ({ id: animId(), targetId: e.id, effect: e.anim!.effect, name: e.anim!.name, direction: e.anim!.direction, trigger: e.anim!.trigger, duration: e.anim!.duration, delay: e.anim!.delay }))
  return { ...slide, animations: [...(slide.animations ?? []), ...entries], elements: slide.elements.map((e) => (e.anim ? { ...e, anim: undefined } : e)) }
}

export function migratePresentation<T extends { slides: Slide[] }>(p: T): T {
  return p.slides.some((s) => s.elements.some((e) => e.anim)) ? { ...p, slides: p.slides.map(migrateSlide) } : p
}

/** One effect in the timeline; `para` is set when a text effect plays paragraph by paragraph. */
export type AnimItem = { entry: AnimEntry; el: SlideElement; delay: number; para?: number; units?: number }

/** Share of the duration between words or letters when text is animated by word or letter. */
export const UNIT_STAGGER = 0.1

/** Indices of the paragraphs with text, and how many words/letters each has. */
export function textParagraphs(el: SlideElement, unit?: AnimEntry['textUnit']): { index: number; units: number }[] {
  if (el.type !== 'shape' || !el.text) return []
  return el.text.doc.content
    .map((p, index) => {
      const text = (p.content ?? []).map((n) => (n.type === 'text' ? n.text : ' ')).join('')
      const units = unit === 'letter' ? text.replace(/\s/g, '').length : unit === 'word' ? text.split(/\s+/).filter(Boolean).length : 1
      return { index, units: Math.max(1, units), empty: !text.trim() }
    })
    .filter((p) => !p.empty)
    .map(({ index, units }) => ({ index, units }))
}

/** Whether an effect is split into paragraph (or word/letter) parts during the show. */
export function splitsText(entry: AnimEntry, el: SlideElement) {
  return entry.effect !== 'path' && (entry.textBuild === 'paragraph' || !!entry.textUnit) && textParagraphs(el).length > 0
}

function timeline(entries: AnimEntry[], els: SlideElement[]): AnimItem[][] {
  const steps: AnimItem[][] = []
  let cursor = 0
  let lastEnd = 0
  const add = (entry: AnimEntry, el: SlideElement, trigger: AnimEntry['trigger'], extra: Partial<AnimItem> = {}, span = entry.duration * Math.max(1, entry.repeat ?? 1)) => {
    if (trigger === 'click' || !steps.length) {
      steps.push([])
      cursor = 0
      lastEnd = 0
    }
    const start = trigger === 'after' ? lastEnd : cursor
    const delay = start + (extra.para === undefined || extra.para === firstPara ? entry.delay : 0)
    steps[steps.length - 1].push({ entry, el, delay, ...extra })
    lastEnd = Math.max(lastEnd, delay + span)
    cursor = start
  }
  let firstPara = -1
  for (const entry of entries) {
    const el = els.find((e) => e.id === entry.targetId)
    if (!el || el.hidden) continue
    if (!splitsText(entry, el)) {
      firstPara = -1
      add(entry, el, entry.trigger)
      continue
    }
    // By paragraph: on click every paragraph waits for its own click; otherwise they follow each other.
    // By word/letter as one object: the paragraphs play one after another in the same step.
    const paras = textParagraphs(el, entry.textUnit)
    firstPara = paras[0].index
    paras.forEach((p, k) => {
      const trigger = k === 0 ? entry.trigger : entry.textBuild === 'paragraph' && entry.trigger === 'click' ? 'click' : 'after'
      const span = entry.duration * (1 + UNIT_STAGGER * (p.units - 1)) * Math.max(1, entry.repeat ?? 1)
      add(entry, el, trigger, { para: p.index, units: p.units }, span)
    })
  }
  return steps
}

/** The main sequence grouped into click steps (with/after previous join the current step). */
export function animationSteps(slide: Slide): AnimItem[][] {
  return timeline((slide.animations ?? []).filter((a) => !a.triggerId), slide.elements)
}

/** Trigger sequences: clicking the trigger object plays its effects as one step. */
export function triggerSteps(slide: Slide): Map<string, AnimItem[]> {
  const out = new Map<string, AnimItem[]>()
  const ids = [...new Set((slide.animations ?? []).filter((a) => a.triggerId).map((a) => a.triggerId!))]
  for (const id of ids) {
    const steps = timeline(
      (slide.animations ?? []).filter((a) => a.triggerId === id).map((a, i) => (i === 0 ? { ...a, trigger: 'click' as const } : a.trigger === 'click' ? { ...a, trigger: 'after' as const } : a)),
      slide.elements,
    )
    out.set(id, steps.flat())
  }
  return out
}

export function stepIsAutomatic(step: AnimItem[]) {
  return step.length > 0 && step[0].entry.trigger !== 'click'
}

export function stepDuration(step: AnimItem[] | undefined) {
  return step ? Math.max(0, ...step.map((i) => i.delay + i.entry.duration * Math.max(1, i.entry.repeat ?? 1))) : 0
}

export const EFFECT_COLORS: Record<AnimEntry['effect'], string> = { entrance: '#3FA34D', emphasis: '#E3A21A', exit: '#D9483B', path: '#7A7A7A' }
