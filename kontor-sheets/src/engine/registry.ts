import type { Node } from './parser'
import type { Ctx, Value } from './values'

export type FnImpl = (args: Value[], ctx: Ctx) => Value
export type LazyImpl = (args: Node[], ctx: Ctx) => Value

export interface FnDef {
  name: string
  min: number
  max: number
  impl?: FnImpl
  lazy?: LazyImpl
  volatile?: boolean
}

export const FUNCTIONS = new Map<string, FnDef>()

export function fn(name: string, min: number, max: number, impl: FnImpl, opts: { volatile?: boolean } = {}) {
  FUNCTIONS.set(name, { name, min, max, impl, ...opts })
}

export function lazyFn(name: string, min: number, max: number, lazy: LazyImpl) {
  FUNCTIONS.set(name, { name, min, max, lazy })
}

/** Registers `alias` with the same implementation as `name`. */
export function alias(aliasName: string, name: string) {
  const def = FUNCTIONS.get(name)
  if (def) FUNCTIONS.set(aliasName, { ...def, name: aliasName })
}

export const VARARGS = 255
