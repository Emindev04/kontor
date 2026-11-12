import { MAX_COLS, MAX_ROWS } from '../model/address'
import type { ErrorCode } from '../model/types'
import { tokenize, type RefParts, type Token } from './tokenizer'
import { t } from '../i18n'

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
    const tok = this.peek()
    if (tok) throw new ParseError(t('Unexpected "{text}"', { text: tok.text }))
    return n
  }

  private canStartOperand(t?: Token) {
    return !!t && (t.type === 'ref' || t.type === 'name' || t.type === 'func' || t.type === 'lparen' || t.type === 'struct')
  }

  expr(min: number): Node {
    let left = this.prefix()
    for (;;) {
      const hadWs = this.wsAhead()
      const tok = this.peek()
      if (!tok) break
      if (tok.type === 'op' && tok.text === '%' && PREC_PCT >= min) {
        this.next()
        left = { k: 'pct', a: left }
        continue
      }
      if (tok.type === 'op' && tok.text === ':' && PREC_RANGE >= min) {
        this.next()
        const right = this.prefixRangeOperand()
        left = { k: 'bin', op: ':', a: left, b: right }
        continue
      }
      if (tok.type === 'spill') {
        this.next()
        left = { k: 'spill', a: left }
        continue
      }
      if (tok.type === 'lparen' && !hadWs && (left.k === 'fn' || left.k === 'call' || left.k === 'name')) {
        // LAMBDA(...)(args) or name(args) invocation
        this.next()
        left = { k: 'call', callee: left, args: this.args() }
        continue
      }
      if (hadWs && this.canStartOperand(tok) && PREC_ISECT >= min && isRefLike(left)) {
        const right = this.expr(PREC_ISECT + 1)
        left = { k: 'bin', op: ' ', a: left, b: right }
        continue
      }
      if (tok.type === 'op' && BIN_PREC[tok.text] !== undefined) {
        const p = BIN_PREC[tok.text]
        if (p < min) break
        this.next()
        const right = this.expr(p + 1)
        left = { k: 'bin', op: tok.text, a: left, b: right }
        continue
      }
      break
    }
    return left
  }

  private prefixRangeOperand(): Node {
    const tok = this.peek()
    if (tok?.type === 'ref' || tok?.type === 'name' || tok?.type === 'func' || tok?.type === 'lparen' || tok?.type === 'struct') return this.prefix()
    throw new ParseError(t('Expected a reference after ":"'))
  }

  private args(): Node[] {
    const args: Node[] = []
    if (this.peek()?.type === 'rparen') {
      this.next()
      return args
    }
    for (;;) {
      const tok = this.peek()
      if (!tok) throw new ParseError(t('Missing ")"'))
      args.push(tok.type === 'comma' || tok.type === 'rparen' ? { k: 'empty' } : this.expr(0))
      const sep = this.next()
      if (!sep) throw new ParseError(t('Missing ")"'))
      if (sep.type === 'rparen') return args
      if (sep.type !== 'comma') throw new ParseError(t('Unexpected "{text}"', { text: sep.text }))
    }
  }

  private prefix(): Node {
    const tok = this.next()
    if (!tok) throw new ParseError(t('Formula is incomplete'))
    switch (tok.type) {
      case 'num': return { k: 'num', v: tok.num! }
      case 'str': return { k: 'str', v: tok.str! }
      case 'bool': return { k: 'bool', v: tok.bool! }
      case 'err': return { k: 'err', v: tok.err! }
      case 'ref': return { k: 'ref', sheet: tok.ref!.sheet, sheet2: tok.ref!.sheet2, area: refArea(tok.ref!) }
      case 'name': return { k: 'name', name: tok.id!, sheet: tok.sheet }
      case 'struct': return { k: 'struct', table: tok.table ?? '', spec: tok.spec ?? '[]' }
      case 'func': {
        const open = this.toks[this.i]
        if (open?.type !== 'lparen') throw new ParseError(t('Expected "("'))
        this.i++
        return { k: 'fn', name: tok.id!, args: this.args() }
      }
      case 'at': return { k: 'at', a: this.expr(PREC_UNARY) }
      case 'op':
        if (tok.text === '-' || tok.text === '+') return { k: 'un', op: tok.text, a: this.expr(PREC_UNARY) }
        throw new ParseError(t('Unexpected "{text}"', { text: tok.text }))
      case 'lparen': {
        const first = this.expr(0)
        const items = [first]
        while (this.peek()?.type === 'comma') {
          this.next()
          items.push(this.expr(0))
        }
        const close = this.next()
        if (close?.type !== 'rparen') throw new ParseError(t('Missing ")"'))
        return items.length > 1 ? { k: 'union', items } : first
      }
      case 'lbrace': return this.array()
      default:
        throw new ParseError(t('Unexpected "{text}"', { text: tok.text }))
    }
  }

  private array(): Node {
    const rows: Node[][] = [[]]
    for (;;) {
      const tok = this.next()
      if (!tok) throw new ParseError(t('Missing "}"'))
      if (tok.type === 'rbrace') break
      if (tok.type === 'comma') continue
      if (tok.type === 'semi') {
        rows.push([])
        continue
      }
      let node: Node
      if (tok.type === 'op' && (tok.text === '-' || tok.text === '+')) {
        const n = this.next()
        if (n?.type !== 'num') throw new ParseError(t('Array constants may only contain values'))
        node = { k: 'num', v: tok.text === '-' ? -n.num! : n.num! }
      } else if (tok.type === 'num') node = { k: 'num', v: tok.num! }
      else if (tok.type === 'str') node = { k: 'str', v: tok.str! }
      else if (tok.type === 'bool') node = { k: 'bool', v: tok.bool! }
      else if (tok.type === 'err') node = { k: 'err', v: tok.err! }
      else throw new ParseError(t('Array constants may only contain values'))
      rows[rows.length - 1].push(node)
    }
    const w = rows[0].length
    if (rows.some((r) => r.length !== w)) throw new ParseError(t('Array rows must have the same length'))
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
