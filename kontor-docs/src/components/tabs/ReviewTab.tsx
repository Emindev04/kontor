import { useEffect, useState } from 'react'
import {
  Accessibility, BookCheck, Calculator, Check, ChevronLeft, ChevronRight, FileDiff, FilePenLine, Languages, ListChecks, Lock,
  MessageSquare, MessageSquarePlus, MessageSquareX, PanelLeft, Volume2, VolumeX, X,
} from 'lucide-react'
import { TextSelection } from '@tiptap/pm/state'
import { MenuButton, RibbonButton, RibbonGroup, SplitButton } from '../ui'
import { changeAt, collectChanges, commentRanges, isTracking, type TrackedChange } from '../../editor/Review'
import type { AppApi, MarkupView, TabProps } from './types'
import { LANGUAGES, languageLabel } from '../languages'

export { LANGUAGES, languageLabel }

export const MARKUP_VIEWS: { id: MarkupView; label: string; detail: string }[] = [
  { id: 'simple', label: 'Simple Markup', detail: 'Show the final text with a red line where changes are' },
  { id: 'all', label: 'All Markup', detail: 'Show insertions, deletions and comments' },
  { id: 'none', label: 'No Markup', detail: 'Show how the document looks with all changes accepted' },
  { id: 'original', label: 'Original', detail: 'Show the document before any changes' },
]

/** Read Aloud with the browser's speech synthesis, from the selection or the cursor onwards. */
function useReadAloud() {
  const [speaking, setSpeaking] = useState(false)
  useEffect(() => () => window.speechSynthesis?.cancel(), [])
  const toggle = (text: string, lang: string) => {
    const synth = window.speechSynthesis
    if (!synth) return alert('Read Aloud is not supported by this browser.')
    if (speaking) {
      synth.cancel()
      setSpeaking(false)
      return
    }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = lang
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    synth.speak(utterance)
    setSpeaking(true)
  }
  return { speaking, toggle }
}

/** Selects a change or comment anchor and scrolls it into view. */
function selectRange(app: AppApi, from: number, to: number) {
  const editor = app.mainEditor
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)).scrollIntoView())
  editor.view.focus()
}

export function goToChange(app: AppApi, direction: 1 | -1) {
  const editor = app.mainEditor
  const changes = collectChanges(editor.state.doc)
  const { from, to } = editor.state.selection
  const next = direction > 0 ? changes.find((c) => c.from >= to && !(c.from === from && c.to === to)) ?? changes.find((c) => c.from > from) : [...changes].reverse().find((c) => c.to <= from)
  if (next) selectRange(app, next.from, next.to)
  return next ?? null
}

export function goToComment(app: AppApi, direction: 1 | -1) {
  const editor = app.mainEditor
  const list = [...commentRanges(editor.state.doc).entries()].filter(([id]) => app.comments[id]).sort((a, b) => a[1].from - b[1].from)
  if (!list.length) return
  const { from } = editor.state.selection
  const index = app.activeComment ? list.findIndex(([id]) => id === app.activeComment) : -1
  let target: (typeof list)[number] | undefined
  if (index >= 0) target = list[(index + direction + list.length) % list.length]
  else target = direction > 0 ? (list.find(([, r]) => r.from > from) ?? list[0]) : ([...list].reverse().find(([, r]) => r.to < from) ?? list[list.length - 1])
  if (!target) return
  selectRange(app, target[1].from, target[1].from)
  app.setShowComments(true)
  app.setActiveComment(target[0])
}

export function ReviewTab({ app }: TabProps) {
  const editor = app.mainEditor
  const read = useReadAloud()
  const readText = () => {
    const { from, to, empty } = editor.state.selection
    const end = editor.state.doc.content.size
    return empty ? editor.state.doc.textBetween(from, end, '\n', ' ') : editor.state.doc.textBetween(from, to, '\n', ' ')
  }
  const tracking = isTracking(editor.state)
  const current = changeAt(editor.state)
  const changes = collectChanges(editor.state.doc)
  const commentCount = [...commentRanges(editor.state.doc).keys()].filter((id) => app.comments[id]).length

  const resolve = (accept: boolean, change: TrackedChange | null, moveNext: boolean) => {
    if (change) editor.chain().focus()[accept ? 'acceptChange' : 'rejectChange'](change).run()
    if (moveNext || !change) goToChange(app, 1)
  }

  const deleteAllComments = (onlyShown: boolean) => {
    const ids = [...commentRanges(editor.state.doc).keys()].filter((id) => app.comments[id] && (!onlyShown || !app.comments[id].resolved))
    ids.forEach((id) => editor.commands.removeComment(id))
    app.setComments((c) => {
      const next = { ...c }
      ids.forEach((id) => delete next[id])
      return next
    })
  }

  return (
    <>
      <RibbonGroup label="Proofing" priority={2}>
        <RibbonButton
          large
          icon={BookCheck}
          label="Spelling & Grammar"
          title="Spelling (F7): misspelled words are underlined by the browser's spell checker"
          active={app.spellcheck}
          onClick={() => app.setSpellcheck(!app.spellcheck)}
        />
        <div className="col">
          <RibbonButton icon={Languages} label="Thesaurus" showLabel title="Thesaurus (Shift+F7)" onClick={() => app.openDialog('thesaurus')} />
          <RibbonButton icon={Calculator} label="Word Count" showLabel onClick={() => app.openDialog('wordCount')} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Speech" priority={0}>
        <RibbonButton large icon={read.speaking ? VolumeX : Volume2} label={read.speaking ? 'Stop Reading' : 'Read Aloud'} active={read.speaking} onClick={() => read.toggle(readText(), app.language)} />
      </RibbonGroup>
      <RibbonGroup label="Accessibility" priority={0}>
        <RibbonButton large icon={Accessibility} label="Check Accessibility" onClick={() => app.openDialog('accessibility')} />
      </RibbonGroup>
      <RibbonGroup label="Language" priority={1}>
        <MenuButton
          large
          wide
          icon={Languages}
          label="Language"
          items={[{ heading: 'Set Proofing Language' }, ...LANGUAGES.map((l) => ({ label: l.label, active: app.language === l.id, onClick: () => app.setLanguage(l.id) }))]}
        />
      </RibbonGroup>
      <RibbonGroup label="Comments" priority={4}>
        <RibbonButton large icon={MessageSquarePlus} label="New Comment" title="New Comment (Ctrl+Alt+M)" onClick={app.newComment} />
        <SplitButton
          large
          icon={MessageSquareX}
          label="Delete"
          disabled={!commentCount}
          onClick={() => {
            const id = app.activeComment
            if (!id) return
            editor.commands.removeComment(id)
            app.setComments((c) => {
              const next = { ...c }
              delete next[id]
              return next
            })
            app.setActiveComment(null)
          }}
          items={[
            { label: 'Delete', disabled: !app.activeComment, onClick: () => app.activeComment && (editor.commands.removeComment(app.activeComment), app.setComments((c) => { const n = { ...c }; delete n[app.activeComment!]; return n })) },
            { label: 'Delete All Resolved Comments', onClick: () => {
              const ids = Object.values(app.comments).filter((t) => t.resolved).map((t) => t.id)
              ids.forEach((id) => editor.commands.removeComment(id))
              app.setComments((c) => { const n = { ...c }; ids.forEach((id) => delete n[id]); return n })
            } },
            { label: 'Delete All Comments Shown', onClick: () => deleteAllComments(true) },
            { label: 'Delete All Comments in Document', onClick: () => deleteAllComments(false) },
          ]}
        />
        <div className="col">
          <RibbonButton icon={ChevronLeft} label="Previous" showLabel title="Previous Comment" disabled={!commentCount} onClick={() => goToComment(app, -1)} />
          <RibbonButton icon={ChevronRight} label="Next" showLabel title="Next Comment" disabled={!commentCount} onClick={() => goToComment(app, 1)} />
        </div>
        <RibbonButton large icon={MessageSquare} label="Show Comments" active={app.showComments} onClick={() => app.setShowComments(!app.showComments)} />
      </RibbonGroup>
      <RibbonGroup label="Tracking" priority={4} onLauncher={() => app.openDialog('trackOptions')} launcherTitle="Track Changes Options">
        <SplitButton
          large
          icon={FilePenLine}
          label="Track Changes"
          title="Track Changes (Ctrl+Shift+E): keep track of all the changes made to this document"
          active={tracking}
          onClick={() => editor.chain().focus().setTrackChanges(!tracking).run()}
          items={[
            { label: 'For Everyone', checked: tracking, onClick: () => editor.chain().focus().setTrackChanges(!tracking).run() },
            { label: 'Change User Name…', onClick: () => app.openDialog('options') },
          ]}
        />
        <div className="col">
          <MenuButton
            icon={ListChecks}
            label={MARKUP_VIEWS.find((m) => m.id === app.markupView)!.label}
            showLabel
            title="Display for Review"
            items={MARKUP_VIEWS.map((m) => ({ label: m.label, detail: m.detail, active: app.markupView === m.id, onClick: () => app.setMarkupView(m.id) }))}
            wide
          />
          <MenuButton
            icon={ListChecks}
            label="Show Markup"
            showLabel
            items={[
              { label: 'Comments', checked: app.showMarkup.comments, onClick: () => app.setShowMarkup({ ...app.showMarkup, comments: !app.showMarkup.comments }) },
              { label: 'Insertions and Deletions', checked: app.showMarkup.insDel, onClick: () => app.setShowMarkup({ ...app.showMarkup, insDel: !app.showMarkup.insDel }) },
              { label: 'Highlight Updates', checked: app.showMarkup.highlight, onClick: () => app.setShowMarkup({ ...app.showMarkup, highlight: !app.showMarkup.highlight }) },
            ]}
          />
          <RibbonButton icon={PanelLeft} label="Reviewing Pane" showLabel active={app.showReviewingPane} onClick={() => app.setShowReviewingPane(!app.showReviewingPane)} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Changes" priority={3}>
        <SplitButton
          large
          icon={Check}
          label="Accept"
          title="Accept and Move to Next"
          disabled={!changes.length}
          onClick={() => resolve(true, current, true)}
          items={[
            { label: 'Accept and Move to Next', onClick: () => resolve(true, current, true) },
            { label: 'Accept This Change', disabled: !current, onClick: () => resolve(true, current, false) },
            { label: 'Accept All Changes Shown', onClick: () => editor.chain().focus().acceptAllChanges().run() },
            { label: 'Accept All Changes', onClick: () => editor.chain().focus().acceptAllChanges().run() },
            { label: 'Accept All Changes and Stop Tracking', onClick: () => editor.chain().focus().acceptAllChanges().setTrackChanges(false).run() },
          ]}
        />
        <SplitButton
          large
          icon={X}
          label="Reject"
          title="Reject and Move to Next"
          disabled={!changes.length}
          onClick={() => resolve(false, current, true)}
          items={[
            { label: 'Reject and Move to Next', onClick: () => resolve(false, current, true) },
            { label: 'Reject Change', disabled: !current, onClick: () => resolve(false, current, false) },
            { label: 'Reject All Changes Shown', onClick: () => editor.chain().focus().rejectAllChanges().run() },
            { label: 'Reject All Changes', onClick: () => editor.chain().focus().rejectAllChanges().run() },
            { label: 'Reject All Changes and Stop Tracking', onClick: () => editor.chain().focus().rejectAllChanges().setTrackChanges(false).run() },
          ]}
        />
        <div className="col">
          <RibbonButton icon={ChevronLeft} label="Previous" showLabel title="Previous Change" disabled={!changes.length} onClick={() => goToChange(app, -1)} />
          <RibbonButton icon={ChevronRight} label="Next" showLabel title="Next Change" disabled={!changes.length} onClick={() => goToChange(app, 1)} />
        </div>
      </RibbonGroup>
      <RibbonGroup label="Compare" priority={1}>
        <MenuButton
          large
          icon={FileDiff}
          label="Compare"
          items={[
            { label: 'Compare…', detail: 'Compare two versions of a document (legal blackline)', onClick: () => app.openDialog('compare') },
            { label: 'Combine…', detail: "Combine revisions from another author's copy into this document", onClick: () => app.openDialog('combine') },
          ]}
        />
      </RibbonGroup>
      <RibbonGroup label="Protect" priority={0}>
        <RibbonButton large icon={Lock} label="Restrict Editing" active={app.restriction !== 'none'} onClick={() => app.openDialog('restrict')} />
      </RibbonGroup>
    </>
  )
}
