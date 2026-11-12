import { useSyncExternalStore } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Contact, Eye, FileCheck2, FileOutput, Highlighter, ListChecks, Mail, MailOpen, Search, Shuffle, Tags, Users, FilePen } from 'lucide-react'
import { MenuButton, RibbonButton, RibbonGroup } from '../ui'
import { includedRows, loadRecipients, matchedColumn, mergeAll, mergeStore, missingFields, type MergeType } from '../../editor/MailMerge'
import { pickFile } from '../../editor/commands'
import { downloadBlob, safeFilename } from '../../io/download'
import type { TabProps } from './types'

/** Address Block lines, as Match Fields names. */
const ADDRESS_FIELDS = [['Title', 'First Name', 'Last Name'], ['Company'], ['Address 1'], ['City', 'State', 'Postal Code'], ['Country']]

const MERGE_TYPES: { id: MergeType; label: string }[] = [
  { id: 'letters', label: 'Letters' },
  { id: 'email', label: 'E-mail Messages' },
  { id: 'envelopes', label: 'Envelopes…' },
  { id: 'labels', label: 'Labels…' },
  { id: 'directory', label: 'Directory' },
  { id: 'normal', label: 'Normal Document' },
]

export function MailingsTab({ app }: TabProps) {
  const editor = app.mainEditor
  const data = useSyncExternalStore(mergeStore.subscribe, mergeStore.get)
  const has = data.rows.length > 0
  const chain = () => editor.chain().focus()

  const selectRecipients = async () => {
    const file = await pickFile('.csv,text/csv,text/plain')
    if (!file) return
    try {
      loadRecipients(await file.text(), file.name)
    } catch (e) {
      alert(`The recipient list could not be read: ${(e as Error).message}`)
    }
  }

  const insertAddressBlock = () => {
    const lines = ADDRESS_FIELDS.map((group) => group.map((f) => matchedColumn(f)).filter((c): c is string => !!c)).filter((g) => g.length)
    const content = lines.flatMap((group, i) => [
      ...(i > 0 ? [{ type: 'hardBreak' }] : []),
      ...group.flatMap((f, j) => [...(j > 0 ? [{ type: 'text', text: ' ' }] : []), { type: 'mergeField', attrs: { name: f } }]),
    ])
    if (!content.length) return alert('The recipient list has no address columns. Use Match Fields to choose them.')
    chain().insertContent({ type: 'paragraph', content }).run()
  }

  const greeting = () => {
    const name = matchedColumn('First Name') ?? ['Name', 'Last Name'].find((c) => data.columns.includes(c)) ?? data.columns[0]
    chain().insertContent([{ type: 'text', text: 'Dear ' }, { type: 'mergeField', attrs: { name } }, { type: 'text', text: ',' }]).run()
  }

  const go = (record: number) => mergeStore.set({ record: Math.max(0, Math.min(data.rows.length - 1, record)) })
  const rows = includedRows(data)
  const merged = () => mergeAll(editor.getJSON(), rows, data.type)
  const findRecipient = () => {
    const q = prompt('Find recipient: text to look for in the recipient list')?.trim().toLowerCase()
    if (!q) return
    const start = data.record + 1
    const order = [...data.rows.keys()].map((k) => (k + start) % data.rows.length)
    const hit = order.find((k) => !data.excluded.includes(k) && Object.values(data.rows[k]).some((v) => v.toLowerCase().includes(q)))
    if (hit == null) alert(`No recipient contains "${q}".`)
    else mergeStore.set({ preview: true, record: hit })
  }
  const checkErrors = () => {
    const missing = missingFields(editor.getJSON())
    alert(missing.length ? `These merge fields have no column in the recipient list:\n\n${missing.join('\n')}\n\nUse Match Fields or edit the list.` : `No mail merge errors were found in ${data.rows.length ? `the ${rows.length} recipients` : 'the document'}.`)
  }

  return (
    <>
      <RibbonGroup label="Create" priority={1}>
        <RibbonButton large icon={Mail} label="Envelopes" onClick={() => app.openDialog('envelopes')} />
        <RibbonButton large icon={Tags} label="Labels" onClick={() => app.openDialog('labels')} />
      </RibbonGroup>
      <RibbonGroup label="Start Mail Merge" priority={3}>
        <MenuButton
          large
          icon={FilePen}
          label="Start Mail Merge"
          items={MERGE_TYPES.map((t) => ({
            label: t.label,
            active: data.type === t.id,
            onClick: () => {
              mergeStore.set({ type: t.id })
              if (t.id === 'envelopes') app.openDialog('envelopes')
              if (t.id === 'labels') app.openDialog('labels')
              if (t.id === 'normal') mergeStore.set({ preview: false })
            },
          }))}
        />
        <MenuButton
          large
          icon={Users}
          label="Select Recipients"
          items={[
            { label: 'Type a New List…', onClick: () => app.openDialog('newList') },
            { label: 'Use an Existing List…', detail: 'CSV file with a header row', onClick: selectRecipients },
            { label: 'Clear Recipient List', disabled: !has, onClick: () => mergeStore.set({ columns: [], rows: [], preview: false, record: 0, source: '', excluded: [], fieldMap: {} }) },
          ]}
        />
        <RibbonButton
          large
          icon={Contact}
          label="Edit Recipient List"
          disabled={!has}
          title={has ? `${rows.length} of ${data.rows.length} recipients from ${data.source}` : 'Select recipients first'}
          onClick={() => app.openDialog('editRecipients')}
        />
      </RibbonGroup>
      <RibbonGroup label="Write & Insert Fields" priority={3}>
        <RibbonButton large icon={Highlighter} label="Highlight Merge Fields" active={data.highlight} onClick={() => mergeStore.set({ highlight: !data.highlight })} />
        <div className="col">
          <RibbonButton icon={MailOpen} label="Address Block" showLabel disabled={!has} onClick={insertAddressBlock} />
          <RibbonButton icon={MailOpen} label="Greeting Line" showLabel disabled={!has} onClick={greeting} />
          <MenuButton
            icon={MailOpen}
            label="Insert Merge Field"
            showLabel
            disabled={!has}
            items={data.columns.map((c) => ({ label: c, onClick: () => chain().insertMergeField(c).run() }))}
          />
        </div>
        <div className="col">
          <MenuButton
            icon={Shuffle}
            label="Rules"
            showLabel
            disabled={!has}
            items={[
              { label: 'Skip Record If… (exclude matching recipients)', onClick: () => {
                const column = prompt(`Skip recipients whose column (${data.columns.join(', ')}) …`, data.columns[0])
                if (!column || !data.columns.includes(column)) return
                const value = prompt(`… equals:`) ?? ''
                mergeStore.set({ excluded: [...new Set([...data.excluded, ...data.rows.flatMap((r, i) => ((r[column] ?? '') === value ? [i] : []))])] })
              } },
              { label: 'Include All Recipients Again', onClick: () => mergeStore.set({ excluded: [] }) },
            ]}
          />
          <RibbonButton icon={ListChecks} label="Match Fields" showLabel disabled={!has} onClick={() => app.openDialog('matchFields')} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Preview Results" priority={2}>
        <RibbonButton large icon={Eye} label="Preview Results" active={data.preview} disabled={!has} onClick={() => mergeStore.set({ preview: !data.preview })} />
        <div className="col">
          <div className="row">
            <RibbonButton icon={ChevronsLeft} label="First Record" disabled={!data.preview || data.record === 0} onClick={() => go(0)} />
            <RibbonButton icon={ChevronLeft} label="Previous Record" disabled={!data.preview || data.record === 0} onClick={() => go(data.record - 1)} />
            <input
              className="record-input"
              aria-label="Record"
              value={has ? data.record + 1 : ''}
              disabled={!data.preview}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isInteger(n) && n >= 1) go(n - 1)
              }}
            />
            <RibbonButton icon={ChevronRight} label="Next Record" disabled={!data.preview || data.record >= data.rows.length - 1} onClick={() => go(data.record + 1)} />
            <RibbonButton icon={ChevronsRight} label="Last Record" disabled={!data.preview || data.record >= data.rows.length - 1} onClick={() => go(data.rows.length - 1)} />
          </div>
          {has && <span className="record-hint">{rows.length} of {data.rows.length} recipients</span>}
        </div>
        <div className="col">
          <RibbonButton icon={Search} label="Find Recipient" showLabel disabled={!has} onClick={findRecipient} />
          <RibbonButton icon={FileCheck2} label="Check for Errors" showLabel disabled={!has} onClick={checkErrors} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Finish" priority={4}>
        <MenuButton
          large
          icon={FileOutput}
          label="Finish & Merge"
          disabled={!has}
          items={[
            {
              label: 'Edit Individual Documents…',
              detail: 'Replace this document with one copy per recipient (Ctrl+Z restores it)',
              onClick: () => {
                if (!confirm(`Create ${rows.length} merged copies in this document?`)) return
                mergeStore.set({ preview: false })
                editor.chain().focus().setContent(merged(), { emitUpdate: true }).run()
              },
            },
            {
              label: 'Merge to File (.docx)…',
              detail: 'Download the merged letters as one document',
              onClick: async () => {
                const { exportDocx } = await import('../../io/docxExport')
                const blob = await exportDocx({ doc: merged(), setup: app.setup, design: app.design, headerFooter: app.headerFooter, title: app.title })
                downloadBlob(blob, `${safeFilename(app.title)} - merged.docx`)
              },
            },
            {
              label: 'Print Documents…',
              detail: 'Merge into this document and print it (Ctrl+Z restores the original)',
              onClick: () => {
                mergeStore.set({ preview: false })
                editor.chain().focus().setContent(merged(), { emitUpdate: true }).run()
                setTimeout(app.print, 400)
              },
            },
            { label: 'Send E-mail Messages…', detail: 'One message per recipient, ready for your mail program', onClick: () => app.openDialog('emailMerge') },
          ]}
        />
      </RibbonGroup>
    </>
  )
}
