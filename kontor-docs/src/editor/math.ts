// A small LaTeX-style math language for equations: parsed into a tree that renders as MathML on
// screen and converts into native equation objects for .docx files.

export type MNode =
  | { t: 'row'; items: MNode[] }
  | { t: 'ident' | 'num' | 'op' | 'text'; v: string }
  | { t: 'frac'; num: MNode; den: MNode }
  | { t: 'sqrt'; body: MNode; index?: MNode }
  | { t: 'script'; base: MNode; sub?: MNode; sup?: MNode }
  | { t: 'fenced'; open: string; close: string; body: MNode }
  | { t: 'accent'; acc: string; body: MNode }
  | { t: 'matrix'; rows: MNode[][] }

export const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  infty: '∞', partial: '∂', nabla: '∇', hbar: 'ℏ', ell: 'ℓ', emptyset: '∅', forall: '∀', exists: '∃', neg: '¬', degree: '°',
}

export const OPERATORS: Record<string, string> = {
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '∼', propto: '∝',
  to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐', leftrightarrow: '↔', Leftrightarrow: '⇔', mapsto: '↦',
  in: '∈', notin: '∉', subset: '⊂', supset: '⊃', subseteq: '⊆', supseteq: '⊇', cup: '∪', cap: '∩', land: '∧', lor: '∨', wedge: '∧', vee: '∨',
  cdots: '⋯', ldots: '…', dots: '…', perp: '⊥', parallel: '∥', angle: '∠', circ: '∘', ast: '∗', star: '⋆', oplus: '⊕', otimes: '⊗',
}

export const LARGE_OPS: Record<string, string> = { sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬', iiint: '∭', oint: '∮', bigcup: '⋃', bigcap: '⋂' }
const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'exp', 'lim', 'max', 'min', 'det', 'gcd', 'sup', 'inf'])
const ACCENTS: Record<string, string> = { hat: '^', bar: '¯', overline: '¯', vec: '→', tilde: '~', dot: '˙', ddot: '¨' }

type Tok = { k: 'cmd' | 'char' | 'num' | 'open' | 'close' | 'sup' | 'sub' | 'amp' | 'newline'; v: string }

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (c === '\\') {
      if (src[i + 1] === '\\') {
        out.push({ k: 'newline', v: '' })
        i += 2
        continue
      }
      const m = src.slice(i + 1).match(/^([a-zA-Z]+|.)/)
      out.push({ k: 'cmd', v: m ? m[1] : '' })
      i += 1 + (m ? m[1].length : 0)
      continue
    }
    // Numbers like 12, 3.5, .5 and 4. ; a lone period stays an ordinary character.
    const m = /[0-9.]/.test(c) ? src.slice(i).match(/^(?:[0-9]+\.?[0-9]*|\.[0-9]+)/) : null
    if (m) {
      out.push({ k: 'num', v: m[0] })
      i += m[0].length
      continue
    }
    if (c === '{') out.push({ k: 'open', v: c })
    else if (c === '}') out.push({ k: 'close', v: c })
    else if (c === '^') out.push({ k: 'sup', v: c })
    else if (c === '_') out.push({ k: 'sub', v: c })
    else if (c === '&') out.push({ k: 'amp', v: c })
    else out.push({ k: 'char', v: c })
    i++
  }
  return out
}

/** Parses the math language; unknown input degrades to plain symbols instead of failing. */
export function parseMath(src: string): MNode {
  const toks = tokenize(src)
  let p = 0
  const peek = () => toks[p]

  const group = (): MNode => {
    const t = peek()
    if (!t) return { t: 'row', items: [] }
    if (t.k === 'open') {
      p++
      const r = row(['close'])
      if (peek()?.k === 'close') p++
      return r
    }
    return atom() ?? { t: 'row', items: [] }
  }

  const delim = (): string => {
    const t = toks[p++]
    if (!t) return ''
    if (t.k === 'cmd') return t.v === '{' ? '{' : t.v === '}' ? '}' : t.v === 'langle' ? '⟨' : t.v === 'rangle' ? '⟩' : t.v === '|' ? '‖' : t.v === 'lfloor' ? '⌊' : t.v === 'rfloor' ? '⌋' : t.v === 'lceil' ? '⌈' : t.v === 'rceil' ? '⌉' : ''
    return t.v === '.' ? '' : t.v
  }

  const atom = (): MNode | null => {
    const t = toks[p++]
    if (!t) return null
    switch (t.k) {
      case 'num':
        return { t: 'num', v: t.v }
      case 'open': {
        const r = row(['close'])
        if (peek()?.k === 'close') p++
        return r
      }
      case 'char':
        if (/[a-zA-Z]/.test(t.v)) return { t: 'ident', v: t.v }
        if (t.v === "'") return { t: 'op', v: '′' }
        return { t: 'op', v: t.v === '-' ? '−' : t.v === '*' ? '∗' : t.v }
      case 'cmd': {
        const v = t.v
        if (v === 'frac' || v === 'dfrac' || v === 'tfrac') return { t: 'frac', num: group(), den: group() }
        if (v === 'sqrt') {
          let index: MNode | undefined
          if (peek()?.k === 'char' && peek().v === '[') {
            p++
            index = row(['char:]'])
            if (peek()?.v === ']') p++
          }
          return { t: 'sqrt', body: group(), index }
        }
        if (v === 'left') {
          const open = delim()
          const body = row(['cmd:right'])
          if (peek()?.k === 'cmd' && peek().v === 'right') p++
          const close = delim()
          return { t: 'fenced', open, close, body }
        }
        if (ACCENTS[v]) return { t: 'accent', acc: ACCENTS[v], body: group() }
        if (v === 'text' || v === 'mathrm' || v === 'textrm' || v === 'operatorname') {
          const g = group()
          return { t: 'text', v: textOf(g) }
        }
        if (v === 'begin') {
          const env = textOf(group())
          const rows: MNode[][] = [[]]
          let cell: MNode[] = []
          while (p < toks.length && !(peek().k === 'cmd' && peek().v === 'end')) {
            const tk = peek()
            if (tk.k === 'amp') {
              p++
              rows[rows.length - 1].push({ t: 'row', items: cell })
              cell = []
            } else if (tk.k === 'newline') {
              p++
              rows[rows.length - 1].push({ t: 'row', items: cell })
              cell = []
              rows.push([])
            } else {
              const a = scripted()
              if (a) cell.push(a)
            }
          }
          rows[rows.length - 1].push({ t: 'row', items: cell })
          if (peek()?.k === 'cmd') {
            p++
            group()
          }
          const m: MNode = { t: 'matrix', rows: rows.filter((r) => r.some((c) => c.t !== 'row' || c.items.length)) }
          if (env === 'pmatrix') return { t: 'fenced', open: '(', close: ')', body: m }
          if (env === 'bmatrix') return { t: 'fenced', open: '[', close: ']', body: m }
          if (env === 'vmatrix') return { t: 'fenced', open: '|', close: '|', body: m }
          if (env === 'cases') return { t: 'fenced', open: '{', close: '', body: m }
          return m
        }
        if (SYMBOLS[v]) return { t: 'ident', v: SYMBOLS[v] }
        if (OPERATORS[v]) return { t: 'op', v: OPERATORS[v] }
        if (LARGE_OPS[v]) return { t: 'op', v: LARGE_OPS[v] }
        if (FUNCTIONS.has(v)) return { t: 'text', v }
        if (v === ',' || v === ';' || v === ' ' || v === 'quad' || v === 'qquad') return { t: 'text', v: v === 'qquad' ? '  ' : ' ' }
        if (v === '{' || v === '}') return { t: 'op', v }
        return { t: 'text', v }
      }
      default:
        return null
    }
  }

  const scripted = (): MNode | null => {
    const base = atom()
    if (!base) return null
    let sub: MNode | undefined
    let sup: MNode | undefined
    for (;;) {
      const t = peek()
      if (t?.k === 'sub') {
        p++
        sub = group()
      } else if (t?.k === 'sup') {
        p++
        sup = group()
      } else break
    }
    return sub || sup ? { t: 'script', base, sub, sup } : base
  }

  const row = (stop: string[]): MNode => {
    const items: MNode[] = []
    while (p < toks.length) {
      const t = peek()
      if (stop.includes(t.k) || stop.includes(`${t.k}:${t.v}`)) break
      if (t.k === 'sub' || t.k === 'sup') {
        // A script without a base attaches to an empty box.
        p++
        const g = group()
        items.push({ t: 'script', base: { t: 'row', items: [] }, ...(t.k === 'sub' ? { sub: g } : { sup: g }) })
        continue
      }
      if (t.k === 'close' || t.k === 'amp' || t.k === 'newline') {
        p++
        continue
      }
      const a = scripted()
      if (a) items.push(a)
    }
    return { t: 'row', items }
  }

  return row([])
}

export function textOf(n: MNode): string {
  switch (n.t) {
    case 'row': return n.items.map(textOf).join('')
    case 'ident':
    case 'num':
    case 'op':
    case 'text': return n.v
    default: return ''
  }
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

/** MathML markup (browsers render MathML Core natively). */
export function toMathML(n: MNode): string {
  switch (n.t) {
    case 'row': return `<mrow>${n.items.map(toMathML).join('')}</mrow>`
    case 'ident': return `<mi>${esc(n.v)}</mi>`
    case 'num': return `<mn>${esc(n.v)}</mn>`
    case 'op': return Object.values(LARGE_OPS).includes(n.v) ? `<mo largeop="true">${esc(n.v)}</mo>` : `<mo>${esc(n.v)}</mo>`
    case 'text': return `<mtext>${esc(n.v)}</mtext>`
    case 'frac': return `<mfrac>${toMathML(n.num)}${toMathML(n.den)}</mfrac>`
    case 'sqrt': return n.index ? `<mroot>${toMathML(n.body)}${toMathML(n.index)}</mroot>` : `<msqrt>${toMathML(n.body)}</msqrt>`
    case 'script': {
      const big = n.base.t === 'op' && Object.values(LARGE_OPS).includes(n.base.v) && !['∫', '∬', '∭', '∮'].includes(n.base.v)
      const base = toMathML(n.base)
      if (n.sub && n.sup) return big ? `<munderover>${base}${toMathML(n.sub)}${toMathML(n.sup)}</munderover>` : `<msubsup>${base}${toMathML(n.sub)}${toMathML(n.sup)}</msubsup>`
      if (n.sub) return big ? `<munder>${base}${toMathML(n.sub)}</munder>` : `<msub>${base}${toMathML(n.sub)}</msub>`
      return big ? `<mover>${base}${toMathML(n.sup!)}</mover>` : `<msup>${base}${toMathML(n.sup!)}</msup>`
    }
    case 'fenced': return `<mrow>${n.open ? `<mo stretchy="true">${esc(n.open)}</mo>` : ''}${toMathML(n.body)}${n.close ? `<mo stretchy="true">${esc(n.close)}</mo>` : ''}</mrow>`
    case 'accent': return `<mover accent="true">${toMathML(n.body)}<mo>${esc(n.acc)}</mo></mover>`
    case 'matrix': return `<mtable>${n.rows.map((r) => `<mtr>${r.map((c) => `<mtd>${toMathML(c)}</mtd>`).join('')}</mtr>`).join('')}</mtable>`
  }
}

export function mathMarkup(latex: string, display: boolean) {
  return `<math xmlns="http://www.w3.org/1998/Math/MathML"${display ? ' display="block"' : ''}>${toMathML(parseMath(latex))}</math>`
}

/** Equation gallery (Insert > Equation). */
export const EQUATION_GALLERY: { label: string; latex: string }[] = [
  { label: 'Area of Circle', latex: 'A=\\pi r^2' },
  { label: 'Binomial Theorem', latex: '(x+a)^n=\\sum_{k=0}^{n}\\left(\\begin{matrix}n\\\\k\\end{matrix}\\right)x^k a^{n-k}' },
  { label: 'Expansion of a Sum', latex: '(1+x)^n=1+\\frac{nx}{1!}+\\frac{n(n-1)x^2}{2!}+\\ldots' },
  { label: 'Fourier Series', latex: 'f(x)=a_0+\\sum_{n=1}^{\\infty}\\left(a_n\\cos\\frac{n\\pi x}{L}+b_n\\sin\\frac{n\\pi x}{L}\\right)' },
  { label: 'Pythagorean Theorem', latex: 'a^2+b^2=c^2' },
  { label: 'Quadratic Formula', latex: 'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}' },
  { label: 'Taylor Expansion', latex: 'e^x=1+\\frac{x}{1!}+\\frac{x^2}{2!}+\\frac{x^3}{3!}+\\ldots' },
  { label: 'Trig Identity 1', latex: '\\sin\\alpha\\pm\\sin\\beta=2\\sin\\frac{1}{2}(\\alpha\\pm\\beta)\\cos\\frac{1}{2}(\\alpha\\mp\\beta)' },
]

/** Structures for the Equation tab (the inserted text has a placeholder box). */
export const EQUATION_STRUCTURES: { group: string; items: { label: string; latex: string }[] }[] = [
  { group: 'Fraction', items: [{ label: 'Stacked Fraction', latex: '\\frac{a}{b}' }, { label: 'Linear Fraction', latex: 'a/b' }] },
  { group: 'Script', items: [{ label: 'Superscript', latex: 'x^{2}' }, { label: 'Subscript', latex: 'x_{i}' }, { label: 'Subscript-Superscript', latex: 'x_{i}^{2}' }] },
  { group: 'Radical', items: [{ label: 'Square Root', latex: '\\sqrt{x}' }, { label: 'Radical with Degree', latex: '\\sqrt[n]{x}' }] },
  { group: 'Integral', items: [{ label: 'Integral', latex: '\\int_{a}^{b} f(x)\\,dx' }, { label: 'Double Integral', latex: '\\iint f\\,dA' }, { label: 'Contour Integral', latex: '\\oint F\\,ds' }] },
  { group: 'Large Operator', items: [{ label: 'Summation', latex: '\\sum_{i=1}^{n} a_i' }, { label: 'Product', latex: '\\prod_{i=1}^{n} a_i' }, { label: 'Union', latex: '\\bigcup_{i} A_i' }] },
  { group: 'Bracket', items: [{ label: 'Parentheses', latex: '\\left(x\\right)' }, { label: 'Brackets', latex: '\\left[x\\right]' }, { label: 'Braces', latex: '\\left\\{x\\right\\}' }, { label: 'Absolute Value', latex: '\\left|x\\right|' }, { label: 'Cases', latex: '\\begin{cases}x & x\\geq 0\\\\-x & x<0\\end{cases}' }] },
  { group: 'Function', items: [{ label: 'Sine', latex: '\\sin\\theta' }, { label: 'Logarithm', latex: '\\log_{b} x' }, { label: 'Limit', latex: '\\lim_{n\\to\\infty}\\left(1+\\frac{1}{n}\\right)^n' }] },
  { group: 'Accent', items: [{ label: 'Hat', latex: '\\hat{a}' }, { label: 'Bar', latex: '\\bar{a}' }, { label: 'Vector', latex: '\\vec{a}' }, { label: 'Dot', latex: '\\dot{a}' }] },
  { group: 'Matrix', items: [{ label: '2×2 Matrix', latex: '\\begin{pmatrix}a & b\\\\c & d\\end{pmatrix}' }, { label: '3×3 Identity', latex: '\\begin{bmatrix}1 & 0 & 0\\\\0 & 1 & 0\\\\0 & 0 & 1\\end{bmatrix}' }] },
]

export const SYMBOL_PALETTE = ['±', '∞', '=', '≠', '~', '×', '÷', '!', '∝', '<', '≪', '>', '≫', '≤', '≥', '∓', '≅', '≈', '≡', '∀', '∁', '∂', '√', '∛', '∜', '∪', '∩', '∅', '%', '°', '℉', '℃', '∆', '∇', '∃', '∄', '∈', '∋', '←', '↑', '→', '↓', '↔', '∴', '∵', '+', '−', '¬', 'α', 'β', 'γ', 'δ', 'ε', 'θ', 'λ', 'μ', 'π', 'ρ', 'σ', 'τ', 'φ', 'ω', 'Δ', 'Σ', 'Ω']
