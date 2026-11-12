// The Conditional Formatting drop-down: highlight rules, top/bottom rules, data bars, color scales,
// icon sets, new/clear/manage rules.
import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { addRule, clearRules, COLOR_SCALES, DATA_BAR_COLORS, defaultThresholds, ICON_SETS, ICON_COUNTS } from '../../commands/cf'
import { drawIcon } from '../../grid/decorate'
import type { IconSetId } from '../../model/extras'
import { useApp } from '../appContext'
import { keepFocus } from '../ui'
import type { CFQuickKind } from '../dialogs/ChartTableDialogs'

type Sub = 'highlight' | 'top' | 'bars' | 'scales' | 'icons' | 'clear' | null

function IconPreview({ set }: { set: IconSetId }) {
  const n = ICON_COUNTS[set]
  return (
    <canvas
      width={n * 18}
      height={18}
      ref={(cv) => {
        if (!cv) return
        const ctx = cv.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, cv.width, cv.height)
        for (let i = 0; i < n; i++) drawIcon(ctx, set, n - 1 - i, n, i * 18 + 1, 1, 16)
      }}
    />
  )
}

export function CFMenu({ close }: { close: () => void }) {
  const app = useApp()
  const doc = app.doc
  const [sub, setSub] = useState<Sub>(null)
  const ranges = () => doc.sel.ranges.map((r) => doc.boundToUsed(r))
  const quick = (k: CFQuickKind) => {
    close()
    app.dialog({ kind: 'cfQuick', data: k })
  }
  const head = (id: Exclude<Sub, null>, label: string) => (
    <button type="button" aria-haspopup="true" aria-expanded={sub === id} className={`menu-item${sub === id ? ' is-active' : ''}`} onMouseDown={keepFocus} onClick={() => setSub(sub === id ? null : id)}>
      <span className="menu-item-text">{label}</span>
      <ChevronRight size={12} />
    </button>
  )
  const item = (label: string, fn: () => void) => (
    <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={() => { close(); fn() }}>
      <span className="menu-item-text">{label}</span>
    </button>
  )
  return (
    <div className="cf-menu-body">
      {head('highlight', 'Highlight Cells Rules')}
      {sub === 'highlight' && (
        <div className="filter-sub">
          {item('Greater Than…', () => quick('greaterThan'))}
          {item('Less Than…', () => quick('lessThan'))}
          {item('Between…', () => quick('between'))}
          {item('Equal To…', () => quick('equal'))}
          {item('Text that Contains…', () => quick('text'))}
          {item('A Date Occurring…', () => quick('date'))}
          {item('Duplicate Values…', () => quick('duplicate'))}
          {item('More Rules…', () => app.dialog({ kind: 'cfRule', data: 'cell' }))}
        </div>
      )}
      {head('top', 'Top/Bottom Rules')}
      {sub === 'top' && (
        <div className="filter-sub">
          {item('Top 10 Items…', () => quick('top'))}
          {item('Top 10%…', () => quick('topPct'))}
          {item('Bottom 10 Items…', () => quick('bottom'))}
          {item('Bottom 10%…', () => quick('bottomPct'))}
          {item('Above Average…', () => quick('aboveAvg'))}
          {item('Below Average…', () => quick('belowAvg'))}
          {item('More Rules…', () => app.dialog({ kind: 'cfRule', data: 'top' }))}
        </div>
      )}
      <div className="menu-sep" />
      {head('bars', 'Data Bars')}
      {sub === 'bars' && (
        <div className="filter-sub">
          <div className="menu-heading">Gradient Fill</div>
          <div className="cf-swatches">
            {DATA_BAR_COLORS.map((c) => (
              <button key={c} type="button" className="cf-bar-swatch" title={`Gradient ${c}`} style={{ background: `linear-gradient(90deg, ${c}, #fff)` }} onMouseDown={keepFocus} onClick={() => { close(); addRule(doc, { ranges: ranges(), stop: false, type: 'dataBar', color: c, gradient: true, min: { type: 'auto' }, max: { type: 'auto' }, showValue: true }) }} />
            ))}
          </div>
          <div className="menu-heading">Solid Fill</div>
          <div className="cf-swatches">
            {DATA_BAR_COLORS.map((c) => (
              <button key={c} type="button" className="cf-bar-swatch" title={`Solid ${c}`} style={{ background: c }} onMouseDown={keepFocus} onClick={() => { close(); addRule(doc, { ranges: ranges(), stop: false, type: 'dataBar', color: c, gradient: false, min: { type: 'auto' }, max: { type: 'auto' }, showValue: true }) }} />
            ))}
          </div>
          {item('More Rules…', () => app.dialog({ kind: 'cfRule', data: 'all' }))}
        </div>
      )}
      {head('scales', 'Color Scales')}
      {sub === 'scales' && (
        <div className="filter-sub">
          <div className="cf-swatches">
            {COLOR_SCALES.map((s) => (
              <button
                key={s.label}
                type="button"
                className="cf-scale-swatch"
                title={`${s.label} Color Scale`}
                style={{ background: `linear-gradient(180deg, ${[...s.stops].reverse().join(',')})` }}
                onMouseDown={keepFocus}
                onClick={() => {
                  close()
                  const stops = s.stops.length === 3 ? [{ v: { type: 'min' as const }, color: s.stops[0] }, { v: { type: 'percentile' as const, value: 50 }, color: s.stops[1] }, { v: { type: 'max' as const }, color: s.stops[2] }] : [{ v: { type: 'min' as const }, color: s.stops[0] }, { v: { type: 'max' as const }, color: s.stops[1] }]
                  addRule(doc, { ranges: ranges(), stop: false, type: 'colorScale', stops })
                }}
              />
            ))}
          </div>
          {item('More Rules…', () => app.dialog({ kind: 'cfRule', data: 'all' }))}
        </div>
      )}
      {head('icons', 'Icon Sets')}
      {sub === 'icons' && (
        <div className="filter-sub">
          {(['Directional', 'Shapes', 'Indicators', 'Ratings'] as const).map((g) => (
            <div key={g}>
              <div className="menu-heading">{g}</div>
              <div className="cf-icon-grid">
                {ICON_SETS.filter((s) => s.group === g).map((s) => (
                  <button key={s.id} type="button" className="cf-icon-item" title={s.label} onMouseDown={keepFocus} onClick={() => { close(); addRule(doc, { ranges: ranges(), stop: false, type: 'iconSet', set: s.id, reverse: false, showValue: true, thresholds: defaultThresholds(s.id) }) }}>
                    <IconPreview set={s.id} />
                  </button>
                ))}
              </div>
            </div>
          ))}
          {item('More Rules…', () => app.dialog({ kind: 'cfRule', data: 'all' }))}
        </div>
      )}
      <div className="menu-sep" />
      {item('New Rule…', () => app.dialog({ kind: 'cfRule' }))}
      {head('clear', 'Clear Rules')}
      {sub === 'clear' && (
        <div className="filter-sub">
          {item('Clear Rules from Selected Cells', () => clearRules(doc, doc.sel.ranges))}
          {item('Clear Rules from Entire Sheet', () => clearRules(doc, null))}
        </div>
      )}
      {item('Manage Rules…', () => app.dialog({ kind: 'cfManage' }))}
    </div>
  )
}
