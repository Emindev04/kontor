import { useSyncExternalStore } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Contact, Eye, FileCheck2, FileOutput, Highlighter, ListChecks, Mail, MailOpen, Search, Shuffle, Tags, Users, FilePen } from 'lucide-react'
import { MenuButton, RibbonButton, RibbonGroup } from '../ui'
import { fillInRules, includedRows, loadRecipients, matchedColumn, mergeAll, mergeStore, missingFields, type MergeType } from '../../editor/MailMerge'
import { RULE_KINDS, pendingRule } from '../dialogs/MergeRuleDialog'
import { t, tx } from '../../i18n'
import { pickFile } from '../../editor/commands'
import { downloadBlob, safeFilename } from '../../io/download'
import type { TabProps } from './types'

/** Address Block lines, as Match Fields names. */
const ADDRESS_FIELDS = [['Title', 'First Name', 'Last Name'], ['Company'], ['Address 1'], ['City', 'State', 'Postal Code'], ['Country']]

const MERGE_TYPES: { id: MergeType; label: string }[] = [
  { id: 'letters', label: tx('Letters') },
  { id: 'email', label: tx('E-mail Messages') },
  { id: 'envelopes', label: tx('Envelopes…') },
  { id: 'labels', label: tx('Labels…') },
  { id: 'directory', label: tx('Directory') },
  { id: 'normal', label: tx('Normal Document') },
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
      alert(t('The recipient list could not be read: {error}', { error: (e as Error).message }))
    }
  }

  const insertAddressBlock = () => {
    const lines = ADDRESS_FIELDS.map((group) => group.map((f) => matchedColumn(f)).filter((c): c is string => !!c)).filter((g) => g.length)
    const content = lines.flatMap((group, i) => [
      ...(i > 0 ? [{ type: 'hardBreak' }] : []),
      ...group.flatMap((f, j) => [...(j > 0 ? [{ type: 'text', text: ' ' }] : []), { type: 'mergeField', attrs: { name: f } }]),
    ])
    if (!content.length) return alert(t('The recipient list has no address columns. Use Match Fields to choose them.'))
    chain().insertContent({ type: 'paragraph', content }).run()
  }

  const greeting = () => {
    const name = matchedColumn('First Name') ?? ['Name', 'Last Name'].find((c) => data.columns.includes(c)) ?? data.columns[0]
    chain().insertContent([{ type: 'text', text: t('Dear') + ' ' }, { type: 'mergeField', attrs: { name } }, { type: 'text', text: ',' }]).run()
  }

  const go = (record: number) => mergeStore.set({ record: Math.max(0, Math.min(data.rows.length - 1, record)) })
  const rows = includedRows(data)
  const merged = () => {
    const doc = editor.getJSON()
    // Fill-in rules ask their question once for the whole merge.
    const answers = Object.fromEntries(fillInRules(doc).map((r) => [r.id, prompt(r.prompt || t('Fill-in'), r.value) ?? r.value]))
    return mergeAll(doc, rows, data.type, answers)
  }
  const findRecipient = () => {
    const q = prompt(t('Find recipient: text to look for in the recipient list'))?.trim().toLowerCase()
    if (!q) return
    const start = data.record + 1
    const order = [...data.rows.keys()].map((k) => (k + start) % data.rows.length)
    const hit = order.find((k) => !data.excluded.includes(k) && Object.values(data.rows[k]).some((v) => v.toLowerCase().includes(q)))
    if (hit == null) alert(t('No recipient contains “{text}”.', { text: q }))
    else mergeStore.set({ preview: true, record: hit })
  }
  const checkErrors = () => {
    const missing = missingFields(editor.getJSON())
    alert(missing.length
      ? t('These merge fields have no column in the recipient list:') + '\n\n' + missing.join('\n') + '\n\n' + t('Use Match Fields or edit the list.')
      : data.rows.length ? t('No mail merge errors were found in the {n} recipients.', { n: rows.length }) : t('No mail merge errors were found in the document.'))
  }

  return (
    <>
      <RibbonGroup label={t('Create')} priority={1}>
        <RibbonButton large icon={Mail} label={t('Envelopes')} onClick={() => app.openDialog('envelopes')} />
        <RibbonButton large icon={Tags} label={t('Labels')} onClick={() => app.openDialog('labels')} />
      </RibbonGroup>
      <RibbonGroup label={t('Start Mail Merge')} priority={3}>
        <MenuButton
          large
          icon={FilePen}
          label={t('Start Mail Merge')}
          items={MERGE_TYPES.map((item) => ({
            label: t(item.label),
            active: data.type === item.id,
            onClick: () => {
              mergeStore.set({ type: item.id })
              if (item.id === 'envelopes') app.openDialog('envelopes')
              if (item.id === 'labels') app.openDialog('labels')
              if (item.id === 'normal') mergeStore.set({ preview: false })
            },
          }))}
        />
        <MenuButton
          large
          icon={Users}
          label={t('Select Recipients')}
          items={[
            { label: t('Type a New List…'), onClick: () => app.openDialog('newList') },
            { label: t('Use an Existing List…'), detail: t('CSV file with a header row'), onClick: selectRecipients },
            { label: t('Clear Recipient List'), disabled: !has, onClick: () => mergeStore.set({ columns: [], rows: [], preview: false, record: 0, source: '', excluded: [], fieldMap: {} }) },
          ]}
        />
        <RibbonButton
          large
          icon={Contact}
          label={t('Edit Recipient List')}
          disabled={!has}
          title={has ? t('{n} of {total} recipients from {source}', { n: rows.length, total: data.rows.length, source: data.source }) : t('Select recipients first')}
          onClick={() => app.openDialog('editRecipients')}
        />
      </RibbonGroup>
      <RibbonGroup label={t('Write & Insert Fields')} priority={3}>
        <RibbonButton large icon={Highlighter} label={t('Highlight Merge Fields')} active={data.highlight} onClick={() => mergeStore.set({ highlight: !data.highlight })} />
        <div className="col">
          <RibbonButton icon={MailOpen} label={t('Address Block')} showLabel disabled={!has} onClick={insertAddressBlock} />
          <RibbonButton icon={MailOpen} label={t('Greeting Line')} showLabel disabled={!has} onClick={greeting} />
          <MenuButton
            icon={MailOpen}
            label={t('Insert Merge Field')}
            showLabel
            disabled={!has}
            items={data.columns.map((c) => ({ label: c, onClick: () => chain().insertMergeField(c).run() }))}
          />
        </div>
        <div className="col">
          <MenuButton
            icon={Shuffle}
            label={t('Rules')}
            showLabel
            disabled={!has}
            items={[
              { label: t('Skip Record If… (exclude matching recipients)'), onClick: () => {
                const column = prompt(t('Skip recipients whose column ({columns}) …', { columns: data.columns.join(', ') }), data.columns[0])
                if (!column || !data.columns.includes(column)) return
                const value = prompt(t('… equals:')) ?? ''
                mergeStore.set({ excluded: [...new Set([...data.excluded, ...data.rows.flatMap((r, i) => ((r[column] ?? '') === value ? [i] : []))])] })
              } },
              { label: t('Include All Recipients Again'), onClick: () => mergeStore.set({ excluded: [] }) },
              'separator',
              ...RULE_KINDS.map((k) => ({
                label: t(k.label),
                onClick: () => {
                  pendingRule.kind = k.id
                  app.openDialog('mergeRule')
                },
              })),
            ]}
          />
          <RibbonButton icon={ListChecks} label={t('Match Fields')} showLabel disabled={!has} onClick={() => app.openDialog('matchFields')} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Preview Results')} priority={2}>
        <RibbonButton large icon={Eye} label={t('Preview Results')} active={data.preview} disabled={!has} onClick={() => mergeStore.set({ preview: !data.preview })} />
        <div className="col">
          <div className="row">
            <RibbonButton icon={ChevronsLeft} label={t('First Record')} disabled={!data.preview || data.record === 0} onClick={() => go(0)} />
            <RibbonButton icon={ChevronLeft} label={t('Previous Record')} disabled={!data.preview || data.record === 0} onClick={() => go(data.record - 1)} />
            <input
              className="record-input"
              aria-label={t('Record')}
              value={has ? data.record + 1 : ''}
              disabled={!data.preview}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isInteger(n) && n >= 1) go(n - 1)
              }}
            />
            <RibbonButton icon={ChevronRight} label={t('Next Record')} disabled={!data.preview || data.record >= data.rows.length - 1} onClick={() => go(data.record + 1)} />
            <RibbonButton icon={ChevronsRight} label={t('Last Record')} disabled={!data.preview || data.record >= data.rows.length - 1} onClick={() => go(data.rows.length - 1)} />
          </div>
          {has && <span className="record-hint">{t('{n} of {total} recipients', { n: rows.length, total: data.rows.length })}</span>}
        </div>
        <div className="col">
          <RibbonButton icon={Search} label={t('Find Recipient')} showLabel disabled={!has} onClick={findRecipient} />
          <RibbonButton icon={FileCheck2} label={t('Check for Errors')} showLabel disabled={!has} onClick={checkErrors} />
        </div>
      </RibbonGroup>
      <RibbonGroup label={t('Finish')} priority={4}>
        <MenuButton
          large
          icon={FileOutput}
          label={t('Finish & Merge')}
          disabled={!has}
          items={[
            {
              label: t('Edit Individual Documents…'),
              detail: t('Replace this document with one copy per recipient (Ctrl+Z restores it)'),
              onClick: () => {
                if (!confirm(t('Create {n} merged copies in this document?', { n: rows.length }))) return
                mergeStore.set({ preview: false })
                editor.chain().focus().setContent(merged(), { emitUpdate: true }).run()
              },
            },
            {
              label: t('Merge to File (.docx)…'),
              detail: t('Download the merged letters as one document'),
              onClick: async () => {
                const { exportDocx } = await import('../../io/docxExport')
                const blob = await exportDocx({ doc: merged(), setup: app.setup, design: app.design, headerFooter: app.headerFooter, title: app.title })
                downloadBlob(blob, `${safeFilename(app.title)} - merged.docx`)
              },
            },
            {
              label: t('Print Documents…'),
              detail: t('Merge into this document and print it (Ctrl+Z restores the original)'),
              onClick: () => {
                mergeStore.set({ preview: false })
                editor.chain().focus().setContent(merged(), { emitUpdate: true }).run()
                setTimeout(app.print, 400)
              },
            },
            { label: t('Send E-mail Messages…'), detail: t('One message per recipient, ready for your mail program'), onClick: () => app.openDialog('emailMerge') },
          ]}
        />
      </RibbonGroup>
    </>
  )
}
