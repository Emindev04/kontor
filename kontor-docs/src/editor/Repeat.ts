import { Extension } from '@tiptap/core'
import type { Mark as PMMark, Node as PMNode, Slice } from '@tiptap/pm/model'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import { AddMarkStep, RemoveMarkStep, ReplaceAroundStep, ReplaceStep, AttrStep } from '@tiptap/pm/transform'
import { isHistoryTransaction } from '@tiptap/pm/history'

// Repeat (F4, or Ctrl+Y when there is nothing to redo): does the last formatting or typing again at
// the current selection, like the original's Repeat command.

type Action =
  | { kind: 'marks'; add: PMMark[]; remove: PMMark[] }
  | { kind: 'text'; text: string; open: boolean }
  | { kind: 'block'; attrs: Record<string, unknown> }
  | { kind: 'slice'; slice: Slice }

const repeatKey = new PluginKey<{ action: Action | null }>('repeat')
const SKIP = new Set(['insertion', 'deletion', 'formatChange', 'comment'])

/** What a user transaction did, as something that can be done again elsewhere. */
function actionOf(tr: Transaction, prev: Action | null): Action | null {
  const steps = tr.steps
  if (!steps.length) return prev
  if (steps.every((s) => s instanceof AddMarkStep || s instanceof RemoveMarkStep)) {
    const add: PMMark[] = []
    const remove: PMMark[] = []
    for (const s of steps as unknown as { mark: PMMark }[]) {
      if (SKIP.has(s.mark.type.name)) continue
      const list = s instanceof AddMarkStep ? add : remove
      if (!list.some((m) => m.eq(s.mark))) list.push(s.mark)
    }
    return add.length || remove.length ? { kind: 'marks', add, remove } : prev
  }
  // Paragraph formatting: the attributes that changed on the textblocks.
  if (steps.every((s) => s instanceof AttrStep || s instanceof ReplaceAroundStep)) {
    const changed: Record<string, unknown> = {}
    tr.doc.descendants((node: PMNode, pos: number) => {
      if (!node.isTextblock) return
      const old = tr.before.nodeAt(tr.mapping.invert().map(pos))
      if (!old || old.type !== node.type) return false
      for (const [k, v] of Object.entries(node.attrs)) if (JSON.stringify(old.attrs[k]) !== JSON.stringify(v)) changed[k] = v
      return false
    })
    return Object.keys(changed).length ? { kind: 'block', attrs: changed } : prev
  }
  if (steps.length === 1 && steps[0] instanceof ReplaceStep) {
    const { from, to, slice } = steps[0] as unknown as { from: number; to: number; slice: Slice }
    const text = slice.content.childCount === 1 && slice.content.firstChild?.isText ? slice.content.firstChild.text ?? '' : null
    if (text != null && to === from) {
      // Typing continues the last typed text when it follows straight on.
      return prev?.kind === 'text' && prev.open && tr.getMeta('uiEvent') !== 'paste' ? { kind: 'text', text: prev.text + text, open: true } : { kind: 'text', text, open: true }
    }
    if (slice.size) return { kind: 'slice', slice }
  }
  return prev
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    repeat: {
      repeatLast: () => ReturnType
    }
  }
}

export const Repeat = Extension.create({
  name: 'repeat',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: repeatKey,
        state: {
          init: () => ({ action: null as Action | null }),
          apply(tr, prev) {
            if (!tr.docChanged || isHistoryTransaction(tr) || tr.getMeta('pagination') || tr.getMeta('repeat') || tr.getMeta('addToHistory') === false) {
              // Moving the cursor ends a run of typing.
              return tr.selectionSet && !tr.docChanged && prev.action?.kind === 'text' && prev.action.open ? { action: { ...prev.action, open: false } } : prev
            }
            return { action: actionOf(tr, prev.action) }
          },
        },
      }),
    ]
  },

  addCommands() {
    return {
      repeatLast:
        () =>
        ({ state, tr, dispatch }) => {
          const action = repeatKey.getState(state)?.action
          if (!action) return false
          if (!dispatch) return true
          const { from, to, empty } = state.selection
          tr.setMeta('repeat', true)
          switch (action.kind) {
            case 'marks':
              if (empty) {
                for (const m of action.add) tr.addStoredMark(m)
                for (const m of action.remove) tr.removeStoredMark(m)
              } else {
                for (const m of action.remove) tr.removeMark(from, to, m.type)
                for (const m of action.add) tr.addMark(from, to, m)
              }
              break
            case 'text':
              tr.insertText(action.text, from, to)
              break
            case 'slice':
              tr.replaceSelection(action.slice)
              break
            case 'block':
              state.doc.nodesBetween(from, to, (node, pos) => {
                if (!node.isTextblock) return
                const attrs = Object.fromEntries(Object.entries(action.attrs).filter(([k]) => k in node.attrs))
                if (Object.keys(attrs).length) tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }, node.marks)
                return false
              })
              break
          }
          return true
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      F4: () => this.editor.commands.repeatLast(),
      // Ctrl+Y redoes first; with nothing left to redo it repeats (the history's keymap runs before).
      'Mod-y': () => this.editor.commands.repeatLast(),
    }
  },
})
