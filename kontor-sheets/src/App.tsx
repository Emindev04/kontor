import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MAX_COLS, MAX_ROWS, cellKey, type Range } from './model/address'
import { formatValue } from './model/numfmt'
import { jsDateToSerial } from './model/dates'
import { Workbook } from './model/workbook'
import { Doc, PENDING } from './commands/doc'
import { DEFAULT_PASTE, copy as copyCells, pasteExternal, pasteInternal } from './commands/clipboard'
import { fillDirection } from './commands/fill'
import { addSheet, autofitColumns, autofitRows, deleteCells, freezePanes, insertDelete, selectedIndexes, setHidden } from './commands/ops'
import { quickSort } from './commands/sort'
import { exportCsv, exportHtml, importCsv } from './io/csv'
import { downloadBlob, pickFile, safeFilename } from './io/download'
import { forgetFile, loadAutosaveAsync, loadAutosaveSync, onSystemOpenFile, openFilePicker, saveFile, storeAutosave, type FileType } from './io/fileAccess'
import { fromJSON, toJSON, type JWorkbook } from './io/json'
import { loadRecent, noteRecent } from './io/recent'
import { TEMPLATES } from './templates'
import { DEFAULT_DOC_TITLE } from './brand'
import { AppContext, type AppApi, type DialogSpec, type PaneKind, type ViewMode } from './components/appContext'
import { activeContext, addObject, arrangeObject, deleteObject, duplicateObject, newPicture, selectedObject, tableAt } from './commands/objects'
import { toggleAutoFilter } from './commands/filter'
import { refreshAllPivots } from './commands/pivot'
import { flashFill } from './commands/flashFill'
import { group, ungroup } from './commands/outline'
import { isFullCols, isFullRows } from './model/address'
import { objectContextItems, cellExtraItems } from './components/contextItems'
import { FilterMenu, type FilterMenuState } from './components/FilterMenu'
import { TitleBar } from './components/TitleBar'
import { Ribbon, type TabId } from './components/Ribbon'
import { FormulaBar } from './components/FormulaBar'
import { SheetTabs } from './components/SheetTabs'
import { StatusBar } from './components/StatusBar'
import { ContextMenu } from './components/ContextMenu'
import { KeyTips } from './components/KeyTips'
import { GridView, type ContextKind } from './grid/GridView'
import { MiniToolbar } from './components/MiniToolbar'
import { autoSum, deleteSmart, insertSmart, setFormat, toggleStyle, toggleUnderline } from './components/tabs/actions'
import { noteFunction } from './components/tabs/recent'
import type { MenuItem } from './components/ui'

// Loaded on first use to keep the start-up bundle small.
const SidePane = lazy(() => import('./components/panes/SidePanes').then((m) => ({ default: m.SidePane })))
const Backstage = lazy(() => import('./components/Backstage').then((m) => ({ default: m.Backstage })))
const DialogHost = lazy(() => import('./components/dialogs/DialogHost').then((m) => ({ default: m.DialogHost })))

const STORAGE_KEY = 'kontor-sheets:workbook'

const XLSX: FileType = { description: 'XLSX workbook', extensions: ['xlsx'], mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
const OPEN_TYPES: FileType[] = [
  { ...XLSX, extensions: ['xlsx', 'xlsm'] },
  { description: 'OpenDocument spreadsheet', extensions: ['ods'], mime: 'application/vnd.oasis.opendocument.spreadsheet' },
  { description: 'Comma or tab separated text', extensions: ['csv', 'tsv', 'txt'], mime: 'text/plain' },
]
const SAVE_TYPES = {
  xlsx: XLSX,
  csv: { description: 'CSV (comma separated)', extensions: ['csv'], mime: 'text/csv' },
  txt: { description: 'Text (tab separated)', extensions: ['txt'], mime: 'text/plain' },
  html: { description: 'Web page', extensions: ['html'], mime: 'text/html' },
  ods: { description: 'OpenDocument spreadsheet', extensions: ['ods'], mime: 'application/vnd.oasis.opendocument.spreadsheet' },
} satisfies Record<string, FileType>

function docFromStored(raw: string | null | undefined): Doc | null {
  try {
    if (raw) {
      const data = JSON.parse(raw) as { title: string; book: JWorkbook }
      const doc = new Doc(fromJSON(data.book))
      doc.title = data.title || DEFAULT_DOC_TITLE
      doc.activeIndex = Math.min(Math.max(0, data.book.active ?? 0), doc.wb.sheets.length - 1)
      doc.recomputeAllAutoHeights()
      return doc
    }
  } catch {
    // ignore broken or unavailable storage
  }
  return null
}

function loadSaved(): Doc {
  return docFromStored(loadAutosaveSync(STORAGE_KEY)) ?? new Doc()
}

export function App() {
  const docRef = useRef<Doc | null>(null)
  if (!docRef.current) docRef.current = loadSaved()
  const doc = docRef.current
  if (import.meta.env.DEV) (window as unknown as { __doc: Doc }).__doc = doc
  const [tab, setTab] = useState<TabId>('home')
  const [backstage, setBackstage] = useState(false)
  const [dialog, setDialog] = useState<DialogSpec | null>(null)
  const [ctx, setCtx] = useState<{ x: number; y: number; kind: ContextKind } | null>(null)
  const [autoSave, setAutoSave] = useState(true)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'failed' | 'off'>('saved')
  const [painter, setPainter] = useState<{ active: boolean; sticky: boolean; styles: (number | undefined)[][] | null }>({ active: false, sticky: false, styles: null })
  const [showFormulaBar, setShowFormulaBar] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('normal')
  const [collapsed, setCollapsed] = useState(false)
  const [pane, setPane] = useState<PaneKind | null>(null)
  const [watches, setWatches] = useState<{ sheetId: number; r: number; c: number }[]>([])
  const [split, setSplit] = useState<{ r: number; c: number } | null>(null)
  const [filterMenu, setFilterMenu] = useState<FilterMenuState | null>(null)
  const [, force] = useState(0)

  useEffect(() => {
    const off = doc.subscribe(() => force((n) => n + 1))
    return () => {
      off()
    }
  }, [doc])

  // ---------- autosave ----------
  const lastSaved = useRef(-1)
  useEffect(() => {
    if (!autoSave) {
      setSaveState('off')
      return
    }
    if (lastSaved.current === -1) {
      lastSaved.current = doc.version
      return
    }
    setSaveState('saving')
    const id = setTimeout(() => {
      let json: string
      try {
        json = JSON.stringify({ title: doc.title, book: toJSON(doc.wb, doc.activeIndex) })
      } catch {
        setSaveState('failed')
        return
      }
      storeAutosave(STORAGE_KEY, json)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('failed'))
    }, 700)
    return () => clearTimeout(id)
  }, [doc, doc.version, autoSave])

  // ---------- helpers ----------
  const focusGrid = useCallback(() => {
    requestAnimationFrame(() => (window as unknown as { __focusGrid?: () => void }).__focusGrid?.())
  }, [])
  const alert = useCallback((message: string, title?: string) => {
    if (message !== PENDING) setDialog({ kind: 'message', message, title })
  }, [])
  const confirm = useCallback((message: string, onYes: () => void, title?: string) => setDialog({ kind: 'confirm', message, onYes, title }), [])
  doc.onReport = alert
  doc.onAsk = (message, title, onYes) => setDialog({ kind: 'confirm', message, title, onYes })

  /** Save writes back into the open .xlsx file; with `asNew` (Save As) it asks where to save. */
  const writeXlsx = useCallback(async (asNew: boolean) => {
    if (doc.edit) {
      const err = doc.commitEdit()
      if (err) return alert(err)
    }
    try {
      const { exportXlsx } = await import('./io/xlsx')
      const blob = await exportXlsx(doc.wb, doc.engine)
      const result = await saveFile(blob, `${safeFilename(doc.title)}.xlsx`, SAVE_TYPES.xlsx, { saveAs: asNew })
      if (result === 'cancelled') return
      void noteRecent(doc.title, toJSON(doc.wb, doc.activeIndex))
      doc.modified = false
      doc.status = result === 'saved' ? 'Saved' : 'Downloaded as .xlsx'
      doc.emit()
      setTimeout(() => {
        doc.status = ''
        doc.emit()
      }, 2500)
    } catch (e) {
      alert(`The workbook could not be saved: ${(e as Error).message}`)
    }
  }, [doc, alert])
  const save = useCallback(() => writeXlsx(false), [writeXlsx])

  const saveAs = useCallback(
    async (format: 'xlsx' | 'csv' | 'ods' | 'txt' | 'html') => {
      if (format === 'xlsx') return writeXlsx(true)
      const name = safeFilename(doc.title)
      try {
        const blob =
          format === 'csv' ? exportCsv(doc) : format === 'txt' ? exportCsv(doc, '\t') : format === 'html' ? exportHtml(doc) : await (await import('./io/ods')).exportOds(doc.wb, doc.engine)
        const type = SAVE_TYPES[format]
        await saveFile(blob, `${name}.${type.extensions[0]}`, type, { saveAs: true, remember: false })
      } catch (e) {
        alert(`The workbook could not be saved: ${(e as Error).message}`)
      }
    },
    [doc, writeXlsx, alert],
  )

  const loadBook = useCallback(
    (wb: Workbook, title: string) => {
      doc.load(wb, title)
      if (title !== DEFAULT_DOC_TITLE) void noteRecent(title, toJSON(wb, 0))
      setBackstage(false)
      focusGrid()
    },
    [doc, focusGrid],
  )

  const openWorkbookFile = useCallback(async (file: File) => {
    try {
      const name = file.name.replace(/\.[^.]+$/, '')
      if (/\.(csv|txt|tsv)$/i.test(file.name)) loadBook(importCsv(await file.text(), file.name, /\.tsv$/i.test(file.name) ? '\t' : undefined), name)
      else if (/\.ods$/i.test(file.name)) {
        const { importOds } = await import('./io/ods')
        loadBook(await importOds(await file.arrayBuffer()), name)
      } else {
        const { importXlsx } = await import('./io/xlsx')
        loadBook(await importXlsx(await file.arrayBuffer()), name)
      }
    } catch (e) {
      alert(`This file could not be opened: ${(e as Error).message}`)
    }
  }, [loadBook, alert])

  const openFile = useCallback(async () => {
    const file = await openFilePicker(OPEN_TYPES, 'xlsx')
    if (file) await openWorkbookFile(file)
  }, [openWorkbookFile])

  // Files handed over by the operating system (desktop app: double-click, Open With).
  const openWorkbookFileRef = useRef(openWorkbookFile)
  openWorkbookFileRef.current = openWorkbookFile
  useEffect(() => onSystemOpenFile('xlsx', (file) => void openWorkbookFileRef.current(file)), [])

  // AutoSave data that did not fit into localStorage lives in IndexedDB and is restored here.
  useEffect(() => {
    if (loadAutosaveSync(STORAGE_KEY) !== undefined) return
    void loadAutosaveAsync(STORAGE_KEY).then((raw) => {
      const restored = docFromStored(raw)
      if (restored) {
        doc.load(restored.wb, restored.title)
        focusGrid()
      }
    })
  }, [doc, focusGrid])

  const newBook = useCallback(() => {
    const run = () => {
      forgetFile()
      loadBook(new Workbook(), DEFAULT_DOC_TITLE)
    }
    if (doc.modified) confirm('Start a new workbook? Changes that were not saved as a file stay only until AutoSave stores the new workbook.', run, 'New Workbook')
    else run()
  }, [doc, loadBook, confirm])

  const print = useCallback(() => {
    if (doc.edit) doc.commitEdit()
    void import('./io/print').then((m) => m.printDoc(doc, 'active'))
  }, [doc])

  const copy = useCallback(
    (cut: boolean) => {
      if (doc.edit) return
      focusGrid()
      setTimeout(() => {
        // runs the native copy so other programs receive text and HTML
        if (!document.execCommand(cut ? 'cut' : 'copy')) {
          const res = copyCells(doc, cut)
          if (typeof res === 'string') alert(res)
          else navigator.clipboard?.writeText(res.text).catch(() => {})
        }
      }, 0)
    },
    [doc, focusGrid, alert],
  )

  const paste = useCallback(
    async (special = false) => {
      if (special) return setDialog({ kind: 'pasteSpecial' })
      if (doc.clip) {
        const err = pasteInternal(doc, DEFAULT_PASTE)
        if (err) alert(err)
        return
      }
      try {
        const text = await navigator.clipboard.readText()
        if (text) pasteExternal(doc, text, '')
      } catch {
        alert('Your browser blocked access to the clipboard. Use Ctrl+V (Cmd+V on a Mac) to paste.')
      }
    },
    [doc, alert],
  )

  const startPainter = useCallback(
    (sticky: boolean) => {
      if (painter.active) return setPainter({ active: false, sticky: false, styles: null })
      const rg = doc.boundToUsed(doc.activeRange)
      const styles: (number | undefined)[][] = []
      for (let r = rg.r1; r <= rg.r2 && r - rg.r1 < 200; r++) {
        const row: (number | undefined)[] = []
        for (let c = rg.c1; c <= rg.c2 && c - rg.c1 < 200; c++) row.push(doc.sheet.styleId(r, c) || undefined)
        styles.push(row)
      }
      setPainter({ active: true, sticky, styles })
      focusGrid()
    },
    [doc, painter.active, focusGrid],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && doc.borderPen) {
        doc.borderPen = null
        doc.emit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doc])

  const applyPainter = useCallback(() => {
    if (doc.borderPen) return void doc.applyBorders(doc.borderPen.mode as never, doc.borderPen.style)
    if (!painter.active || !painter.styles) return
    const styles = painter.styles
    const rg: Range = doc.activeRange
    const h = styles.length
    const w = styles[0].length
    const sheet = doc.sheet
    const b = doc.boundToUsed(rg)
    const r2 = rg.r1 === rg.r2 && rg.c1 === rg.c2 ? rg.r1 + h - 1 : b.r2
    const c2 = rg.r1 === rg.r2 && rg.c1 === rg.c2 ? rg.c1 + w - 1 : b.c2
    doc.transact('Format Painter', () => {
      for (let r = rg.r1; r <= r2; r++)
        for (let c = rg.c1; c <= c2; c++) {
          const s = styles[(r - rg.r1) % h][(c - rg.c1) % w]
          const old = sheet.get(r, c)
          if (!old && !s) continue
          doc.write(sheet, r, c, { ...(old ?? {}), s })
        }
    })
    if (!painter.sticky) setPainter({ active: false, sticky: false, styles: null })
  }, [doc, painter])

  const insertFunction = useCallback(
    (name: string) => {
      noteFunction(name)
      // Function Arguments dialog, like the original after choosing a function
      setDialog({ kind: 'functionArgs', fn: name })
    },
    [],
  )

  const runAutoSum = useCallback(
    (fn: string) => {
      if (doc.edit) {
        const err = doc.commitEdit()
        if (err) return alert(err)
      }
      noteFunction(fn)
      if (autoSum(doc, fn) === 'done') focusGrid()
    },
    [doc, alert, focusGrid],
  )

  const insertPicture = useCallback(async () => {
    const file = await pickFile('image/*')
    if (!file) return
    const url = await new Promise<string>((res, rej) => {
      const fr = new FileReader()
      fr.onload = () => res(String(fr.result))
      fr.onerror = () => rej(fr.error)
      fr.readAsDataURL(file)
    })
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 480 / img.naturalWidth, 360 / img.naturalHeight)
      const id = doc.wb.addImage(url)
      addObject(doc, newPicture(doc, id, Math.round(img.naturalWidth * scale), Math.round(img.naturalHeight * scale), file.name.replace(/\.[^.]+$/, '') ? 'Picture' : 'Picture'), 'Insert Picture')
      setTab('shapeFormat')
    }
    img.onerror = () => alert('This picture could not be read.')
    img.src = url
  }, [doc, alert])

  const setFullScreen = useCallback((on: boolean) => {
    if (on) document.documentElement.requestFullscreen?.().catch(() => {})
    else document.exitFullscreen?.().catch(() => {})
  }, [])

  const api: AppApi = useMemo(
    () => ({
      doc,
      dialog: setDialog,
      alert,
      confirm,
      save,
      saveAs,
      openRecent: async (id: string, name: string) => {
        const book = await loadRecent(id)
        if (!book) return alert(`"${name}" is no longer stored in this browser. Open it from your device.`)
        forgetFile()
        loadBook(fromJSON(book), name)
      },
      open: openFile,
      newBook,
      print,
      copy,
      paste,
      focusGrid,
      painter,
      startPainter,
      showFormulaBar,
      setShowFormulaBar,
      viewMode,
      setViewMode: (m: ViewMode) => {
        if (m === 'pageLayout' && (doc.sheet.freeze.rows || doc.sheet.freeze.cols)) freezePanes(doc, 0, 0)
        setViewMode(m)
      },
      insertFunction,
      autoSum: runAutoSum,
      openFile,
      setFullScreen,
      pane,
      setPane,
      watches,
      setWatches,
      insertPicture,
      setTab: (t: string) => setTab(t as TabId),
      split,
      setSplit: (sp: { r: number; c: number } | null) => {
        if (sp && (doc.sheet.freeze.rows || doc.sheet.freeze.cols)) freezePanes(doc, 0, 0)
        setSplit(sp)
      },
    }),
    [doc, alert, confirm, save, saveAs, openFile, newBook, print, copy, paste, focusGrid, painter, startPainter, showFormulaBar, viewMode, insertFunction, runAutoSum, setFullScreen, pane, watches, insertPicture, split],
  )

  // contextual tabs: leave a contextual tab when its context goes away
  const ctxKind = activeContext(doc)
  useEffect(() => {
    const contextual: Record<string, string> = { tableDesign: 'table', chartDesign: 'chart', chartFormat: 'chart', shapeFormat: 'shape', slicer: 'slicer', pivotAnalyze: 'pivot', pivotDesign: 'pivot' }
    if (contextual[tab] && contextual[tab] !== ctxKind) setTab('home')
  }, [ctxKind, tab])
  useEffect(() => {
    if ((pane === 'format' && !selectedObject(doc)) || (pane === 'pivot' && ctxKind !== 'pivot')) setPane(null)
  }, [ctxKind, pane, doc, doc.version])

  // ---------- keyboard shortcuts ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || backstage) return
      const ctrl = e.ctrlKey || e.metaKey
      const k = e.key
      const editing = !!doc.edit
      const inInput = (e.target as HTMLElement).closest?.('input, select, .modal') && !(e.target as HTMLElement).classList.contains('grid-sink')
      const act = (fn: () => void) => {
        e.preventDefault()
        fn()
      }
      if (ctrl && !e.altKey) {
        const lower = k.toLowerCase()
        if (lower === 's') return act(() => (e.shiftKey ? setBackstage(true) : save()))
        if (lower === 'o') return act(openFile)
        if (lower === 'n') return act(newBook)
        if (lower === 'p') return act(print)
        if (k === 'F1') return act(() => setCollapsed((c) => !c))
        if (editing || inInput) return
        if (lower === 'z') return act(() => doc.undo())
        if (lower === 'y') return act(() => doc.redo())
        if (lower === 'b' || (k === '2' && !e.shiftKey)) return act(() => toggleStyle(doc, 'bold'))
        if (lower === 'i' || (k === '3' && !e.shiftKey)) return act(() => toggleStyle(doc, 'italic'))
        if (lower === 'u' && !e.shiftKey) return act(() => toggleUnderline(doc))
        if (k === '5') return act(() => toggleStyle(doc, 'strike'))
        if (k === '1') return act(() => setDialog({ kind: 'formatCells' }))
        if (k === '$') return act(() => setFormat(doc, '"$"#,##0.00_);("$"#,##0.00)'))
        if (k === '%') return act(() => setFormat(doc, '0%'))
        if (k === '#') return act(() => setFormat(doc, 'd-mmm-yy'))
        if (k === '@') return act(() => setFormat(doc, 'h:mm AM/PM'))
        if (k === '!') return act(() => setFormat(doc, '#,##0.00'))
        if (k === '~') return act(() => setFormat(doc, 'General'))
        if (k === '^') return act(() => setFormat(doc, '0.00E+00'))
        if (k === '&') return act(() => doc.applyBorders('outside'))
        if (k === '_') return act(() => doc.applyBorders('none'))
        if (k === ';' && !e.shiftKey) return act(() => doc.beginEdit('enter', formatValue(Math.floor(jsDateToSerial(new Date())), 'm/d/yyyy').text))
        if (k === ':' || (k === ';' && e.shiftKey)) return act(() => doc.beginEdit('enter', new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })))
        if (k === "'" || k === '"') {
          return act(() => {
            const a = doc.sel.active
            if (a.r === 0) return
            const above = doc.inputText(a.r - 1, a.c)
            doc.beginEdit('enter', above)
          })
        }
        if (k === '`') return act(() => { doc.sheet.showFormulas = !doc.sheet.showFormulas; doc.emit() })
        if (k === '+' || (k === '=' && e.shiftKey)) return act(() => insertSmart(doc, () => setDialog({ kind: 'insertCells' })))
        if (k === '-') return act(() => deleteSmart(doc, () => setDialog({ kind: 'deleteCells' })))
        if (k === '9' && !e.shiftKey) return act(() => setHidden(doc, 'row', selectedIndexes(doc, 'row'), true))
        if (k === '0' && !e.shiftKey) return act(() => setHidden(doc, 'col', selectedIndexes(doc, 'col'), true))
        if (k === '(') return act(() => setHidden(doc, 'row', expandHidden(doc, 'row'), false))
        if (k === ')') return act(() => setHidden(doc, 'col', expandHidden(doc, 'col'), false))
        if (lower === 'd') return act(() => fillDirection(doc, 'down'))
        if (lower === 'r') return act(() => fillDirection(doc, 'right'))
        if (lower === 'f') return act(() => setDialog({ kind: 'find' }))
        if (lower === 'h') return act(() => setDialog({ kind: 'replace' }))
        if (lower === 'g') return act(() => setDialog({ kind: 'goto' }))
        if (lower === 'k') return act(() => setDialog({ kind: 'hyperlink' }))
        if (lower === 'e' && !e.shiftKey) return act(() => { const r = flashFill(doc); if (typeof r === 'string') alert(r, 'Flash Fill') })
        if ((lower === 't' || lower === 'l') && !e.shiftKey) return act(() => (tableAt(doc.sheet, doc.sel.active.r, doc.sel.active.c) ? undefined : setDialog({ kind: 'createTable' })))
        if (lower === 'l' && e.shiftKey) return act(() => { const err = toggleAutoFilter(doc); if (err) alert(err) })
        if (k === 'F3') return act(() => setDialog({ kind: e.shiftKey ? 'createNames' : 'nameManager' }))
        if (e.shiftKey && lower === 'u') return act(() => document.querySelector<HTMLButtonElement>('.fx-expand')?.click())
        if (e.shiftKey && (lower === 'f' || lower === 'p')) return act(() => setDialog({ kind: 'formatCells', tab: 'font' }))
      }
      if (ctrl && e.altKey && k.toLowerCase() === 'v' && !editing) return act(() => setDialog({ kind: 'pasteSpecial' }))
      if (ctrl && e.altKey && k === 'F5') return act(() => refreshAllPivots(doc))
      if (e.altKey && k === 'F1' && !editing) return act(() => setDialog({ kind: 'insertChart', data: 'quick' }))
      if (e.altKey && e.shiftKey && k === 'ArrowRight' && !editing && !inInput) return act(() => groupShortcut(true))
      if (e.altKey && e.shiftKey && k === 'ArrowLeft' && !editing && !inInput) return act(() => groupShortcut(false))
      if (ctrl && e.altKey && k.toLowerCase() === 'm' && !editing) return act(() => setPane('comments'))
      if (e.altKey && k === 'F5' && !ctrl && !editing) return act(() => refreshAllPivots(doc))
      if (e.shiftKey && k === 'F2' && !editing && !inInput) return act(() => setDialog({ kind: 'prompt', title: 'note' }))
      if (e.altKey && (k === '=' || k === '≠') && !editing) return act(() => runAutoSum('SUM'))
      if (editing || inInput) return
      if (k === 'F5') return act(() => setDialog({ kind: 'goto' }))
      if (k === 'F12') return act(() => setBackstage(true))
      if (k === 'F7') return act(() => setDialog({ kind: 'spelling' }))
      if (k === 'F9') return act(() => { doc.engine.recalcAll(); doc.emit() })
      if (k === 'F4') return act(() => doc.lastCommand?.())
      if (k === 'F3' && e.shiftKey) return act(() => setDialog({ kind: 'insertFunction' }))
      if (k === 'F11' && e.shiftKey) return act(() => addSheet(doc))
      if (k === 'F11' && !e.shiftKey) return act(() => setDialog({ kind: 'insertChart', data: 'sheet' }))
      if (k === 'Escape' && painter.active) return act(() => setPainter({ active: false, sticky: false, styles: null }))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doc, dialog, backstage, save, openFile, newBook, print, runAutoSum, painter.active])

  function groupShortcut(on: boolean) {
    const rg = doc.activeRange
    const axis = isFullCols(rg) && !isFullRows(rg) ? 'col' : 'row'
    if (!isFullCols(rg) && !isFullRows(rg)) return setDialog({ kind: 'groupDialog', data: on ? 'group' : 'ungroup' })
    if (on) {
      const err = group(doc, axis, rg)
      if (err) alert(err)
    } else ungroup(doc, axis, rg)
  }

  // ---------- context menus ----------
  const ctxItems = (kind: ContextKind): MenuItem[] => {
    if (kind === 'object') {
      const o = selectedObject(doc)
      return o ? objectContextItems(api, o, { arrange: (h) => arrangeObject(doc, o.id, h), del: () => deleteObject(doc, o.id), dup: () => duplicateObject(doc, o.id) }) : []
    }
    const common: MenuItem[] = [
      { label: 'Cut', shortcut: 'Ctrl+X', onClick: () => copy(true) },
      { label: 'Copy', shortcut: 'Ctrl+C', onClick: () => copy(false) },
      { label: 'Paste', shortcut: 'Ctrl+V', onClick: () => paste() },
      { label: 'Paste Special…', onClick: () => setDialog({ kind: 'pasteSpecial' }) },
      'separator',
    ]
    const rows = selectedIndexes(doc, 'row')
    const cols = selectedIndexes(doc, 'col')
    if (kind === 'col')
      return [
        ...common,
        { label: 'Insert', onClick: () => insertDelete(doc, 'col', doc.activeRange.c1, doc.activeRange.c2 - doc.activeRange.c1 + 1) },
        { label: 'Delete', onClick: () => insertDelete(doc, 'col', doc.activeRange.c1, -(doc.activeRange.c2 - doc.activeRange.c1 + 1)) },
        { label: 'Clear Contents', onClick: () => doc.clear('contents') },
        'separator',
        { label: 'Format Cells…', onClick: () => setDialog({ kind: 'formatCells' }) },
        { label: 'Column Width…', onClick: () => setDialog({ kind: 'colWidth' }) },
        { label: 'AutoFit Column Width', onClick: () => autofitColumns(doc, cols) },
        { label: 'Hide', onClick: () => setHidden(doc, 'col', cols, true) },
        { label: 'Unhide', onClick: () => setHidden(doc, 'col', expandHidden(doc, 'col'), false) },
      ]
    if (kind === 'row')
      return [
        ...common,
        { label: 'Insert', onClick: () => insertDelete(doc, 'row', doc.activeRange.r1, doc.activeRange.r2 - doc.activeRange.r1 + 1) },
        { label: 'Delete', onClick: () => insertDelete(doc, 'row', doc.activeRange.r1, -(doc.activeRange.r2 - doc.activeRange.r1 + 1)) },
        { label: 'Clear Contents', onClick: () => doc.clear('contents') },
        'separator',
        { label: 'Format Cells…', onClick: () => setDialog({ kind: 'formatCells' }) },
        { label: 'Row Height…', onClick: () => setDialog({ kind: 'rowHeight' }) },
        { label: 'AutoFit Row Height', onClick: () => autofitRows(doc, rows) },
        { label: 'Hide', onClick: () => setHidden(doc, 'row', rows, true) },
        { label: 'Unhide', onClick: () => setHidden(doc, 'row', expandHidden(doc, 'row'), false) },
      ]
    return [
      ...common,
      { label: 'Insert…', onClick: () => setDialog({ kind: 'insertCells' }) },
      { label: 'Delete…', onClick: () => setDialog({ kind: 'deleteCells' }) },
      { label: 'Clear Contents', onClick: () => doc.clear('contents') },
      'separator',
      { label: 'Sort A to Z', onClick: () => quickSort(doc, false) },
      { label: 'Sort Z to A', onClick: () => quickSort(doc, true) },
      { label: 'Custom Sort…', onClick: () => setDialog({ kind: 'sort' }) },
      'separator',
      ...cellExtraItems(api),
      'separator',
      { label: 'Format Cells…', shortcut: 'Ctrl+1', onClick: () => setDialog({ kind: 'formatCells' }) },
      { label: 'Define Name…', onClick: () => setDialog({ kind: 'defineName' }) },
      { label: doc.sheet.get(doc.sel.active.r, doc.sel.active.c)?.link ? 'Edit Link…' : 'Link…', shortcut: 'Ctrl+K', onClick: () => setDialog({ kind: 'hyperlink' }) },
    ]
  }

  const sheet = doc.sheet
  const setZoom = (z: number) => {
    sheet.zoom = Math.max(10, Math.min(400, Math.round(z)))
    doc.emit()
  }

  const status = saveState === 'saving' ? 'Saving…' : saveState === 'failed' ? 'Not saved (storage full)' : saveState === 'off' ? (doc.modified ? 'Not saved' : 'Saved') : 'Saved to this browser'

  return (
    <AppContext.Provider value={api}>
      <div className={`app${painter.active ? ' is-painting' : ''}${doc.tool ? ' is-drawing' : ''}`}>
        <TitleBar autoSave={autoSave} setAutoSave={setAutoSave} status={status} onSearch={(q) => setDialog({ kind: 'find', message: q })} onPrintPreview={() => setBackstage(true)} />
        <Ribbon active={tab} setActive={setTab} onFile={() => setBackstage(true)} collapsed={collapsed} setCollapsed={setCollapsed} />
        {showFormulaBar && <FormulaBar />}
        <div className="work-area">
          <div className={`grid-area view-${viewMode}${split ? ' is-split' : ''}`}>
            {split && (
              <div className="split-top">
                <GridView pane="secondary" onContextMenu={(x, y, kind) => setCtx({ x, y, kind })} onSelectionEnd={applyPainter} onOpenFormat={() => setPane('format')} onFilter={(x, y, target, col) => setFilterMenu({ x, y, target, col })} />
              </div>
            )}
            <GridView
              onContextMenu={(x, y, kind) => setCtx({ x, y, kind })}
              onSelectionEnd={applyPainter}
              onOpenFormat={() => setPane('format')}
              onFilter={(x, y, target, col) => setFilterMenu({ x, y, target, col })}
            />
          </div>
          {pane && (
            <Suspense fallback={null}>
              <SidePane kind={pane} onClose={() => { setPane(null); focusGrid() }} />
            </Suspense>
          )}
        </div>
        <SheetTabs />
        <StatusBar zoom={sheet.zoom} setZoom={setZoom} />
        {backstage && (
          <Suspense fallback={null}>
          <Backstage
            onClose={() => {
              setBackstage(false)
              focusGrid()
            }}
            onTemplate={(id) => {
              const t = TEMPLATES.find((x) => x.id === id)!
              forgetFile()
              loadBook(t.build(), id === 'blank' ? DEFAULT_DOC_TITLE : t.label)
            }}
          />
          </Suspense>
        )}
        {filterMenu && (
          <FilterMenu
            state={filterMenu}
            onClose={() => {
              setFilterMenu(null)
              focusGrid()
            }}
          />
        )}
        {ctx && (
          <ContextMenu x={ctx.x} y={ctx.y} items={ctxItems(ctx.kind)} onClose={() => setCtx(null)} top={ctx.kind === 'cell' ? <MiniToolbar onClose={() => setCtx(null)} /> : undefined} />
        )}
        {!dialog && !backstage && <KeyTips />}
        {dialog && (
          <Suspense fallback={null}>
            <DialogHost
              spec={dialog}
              onClose={() => {
                setDialog(null)
                focusGrid()
              }}
              onInsertFunction={insertFunction}
            />
          </Suspense>
        )}
      </div>
    </AppContext.Provider>
  )
}

/** Unhide also reveals hidden rows/columns right before or inside the selection. */
function expandHidden(doc: Doc, axis: 'row' | 'col'): number[] {
  const idx = new Set(selectedIndexes(doc, axis))
  const ax = axis === 'row' ? doc.sheet.rows : doc.sheet.cols
  const first = Math.min(...idx)
  for (let i = first - 1; i >= 0 && ax.hidden.has(i); i--) idx.add(i)
  if (idx.size === 1 && ax.hidden.size) ax.hidden.forEach((h) => Math.abs(h - first) <= 1 && idx.add(h))
  return [...idx]
}

void MAX_ROWS
void MAX_COLS
void cellKey
void deleteCells
