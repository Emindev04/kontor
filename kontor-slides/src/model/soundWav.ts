// The transition sounds rendered to WAV files (for .pptx), following the same recipes as the
// Web Audio versions in sounds.ts: oscillators with exponential pitch and volume ramps, and
// band-limited noise sweeps.

const RATE = 22050

type Wave = 'sine' | 'square' | 'sawtooth'

function addTone(buf: Float32Array, freq: number, start: number, dur: number, wave: Wave, gain: number, endFreq?: number) {
  const s0 = Math.floor(start * RATE)
  const n = Math.floor(dur * RATE)
  let phase = 0
  for (let i = 0; i < n && s0 + i < buf.length; i++) {
    const t = i / n
    const f = endFreq ? freq * Math.pow(endFreq / freq, t) : freq
    phase += f / RATE
    const p = phase % 1
    const v = wave === 'sine' ? Math.sin(2 * Math.PI * p) : wave === 'square' ? (p < 0.5 ? 1 : -1) : 2 * p - 1
    buf[s0 + i] += v * gain * Math.pow(0.0001 / gain, t)
  }
}

/** Seeded noise so the files are the same every time. */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

function addNoise(buf: Float32Array, start: number, dur: number, gain: number, from: number, to: number) {
  const s0 = Math.floor(start * RATE)
  const n = Math.floor(dur * RATE)
  const rand = rng(7)
  let low = 0
  let band = 0
  for (let i = 0; i < n && s0 + i < buf.length; i++) {
    const t = i / n
    const f = from * Math.pow(to / from, t)
    // State-variable band-pass filter.
    const k = 2 * Math.sin((Math.PI * Math.min(f, RATE / 4)) / RATE)
    const x = rand() * 2 - 1
    low += k * band
    const high = x - low - 0.7 * band
    band += k * high
    const env = t < 0.3 ? Math.pow(gain / 0.0001, t / 0.3) * 0.0001 : gain * Math.pow(0.0001 / gain, (t - 0.3) / 0.7)
    buf[s0 + i] += band * env
  }
}

export function soundSamples(id: string): Float32Array | null {
  const len = { chime: 1.2, click: 0.1, whoosh: 0.65, coin: 0.5, drum: 0.4, laser: 0.35, breeze: 1.45 }[id]
  if (!len) return null
  const b = new Float32Array(Math.ceil(len * RATE))
  switch (id) {
    case 'chime':
      ;[1047, 1319, 1568].forEach((f, i) => addTone(b, f, i * 0.09, 0.9, 'sine', 0.18))
      break
    case 'click':
      addTone(b, 1800, 0, 0.05, 'square', 0.12, 600)
      break
    case 'whoosh':
      addNoise(b, 0, 0.6, 0.5, 300, 3000)
      break
    case 'coin':
      addTone(b, 988, 0, 0.08, 'square', 0.1)
      addTone(b, 1319, 0.08, 0.4, 'square', 0.1)
      break
    case 'drum':
      addTone(b, 160, 0, 0.35, 'sine', 0.6, 45)
      addNoise(b, 0, 0.12, 0.25, 2000, 800)
      break
    case 'laser':
      addTone(b, 1600, 0, 0.3, 'sawtooth', 0.08, 180)
      break
    case 'breeze':
      addNoise(b, 0, 1.4, 0.25, 500, 1200)
      break
  }
  return b
}

/** A 16-bit mono PCM WAV file of a transition sound, or null for an unknown sound. */
export function soundWav(id: string): Uint8Array | null {
  const samples = soundSamples(id)
  if (!samples) return null
  const bytes = new Uint8Array(44 + samples.length * 2)
  const v = new DataView(bytes.buffer)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, RATE, true)
  v.setUint32(28, RATE * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  samples.forEach((x, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 32767, true))
  return bytes
}
