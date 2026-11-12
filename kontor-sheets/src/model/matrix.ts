import type { Scalar } from './types'

/** A 2-D array of values (array constants, function results, spilled ranges). */
export class Matrix {
  constructor(
    readonly rows: number,
    readonly cols: number,
    readonly data: Scalar[],
  ) {}

  static from(rows: Scalar[][]): Matrix {
    const cols = Math.max(1, ...rows.map((r) => r.length))
    const data: Scalar[] = []
    for (const r of rows) for (let c = 0; c < cols; c++) data.push(c < r.length ? r[c] : null)
    return new Matrix(Math.max(1, rows.length), cols, data.length ? data : [null])
  }

  static fill(rows: number, cols: number, f: (r: number, c: number) => Scalar): Matrix {
    const data: Scalar[] = new Array(rows * cols)
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) data[r * cols + c] = f(r, c)
    return new Matrix(rows, cols, data)
  }

  get(r: number, c: number): Scalar {
    return this.data[r * this.cols + c]
  }

  row(r: number): Scalar[] {
    return this.data.slice(r * this.cols, (r + 1) * this.cols)
  }

  col(c: number): Scalar[] {
    const out: Scalar[] = []
    for (let r = 0; r < this.rows; r++) out.push(this.data[r * this.cols + c])
    return out
  }

  toRows(): Scalar[][] {
    const out: Scalar[][] = []
    for (let r = 0; r < this.rows; r++) out.push(this.row(r))
    return out
  }

  map(f: (v: Scalar, r: number, c: number) => Scalar): Matrix {
    return Matrix.fill(this.rows, this.cols, (r, c) => f(this.get(r, c), r, c))
  }

  transpose(): Matrix {
    return Matrix.fill(this.cols, this.rows, (r, c) => this.get(c, r))
  }
}
