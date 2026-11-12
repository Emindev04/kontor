import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { APP_NAME, DEFAULT_DOC_TITLE } from './brand'
import type { Presentation } from './model/types'
import { createPresentation, createTextBox } from './model/factory'
import { mapCells } from './model/table'
import { docFromText, emptyDoc } from './model/richtext'
import { LINE_SHAPES } from './model/shapes'
import { currentIndex, currentSlide, redo, resetDocument, selectedElements, store, undo, useStore } from './store/store'
import * as A from './store/actions'
import * as T from './editor/textCommands'
import { getActiveEditor } from './editor/activeEditor'
import { SlideCanvas } from './editor/SlideCanvas'
import { TitleBar } from './components/TitleBar'
import { Ribbon } from './components/Ribbon'
import { StatusBar } from './components/StatusBar'
import { ThumbnailPane } from './components/ThumbnailPane'
import { QuickAccess } from './components/TitleBar'
import { useOptions } from './io/options'
import { MiniToolbar } from './components/MiniToolbar'
import { KeyTips } from './components/KeyTips'
import { NotesPage, NotesPane, SlideSorter } from './components/Views'
import { CommentsPane, FormatBackgroundPane, FormatShapePane, SelectionPane, deleteComments, navigateComments, requestNewComment } from './components/Panes'
import { HandoutMasterView, MasterPane, NotesMasterView } from './components/MasterViews'
import type { PrintSettings } from './components/Backstage'
import { slideTitleText as slideTitle } from './model/accessibility'
import { pickFile } from './components/ui'
import type { DialogKind, UiApi } from './components/tabs/types'
import { addRecent, clearLocal, downloadBlob, loadLocal, loadRecent, safeFilename, saveLocal } from './io/storage'
import { forgetFile, onSystemOpenFile, openFilePicker, saveFile, type FileType } from './io/fileAccess'

const PPTX: FileType = { description: 'PPTX presentation', extensions: ['pptx'], mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }

type SaveState = 'saved' | 'saving' | 'failed' | 'idle'

function isTextInput(t: EventTarget | null) {
  const el = t as HTMLElement | null
  if (!el) return false
  if (el.closest?.('.ProseMirror')) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

function inEditor(t: EventTarget | null) {
  return !!(t as HTMLElement | null)?.closest?.('.ProseMirror')
}

// Parts that are not needed to show the editor are loaded on first use.
const Dialogs = lazy(() => import('./components/Dialogs').then((m) => ({ default: m.Dialogs })))
const Backstage = lazy(() => import('./components/Backstage').then((m) => ({ default: m.Backstage })))
const SlideShow = lazy(() => import('./components/SlideShow').then((m) => ({ default: m.SlideShow })))
const Preview = lazy(() => import('./components/SlideShow').then((m) => ({ default: m.Preview })))
const PrintRoot = lazy(() => import('./components/PrintRoot').then((m) => ({ default: m.PrintRoot })))
const OutlinePane = lazy(() => import('./components/OutlineView').then((m) => ({ default: m.OutlinePane })))
const AnimationPane = lazy(() => import('./components/tabs/AnimationsTab').then((m) => ({ default: m.AnimationPane })))

export default function App() {
  const opts = useOptions()
  useEffect(() => {
    document.documentElement.dataset.appTheme = opts.officeTheme
  }, [opts.officeTheme])
  const view = useStore((s) => s.view)
  const show = useStore((s) => s.show)
  const pane = useStore((s) => s.pane)
  const showNotes = useStore((s) => s.showNotes)
  const title = useStore((s) => s.title)
  const revision = useStore((s) => s.revision)
  const autoSave = useStore((s) => s.autoSave)
  const hideInk = useStore((s) => s.hideInk)
  const tableGrid = useStore((s) => s.tableGridlines)
  const painter = useStore((s) => s.painter)
  const [backstage, setBackstage] = useState(false)
  const [dialog, setDialog] = useState<{ kind: DialogKind; query?: string } | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [printing, setPrinting] = useState<PrintSettings | null>(null)
  const [preview, setPreview] = useState<{ kind: 'transition' | 'animations'; index: number } | null>(null)
  const [loaded, setLoaded] = useState(false)
  const skipSave = useRef(true)

  // ---------- Load and autosave ----------

  useEffect(() => {
    loadLocal().then((saved) => {
      if (saved?.pres?.slides) resetDocument(saved.pres, saved.title || DEFAULT_DOC_TITLE)
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (!loaded) return
    if (skipSave.current) {
      skipSave.current = false
      return
    }
    if (!autoSave) return
    setSaveState('saving')
    const t = window.setTimeout(() => {
      const s = store.get()
      saveLocal(s.title, s.pres)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('failed'))
    }, 700)
    return () => clearTimeout(t)
  }, [revision, title, autoSave, loaded])

  useEffect(() => {
    document.title = `${title} - ${APP_NAME}`
  }, [title])

  // ---------- File actions ----------

  /** Save writes back into the open .pptx file; with `asNew` (Save As) it asks where to save. */
  const writePptx = useCallback(async (asNew: boolean) => {
    if (store.get().editingId) A.exitEditing()
    const s = store.get()
    const { exportPptx } = await import('./io/pptxExport')
    try {
      const blob = await exportPptx(s.pres, s.title)
      const result = await saveFile(blob, `${safeFilename(s.title)}.pptx`, PPTX, { saveAs: asNew })
      if (result === 'cancelled') return
      addRecent(s.title, s.pres)
      setBackstage(false)
    } catch (err) {
      console.error(err)
      window.alert('Sorry, the presentation could not be saved as .pptx.')
    }
  }, [])
  const save = useCallback(() => writePptx(false), [writePptx])
  const saveAs = useCallback(() => writePptx(true), [writePptx])

  const openPresentationFile = useCallback(async (file: File) => {
    try {
      const { importPptx } = await import('./io/pptxImport')
      const { pres, title } = await importPptx(file)
      resetDocument(pres, title)
      addRecent(title, pres)
      setBackstage(false)
    } catch (err) {
      console.error(err)
      window.alert(`Sorry, ${file.name} could not be opened. ${(err as Error).message ?? ''}`)
    }
  }, [])

  const open = useCallback(async () => {
    const file = await openFilePicker([PPTX], 'pptx')
    if (file) await openPresentationFile(file)
  }, [openPresentationFile])

  // Files handed over by the operating system (desktop app: double-click, Open With).
  useEffect(() => onSystemOpenFile('pptx', (file) => void openPresentationFile(file)), [openPresentationFile])

  const newPresentation = useCallback((pres?: Presentation) => {
    if (!window.confirm('Start a new presentation? The current one is replaced (save it to a file first if you want to keep it).')) return
    forgetFile()
    resetDocument(pres ?? createPresentation(), DEFAULT_DOC_TITLE)
    setBackstage(false)
  }, [])

  const openRecent = useCallback(async (id: string) => {
    const saved = await loadRecent(id).catch(() => null)
    if (!saved) {
      window.alert('This presentation is no longer stored in this browser.')
      return
    }
    forgetFile()
    resetDocument(saved.pres, saved.title)
    addRecent(saved.title, saved.pres)
    setBackstage(false)
  }, [])

  const closeDocument = useCallback(() => {
    if (!window.confirm('Close this presentation? It is removed from this browser.')) return
    clearLocal()
    forgetFile()
    resetDocument(createPresentation(), DEFAULT_DOC_TITLE)
    setBackstage(false)
  }, [])

  const print = useCallback(async (settings: PrintSettings) => {
    if (store.get().editingId) A.exitEditing()
    setBackstage(false)
    // Load the print layout first so the pages are ready when the print dialog opens.
    await import('./components/PrintRoot')
    setPrinting(settings)
  }, [])

  useEffect(() => {
    if (!printing) return
    const done = () => setPrinting(null)
    window.addEventListener('afterprint', done)
    const t = window.setTimeout(() => window.print(), 300)
    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', done)
    }
  }, [printing])

  const exportFile = useCallback(async (kind: 'pdf' | 'png' | 'jpeg', scope: 'current' | 'all') => {
    const s = store.get()
    const io = await import('./io/slideImages')
    const name = safeFilename(s.title)
    if (kind === 'pdf') downloadBlob(await io.slidesPdf(s.pres, 2400, s.title), `${name}.pdf`)
    else if (scope === 'current') downloadBlob(await io.slideImage(s.pres, currentIndex(s), kind), `${name} - Slide ${currentIndex(s) + 1}.${kind === 'png' ? 'png' : 'jpg'}`)
    else downloadBlob(await io.slideImagesZip(s.pres, kind), `${name} - ${kind.toUpperCase()}.zip`)
  }, [])

  const qatHandlers = useMemo(
    () => ({
      onSave: save,
      onNew: () => newPresentation(),
      onOpen: open,
      onPrint: () => print({ range: 'all', layout: 'full', frame: false }),
      onSpelling: () => store.set({ spellcheck: !store.get().spellcheck }),
    }),
    [save, newPresentation, open, print],
  )

  const exportText = useCallback(() => {
    const s = store.get()
    const lines: string[] = []
    s.pres.slides.forEach((sl, i) => {
      lines.push(`Slide ${i + 1}: ${slideTitle(sl)}`)
      for (const e of sl.elements) {
        if (e.type !== 'shape' || !e.text) continue
        if (e.placeholder && ['title', 'ctrTitle', 'sectionTitle', 'captionTitle'].includes(e.placeholder.style)) continue
        for (const p of e.text.doc.content) {
          const t = (p.content ?? []).map((n) => (n.type === 'text' ? n.text : ' ')).join('')
          if (t.trim()) lines.push(`${'  '.repeat((p.attrs?.level ?? 0) + 1)}${t}`)
        }
      }
      if (sl.notes) lines.push(`  Notes: ${sl.notes}`)
      lines.push('')
    })
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/plain' }), `${safeFilename(s.title)}.txt`)
  }, [])

  const insertPicture = useCallback(async () => {
    const files = await pickFile('image/*', true)
    for (const f of files) await A.insertImageFile(f)
  }, [])

  const ui: UiApi = {
    openDialog: (kind) => setDialog({ kind }),
    openPane: (p) => store.set({ pane: p }),
    insertPicture,
    save,
  }

  // ---------- Events from deeper components ----------

  useEffect(() => {
    const onPreview = (e: Event) => setPreview({ kind: (e as CustomEvent<'transition' | 'animations'>).detail, index: currentIndex() })
    const onPasteText = (e: Event) => pasteTextBox((e as CustomEvent<string>).detail)
    const onNewComment = () => requestNewComment()
    const onNav = (e: Event) => navigateComments((e as CustomEvent<number>).detail)
    const onDelete = (e: Event) => deleteComments((e as CustomEvent<'slide' | 'all'>).detail)
    const onDialog = (e: Event) => setDialog({ kind: (e as CustomEvent<DialogKind>).detail })
    window.addEventListener('kontor:dialog', onDialog)
    const onPhInsert = async (e: Event) => {
      const { id, kind } = (e as CustomEvent<{ id: string; kind: string }>).detail
      A.select([id])
      if (kind === 'table') setDialog({ kind: 'insertTable' })
      else if (kind === 'chart') setDialog({ kind: 'insertChart' })
      else if (kind === 'diagram') setDialog({ kind: 'insertDiagram' })
      else if (kind === 'icons') setDialog({ kind: 'icons' })
      else if (kind === 'video') window.dispatchEvent(new CustomEvent('kontor:insert-media', { detail: { kind: 'video', replaceId: id } }))
      else if (kind === 'picture') {
        const [file] = await pickFile('image/*')
        if (file) await A.insertImageFile(file, undefined, id)
      }
    }
    window.addEventListener('kontor:ph-insert', onPhInsert)
    const onInsertMedia = async (e: Event) => {
      const { kind, replaceId } = (e as CustomEvent<{ kind: 'video' | 'audio'; replaceId?: string }>).detail
      const [file] = await pickFile(kind === 'video' ? 'video/*' : 'audio/*')
      if (!file) return
      if (file.size > 60 * 1024 * 1024 && !window.confirm('This file is large and makes the presentation slow to save. Insert it anyway?')) return
      await A.insertMediaFile(file, replaceId)
    }
    window.addEventListener('kontor:insert-media', onInsertMedia)
    window.addEventListener('kontor:preview', onPreview)
    window.addEventListener('kontor:paste-text', onPasteText)
    window.addEventListener('kontor:new-comment', onNewComment)
    window.addEventListener('kontor:comment-nav', onNav)
    window.addEventListener('kontor:delete-comments', onDelete)
    return () => {
      window.removeEventListener('kontor:preview', onPreview)
      window.removeEventListener('kontor:paste-text', onPasteText)
      window.removeEventListener('kontor:new-comment', onNewComment)
      window.removeEventListener('kontor:comment-nav', onNav)
      window.removeEventListener('kontor:delete-comments', onDelete)
      window.removeEventListener('kontor:dialog', onDialog)
      window.removeEventListener('kontor:ph-insert', onPhInsert)
      window.removeEventListener('kontor:insert-media', onInsertMedia)
    }
  }, [])

  // ---------- Clipboard ----------

  useEffect(() => {
    const onCopy = (e: ClipboardEvent, cut: boolean) => {
      if (inEditor(e.target) || isTextInput(e.target) || store.get().show) return
      const s = store.get()
      if (!s.selection.length && s.focus !== 'thumbs') return
      const clip = cut ? (A.cutSelection(), A.getClipboard()) : A.copySelection()
      if (!clip) return
      const text = clip.kind === 'elements' ? clip.els.map((el) => (el.type === 'shape' && el.text ? el.text.doc.content.map((p) => (p.content ?? []).map((n) => (n.type === 'text' ? n.text : '')).join('')).join('\n') : '')).filter(Boolean).join('\n') : ''
      e.clipboardData?.setData('text/plain', text)
      e.clipboardData?.setData('text/html', `<meta name="generator" content="kontor-slides">${text.replace(/</g, '&lt;')}`)
      e.preventDefault()
    }
    const onPaste = (e: ClipboardEvent) => {
      if (inEditor(e.target) || isTextInput(e.target) || store.get().show) return
      const data = e.clipboardData
      if (!data) return
      e.preventDefault()
      const images = Array.from(data.files).filter((f) => f.type.startsWith('image/'))
      if (images.length) {
        images.forEach((f) => A.insertImageFile(f))
        return
      }
      const html = data.getData('text/html')
      if (A.getClipboard() && (html.includes('kontor-slides') || !data.getData('text/plain'))) {
        A.pasteClipboard()
        return
      }
      const text = data.getData('text/plain')
      if (text) pasteTextBox(text)
      else A.pasteClipboard()
    }
    const copy = (e: ClipboardEvent) => onCopy(e, false)
    const cut = (e: ClipboardEvent) => onCopy(e, true)
    document.addEventListener('copy', copy)
    document.addEventListener('cut', cut)
    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('copy', copy)
      document.removeEventListener('cut', cut)
      document.removeEventListener('paste', onPaste)
    }
  }, [])

  // ---------- Keyboard ----------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = store.get()
      if (s.show || backstageRef.current) return
      if (document.querySelector('.modal-backdrop')) return
      const mod = e.ctrlKey || e.metaKey
      const key = e.key
      const lower = key.toLowerCase()
      const editing = inEditor(e.target)

      if (key === 'F7' && e.shiftKey) {
        e.preventDefault()
        setDialog({ kind: 'thesaurus' })
        return
      }
      if (key === 'F5') {
        e.preventDefault()
        if (s.editingId) A.exitEditing()
        store.set({ show: { start: e.shiftKey || e.altKey ? currentIndex() : 0, presenter: e.altKey || !!s.pres.presenterView } })
        return
      }
      if (key === 'F6') {
        // Cycle the keyboard focus between the thumbnails, the slide and the notes, like the original.
        e.preventDefault()
        if (s.editingId) A.exitEditing()
        const order: ('thumbs' | 'canvas' | 'notes')[] = s.showNotes && view === 'normal' ? ['thumbs', 'canvas', 'notes'] : ['thumbs', 'canvas']
        const next = order[(order.indexOf(s.focus) + (e.shiftKey ? order.length - 1 : 1)) % order.length]
        const target = document.querySelector<HTMLElement>(next === 'thumbs' ? '.thumbs' : next === 'notes' ? '.notes-text' : '.canvas-scroll')
        target?.focus()
        store.set({ focus: next })
        return
      }
      if (mod && !e.altKey) {
        const global: Record<string, () => void> = {
          s: () => save(),
          o: () => open(),
          p: () => print({ range: 'all', layout: 'full', frame: false }),
          f: () => setDialog({ kind: 'find' }),
          h: () => setDialog({ kind: 'replace' }),
          k: () => setDialog({ kind: 'link' }),
          m: () => A.newSlide(),
        }
        if (lower === 'n' && !e.shiftKey) {
          e.preventDefault()
          newPresentation()
          return
        }
        if (global[lower] && !e.shiftKey) {
          e.preventDefault()
          global[lower]()
          return
        }
        if (lower === 'f' && e.shiftKey) {
          e.preventDefault()
          setDialog({ kind: 'font' })
          return
        }
      }
      if (isTextInput(e.target)) return

      // Text formatting shortcuts shared by the editor and selected shapes.
      if (mod && !e.altKey) {
        const align: Record<string, 'left' | 'center' | 'right' | 'justify'> = { l: 'left', e: 'center', r: 'right', j: 'justify' }
        if (align[lower] && !e.shiftKey) {
          e.preventDefault()
          T.setPara({ align: align[lower] })
          return
        }
        if (key === '>' || key === ']' || (e.shiftKey && (key === '.' || e.code === 'Period'))) {
          e.preventDefault()
          T.stepFontSize(1)
          return
        }
        if (key === '<' || key === '[' || (e.shiftKey && (key === ',' || e.code === 'Comma'))) {
          e.preventDefault()
          T.stepFontSize(-1)
          return
        }
        if (lower === 't') {
          e.preventDefault()
          setDialog({ kind: 'font' })
          return
        }
      }

      // The editor opens a frame after the click; keys typed in between go into it.
      if (!editing && s.editingId && !mod && !e.altKey) {
        const ed = getActiveEditor()
        if (key.length === 1) {
          e.preventDefault()
          if (ed) ed.chain().focus().insertContent(key).run()
          else A.queueTyped(key)
          return
        }
        if (key === 'Escape') {
          A.exitEditing()
          return
        }
      }

      if (mod && key === 'Enter' && view === 'normal' && (editing || s.editingId || s.selection.length)) {
        e.preventDefault()
        A.nextPlaceholder()
        return
      }

      if (editing) {
        if (key === 'Escape' || key === 'F2') {
          e.preventDefault()
          A.exitEditing()
        }
        return
      }

      if (mod && lower === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && lower === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (mod && ['b', 'i', 'u'].includes(lower) && s.selection.length) {
        e.preventDefault()
        T.toggleMark(lower === 'b' ? 'bold' : lower === 'i' ? 'italic' : 'underline')
        return
      }
      if (mod && lower === 'a') {
        e.preventDefault()
        if (s.focus === 'thumbs' || view === 'sorter') store.set({ selectedSlides: s.pres.slides.map((x) => x.id) })
        else A.selectAll()
        return
      }
      if (mod && lower === 'd') {
        e.preventDefault()
        if (s.selection.length && s.focus !== 'thumbs') A.duplicateSelection()
        else A.duplicateSlides()
        return
      }
      if (mod && lower === 'g') {
        e.preventDefault()
        if (e.shiftKey) A.ungroupSelection()
        else A.groupSelection()
        return
      }
      const tsel = s.tableSel
      if (tsel && !tsel.editing && s.selection.length === 1 && s.selection[0] === tsel.id) {
        if (key === 'Delete' || key === 'Backspace') {
          e.preventDefault()
          A.updateTable((t, rg) => mapCells(t, rg, (c) => ({ ...c, doc: emptyDoc() })))
          return
        }
        if (key === 'Escape') {
          store.set({ tableSel: null })
          return
        }
        if (key === 'Enter' || key === 'F2') {
          e.preventDefault()
          A.enterCellEditing(tsel.id, tsel.anchor.r, tsel.anchor.c, { kind: 'end' })
          return
        }
        if (!mod && !e.altKey && key.length === 1) {
          e.preventDefault()
          A.enterCellEditing(tsel.id, tsel.anchor.r, tsel.anchor.c, { kind: 'type', text: key })
          return
        }
      }
      if (key === 'Delete' || key === 'Backspace') {
        e.preventDefault()
        if (s.selection.length && s.focus !== 'thumbs') A.deleteSelection()
        else if (s.focus === 'thumbs' || view === 'sorter') A.deleteSlides()
        return
      }
      if (key === 'Escape') {
        if (s.tool.kind !== 'select') store.set({ tool: { kind: 'select' } })
        else if (s.painter) store.set({ painter: null })
        else if (s.selection.length) A.clearSelection()
        return
      }
      if (key.startsWith('Arrow')) {
        e.preventDefault()
        if (s.selection.length && s.focus !== 'thumbs') {
          const step = mod ? 1 : e.shiftKey ? 24 : 6
          A.nudge(key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0, key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0)
        } else if (e.shiftKey && (s.focus === 'thumbs' || view === 'sorter') && mod) A.moveSlidesBy(key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1)
        else A.goToIndex(currentIndex() + (key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1))
        return
      }
      if (key === 'PageDown' || key === 'PageUp') {
        e.preventDefault()
        A.goToIndex(currentIndex() + (key === 'PageDown' ? 1 : -1))
        return
      }
      if ((key === 'Home' || key === 'End') && !s.selection.length) {
        e.preventDefault()
        A.goToIndex(key === 'Home' ? 0 : s.pres.slides.length - 1)
        return
      }
      if (key === 'Tab' && view === 'normal') {
        e.preventDefault()
        A.cycleSelection(e.shiftKey ? -1 : 1)
        return
      }
      const one = s.selection.length === 1 ? selectedElements(s)[0] : undefined
      const editable = one?.type === 'shape' && !LINE_SHAPES.has(one.prst) && !one.locked
      if (key === 'Enter') {
        e.preventDefault()
        if (s.focus === 'thumbs' || view === 'sorter' || !one) A.newSlide()
        else if (editable) A.enterEditing(one.id, { kind: 'all' })
        return
      }
      if (key === 'F2' && editable) {
        e.preventDefault()
        A.enterEditing(one.id, { kind: 'end' })
        return
      }
      if (!mod && !e.altKey && key.length === 1 && editable && view === 'normal') {
        e.preventDefault()
        A.enterEditing(one.id, { kind: 'type', text: key })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, open, print, newPresentation, view])

  const backstageRef = useRef(false)
  backstageRef.current = backstage

  const status = saveState === 'saving' ? 'Saving…' : saveState === 'failed' ? 'Not saved' : autoSave ? 'Saved to this browser' : 'AutoSave off'
  const s = store.get()

  return (
    <div className={`app${hideInk ? ' hide-ink' : ''}${painter ? ' is-painting' : ''}${tableGrid ? ' table-grid' : ''}`}>
      <TitleBar status={status} onSave={save} onSearch={(q) => setDialog({ kind: 'find', query: q })} qat={qatHandlers} onMoreQat={() => setDialog({ kind: 'options' })} />
      <Ribbon ui={ui} onFile={() => (A.exitEditing(), setBackstage(true))} />
      {opts.qatBelow && (
        <div className="qat-below">
          <QuickAccess h={qatHandlers} onMore={() => setDialog({ kind: 'options' })} />
        </div>
      )}
      <div className="workspace">
        {view === 'sorter' ? (
          <SlideSorter />
        ) : view === 'notesPage' ? (
          <NotesPage />
        ) : view === 'handoutMaster' ? (
          <HandoutMasterView />
        ) : view === 'notesMaster' ? (
          <NotesMasterView />
        ) : (
          <>
            {view === 'outline' ? (
              <Suspense fallback={<aside className="thumbs" />}>
                <OutlinePane />
              </Suspense>
            ) : view === 'master' ? <MasterPane /> : <ThumbnailPane onFormatBackground={() => store.set({ pane: 'formatBackground' })} onSection={() => setDialog({ kind: 'section' })} />}
            <div className="editor-col">
              <div className="canvas-area">
                {s.pres.slides.length || view === 'master' ? (
                  <SlideCanvas onFormatShape={() => store.set({ pane: 'formatShape' })} onFormatBackground={() => store.set({ pane: 'formatBackground' })} />
                ) : (
                  <button type="button" className="empty-deck" onClick={() => A.newSlide()}>
                    Click to add first slide
                  </button>
                )}
                {preview && (
                  <Suspense fallback={null}>
                    <Preview kind={preview.kind} slideIndex={preview.index} onDone={() => setPreview(null)} />
                  </Suspense>
                )}
              </div>
              {showNotes && view !== 'master' && s.pres.slides.length > 0 && <NotesPane />}
            </div>
          </>
        )}
        {pane === 'formatShape' && <FormatShapePane onClose={() => store.set({ pane: null })} />}
        {pane === 'formatBackground' && <FormatBackgroundPane onClose={() => store.set({ pane: null })} />}
        {pane === 'selection' && <SelectionPane onClose={() => store.set({ pane: null })} />}
        {pane === 'comments' && <CommentsPane onClose={() => store.set({ pane: null })} />}
        {pane === 'animation' && (
          <Suspense fallback={null}>
            <AnimationPane onClose={() => store.set({ pane: null })} />
          </Suspense>
        )}
      </div>
      <StatusBar onZoomDialog={() => setDialog({ kind: 'zoom' })} onAccessibility={() => setDialog({ kind: 'accessibility' })} />
      <Suspense fallback={null}>
        {dialog && <Dialogs kind={dialog.kind} query={dialog.query} onClose={() => setDialog(null)} />}
        {backstage && <Backstage onClose={() => setBackstage(false)} onNew={newPresentation} onOpen={open} onSave={saveAs} onPrint={print} onExportText={exportText} onExportFile={exportFile} onCloseDoc={closeDocument} onOpenRecent={openRecent} onOptions={() => (setBackstage(false), setDialog({ kind: 'options' }))} />}
        {show && <SlideShow />}
        {!dialog && !backstage && !show && <KeyTips />}
        {!show && <MiniToolbar />}
        {printing && <PrintRoot pres={s.pres} settings={printing} currentId={s.slideId} selectedIds={s.selectedSlides} />}
      </Suspense>
    </div>
  )
}

function pasteTextBox(text: string) {
  const s = store.get()
  if (s.editingId) {
    getActiveEditor()?.chain().focus().insertContent(text).run()
    return
  }
  const slide = currentSlide(s)
  const tb = createTextBox({ x: s.pres.size.w * 0.25, y: s.pres.size.h * 0.4, w: s.pres.size.w * 0.5, h: 40 }, slide.elements, true)
  tb.text = { ...tb.text!, doc: docFromText(text.replace(/\r\n?/g, '\n')) }
  A.addElements([tb])
}
