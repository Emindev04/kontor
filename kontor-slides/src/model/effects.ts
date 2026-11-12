import type { AnimEntry, Slide, SlideElement, TransitionName } from './types'

export type EffectOption = { id: string; label: string }

const DIRS: EffectOption[] = [
  { id: 'fromRight', label: 'From Right' },
  { id: 'fromLeft', label: 'From Left' },
  { id: 'fromTop', label: 'From Top' },
  { id: 'fromBottom', label: 'From Bottom' },
]

export const TRANSITIONS: { name: TransitionName; label: string; options?: EffectOption[] }[] = [
  { name: 'none', label: 'None' },
  { name: 'cut', label: 'Cut' },
  { name: 'fade', label: 'Fade', options: [{ id: 'smooth', label: 'Smoothly' }, { id: 'black', label: 'Through Black' }] },
  { name: 'push', label: 'Push', options: [DIRS[3], DIRS[1], DIRS[0], DIRS[2]] },
  { name: 'wipe', label: 'Wipe', options: DIRS },
  { name: 'split', label: 'Split', options: [{ id: 'verticalOut', label: 'Vertical Out' }, { id: 'verticalIn', label: 'Vertical In' }, { id: 'horizontalOut', label: 'Horizontal Out' }, { id: 'horizontalIn', label: 'Horizontal In' }] },
  { name: 'reveal', label: 'Reveal', options: [DIRS[0], DIRS[1]] },
  { name: 'cover', label: 'Cover', options: DIRS },
  { name: 'randomBars', label: 'Random Bars', options: [{ id: 'vertical', label: 'Vertical' }, { id: 'horizontal', label: 'Horizontal' }] },
  { name: 'shape', label: 'Shape', options: [{ id: 'circle', label: 'Circle' }, { id: 'diamond', label: 'Diamond' }, { id: 'plus', label: 'Plus' }] },
  { name: 'zoom', label: 'Zoom', options: [{ id: 'in', label: 'In' }, { id: 'out', label: 'Out' }] },
  { name: 'dissolve', label: 'Dissolve' },
  { name: 'blinds', label: 'Blinds', options: [{ id: 'vertical', label: 'Vertical' }, { id: 'horizontal', label: 'Horizontal' }] },
  { name: 'checker', label: 'Checkerboard', options: [{ id: 'fromLeft', label: 'From Left' }, { id: 'fromTop', label: 'From Top' }] },
  { name: 'morph', label: 'Morph' },
  { name: 'uncover', label: 'Uncover', options: [DIRS[1], DIRS[0], DIRS[3], DIRS[2]] },
  { name: 'flash', label: 'Flash' },
  { name: 'clock', label: 'Clock' },
  { name: 'wedge', label: 'Wedge' },
  { name: 'strips', label: 'Strips', options: [{ id: 'rightDown', label: 'Right-Down' }, { id: 'leftDown', label: 'Left-Down' }] },
  { name: 'newsflash', label: 'Newsflash' },
  { name: 'flip', label: 'Flip', options: [{ id: 'right', label: 'Right' }, { id: 'left', label: 'Left' }] },
  { name: 'cube', label: 'Cube', options: [{ id: 'fromRight', label: 'From Right' }, { id: 'fromLeft', label: 'From Left' }] },
  { name: 'fallOver', label: 'Fall Over' },
  { name: 'curtains', label: 'Curtains' },
  { name: 'gallery', label: 'Gallery', options: [{ id: 'fromRight', label: 'From Right' }, { id: 'fromLeft', label: 'From Left' }] },
  { name: 'vortex', label: 'Vortex' },
]

export function transitionDef(name: TransitionName) {
  return TRANSITIONS.find((t) => t.name === name) ?? TRANSITIONS[0]
}

export type AnimationDef = { name: string; label: string; effect: AnimEntry['effect']; directional?: boolean }

export const ANIMATIONS: AnimationDef[] = [
  { name: 'appear', label: 'Appear', effect: 'entrance' },
  { name: 'fade', label: 'Fade', effect: 'entrance' },
  { name: 'flyIn', label: 'Fly In', effect: 'entrance', directional: true },
  { name: 'floatIn', label: 'Float In', effect: 'entrance', directional: true },
  { name: 'split', label: 'Split', effect: 'entrance' },
  { name: 'wipe', label: 'Wipe', effect: 'entrance', directional: true },
  { name: 'shape', label: 'Shape', effect: 'entrance' },
  { name: 'wheel', label: 'Wheel', effect: 'entrance' },
  { name: 'randomBars', label: 'Random Bars', effect: 'entrance' },
  { name: 'grow', label: 'Grow & Turn', effect: 'entrance' },
  { name: 'zoom', label: 'Zoom', effect: 'entrance' },
  { name: 'swivel', label: 'Swivel', effect: 'entrance' },
  { name: 'bounce', label: 'Bounce', effect: 'entrance' },
  { name: 'pulse', label: 'Pulse', effect: 'emphasis' },
  { name: 'colorPulse', label: 'Color Pulse', effect: 'emphasis' },
  { name: 'teeter', label: 'Teeter', effect: 'emphasis' },
  { name: 'spin', label: 'Spin', effect: 'emphasis' },
  { name: 'growShrink', label: 'Grow/Shrink', effect: 'emphasis' },
  { name: 'desaturate', label: 'Desaturate', effect: 'emphasis' },
  { name: 'darken', label: 'Darken', effect: 'emphasis' },
  { name: 'lighten', label: 'Lighten', effect: 'emphasis' },
  { name: 'transparency', label: 'Transparency', effect: 'emphasis' },
  { name: 'flash', label: 'Blink', effect: 'emphasis' },
  { name: 'wave', label: 'Wave', effect: 'emphasis' },
  { name: 'disappear', label: 'Disappear', effect: 'exit' },
  { name: 'fadeOut', label: 'Fade', effect: 'exit' },
  { name: 'flyOut', label: 'Fly Out', effect: 'exit', directional: true },
  { name: 'floatOut', label: 'Float Out', effect: 'exit', directional: true },
  { name: 'splitOut', label: 'Split', effect: 'exit' },
  { name: 'wipeOut', label: 'Wipe', effect: 'exit', directional: true },
  { name: 'shapeOut', label: 'Shape', effect: 'exit' },
  { name: 'randomBarsOut', label: 'Random Bars', effect: 'exit' },
  { name: 'shrinkTurn', label: 'Shrink & Turn', effect: 'exit' },
  { name: 'zoomOut', label: 'Zoom', effect: 'exit' },
  { name: 'swivelOut', label: 'Swivel', effect: 'exit' },
  { name: 'bounceOut', label: 'Bounce', effect: 'exit' },
  { name: 'lineDown', label: 'Lines', effect: 'path' },
  { name: 'arcDown', label: 'Arcs', effect: 'path' },
  { name: 'turnDown', label: 'Turns', effect: 'path' },
  { name: 'circle', label: 'Shapes', effect: 'path' },
  { name: 'loop', label: 'Loops', effect: 'path' },
  { name: 'custom', label: 'Custom Path', effect: 'path' },
]

export function animationDef(name: string) {
  return ANIMATIONS.find((a) => a.name === name)
}

/** Motion path presets in px, starting at 0,0 (the object's center moves along the path). */
export const MOTION_PATHS: Record<string, { label: string; d: string }> = {
  lineDown: { label: 'Down', d: 'M0 0 L0 200' },
  lineUp: { label: 'Up', d: 'M0 0 L0 -200' },
  lineLeft: { label: 'Left', d: 'M0 0 L-200 0' },
  lineRight: { label: 'Right', d: 'M0 0 L200 0' },
  arcDown: { label: 'Arc Down', d: 'M0 0 C0 140 200 140 200 0' },
  arcUp: { label: 'Arc Up', d: 'M0 0 C0 -140 200 -140 200 0' },
  arcLeft: { label: 'Arc Left', d: 'M0 0 C-140 0 -140 200 0 200' },
  arcRight: { label: 'Arc Right', d: 'M0 0 C140 0 140 200 0 200' },
  turnDown: { label: 'Turn Down', d: 'M0 0 L120 0 Q200 0 200 80 L200 200' },
  turnUp: { label: 'Turn Up', d: 'M0 0 L120 0 Q200 0 200 -80 L200 -200' },
  circle: { label: 'Circle', d: 'M0 0 C0 -110 220 -110 220 0 C220 110 0 110 0 0' },
  square: { label: 'Square', d: 'M0 0 L180 0 L180 180 L0 180 Z' },
  triangle: { label: 'Triangle', d: 'M0 0 L100 -170 L200 0 Z' },
  diamond: { label: 'Diamond', d: 'M0 0 L100 -100 L200 0 L100 100 Z' },
  loop: { label: 'Loop de Loop', d: 'M0 0 C80 0 160 -40 160 -100 C160 -160 80 -160 80 -100 C80 -40 160 0 240 0' },
  wave: { label: 'Sine Wave', d: 'M0 0 C50 -80 100 -80 150 0 C200 80 250 80 300 0' },
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
