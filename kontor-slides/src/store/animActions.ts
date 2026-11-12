// Animation sequence editing: the gallery, Add Animation, timing, reordering, triggers and the painter.
import type { AnimEntry } from '../model/types'
import { MOTION_PATHS, animId, animationDef } from '../model/effects'
import { commit, currentSlide, store, updateSlide } from './store'

export function slideAnims(): AnimEntry[] {
  const slide = currentSlide()
  return (slide.animations ?? []).filter((a) => slide.elements.some((e) => e.id === a.targetId))
}

export function setAnimations(fn: (list: AnimEntry[]) => AnimEntry[], extra: Parameters<typeof commit>[1] = {}) {
  const sid = store.get().slideId
  commit((p) => updateSlide(p, sid, (s) => ({ ...s, animations: fn(s.animations ?? []) })), extra)
}

/** The entries the timing controls apply to: the one picked in the Animation Pane, else all of the selected objects. */
export function selectedEntries(): AnimEntry[] {
  const s = store.get()
  const list = slideAnims()
  const picked = list.find((a) => a.id === s.animSel)
  if (picked && (s.selection.includes(picked.targetId) || s.pane === 'animation')) return [picked]
  return list.filter((a) => s.selection.includes(a.targetId))
}

function newEntry(targetId: string, name: string, base?: Partial<AnimEntry>): AnimEntry {
  const def = animationDef(name)
  const effect = def?.effect ?? (MOTION_PATHS[name] ? 'path' : 'entrance')
  return {
    id: animId(),
    targetId,
    effect,
    name,
    direction: def?.directional ? (base?.direction ?? 'down') : undefined,
    trigger: base?.trigger ?? 'click',
    duration: base?.duration ?? (effect === 'path' ? 2 : effect === 'emphasis' ? 1 : 0.5),
    delay: base?.delay ?? 0,
    path: effect === 'path' ? (MOTION_PATHS[name]?.d ?? 'M0 0 L0 200') : undefined,
  }
}

/** Gallery click: replaces the selected effects (or adds one per object that has none). */
export function applyAnimation(name: string) {
  const s = store.get()
  if (name === 'custom') {
    if (s.selection.length) store.set({ tool: { kind: 'motionPath', targetId: s.selection[0], entryId: selectedEntries()[0]?.id ?? null } })
    return
  }
  const targets = selectedEntries()
  if (targets.length) {
    const ids = new Set(targets.map((t) => t.id))
    setAnimations((list) => list.map((a) => (ids.has(a.id) ? { ...newEntry(a.targetId, name, a), id: a.id, triggerId: a.triggerId } : a)))
    return
  }
  addAnimation(name)
}

/** Add Animation: always appends a new effect to every selected object. */
export function addAnimation(name: string) {
  const s = store.get()
  if (!s.selection.length) return
  if (name === 'custom') {
    store.set({ tool: { kind: 'motionPath', targetId: s.selection[0], entryId: null } })
    return
  }
  const added = s.selection.map((id) => newEntry(id, name))
  setAnimations((list) => [...list, ...added], { animSel: added[added.length - 1].id })
}

export function removeAnimation(ids = selectedEntries().map((a) => a.id)) {
  const set = new Set(ids)
  setAnimations((list) => list.filter((a) => !set.has(a.id)), { animSel: null })
}

export function updateEntries(patch: Partial<AnimEntry>, ids = selectedEntries().map((a) => a.id)) {
  const set = new Set(ids)
  setAnimations((list) => list.map((a) => (set.has(a.id) ? { ...a, ...patch } : a)))
}

export function moveEntry(dir: -1 | 1, id = selectedEntries()[0]?.id) {
  if (!id) return
  setAnimations((list) => {
    const i = list.findIndex((a) => a.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return list
    const next = [...list]
    ;[next[i], next[j]] = [next[j], next[i]]
    return next
  })
}

export function moveEntryTo(id: string, index: number) {
  setAnimations((list) => {
    const item = list.find((a) => a.id === id)
    if (!item) return list
    const rest = list.filter((a) => a.id !== id)
    rest.splice(Math.max(0, Math.min(rest.length, index)), 0, item)
    return rest
  })
}

/** Custom motion path drawn on the slide (points relative to the object's center). */
export function setCustomPath(targetId: string, entryId: string | null, d: string) {
  if (entryId) {
    setAnimations((list) => list.map((a) => (a.id === entryId ? { ...a, effect: 'path', name: 'custom', path: d, direction: undefined } : a)))
    return
  }
  const entry: AnimEntry = { ...newEntry(targetId, 'lineDown'), name: 'custom', path: d }
  setAnimations((list) => [...list, entry], { animSel: entry.id, tool: { kind: 'select' } })
}

export function startAnimationPainter() {
  const entries = selectedEntries()
  if (!entries.length) return
  store.set({ animPainter: entries.map((e) => ({ ...e })) })
}

/** Animation Painter: copies the picked effects onto `targetId` (replacing its own effects). */
export function paintAnimations(targetId: string) {
  const src = store.get().animPainter
  if (!src) return
  setAnimations((list) => [...list.filter((a) => a.targetId !== targetId), ...src.map((e) => ({ ...e, id: animId(), targetId }))], { animPainter: null })
}
