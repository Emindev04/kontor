import type { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { getLanguage, t, type Translations } from '../i18n'

// View › Macros: records what you do (typing, keys, ribbon commands and menu choices) and plays it
// back. Macros are kept on this device. They replay the program's own commands; they are not
// programs (no VBA).

export type MacroStep =
  | { kind: 'text'; text: string }
  | { kind: 'key'; key: string; ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean }
  /** A ribbon button, optionally followed by an item of the menu it opened. `tab` is the ribbon tab it is on. */
  | { kind: 'command'; tab: string | null; label: string; item?: string }

export type Macro = { name: string; description: string; steps: MacroStep[]; created: string }

const STORE_KEY = 'kontor-docs:macros'

export function loadMacros(): Macro[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as Macro[]
    return Array.isArray(list) ? list.filter((m) => m && typeof m.name === 'string' && Array.isArray(m.steps)) : []
  } catch {
    return []
  }
}

export function saveMacros(list: Macro[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list))
  } catch {
    // Storage full: the macro is kept for this session only.
  }
}

/** Valid macro names: a letter first, then letters, digits and underscores (as in the original). */
export const validMacroName = (name: string) => /^[\p{L}][\p{L}\p{N}_]{0,79}$/u.test(name)

/** Keys that are recorded as keys (text keys are recorded as text). */
const SPECIAL_KEYS = new Set(['Enter', 'Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'])

/** Adds a step, joining consecutive typing into one text step. */
export function appendStep(steps: MacroStep[], step: MacroStep): MacroStep[] {
  const last = steps[steps.length - 1]
  if (step.kind === 'text' && last?.kind === 'text') return [...steps.slice(0, -1), { kind: 'text', text: last.text + step.text }]
  return [...steps, step]
}

// Labels of ribbon commands are stored as the English interface texts (the translation keys), so a
// macro or custom tab recorded in one interface language still works after switching to another.
const LOCALES: Record<string, () => Promise<{ default: Translations }>> = {
  de: () => import('../i18n/locales/de'),
  fr: () => import('../i18n/locales/fr'),
  es: () => import('../i18n/locales/es'),
}
let reverse: { language: string; map: Map<string, string | null> } | null = null

/** Prepares the lookup from interface texts back to their English keys (for the current language). */
function loadReverse() {
  const language = getLanguage()
  if (reverse?.language === language || !LOCALES[language]) return
  void LOCALES[language]()
    .then((m) => {
      // A text that translates several keys (e.g. one word for two commands) stays as it is shown.
      const map = new Map<string, string | null>()
      for (const [key, value] of Object.entries(m.default)) map.set(value, map.has(value) ? null : key)
      reverse = { language, map }
    })
    .catch(() => undefined)
}

/** The English key of an interface text shown in the current language (the text itself when unknown). */
export function englishLabel(text: string): string {
  if (getLanguage() === 'en' || reverse?.language !== getLanguage()) return text
  return reverse.map.get(text) ?? text
}

const labelOf = (el: Element) => (el.getAttribute('aria-label') || el.querySelector('.menu-item-text')?.childNodes[0]?.textContent || el.getAttribute('title') || el.textContent || '').trim()

export type Recorder = { stop: () => MacroStep[]; pause: (paused: boolean) => void; peek: () => MacroStep[] }

/** Starts recording on the editor and the ribbon. */
export function startRecording(editor: Editor): Recorder {
  let steps: MacroStep[] = []
  let paused = false
  let opener: { tab: string | null; label: string } | null = null
  const dom = editor.view.dom
  loadReverse()

  const onKey = (e: KeyboardEvent) => {
    if (paused || e.isComposing) return
    const mod = e.ctrlKey || e.metaKey || e.altKey
    if (!mod && e.key.length === 1) {
      steps = appendStep(steps, { kind: 'text', text: e.key })
      return
    }
    if (SPECIAL_KEYS.has(e.key) || (mod && e.key.length === 1)) steps = appendStep(steps, { kind: 'key', key: e.key, ctrl: e.ctrlKey || undefined, shift: e.shiftKey || undefined, alt: e.altKey || undefined, meta: e.metaKey || undefined })
  }
  const onClick = (e: MouseEvent) => {
    if (paused) return
    const target = (e.target as HTMLElement).closest('button')
    if (!target || target.closest('[data-macro-control]')) return
    const menu = target.closest('.menu')
    const tabText = document.querySelector('.tabs [role="tab"][aria-selected="true"]')?.textContent?.trim()
    const tab = tabText ? englishLabel(tabText) : null
    if (menu && target.classList.contains('menu-item')) {
      if (opener) steps = appendStep(steps, { kind: 'command', tab: opener.tab, label: opener.label, item: englishLabel(labelOf(target)) })
      opener = null
      return
    }
    if (!target.closest('.ribbon, .ribbon-wrap, .qat')) return
    if (target.getAttribute('role') === 'tab') return
    const shown = labelOf(target)
    if (!shown) return
    const label = englishLabel(shown)
    // A button that opens a menu is recorded together with the item chosen in it.
    setTimeout(() => {
      if (document.querySelector('.menu')) opener = { tab, label }
      else steps = appendStep(steps, { kind: 'command', tab, label })
    }, 0)
  }
  dom.addEventListener('keydown', onKey, true)
  document.addEventListener('click', onClick, true)
  return {
    stop: () => {
      dom.removeEventListener('keydown', onKey, true)
      document.removeEventListener('click', onClick, true)
      return steps
    },
    pause: (p) => {
      paused = p
    },
    peek: () => steps,
  }
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)))

function findButton(root: ParentNode, key: string): HTMLButtonElement | null {
  const label = t(key)
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
  return buttons.find((b) => b.getAttribute('aria-label') === label) ?? buttons.find((b) => labelOf(b) === label) ?? null
}

/** Plays a macro back. Returns the number of steps that could not be replayed. */
export async function runMacro(macro: Macro, editor: Editor): Promise<number> {
  let failed = 0
  for (const step of macro.steps) {
    if (step.kind === 'text') {
      editor.chain().focus().insertContent(step.text).run()
    } else if (step.kind === 'key') {
      const view = editor.view
      view.focus()
      const { state } = view
      if (!step.ctrl && !step.meta && !step.alt && (step.key === 'ArrowLeft' || step.key === 'ArrowRight')) {
        // Arrow keys move the cursor natively; do it on the document instead.
        const dir = step.key === 'ArrowLeft' ? -1 : 1
        const head = Math.max(0, Math.min(state.doc.content.size, state.selection.head + dir))
        const anchor = step.shift ? state.selection.anchor : head
        try {
          view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, anchor, head)))
        } catch {
          failed++
        }
        continue
      }
      const event = new KeyboardEvent('keydown', { key: step.key, ctrlKey: !!step.ctrl, shiftKey: !!step.shift, altKey: !!step.alt, metaKey: !!step.meta, bubbles: true, cancelable: true })
      const handled = !view.dom.dispatchEvent(event)
      if (!handled) {
        if (step.key === 'Enter') editor.commands.enter()
        else if (step.key === 'Backspace') editor.commands.deleteSelection() || editor.commands.joinBackward()
        else if (step.key === 'Delete') editor.commands.deleteSelection() || editor.commands.joinForward()
        else if (step.key === 'Tab') editor.commands.insertContent('\t')
      }
    } else {
      // Ribbon command: open its tab, press the button and choose the menu item.
      if (step.tab) {
        const tab = Array.from(document.querySelectorAll<HTMLButtonElement>('.tabs [role="tab"]')).find((el) => el.textContent?.trim() === t(step.tab!))
        if (tab && tab.getAttribute('aria-selected') !== 'true') {
          tab.click()
          await frame()
        }
      }
      const button = findButton(document.querySelector('.ribbon-wrap') ?? document, step.label) ?? findButton(document, step.label)
      if (!button || button.disabled) {
        failed++
        continue
      }
      button.click()
      await frame()
      if (step.item) {
        const item = Array.from(document.querySelectorAll<HTMLButtonElement>('.menu .menu-item')).find((b) => labelOf(b) === t(step.item!))
        if (item && !item.disabled) item.click()
        else {
          failed++
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        }
        await frame()
      }
    }
  }
  return failed
}

/** A readable list of the steps (View Macros › Edit shows it). */
export function describeStep(step: MacroStep): string {
  if (step.kind === 'text') return `“${step.text}”`
  if (step.kind === 'key') return [step.ctrl && 'Ctrl', step.meta && 'Cmd', step.alt && 'Alt', step.shift && 'Shift', step.key].filter(Boolean).join('+')
  return [step.tab, step.label, step.item].filter((s): s is string => !!s).map((s) => t(s)).join(' › ')
}

// ---- Custom ribbon tabs ----

export type CustomCommand = { kind: 'command'; tab: string | null; label: string; item?: string } | { kind: 'macro'; name: string }
export type CustomGroup = { id: string; name: string; items: CustomCommand[] }
export type CustomTab = { id: string; name: string; groups: CustomGroup[] }

export const customLabel = (c: CustomCommand) => (c.kind === 'macro' ? c.name : t(c.item ?? c.label))

/** Runs a command of a custom tab (a ribbon command or a macro). Returns false when it could not run. */
export async function runCustomCommand(c: CustomCommand, editor: Editor): Promise<boolean> {
  if (c.kind === 'macro') {
    const macro = loadMacros().find((m) => m.name === c.name)
    return macro ? (await runMacro(macro, editor)) === 0 : false
  }
  return (await runMacro({ name: '', description: '', created: '', steps: [{ kind: 'command', tab: c.tab, label: c.label, item: c.item }] }, editor)) === 0
}

/** Waits for the next ribbon command the user clicks (for Customize Ribbon › Add Command). */
export function pickCommand(editor: Editor, onPick: (c: CustomCommand | null) => void): () => void {
  const recorder = startRecording(editor)
  let done = false
  const finish = (c: CustomCommand | null) => {
    if (done) return
    done = true
    clearInterval(timer)
    window.removeEventListener('keydown', onKey, true)
    recorder.stop()
    onPick(c)
  }
  // The recorder notes a command after the click (and after the menu item for menus).
  const timer = setInterval(() => {
    const steps = recorder.peek()
    const step = steps.find((s) => s.kind === 'command')
    if (step && step.kind === 'command') finish({ kind: 'command', tab: step.tab, label: step.label, item: step.item })
  }, 100)
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && finish(null)
  window.addEventListener('keydown', onKey, true)
  return () => finish(null)
}
