import { cellKey, parseCell } from './model/address'
import { parseInput } from './model/parseInput'
import type { StylePatch } from './model/style'
import { Workbook } from './model/workbook'
import { normalizeFormula } from './commands/doc'

export type Template = { id: string; label: string; build: () => Workbook }

function make(name: string, cells: Record<string, string>, styles: [string, StylePatch][] = [], widths: Record<number, number> = {}, merges: string[] = []): Workbook {
  const wb = new Workbook()
  const s = wb.sheets[0]
  s.name = name
  for (const [ref, text] of Object.entries(cells)) {
    const c = parseCell(ref)!
    const p = parseInput(text)
    const key = cellKey(c.r, c.c)
    if (p.kind === 'formula') s.cells.set(key, { f: normalizeFormula(p.f) })
    else s.cells.set(key, { v: p.v ?? undefined, s: p.fmt ? wb.styles.intern({ fmt: p.fmt }) : undefined })
  }
  for (const [range, patch] of styles) {
    const [a, b] = range.split(':')
    const c1 = parseCell(a)!
    const c2 = parseCell(b ?? a)!
    for (let r = c1.r; r <= c2.r; r++)
      for (let c = c1.c; c <= c2.c; c++) {
        const key = cellKey(r, c)
        const d = s.cells.get(key) ?? {}
        s.cells.set(key, { ...d, s: wb.styles.patch(d.s, patch) })
      }
  }
  for (const [c, w] of Object.entries(widths)) s.cols.manual.set(Number(c), w)
  s.cols.touch()
  for (const m of merges) {
    const [a, b] = m.split(':')
    const c1 = parseCell(a)!
    const c2 = parseCell(b)!
    s.merges.push({ r1: c1.r, c1: c1.c, r2: c2.r, c2: c2.c })
  }
  return wb
}

const money = '_("$"* #,##0.00_);_("$"* \\(#,##0.00\\);_("$"* "-"??_);_(@_)'
const header: StylePatch = { bold: true, color: '#FFFFFF', fill: '#15784A' }
const title: StylePatch = { bold: true, size: 18, color: '#15784A' }

export const TEMPLATES: Template[] = [
  { id: 'blank', label: 'Blank workbook', build: () => new Workbook() },
  {
    id: 'budget',
    label: 'Monthly budget',
    build: () =>
      make(
        'Budget',
        {
          A1: 'Monthly Budget', A3: 'Category', B3: 'Planned', C3: 'Actual', D3: 'Difference',
          A4: 'Rent', B4: '1200', C4: '1200', A5: 'Groceries', B5: '450', C5: '512.4', A6: 'Utilities', B6: '180', C6: '164.9',
          A7: 'Transport', B7: '120', C7: '98', A8: 'Insurance', B8: '95', C8: '95', A9: 'Leisure', B9: '200', C9: '245.5', A10: 'Savings', B10: '400', C10: '400',
          D4: '=B4-C4', D5: '=B5-C5', D6: '=B6-C6', D7: '=B7-C7', D8: '=B8-C8', D9: '=B9-C9', D10: '=B10-C10',
          A11: 'Total', B11: '=SUM(B4:B10)', C11: '=SUM(C4:C10)', D11: '=SUM(D4:D10)',
          F3: 'Income', G3: '3200', F4: 'Left over', G4: '=G3-C11',
        },
        [['A1', title], ['A3:D3', header], ['F3:F4', { bold: true }], ['B4:D11', { fmt: money }], ['G3:G4', { fmt: money }], ['A11:D11', { bold: true, bt: { style: 'thin', color: '#15784A' }, bb: { style: 'double', color: '#15784A' } }]],
        { 0: 120, 1: 96, 2: 96, 3: 96, 5: 90, 6: 96 },
      ),
  },
  {
    id: 'loan',
    label: 'Loan calculator',
    build: () =>
      make(
        'Loan',
        {
          A1: 'Loan Calculator', A3: 'Loan amount', B3: '250000', A4: 'Annual interest rate', B4: '5.5%', A5: 'Term (years)', B5: '30', A6: 'Payments per year', B6: '12',
          A8: 'Monthly payment', B8: '=-PMT(B4/B6,B5*B6,B3)', A9: 'Number of payments', B9: '=B5*B6', A10: 'Total paid', B10: '=B8*B9', A11: 'Total interest', B11: '=B10-B3',
          D3: 'Payment', E3: 'Interest', F3: 'Principal', G3: 'Balance',
          D4: '=SEQUENCE(12)', E4: '=-IPMT($B$4/$B$6,D4#,$B$9,$B$3)', F4: '=-PPMT($B$4/$B$6,D4#,$B$9,$B$3)', G4: '=$B$3-SCAN(0,F4#,LAMBDA(a,v,a+v))',
        },
        [['A1', title], ['A3:A11', { bold: true }], ['B3', { fmt: money }], ['B8:B11', { fmt: money }], ['D3:G3', header], ['E4:G15', { fmt: money }]],
        { 0: 150, 1: 110, 3: 70, 4: 96, 5: 96, 6: 110 },
      ),
  },
  {
    id: 'todo',
    label: 'To-do list',
    build: () =>
      make(
        'To-do',
        {
          A1: 'To-Do List', A3: 'Task', B3: 'Owner', C3: 'Due', D3: 'Status', E3: 'Days left',
          A4: 'Draft project plan', B4: 'Alex', C4: '=TODAY()+3', D4: 'In progress', A5: 'Book venue', B5: 'Sam', C5: '=TODAY()+10', D5: 'Not started',
          A6: 'Send invitations', B6: 'Kim', C6: '=TODAY()+14', D6: 'Not started', A7: 'Order supplies', B7: 'Alex', C7: '=TODAY()-1', D7: 'Done',
          E4: '=C4-TODAY()', E5: '=C5-TODAY()', E6: '=C6-TODAY()', E7: '=C7-TODAY()',
          G3: 'Open tasks', H3: '=COUNTIF(D4:D7,"<>Done")',
        },
        [['A1', title], ['A3:E3', header], ['C4:C7', { fmt: 'm/d/yyyy' }], ['G3', { bold: true }]],
        { 0: 160, 1: 80, 2: 90, 3: 100, 4: 80, 6: 90 },
      ),
  },
  {
    id: 'invoice',
    label: 'Simple invoice',
    build: () =>
      make(
        'Invoice',
        {
          A1: 'INVOICE', A3: 'Bill to:', A4: 'Customer name', A5: 'Street address', A6: 'City, ZIP', D3: 'Invoice #', E3: '1001', D4: 'Date', E4: '=TODAY()',
          A8: 'Description', B8: 'Qty', C8: 'Unit price', D8: 'Amount',
          A9: 'Consulting', B9: '10', C9: '95', D9: '=B9*C9', A10: 'Travel', B10: '1', C10: '180', D10: '=B10*C10', A11: 'Materials', B11: '3', C11: '42.5', D11: '=B11*C11',
          C13: 'Subtotal', D13: '=SUM(D9:D12)', C14: 'Tax rate', D14: '8%', C15: 'Tax', D15: '=D13*D14', C16: 'Total', D16: '=D13+D15',
        },
        [['A1', { ...title, size: 24 }], ['A8:D8', header], ['C9:D13', { fmt: money }], ['D15:D16', { fmt: money }], ['C16:D16', { bold: true, bt: { style: 'thin', color: '#000000' } }], ['E4', { fmt: 'm/d/yyyy' }]],
        { 0: 180, 1: 50, 2: 90, 3: 100, 4: 90 },
      ),
  },
]
