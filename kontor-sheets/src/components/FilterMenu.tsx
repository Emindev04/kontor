// The AutoFilter drop-down: sort, clear, color/number/text/date filters, search and value checklist.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownAZ, ArrowUpZA, Eraser, Filter } from 'lucide-react'
import type { FilterTarget } from '../commands/filter'
import { distinctValues, filterArea, setColumnFilter, sortTarget } from '../commands/filter'
import type { DatePeriod, FilterOp, FilterSpec } from '../model/extras'
import { useApp } from './appContext'
import { keepFocus } from './ui'
import { t, tx } from '../i18n'

export type FilterMenuState = { x: number; y: number; target: FilterTarget; col: number }

export const TEXT_OPS: [FilterOp, string][] = [
  ['eq', tx('Equals')], ['ne', tx('Does Not Equal')], ['begins', tx('Begins With')], ['ends', tx('Ends With')], ['contains', tx('Contains')], ['notContains', tx('Does Not Contain')],
]
export const NUMBER_OPS: [FilterOp, string][] = [
  ['eq', tx('Equals')], ['ne', tx('Does Not Equal')], ['gt', tx('Greater Than')], ['ge', tx('Greater Than Or Equal To')], ['lt', tx('Less Than')], ['le', tx('Less Than Or Equal To')],
]
const DATE_PERIODS: [DatePeriod, string][] = [
  ['tomorrow', tx('Tomorrow')], ['today', tx('Today')], ['yesterday', tx('Yesterday')], ['nextWeek', tx('Next Week')], ['thisWeek', tx('This Week')], ['lastWeek', tx('Last Week')],
  ['nextMonth', tx('Next Month')], ['thisMonth', tx('This Month')], ['lastMonth', tx('Last Month')], ['nextYear', tx('Next Year')], ['thisYear', tx('This Year')], ['lastYear', tx('Last Year')],
]

export function FilterMenu({ state, onClose }: { state: FilterMenuState; onClose: () => void }) {
  const app = useApp()
  const doc = app.doc
  const { target, col } = state
  const area = filterArea(target)
  const current = area.filters[col]
  const { values, blanks } = useMemo(() => distinctValues(doc, doc.sheet, target, col), [doc, target, col])
  const [search, setSearch] = useState('')
  const initial = useMemo(() => {
    const set = new Set<string>()
    if (current?.kind === 'values') current.values.forEach((v) => set.add(v))
    else values.forEach((v) => set.add(v.text))
    return set
  }, [current, values])
  const [checked, setChecked] = useState<Set<string>>(initial)
  const [blankOn, setBlankOn] = useState(current?.kind === 'values' ? current.blanks : true)
  const [sub, setSub] = useState<'number' | 'text' | 'date' | 'color' | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const numeric = values.length > 0 && values.filter((v) => v.num !== null).length >= values.length / 2
  const dates = numeric && (() => {
    const fmt = doc.style(area.r1, area.c1 + col).fmt ?? ''
    return /[dmy]/i.test(fmt) && !/\[h|h:|:s/.test(fmt)
  })()

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('.modal')) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const shown = values.filter((v) => v.text.toLowerCase().includes(search.toLowerCase()))
  const allOn = shown.every((v) => checked.has(v.text)) && (!!search || !blanks || blankOn)
  const apply = (spec: FilterSpec | null) => {
    setColumnFilter(doc, target, col, spec)
    onClose()
  }
  const ok = () => {
    if (search) {
      // searching filters to the matching, checked items
      apply({ kind: 'values', values: shown.filter((v) => checked.has(v.text)).map((v) => v.text), blanks: false })
      return
    }
    const all = values.every((v) => checked.has(v.text)) && (!blanks || blankOn)
    apply(all ? null : { kind: 'values', values: [...checked].filter((t) => values.some((v) => v.text === t)), blanks: blankOn })
  }
  const custom = (op: FilterOp) => {
    onClose()
    app.dialog({ kind: 'customFilter', data: { target, col, op } })
  }
  const fills = useMemo(() => {
    const set = new Set<string>()
    for (let r = area.r1; r <= Math.min(area.r2, area.r1 + 5000); r++) {
      const f = doc.style(r, area.c1 + col).fill
      if (f) set.add(f)
    }
    return [...set]
  }, [doc, area.r1, area.r2, area.c1, col])
  const colName = String(doc.value(area.header, area.c1 + col) ?? t('Column {n}', { n: col + 1 }))
  const left = Math.max(8, Math.min(state.x, window.innerWidth - 270))
  const top = Math.max(8, Math.min(state.y, window.innerHeight - 470))

  return (
    <div className="filter-menu menu" ref={ref} style={{ left, top }} role="dialog" aria-label={t('Filter {name}', { name: colName })}>
      <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => { sortTarget(doc, target, col, false); onClose() }}>
        <ArrowDownAZ size={15} /> <span className="menu-item-text">{numeric ? t('Sort Smallest to Largest') : t('Sort A to Z')}</span>
      </button>
      <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => { sortTarget(doc, target, col, true); onClose() }}>
        <ArrowUpZA size={15} /> <span className="menu-item-text">{numeric ? t('Sort Largest to Smallest') : t('Sort Z to A')}</span>
      </button>
      {fills.length > 0 && (
        <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => setSub(sub === 'color' ? null : 'color')}>
          <span className="menu-check" /> <span className="menu-item-text">{t('Sort / Filter by Color ›')}</span>
        </button>
      )}
      {sub === 'color' && (
        <div className="filter-sub">
          <div className="menu-heading">{t('Filter by Cell Color')}</div>
          <div className="filter-colors">
            {fills.map((f) => (
              <button key={f} type="button" className="swatch" style={{ background: f }} title={f} onMouseDown={keepFocus} onClick={() => apply({ kind: 'color', fill: f })} />
            ))}
            <button type="button" className="btn btn-small" onClick={() => apply({ kind: 'color', fill: '' })}>{t('No Fill')}</button>
          </div>
          <div className="menu-heading">{t('Sort by Cell Color')}</div>
          <button type="button" className="menu-item" onClick={() => { sortTarget(doc, target, col, false, 'fill'); onClose() }}>{t('Colored cells on top')}</button>
        </div>
      )}
      <div className="menu-sep" />
      <button type="button" className="menu-item" disabled={!current} onMouseDown={keepFocus} onClick={() => apply(null)}>
        <Eraser size={15} /> <span className="menu-item-text">{t('Clear Filter From "{name}"', { name: colName })}</span>
      </button>
      <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => setSub(sub === (dates ? 'date' : numeric ? 'number' : 'text') ? null : dates ? 'date' : numeric ? 'number' : 'text')}>
        <Filter size={15} /> <span className="menu-item-text">{dates ? t('Date Filters ›') : numeric ? t('Number Filters ›') : t('Text Filters ›')}</span>
      </button>
      {sub === 'number' && (
        <div className="filter-sub">
          {NUMBER_OPS.map(([op, label]) => (
            <button key={op} type="button" className="menu-item" onClick={() => custom(op)}>{t(label)}…</button>
          ))}
          <button type="button" className="menu-item" onClick={() => custom('ge')}>{t('Between…')}</button>
          <button type="button" className="menu-item" onClick={() => { onClose(); app.dialog({ kind: 'top10', data: { target, col } }) }}>{t('Top 10…')}</button>
          <button type="button" className="menu-item" onClick={() => apply({ kind: 'average', above: true })}>{t('Above Average')}</button>
          <button type="button" className="menu-item" onClick={() => apply({ kind: 'average', above: false })}>{t('Below Average')}</button>
          <button type="button" className="menu-item" onClick={() => custom('eq')}>{t('Custom Filter…')}</button>
        </div>
      )}
      {sub === 'text' && (
        <div className="filter-sub">
          {TEXT_OPS.map(([op, label]) => (
            <button key={op} type="button" className="menu-item" onClick={() => custom(op)}>{t(label)}…</button>
          ))}
          <button type="button" className="menu-item" onClick={() => custom('eq')}>{t('Custom Filter…')}</button>
        </div>
      )}
      {sub === 'date' && (
        <div className="filter-sub filter-sub-cols">
          {DATE_PERIODS.map(([p, label]) => (
            <button key={p} type="button" className="menu-item" onClick={() => apply({ kind: 'dynamic', period: p })}>{t(label)}</button>
          ))}
          <button type="button" className="menu-item" onClick={() => custom('lt')}>{t('Before…')}</button>
          <button type="button" className="menu-item" onClick={() => custom('gt')}>{t('After…')}</button>
          <button type="button" className="menu-item" onClick={() => custom('eq')}>{t('Custom Filter…')}</button>
        </div>
      )}
      <input className="filter-search" placeholder={t('Search')} value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
      <div className="filter-list">
        <label className="filter-item">
          <input
            type="checkbox"
            checked={allOn}
            onChange={(e) => {
              const next = new Set(checked)
              for (const v of shown) e.target.checked ? next.add(v.text) : next.delete(v.text)
              setChecked(next)
              if (!search) setBlankOn(e.target.checked)
            }}
          />
          {search ? t('(Select All Search Results)') : t('(Select All)')}
        </label>
        {shown.slice(0, 1000).map((v) => (
          <label key={v.text} className="filter-item">
            <input
              type="checkbox"
              checked={checked.has(v.text)}
              onChange={(e) => {
                const next = new Set(checked)
                if (e.target.checked) next.add(v.text)
                else next.delete(v.text)
                setChecked(next)
              }}
            />
            {v.text}
          </label>
        ))}
        {blanks && !search && (
          <label className="filter-item">
            <input type="checkbox" checked={blankOn} onChange={(e) => setBlankOn(e.target.checked)} />
            {t('(Blanks)')}
          </label>
        )}
      </div>
      <div className="filter-actions">
        <button type="button" className="btn btn-primary" disabled={!checked.size && !blankOn} onClick={ok}>{t('OK')}</button>
        <button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button>
      </div>
    </div>
  )
}
