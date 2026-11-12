import { useSyncExternalStore } from 'react'
import type { Editor } from '@tiptap/core'

// The text editor that is currently open on the slide (only one at a time).
let active: Editor | null = null
let version = 0
const subs = new Set<() => void>()

export function setActiveEditor(editor: Editor | null) {
  active = editor
  bumpEditor()
}

export function getActiveEditor(): Editor | null {
  return active && !active.isDestroyed ? active : null
}

export function bumpEditor() {
  version++
  subs.forEach((f) => f())
}

/** Re-renders the caller whenever the active editor's selection or content changes. */
export function useEditorVersion() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => version,
  )
}
