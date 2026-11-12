import { useEffect, useState } from 'react'

// Fonts installed on this computer, for the font lists. Browsers do not list system fonts, so common
// font families of Windows, macOS and Linux are probed: a family is installed when text set in it
// measures differently from the generic fallback fonts. Where the browser allows it (Local Font
// Access), the complete list of installed families is used instead.

const CANDIDATES = [
  'Aptos', 'Arial', 'Arial Black', 'Arial Narrow', 'Arial Rounded MT Bold', 'Avenir', 'Avenir Next', 'Bahnschrift', 'Baskerville', 'Bitstream Charter', 'Book Antiqua',
  'Bookman Old Style', 'Bradley Hand', 'Brush Script MT', 'Caladea', 'Calibri', 'Calibri Light', 'Cambria', 'Cambria Math', 'Candara', 'Cantarell', 'Carlito',
  'Century', 'Century Gothic', 'Century Schoolbook', 'Chalkboard', 'Charter', 'Cochin', 'Comic Sans MS', 'Consolas', 'Constantia', 'Copperplate', 'Corbel',
  'Courier', 'Courier New', 'DejaVu Sans', 'DejaVu Sans Mono', 'DejaVu Serif', 'Didot', 'Droid Sans', 'Ebrima', 'Franklin Gothic Medium', 'Futura', 'Gabriola',
  'Gadugi', 'Garamond', 'Geneva', 'Georgia', 'Gill Sans', 'Gill Sans MT', 'Helvetica', 'Helvetica Neue', 'Hoefler Text', 'Impact', 'Ink Free', 'Inter',
  'Javanese Text', 'Leelawadee UI', 'Liberation Mono', 'Liberation Sans', 'Liberation Serif', 'Lucida Bright', 'Lucida Console', 'Lucida Grande',
  'Lucida Sans Unicode', 'Malgun Gothic', 'Marker Felt', 'Menlo', 'Monaco', 'MS Gothic', 'MV Boli', 'Myanmar Text', 'Nirmala UI',
  'Noto Sans', 'Noto Serif', 'Noto Sans Mono', 'Open Sans', 'Optima', 'Palatino', 'Palatino Linotype', 'Papyrus', 'Perpetua', 'Roboto', 'Roboto Mono',
  'Rockwell', 'Segoe Print', 'Segoe Script', 'Segoe UI', 'Segoe UI Emoji', 'Segoe UI Symbol', 'SimSun', 'Sitka Text', 'Skia', 'Source Code Pro',
  'Source Sans Pro', 'Source Serif Pro', 'Sylfaen', 'Symbol', 'Tahoma', 'Times', 'Times New Roman', 'Trebuchet MS', 'Ubuntu', 'Ubuntu Mono', 'Verdana',
  'Webdings', 'Wingdings', 'Yu Gothic', 'Zapfino',
]

let cache: string[] | null = null
const listeners = new Set<(fonts: string[]) => void>()

/** Whether `family` is available (installed or loaded by the page). */
export function isFontAvailable(family: string, ctx?: CanvasRenderingContext2D | null): boolean {
  const c = ctx ?? document.createElement('canvas').getContext('2d')
  if (!c) return false
  const sample = 'mmmmmmmmmmlli1WWQ@#ÄÖ'
  return ['monospace', 'serif', 'sans-serif'].some((base) => {
    c.font = `72px ${base}`
    const a = c.measureText(sample).width
    c.font = `72px "${family}", ${base}`
    return c.measureText(sample).width !== a
  })
}

function detect(): string[] {
  const ctx = document.createElement('canvas').getContext('2d')
  return CANDIDATES.filter((f) => isFontAvailable(f, ctx))
}

/** The installed font families found so far (probed once on first use). */
export function installedFonts(): string[] {
  if (!cache && typeof document !== 'undefined') cache = detect()
  return cache ?? []
}

/** Asks the browser for the complete list of installed fonts (needs the user's permission). */
export async function queryAllFonts(): Promise<string[]> {
  const query = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts
  if (!query) return installedFonts()
  try {
    const families = [...new Set((await query()).map((f) => f.family))].sort((a, b) => a.localeCompare(b))
    cache = [...new Set([...installedFonts(), ...families])].sort((a, b) => a.localeCompare(b))
    listeners.forEach((l) => l(cache!))
  } catch {
    // Permission refused: keep the probed list.
  }
  return installedFonts()
}

/** The font list for menus: installed fonts plus the document's usual fonts, sorted. */
export function useFontList(base: string[]): string[] {
  const [fonts, setFonts] = useState<string[]>(() => (typeof document === 'undefined' ? [] : installedFonts()))
  useEffect(() => {
    listeners.add(setFonts)
    return () => {
      listeners.delete(setFonts)
    }
  }, [])
  return [...new Set([...base, ...fonts])].sort((a, b) => a.localeCompare(b))
}
