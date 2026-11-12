import { useState, type ReactNode } from 'react'
import { applyVariant, paletteVariants, SLOT_LABELS, THEME_SLOTS, type ThemeColors } from '../model/color'
import type { ColorRef } from '../model/types'
import { keepFocus } from './ui'

export const STANDARD_COLORS: [string, string][] = [
  ['#C00000', 'Dark Red'],
  ['#FF0000', 'Red'],
  ['#FFC000', 'Orange'],
  ['#FFFF00', 'Yellow'],
  ['#92D050', 'Light Green'],
  ['#00B050', 'Green'],
  ['#00B0F0', 'Light Blue'],
  ['#0070C0', 'Blue'],
  ['#002060', 'Dark Blue'],
  ['#7030A0', 'Purple'],
]

export const HIGHLIGHTS: [string, string][] = [
  ['#FFFF00', 'Yellow'],
  ['#00FF00', 'Bright Green'],
  ['#00FFFF', 'Turquoise'],
  ['#FF00FF', 'Pink'],
  ['#0000FF', 'Blue'],
  ['#FF0000', 'Red'],
  ['#000080', 'Dark Blue'],
  ['#008080', 'Teal'],
  ['#008000', 'Green'],
  ['#800080', 'Violet'],
  ['#800000', 'Dark Red'],
  ['#808000', 'Dark Yellow'],
  ['#808080', 'Gray 50%'],
  ['#C0C0C0', 'Gray 25%'],
  ['#000000', 'Black'],
]

// Remembered custom colors ("Recent Colors" row).
const recent: string[] = []

function Swatch({ color, name, onPick }: { color: string; name: string; onPick: () => void }) {
  return <button type="button" className="swatch" title={name} aria-label={name} style={{ background: color }} onMouseDown={keepFocus} onClick={onPick} />
}

export function ColorPalette({
  colors,
  onPick,
  auto,
  none,
  extra,
}: {
  colors: ThemeColors
  onPick: (c: ColorRef) => void
  auto?: { label: string; onClick: () => void; color?: string }
  none?: { label: string; onClick: () => void }
  extra?: ReactNode
}) {
  const [, force] = useState(0)
  const pickCustom = (hex: string) => {
    const v = hex.toUpperCase()
    if (!recent.includes(v)) recent.unshift(v)
    recent.length = Math.min(recent.length, 10)
    force((n) => n + 1)
    onPick(v)
  }
  return (
    <div className="palette">
      {auto && (
        <button type="button" className="menu-item palette-auto" onMouseDown={keepFocus} onClick={auto.onClick}>
          <span className="swatch" style={{ background: auto.color ?? '#000' }} /> {auto.label}
        </button>
      )}
      <div className="palette-heading">Theme Colors</div>
      <div className="palette-grid">
        {THEME_SLOTS.map((slot) => (
          <Swatch key={slot} color={colors[slot]} name={`${SLOT_LABELS[slot]} (${colors[slot]})`} onPick={() => onPick(`theme:${slot}`)} />
        ))}
      </div>
      <div className="palette-grid palette-variants">
        {[0, 1, 2, 3, 4].map((row) =>
          THEME_SLOTS.map((slot) => {
            const v = paletteVariants(colors[slot])[row]
            return <Swatch key={`${slot}-${row}`} color={applyVariant(colors[slot], v.code)} name={`${SLOT_LABELS[slot]}, ${v.label}`} onPick={() => onPick(`theme:${slot}:${v.code}`)} />
          }),
        )}
      </div>
      <div className="palette-heading">Standard Colors</div>
      <div className="palette-grid">
        {STANDARD_COLORS.map(([c, name]) => (
          <Swatch key={c} color={c} name={name} onPick={() => onPick(c)} />
        ))}
      </div>
      {recent.length > 0 && (
        <>
          <div className="palette-heading">Recent Colors</div>
          <div className="palette-grid">
            {recent.map((c) => (
              <Swatch key={c} color={c} name={c} onPick={() => onPick(c)} />
            ))}
          </div>
        </>
      )}
      {none && (
        <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={none.onClick}>
          <span className="swatch swatch-none" /> {none.label}
        </button>
      )}
      <label className="menu-item palette-more" onMouseDown={(e) => e.stopPropagation()}>
        <span className="palette-rainbow" /> More Colors…
        <input type="color" onChange={(e) => pickCustom(e.target.value)} />
      </label>
      {extra}
    </div>
  )
}

export function HighlightPalette({ onPick, onNone }: { onPick: (c: string) => void; onNone: () => void }) {
  return (
    <div className="palette">
      <div className="palette-grid palette-grid-5">
        {HIGHLIGHTS.map(([c, name]) => (
          <Swatch key={c} color={c} name={name} onPick={() => onPick(c)} />
        ))}
      </div>
      <button type="button" className="menu-item" onMouseDown={keepFocus} onClick={onNone}>
        No Color
      </button>
    </div>
  )
}

const SYMBOLS = '€ £ ¥ ¢ © ® ™ § ¶ ° ± × ÷ ≈ ≠ ≤ ≥ ∞ µ ½ ¼ ¾ … – — “ ” ‘ ’ « » • → ← ↑ ↓ ↔ ✓ ✗ ★ ☆ ♥ ♦ ♣ ♠ Ω π Σ Δ α β γ λ θ √ ∑ ∫ ∂ ∆ ∈ ∩ ∪'.split(' ')

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
