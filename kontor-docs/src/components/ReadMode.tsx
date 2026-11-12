import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { MenuList, Popup, cls, usePopover } from './ui'
import { withSyllables } from '../editor/hyphenate'
import { t } from '../i18n'

type Props = { editor: Editor; title: string; onExit: () => void; onFind: () => void }

type ColumnWidth = 'narrow' | 'default' | 'wide'
type PageColor = 'none' | 'sepia' | 'inverse'

const WIDTHS: Record<ColumnWidth, string> = { narrow: '22em', default: '30em', wide: '44em' }

/**
 * Read Mode: the document laid out in screen-sized columns that you page through sideways, with
 * options for column width, page color, text spacing and line focus (the immersive reading tools).
 */
export function ReadMode({ editor, title, onExit, onFind }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const [html] = useState(() => editor.getHTML())
  const [width, setWidth] = useState<ColumnWidth>('default')
  const [color, setColor] = useState<PageColor>('none')
  const [spacing, setSpacing] = useState(false)
  const [focusLine, setFocusLine] = useState(false)
  const [syllables, setSyllables] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  // Immersive › Syllables: middle dots between the syllables of the words.
  useEffect(() => {
    const root = contentRef.current
    if (!root) return
    root.innerHTML = html
    if (syllables) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      const nodes: Text[] = []
      while (walker.nextNode()) nodes.push(walker.currentNode as Text)
      for (const n of nodes) n.data = withSyllables(n.data)
    }
    setTimeout(update, 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, syllables])
  const [page, setPage] = useState({ current: 1, total: 1 })
  const view = usePopover()
  const tools = usePopover()

  // One screen is the visible width plus one column gap (columns stretch to fill the screen).
  const step = (el: HTMLElement) => el.clientWidth + (parseFloat(getComputedStyle(el).columnGap) || 0)
  const update = () => {
    const el = scroller.current
    if (!el) return
    const total = Math.max(1, Math.ceil((el.scrollWidth - 2) / step(el)))
    const current = Math.min(total, Math.round(el.scrollLeft / step(el)) + 1)
    setPage((p) => (p.current === current && p.total === total ? p : { current, total }))
  }
  const turn = (dir: 1 | -1) => {
    const el = scroller.current
    if (!el) return
    el.scrollTo({ left: Math.round(el.scrollLeft / step(el) + dir) * step(el), behavior: 'smooth' })
    setTimeout(update, 350)
  }

  useEffect(() => {
    update()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit()
      else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') turn(1)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') turn(-1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', update)
    }
  })

  return (
    <div className={cls('read-mode', `read-${color}`, spacing && 'read-spacing', focusLine && 'read-focus')} role="dialog" aria-label={t('Read Mode')}>
      <div className="read-bar">
        <div className="popover-anchor" ref={tools.ref}>
          <button type="button" className="read-menu" onClick={() => tools.setOpen(!tools.open)}>
            {t('Tools')}</button>
          {tools.open && (
            <Popup anchor={tools.ref} role="menu">
              <MenuList close={() => tools.setOpen(false)} items={[{ label: t('Find'), shortcut: 'Ctrl+F', onClick: () => (onExit(), onFind()) }]} />
            </Popup>
          )}
        </div>
        <div className="popover-anchor" ref={view.ref}>
          <button type="button" className="read-menu" onClick={() => view.setOpen(!view.open)}>
            {t('View')}</button>
          {view.open && (
            <Popup anchor={view.ref} role="menu">
              <MenuList
                close={() => view.setOpen(false)}
                items={[
                  { heading: t('Column Width') },
                  ...(['narrow', 'default', 'wide'] as const).map((w) => ({ label: w[0].toUpperCase() + w.slice(1), active: width === w, onClick: () => (setWidth(w), setTimeout(update, 50)) })),
                  { heading: t('Page Color') },
                  ...(['none', 'sepia', 'inverse'] as const).map((c) => ({ label: c[0].toUpperCase() + c.slice(1), active: color === c, onClick: () => setColor(c) })),
                  { heading: t('Immersive') },
                  { label: t('Text Spacing'), checked: spacing, onClick: () => (setSpacing(!spacing), setTimeout(update, 50)) },
                  { label: t('Line Focus'), checked: focusLine, onClick: () => setFocusLine(!focusLine) },
                  { label: t('Syllables'), checked: syllables, onClick: () => setSyllables(!syllables) },
                  'separator',
                  { label: t('Edit Document'), onClick: onExit },
                ]}
              />
            </Popup>
          )}
        </div>
        <span className="read-title">{title}</span>
        <button type="button" className="read-menu" aria-label={t('Exit Read Mode (Esc)')} title={t('Exit Read Mode (Esc)')} onClick={onExit}>
          <X size={16} />
        </button>
      </div>
      <div className="read-body">
        <button type="button" className="read-turn" aria-label={t('Previous screen')} disabled={page.current <= 1} onClick={() => turn(-1)}>
          <ChevronLeft size={28} />
        </button>
        <div ref={scroller} className="read-columns" onScroll={update} style={{ columnWidth: WIDTHS[width] }}>
          <div ref={contentRef} className="ProseMirror read-content" />
        </div>
        <button type="button" className="read-turn" aria-label={t('Next screen')} disabled={page.current >= page.total} onClick={() => turn(1)}>
          <ChevronRight size={28} />
        </button>
      </div>
      <div className="read-status">
        {t('Screen {n} of {total}', { n: page.current, total: page.total })}
      </div>
    </div>
  )
}
