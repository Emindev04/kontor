// Animations as PresentationML timing trees (p:timing): written so other programs play them,
// and read back from .pptx files.
import type { AnimEntry, Slide } from '../model/types'
import { animationSteps, triggerSteps, type AnimItem } from '../model/effects'

type Preset = { cls: 'entr' | 'emph' | 'exit' | 'path'; id: number }

const PRESETS: Record<string, Preset> = {
  appear: { cls: 'entr', id: 1 },
  fade: { cls: 'entr', id: 10 },
  flyIn: { cls: 'entr', id: 2 },
  floatIn: { cls: 'entr', id: 42 },
  split: { cls: 'entr', id: 16 },
  wipe: { cls: 'entr', id: 22 },
  shape: { cls: 'entr', id: 6 },
  wheel: { cls: 'entr', id: 21 },
  randomBars: { cls: 'entr', id: 14 },
  grow: { cls: 'entr', id: 31 },
  zoom: { cls: 'entr', id: 53 },
  swivel: { cls: 'entr', id: 45 },
  bounce: { cls: 'entr', id: 26 },
  pulse: { cls: 'emph', id: 26 },
  colorPulse: { cls: 'emph', id: 27 },
  teeter: { cls: 'emph', id: 32 },
  spin: { cls: 'emph', id: 8 },
  growShrink: { cls: 'emph', id: 6 },
  desaturate: { cls: 'emph', id: 25 },
  darken: { cls: 'emph', id: 24 },
  lighten: { cls: 'emph', id: 30 },
  transparency: { cls: 'emph', id: 9 },
  flash: { cls: 'emph', id: 35 },
  wave: { cls: 'emph', id: 34 },
  disappear: { cls: 'exit', id: 1 },
  fadeOut: { cls: 'exit', id: 10 },
  flyOut: { cls: 'exit', id: 2 },
  floatOut: { cls: 'exit', id: 42 },
  splitOut: { cls: 'exit', id: 16 },
  wipeOut: { cls: 'exit', id: 22 },
  shapeOut: { cls: 'exit', id: 6 },
  randomBarsOut: { cls: 'exit', id: 14 },
  shrinkTurn: { cls: 'exit', id: 31 },
  zoomOut: { cls: 'exit', id: 53 },
  swivelOut: { cls: 'exit', id: 45 },
  bounceOut: { cls: 'exit', id: 26 },
}

const DIR_SUB: Record<string, number> = { up: 1, right: 2, down: 4, left: 8 }

function samplePath(d: string, w: number, h: number) {
  // The format only allows M/L/C commands in slide-relative units; sample the path into lines.
  if (typeof document === 'undefined') return 'M 0 0 E'
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  p.setAttribute('d', d)
  let len = 0
  try {
    len = p.getTotalLength()
  } catch {
    len = 0
  }
  const n = Math.max(2, Math.min(60, Math.ceil(len / 12)))
  const pts: string[] = []
  for (let i = 0; i <= n; i++) {
    const q = len ? p.getPointAtLength((len * i) / n) : { x: 0, y: 0 }
    pts.push(`${(q.x / w).toFixed(5)} ${(q.y / h).toFixed(5)}`)
  }
  return `M ${pts[0]} ${pts.slice(1).map((x) => `L ${x}`).join(' ')} E`
}

class Writer {
  id = 1
  next() {
    return ++this.id
  }
}

/** A shape (spid) or one of its paragraphs ("spid:paragraph"). */
type Target = number | string

function spTgt(t: Target) {
  const [spid, para] = String(t).split(':')
  return para === undefined ? `<p:spTgt spid="${spid}"/>` : `<p:spTgt spid="${spid}"><p:txEl><p:pRg st="${para}" end="${para}"/></p:txEl></p:spTgt>`
}

function cBhvr(w: Writer, spid: Target, dur: number | string, attrs: string[] = [], extra = '', delay?: number) {
  const names = attrs.length ? `<p:attrNameLst>${attrs.map((a) => `<p:attrName>${a}</p:attrName>`).join('')}</p:attrNameLst>` : ''
  const cond = delay !== undefined ? `<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>` : ''
  return `<p:cBhvr${extra}><p:cTn id="${w.next()}" dur="${dur}" fill="hold">${cond}</p:cTn><p:tgtEl>${spTgt(spid)}</p:tgtEl>${names}</p:cBhvr>`
}

const setVis = (w: Writer, spid: Target, val: 'visible' | 'hidden', delay = 0) => `<p:set>${cBhvr(w, spid, 1, ['style.visibility'], '', delay)}<p:to><p:strVal val="${val}"/></p:to></p:set>`

function flyAnim(w: Writer, spid: Target, dur: number, dir: string, out: boolean) {
  const off: Record<string, [string, string]> = { down: ['#ppt_x', '1+#ppt_h/2'], up: ['#ppt_x', '0-#ppt_h/2'], left: ['0-#ppt_w/2', '#ppt_y'], right: ['1+#ppt_w/2', '#ppt_y'] }
  const [x, y] = off[dir] ?? off.down
  const anim = (attr: string, from: string, to: string) =>
    `<p:anim calcmode="lin" valueType="num">${cBhvr(w, spid, dur, [attr], ' additive="base"')}<p:tavLst><p:tav tm="0"><p:val><p:strVal val="${from}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${to}"/></p:val></p:tav></p:tavLst></p:anim>`
  return out ? anim('ppt_x', '#ppt_x', x) + anim('ppt_y', '#ppt_y', y) : anim('ppt_x', x, '#ppt_x') + anim('ppt_y', y, '#ppt_y')
}

function filterFor(e: AnimEntry) {
  const wipeDir: Record<string, string> = { down: 'up', up: 'down', left: 'right', right: 'left' }
  if (e.name.startsWith('wipe')) return `wipe(${wipeDir[e.direction ?? 'down'] ?? 'down'})`
  if (e.name.startsWith('split')) return 'barn(inVertical)'
  if (e.name.startsWith('shape')) return 'circle(in)'
  if (e.name === 'wheel') return 'wheel(1)'
  if (e.name.startsWith('randomBars')) return 'randombar(horizontal)'
  return 'fade'
}

function behaviors(w: Writer, e: AnimEntry, spid: Target, size: { w: number; h: number }) {
  const dur = Math.round(e.duration * 1000)
  if (e.effect === 'path') return `<p:animMotion origin="layout" path="${samplePath(e.path ?? 'M0 0', size.w, size.h)}" pathEditMode="relative" ptsTypes="">${cBhvr(w, spid, dur, ['ppt_x', 'ppt_y'])}</p:animMotion>`
  if (e.effect === 'entrance') {
    if (e.name === 'appear') return setVis(w, spid, 'visible')
    if (e.name === 'flyIn' || e.name === 'bounce') return setVis(w, spid, 'visible') + flyAnim(w, spid, dur, e.name === 'bounce' ? 'up' : (e.direction ?? 'down'), false)
    return setVis(w, spid, 'visible') + `<p:animEffect transition="in" filter="${filterFor(e)}">${cBhvr(w, spid, dur)}</p:animEffect>`
  }
  if (e.effect === 'exit') {
    if (e.name === 'disappear') return setVis(w, spid, 'hidden')
    const main = e.name === 'flyOut' || e.name === 'bounceOut' ? flyAnim(w, spid, dur, e.name === 'bounceOut' ? 'down' : (e.direction ?? 'down'), true) : `<p:animEffect transition="out" filter="${filterFor(e)}">${cBhvr(w, spid, dur)}</p:animEffect>`
    return main + setVis(w, spid, 'hidden', Math.max(0, dur - 1))
  }
  // Emphasis.
  switch (e.name) {
    case 'spin':
      return `<p:animRot by="21600000">${cBhvr(w, spid, dur, ['r'])}</p:animRot>`
    case 'teeter':
      return `<p:animRot by="240000">${cBhvr(w, spid, Math.round(dur / 4), ['r'])}</p:animRot>`
    case 'growShrink':
      return `<p:animScale>${cBhvr(w, spid, dur)}<p:by x="150000" y="150000"/></p:animScale>`
    case 'pulse':
      return `<p:animScale>${cBhvr(w, spid, Math.round(dur / 2)).replace('fill="hold"', 'fill="hold" autoRev="1"')}<p:by x="105000" y="105000"/></p:animScale>`
    case 'transparency':
      return `<p:set>${cBhvr(w, spid, dur, ['style.opacity'])}<p:to><p:strVal val="0.5"/></p:to></p:set>`
    default:
      return `<p:animEffect transition="in" filter="fade">${cBhvr(w, spid, dur)}</p:animEffect>`
  }
}

function effectPar(w: Writer, item: AnimItem, spid: number, offset: number, nodeType: string, grpId: number, size: { w: number; h: number }) {
  const e = item.entry
  const preset = e.effect === 'path' ? { cls: 'path', id: 0 } : (PRESETS[e.name] ?? { cls: e.effect === 'exit' ? 'exit' : e.effect === 'emphasis' ? 'emph' : 'entr', id: 10 })
  const sub = DIR_SUB[e.direction ?? ''] ?? 0
  const repeat = e.repeat && e.repeat > 1 ? ` repeatCount="${e.repeat * 1000}"` : ''
  const id = w.next()
  const target: Target = item.para !== undefined ? `${spid}:${item.para}` : spid
  // Word/letter animation: the effect repeats over the text with 10 % of its time between units.
  const iterate = e.textUnit && item.para !== undefined ? `<p:iterate type="${e.textUnit === 'word' ? 'wd' : 'lt'}"><p:tmPct val="10000"/></p:iterate>` : ''
  return `<p:par><p:cTn id="${id}" presetID="${preset.id}" presetClass="${preset.cls}" presetSubtype="${sub}"${repeat} fill="hold" grpId="${grpId}" nodeType="${nodeType}"><p:stCondLst><p:cond delay="${Math.round((item.delay - offset) * 1000)}"/></p:stCondLst>${iterate}<p:childTnLst>${behaviors(w, e, target, size)}</p:childTnLst></p:cTn></p:par>`
}

/** Builds the click groups: each click step holds parallel groups that start at their own offset. */
function stepPars(w: Writer, steps: AnimItem[][], spidOf: (id: string) => number | undefined, size: { w: number; h: number }, interactive = false) {
  return steps
    .map((step) => {
      // Effects that start together form one group; "after previous" opens a new group.
      const groups: { offset: number; items: AnimItem[] }[] = []
      for (const it of step) {
        const startsGroup = !groups.length || it.entry.trigger === 'after'
        const offset = it.delay - it.entry.delay
        if (startsGroup) groups.push({ offset, items: [] })
        groups[groups.length - 1].items.push(it)
      }
      const inner = groups
        .map((g) => {
          const effects = g.items
            .map((it, i) => {
              const spid = spidOf(it.el.id)
              if (spid === undefined) return ''
              const node = interactive ? 'clickEffect' : it.entry.trigger === 'click' && i === 0 && g === groups[0] ? 'clickEffect' : it.entry.trigger === 'after' && i === 0 ? 'afterEffect' : 'withEffect'
              return effectPar(w, it, spid, g.offset, node, 0, size)
            })
            .join('')
          return `<p:par><p:cTn id="${w.next()}" fill="hold"><p:stCondLst><p:cond delay="${Math.round(g.offset * 1000)}"/></p:stCondLst><p:childTnLst>${effects}</p:childTnLst></p:cTn></p:par>`
        })
        .join('')
      const auto = !interactive && step[0]?.entry.trigger !== 'click'
      return `<p:par><p:cTn id="${w.next()}" fill="hold"><p:stCondLst><p:cond delay="${auto ? 0 : 'indefinite'}"/>${auto ? '<p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>' : ''}</p:stCondLst><p:childTnLst>${inner}</p:childTnLst></p:cTn></p:par>`
    })
    .join('')
}

export function timingXml(slide: Slide, spidOf: (id: string) => number | undefined, size: { w: number; h: number }) {
  const steps = animationSteps(slide)
  const triggers = triggerSteps(slide)
  if (!steps.length && !triggers.size) return ''
  const w = new Writer()
  const mainId = w.next()
  const main = steps.length
    ? `<p:seq concurrent="1" nextAc="seek"><p:cTn id="${mainId}" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${stepPars(w, steps, spidOf, size)}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>`
    : ''
  const interactive = [...triggers.entries()]
    .map(([trigId, items]) => {
      const spid = spidOf(trigId)
      if (spid === undefined || !items.length) return ''
      return `<p:seq concurrent="1" nextAc="seek"><p:cTn id="${w.next()}" restart="whenNotActive" fill="hold" evtFilter="cancelBubble" nodeType="interactiveSeq"><p:stCondLst><p:cond evt="onClick" delay="0"><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cond></p:stCondLst><p:endSync evt="end" delay="0"><p:rtn val="all"/></p:endSync><p:childTnLst>${stepPars(w, [items], spidOf, size, true)}</p:childTnLst></p:cTn><p:nextCondLst><p:cond evt="onClick" delay="0"><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cond></p:nextCondLst></p:seq>`
    })
    .join('')
  // Shapes whose text plays paragraph by paragraph are listed as paragraph builds.
  const built = [...new Set((slide.animations ?? []).filter((a) => a.textBuild === 'paragraph' || a.textUnit).map((a) => a.targetId))]
    .map((id) => spidOf(id))
    .filter((x): x is number => x !== undefined)
  const bldLst = built.length ? `<p:bldLst>${built.map((spid) => `<p:bldP spid="${spid}" grpId="0" build="p"/>`).join('')}</p:bldLst>` : ''
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>${main}${interactive}</p:childTnLst></p:cTn></p:par></p:tnLst>${bldLst}</p:timing>`
}

// ---------- Import ----------

const REVERSE: Record<string, string> = {}
for (const [name, p] of Object.entries(PRESETS)) REVERSE[`${p.cls}:${p.id}`] ??= name
// Common presets of the original program that map onto our closest effect.
Object.assign(REVERSE, { 'entr:3': 'randomBars', 'entr:4': 'shape', 'entr:5': 'randomBars', 'entr:8': 'shape', 'entr:9': 'fade', 'entr:12': 'wipe', 'entr:17': 'wipe', 'entr:18': 'wipe', 'entr:23': 'zoom', 'entr:37': 'floatIn', 'entr:47': 'floatIn', 'entr:55': 'zoom', 'exit:3': 'randomBarsOut', 'exit:9': 'fadeOut', 'exit:23': 'zoomOut', 'exit:37': 'floatOut', 'exit:47': 'floatOut', 'emph:1': 'colorPulse', 'emph:3': 'colorPulse' })

const SUB_DIR: Record<number, AnimEntry['direction']> = { 1: 'up', 2: 'right', 4: 'down', 8: 'left' }

function kids(el: Element | null | undefined, local: string): Element[] {
  return el ? Array.from(el.children).filter((c) => c.localName === local) : []
}

function kid(el: Element | null | undefined, local: string): Element | null {
  return kids(el, local)[0] ?? null
}

function delayOf(cTn: Element | null) {
  const d = kid(kid(cTn, 'stCondLst'), 'cond')?.getAttribute('delay')
  return d && d !== 'indefinite' ? Number(d) / 1000 : 0
}

function pathToPx(path: string, w: number, h: number) {
  const tokens = path.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? []
  let out = ''
  let i = 0
  let axis = 0
  for (const t of tokens) {
    if (/^[a-zA-Z]$/.test(t)) {
      if (t === 'E' || t === 'e') continue
      out += `${t.toUpperCase() === 'Z' ? 'Z' : t.toUpperCase()} `
      axis = 0
      continue
    }
    const v = Number(t) * (axis % 2 === 0 ? w : h)
    out += `${Math.round(v * 10) / 10} `
    axis++
    i++
  }
  return out.trim() || 'M0 0'
}

function readEffect(par: Element, spids: Map<string, string>, size: { w: number; h: number }, triggerId: string | null): AnimEntry | null {
  const cTn = kid(par, 'cTn')
  if (!cTn) return null
  const cls = cTn.getAttribute('presetClass')
  if (!cls) return null
  const spid = par.getElementsByTagNameNS('*', 'spTgt')[0]?.getAttribute('spid') ?? ''
  const targetId = spids.get(spid)
  if (!targetId) return null
  const presetId = Number(cTn.getAttribute('presetID') ?? 0)
  const sub = Number(cTn.getAttribute('presetSubtype') ?? 0)
  const node = cTn.getAttribute('nodeType')
  let dur = 0
  for (const t of Array.from(par.getElementsByTagNameNS('*', 'cTn'))) {
    const d = t.getAttribute('dur')
    const factor = t.getAttribute('autoRev') === '1' ? 2 : 1
    if (d && d !== 'indefinite' && Number(d) > 1) dur = Math.max(dur, (Number(d) * factor) / 1000 + delayOf(t))
  }
  const effect: AnimEntry['effect'] = cls === 'entr' ? 'entrance' : cls === 'exit' ? 'exit' : cls === 'path' ? 'path' : 'emphasis'
  const motion = par.getElementsByTagNameNS('*', 'animMotion')[0]
  const name = effect === 'path' ? 'custom' : (REVERSE[`${cls}:${presetId}`] ?? (effect === 'entrance' ? 'fade' : effect === 'exit' ? 'fadeOut' : 'pulse'))
  const repeat = Number(cTn.getAttribute('repeatCount') ?? 0) / 1000
  return {
    id: `a${Math.random().toString(36).slice(2, 10)}`,
    targetId,
    effect,
    name,
    direction: SUB_DIR[sub] && ['flyIn', 'floatIn', 'wipe', 'flyOut', 'floatOut', 'wipeOut'].includes(name) ? SUB_DIR[sub] : undefined,
    trigger: node === 'clickEffect' ? 'click' : node === 'afterEffect' ? 'after' : 'with',
    duration: Math.max(0.1, Math.round((dur || 0.5) * 100) / 100),
    delay: Math.max(0, delayOf(cTn)),
    repeat: repeat > 1 ? Math.round(repeat) : undefined,
    path: motion ? pathToPx(motion.getAttribute('path') ?? '', size.w, size.h) : undefined,
    triggerId,
    ...(par.getElementsByTagNameNS('*', 'pRg').length ? { textBuild: 'paragraph' as const } : {}),
    ...(() => {
      const it = kid(cTn, 'iterate')?.getAttribute('type')
      return it === 'wd' ? { textUnit: 'word' as const } : it === 'lt' ? { textUnit: 'letter' as const } : {}
    })(),
  }
}

/** Effects of the original that target single paragraphs come one per paragraph; keep one "By Paragraph" effect. */
function foldParagraphs(entries: AnimEntry[]): AnimEntry[] {
  const out: AnimEntry[] = []
  for (const e of entries) {
    const prev = out[out.length - 1]
    if (e.textBuild === 'paragraph' && prev?.textBuild === 'paragraph' && prev.targetId === e.targetId && prev.name === e.name && prev.effect === e.effect && prev.triggerId === e.triggerId) continue
    out.push(e)
  }
  return out
}

/** Reads the animation sequence of a slide; `spids` maps the file's shape ids to element ids. */
export function readTiming(sld: Element, spids: Map<string, string>, size: { w: number; h: number }): AnimEntry[] {
  const timing = kid(sld, 'timing')
  if (!timing) return []
  const out: AnimEntry[] = []
  for (const seqCTn of Array.from(timing.getElementsByTagNameNS('*', 'cTn'))) {
    const type = seqCTn.getAttribute('nodeType')
    if (type !== 'mainSeq' && type !== 'interactiveSeq') continue
    let triggerId: string | null = null
    if (type === 'interactiveSeq') {
      const spid = kid(seqCTn, 'stCondLst')?.getElementsByTagNameNS('*', 'spTgt')[0]?.getAttribute('spid') ?? ''
      triggerId = spids.get(spid) ?? null
      if (!triggerId) continue
    }
    for (const clickPar of kids(kid(seqCTn, 'childTnLst'), 'par')) {
      for (const groupPar of kids(kid(kid(clickPar, 'cTn'), 'childTnLst'), 'par')) {
        for (const effPar of kids(kid(kid(groupPar, 'cTn'), 'childTnLst'), 'par')) {
          const e = readEffect(effPar, spids, size, triggerId)
          if (e) out.push(e)
        }
      }
    }
  }
  return foldParagraphs(out)
}
