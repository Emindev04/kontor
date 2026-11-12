import { tx } from '../i18n'
// Transition sounds, synthesized with the Web Audio API (no sound files are bundled).

export const TRANSITION_SOUNDS: { id: string; label: string }[] = [
  { id: 'chime', label: tx('Chime') },
  { id: 'click', label: tx('Click') },
  { id: 'whoosh', label: tx('Whoosh') },
  { id: 'coin', label: tx('Coin') },
  { id: 'drum', label: tx('Drum') },
  { id: 'laser', label: tx('Laser') },
  { id: 'breeze', label: tx('Breeze') },
]

let ctx: AudioContext | null = null

function tone(ac: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain: number, endFreq?: number) {
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur)
  g.gain.setValueAtTime(gain, start)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(g).connect(ac.destination)
  osc.start(start)
  osc.stop(start + dur + 0.02)
}

function noise(ac: AudioContext, start: number, dur: number, gain: number, from: number, to: number) {
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = ac.createBufferSource()
  src.buffer = buf
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(from, start)
  filter.frequency.exponentialRampToValueAtTime(to, start + dur)
  const g = ac.createGain()
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(gain, start + dur * 0.3)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  src.connect(filter).connect(g).connect(ac.destination)
  src.start(start)
}

/** Plays a transition sound (ignored where audio is unavailable). */
export function playSound(id: string | null | undefined) {
  if (!id) return
  try {
    ctx ??= new AudioContext()
    const ac = ctx
    if (ac.state === 'suspended') void ac.resume()
    const t = ac.currentTime + 0.01
    switch (id) {
      case 'chime':
        ;[1047, 1319, 1568].forEach((f, i) => tone(ac, f, t + i * 0.09, 0.9, 'sine', 0.18))
        break
      case 'click':
        tone(ac, 1800, t, 0.05, 'square', 0.12, 600)
        break
      case 'whoosh':
        noise(ac, t, 0.6, 0.5, 300, 3000)
        break
      case 'coin':
        tone(ac, 988, t, 0.08, 'square', 0.1)
        tone(ac, 1319, t + 0.08, 0.4, 'square', 0.1)
        break
      case 'drum':
        tone(ac, 160, t, 0.35, 'sine', 0.6, 45)
        noise(ac, t, 0.12, 0.25, 2000, 800)
        break
      case 'laser':
        tone(ac, 1600, t, 0.3, 'sawtooth', 0.08, 180)
        break
      case 'breeze':
        noise(ac, t, 1.4, 0.25, 500, 1200)
        break
    }
  } catch {
    // No audio output.
  }
}
