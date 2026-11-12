/** Sizes of rows or columns with sparse overrides, plus fast offset lookups. */
export class Axis {
  readonly manual = new Map<number, number>()
  readonly auto = new Map<number, number>()
  readonly hidden = new Set<number>()
  private keys: number[] = []
  private prefix: number[] = [0]
  private dirty = true

  constructor(
    public def: number,
    readonly count: number,
  ) {}

  size(i: number): number {
    if (this.hidden.has(i)) return 0
    return this.manual.get(i) ?? this.auto.get(i) ?? this.def
  }

  /** Size ignoring the hidden flag (used for unhiding and for file export). */
  rawSize(i: number): number {
    return this.manual.get(i) ?? this.auto.get(i) ?? this.def
  }

  touch() {
    this.dirty = true
  }

  private build() {
    if (!this.dirty) return
    const set = new Set<number>([...this.manual.keys(), ...this.auto.keys(), ...this.hidden])
    this.keys = [...set].sort((a, b) => a - b)
    this.prefix = [0]
    for (let j = 0; j < this.keys.length; j++) this.prefix.push(this.prefix[j] + (this.size(this.keys[j]) - this.def))
    this.dirty = false
  }

  /** Pixel offset of the start of index `i` (unzoomed). */
  offset(i: number): number {
    this.build()
    let lo = 0
    let hi = this.keys.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.keys[mid] < i) lo = mid + 1
      else hi = mid
    }
    return i * this.def + this.prefix[lo]
  }

  total(): number {
    return this.offset(this.count)
  }

  /** Index containing pixel offset `px`. */
  indexAt(px: number): number {
    if (px <= 0) return this.firstVisible(0)
    let lo = 0
    let hi = this.count - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.offset(mid) <= px) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  firstVisible(from: number): number {
    let i = from
    while (i < this.count - 1 && this.hidden.has(i)) i++
    return i
  }

  /** Next visible index after `i` in direction `dir`, or `i` when none. */
  step(i: number, dir: 1 | -1): number {
    let j = i + dir
    while (j >= 0 && j < this.count && this.hidden.has(j)) j += dir
    return j < 0 || j >= this.count ? i : j
  }

  /** Shifts all overrides at or after `at` by `n` (negative removes). */
  shift(at: number, n: number) {
    const move = <T>(m: Map<number, T>) => {
      const entries = [...m.entries()]
      m.clear()
      for (const [k, v] of entries) {
        if (k < at) m.set(k, v)
        else if (n < 0 && k < at - n) continue
        else if (k + n < this.count) m.set(k + n, v)
      }
    }
    move(this.manual)
    move(this.auto)
    const hidden = [...this.hidden]
    this.hidden.clear()
    for (const k of hidden) {
      if (k < at) this.hidden.add(k)
      else if (n < 0 && k < at - n) continue
      else if (k + n < this.count) this.hidden.add(k + n)
    }
    this.touch()
  }

  snapshot() {
    return { def: this.def, manual: new Map(this.manual), auto: new Map(this.auto), hidden: new Set(this.hidden) }
  }

  restore(s: ReturnType<Axis['snapshot']>) {
    this.def = s.def
    this.manual.clear()
    s.manual.forEach((v, k) => this.manual.set(k, v))
    this.auto.clear()
    s.auto.forEach((v, k) => this.auto.set(k, v))
    this.hidden.clear()
    s.hidden.forEach((k) => this.hidden.add(k))
    this.touch()
  }
}
