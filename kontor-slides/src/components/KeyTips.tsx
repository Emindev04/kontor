// KeyTips: press Alt (or F10) to show letters on the ribbon tabs, type a letter to open a tab,
// then type the letters shown on a command to run it. Esc steps back.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../i18n'

const TAB_KEYS: Record<string, string> = {
  File: 'F', Home: 'H', Insert: 'N', Draw: 'JI', Design: 'G', Transitions: 'K', Animations: 'A', 'Slide Show': 'S', Record: 'C', Review: 'R', View: 'W', Help: 'Y',
  'Shape Format': 'JD', 'Picture Format': 'JP', 'Table Design': 'JT', Layout: 'JL', 'Chart Design': 'JC', Format: 'JO', 'Diagram Design': 'JS', Playback: 'JN', 'Slide Master': 'M', 'Handout Master': 'M', 'Notes Master': 'M',
}

type Tip = { el: HTMLElement; code: string }

const visible = (el: HTMLElement) => {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && !el.closest('[aria-hidden="true"]')
}

function tabTips(): Tip[] {
  const out: Tip[] = []
  for (const el of document.querySelectorAll<HTMLElement>('.tabs .tab')) {
    const label = el.textContent?.trim() ?? ''
    const code = TAB_KEYS[label] ?? Object.entries(TAB_KEYS).find(([name]) => t(name) === label)?.[1]
    if (code && visible(el)) out.push({ el, code })
  }
  return out
}

/** Letters for the commands of the open tab: a single initial when it is unique, else two letters. */
function commandTips(): Tip[] {
  const els = [...document.querySelectorAll<HTMLElement>('.ribbon button:not(:disabled), .ribbon select, .ribbon input')].filter(visible)
  const items = els
    .map((el) => ({ el, label: (el.getAttribute('aria-label') ?? el.getAttribute('title') ?? el.textContent ?? '').replace(/[^\p{L}\p{N} ]/gu, '').trim().toUpperCase() }))
    .filter((x) => x.label)
  const byInitial = new Map<string, typeof items>()
  for (const it of items) byInitial.set(it.label[0], [...(byInitial.get(it.label[0]) ?? []), it])
  const out: Tip[] = []
  for (const [initial, group] of byInitial) {
    if (group.length === 1) {
      out.push({ el: group[0].el, code: initial })
      continue
    }
    const used = new Set<string>()
    for (const { el, label } of group) {
      const words = label.split(/\s+/)
      const candidates = [
        words.length > 1 ? initial + words[1][0] : '',
        ...[...label.replace(/\s/g, '')].slice(1).map((ch) => initial + ch),
        ...'123456789'.split('').map((d) => initial + d),
      ]
      const code = candidates.find((c) => c.length === 2 && !used.has(c))
      if (!code) continue
      used.add(code)
      out.push({ el, code })
    }
  }
  return out
}

export function KeyTips() {
  const [mode, setMode] = useState<'off' | 'tabs' | 'commands'>('off')
  const [typed, setTyped] = useState('')
  const [tips, setTips] = useState<Tip[]>([])

  // Alt pressed and released on its own toggles KeyTips
  useEffect(() => {
    let alone = false
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt') alone = !e.ctrlKey && !e.metaKey && !e.shiftKey
      else alone = false
      if (e.key === 'F10' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setMode((m) => (m === 'off' ? 'tabs' : 'off'))
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt' && alone) {
        e.preventDefault()
        setMode((m) => (m === 'off' ? 'tabs' : 'off'))
      }
      alone = false
    }
    const close = () => setMode('off')
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('mousedown', close, true)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('mousedown', close, true)
      window.removeEventListener('blur', close)
    }
  }, [])

  useEffect(() => {
    setTyped('')
    if (mode === 'off') setTips([])
    else if (mode === 'tabs') setTips(tabTips())
    // commands: wait for the tab's panel to render
    else requestAnimationFrame(() => requestAnimationFrame(() => setTips(commandTips())))
  }, [mode])

  useEffect(() => {
    if (mode === 'off') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Alt' || e.key === 'F10') return
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setMode(mode === 'commands' ? 'tabs' : 'off')
        return
      }
      if (e.key === 'Backspace') {
        setTyped((t) => t.slice(0, -1))
        return
      }
      if (!/^[a-z0-9]$/i.test(e.key)) return
      const next = typed + e.key.toUpperCase()
      // a key typed right after Alt can arrive before the tips were measured
      const list = tips.length ? tips : mode === 'tabs' ? tabTips() : commandTips()
      const exact = list.find((t) => t.code === next)
      if (exact) {
        if (mode === 'tabs') {
          exact.el.click()
          if (exact.code === 'F') setMode('off')
          else setMode('commands')
        } else {
          setMode('off')
          exact.el.focus()
          exact.el.click()
        }
        return
      }
      if (list.some((t) => t.code.startsWith(next))) setTyped(next)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [mode, typed, tips])

  if (mode === 'off' || !tips.length) return null
  return createPortal(
    <div className="keytips" aria-hidden="true">
      {tips
        .filter((t) => t.code.startsWith(typed))
        .map((t, i) => {
          const r = t.el.getBoundingClientRect()
          const top = mode === 'tabs' ? r.bottom - 6 : r.bottom - 10
          return (
            <span key={i} className="keytip" style={{ left: r.left + r.width / 2, top }}>
              {t.code}
            </span>
          )
        })}
    </div>,
    document.body,
  )
}
