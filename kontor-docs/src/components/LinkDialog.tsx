import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Modal } from './ui'
import { t } from '../i18n'

export function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const { from, to, empty } = editor.state.selection
  const existing = (editor.getAttributes('link').href as string | undefined) ?? ''
  const [text, setText] = useState(empty ? '' : editor.state.doc.textBetween(from, to, ' '))
  const [href, setHref] = useState(existing)

  const close = () => {
    onClose()
    editor.commands.focus()
  }

  const apply = () => {
    const url = href.trim()
    if (!url) return close()
    const full = /^(https?:|mailto:|tel:|#)/i.test(url) ? url : `https://${url}`
    if (empty && !existing) {
      editor.chain().focus().insertContent({ type: 'text', text: text || full, marks: [{ type: 'link', attrs: { href: full } }] }).run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: full }).run()
    }
    onClose()
  }

  return (
    <Modal
      title={existing ? t('Edit Link') : t('Insert Link')}
      onClose={close}
      footer={
        <>
          {existing && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                editor.chain().focus().extendMarkRange('link').unsetLink().run()
                onClose()
              }}
            >
              {t('Remove Link')}</button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-primary" onClick={apply}>
            {t('OK')}</button>
          <button type="button" className="btn" onClick={close}>
            {t('Cancel')}</button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          apply()
        }}
      >
        <label>
          {t('Text to display')}<input value={text} disabled={!empty || !!existing} onChange={(e) => setText(e.target.value)} />
        </label>
        <label>
          {t('Address')}<input autoFocus value={href} placeholder="https://" onChange={(e) => setHref(e.target.value)} />
        </label>
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
