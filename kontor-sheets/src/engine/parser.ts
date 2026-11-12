import { MAX_COLS, MAX_ROWS } from '../model/address'
import type { ErrorCode } from '../model/types'
import { tokenize, type RefParts, type Token } from './tokenizer'

export type Area = { r1: number; c1: number; r2: number; c2: number }

export type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'err'; v: ErrorCode }
  | { k: 'ref'; sheet?: string; sheet2?: string; area: Area }
  | { k: 'name'; name: string; sheet?: string }
  | { k: 'fn'; name: string; args: Node[] }
  | { k: 'call'; callee: Node; args: Node[] }
  | { k: 'un'; op: '-' | '+'; a: Node }
  | { k: 'pct'; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'union'; items: Node[] }
  | { k: 'arr'; rows: Node[][] }
  | { k: 'spill'; a: Node }
  | { k: 'at'; a: Node }
  | { k: 'struct'; table: string; spec: string }
  | { k: 'empty' }

export class ParseError extends Error {}

export function refArea(p: RefParts): Area {
  if (p.kind === 'cols') {
    const c1 = Math.min(p.a.col!, p.b!.col!)
    const c2 = Math.max(p.a.col!, p.b!.col!)
    return { r1: 0, r2: MAX_ROWS - 1, c1, c2 }
  }
  if (p.kind === 'rows') {
    const r1 = Math.min(p.a.row!, p.b!.row!)
    const r2 = Math.max(p.a.row!, p.b!.row!)
    return { r1, r2, c1: 0, c2: MAX_COLS - 1 }
  }
  const b = p.b ?? p.a
  return { r1: Math.min(p.a.row!, b.row!), r2: Math.max(p.a.row!, b.row!), c1: Math.min(p.a.col!, b.col!), c2: Math.max(p.a.col!, b.col!) }
}

const BIN_PREC: Record<string, number> = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 }
const PREC_PCT = 6
const PREC_UNARY = 7
const PREC_ISECT = 9
const PREC_RANGE = 10

class Parser {
  private i = 0
  private toks: Token[]
  constructor(tokens: Token[]) {
    this.toks = tokens
  }

  private peek(skipWs = true): Token | undefined {
    let j = this.i
    if (skipWs) while (this.toks[j]?.type === 'ws') j++
    return this.toks[j]
  }

  private next(): Token | undefined {
    while (this.toks[this.i]?.type === 'ws') this.i++
    return this.toks[this.i++]
  }

  private wsAhead(): boolean {
    return this.toks[this.i]?.type === 'ws'
  }

  parse(): Node {
    const n = this.expr(0)
    const t = this.peek()
    if (t) throw new ParseError(`Unexpected "${t.text}"`)
    return n
  }

  private canStartOperand(t?: Token) {
    return !!t && (t.type === 'ref' || t.type === 'name' || t.type === 'func' || t.type === 'lparen' || t.type === 'struct')
  }

  expr(min: number): Node {
    let left = this.prefix()
    for (;;) {
      const hadWs = this.wsAhead()
      const t = this.peek()
      if (!t) break
      if (t.type === 'op' && t.text === '%' && PREC_PCT >= min) {
        this.next()
        left = { k: 'pct', a: left }
        continue
      }
      if (t.type === 'op' && t.text === ':' && PREC_RANGE >= min) {
        this.next()
        const right = this.prefixRangeOperand()
        left = { k: 'bin', op: ':', a: left, b: right }
        continue
      }
      if (t.type === 'spill') {
        this.next()
        left = { k: 'spill', a: left }
        continue
      }
      if (t.type === 'lparen' && !hadWs && (left.k === 'fn' || left.k === 'call' || left.k === 'name')) {
        // LAMBDA(...)(args) or name(args) invocation
        this.next()
        left = { k: 'call', callee: left, args: this.args() }
        continue
      }
      if (hadWs && this.canStartOperand(t) && PREC_ISECT >= min && isRefLike(left)) {
        const right = this.expr(PREC_ISECT + 1)
        left = { k: 'bin', op: ' ', a: left, b: right }
        continue
      }
      if (t.type === 'op' && BIN_PREC[t.text] !== undefined) {
        const p = BIN_PREC[t.text]
        if (p < min) break
        this.next()
        const right = this.expr(p + 1)
        left = { k: 'bin', op: t.text, a: left, b: right }
        continue
      }
      break
    }
    return left
  }

  private prefixRangeOperand(): Node {
    const t = this.peek()
    if (t?.type === 'ref' || t?.type === 'name' || t?.type === 'func' || t?.type === 'lparen' || t?.type === 'struct') return this.prefix()
    throw new ParseError('Expected a reference after ":"')
  }

  private args(): Node[] {
    const args: Node[] = []
    if (this.peek()?.type === 'rparen') {
      this.next()
      return args
    }
    for (;;) {
      const t = this.peek()
      if (!t) throw new ParseError('Missing ")"')
      args.push(t.type === 'comma' || t.type === 'rparen' ? { k: 'empty' } : this.expr(0))
      const sep = this.next()
      if (!sep) throw new ParseError('Missing ")"')
      if (sep.type === 'rparen') return args
      if (sep.type !== 'comma') throw new ParseError(`Unexpected "${sep.text}"`)
    }
  }

  private prefix(): Node {
    const t = this.next()
    if (!t) throw new ParseError('Formula is incomplete')
    switch (t.type) {
      case 'num': return { k: 'num', v: t.num! }
      case 'str': return { k: 'str', v: t.str! }
      case 'bool': return { k: 'bool', v: t.bool! }
      case 'err': return { k: 'err', v: t.err! }
      case 'ref': return { k: 'ref', sheet: t.ref!.sheet, sheet2: t.ref!.sheet2, area: refArea(t.ref!) }
      case 'name': return { k: 'name', name: t.id!, sheet: t.sheet }
      case 'struct': return { k: 'struct', table: t.table ?? '', spec: t.spec ?? '[]' }
      case 'func': {
        const open = this.toks[this.i]
        if (open?.type !== 'lparen') throw new ParseError('Expected "("')
        this.i++
        return { k: 'fn', name: t.id!, args: this.args() }
      }
      case 'at': return { k: 'at', a: this.expr(PREC_UNARY) }
      case 'op':
        if (t.text === '-' || t.text === '+') return { k: 'un', op: t.text, a: this.expr(PREC_UNARY) }
        throw new ParseError(`Unexpected "${t.text}"`)
      case 'lparen': {
        const first = this.expr(0)
        const items = [first]
        while (this.peek()?.type === 'comma') {
          this.next()
          items.push(this.expr(0))
        }
        const close = this.next()
        if (close?.type !== 'rparen') throw new ParseError('Missing ")"')
        return items.length > 1 ? { k: 'union', items } : first
      }
      case 'lbrace': return this.array()
      default:
        throw new ParseError(`Unexpected "${t.text}"`)
    }
  }

  private array(): Node {
    const rows: Node[][] = [[]]
    for (;;) {
      const t = this.next()
      if (!t) throw new ParseError('Missing "}"')
      if (t.type === 'rbrace') break
      if (t.type === 'comma') continue
      if (t.type === 'semi') {
        rows.push([])
        continue
      }
      let node: Node
      if (t.type === 'op' && (t.text === '-' || t.text === '+')) {
        const n = this.next()
        if (n?.type !== 'num') throw new ParseError('Array constants may only contain values')
        node = { k: 'num', v: t.text === '-' ? -n.num! : n.num! }
      } else if (t.type === 'num') node = { k: 'num', v: t.num! }
      else if (t.type === 'str') node = { k: 'str', v: t.str! }
      else if (t.type === 'bool') node = { k: 'bool', v: t.bool! }
      else if (t.type === 'err') node = { k: 'err', v: t.err! }
      else throw new ParseError('Array constants may only contain values')
      rows[rows.length - 1].push(node)
    }
    const w = rows[0].length
    if (rows.some((r) => r.length !== w)) throw new ParseError('Array rows must have the same length')
    return { k: 'arr', rows }
  }
}

function isRefLike(n: Node): boolean {
  return n.k === 'ref' || n.k === 'name' || n.k === 'fn' || n.k === 'struct' || (n.k === 'bin' && (n.op === ':' || n.op === ' ')) || n.k === 'union'
}

export function parseFormula(text: string): Node {
  return new Parser(tokenize(text)).parse()
}

/** Collects function names used in a formula (for volatility / unknown-function checks). */
export function functionNames(n: Node, out = new Set<string>()): Set<string> {
  switch (n.k) {
    case 'fn': out.add(n.name); n.args.forEach((a) => functionNames(a, out)); break
    case 'call': functionNames(n.callee, out); n.args.forEach((a) => functionNames(a, out)); break
    case 'un': case 'pct': case 'spill': case 'at': functionNames(n.a, out); break
    case 'bin': functionNames(n.a, out); functionNames(n.b, out); break
    case 'union': n.items.forEach((a) => functionNames(a, out)); break
    default: break
  }
  return out
}
