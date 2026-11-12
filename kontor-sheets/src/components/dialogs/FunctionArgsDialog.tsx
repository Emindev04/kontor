// Function Arguments: one box per argument with its live value, the function's help text and the
// formula result (opened from Insert Function, the fx button and Shift+F3).
import { useMemo, useState } from 'react'
import { FN_META } from '../../engine/functions/meta'
import { Matrix } from '../../model/matrix'
import { CellError, type Scalar } from '../../model/types'
import { RefV } from '../../engine/values'
import { cellName } from '../../model/address'
import { useApp } from '../appContext'
import { Modal, OkCancel } from '../ui'
import { t } from '../../i18n'

/** Splits the top-level arguments of "NAME(a, b(c, d), "x,y")". */
export function splitCall(formula: string, name: string): string[] | null {
  const m = new RegExp(`^=\\s*${name.replace(/\./g, '\\.')}\\s*\\(([\\s\\S]*)\\)\\s*$`, 'i').exec(formula.trim())
  if (!m) return null
  const out: string[] = []
  let depth = 0
  let inStr = false
  let cur = ''
  for (const ch of m[1]) {
    if (ch === '"') inStr = !inStr
    if (!inStr && (ch === '(' || ch === '{')) depth++
    if (!inStr && (ch === ')' || ch === '}')) depth--
    if (!inStr && depth === 0 && ch === ',') {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim() || out.length) out.push(cur.trim())
  return out
}

function show(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof CellError) return v.code
  if (v instanceof Matrix) {
    const items = v.data.slice(0, 6).map((x) => show(x as Scalar))
    return `{${items.join(',')}${v.data.length > 6 ? ',…' : ''}}`
  }
  if (v instanceof RefV) return 'reference'
  if (typeof v === 'number') return String(Math.round(v * 1e10) / 1e10)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return `"${String(v)}"`
}

export function FunctionArgsDialog({ fn, onClose }: { fn: string; onClose: () => void }) {
  const app = useApp()
  const doc = app.doc
  const meta = FN_META.get(fn.toUpperCase())
  const { r, c } = doc.sel.active
  const sheet = doc.sheet
  const existing = useMemo(() => {
    const f = doc.edit ? doc.edit.text : sheet.get(r, c)?.f !== undefined ? `=${sheet.get(r, c)!.f}` : ''
    return splitCall(f, fn) ?? []
  }, [doc, fn, sheet, r, c])
  const specs = meta?.args ?? []
  const variadic = specs.some((a) => a.includes('...'))
  const named = specs.filter((a) => !a.includes('...'))
  const [values, setValues] = useState<string[]>(() => {
    const n = Math.max(named.length, existing.length, 1)
    return Array.from({ length: n }, (_, i) => existing[i] ?? '')
  })
  const [focus, setFocus] = useState(0)
  const label = (i: number) => {
    const spec = named[i] ?? named[named.length - 1]?.replace(/\d+\]?$/, (d) => String(Number(d.replace(']', '')) + i - named.length + 1) + (d.endsWith(']') ? ']' : '')) ?? `value${i + 1}`
    return spec.replace(/[[\]]/g, '')
  }
  const optional = (i: number) => (named[i] ?? '[x]').startsWith('[')
  const evalText = (t: string) => {
    if (!t.trim()) return ''
    try {
      return show(doc.engine.evalFormula(t, sheet, r, c))
    } catch {
      return '#VALUE!'
    }
  }
  const trimmed = values.slice(0, values.reduce((last, v, i) => (v.trim() ? i + 1 : last), 0))
  const formula = `=${fn}(${trimmed.join(',')})`
  const result = evalText(formula.slice(1))
  const set = (i: number, v: string) => {
    const next = values.map((x, j) => (j === i ? v : x))
    if (variadic && i === next.length - 1 && v.trim() && next.length < 255) next.push('')
    setValues(next)
  }
  const ok = () => {
    if (doc.edit) doc.cancelEdit()
    const err = doc.setInput(r, c, formula)
    if (typeof err === 'string' && err) return app.alert(err)
    onClose()
    app.focusGrid()
  }
  return (
    <Modal title={t('Function Arguments')} onClose={onClose} width={520} footer={<OkCancel onOk={ok} onCancel={onClose} />}>
      <div className="fa">
        <div className="fa-name">{fn}</div>
        <div className="fa-args">
          {values.map((v, i) => (
            <label key={i} className="fa-row">
              <span className={optional(i) ? 'fa-label' : 'fa-label fa-required'}>{label(i)}</span>
              <input value={v} autoFocus={i === 0} onFocus={() => setFocus(i)} onChange={(e) => set(i, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} />
              <span className="fa-value">{v.trim() ? `= ${evalText(v)}` : optional(i) ? '' : '= ?'}</span>
            </label>
          ))}
        </div>
        <div className="fa-result">= {result}</div>
        <p className="fa-desc">{meta ? t(meta.description) : t('No description is available for this function.')}</p>
        <p className="fa-help">
          <strong>{label(focus)}</strong> {optional(focus) ? t('(optional)') : t('(required)')} {t('— argument {n} of {function}.', { n: focus + 1, function: meta ? `${fn}(${specs.join(', ')})` : fn })}
        </p>
        <p className="fa-foot">{t('Formula result = {result} · Cell {cell}', { result, cell: cellName(r, c) })}</p>
      </div>
    </Modal>
  )
}
