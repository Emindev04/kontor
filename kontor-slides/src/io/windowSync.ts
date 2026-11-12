// View > New Window: more windows on the same presentation. The windows of this program in the
// same browser (or desktop app) keep their documents in step through a BroadcastChannel.
import { applyRemoteDocument, store } from '../store/store'
import type { Presentation } from '../model/types'

type Message =
  | { type: 'hello'; from: string }
  | { type: 'doc'; from: string; pres: Presentation; title: string; stamp: number }
  | { type: 'here'; from: string; title: string; n: number }
  | { type: 'focus'; to: string }
  | { type: 'bye'; from: string }

const id = Math.random().toString(36).slice(2)
let channel: BroadcastChannel | null = null
let applying = false
let lastStamp = 0
/** A window opened with New Window sends its changes only after it has the current document. */
let synced = true
const others = new Map<string, { title: string; n: number }>()
const opened: Window[] = []
const listeners = new Set<() => void>()
/** Number of this window (1 for the first one), shown in the title bar like "Name:2". */
export let windowNumber = Number(new URLSearchParams(location.search).get('window') ?? 1) || 1

function post(m: Message) {
  try {
    channel?.postMessage(m)
  } catch {
    // Data that cannot be cloned (should not happen): the other windows keep their copy.
  }
}

/** Starts listening; returns a cleanup function. */
export function initWindowSync(): () => void {
  if (typeof BroadcastChannel === 'undefined' || channel) return () => undefined
  channel = new BroadcastChannel('kontor-slides-windows')
  synced = windowNumber === 1
  channel.onmessage = (e: MessageEvent<Message>) => {
    const m = e.data
    if (m.type === 'hello') {
      others.set(m.from, { title: '', n: 0 })
      post({ type: 'here', from: id, title: store.get().title, n: windowNumber })
      if (synced) post({ type: 'doc', from: id, pres: store.get().pres, title: store.get().title, stamp: Date.now() })
    } else if (m.type === 'here') {
      others.set(m.from, { title: m.title, n: m.n })
      listeners.forEach((l) => l())
    } else if (m.type === 'bye') {
      others.delete(m.from)
      listeners.forEach((l) => l())
    } else if (m.type === 'focus' && m.to === id) window.focus()
    else if (m.type === 'doc' && m.from !== id && m.stamp > lastStamp) {
      lastStamp = m.stamp
      synced = true
      if (m.pres === store.get().pres) return
      applying = true
      applyRemoteDocument(m.pres, m.title)
      applying = false
    }
  }
  // Local changes go to the other windows.
  let pres = store.get().pres
  let title = store.get().title
  const unsub = store.subscribe(() => {
    const s = store.get()
    if (s.pres === pres && s.title === title) return
    pres = s.pres
    title = s.title
    if (applying || !others.size || !synced) return
    lastStamp = Date.now()
    post({ type: 'doc', from: id, pres, title, stamp: lastStamp })
  })
  post({ type: 'hello', from: id })
  const bye = () => post({ type: 'bye', from: id })
  window.addEventListener('beforeunload', bye)
  return () => {
    unsub()
    window.removeEventListener('beforeunload', bye)
    bye()
    channel?.close()
    channel = null
  }
}

/** Opens another window on this presentation. */
export function openNewWindow() {
  const n = Math.max(windowNumber, ...[...others.values()].map((o) => o.n)) + 1
  const url = new URL(location.href)
  url.searchParams.set('window', String(n))
  const w = window.open(url.toString(), `kontor-slides-${n}`, `width=${Math.round(screen.availWidth * 0.6)},height=${Math.round(screen.availHeight * 0.7)}`)
  if (w) opened.push(w)
  return !!w
}

/** The other windows of this program, for View > Switch Windows. */
export function otherWindows() {
  return [...others.entries()].filter(([, o]) => o.n > 0).map(([wid, o]) => ({ id: wid, title: o.title, n: o.n }))
}

export function onWindowsChange(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function focusWindow(wid: string) {
  post({ type: 'focus', to: wid })
}

/** Arrange All (side by side) or Cascade for this window and the windows it opened. */
export function arrangeWindows(mode: 'tile' | 'cascade') {
  const list = [window, ...opened.filter((w) => !w.closed)]
  const W = screen.availWidth
  const H = screen.availHeight
  list.forEach((w, i) => {
    try {
      if (mode === 'tile') {
        const cw = Math.floor(W / list.length)
        w.resizeTo(cw, H)
        w.moveTo(i * cw, 0)
      } else {
        w.resizeTo(Math.round(W * 0.7), Math.round(H * 0.75))
        w.moveTo(i * 32, i * 32)
      }
    } catch {
      // The browser does not allow moving this window.
    }
  })
  return list.length
}

export function setWindowNumber(n: number) {
  windowNumber = n
}
