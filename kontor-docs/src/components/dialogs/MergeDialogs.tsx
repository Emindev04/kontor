import { useState, useSyncExternalStore } from 'react'
import type { Editor } from '@tiptap/react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal, OkCancel } from '../ui'
import { MATCH_FIELDS, fillRecord, includedRows, matchedColumn, mergeStore, toCsv } from '../../editor/MailMerge'
import { downloadBlob, safeFilename } from '../../io/download'
import type { AppApi } from '../tabs/types'

const NEW_LIST_COLUMNS = ['Title', 'First Name', 'Last Name', 'Company Name', 'Address Line 1', 'City', 'State', 'ZIP Code', 'E-mail Address']

/**
 * Type a New List (empty table to fill in) and Edit Recipient List (check who gets a copy, sort,
 * filter and correct entries). Both can save the list as a CSV file.
 */
export function RecipientsDialog({ mode, onClose }: { mode: 'new' | 'edit'; onClose: () => void }) {
  const data = useSyncExternalStore(mergeStore.subscribe, mergeStore.get)
  const [columns] = useState(() => (mode === 'new' ? NEW_LIST_COLUMNS : data.columns))
  const [rows, setRows] = useState<Record<string, string>[]>(() => (mode === 'new' ? [Object.fromEntries(NEW_LIST_COLUMNS.map((c) => [c, '']))] : data.rows.map((r) => ({ ...r }))))
  const [excluded, setExcluded] = useState<number[]>(mode === 'new' ? [] : data.excluded)
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<{ column: string; dir: 1 | -1 } | null>(null)
  const order = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => !filter || columns.some((c) => (r[c] ?? '').toLowerCase().includes(filter.toLowerCase())))
    .sort((a, b) => (sort ? sort.dir * (a.r[sort.column] ?? '').localeCompare(b.r[sort.column] ?? '', undefined, { numeric: true }) : a.i - b.i))
  const set = (i: number, c: string, v: string) => setRows(rows.map((r, k) => (k === i ? { ...r, [c]: v } : r)))
  const save = () => {
    const kept = rows.filter((r) => columns.some((c) => (r[c] ?? '').trim()))
    if (mode === 'new') mergeStore.set({ columns, rows: kept, record: 0, source: 'New list', excluded: [], fieldMap: {} })
    else mergeStore.set({ rows, excluded })
    onClose()
  }
  return (
    <Modal
      title={mode === 'new' ? 'New Address List' : 'Mail Merge Recipients'}
      onClose={onClose}
      width={860}
      footer={
        <OkCancel
          onOk={save}
          onCancel={onClose}
          extra={
            <>
              <button type="button" className="btn" onClick={() => setRows([...rows, Object.fromEntries(columns.map((c) => [c, '']))])}>
                <Plus size={14} /> New Entry
              </button>
              <button type="button" className="btn" onClick={() => downloadBlob(new Blob([toCsv(columns, rows)], { type: 'text/csv' }), `${safeFilename(data.source || 'Recipients')}.csv`)}>
                Save List as CSV…
              </button>
            </>
          }
        />
      }
    >
      <div className="dlg-stack">
        {mode === 'edit' && (
          <div className="dlg-inline">
            <span className="dlg-hint">Check the recipients who get a copy. Click a column heading to sort.</span>
            <span className="spacer" />
            <input placeholder="Filter…" aria-label="Filter recipients" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
        )}
        <div className="merge-table-wrap">
          <table className="merge-table">
            <thead>
              <tr>
                {mode === 'edit' && (
                  <th>
                    <input type="checkbox" aria-label="All recipients" checked={!excluded.length} onChange={(e) => setExcluded(e.target.checked ? [] : rows.map((_, i) => i))} />
                  </th>
                )}
                {columns.map((c) => (
                  <th key={c} onClick={() => setSort({ column: c, dir: sort?.column === c && sort.dir === 1 ? -1 : 1 })}>
                    {c}
                    {sort?.column === c ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {order.map(({ r, i }) => (
                <tr key={i}>
                  {mode === 'edit' && (
                    <td>
                      <input type="checkbox" aria-label={`Include recipient ${i + 1}`} checked={!excluded.includes(i)} onChange={(e) => setExcluded(e.target.checked ? excluded.filter((x) => x !== i) : [...excluded, i])} />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c}>
                      <input value={r[c] ?? ''} aria-label={`${c} ${i + 1}`} onChange={(e) => set(i, c, e.target.value)} />
                    </td>
                  ))}
                  <td>
                    <button type="button" className="sb-btn" aria-label="Delete entry" onClick={() => (setRows(rows.filter((_, k) => k !== i)), setExcluded(excluded.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x))))}>
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}

/** Match Fields: which column of the list holds each field the Address Block and Greeting Line use. */
export function MatchFieldsDialog({ onClose }: { onClose: () => void }) {
  const data = useSyncExternalStore(mergeStore.subscribe, mergeStore.get)
  const [map, setMap] = useState<Record<string, string>>(() => Object.fromEntries(MATCH_FIELDS.map(([f]) => [f, matchedColumn(f) ?? ''])))
  return (
    <Modal title="Match Fields" onClose={onClose} width={460} footer={<OkCancel onOk={() => (mergeStore.set({ fieldMap: Object.fromEntries(Object.entries(map).filter(([, v]) => v)) }), onClose())} onCancel={onClose} />}>
      <p className="dlg-hint">Choose the column of your recipient list that matches each field.</p>
      <div className="match-grid">
        {MATCH_FIELDS.map(([f]) => (
          <label key={f} className="dlg-inline">
            <span className="match-label">{f}</span>
            <select value={map[f]} onChange={(e) => setMap({ ...map, [f]: e.target.value })}>
              <option value="">(not matched)</option>
              {data.columns.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </Modal>
  )
}

const plain = (editor: Editor, row: Record<string, string>) => {
  const doc = fillRecord(editor.getJSON(), row)
  const lines: string[] = []
  const walk = (n: import('@tiptap/core').JSONContent, line: string[]) => {
    if (n.type === 'text') line.push(n.text ?? '')
    else if (n.type === 'hardBreak') line.push('\n')
    else if (n.content && (n.type === 'paragraph' || n.type === 'heading')) {
      const own: string[] = []
      n.content.forEach((c) => walk(c, own))
      lines.push(own.join(''))
    } else n.content?.forEach((c) => walk(c, line))
  }
  walk(doc, [])
  return lines.join('\r\n')
}

/**
 * Finish & Merge › Send E-mail Messages: one message per recipient, saved as .eml files (in a .zip)
 * that any mail program opens ready to send, since a web page cannot send mail itself.
 */
export function EmailMergeDialog({ editor, app, onClose }: { editor: Editor; app: AppApi; onClose: () => void }) {
  const data = useSyncExternalStore(mergeStore.subscribe, mergeStore.get)
  const [to, setTo] = useState(matchedColumn('E-mail Address') ?? data.columns[0] ?? '')
  const [subject, setSubject] = useState(app.title)
  const run = async () => {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const rows = includedRows(data)
    rows.forEach((row, i) => {
      const address = row[to] ?? ''
      const body = plain(editor, row)
      const mail = [`To: ${address}`, `Subject: ${subject}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'X-Unsent: 1', '', body].join('\r\n')
      zip.file(`${String(i + 1).padStart(3, '0')} ${safeFilename(address || `recipient ${i + 1}`)}.eml`, mail)
    })
    downloadBlob(await zip.generateAsync({ type: 'blob' }), `${safeFilename(subject || 'Messages')}.zip`)
    onClose()
  }
  return (
    <Modal title="Merge to E-mail" onClose={onClose} width={460} footer={<OkCancel okLabel="Create Messages" onOk={run} onCancel={onClose} />}>
      <div className="dlg-stack">
        <label className="dlg-inline">
          To:
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {data.columns.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="dlg-inline">
          Subject line: <input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </label>
        <p className="dlg-hint">Creates {includedRows(data).length} messages as .eml files in a .zip. Open them with your mail program and send them from there.</p>
      </div>
    </Modal>
  )
}
