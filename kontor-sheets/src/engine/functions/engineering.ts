import type { Scalar } from '../../model/types'
import { alias } from '../registry'
import { CellError, ERR, isErr, N, optN, sfn } from './helpers'
import { erf } from './stats'

function fromBase(s: Scalar, radix: number, bits: number): number | CellError {
  const t = String(s ?? '').trim().toUpperCase()
  if (t.length > 10) return ERR.num
  if (!t) return 0
  const valid = radix === 2 ? /^[01]+$/ : radix === 8 ? /^[0-7]+$/ : /^[0-9A-F]+$/
  if (!valid.test(t)) return ERR.num
  let n = parseInt(t, radix)
  const limit = Math.pow(radix, 10)
  if (t.length === 10 && n >= limit / 2) n -= limit
  void bits
  return n
}

function toBase(n: number, radix: number, places: Scalar): Scalar {
  const limit = Math.pow(radix, 10)
  const lo = -limit / 2
  const hi = limit / 2 - 1
  if (n < lo || n > hi) return ERR.num
  let s: string
  if (n < 0) s = (limit + Math.trunc(n)).toString(radix).toUpperCase()
  else s = Math.trunc(n).toString(radix).toUpperCase()
  if (places !== null && places !== undefined && n >= 0) {
    const p = N(places)
    if (isErr(p)) return p
    if (p < s.length || p > 10) return ERR.num
    s = s.padStart(Math.trunc(p), '0')
  }
  return s
}

const bases: [string, number][] = [['BIN', 2], ['OCT', 8], ['DEC', 10], ['HEX', 16]]
for (const [from, fr] of bases)
  for (const [to, tr] of bases) {
    if (from === to) continue
    const name = `${from}2${to}`
    sfn(name, 1, to === 'DEC' ? 1 : 2, (a) => {
      let n: number | CellError
      if (fr === 10) {
        const x = N(a[0])
        if (isErr(x)) return x
        n = Math.trunc(x)
      } else n = fromBase(a[0], fr, 10)
      if (isErr(n)) return n
      if (tr === 10) return n
      return toBase(n, tr, a[1] ?? null)
    })
  }

sfn('DELTA', 1, 2, (a) => {
  const x = N(a[0])
  const y = optN(a, 1, 0)
  if (isErr(x)) return x
  if (isErr(y)) return y
  return x === y ? 1 : 0
})
sfn('GESTEP', 1, 2, (a) => {
  const x = N(a[0])
  const s = optN(a, 1, 0)
  if (isErr(x)) return x
  if (isErr(s)) return s
  return x >= s ? 1 : 0
})

function bitFn(name: string, f: (a: bigint, b: bigint) => bigint) {
  sfn(name, 2, 2, ([a, b]) => {
    const x = N(a)
    const y = N(b)
    if (isErr(x)) return x
    if (isErr(y)) return y
    if (x < 0 || y < 0 || x >= 2 ** 48 || y >= 2 ** 48 || !Number.isInteger(x) || !Number.isInteger(y)) return ERR.num
    return Number(f(BigInt(x), BigInt(y)))
  })
}
bitFn('BITAND', (a, b) => a & b)
bitFn('BITOR', (a, b) => a | b)
bitFn('BITXOR', (a, b) => a ^ b)
sfn('BITLSHIFT', 2, 2, ([a, b]) => {
  const x = N(a)
  const s = N(b)
  if (isErr(x)) return x
  if (isErr(s)) return s
  const r = s >= 0 ? x * Math.pow(2, s) : Math.floor(x / Math.pow(2, -s))
  return r >= 2 ** 48 ? ERR.num : r
})
sfn('BITRSHIFT', 2, 2, ([a, b]) => {
  const x = N(a)
  const s = N(b)
  if (isErr(x)) return x
  if (isErr(s)) return s
  return s >= 0 ? Math.floor(x / Math.pow(2, s)) : x * Math.pow(2, -s)
})

sfn('ERF', 1, 2, (a) => {
  const lo = N(a[0])
  if (isErr(lo)) return lo
  if (a.length > 1 && a[1] !== null) {
    const hi = N(a[1])
    if (isErr(hi)) return hi
    return erf(hi) - erf(lo)
  }
  return erf(lo)
})
alias('ERF.PRECISE', 'ERF')
sfn('ERFC', 1, 1, ([a]) => {
  const x = N(a)
  return isErr(x) ? x : 1 - erf(x)
})
alias('ERFC.PRECISE', 'ERFC')

// CONVERT: a practical subset of units (factor to SI base unit per category).
const UNITS: Record<string, [string, number]> = {
  m: ['len', 1], mi: ['len', 1609.344], Nmi: ['len', 1852], in: ['len', 0.0254], ft: ['len', 0.3048], yd: ['len', 0.9144], ang: ['len', 1e-10], ell: ['len', 1.143], ly: ['len', 9.4607304725808e15], pica: ['len', 0.00423333333333333], Pica: ['len', 0.000352777777777778], Picapt: ['len', 0.000352777777777778], pc: ['len', 3.08567758128155e16], parsec: ['len', 3.08567758128155e16], survey_mi: ['len', 1609.34721869444],
  g: ['mass', 1], lbm: ['mass', 453.59237], ozm: ['mass', 28.349523125], stone: ['mass', 6350.29318], ton: ['mass', 907184.74], uk_ton: ['mass', 1016046.9088], grain: ['mass', 0.06479891], u: ['mass', 1.660538782e-24], sg: ['mass', 14593.9029372064], brton: ['mass', 1016046.9088], LTON: ['mass', 1016046.9088], cwt: ['mass', 45359.237], shweight: ['mass', 45359.237], uk_cwt: ['mass', 50802.34544], lcwt: ['mass', 50802.34544], hweight: ['mass', 50802.34544],
  sec: ['time', 1], s: ['time', 1], mn: ['time', 60], min: ['time', 60], hr: ['time', 3600], day: ['time', 86400], d: ['time', 86400], yr: ['time', 31557600],
  Pa: ['press', 1], p: ['press', 1], atm: ['press', 101325], at: ['press', 101325], mmHg: ['press', 133.322], psi: ['press', 6894.75729316836], Torr: ['press', 133.322368421],
  N: ['force', 1], dyn: ['force', 1e-5], dy: ['force', 1e-5], lbf: ['force', 4.4482216152605], pond: ['force', 0.00980665],
  J: ['energy', 1], e: ['energy', 1e-7], c: ['energy', 4.184], cal: ['energy', 4.1868], eV: ['energy', 1.602176487e-19], ev: ['energy', 1.602176487e-19], HPh: ['energy', 2684519.53769617], hh: ['energy', 2684519.53769617], Wh: ['energy', 3600], wh: ['energy', 3600], flb: ['energy', 0.0421401100938048], BTU: ['energy', 1055.05585262], btu: ['energy', 1055.05585262],
  W: ['power', 1], w: ['power', 1], HP: ['power', 745.69987158227], h: ['power', 745.69987158227], PS: ['power', 735.49875],
  T: ['mag', 1], ga: ['mag', 1e-4],
  l: ['vol', 0.001], L: ['vol', 0.001], lt: ['vol', 0.001], tsp: ['vol', 4.92892159375e-6], tbs: ['vol', 1.478676478125e-5], oz: ['vol', 2.95735295625e-5], cup: ['vol', 0.0002365882365], pt: ['vol', 0.000473176473], us_pt: ['vol', 0.000473176473], uk_pt: ['vol', 0.00056826125], qt: ['vol', 0.000946352946], uk_qt: ['vol', 0.0011365225], gal: ['vol', 0.003785411784], uk_gal: ['vol', 0.00454609], m3: ['vol', 1], ft3: ['vol', 0.028316846592], in3: ['vol', 1.6387064e-5], yd3: ['vol', 0.764554857984], tspm: ['vol', 5e-6], barrel: ['vol', 0.158987294928], bushel: ['vol', 0.03523907016688], GRT: ['vol', 2.8316846592], regton: ['vol', 2.8316846592], MTON: ['vol', 1.13267386368],
  mi3: ['vol', 1609.344 ** 3], Nmi3: ['vol', 1852 ** 3], ang3: ['vol', 1e-30], ly3: ['vol', 9.4607304725808e15 ** 3], Pica3: ['vol', 0.000352777777777778 ** 3], Picapt3: ['vol', 0.000352777777777778 ** 3],
  m2: ['area', 1], ft2: ['area', 0.09290304], in2: ['area', 0.00064516], yd2: ['area', 0.83612736], mi2: ['area', 2589988.110336], ha: ['area', 10000], uk_acre: ['area', 4046.8564224], us_acre: ['area', 4046.87260987425], ar: ['area', 100], Morgen: ['area', 2500], Nmi2: ['area', 1852 ** 2], ang2: ['area', 1e-20], ly2: ['area', 9.4607304725808e15 ** 2], Pica2: ['area', 0.000352777777777778 ** 2], Picapt2: ['area', 0.000352777777777778 ** 2],
  'm/s': ['speed', 1], 'm/sec': ['speed', 1], 'm/h': ['speed', 1 / 3600], 'm/hr': ['speed', 1 / 3600], mph: ['speed', 0.44704], kn: ['speed', 0.514444444444444], admkn: ['speed', 0.514773333333333],
  bit: ['info', 1], byte: ['info', 8],
}
const PREFIX: Record<string, number> = { Y: 1e24, Z: 1e21, E: 1e18, P: 1e15, T: 1e12, G: 1e9, M: 1e6, k: 1e3, h: 1e2, da: 10, d: 0.1, c: 0.01, m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15, a: 1e-18, z: 1e-21, y: 1e-24, ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4 }

function unit(u: string): [string, number] | null {
  if (UNITS[u]) return UNITS[u]
  if (['C', 'cel', 'F', 'fah', 'K', 'kel', 'Rank', 'Reau'].includes(u)) return ['temp', 1]
  for (const p of Object.keys(PREFIX).sort((a, b) => b.length - a.length)) {
    if (u.startsWith(p) && UNITS[u.slice(p.length)]) {
      const [cat, f] = UNITS[u.slice(p.length)]
      const pow = /[23]$/.test(u) && (cat === 'area' || cat === 'vol') ? Number(u.slice(-1)) : 1
      return [cat, f * Math.pow(PREFIX[p], pow)]
    }
  }
  return null
}

function toKelvin(v: number, u: string) {
  switch (u) {
    case 'C': case 'cel': return v + 273.15
    case 'F': case 'fah': return ((v - 32) * 5) / 9 + 273.15
    case 'Rank': return (v * 5) / 9
    case 'Reau': return v * 1.25 + 273.15
    default: return v
  }
}
function fromKelvin(k: number, u: string) {
  switch (u) {
    case 'C': case 'cel': return k - 273.15
    case 'F': case 'fah': return ((k - 273.15) * 9) / 5 + 32
    case 'Rank': return (k * 9) / 5
    case 'Reau': return (k - 273.15) / 1.25
    default: return k
  }
}

sfn('CONVERT', 3, 3, ([a, b, c]) => {
  const v = N(a)
  if (isErr(v)) return v
  const from = String(b ?? '')
  const to = String(c ?? '')
  const fu = unit(from)
  const tu = unit(to)
  if (!fu || !tu || fu[0] !== tu[0]) return ERR.na
  if (fu[0] === 'temp') return fromKelvin(toKelvin(v, from), to)
  return (v * fu[1]) / tu[1]
})

