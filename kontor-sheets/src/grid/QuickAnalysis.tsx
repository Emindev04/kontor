// Quick Analysis: the button at the corner of a selection (Ctrl+Q) with one-click formatting,
// charts, totals, tables and sparklines for the selected data.
import { useEffect, useRef, useState } from 'react'
import { BarChart3, ChartColumn, ChartLine, ChartPie, ChartScatter, FileStack, Hash, Palette, Sigma, Table2, TrendingUp, Zap } from 'lucide-react'
import type { Geometry } from './geometry'
import { useApp } from '../components/appContext'
import { addRule, clearRules, defaultThresholds } from '../commands/cf'
import { absRef } from '../charts/chartData'
import { colName, type Range } from '../model/address'
import { cls, keepFocus } from '../components/ui'
import { t, tx } from '../i18n'

type Tab = 'formatting' | 'charts' | 'totals' | 'tables' | 'sparklines'

export function QuickAnalysis({ g }: { g: Geometry }) {
  const app = useApp()
  const doc = app.doc
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('formatting')
  const ref = useRef<HTMLDivElement>(null)
  const rg = doc.sel.ranges.length === 1 ? doc.boundToUsed(doc.activeRange) : null
  const multi = !!rg && (rg.r2 > rg.r1 || rg.c2 > rg.c1) && rg.r2 - rg.r1 < 100000
  const hasData = multi && rg && doc.sheet.used().r >= rg.r1

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'q' && !doc.edit && hasData) {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doc, hasData])
  useEffect(() => setOpen(false), [rg?.r1, rg?.r2, rg?.c1, rg?.c2])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (!hasData || !rg || doc.edit) return null
  const x = g.colX(rg.c2) + g.colW(rg.c2)
  const y = g.rowY(rg.r2) + g.rowH(rg.r2)
  if (x < g.headerW || y < g.headerH || x > g.width - 4 || y > g.height - 4) return null
  const source = absRef(doc.sheet, rg)
  const body: Range = { ...rg, r1: Math.min(rg.r1 + 1, rg.r2) }
  const chart = (type: 'column' | 'bar' | 'line' | 'pie' | 'scatter') =>
    run(() => void import('../components/dialogs/ChartTableDialogs').then((m) => m.insertChart(app, type, 'clustered', source)))
  const run = (fn: () => void) => {
    setOpen(false)
    fn()
    app.focusGrid()
  }
  const totals = (fn: 'SUM' | 'AVERAGE' | 'COUNT' | 'PCT' | 'RUNNING', right = false) =>
    run(() => {
      const sheet = doc.sheet
      doc.transact(tx('Quick Analysis Totals'), () => {
        if (right) {
          for (let r = body.r1; r <= rg.r2; r++) doc.write(sheet, r, rg.c2 + 1, { f: `SUM(${colName(rg.c1)}${r + 1}:${colName(rg.c2)}${r + 1})`, s: doc.wb.styles.intern({ bold: true }) })
          if (rg.r1 < body.r1) doc.write(sheet, rg.r1, rg.c2 + 1, { v: 'Total', s: doc.wb.styles.intern({ bold: true }) })
          return
        }
        const row = rg.r2 + 1
        const all = `$${colName(rg.c1)}$${body.r1 + 1}:$${colName(rg.c2)}$${rg.r2 + 1}`
        for (let c = rg.c1; c <= rg.c2; c++) {
          const col = `${colName(c)}${body.r1 + 1}:${colName(c)}${rg.r2 + 1}`
          const f = fn === 'PCT' ? `SUM(${col})/SUM(${all})` : fn === 'RUNNING' ? `SUM($${colName(rg.c1)}${body.r1 + 1}:${colName(c)}${rg.r2 + 1})` : `${fn}(${col})`
          doc.write(sheet, row, c, { f, s: doc.wb.styles.intern({ bold: true, ...(fn === 'PCT' ? { fmt: '0.00%' } : {}) }) })
        }
      })
    })
  const tabs: [Tab, string][] = [['formatting', t('Formatting')], ['charts', t('Charts')], ['totals', t('Totals')], ['tables', t('Tables')], ['sparklines', t('Sparklines')]]
  const tile = (Icon: typeof Hash, label: string, onClick: () => void) => (
    <button key={label} type="button" className="qa-tile" onMouseDown={keepFocus} onClick={onClick}>
      <Icon size={22} strokeWidth={1.5} />
      <span>{label}</span>
    </button>
  )
  return (
    <div ref={ref} className="qa" style={{ left: x - 2, top: y - 2 }}>
      <button type="button" className={cls('qa-btn', open && 'is-active')} title={t('Quick Analysis (Ctrl+Q)')} aria-label={t('Quick Analysis')} aria-expanded={open} onMouseDown={keepFocus} onClick={() => setOpen(!open)}>
        <Zap size={13} />
      </button>
      {open && (
        <div className="qa-panel" role="dialog" aria-label={t('Quick Analysis')}>
          <div className="qa-tabs" role="tablist">
            {tabs.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={cls('qa-tab', tab === id && 'is-active')} onMouseDown={keepFocus} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="qa-tiles">
            {tab === 'formatting' && [
              tile(BarChart3, t('Data Bars'), () => run(() => addRule(doc, { type: 'dataBar', color: '#638EC6', gradient: true, min: { type: 'auto' }, max: { type: 'auto' }, showValue: true, ranges: [body], stop: false }))),
              tile(Palette, t('Color Scale'), () => run(() => addRule(doc, { type: 'colorScale', stops: [{ v: { type: 'min' }, color: '#F8696B' }, { v: { type: 'percentile', value: 50 }, color: '#FFEB84' }, { v: { type: 'max' }, color: '#63BE7B' }], ranges: [body], stop: false }))),
              tile(TrendingUp, t('Icon Set'), () => run(() => addRule(doc, { type: 'iconSet', set: '3Arrows', reverse: false, showValue: true, thresholds: defaultThresholds('3Arrows'), ranges: [body], stop: false }))),
              tile(Hash, t('Greater Than'), () => run(() => app.dialog({ kind: 'cfQuick', data: 'greaterThan' }))),
              tile(Sigma, t('Top 10%'), () => run(() => addRule(doc, { type: 'top', bottom: false, rank: 10, percent: true, ranges: [body], stop: false, style: { fill: '#FFC7CE', color: '#9C0006' } }))),
              tile(Palette, t('Clear Format'), () => run(() => clearRules(doc, [rg]))),
            ]}
            {tab === 'charts' && [
              tile(ChartColumn, t('Clustered Column'), () => chart('column')),
              tile(BarChart3, t('Clustered Bar'), () => chart('bar')),
              tile(ChartLine, t('Line'), () => chart('line')),
              tile(ChartPie, t('Pie'), () => chart('pie')),
              tile(ChartScatter, t('Scatter'), () => chart('scatter')),
              tile(BarChart3, t('More Charts'), () => run(() => app.dialog({ kind: 'insertChart', data: source }))),
            ]}
            {tab === 'totals' && [
              tile(Sigma, t('Sum'), () => totals('SUM')),
              tile(Sigma, t('Average'), () => totals('AVERAGE')),
              tile(Hash, t('Count'), () => totals('COUNT')),
              tile(Hash, t('% Total'), () => totals('PCT')),
              tile(TrendingUp, t('Running Total'), () => totals('RUNNING')),
              tile(Sigma, t('Sum (right)'), () => totals('SUM', true)),
            ]}
            {tab === 'tables' && [
              tile(Table2, t('Table'), () => run(() => app.dialog({ kind: 'createTable' }))),
              tile(FileStack, t('PivotTable'), () => run(() => app.dialog({ kind: 'createPivot', data: source }))),
              tile(FileStack, t('Recommended'), () => run(() => app.dialog({ kind: 'recommendedPivots' }))),
            ]}
            {tab === 'sparklines' && [
              tile(TrendingUp, t('Line'), () => run(() => app.dialog({ kind: 'sparklines', data: 'line' }))),
              tile(ChartColumn, t('Column'), () => run(() => app.dialog({ kind: 'sparklines', data: 'column' }))),
              tile(Hash, t('Win/Loss'), () => run(() => app.dialog({ kind: 'sparklines', data: 'winloss' }))),
            ]}
          </div>
          <div className="qa-hint">
            {tab === 'formatting' ? t('Conditional formatting uses rules to highlight interesting data.') : tab === 'charts' ? t('Recommended charts help you visualize data.') : tab === 'totals' ? t('Formulas automatically calculate totals for you.') : tab === 'tables' ? t('Tables help you sort, filter, and summarize data.') : t('Sparklines are mini charts placed in single cells.')}
          </div>
        </div>
      )}
    </div>
  )
}
