import { useRef, useSyncExternalStore } from 'react'
import type { AnimEntry, Dash, Effects, Fill, Line, Mark, Presentation, Slide, SlideElement } from '../model/types'
import type { ShapePreset } from '../model/shapes'
import { createPresentation, createSlide, findElement, mapElements } from '../model/factory'
import { migratePresentation } from '../model/effects'
import { setActiveMaster } from '../model/layouts'
import { applyMasterEdit, isMasterId, masterSlide } from '../model/master'
import { DEFAULT_DOC_TITLE } from '../brand'

export type ViewMode = 'normal' | 'sorter' | 'notesPage' | 'reading' | 'outline' | 'master' | 'handoutMaster' | 'notesMaster'

export type Tool =
  | { kind: 'select' }
  | { kind: 'shape'; preset: ShapePreset }
  | { kind: 'textbox'; vertical?: boolean }
  | { kind: 'pen'; color: string; width: number; highlighter?: boolean }
  | { kind: 'eraser' }
  | { kind: 'drawTable' }
  | { kind: 'eraseTable' }
  | { kind: 'motionPath'; targetId: string; entryId: string | null }
  /** Picture Format > Color > Set Transparent Color: click a color in a picture. */
  | { kind: 'transparentColor' }

export type Pane = null | 'formatShape' | 'formatBackground' | 'selection' | 'comments' | 'animation'

/** Formatting picked up by the Format Painter. */
export type Painter = { fill?: Fill; line?: Line; effects?: Effects; marks?: Mark[]; sticky?: boolean }

export type ShowState = { start: number; reading?: boolean; rehearse?: boolean; presenter?: boolean; custom?: string | null } | null

/** Cell selection inside the selected table: anchor/focus corners; editing = caret in the anchor cell. */
export type TableSel = { id: string; anchor: { r: number; c: number }; focus: { r: number; c: number }; editing: boolean } | null

export type AppState = {
  pres: Presentation
  title: string
  slideId: string
  selectedSlides: string[]
  selection: string[]
  editingId: string | null
  /** Shape whose outline points are being edited (Edit Points). */
  editPointsId: string | null
  /** Vertex selected in Edit Points ("ring:index"); its Bézier handles are shown. */
  editVertex: string | null
  tableSel: TableSel
  /** Pen used by the table Borders menu and Draw Table. */
  tablePen: { color: string; width: number; dash: Dash }
  /** View Gridlines: dashed lines where table cells have no border. */
  tableGridlines: boolean
  lockTableRatio: boolean
  /** Text pane of the selected diagram is open. */
  diagramPane: boolean
  /** Node of the selected diagram that has the focus in the text pane. */
  diagramNode: string | null
  /** Slide (or master/layout) shown before entering a master view. */
  masterReturn: string | null
  /** Selected entry in the Animation Pane. */
  animSel: string | null
  animPane: boolean
  /** Animation Painter: entries to copy onto the next clicked object. */
  animPainter: AnimEntry[] | null
  tool: Tool
  view: ViewMode
  zoom: number
  fit: boolean
  showNotes: boolean
  showRuler: boolean
  showGrid: boolean
  showGuides: boolean
  /** Grid and Guides: snap objects to the grid, grid spacing (px), smart guides while dragging. */
  snapToGrid: boolean
  gridSpacing: number
  smartGuides: boolean
  /** Drawing guides in slide px (vertical guides at x, horizontal guides at y); null = one at the center. */
  guides: { x: number[]; y: number[] } | null
  pane: Pane
  colorMode: 'color' | 'grayscale' | 'bw'
  focus: 'thumbs' | 'canvas' | 'notes'
  show: ShowState
  spellcheck: boolean
  autoSave: boolean
  painter: Painter | null
  /** Active ribbon tab. */
  tab: string
  hideInk: boolean
  /** Width of the slide thumbnail pane in px (resizable). */
  thumbWidth: number
  past: Presentation[]
  future: Presentation[]
  /** Increments whenever the presentation changes (used by autosave). */
  revision: number
}

type Listener = () => void

const THUMB_WIDTH_KEY = 'kontor-slides:thumbWidth'

function savedThumbWidth() {
  try {
    const saved = Number(localStorage.getItem(THUMB_WIDTH_KEY))
    if (saved >= 90 && saved <= 600) return saved
  } catch {
    // Storage may be unavailable (private mode); fall back to the default.
  }
  return null
}

/** The original keeps the pane at roughly 15 % of the window. */
function autoThumbWidth() {
  return Math.round(Math.max(120, Math.min(220, (typeof window === 'undefined' ? 1400 : window.innerWidth) * 0.15)))
}

function initialThumbWidth() {
  return savedThumbWidth() ?? autoThumbWidth()
}

// Until the user drags the divider, the pane follows the window width.
if (typeof window !== 'undefined')
  window.addEventListener('resize', () => {
    if (savedThumbWidth() !== null) return
    const w = autoThumbWidth()
    if (w !== state.thumbWidth) store.set({ thumbWidth: w })
  })

export function setThumbWidth(width: number) {
  const w = Math.round(Math.max(90, Math.min(window.innerWidth * 0.45, width)))
  store.set({ thumbWidth: w })
  try {
    localStorage.setItem(THUMB_WIDTH_KEY, String(w))
  } catch {
    // Not critical.
  }
}

function initial(): AppState {
  const pres = createPresentation()
  return {
    pres,
    title: DEFAULT_DOC_TITLE,
    slideId: pres.slides[0].id,
    selectedSlides: [pres.slides[0].id],
    selection: [],
    editingId: null,
    editPointsId: null,
    editVertex: null,
    tableSel: null,
    tablePen: { color: 'theme:tx1', width: 1, dash: 'solid' },
    tableGridlines: true,
    lockTableRatio: false,
    diagramPane: true,
    diagramNode: null,
    masterReturn: null,
    animSel: null,
    animPane: false,
    animPainter: null,
    tool: { kind: 'select' },
    view: 'normal',
    zoom: 60,
    fit: true,
    showNotes: true,
    showRuler: false,
    showGrid: false,
    showGuides: false,
    snapToGrid: false,
    gridSpacing: 8,
    smartGuides: true,
    guides: null,
    pane: null,
    colorMode: 'color',
    focus: 'canvas',
    show: null,
    spellcheck: true,
    autoSave: true,
    painter: null,
    tab: 'home',
    hideInk: false,
    thumbWidth: initialThumbWidth(),
    past: [],
    future: [],
    revision: 0,
  }
}

let state: AppState = initial()
const listeners = new Set<Listener>()

export const store = {
  get: () => state,
  set(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
    const next = typeof patch === 'function' ? patch(state) : patch
    const prevPres = state.pres
    state = { ...state, ...next }
    // Edit Points ends when its shape is no longer the selection.
    if (state.editPointsId && (state.selection.length !== 1 || state.selection[0] !== state.editPointsId)) state = { ...state, editPointsId: null, editVertex: null }
    if (state.pres !== prevPres && state.pres.master !== prevPres.master) setActiveMaster(state.pres.master)
    listeners.forEach((l) => l())
  },
  subscribe(l: Listener) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

/** Subscribes to the store; the selector result is cached per state so it may return new objects. */
export function useStore<T>(selector: (s: AppState) => T): T {
  const cache = useRef<{ state: AppState | null; value: T }>({ state: null, value: undefined as T })
  const get = () => {
    if (cache.current.state !== state) cache.current = { state, value: selector(state) }
    return cache.current.value
  }
  return useSyncExternalStore(store.subscribe, get)
}

// ---------- History ----------

const HISTORY_LIMIT = 200
let txBase: Presentation | null = null
/** Set while the open transaction is typing (text editing or notes) rather than a drag. */
let txEdit: { editingId: string | null; slideId: string } | null = null

/** True when a change moves away from the object or slide that is being typed into. */
function leavesEdit(extra: Partial<AppState>) {
  if (!txEdit) return false
  if (extra.editingId !== undefined && extra.editingId !== txEdit.editingId) return true
  if (extra.slideId !== undefined && extra.slideId !== txEdit.slideId) return true
  if (txEdit.editingId && extra.selection && !extra.selection.includes(txEdit.editingId)) return true
  return false
}

function sanitize(s: AppState, pres: Presentation): Partial<AppState> {
  if (isMasterId(s.slideId)) {
    const ms = masterSlide(pres, s.slideId)
    return { selection: s.selection.filter((id) => findElement(ms.elements, id)), editingId: null, tableSel: null }
  }
  const slide = pres.slides.find((x) => x.id === s.slideId) ?? pres.slides[Math.min(pres.slides.length - 1, Math.max(0, s.pres.slides.findIndex((x) => x.id === s.slideId)))] ?? pres.slides[0]
  if (!slide) return { slideId: '', selectedSlides: [], selection: [], editingId: null, tableSel: null }
  const selection = s.selection.filter((id) => slide && findElement(slide.elements, id))
  return {
    slideId: slide.id,
    selectedSlides: s.selectedSlides.filter((id) => pres.slides.some((x) => x.id === id)).length ? s.selectedSlides.filter((id) => pres.slides.some((x) => x.id === id)) : [slide.id],
    selection,
    editingId: s.editingId && selection.includes(s.editingId) ? s.editingId : null,
    tableSel: s.tableSel && selection.includes(s.tableSel.id) ? { ...s.tableSel, editing: false } : null,
  }
}

/** Applies a change as one undoable step. */
export function commit(fn: (p: Presentation) => Presentation, extra: Partial<AppState> = {}) {
  if (txBase && leavesEdit(extra)) {
    // A command (insert, new slide …) ends the typing: the typed text becomes its own undo step.
    endTransaction()
    if (extra.editingId === undefined) extra = { ...extra, editingId: null, tableSel: state.tableSel ? { ...state.tableSel, editing: false } : null }
  }
  const prev = state.pres
  const next = fn(prev)
  if (next === prev) {
    if (Object.keys(extra).length) store.set(extra)
    return
  }
  if (txBase) {
    store.set((s) => ({ pres: next, revision: s.revision + 1, ...extra }))
    return
  }
  store.set((s) => ({ pres: next, past: [...s.past, prev].slice(-HISTORY_LIMIT), future: [], revision: s.revision + 1, ...extra }))
}

/**
 * Starts a continuous change (drag, typing) that becomes a single undo step. Typing passes `edit`
 * (the object or slide being typed into) so that a command elsewhere closes the step first.
 */
export function beginTransaction(edit?: { editingId: string | null; slideId?: string }) {
  if (txBase) return
  txBase = state.pres
  txEdit = edit ? { editingId: edit.editingId, slideId: edit.slideId ?? state.slideId } : null
}

export function endTransaction() {
  const base = txBase
  txBase = null
  txEdit = null
  if (base && base !== state.pres) store.set((s) => ({ past: [...s.past, base].slice(-HISTORY_LIMIT), future: [] }))
}

/** Changes that should not be undoable (autofit measurements). */
export function silent(fn: (p: Presentation) => Presentation) {
  const next = fn(state.pres)
  if (next === state.pres) return
  if (txBase) {
    store.set((s) => ({ pres: next, revision: s.revision + 1 }))
    return
  }
  // Keep history entries consistent by applying the same change to nothing: the undo target stays the previous snapshot.
  store.set((s) => ({ pres: next, revision: s.revision + 1 }))
}

export function undo() {
  const s = state
  if (!s.past.length) return
  const prev = s.past[s.past.length - 1]
  store.set({ pres: prev, past: s.past.slice(0, -1), future: [s.pres, ...s.future], revision: s.revision + 1, ...sanitize(s, prev) })
}

export function redo() {
  const s = state
  if (!s.future.length) return
  const next = s.future[0]
  store.set({ pres: next, past: [...s.past, s.pres], future: s.future.slice(1), revision: s.revision + 1, ...sanitize(s, next) })
}

export function resetDocument(input: Presentation, title: string) {
  const pres = migratePresentation(input)
  store.set({
    pres,
    title,
    slideId: pres.slides[0]?.id ?? '',
    selectedSlides: pres.slides[0] ? [pres.slides[0].id] : [],
    selection: [],
    editingId: null,
    tableSel: null,
    past: [],
    future: [],
    revision: state.revision + 1,
    show: null,
    view: 'normal',
  })
}

// ---------- Helpers ----------

// A presentation may have no slides at all (like the original). Code that reads "the current slide"
// then gets this stand-in, which is not part of the deck, so edits to it go nowhere.
let emptyStandIn: { key: string; slide: Slide } | null = null
function emptySlide(p: Presentation): Slide {
  const key = `${p.size.w}x${p.size.h}`
  if (!emptyStandIn || emptyStandIn.key !== key) emptyStandIn = { key, slide: { ...createSlide('blank', p.size), id: '' } }
  return emptyStandIn.slide
}

export function currentSlide(s: AppState = state): Slide {
  if (isMasterId(s.slideId)) return masterSlide(s.pres, s.slideId)
  return s.pres.slides.find((x) => x.id === s.slideId) ?? s.pres.slides[0] ?? emptySlide(s.pres)
}

export function currentIndex(s: AppState = state) {
  return Math.max(0, s.pres.slides.findIndex((x) => x.id === s.slideId))
}

export function updateSlide(p: Presentation, slideId: string, fn: (s: Slide) => Slide): Presentation {
  if (isMasterId(slideId)) return applyMasterEdit(p, slideId, fn)
  return { ...p, slides: p.slides.map((s) => (s.id === slideId ? fn(s) : s)) }
}

export function updateElements(p: Presentation, slideId: string, ids: string[], fn: (e: SlideElement) => SlideElement): Presentation {
  const set = new Set(ids)
  return updateSlide(p, slideId, (s) => ({ ...s, elements: mapElements(s.elements, (e) => (set.has(e.id) ? fn(e) : e)) }))
}

export function selectedElements(s: AppState = state): SlideElement[] {
  const slide = currentSlide(s)
  return s.selection.map((id) => findElement(slide.elements, id)).filter((e): e is SlideElement => !!e)
}
