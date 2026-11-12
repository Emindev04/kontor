import { playSound } from '../model/sounds'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight, Highlighter, LayoutGrid, Menu, MonitorOff, Pause, PenLine, Play, Pointer, RotateCcw, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { Presentation, Slide, SlideElement } from '../model/types'
import { animationSteps, pathEnd, splitsText, stepDuration, stepIsAutomatic, triggerSteps, UNIT_STAGGER, type AnimItem } from '../model/effects'
import { SlideView, presProps } from '../render/SlideView'
import type { AnimLayer, AnimState, TextAnimPara } from '../render/ElementView'
import { commit, store, useStore } from '../store/store'
import { ContextMenu, type MenuItem } from './ui'

type Phase = { idx: number; step: number; prev: number | null; key: number; trig?: string[] }

function fitScale(box: { w: number; h: number }, size: { w: number; h: number }) {
  return Math.min(box.w / size.w, box.h / size.h)
}

function useBox(ref: React.RefObject<HTMLElement | null>) {
  const [box, setBox] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return box
}

const PERSIST: Record<string, CSSProperties> = {
  growShrink: { transform: 'scale(1.5)' },
  transparency: { opacity: 0.5 },
  desaturate: { filter: 'grayscale(1)' },
  darken: { filter: 'brightness(0.6)' },
  lighten: { filter: 'brightness(1.4)' },
}

function layerFor(item: AnimItem): AnimLayer {
  const e = item.entry
  const repeat = Math.max(1, e.repeat ?? 1)
  if (e.effect === 'path') return { motion: { d: e.path ?? 'M0 0', duration: e.duration, delay: item.delay, repeat } }
  return {
    className: `anim anim-${e.name} anim-dir-${e.direction ?? 'down'}`,
    style: { animationDuration: `${e.duration}s`, animationDelay: `${item.delay}s`, animationIterationCount: repeat } as CSSProperties,
  }
}

/**
 * Animation state for each object: `step` main-sequence click steps have started (the last one is
 * playing) and `trig` lists the trigger objects clicked so far (the last one is playing).
 */
export function animStateFor(slide: Slide, step: number, noAnim = false, trig: string[] = []) {
  const steps = animationSteps(slide)
  const triggers = triggerSteps(slide)
  const all = slide.animations ?? []
  const completed: AnimItem[] = []
  const playing: AnimItem[] = []
  steps.forEach((st, si) => {
    if (noAnim ? si < step : si < step - 1) completed.push(...st)
    else if (si === step - 1) playing.push(...st)
  })
  trig.forEach((id, ti) => {
    const items = triggers.get(id) ?? []
    if (noAnim || ti < trig.length - 1) completed.push(...items)
    else playing.push(...items)
  })
  const animated = new Set(all.map((a) => a.targetId))
  const triggerIds = new Set(all.map((a) => a.triggerId).filter(Boolean) as string[])
  return (el: SlideElement): AnimState | undefined => {
    const isTrigger = triggerIds.has(el.id)
    if (!animated.has(el.id)) return isTrigger ? { trigger: true } : undefined
    const mine = all.filter((a) => a.targetId === el.id)
    // Text that plays paragraph by paragraph (or word by word) gets a state per paragraph.
    if (el.type === 'shape' && el.text && mine.some((a) => splitsText(a, el))) {
      const count = el.text.doc.content.length
      const firstVis = mine.find((a) => a.effect === 'entrance' || a.effect === 'exit')
      const paras: TextAnimPara[] = Array.from({ length: count }, () => ({ hidden: firstVis?.effect === 'entrance', layers: [] }))
      const apply = (it: AnimItem, playingNow: boolean) => {
        const targets = it.para === undefined ? paras.map((_, i) => i) : [it.para]
        for (const i of targets) {
          const p = paras[i]
          if (!p) continue
          if (it.entry.effect === 'entrance') p.hidden = false
          else if (it.entry.effect === 'exit' && !playingNow) p.hidden = true
          if (playingNow) {
            p.layers.push(layerFor(it))
            if (it.entry.textUnit) {
              p.unit = it.entry.textUnit
              p.stagger = it.entry.duration * UNIT_STAGGER
            }
          }
        }
      }
      for (const it of completed) if (it.el.id === el.id) apply(it, false)
      for (const it of playing) if (it.el.id === el.id) apply(it, true)
      const anyVisible = paras.some((p) => !p.hidden || p.layers.length)
      return { hidden: !anyVisible, layers: [], offset: { x: 0, y: 0 }, trigger: isTrigger, text: paras }
    }
    const firstVis = mine.find((a) => a.effect === 'entrance' || a.effect === 'exit')
    let visible = firstVis?.effect !== 'entrance'
    let ox = 0
    let oy = 0
    let persist: CSSProperties | undefined
    for (const it of completed) {
      if (it.el.id !== el.id) continue
      const e = it.entry
      if (e.effect === 'entrance') visible = true
      else if (e.effect === 'exit') visible = false
      else if (e.effect === 'path' && e.path) {
        const end = pathEnd(e.path)
        ox += end.x
        oy += end.y
      } else if (PERSIST[e.name]) persist = { ...persist, ...PERSIST[e.name] }
    }
    const layers: AnimLayer[] = []
    for (const it of playing) {
      if (it.el.id !== el.id) continue
      if (it.entry.effect === 'entrance') visible = true
      layers.push(layerFor(it))
    }
    const exitPlaying = playing.some((it) => it.el.id === el.id && it.entry.effect === 'exit')
    return { hidden: !visible && !exitPlaying, layers, offset: { x: ox, y: oy }, persist, trigger: isTrigger }
  }
}

type Stroke = { color: string; width: number; points: [number, number][]; highlighter?: boolean }

function Stage({
  pres,
  slides,
  phase,
  scale,
  blank,
  size,
  noAnim,
  ink,
  drawing,
  onDraw,
}: {
  pres: Presentation
  slides: Slide[]
  phase: Phase
  scale: number
  blank: 'black' | 'white' | null
  size: { w: number; h: number }
  noAnim?: boolean
  ink?: Stroke[]
  drawing?: { color: string; width: number; highlighter?: boolean; eraser?: boolean } | null
  onDraw?: (strokes: Stroke[]) => void
}) {
  const slide = slides[phase.idx]
  const anim = useMemo(() => (slide ? animStateFor(slide, noAnim ? 999 : phase.step, !!noAnim, phase.trig) : undefined), [slide, phase.step, phase.trig, noAnim])
  const prev = phase.prev !== null ? slides[phase.prev] : null
  const tr = slide?.transition
  const trName = phase.prev !== null && tr && tr.name !== 'none' ? tr.name : null
  const realIndex = (s: Slide) => pres.slides.indexOf(s)
  const style = { width: size.w * scale, height: size.h * scale, '--tr-dur': `${tr?.duration ?? 1}s` } as CSSProperties
  const current = useRef<Stroke | null>(null)
  // Morph: objects with the same name move from their old place; the others fade.
  const morph = trName === 'morph' && prev && slide
  const prevAnim = useMemo(() => {
    if (!prev) return undefined
    const base = animStateFor(prev, 999, true)
    if (!morph) return base
    const names = new Set(slide.elements.map((e) => e.name))
    return (el: SlideElement): AnimState | undefined => (names.has(el.name) ? { hidden: true } : base(el))
  }, [prev, morph, slide])
  const inAnim = useMemo(() => {
    if (!morph || !anim) return anim
    const byName = new Map(prev.elements.map((e) => [e.name, e]))
    const dur = `${tr?.duration ?? 1}s`
    return (el: SlideElement): AnimState | undefined => {
      const base = anim(el)
      const p = byName.get(el.name)
      const layer: AnimLayer = p
        ? { className: 'morph-move', style: { '--mdx': `${p.x + p.w / 2 - (el.x + el.w / 2)}px`, '--mdy': `${p.y + p.h / 2 - (el.y + el.h / 2)}px`, '--msx': el.w ? p.w / el.w : 1, '--msy': el.h ? p.h / el.h : 1, animationDuration: dur } as CSSProperties }
        : { className: 'anim anim-fade', style: { animationDuration: dur } }
      return { ...(base ?? {}), layers: [layer, ...(base?.layers ?? [])] }
    }
  }, [morph, anim, prev, tr?.duration])
  const [, force] = useState(0)
  const toSlide = (e: React.PointerEvent): [number, number] => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale]
  }
  return (
    <div className="show-stage" style={style}>
      {prev && trName && (
        <div key={`out${phase.key}`} className={`show-layer tr-out tr-${trName} tr-opt-${tr?.option ?? 'default'}`}>
          <SlideView slide={prev} index={realIndex(prev)} {...presProps(pres)} mode="show" style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }} anim={prevAnim} />
        </div>
      )}
      {slide && (
        <div key={`in${phase.idx}-${phase.key}`} className={`show-layer${trName ? ` tr-in tr-${trName} tr-opt-${tr?.option ?? 'default'}` : ''}`}>
          <SlideView slide={slide} index={realIndex(slide)} {...presProps(pres)} mode="show" style={{ transform: `scale(${scale})`, transformOrigin: '0 0' }} anim={inAnim} />
        </div>
      )}
      {(!!ink?.length || drawing) && (
        <svg
          className={`show-ink${drawing ? ' is-drawing' : ''}`}
          width={size.w * scale}
          height={size.h * scale}
          viewBox={`0 0 ${size.w} ${size.h}`}
          onClick={(e) => drawing && e.stopPropagation()}
          onPointerDown={(e) => {
            if (!drawing || !onDraw) return
            e.stopPropagation()
            ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
            if (drawing.eraser) {
              const [x, y] = toSlide(e)
              onDraw((ink ?? []).filter((st) => !st.points.some(([px, py]) => Math.hypot(px - x, py - y) < 12)))
              return
            }
            current.current = { color: drawing.color, width: drawing.width, highlighter: drawing.highlighter, points: [toSlide(e)] }
            force((n) => n + 1)
          }}
          onPointerMove={(e) => {
            if (!current.current) return
            current.current.points.push(toSlide(e))
            force((n) => n + 1)
          }}
          onPointerUp={() => {
            if (current.current && current.current.points.length > 1 && onDraw) onDraw([...(ink ?? []), current.current])
            current.current = null
          }}
        >
          {[...(ink ?? []), ...(current.current ? [current.current] : [])].map((st, i) => (
            <path key={i} d={st.points.map(([x, y], j) => `${j ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')} fill="none" stroke={st.color} strokeOpacity={st.highlighter ? 0.45 : 1} strokeWidth={st.width} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </svg>
      )}
      {blank && <div className={`show-blank show-blank-${blank}`} />}
    </div>
  )
}

function fmtTime(sec: number) {
  const s = Math.floor(sec)
  return `${String(Math.floor(s / 3600)).padStart(1, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** Opens a second browser window for the presenter view and returns a container to portal into. */
function usePresenterWindow(open: boolean, onClosed: () => void) {
  const [win, setWin] = useState<{ w: Window; root: HTMLElement } | null>(null)
  const closedRef = useRef(onClosed)
  closedRef.current = onClosed
  useEffect(() => {
    if (!open) return
    const w = window.open('', 'kontor-presenter', 'width=1200,height=760')
    if (!w) {
      setWin(null)
      return
    }
    w.document.title = 'Presenter View'
    w.document.head.innerHTML = ''
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((n) => {
      const c = n.cloneNode(true) as HTMLElement
      if (n instanceof HTMLLinkElement) (c as HTMLLinkElement).href = n.href
      w.document.head.appendChild(c)
    })
    w.document.body.innerHTML = ''
    w.document.body.className = 'presenter-body'
    const root = w.document.createElement('div')
    root.className = 'presenter-root'
    w.document.body.appendChild(root)
    setWin({ w, root })
    const onUnload = () => closedRef.current()
    w.addEventListener('pagehide', onUnload)
    return () => {
      w.removeEventListener('pagehide', onUnload)
      w.close()
      setWin(null)
    }
  }, [open])
  return win
}

export function SlideShow() {
  const show = useStore((s) => s.show)!
  const pres = useStore((s) => s.pres)
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const box = useBox(stageRef)
  const kiosk = pres.showType === 'kiosk' && !show.reading && !show.rehearse
  const reading = !!show.reading || (pres.showType === 'individual' && !show.rehearse)
  const rehearse = !!show.rehearse
  const noAnim = !!pres.showNoAnimation
  const loop = !!pres.loop || kiosk
  const startSlide = pres.slides[show.start]
  // Show Media Controls: the browser's play bar on every video and audio clip of the show.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const apply = () => root.querySelectorAll<HTMLMediaElement>('video, audio').forEach((m) => (m.controls = !!pres.showMediaControls))
    apply()
    const mo = new MutationObserver(apply)
    mo.observe(root, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [pres.showMediaControls])
  const customId = show.custom ?? pres.showCustom ?? null
  const slides = useMemo(() => {
    const custom = customId ? pres.customShows?.find((c) => c.id === customId) : null
    if (custom) return custom.slideIds.map((id) => pres.slides.find((s) => s.id === id)).filter((s): s is Slide => !!s)
    let list = pres.slides
    if (pres.showRange && !show.reading) list = list.slice(Math.max(0, pres.showRange.from - 1), Math.max(pres.showRange.from, pres.showRange.to))
    return list.filter((s) => !s.hidden || s === startSlide)
  }, [pres.slides, pres.customShows, pres.showRange, customId, startSlide, show.reading])
  const stepsOf = useCallback((sl: Slide | undefined) => (sl && !noAnim ? animationSteps(sl) : []), [noAnim])
  const initialIdx = Math.max(0, slides.indexOf(startSlide))
  const firstSteps = (i: number) => (slides[i] && stepIsAutomatic(stepsOf(slides[i])[0] ?? []) ? 1 : 0)
  const [phase, setPhase] = useState<Phase>(() => ({ idx: initialIdx, step: firstSteps(initialIdx), prev: null, key: 0 }))
  const [ended, setEnded] = useState(false)
  const [blank, setBlank] = useState<'black' | 'white' | null>(null)
  const [typed, setTyped] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [idle, setIdle] = useState(false)
  const [laser, setLaser] = useState<{ x: number; y: number } | null>(null)
  const [laserOn, setLaserOn] = useState(false)
  const [pen, setPen] = useState<null | 'pen' | 'highlighter' | 'eraser'>(null)
  const [ink, setInk] = useState<Record<string, Stroke[]>>({})
  const [presenterFallback, setPresenterFallback] = useState(false)
  // Rehearsal timer.
  const [slideTime, setSlideTime] = useState(0)
  const [paused, setPaused] = useState(false)
  const timings = useRef<number[]>([])
  const totalRef = useRef(0)
  const startedAt = useRef(Date.now())

  const wantPresenter = !!show.presenter && !reading && !rehearse && !kiosk
  const presenter = usePresenterWindow(wantPresenter && !presenterFallback, () => undefined)
  useEffect(() => {
    // A blocked pop-up falls back to the presenter view in this window.
    if (!wantPresenter) return
    const t = window.setTimeout(() => !presenter && setPresenterFallback(true), 600)
    return () => clearTimeout(t)
  }, [wantPresenter, presenter])

  const keepInk = useCallback(() => {
    const entries = Object.entries(ink).filter(([, v]) => v.length)
    if (!entries.length) return
    if (!window.confirm('Do you want to keep your ink annotations?')) return
    commit((p) => ({
      ...p,
      slides: p.slides.map((sl) => {
        const strokes = ink[sl.id]
        if (!strokes?.length) return sl
        const els: SlideElement[] = strokes.map((st, i) => {
          const xs = st.points.map((q) => q[0])
          const ys = st.points.map((q) => q[1])
          const x = Math.min(...xs)
          const y = Math.min(...ys)
          return { id: `ink${Date.now().toString(36)}${i}`, type: 'ink', name: `Ink ${sl.elements.length + i + 1}`, x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y), rot: 0, points: st.points.map(([px, py]) => [px - x, py - y]), color: st.color, width: st.width, highlighter: st.highlighter }
        })
        return { ...sl, elements: [...sl.elements, ...els] }
      }),
    }))
  }, [ink])

  const exit = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
    keepInk()
    store.set({ show: null })
  }, [keepInk])

  const finish = useCallback(() => {
    if (rehearse) {
      const total = timings.current.reduce((a, b) => a + b, 0)
      const keep = window.confirm(`The total time for the slide show was ${fmtTime(total)}. Do you want to keep the new slide timings?`)
      if (keep) {
        const byId = new Map(slides.map((s, i) => [s.id, Math.round((timings.current[i] ?? 0) * 100) / 100]))
        commit((p) => ({
          ...p,
          useTimings: true,
          slides: p.slides.map((s) => (byId.has(s.id) ? { ...s, transition: { ...(s.transition ?? { name: 'none', duration: 1, advanceOnClick: true, advanceAfter: null }), advanceAfter: byId.get(s.id)! } } : s)),
        }))
      }
    }
    exit()
  }, [exit, rehearse, slides])

  const goTo = useCallback(
    (idx: number, opts: { atEnd?: boolean; noTransition?: boolean } = {}) => {
      if (idx >= slides.length) {
        if (loop && !rehearse) idx = 0
        else {
          if (rehearse) finish()
          else setEnded(true)
          return
        }
      }
      if (idx < 0) return
      setEnded(false)
      if (rehearse) {
        timings.current[phase.idx] = (timings.current[phase.idx] ?? 0) + slideTime
        setSlideTime(0)
      }
      const steps = stepsOf(slides[idx])
      if (!opts.noTransition && !opts.atEnd) playSound(slides[idx]?.transition?.sound)
      setPhase((p) => ({ idx, step: opts.atEnd ? steps.length : firstSteps(idx), prev: opts.noTransition || opts.atEnd ? null : p.idx, key: p.key + 1 }))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slides, loop, rehearse, finish, phase.idx, slideTime, stepsOf],
  )

  const next = useCallback(() => {
    if (ended) {
      exit()
      return
    }
    if (blank) {
      setBlank(null)
      return
    }
    const steps = stepsOf(slides[phase.idx])
    if (phase.step < steps.length) {
      setPhase((p) => ({ ...p, step: p.step + 1, prev: null }))
      return
    }
    goTo(phase.idx + 1)
  }, [ended, blank, slides, phase, goTo, exit, stepsOf])

  const playTrigger = useCallback((id: string) => setPhase((p) => ({ ...p, prev: null, trig: [...(p.trig ?? []), id] })), [])

  const prev = useCallback(() => {
    if (ended) {
      setEnded(false)
      return
    }
    if (phase.step > firstSteps(phase.idx)) {
      setPhase((p) => ({ ...p, step: p.step - 1, prev: null, key: p.key + 1 }))
      return
    }
    if (phase.idx > 0) goTo(phase.idx - 1, { atEnd: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended, phase, goTo])

  // Full screen for the real show (the presenter fallback stays in the window).
  useEffect(() => {
    if (reading || presenterFallback) return
    const el = rootRef.current
    el?.requestFullscreen?.().catch(() => undefined)
    const onChange = () => {
      if (!document.fullscreenElement && wasFull.current && !presenter) store.set({ show: null })
      if (document.fullscreenElement) wasFull.current = true
    }
    const wasFull = { current: false }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [reading, presenterFallback, presenter])

  // Keyboard (also in the presenter window).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key
      e.stopPropagation()
      if (kiosk) {
        if (k === 'Escape') exit()
        return
      }
      if (/^[0-9]$/.test(k)) {
        setTyped((t) => t + k)
        return
      }
      if (k === 'Enter' && typed) {
        const n = parseInt(typed, 10)
        setTyped('')
        const target = pres.slides[n - 1]
        const i = target ? slides.indexOf(target) : -1
        if (i >= 0) goTo(i, { noTransition: true })
        return
      }
      setTyped('')
      const mod = e.ctrlKey || e.metaKey
      if (k === 'Escape' || k === '-') {
        e.preventDefault()
        if (pen) setPen(null)
        else if (rehearse) finish()
        else exit()
      } else if (mod && (k === 'p' || k === 'P')) {
        e.preventDefault()
        setPen((v) => (v === 'pen' ? null : 'pen'))
      } else if (mod && (k === 'i' || k === 'I')) {
        e.preventDefault()
        setPen((v) => (v === 'highlighter' ? null : 'highlighter'))
      } else if (mod && (k === 'e' || k === 'E')) {
        e.preventDefault()
        setPen((v) => (v === 'eraser' ? null : 'eraser'))
      } else if (mod && (k === 'a' || k === 'A')) {
        e.preventDefault()
        setPen(null)
      } else if (k === 'e' || k === 'E') {
        const id = slides[phase.idx]?.id
        if (id) setInk((m) => ({ ...m, [id]: [] }))
      } else if ([' ', 'Enter', 'n', 'N', 'ArrowRight', 'ArrowDown', 'PageDown'].includes(k)) {
        e.preventDefault()
        next()
      } else if (['Backspace', 'p', 'P', 'ArrowLeft', 'ArrowUp', 'PageUp'].includes(k)) {
        e.preventDefault()
        prev()
      } else if (k === 'Home') goTo(0, { noTransition: true })
      else if (k === 'End') goTo(slides.length - 1, { noTransition: true, atEnd: true })
      else if (k === 'b' || k === 'B' || k === '.') setBlank((b) => (b === 'black' ? null : 'black'))
      else if (k === 'w' || k === 'W' || k === ',') setBlank((b) => (b === 'white' ? null : 'white'))
      else if ((k === 'l' || k === 'L') && mod) {
        e.preventDefault()
        setLaserOn((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey, true)
    presenter?.w.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      presenter?.w.removeEventListener('keydown', onKey, true)
    }
  }, [next, prev, goTo, exit, finish, typed, slides, pres.slides, rehearse, kiosk, pen, phase.idx, presenter])

  useEffect(() => {
    const onGoto = (e: Event) => {
      const target = pres.slides[(e as CustomEvent<number>).detail]
      const i = target ? slides.indexOf(target) : -1
      if (i >= 0) goTo(i, { noTransition: true })
    }
    const onNav = (e: Event) => {
      const d = (e as CustomEvent<string>).detail
      if (d === 'next') goTo(phase.idx + 1)
      else if (d === 'prev') goTo(phase.idx - 1, { noTransition: true })
      else if (d === 'first') goTo(0, { noTransition: true })
      else if (d === 'last') goTo(slides.length - 1, { noTransition: true })
    }
    window.addEventListener('kontor:show-goto', onGoto)
    window.addEventListener('kontor:show-nav', onNav)
    return () => {
      window.removeEventListener('kontor:show-goto', onGoto)
      window.removeEventListener('kontor:show-nav', onNav)
    }
  }, [goTo, pres.slides, slides, phase.idx])

  // Automatic steps (with/after previous) and timed advance.
  const slide = slides[phase.idx]
  useEffect(() => {
    if (!slide || ended || paused) return
    const steps = stepsOf(slide)
    const timers: number[] = []
    const trDelay = phase.prev !== null && slide.transition && slide.transition.name !== 'none' ? slide.transition.duration * 1000 : 0
    if (phase.step < steps.length && stepIsAutomatic(steps[phase.step])) {
      timers.push(window.setTimeout(() => setPhase((p) => ({ ...p, step: p.step + 1, prev: null })), trDelay + stepDuration(steps[phase.step - 1]) * 1000))
    } else if (phase.step >= steps.length && (pres.useTimings !== false || kiosk) && !rehearse && slide.transition?.advanceAfter != null) {
      timers.push(window.setTimeout(() => goTo(phase.idx + 1), Math.max(trDelay, slide.transition.advanceAfter * 1000)))
    }
    return () => timers.forEach(clearTimeout)
  }, [slide, phase, ended, paused, pres.useTimings, rehearse, goTo, kiosk, stepsOf])

  // Rehearsal clock.
  useEffect(() => {
    if (!rehearse || paused) return
    const t = window.setInterval(() => {
      setSlideTime((v) => v + 0.1)
      totalRef.current += 0.1
    }, 100)
    return () => clearInterval(t)
  }, [rehearse, paused])

  // Hide the mouse pointer after a few idle seconds.
  useEffect(() => {
    let t = window.setTimeout(() => setIdle(true), 3000)
    const onMove = () => {
      setIdle(false)
      clearTimeout(t)
      t = window.setTimeout(() => setIdle(true), 3000)
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousemove', onMove)
    }
  }, [])

  const scale = box.w && box.h ? fitScale(box, pres.size) : 0
  const penColor = pres.penColor ?? '#E03131'
  const drawing = pen ? { color: pen === 'highlighter' ? '#FFE600' : penColor, width: pen === 'highlighter' ? 18 : 3.5, highlighter: pen === 'highlighter', eraser: pen === 'eraser' } : null
  const slideInk = slide ? ink[slide.id] : undefined
  const setSlideInk = (strokes: Stroke[]) => slide && setInk((m) => ({ ...m, [slide.id]: strokes }))

  function onClick(e: React.MouseEvent) {
    if (e.button !== 0 || menu || pen) return
    const link = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
    if (link) {
      e.preventDefault()
      window.open(link.href, '_blank', 'noopener')
      return
    }
    const trigger = (e.target as HTMLElement).closest<HTMLElement>('[data-trigger]')
    if (trigger?.dataset.trigger) {
      playTrigger(trigger.dataset.trigger)
      return
    }
    const linked = (e.target as HTMLElement).closest<HTMLElement>('[data-link]')
    if (linked?.dataset.link) {
      openLink(linked.dataset.link)
      return
    }
    if (kiosk) return
    if (slide && slide.transition && slide.transition.advanceOnClick === false && !ended) return
    next()
  }

  const menuItems: MenuItem[] = [
    { label: 'Next', onClick: next },
    { label: 'Previous', onClick: prev },
    { label: 'Last Viewed', disabled: phase.prev === null, onClick: () => phase.prev !== null && goTo(phase.prev, { noTransition: true }) },
    'separator',
    { heading: 'Go to Slide' },
    ...slides.slice(0, 30).map((s, i) => ({ label: `${pres.slides.indexOf(s) + 1}. ${slideTitle(s) || 'Slide'}`, active: i === phase.idx, onClick: () => goTo(i, { noTransition: true }) })),
    ...(pres.customShows?.length ? ['separator' as const, { heading: 'Custom Show' }, ...pres.customShows.map((c) => ({ label: c.name, active: customId === c.id, onClick: () => store.set({ show: { ...show, start: 0, custom: c.id } }) }))] : []),
    'separator',
    { label: blank === 'black' ? 'Unblack Screen' : 'Black Screen', onClick: () => setBlank((b) => (b === 'black' ? null : 'black')) },
    { label: blank === 'white' ? 'Unwhite Screen' : 'White Screen', onClick: () => setBlank((b) => (b === 'white' ? null : 'white')) },
    { label: laserOn ? 'Turn off Laser Pointer' : 'Laser Pointer (Ctrl+L)', onClick: () => setLaserOn((v) => !v) },
    { label: 'Pen (Ctrl+P)', active: pen === 'pen', onClick: () => setPen((v) => (v === 'pen' ? null : 'pen')) },
    { label: 'Highlighter (Ctrl+I)', active: pen === 'highlighter', onClick: () => setPen((v) => (v === 'highlighter' ? null : 'highlighter')) },
    { label: 'Eraser (Ctrl+E)', active: pen === 'eraser', onClick: () => setPen((v) => (v === 'eraser' ? null : 'eraser')) },
    { label: 'Erase All Ink on Slide (E)', disabled: !slideInk?.length, onClick: () => setSlideInk([]) },
    { label: 'Arrow (Ctrl+A)', active: !pen, onClick: () => setPen(null) },
    'separator',
    ...(wantPresenter ? [] : [{ label: 'Show Presenter View', onClick: () => store.set({ show: { ...show, start: pres.slides.indexOf(slide), presenter: true } }) } as MenuItem]),
    { label: 'End Show', onClick: rehearse ? finish : exit },
  ]

  const stage = scale > 0 && !ended && <Stage pres={pres} slides={slides} phase={phase} scale={scale} blank={blank} size={pres.size} noAnim={noAnim} ink={slideInk} drawing={drawing} onDraw={setSlideInk} />
  const presenterProps = {
    pres,
    slides,
    phase,
    ended,
    elapsed: () => (Date.now() - startedAt.current) / 1000,
    resetTimer: () => (startedAt.current = Date.now()),
    next,
    prev,
    goTo: (i: number) => goTo(i, { noTransition: true }),
    blank,
    setBlank,
    pen,
    setPen,
    laserOn,
    setLaserOn,
    noAnim,
    ink: slideInk,
    drawing,
    onDraw: setSlideInk,
    exit: rehearse ? finish : exit,
  }

  if (presenterFallback && wantPresenter) return <PresenterView {...presenterProps} standalone />

  return (
    <div
      ref={rootRef}
      className={`slideshow${reading ? ' is-reading' : ''}${idle && !reading ? ' is-idle' : ''}${laserOn ? ' is-laser' : ''}${pen ? ' is-pen' : ''}`}
      role="dialog"
      aria-label={reading ? 'Reading view' : 'Slide show'}
      onContextMenu={(e) => {
        e.preventDefault()
        if (!kiosk) setMenu({ x: e.clientX, y: e.clientY })
      }}
      onMouseMove={(e) => laserOn && setLaser({ x: e.clientX, y: e.clientY })}
    >
      <div className="show-area" ref={stageRef} onClick={onClick}>
        {stage}
        {ended && <div className="show-end">End of slide show, click to exit.</div>}
      </div>
      {laserOn && laser && <div className="laser-dot" style={{ left: laser.x, top: laser.y, background: pres.laserColor ?? undefined }} />}
      {rehearse && (
        <div className="rehearse-bar" onClick={(e) => e.stopPropagation()}>
          <strong>Recording</strong>
          <button type="button" aria-label="Next" title="Next" onClick={next}>
            <ChevronRight size={16} />
          </button>
          <button type="button" aria-label={paused ? 'Resume recording' : 'Pause recording'} onClick={() => setPaused((p) => !p)}>
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <span className="rehearse-time">{fmtTime(slideTime)}</span>
          <button type="button" aria-label="Repeat" title="Repeat" onClick={() => setSlideTime(0)}>
            <RotateCcw size={14} />
          </button>
          <span className="rehearse-total">{fmtTime(timings.current.reduce((a, b) => a + b, 0) + slideTime)}</span>
          <button type="button" aria-label="Close" onClick={finish}>
            <X size={14} />
          </button>
        </div>
      )}
      {reading ? (
        <div className="reading-bar">
          <span>{pres.slides.indexOf(slides[phase.idx]) + 1 > 0 ? `Slide ${pres.slides.indexOf(slides[phase.idx]) + 1} of ${pres.slides.length}` : ''}</span>
          <span className="spacer" />
          <button type="button" aria-label="Previous" title="Previous" onClick={prev}>
            <ChevronLeft size={16} />
          </button>
          <button type="button" aria-label="Menu" title="Menu" onClick={(e) => setMenu({ x: e.clientX, y: e.clientY - 200 })}>
            <Menu size={16} />
          </button>
          <button type="button" aria-label="Next" title="Next" onClick={next}>
            <ChevronRight size={16} />
          </button>
          <button type="button" aria-label="Exit Reading View" title="Exit (Esc)" onClick={exit}>
            <X size={16} />
          </button>
        </div>
      ) : (
        !kiosk && (
          <div className="show-toolbar" onClick={(e) => e.stopPropagation()}>
            <button type="button" aria-label="Previous" onClick={prev}>
              <ChevronLeft size={18} />
            </button>
            <button type="button" aria-label="Next" onClick={next}>
              <ChevronRight size={18} />
            </button>
            <button type="button" aria-label="Pen and laser pointer tools" title="Pen" className={pen ? 'is-active' : undefined} onClick={() => setPen((v) => (v ? null : 'pen'))}>
              <PenLine size={18} />
            </button>
            <button type="button" aria-label="More slide show options" onClick={(e) => setMenu({ x: e.clientX, y: e.clientY - 300 })}>
              <Menu size={18} />
            </button>
            <span className="show-count">
              {pres.slides.indexOf(slides[phase.idx]) + 1} / {pres.slides.length}
            </span>
          </div>
        )
      )}
      {typed && <div className="show-typed">{typed}</div>}
      {menu && <ContextMenu at={menu} items={menuItems} onClose={() => setMenu(null)} />}
      {presenter && createPortal(<PresenterView {...presenterProps} />, presenter.root)}
    </div>
  )
}

type PresenterProps = {
  pres: Presentation
  slides: Slide[]
  phase: Phase
  ended: boolean
  elapsed: () => number
  resetTimer: () => void
  next: () => void
  prev: () => void
  goTo: (i: number) => void
  blank: 'black' | 'white' | null
  setBlank: (f: (b: 'black' | 'white' | null) => 'black' | 'white' | null) => void
  pen: null | 'pen' | 'highlighter' | 'eraser'
  setPen: (p: null | 'pen' | 'highlighter' | 'eraser') => void
  laserOn: boolean
  setLaserOn: (f: (v: boolean) => boolean) => void
  noAnim: boolean
  ink?: Stroke[]
  drawing: { color: string; width: number; highlighter?: boolean; eraser?: boolean } | null
  onDraw: (s: Stroke[]) => void
  exit: () => void
  standalone?: boolean
}

/** Presenter view: current slide, next slide, notes, timer and navigation (in its own window). */
function PresenterView(props: PresenterProps) {
  const { pres, slides, phase } = props
  const curRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLDivElement>(null)
  const curBox = useBox(curRef)
  const nextBox = useBox(nextRef)
  const [, tick] = useState(0)
  const [paused, setPaused] = useState(false)
  const [pausedAt, setPausedAt] = useState(0)
  const [fontSize, setFontSize] = useState(18)
  const [grid, setGrid] = useState(false)
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const slide = slides[phase.idx]
  const steps = slide && !props.noAnim ? animationSteps(slide) : []
  const nextIsStep = phase.step < steps.length
  const nextSlide = slides[phase.idx + 1]
  const elapsed = paused ? pausedAt : props.elapsed()
  const curScale = curBox.w ? fitScale(curBox, pres.size) : 0
  const nextScale = nextBox.w ? fitScale(nextBox, pres.size) : 0
  const realIndex = (s: Slide) => pres.slides.indexOf(s)
  return (
    <div className={`presenter${props.standalone ? ' is-standalone' : ''}`} role="dialog" aria-label="Presenter view">
      <div className="pv-top">
        <span className="pv-timer">
          {fmtTime(elapsed)}
          <button type="button" aria-label={paused ? 'Resume timer' : 'Pause timer'} onClick={() => (paused ? (props.resetTimer(), setPaused(false)) : (setPausedAt(props.elapsed()), setPaused(true)))}>
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <button type="button" aria-label="Restart timer" onClick={() => (props.resetTimer(), setPausedAt(0))}>
            <RotateCcw size={14} />
          </button>
        </span>
        <span className="pv-clock">{new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
        <span className="spacer" />
        <button type="button" className="pv-end" onClick={props.exit}>
          End Slide Show
        </button>
      </div>
      {grid ? (
        <div className="pv-grid">
          {slides.map((s, i) => (
            <button key={s.id} type="button" className={i === phase.idx ? 'is-current' : undefined} onClick={() => (props.goTo(i), setGrid(false))}>
              <span className="pv-thumb" style={{ width: 180, height: (pres.size.h / pres.size.w) * 180 }}>
                <SlideView slide={s} index={realIndex(s)} {...presProps(pres)} mode="thumb" style={{ transform: `scale(${180 / pres.size.w})`, transformOrigin: '0 0' }} />
              </span>
              <span>{realIndex(s) + 1}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="pv-main">
          <div className="pv-current" ref={curRef}>
            {curScale > 0 && !props.ended && <Stage pres={pres} slides={slides} phase={{ ...phase, prev: null }} scale={curScale} blank={props.blank} size={pres.size} noAnim={props.noAnim} ink={props.ink} drawing={props.drawing} onDraw={props.onDraw} />}
            {props.ended && <div className="show-end">End of slide show</div>}
          </div>
          <div className="pv-side">
            <div className="pv-next-label">{nextIsStep ? 'Next animation' : nextSlide ? 'Next slide' : 'End of slide show'}</div>
            <div className="pv-next" ref={nextRef}>
              {nextScale > 0 && (nextIsStep ? slide : nextSlide) && (
                <Stage pres={pres} slides={slides} phase={nextIsStep ? { idx: phase.idx, step: phase.step + 1, prev: null, key: -1, trig: phase.trig } : { idx: phase.idx + 1, step: 0, prev: null, key: -1 }} scale={nextScale} blank={null} size={pres.size} noAnim />
              )}
            </div>
            <div className="pv-notes" style={{ fontSize }}>
              {slide?.notes || <span className="pv-empty">No notes.</span>}
            </div>
            <div className="pv-notes-tools">
              <button type="button" aria-label="Make the text larger" title="Make the text larger" onClick={() => setFontSize((f) => Math.min(48, f + 2))}>
                A+
              </button>
              <button type="button" aria-label="Make the text smaller" title="Make the text smaller" onClick={() => setFontSize((f) => Math.max(10, f - 2))}>
                A−
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="pv-bottom">
        <button type="button" aria-label="Pen" title="Pen (Ctrl+P)" className={props.pen === 'pen' ? 'is-active' : undefined} onClick={() => props.setPen(props.pen === 'pen' ? null : 'pen')}>
          <PenLine size={16} />
        </button>
        <button type="button" aria-label="Highlighter" title="Highlighter (Ctrl+I)" className={props.pen === 'highlighter' ? 'is-active' : undefined} onClick={() => props.setPen(props.pen === 'highlighter' ? null : 'highlighter')}>
          <Highlighter size={16} />
        </button>
        <button type="button" aria-label="Laser Pointer" title="Laser Pointer (Ctrl+L)" className={props.laserOn ? 'is-active' : undefined} onClick={() => props.setLaserOn((v) => !v)}>
          <Pointer size={16} />
        </button>
        <button type="button" aria-label="See all slides" title="See all slides" className={grid ? 'is-active' : undefined} onClick={() => setGrid((g) => !g)}>
          <LayoutGrid size={16} />
        </button>
        <button type="button" aria-label="Black or unblack slide show" title="Black or unblack slide show (B)" className={props.blank === 'black' ? 'is-active' : undefined} onClick={() => props.setBlank((b) => (b === 'black' ? null : 'black'))}>
          <MonitorOff size={16} />
        </button>
        <span className="spacer" />
        <button type="button" aria-label="Previous" onClick={props.prev}>
          <ChevronLeft size={18} />
        </button>
        <span className="pv-count">
          Slide {slide ? realIndex(slide) + 1 : '–'} of {pres.slides.length}
        </span>
        <button type="button" aria-label="Next" onClick={props.next}>
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )
}

function openLink(href: string) {
  if (href.startsWith('#sid:')) {
    const i = store.get().pres.slides.findIndex((s) => s.id === href.slice(5))
    if (i >= 0) window.dispatchEvent(new CustomEvent('kontor:show-goto', { detail: i }))
    return
  }
  const m = /^#slide(\d+)$/.exec(href)
  if (m) {
    window.dispatchEvent(new CustomEvent('kontor:show-goto', { detail: Number(m[1]) - 1 }))
    return
  }
  if (href === '#next' || href === '#prev' || href === '#first' || href === '#last') {
    window.dispatchEvent(new CustomEvent('kontor:show-nav', { detail: href.slice(1) }))
    return
  }
  window.open(href, '_blank', 'noopener')
}

export function slideTitle(s: Slide) {
  const t = s.elements.find((e) => e.type === 'shape' && e.placeholder && ['title', 'ctrTitle', 'sectionTitle', 'captionTitle'].includes(e.placeholder.style))
  if (!t || t.type !== 'shape' || !t.text) return ''
  return t.text.doc.content.map((p) => (p.content ?? []).map((n) => (n.type === 'text' ? n.text : ' ')).join('')).join(' ').trim()
}

/** Plays the current slide's transition or animations in place of the editing canvas. */
export function Preview({ kind, slideIndex, onDone }: { kind: 'transition' | 'animations'; slideIndex: number; onDone: () => void }) {
  const pres = useStore((s) => s.pres)
  const ref = useRef<HTMLDivElement>(null)
  const box = useBox(ref)
  const slide = pres.slides[slideIndex]
  const steps = useMemo(() => animationSteps(slide), [slide])
  const [step, setStep] = useState(kind === 'animations' ? 1 : steps.length)
  const scale = box.w ? fitScale({ w: box.w - 56, h: box.h - 56 }, pres.size) : 0
  const slides = useMemo(() => {
    const prevSlide = slideIndex > 0 ? pres.slides[slideIndex - 1] : null
    return prevSlide ? [prevSlide, slide] : [{ ...slide, id: 'black', elements: [], background: { type: 'solid' as const, color: '#000000' }, hideBackgroundGraphics: true, transition: null }, slide]
  }, [pres.slides, slide, slideIndex])

  useEffect(() => {
    if (kind === 'transition') {
      const t = window.setTimeout(onDone, (slide.transition?.duration ?? 1) * 1000 + 300)
      return () => clearTimeout(t)
    }
    if (step > steps.length) {
      const t = window.setTimeout(onDone, 300)
      return () => clearTimeout(t)
    }
    const t = window.setTimeout(() => setStep((s) => s + 1), stepDuration(steps[step - 1]) * 1000 + 150)
    return () => clearTimeout(t)
  }, [kind, step, steps, slide, onDone])

  return (
    <div className="preview-overlay" ref={ref} onClick={onDone}>
      {scale > 0 && (
        <Stage pres={pres} slides={slides} phase={{ idx: 1, step: Math.min(step, steps.length), prev: kind === 'transition' ? 0 : null, key: 1 }} scale={scale} blank={null} size={pres.size} />
      )}
    </div>
  )
}
