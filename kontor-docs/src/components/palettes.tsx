import { useState } from 'react'
import { keepFocus } from './ui'

const THEME = ['#FFFFFF', '#000000', '#E8E6E3', '#3D4B5C', '#2F6FC4', '#E3742F', '#9E9E9E', '#F2B705', '#4FA3D9', '#5FA84B']

const STANDARD: [string, string][] = [
  ['#C00000', 'Dark Red'], ['#FF0000', 'Red'], ['#FFC000', 'Orange'], ['#FFFF00', 'Yellow'], ['#92D050', 'Light Green'],
  ['#00B050', 'Green'], ['#00B0F0', 'Light Blue'], ['#0070C0', 'Blue'], ['#002060', 'Dark Blue'], ['#7030A0', 'Purple'],
]

export const HIGHLIGHTS: [string, string][] = [
  ['#FFFF00', 'Yellow'], ['#00FF00', 'Bright Green'], ['#00FFFF', 'Turquoise'], ['#FF00FF', 'Pink'], ['#0000FF', 'Blue'],
  ['#FF0000', 'Red'], ['#000080', 'Dark Blue'], ['#008080', 'Teal'], ['#008000', 'Green'], ['#800080', 'Violet'],
  ['#800000', 'Dark Red'], ['#808000', 'Dark Yellow'], ['#808080', 'Gray-50%'], ['#C0C0C0', 'Gray-25%'], ['#000000', 'Black'],
]

function mix(hex: string, target: number, amount: number) {
  const n = parseInt(hex.slice(1), 16)
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (target - c) * amount))
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** Five tints/shades per theme color, like classic desktop palettes. */
function variants(base: string, index: number) {
  if (index === 0) return [0.05, 0.15, 0.25, 0.35, 0.5].map((a) => mix(base, 0, a))
  if (index === 1) return [0.5, 0.35, 0.25, 0.15, 0.05].map((a) => mix(base, 255, a))
  return [mix(base, 255, 0.8), mix(base, 255, 0.6), mix(base, 255, 0.4), mix(base, 0, 0.25), mix(base, 0, 0.5)]
}

function Swatch({ color, name, onPick }: { color: string; name: string; onPick: (c: string) => void }) {
  return (
    <button type="button" className="swatch" title={name} aria-label={name} style={{ background: color }} onMouseDown={keepFocus} onClick={() => onPick(color)} />
  )
}

export function FontColorPalette({ onPick, onAuto, autoLabel = 'Automatic' }: { onPick: (c: string) => void; onAuto: () => void; autoLabel?: string }) {
  return (
    <div className="palette">
      <button type="button" className="menu-item palette-auto" onMouseDown={keepFocus} onClick={onAuto}>
        <span className="swatch" style={{ background: '#000' }} /> {autoLabel}
      </button>
      <div className="palette-heading">Theme Colors</div>
      <div className="palette-grid">
        {THEME.map((c) => (
          <Swatch key={c} color={c} name={c} onPick={onPick} />
        ))}
      </div>
      <div className="palette-grid palette-variants">
        {[0, 1, 2, 3, 4].map((row) => THEME.map((c, i) => <Swatch key={`${c}-${row}`} color={variants(c, i)[row]} name={variants(c, i)[row]} onPick={onPick} />))}
      </div>
      <div className="palette-heading">Standard Colors</div>
      <div className="palette-grid">
        {STANDARD.map(([c, name]) => (
          <Swatch key={c} color={c} name={name} onPick={onPick} />
        ))}
      </div>
      <label className="menu-item palette-more" onMouseDown={(e) => e.stopPropagation()}>
        <span className="palette-rainbow" /> More Colors…
        <input type="color" onChange={(e) => onPick(e.target.value.toUpperCase())} />
      </label>
    </div>
  )
}

export function HighlightPalette({ onPick, onNone }: { onPick: (c: string) => void; onNone: () => void }) {
  return (
    <div className="palette">
      <div className="palette-grid palette-grid-5">
        {HIGHLIGHTS.map(([c, name]) => (
          <Swatch key={c} color={c} name={name} onPick={onPick} />
        ))}
      </div>
      <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={onNone}>
        No Color
      </button>
    </div>
  )
}

export function TablePicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [hover, setHover] = useState({ r: 0, c: 0 })
  return (
    <div className="table-picker" onMouseLeave={() => setHover({ r: 0, c: 0 })}>
      <div className="palette-heading">{hover.r ? `${hover.c}x${hover.r} Table` : 'Insert Table'}</div>
      <div className="table-grid">
        {Array.from({ length: 8 }, (_, r) =>
          Array.from({ length: 10 }, (_, c) => (
            <button
              key={`${r}-${c}`}
              type="button"
              aria-label={`${c + 1} by ${r + 1} table`}
              className={r < hover.r && c < hover.c ? 'is-on' : ''}
              onMouseEnter={() => setHover({ r: r + 1, c: c + 1 })}
              onMouseDown={keepFocus}
              onClick={() => onPick(r + 1, c + 1)}
            />
          )),
        )}
      </div>
    </div>
  )
}

export const SYMBOLS = '€ £ ¥ © ® ™ ± ≠ ≤ ≥ ÷ × ∞ µ α β π Ω ∑ ° ½ ¼ ¾ … – — “ ” ‘ ’ • § ¶ → ← ↑ ↓ ✓ ✗'.split(' ')

export function SymbolPicker({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="symbol-grid">
      {SYMBOLS.map((s) => (
        <button key={s} type="button" title={s} onMouseDown={keepFocus} onClick={() => onPick(s)}>
          {s}
        </button>
      ))}
    </div>
  )
}
