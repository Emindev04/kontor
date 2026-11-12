import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { EditorContent, type Editor } from '@tiptap/react'
import { generateHTML } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { PX_PER_IN } from '../units'
import {
  PARAGRAPH_SPACING, SLOT_LABEL, formatPageNumber, paperDims, slotFor, themeColors, themeFonts, type HeaderFooter, type HeaderFooterSlot,
  type PageDesign, type PageSetup,
} from '../pageSetup'
import { staticExtensions } from '../editor/extensions'
import { fieldValue, resolveFieldTokens } from '../editor/Fields'
import { collectNotes, type NoteSettings, type Notes } from '../editor/Notes'
import type { PageGeometry, PaginationController } from '../editor/Pagination'
import { cls } from './ui'
import type { ViewMode } from './tabs/types'

export const PAGE_GAP = 16

export type HeaderFooterEdit = { slot: HeaderFooterSlot; page: number }

type Props = {
  editor: Editor
  hfEditor: Editor | null
  setup: PageSetup
  design: PageDesign
  headerFooter: HeaderFooter
  title: string
  zoom: number
  pages: number
  /** Changes with every new page layout, so page-dependent parts (footnotes, endnotes) redraw. */
  layoutVersion?: number
  viewMode: ViewMode
  showMarks: boolean
  painting: boolean
  widowControl: boolean
  hfEdit: HeaderFooterEdit | null
  onEditHeaderFooter: (edit: HeaderFooterEdit | null) => void
  controller: PaginationController
  /** Review display classes (markup view, hidden revisions/comments). */
  markupClass?: string
  /** Leaves room on the right for the comment cards. */
  hasMarkupPane?: boolean
  pagesRef?: (el: HTMLDivElement | null) => void
  children?: ReactNode
  notes: Notes
  noteSettings: NoteSettings
  /** Id of the footnote/endnote being edited, and its editor. */
  noteEdit: string | null
  noteEditor: Editor | null
  onEditNote: (id: string | null) => void
  /** Draw mode for shapes and text boxes: the kind being drawn, and where it was drawn (page coordinates). */
  /** CSS of modified and custom styles. */
  stylesCss?: string
  drawKind?: string | null
  onDraw?: (rect: { x: number; y: number; w: number; h: number; flip: string | null } | null) => void
}

/** Crosshair overlay: drag a rectangle (or click) to place a shape or text box. */
function DrawOverlay({ pageWidth, onDraw }: { pageWidth: number; onDraw: NonNullable<Props['onDraw']> }) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const toPage = (e: React.PointerEvent | PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    const scale = r.width / pageWidth || 1
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDraw(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDraw])
  return (
    <div
      ref={ref}
      className="draw-overlay"
      onPointerDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const p = toPage(e)
        setBox({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!box) return
        const p = toPage(e)
        setBox({ ...box, x1: e.shiftKey ? box.x0 + Math.sign(p.x - box.x0) * Math.max(Math.abs(p.x - box.x0), Math.abs(p.y - box.y0)) : p.x, y1: e.shiftKey ? box.y0 + Math.sign(p.y - box.y0) * Math.max(Math.abs(p.x - box.x0), Math.abs(p.y - box.y0)) : p.y })
      }}
      onPointerUp={() => {
        if (!box) return
        const flip = `${box.x1 < box.x0 ? 'h' : ''}${box.y1 < box.y0 ? 'v' : ''}` || null
        onDraw({ x: Math.min(box.x0, box.x1), y: Math.min(box.y0, box.y1), w: Math.abs(box.x1 - box.x0), h: Math.abs(box.y1 - box.y0), flip })
        setBox(null)
      }}
    >
      {box && <div className="draw-rect" style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }} />}
    </div>
  )
}

const BORDER_CSS: Record<string, string> = { single: 'solid', double: 'double', dotted: 'dotted', dashed: 'dashed', thick: 'solid' }

function renderStatic(json: HeaderFooter[HeaderFooterSlot]) {
  if (!json) return ''
  try {
    return generateHTML(json, staticExtensions)
  } catch {
    return ''
  }
}

/** Layout > Line Numbers: one number per text line, in the left margin. */
function LineNumbers({ editor, mode, stride, left, pageWidth, pagesEl }: { editor: Editor; mode: 'continuous' | 'restartPage'; stride: number; left: number; pageWidth: number; pagesEl: HTMLElement | null }) {
  const [lines, setLines] = useState<{ top: number; n: number }[]>([])
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const ro = new ResizeObserver(() => setTick((t) => t + 1))
    ro.observe(editor.view.dom)
    return () => ro.disconnect()
  }, [editor])
  useLayoutEffect(() => {
    if (!pagesEl) return
    const rect = pagesEl.getBoundingClientRect()
    const scale = rect.width / pageWidth || 1
    const out: { top: number; n: number }[] = []
    let n = 0
    let lastPage = -1
    const blocks = editor.view.dom.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4, h5, h6')
    for (const el of blocks) {
      if (el.closest('table, .note') || el.hasAttribute('data-no-line-numbers')) continue
      const range = document.createRange()
      range.selectNodeContents(el)
      const tops: number[] = []
      for (const r of range.getClientRects()) {
        if (!r.height) continue
        const y = (r.top - rect.top) / scale
        if (!tops.some((t) => Math.abs(t - y) < 4)) tops.push(y)
      }
      if (!tops.length) tops.push((el.getBoundingClientRect().top - rect.top) / scale)
      for (const y of tops.sort((a, b) => a - b)) {
        const page = Math.floor(y / stride)
        if (mode === 'restartPage' && page !== lastPage) n = 0
        lastPage = page
        out.push({ top: y, n: ++n })
      }
    }
    setLines((prev) => (JSON.stringify(prev) === JSON.stringify(out) ? prev : out))
  })
  void tick
  return (
    <>
      {lines.map((l, i) => (
        <span key={i} className="line-number" style={{ top: l.top, left }} aria-hidden="true">
          {l.n}
        </span>
      ))}
    </>
  )
}

const isEmptyHtml = (html: string) => !html || html.replace(/<[^>]+>/g, '').trim() === '' && !/<img|data-field/.test(html)

export function PageView(props: Props) {
  const { editor, hfEditor, setup, design, headerFooter, title, zoom, pages, viewMode, hfEdit, onEditHeaderFooter, controller } = props
  const isPrint = viewMode === 'print'
  const pagesRef = useRef<HTMLDivElement | null>(null)
  const forwardRef = props.pagesRef
  const setPagesRef = useCallback(
    (el: HTMLDivElement | null) => {
      pagesRef.current = el
      forwardRef?.(el)
    },
    [forwardRef],
  )
  const hostRef = useRef<HTMLDivElement>(null)

  const { w, h } = paperDims(setup)
  const W = w * PX_PER_IN
  const H = h * PX_PER_IN
  const m = setup.margins
  const ml = m.left * PX_PER_IN
  const mr = m.right * PX_PER_IN
  const contentW = W - ml - mr
  const stride = H + PAGE_GAP

  // Header/footer heights push the body down/up when they are taller than the margin.
  const [hfHeights, setHfHeights] = useState<Record<HeaderFooterSlot, number>>({ header: 0, footer: 0, firstHeader: 0, firstFooter: 0, evenHeader: 0, evenFooter: 0 })
  const bodyStart = (k: number) => Math.max(m.top * PX_PER_IN, setup.headerDistance * PX_PER_IN + hfHeights[slotFor('header', k, setup)])
  const bodyBottom = (k: number) => Math.max(m.bottom * PX_PER_IN, setup.footerDistance * PX_PER_IN + hfHeights[slotFor('footer', k, setup)])

  // Footnotes and endnotes: rendered once off-screen to measure them for the pagination.
  const noteList = collectNotes(editor.state.doc, props.noteSettings).filter((n) => props.notes[n.id])
  const noteListKey = noteList.map((n) => `${n.id}:${n.kind}:${n.label}`).join('|')
  const noteHtml = useMemo(() => {
    const out: Record<string, string> = {}
    for (const [id, json] of Object.entries(props.notes)) out[id] = renderStatic(json)
    return out
  }, [props.notes])
  const measureRef = useRef<HTMLDivElement>(null)
  const [noteHeights, setNoteHeights] = useState<{ sep: number; notes: Record<string, number> }>({ sep: 0, notes: {} })
  useLayoutEffect(() => {
    const root = measureRef.current
    if (!root) return
    const scale = root.getBoundingClientRect().width / contentW || 1
    const next: Record<string, number> = {}
    root.querySelectorAll<HTMLElement>('[data-note-id]').forEach((el) => (next[el.dataset.noteId!] = Math.ceil(el.getBoundingClientRect().height / scale)))
    const sepEl = root.querySelector<HTMLElement>('.note-sep')
    const sep = sepEl ? Math.ceil(sepEl.getBoundingClientRect().height / scale) : 0
    setNoteHeights((prev) => (prev.sep === sep && JSON.stringify(prev.notes) === JSON.stringify(next) ? prev : { sep, notes: next }))
  }, [noteHtml, noteListKey, contentW, zoom])
  const footnoteIds = noteList.filter((n) => n.kind === 'footnote').map((n) => n.id)
  const endnoteIds = noteList.filter((n) => n.kind === 'endnote').map((n) => n.id)
  const notesKey = JSON.stringify([noteHeights, footnoteIds, endnoteIds])

  const geometryKey = [isPrint, W, H, m.top, m.bottom, contentW, setup.headerDistance, setup.footerDistance, setup.differentFirstPage, setup.differentOddEven, setup.pageNumberStart, setup.verticalAlign, ...Object.values(hfHeights), props.widowControl, notesKey].join('|')
  const geometry = useMemo<PageGeometry | null>(
    () =>
      isPrint
        ? {
            contentWidth: contentW,
            stride,
            bodyStart,
            bodyHeight: (k) => H - bodyStart(k) - bodyBottom(k),
            widowControl: props.widowControl,
            noteHeight: footnoteIds.length ? (id) => noteHeights.notes[id] ?? 0 : undefined,
            noteSeparator: noteHeights.sep,
            endnoteHeights: endnoteIds.map((id) => noteHeights.notes[id] ?? 0),
            firstPageNumber: setup.pageNumberStart,
            verticalAlign: setup.verticalAlign,
            pageHeight: H,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geometryKey],
  )

  useEffect(() => {
    controller.host = hostRef.current
    if (controller.view !== editor.view) controller.attach(editor.view)
    controller.setGeometry(geometry)
  }, [controller, geometry, editor])

  useEffect(() => {
    // Remeasure when the paragraph spacing preset changes the text flow.
    controller.schedule()
  }, [controller, design.paragraphSpacing, props.showMarks])

  const staticHtml = useMemo(
    () => ({
      header: renderStatic(headerFooter.header),
      footer: renderStatic(headerFooter.footer),
      firstHeader: renderStatic(headerFooter.firstHeader),
      firstFooter: renderStatic(headerFooter.firstFooter),
      evenHeader: renderStatic(headerFooter.evenHeader),
      evenFooter: renderStatic(headerFooter.evenFooter),
    }),
    [headerFooter],
  )

  useLayoutEffect(() => {
    const root = pagesRef.current
    if (!root || !isPrint) return
    const scale = root.getBoundingClientRect().width / W || 1
    const next: Record<HeaderFooterSlot, number> = { header: 0, footer: 0, firstHeader: 0, firstFooter: 0, evenHeader: 0, evenFooter: 0 }
    root.querySelectorAll<HTMLElement>('.hf-area[data-slot]').forEach((el) => {
      const slot = el.dataset.slot as HeaderFooterSlot
      next[slot] = Math.max(next[slot], Math.round(el.getBoundingClientRect().height / scale))
    })
    setHfHeights((prev) => ((Object.keys(next) as HeaderFooterSlot[]).every((k) => Math.abs(prev[k] - next[k]) < 1) ? prev : next))
    // Measuring forces a layout of the whole document: only when headers/footers or the page changed.
  }, [staticHtml, setup, isPrint, W, zoom, pages > 1, hfEdit?.slot, headerFooter])

  const pageNumber = (k: number) => formatPageNumber(k + setup.pageNumberStart, setup.pageNumberFormat)

  const locate = (e: React.MouseEvent) => {
    const rect = pagesRef.current!.getBoundingClientRect()
    const scale = rect.width / W || 1
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale
    const k = Math.max(0, Math.min(pages - 1, Math.floor(y / stride)))
    const yIn = y - k * stride
    return { rect, scale, x, y, k, yIn, inHeader: yIn < bodyStart(k), inFooter: yIn > H - bodyBottom(k) && yIn <= H, inGap: yIn > H }
  }

  const caretAt = (rect: DOMRect, scale: number, x: number, y: number) =>
    editor.view.posAtCoords({ left: rect.left + x * scale, top: rect.top + y * scale })?.pos ?? null

  const onMouseDownCapture = (e: React.MouseEvent) => {
    if (!isPrint || e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('.hf-live, .markup-pane, .note-live')) return
    const note = target.closest<HTMLElement>('.note[data-note-id]')
    if (note) {
      e.preventDefault()
      props.onEditNote(note.dataset.noteId!)
      return
    }
    if (props.noteEdit) props.onEditNote(null)
    const at = locate(e)
    const { k, x, y, rect, scale } = at
    if (hfEdit) {
      e.preventDefault()
      if (at.inHeader || at.inFooter) onEditHeaderFooter({ slot: slotFor(at.inHeader ? 'header' : 'footer', k, setup), page: k })
      else if (e.detail >= 2) onEditHeaderFooter(null)
      return
    }
    if ((at.inHeader || at.inFooter) && e.detail >= 2) {
      e.preventDefault()
      onEditHeaderFooter({ slot: slotFor(at.inHeader ? 'header' : 'footer', k, setup), page: k })
      return
    }
    const top = k * stride + bodyStart(k)
    const bottom = k * stride + H - bodyBottom(k)
    const inLeftMargin = x < ml && !at.inHeader && !at.inFooter && !at.inGap
    const outside = at.inHeader || at.inFooter || at.inGap || x < ml || x > W - mr
    if (!outside && editor.view.dom.contains(target) && !target.closest('.pg-spacer')) return
    e.preventDefault()
    const cy = Math.min(Math.max(y, top + 3), bottom - 3)
    if (inLeftMargin) {
      // Selection bar: click selects the line, double-click the paragraph, triple-click everything.
      if (e.detail >= 3) return void editor.chain().focus().selectAll().run()
      const from = caretAt(rect, scale, ml + 1, cy)
      if (from == null) return
      if (e.detail === 2) {
        const $p = editor.state.doc.resolve(from)
        return void editor.chain().focus().setTextSelection({ from: $p.start(), to: $p.end() }).run()
      }
      const to = caretAt(rect, scale, W - mr - 1, cy) ?? from
      editor.view.focus()
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, Math.max(from, to))))
      return
    }
    const pos = caretAt(rect, scale, Math.min(Math.max(x, ml + 1), W - mr - 1), cy)
    if (pos != null) editor.chain().focus().setTextSelection(pos).run()
    else editor.commands.focus(y < top ? 'start' : 'end')
  }

  const spacing = PARAGRAPH_SPACING[design.paragraphSpacing] ?? PARAGRAPH_SPACING.default
  const fonts = themeFonts(design)
  const colors = themeColors(design)
  const docVars = {
    '--doc-space-after': `${spacing.after}pt`,
    '--doc-line': spacing.line,
    '--doc-font': `'${fonts.body}', Carlito, Arial, sans-serif`,
    '--doc-heading-font': `'${fonts.heading}', '${fonts.body}', Carlito, Arial, sans-serif`,
    '--doc-heading-color': colors.heading,
    '--doc-heading-dark': colors.headingDark,
    '--doc-accent': colors.accent,
    '--doc-hyphens': design.hyphenation ? 'auto' : 'manual',
    // Text area height of a page: pictures are scaled down to fit it.
    '--body-h': `${H - bodyStart(0) - bodyBottom(0)}px`,
    '--pg-paper': design.pageColor ?? '#fff',
  } as CSSProperties

  const border = design.pageBorder
  const watermark = design.watermark

  const renderArea = (kind: 'header' | 'footer', k: number) => {
    const slot = slotFor(kind, k, setup)
    const live = hfEdit && hfEdit.page === k && hfEdit.slot === slot && hfEditor
    const html = staticHtml[slot]
    const style: CSSProperties =
      kind === 'header' ? { top: setup.headerDistance * PX_PER_IN, left: ml, width: contentW } : { bottom: setup.footerDistance * PX_PER_IN, left: ml, width: contentW }
    return (
      <div key={kind} className={cls('hf-area', `hf-${kind}`, live && 'hf-live')} data-slot={slot} style={style}>
        {live ? (
          <EditorContent editor={hfEditor} />
        ) : (
          !isEmptyHtml(html) && (
            <div
              className="hf-static ProseMirror"
              dangerouslySetInnerHTML={{ __html: resolveFieldTokens(html, { page: pageNumber(k), numPages: String(pages), date: fieldValue('date', { page: '', pages, title }), time: fieldValue('time', { page: '', pages, title }), title }) }}
            />
          )
        )}
      </div>
    )
  }

  const renderNote = (n: (typeof noteList)[number]) => {
    const live = props.noteEdit === n.id && props.noteEditor
    return (
      <div key={n.id} className={cls('note', live && 'note-live')} data-note-id={live ? undefined : n.id}>
        <span className="note-num">{n.label}</span>
        {live ? <EditorContent editor={props.noteEditor!} /> : <div className="note-text ProseMirror" dangerouslySetInnerHTML={{ __html: noteHtml[n.id] ?? '' }} />}
      </div>
    )
  }

  const renderFootnotes = (k: number) => {
    const list = noteList.filter((n) => n.kind === 'footnote' && controller.pageOfPos(n.pos) === k)
    if (!list.length) return null
    return (
      <div className="notes-area" style={{ left: ml, width: contentW, bottom: bodyBottom(k) }}>
        <div className="note-sep" />
        {list.map(renderNote)}
      </div>
    )
  }

  const renderEndnotes = (k: number) => {
    const placements = controller.result.endnotes ?? []
    const sep = controller.result.endnoteSeparator
    const list = noteList.filter((n) => n.kind === 'endnote')
    const here = list.map((n, i) => ({ n, at: placements[i] })).filter((x) => x.at && x.at.page === k)
    if (!here.length && sep?.page !== k) return null
    return (
      <>
        {sep?.page === k && <div className="note-sep endnote-sep" style={{ left: ml, top: bodyStart(k) + sep.top }} />}
        {here.map(({ n, at }) => (
          <div key={n.id} className="endnote-slot" style={{ left: ml, width: contentW, top: bodyStart(k) + at!.top }}>
            {renderNote(n)}
          </div>
        ))}
      </>
    )
  }

  // The page sheets only change with the page layout, headers/footers, notes and page design; typing in
  // the body must not re-render them (a long document has hundreds).
  const footnotePages = noteList.filter((n) => n.kind === 'footnote').map((n) => `${n.id}:${controller.pageOfPos(n.pos)}`).join('|')
  const sheets = useMemo(
    () =>
      isPrint &&
      Array.from({ length: pages }, (_, k) => (
        <div
          key={k}
          className="sheet"
          data-page={k + 1}
          style={{ top: k * stride, width: W, height: H, background: design.pageFill ? `linear-gradient(${design.pageFill.angle}deg, ${design.pageFill.from}, ${design.pageFill.to})` : (design.pageColor ?? undefined) }}
        >
          {border && (
            <div
              className="sheet-border"
              style={{ inset: `${border.offsetPt}pt`, border: `${border.style === 'thick' ? border.widthPt * 2 : border.widthPt}pt ${BORDER_CSS[border.style]} ${border.color}` }}
            />
          )}
          {watermark &&
            (watermark.image ? (
              <div className="watermark">
                <img src={watermark.image} alt="" style={{ width: `${Math.round((watermark.scale ?? 1) * 60)}%`, opacity: watermark.washout ? 0.3 : 1, filter: watermark.washout ? 'grayscale(0.4) brightness(1.3)' : undefined }} />
              </div>
            ) : (
              <div className={cls('watermark', watermark.layout === 'diagonal' && 'is-diagonal')} style={{ color: watermark.color, opacity: watermark.semitransparent ? 0.45 : 1 }}>
                {watermark.text}
              </div>
            ))}
          {renderArea('header', k)}
          {renderArea('footer', k)}
          {renderFootnotes(k)}
          {renderEndnotes(k)}
          {hfEdit && (
            <>
              <div className="hf-line" style={{ top: bodyStart(k) }}>
                <span>{SLOT_LABEL[slotFor('header', k, setup)]}</span>
              </div>
              <div className="hf-line is-footer" style={{ top: H - bodyBottom(k) }}>
                <span>{SLOT_LABEL[slotFor('footer', k, setup)]}</span>
              </div>
            </>
          )}
        </div>
      )),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isPrint, pages, W, H, stride, setup, design, staticHtml, hfEdit, hfEditor, hfHeights, noteHtml, noteListKey, footnotePages, props.layoutVersion, props.noteEdit, props.noteEditor, title, noteHeights],
  )

  return (
    <div
      ref={setPagesRef}
      data-effects={design.effects && design.effects !== 'none' ? design.effects : undefined}
      className={cls('pages', !isPrint && 'is-web', props.showMarks && 'show-marks', props.painting && 'is-painting', hfEdit && 'is-hf-editing', props.markupClass, props.hasMarkupPane && 'has-markup')}
      style={{ zoom: zoom / 100, ...docVars, ...(isPrint ? { width: W, height: pages * stride - PAGE_GAP } : {}) }}
      onMouseDownCapture={onMouseDownCapture}
    >
      {sheets}
      <div ref={hostRef} className="pg-host" style={isPrint ? { left: ml, top: bodyStart(0), width: contentW } : undefined}>
        <EditorContent editor={editor} />
      </div>
      {props.children}
      {props.stylesCss && <style>{props.stylesCss}</style>}
      {props.drawKind && props.onDraw && <DrawOverlay pageWidth={W} onDraw={props.onDraw} />}
      {isPrint && setup.lineNumbers !== 'none' && <LineNumbers editor={editor} mode={setup.lineNumbers} stride={stride} left={ml - 0.25 * PX_PER_IN - 0.3 * PX_PER_IN} pageWidth={W} pagesEl={pagesRef.current} />}
      <div ref={measureRef} className="notes-measure" style={{ width: contentW }} aria-hidden="true">
        {noteList.length > 0 && <div className="note-sep" />}
        {noteList.map((n) => (
          <div key={n.id} className="note" data-note-id={n.id}>
            <span className="note-num">{n.label}</span>
            <div className="note-text ProseMirror" dangerouslySetInnerHTML={{ __html: noteHtml[n.id] ?? '' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
