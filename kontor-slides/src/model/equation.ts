// Insert > Equation: a linear equation format (a subset of the common TeX-like notation) turned into
// text with math symbols, italic variables and real superscripts/subscripts.
import type { Inline, Mark, RichDoc } from './types'
import { tx } from '../i18n'

const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  sum: '∑', prod: '∏', int: '∫', iint: '∬', oint: '∮', partial: '∂', nabla: '∇', infty: '∞', pm: '±', mp: '∓', times: '×', div: '÷', cdot: '·', ast: '∗',
  le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', equiv: '≡', sim: '∼', propto: '∝', ll: '≪', gg: '≫',
  in: '∈', notin: '∉', subset: '⊂', supset: '⊃', subseteq: '⊆', supseteq: '⊇', cup: '∪', cap: '∩', emptyset: '∅', forall: '∀', exists: '∃', neg: '¬', land: '∧', lor: '∨',
  to: '→', rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔', mapsto: '↦',
  degree: '°', prime: '′', dots: '…', ldots: '…', cdots: '⋯', angle: '∠', perp: '⊥', parallel: '∥', therefore: '∴', because: '∵',
  sqrt: '√', cbrt: '∛', hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', R: 'ℝ', C: 'ℂ',
}
const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'exp', 'lim', 'max', 'min', 'det', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh'])

type Piece = { text: string; italic: boolean; pos: 0 | 1 | -1 }

/** Built-in equations of the Equation gallery. */
export const EQUATION_GALLERY: { label: string; source: string }[] = [
  { label: tx('Area of Circle'), source: 'A=\\pi r^2' },
  { label: tx('Binomial Theorem'), source: '(x+a)^n=\\sum_{k=0}^n \\binom{n}{k} x^k a^{n-k}' },
  { label: tx('Expansion of a Sum'), source: '(1+x)^n=1+\\frac{nx}{1!}+\\frac{n(n-1)x^2}{2!}+\\dots' },
  { label: tx('Fourier Series'), source: 'f(x)=a_0+\\sum_{n=1}^\\infty (a_n \\cos \\frac{n\\pi x}{L}+b_n \\sin \\frac{n\\pi x}{L})' },
  { label: tx('Pythagorean Theorem'), source: 'a^2+b^2=c^2' },
  { label: tx('Quadratic Formula'), source: 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}' },
  { label: tx('Taylor Expansion'), source: 'e^x=1+\\frac{x}{1!}+\\frac{x^2}{2!}+\\frac{x^3}{3!}+\\dots' },
  { label: tx('Trig Identity 1'), source: '\\sin \\alpha \\pm \\sin \\beta=2 \\sin \\frac{1}{2}(\\alpha \\pm \\beta) \\cos \\frac{1}{2}(\\alpha \\mp \\beta)' },
]

/** Parses the linear format into pieces of text with their position (normal, superscript, subscript). */
export function parseEquation(src: string): Piece[] {
  const out: Piece[] = []
  let i = 0
  const push = (text: string, italic: boolean, pos: Piece['pos']) => {
    const last = out[out.length - 1]
    if (last && last.italic === italic && last.pos === pos) last.text += text
    else out.push({ text, italic, pos })
  }
  /** A group: {…} or a single command/character. */
  const group = (pos: Piece['pos']) => {
    if (src[i] === '{') {
      let depth = 0
      const start = i + 1
      for (; i < src.length; i++) {
        if (src[i] === '{') depth++
        else if (src[i] === '}' && --depth === 0) break
      }
      const inner = src.slice(start, i)
      i++
      for (const p of parseEquation(inner)) push(pos ? p.text.replace(/ /g, '') : p.text, p.italic, pos || p.pos)
      return inner
    }
    const before = out.length
    one(pos)
    return out.slice(before).map((p) => p.text).join('')
  }
  /** A group as plain text (for fractions and roots), wrapped in parentheses when it is longer than one item. */
  const wrapped = () => {
    const raw = src[i] === '{' ? src.slice(i + 1, matching(src, i)) : src[i]
    const simple = /^([A-Za-z]|\d+(\.\d+)?)$/.test(raw) || /^\\[A-Za-z]+$/.test(raw)
    if (!simple) push('(', false, 0)
    group(0)
    if (!simple) push(')', false, 0)
  }
  const one = (pos: Piece['pos']) => {
    const c = src[i]
    if (c === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(src.slice(i))!
      i += m[0].length
      const name = m[1]
      if (name === 'frac') {
        wrapped()
        push('/', false, pos)
        wrapped()
      } else if (name === 'sqrt' || name === 'cbrt') {
        push(SYMBOLS[name], false, pos)
        wrapped()
      } else if (name === 'binom') {
        push('(', false, pos)
        group(pos)
        push(' ¦ ', false, pos)
        group(pos)
        push(')', false, pos)
      } else if (FUNCTIONS.has(name)) push(name, false, pos)
      else if (SYMBOLS[name]) push(SYMBOLS[name], /^[a-z]+$/.test(name) && name.length > 1 && 'αβγδεζηθικλμνξπρστυφχψω'.includes(SYMBOLS[name]), pos)
      else if (name === ' ' || name === ',') push(' ', false, pos)
      else push(name, false, pos)
      return
    }
    i++
    if (c === '^' || c === '_') {
      group(c === '^' ? 1 : -1)
      return
    }
    if (c === '{' || c === '}') return
    if (/[A-Za-z]/.test(c)) push(c, true, pos)
    else if (c === '-') push('−', false, pos)
    else if (c === '*') push('∗', false, pos)
    else if ('=<>+'.includes(c) && pos === 0) push(` ${c} `.replace('  ', ' '), false, pos)
    else if (c === ' ') return
    else push(c, false, pos)
  }
  while (i < src.length) one(0)
  return out
}

function matching(s: string, open: number) {
  let depth = 0
  for (let k = open; k < s.length; k++) {
    if (s[k] === '{') depth++
    else if (s[k] === '}' && --depth === 0) return k
  }
  return s.length
}

/** The equation as one centered paragraph in the serif math style. */
export function equationDoc(src: string, fontSize = 28): RichDoc {
  const base: Mark = { type: 'textStyle', attrs: { fontFamily: 'Caladea', fontSize } }
  const content: Inline[] = parseEquation(src).map((p) => {
    const marks: Mark[] = [base]
    if (p.italic) marks.push({ type: 'italic' })
    if (p.pos === 1) marks.push({ type: 'superscript' })
    if (p.pos === -1) marks.push({ type: 'subscript' })
    return { type: 'text', text: p.text.replace(/ {2,}/g, ' '), marks }
  })
  return { type: 'doc', content: [{ type: 'paragraph', attrs: { align: 'center' }, ...(content.length ? { content } : {}) }] }
}

/** The equation as plain text (used for alt text). */
export function equationText(src: string) {
  const runs: { text: string; pos: number }[] = []
  for (const p of parseEquation(src)) {
    const last = runs[runs.length - 1]
    if (last && last.pos === p.pos) last.text += p.text
    else runs.push({ text: p.text, pos: p.pos })
  }
  return runs.map((p) => (p.pos === 1 ? `^(${p.text})` : p.pos === -1 ? `_(${p.text})` : p.text)).join('')
}
