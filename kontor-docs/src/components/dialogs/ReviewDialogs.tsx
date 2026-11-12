import { useMemo, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import { matchCase, synonyms } from '../../editor/thesaurus'
import { compareDocuments } from '../../editor/compare'
import { pickFile } from '../../editor/commands'
import { Modal, OkCancel, cls } from '../ui'
import { MARKUP_VIEWS } from '../tabs/ReviewTab'
import type { AppApi, Restriction } from '../tabs/types'
import { t, tx } from '../../i18n'

/** The word at the cursor (or the selected text) and its document range. */
function wordAtSelection(editor: Editor) {
  const { from, to, empty } = editor.state.selection
  if (!empty) return { word: editor.state.doc.textBetween(from, to, ' ').trim(), from, to }
  const $pos = editor.state.doc.resolve(from)
  const text = $pos.parent.textContent
  let s = $pos.parentOffset
  let e = s
  while (s > 0 && /[\p{L}'-]/u.test(text[s - 1])) s--
  while (e < text.length && /[\p{L}'-]/u.test(text[e])) e++
  return { word: text.slice(s, e), from: $pos.start() + s, to: $pos.start() + e }
}

export function ThesaurusDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const initial = useMemo(() => wordAtSelection(editor), [editor])
  const [query, setQuery] = useState(initial.word)
  const [picked, setPicked] = useState<string | null>(null)
  const list = synonyms(query)
  const replace = (word: string) => {
    if (initial.to > initial.from) {
      editor.chain().focus().insertContentAt({ from: initial.from, to: initial.to }, matchCase(initial.word, word)).run()
    } else editor.chain().focus().insertContent(word).run()
    onClose()
  }
  return (
    <Modal
      title={t('Thesaurus')}
      onClose={onClose}
      width={380}
      footer={<OkCancel okLabel={t('Insert')} onOk={() => picked && replace(picked)} onCancel={onClose} extra={<span className="dlg-hint">{t('English (United States)')}</span>} />}
    >
      <div className="dlg-stack">
        <label className="dlg-inline">
          {t('Search for:')}{' '}<input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {list.length ? (
          <div className="thesaurus-list" role="listbox" aria-label={t('Synonyms')}>
            {list.map((w) => (
              <button key={w} type="button" role="option" aria-selected={picked === w} className={cls('menu-item', picked === w && 'is-active')} onClick={() => setPicked(w)} onDoubleClick={() => replace(w)}>
                {w}
              </button>
            ))}
          </div>
        ) : (
          <p className="dlg-hint">{query ? t('No results found for “{query}”. Check the spelling or try another word.', { query }) : t('Type a word to look up.')}</p>
        )}
      </div>
    </Modal>
  )
}

export function TrackOptionsDialog({ app, onClose }: { app: AppApi; onClose: () => void }) {
  const [name, setName] = useState(app.settings.userName)
  const [initials, setInitials] = useState(app.settings.userInitials)
  const [show, setShow] = useState(app.showMarkup)
  const [view, setView] = useState(app.markupView)
  const [pane, setPane] = useState(app.showReviewingPane)
  const apply = () => {
    app.setSettings({ ...app.settings, userName: name.trim() || t('Author'), userInitials: initials.trim() || 'A' })
    app.setShowMarkup(show)
    app.setMarkupView(view)
    app.setShowReviewingPane(pane)
    onClose()
  }
  return (
    <Modal title={t('Track Changes Options')} onClose={onClose} width={420} footer={<OkCancel onOk={apply} onCancel={onClose} />}>
      <div className="dlg-stack">
        <fieldset className="dlg-fieldset">
          <legend>{t('Show')}</legend>
          <label><input type="checkbox" checked={show.comments} onChange={(e) => setShow({ ...show, comments: e.target.checked })} /> {t('Comments')}</label>
          <label><input type="checkbox" checked={show.insDel} onChange={(e) => setShow({ ...show, insDel: e.target.checked })} /> {t('Insertions and Deletions')}</label>
          <label><input type="checkbox" checked={pane} onChange={(e) => setPane(e.target.checked)} /> {t('Reviewing Pane')}</label>
          <label className="dlg-inline">
            {t('Display for review:')}<select value={view} onChange={(e) => setView(e.target.value as typeof view)}>
              {MARKUP_VIEWS.map((m) => (
                <option key={m.id} value={m.id}>
                  {t(m.label)}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        <fieldset className="dlg-fieldset">
          <legend>{t('Personalize your copy')}</legend>
          <label className="dlg-inline">
            {t('User name:')}{' '}<input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="dlg-inline">
            {t('Initials:')}{' '}<input value={initials} maxLength={4} onChange={(e) => setInitials(e.target.value)} />
          </label>
        </fieldset>
      </div>
    </Modal>
  )
}

/** Who last changed a .docx file, from its core properties (for Combine). */
async function fileAuthor(file: File) {
  try {
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    const core = await zip.file('docProps/core.xml')?.async('string')
    const xml = core ? new DOMParser().parseFromString(core, 'application/xml') : null
    const pick = (local: string) => Array.from(xml?.getElementsByTagName('*') ?? []).find((e) => e.localName === local)?.textContent?.trim()
    return pick('lastModifiedBy') || pick('creator') || null
  } catch {
    return null
  }
}

/**
 * Compare shows how the current document differs from an earlier version. Combine merges another
 * author's copy into this document: its differences become tracked changes in that author's name,
 * and the tracked changes it already had are kept.
 */
export function CompareDialog({ app, onClose, combine }: { app: AppApi; onClose: () => void; combine?: boolean }) {
  const [file, setFile] = useState<File | null>(null)
  const [authorName, setAuthorName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async () => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      let other
      if (/\.docx$/i.test(file.name)) {
        const { importDocx } = await import('../../io/docxImport')
        other = (await importDocx(file)).content
      } else {
        const text = await file.text()
        other = { type: 'doc', content: text.split(/\r?\n/).map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })) }
      }
      const editor = app.mainEditor
      // Compare: the file is the original and this document the revision. Combine: the other way round,
      // with the changes credited to the author of the file.
      const { doc, changes } = combine
        ? compareDocuments(editor.getJSON(), other, authorName.trim() || t('Reviewer'))
        : compareDocuments(other, editor.getJSON(), app.user.name)
      editor.chain().setTrackChanges(false).setContent(doc, { emitUpdate: true }).run()
      editor.commands.setTextSelection(TextSelection.atStart(editor.state.doc).from)
      app.setMarkupView('all')
      app.setShowReviewingPane(true)
      onClose()
      if (!changes) alert(t('The documents are identical.'))
    } catch (e) {
      console.error(e)
      setError(t('This file could not be read.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={combine ? t('Combine Documents') : t('Compare Documents')} onClose={onClose} width={480} footer={<OkCancel okLabel={busy ? (combine ? t('Combining…') : t('Comparing…')) : combine ? t('Combine') : t('Compare')} onOk={run} onCancel={onClose} />}>
      <div className="dlg-stack">
        <p className="dlg-hint">
          {combine
            ? t('Combines a copy that someone else revised with this document. Their edits appear as tracked changes in their name, next to the tracked changes the copy already had.')
            : t('Compares an earlier version with the current document. The differences appear as tracked changes that you can accept or reject.')}
        </p>
        {combine && (
          <div className="dlg-inline">
            {t('Original document:')}{' '}<strong>{app.title}</strong> <span className="dlg-hint">{t('(this document)')}</span>
          </div>
        )}
        <div className="dlg-inline">
          {combine ? t('Revised document:') : t('Original document:')}
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const f = await pickFile('.docx,.txt,text/plain')
              if (!f) return
              setFile(f)
              if (combine) setAuthorName((await fileAuthor(f)) ?? '')
            }}
          >
            {t('Browse…')}</button>
          <span className="dlg-hint">{file ? file.name : t('No file chosen')}</span>
        </div>
        {combine ? (
          <label className="dlg-inline">
            {t('Label unmarked changes with:')}<input value={authorName} placeholder={t('Reviewer')} onChange={(e) => setAuthorName(e.target.value)} />
          </label>
        ) : (
          <div className="dlg-inline">
            {t('Revised document:')}{' '}<strong>{app.title}</strong> <span className="dlg-hint">{t('(this document)')}</span>
          </div>
        )}
        {error && <p className="dlg-error">{error}</p>}
      </div>
    </Modal>
  )
}

export async function hashPassword(password: string) {
  const data = new TextEncoder().encode(`kontor:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

const RESTRICTIONS: { id: Restriction; label: string; detail: string }[] = [
  { id: 'readOnly', label: tx('No changes (Read only)'), detail: tx('Nobody can change the document') },
  { id: 'comments', label: tx('Comments'), detail: tx('Only comments can be added') },
  { id: 'tracked', label: tx('Tracked changes'), detail: tx('All changes are tracked and cannot be turned off') },
]

export function RestrictDialog({ app, onClose }: { app: AppApi; onClose: () => void }) {
  const active = app.restriction !== 'none'
  const [kind, setKind] = useState<Restriction>(active ? app.restriction : 'readOnly')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const start = async () => {
    if (password !== confirm) return setError(t('The passwords do not match.'))
    app.setRestriction(kind, password ? await hashPassword(password) : null)
    onClose()
  }
  const stop = async () => {
    if (app.restrictionHash && (await hashPassword(password)) !== app.restrictionHash) return setError(t('The password is incorrect.'))
    app.setRestriction('none', null)
    onClose()
  }
  return (
    <Modal
      title={t('Restrict Editing')}
      onClose={onClose}
      width={420}
      footer={<OkCancel okLabel={active ? t('Stop Protection') : t('Yes, Start Enforcing Protection')} onOk={active ? stop : start} onCancel={onClose} />}
    >
      <div className="dlg-stack">
        {active ? (
          <>
            <p>{t('This document is protected:')}{' '}<strong>{t(RESTRICTIONS.find((r) => r.id === app.restriction)?.label ?? '')}</strong>.</p>
            {app.restrictionHash && (
              <label className="dlg-inline">
                {t('Password:')}{' '}<input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
            )}
          </>
        ) : (
          <>
            <fieldset className="dlg-fieldset">
              <legend>{t('Editing restrictions')}</legend>
              {RESTRICTIONS.map((r) => (
                <label key={r.id}>
                  <input type="radio" checked={kind === r.id} onChange={() => setKind(r.id)} /> {t(r.label)} <small className="dlg-hint">– {t(r.detail)}</small>
                </label>
              ))}
            </fieldset>
            <fieldset className="dlg-fieldset">
              <legend>{t('Password (optional)')}</legend>
              <label className="dlg-inline">
                {t('Enter new password:')}{' '}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              <label className="dlg-inline">
                {t('Reenter password to confirm:')}{' '}<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </label>
            </fieldset>
          </>
        )}
        {error && <p className="dlg-error">{error}</p>}
      </div>
    </Modal>
  )
}

/** Review › Track Changes › Lock Tracking: keeps Track Changes on until it is unlocked (optionally with a password). */
export function LockTrackingDialog({ app, onClose }: { app: AppApi; onClose: () => void }) {
  const locked = app.trackLock != null
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [error, setError] = useState('')
  const apply = async () => {
    if (locked) {
      if (app.trackLock && (await hashPassword(password)) !== app.trackLock) return setError(t('The password is incorrect.'))
      app.setTrackLock(null)
    } else {
      if (password !== again) return setError(t('The passwords do not match.'))
      app.setTrackLock(password ? await hashPassword(password) : '')
      app.mainEditor.commands.setTrackChanges(true)
    }
    onClose()
  }
  return (
    <Modal title={locked ? t('Unlock Tracking') : t('Lock Tracking')} onClose={onClose} width={400} footer={<OkCancel onOk={() => void apply()} onCancel={onClose} extra={error && <span className="dlg-error">{error}</span>} />}>
      <p className="dlg-hint">{locked ? t('Enter the password to turn off the lock.') : t('Prevent other authors from turning off Track Changes.')}</p>
      {(!locked || app.trackLock) && (
        <label className="dlg-inline">
          {t('Enter password (optional):')}
          <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
      )}
      {!locked && (
        <label className="dlg-inline">
          {t('Reenter to confirm:')}
          <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} />
        </label>
      )}
    </Modal>
  )
}
