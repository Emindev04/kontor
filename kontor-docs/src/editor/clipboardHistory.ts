// The Clipboard pane's list: what was cut or copied in the document (the newest first, up to 24
// items, like the original's Office-style clipboard). Kept for this browser tab only.

export type ClipItem = { id: number; html: string; text: string; time: number }

let items: ClipItem[] = []
let nextId = 1
const listeners = new Set<() => void>()

export const clipboardItems = () => items

export function subscribeClipboard(fn: () => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

const notify = () => listeners.forEach((fn) => fn())

export function addClipItem(html: string, text: string) {
  if (!text.trim() && !/<img/i.test(html)) return
  items = [{ id: nextId++, html, text, time: Date.now() }, ...items.filter((i) => i.text !== text || i.html !== html)].slice(0, 24)
  notify()
}

export function removeClipItem(id: number) {
  items = items.filter((i) => i.id !== id)
  notify()
}

export function clearClipItems() {
  items = []
  notify()
}

/** Records cuts and copies made in the editors (keyboard, context menu and ribbon buttons). */
export function watchClipboard(root: Document | HTMLElement = document) {
  const onCopy = (e: ClipboardEvent) => {
    if (!(e.target instanceof Node) || !(e.target instanceof Element ? e.target : e.target.parentElement)?.closest('.ProseMirror')) return
    // The editor has filled the clipboard data by now (its handler runs first); it can only be read
    // while the event is being dispatched.
    const data = e.clipboardData
    const html = data?.getData('text/html') ?? ''
    const text = data?.getData('text/plain') || window.getSelection()?.toString() || ''
    addClipItem(html, text)
  }
  root.addEventListener('copy', onCopy as EventListener)
  root.addEventListener('cut', onCopy as EventListener)
  return () => {
    root.removeEventListener('copy', onCopy as EventListener)
    root.removeEventListener('cut', onCopy as EventListener)
  }
}
