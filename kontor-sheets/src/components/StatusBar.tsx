import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, LayoutPanelTop, Minus, Plus, SquareDashed } from 'lucide-react'
import { cellName, keyCol, keyRow } from '../model/address'
import { cellView } from '../commands/display'
import { numberToText } from '../model/numfmt'
import { localizeNumberText, numberSymbols } from '../model/numberLocale'
import { Engine } from '../engine/engine'
import { CellError } from '../model/types'
import { cls, Popup } from './ui'
import { useApp, useDocVersion } from './appContext'
import { t, tx } from '../i18n'
import { computePageBreaks } from '../grid/pages'
import { checkAccessibility } from '../commands/tools'
import { stopRecording } from '../commands/macros'

type StatKey = 'average' | 'count' | 'numCount' | 'min' | 'max' | 'sum'
const LABELS: Record<StatKey, string> = { average: tx('Average'), count: tx('Count'), numCount: tx('Numerical Count'), min: tx('Minimum'), max: tx('Maximum'), sum: tx('Sum') }

export function StatusBar({ zoom, setZoom }: { zoom: number; setZoom: (z: number) => void }) {
  const app = useApp()
  const doc = app.doc
  const version = useDocVersion(doc)
  const [enabled, setEnabled] = useState<Record<StatKey, boolean>>({ average: true, count: true, numCount: false, min: false, max: false, sum: true })
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const sheet = doc.sheet
  // Page Layout view: the page that holds the active cell (pages run down, then over)
  const pageInfo = useMemo(() => {
    if (app.viewMode !== 'pageLayout') return null
    const b = computePageBreaks(sheet)
    const a = doc.sel.active
    const pr = b.rows.filter((x) => x <= a.r).length
    const pc = b.cols.filter((x) => x <= a.c).length
    const rowsN = b.rows.length + 1
    return { n: pc * rowsN + pr + 1, total: rowsN * (b.cols.length + 1) }
  }, [app.viewMode, sheet, version])
  // accessibility status, checked a moment after changes stop
  const [a11y, setA11y] = useState<number | null>(null)
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        setA11y(checkAccessibility(doc).length)
      } catch {
        setA11y(null)
      }
    }, 1200)
    return () => clearTimeout(id)
  }, [doc, version])
  const sel = doc.sel

  const stats = useMemo(() => {
    const single = sel.ranges.length === 1 && sel.ranges[0].r1 === sel.ranges[0].r2 && sel.ranges[0].c1 === sel.ranges[0].c2
    if (single) return null
    let count = 0
    let nums = 0
    let sum = 0
    let min = Infinity
    let max = -Infinity
    let hasError = false
    const seen = new Set<number>()
    for (const rg of sel.ranges) {
      const keys = [...doc.keysIn(sheet, rg)]
      for (const k of sheet.spillOwner.keys()) {
        const r = keyRow(k)
        const c = keyCol(k)
        if (r >= rg.r1 && r <= rg.r2 && c >= rg.c1 && c <= rg.c2) keys.push(k)
      }
      for (const k of keys) {
        if (seen.has(k)) continue
        seen.add(k)
        const v = doc.engine.display(sheet, keyRow(k), keyCol(k))
        if (v === null || v === undefined) continue
        if (v instanceof CellError) hasError = true
        count++
        if (typeof v === 'number') {
          nums++
          sum += v
          if (v < min) min = v
          if (v > max) max = v
        }
      }
    }
    return { count, nums, sum, min, max, hasError }
  }, [version])

  const fmt = (v: number) => {
    const a = sel.active
    const st = doc.style(a.r, a.c)
    const t = cellView(doc, sheet, a.r, a.c, st, undefined, v).text
    return t || localizeNumberText(numberToText(v), numberSymbols())
  }

  const [locks, setLocks] = useState({ caps: false, num: false, scroll: false })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const next = { caps: e.getModifierState?.('CapsLock') ?? false, num: e.getModifierState?.('NumLock') ?? false, scroll: e.getModifierState?.('ScrollLock') ?? false }
      setLocks((cur) => (cur.caps === next.caps && cur.num === next.num && cur.scroll === next.scroll ? cur : next))
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKey, true)
    }
  }, [])

  const ed = doc.edit
  const mode = ed ? (ed.point ? t('Point') : ed.mode === 'enter' ? t('Enter') : t('Edit')) : t('Ready')
  const circ = doc.wb.iterate.on ? undefined : [...doc.engine.circular][0]
  const circText = circ !== undefined ? (() => {
    const c = Engine.cellOfFid(circ)
    const s = doc.wb.sheetById(c.sheetId)
    return t('Circular References: {cell}', { cell: `${s && s !== sheet ? s.name + '!' : ''}${cellName(c.r, c.c)}` })
  })() : ''

  const items: [StatKey, string][] = []
  if (stats && stats.count > 1) {
    if (enabled.average && stats.nums) items.push(['average', stats.hasError ? '#DIV/0!' : fmt(stats.sum / stats.nums)])
    if (enabled.count) items.push(['count', String(stats.count)])
    if (enabled.numCount) items.push(['numCount', String(stats.nums)])
    if (enabled.min && stats.nums) items.push(['min', fmt(stats.min)])
    if (enabled.max && stats.nums) items.push(['max', fmt(stats.max)])
    if (enabled.sum && stats.nums) items.push(['sum', fmt(stats.sum)])
  }

  return (
    <footer
      className="statusbar"
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY - 220 })
      }}
    >
      <div className="sb-left">
        <span className="sb-mode">{mode}</span>
        {circText && <span className="sb-warn">{circText}</span>}
        {doc.wb.calcMode === 'manual' && doc.engine.needsRecalc && (
          <button type="button" className="sb-link" onClick={() => { doc.engine.recalcAll(); doc.emit() }}>
            {t('Calculate')}
          </button>
        )}
        {doc.status && <span>{doc.status}</span>}
        {locks.caps && <span className="sb-lock">{t('Caps Lock')}</span>}
        {locks.scroll && <span className="sb-lock">{t('Scroll Lock')}</span>}
        {app.viewMode === 'pageLayout' && <span className="sb-lock">{t('Page Layout')}</span>}
        {doc.recorder && (
          <button type="button" className="sb-link" title={t('Stop Recording')} onClick={() => stopRecording(doc)}>
            ■ {t('Recording macro "{name}"', { name: doc.recorder.name })}
          </button>
        )}
        {pageInfo && <span className="sb-lock">{t('Page {n} of {total}', pageInfo)}</span>}
        {a11y !== null && (
          <button type="button" className="sb-link" title={t('Check Accessibility')} onClick={() => app.dialog({ kind: 'accessibility' })}>
            {a11y === 0 ? t('Accessibility: Good to go') : t('Accessibility: Investigate')}
          </button>
        )}
      </div>
      <div className="sb-right">
        <div className="sb-stats">
          {items.map(([k, v]) => (
            <span key={k}>
              {t(LABELS[k])}: {v}
            </span>
          ))}
        </div>
        <button type="button" className={cls('sb-btn', app.viewMode === 'normal' && 'is-active')} title={t('Normal')} aria-label={t('Normal view')} onClick={() => app.setViewMode('normal')}>
          <FileSpreadsheet size={14} />
        </button>
        <button type="button" className={cls('sb-btn', app.viewMode === 'pageLayout' && 'is-active')} title={t('Page Layout')} aria-label={t('Page Layout view')} onClick={() => app.setViewMode('pageLayout')}>
          <LayoutPanelTop size={14} />
        </button>
        <button type="button" className={cls('sb-btn', app.viewMode === 'pageBreak' && 'is-active')} title={t('Page Break Preview')} aria-label={t('Page Break Preview')} onClick={() => app.setViewMode('pageBreak')}>
          <SquareDashed size={14} />
        </button>
        <button type="button" className="sb-btn" aria-label={t('Zoom out')} onClick={() => setZoom(zoom - 10)}>
          <Minus size={12} />
        </button>
        <input type="range" className="zoom-slider" min={10} max={400} step={1} value={zoom} aria-label={t('Zoom')} onChange={(e) => setZoom(Number(e.target.value))} />
        <button type="button" className="sb-btn" aria-label={t('Zoom in')} onClick={() => setZoom(zoom + 10)}>
          <Plus size={12} />
        </button>
        <button type="button" className="sb-zoom" title={t('Zoom…')} onClick={() => app.dialog({ kind: 'zoom' })}>
          {zoom}%
        </button>
      </div>
      {menu && (
        <>
          <div className="ctx-backdrop" onMouseDown={() => setMenu(null)} />
          <Popup point={menu} role="menu">
            <div className="menu-heading">{t('Customize Status Bar')}</div>
            {(Object.keys(LABELS) as StatKey[]).map((k) => (
              <button key={k} type="button" className="menu-item" role="menuitemcheckbox" aria-checked={enabled[k]} onClick={() => setEnabled({ ...enabled, [k]: !enabled[k] })}>
                <span className="menu-check">{enabled[k] ? '✓' : ''}</span>
                <span className="menu-item-text">{t(LABELS[k])}</span>
              </button>
            ))}
          </Popup>
        </>
      )}
    </footer>
  )
}
