export type ErrorCode = '#NULL!' | '#DIV/0!' | '#VALUE!' | '#REF!' | '#NAME?' | '#NUM!' | '#N/A' | '#SPILL!' | '#CALC!' | '#GETTING_DATA'

export const ERROR_CODES: ErrorCode[] = ['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A', '#GETTING_DATA', '#SPILL!', '#CALC!']

export class CellError {
  constructor(
    readonly code: ErrorCode,
    readonly message?: string,
  ) {}
  toString() {
    return this.code
  }
}

export const ERR = {
  null: new CellError('#NULL!'),
  div0: new CellError('#DIV/0!'),
  value: new CellError('#VALUE!'),
  ref: new CellError('#REF!'),
  name: new CellError('#NAME?'),
  num: new CellError('#NUM!'),
  na: new CellError('#N/A'),
  spill: new CellError('#SPILL!'),
  calc: new CellError('#CALC!'),
}

export function errorFromCode(code: string): CellError | null {
  const c = ERROR_CODES.find((e) => e === code.toUpperCase())
  return c ? new CellError(c) : null
}

/** A plain cell value. `null` is an empty cell. */
export type Scalar = number | string | boolean | CellError | null

export const isError = (v: unknown): v is CellError => v instanceof CellError
