import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { addSheet, deleteSheet, duplicateSheet, hideSheet, moveSheet, renameSheet, setTabColor } from '../commands/ops'
import { FontColorPalette } from './palettes'
import { ContextMenu } from './ContextMenu'
import { cls } from './ui'
import { useApp, useDocVersion } from './appContext'

export function SheetTabs() {
  const app = useApp()
  const doc = app.doc
  useDocVersion(doc)
  const strip = useRef<HTMLDivElement>(null)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number; index: number; colors?: boolean } | null>(null)
  const dragFrom = useRef<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)

  const activate = (i: number) => {
    if (doc.edit && doc.edit.text.startsWith('=')) {
      // pointing at another sheet while typing a formula
      doc.activeIndex = i
      doc.emit()
      return
    }
    if (doc.edit) {
      const err = doc.commitEdit()
      if (err) return app.alert(err)
    }
    doc.setActiveSheet(i)
    app.focusGrid()
  }

  const startRename = (i: number) => {
    setRenaming(i)
    setDraft(doc.wb.sheets[i].name)
  }

  const finishRename = () => {
    if (renaming === null) return
    const err = renameSheet(doc, renaming, draft)
    setRenaming(null)
    if (err) app.alert(err)
    app.focusGrid()
  }

  const confirmDelete = (i: number) => {
    const s = doc.wb.sheets[i]
    const run = () => {
      const err = deleteSheet(doc, i)
      if (err) app.alert(err)
    }
    if (s.cells.size) app.confirm(`"${s.name}" will be permanently deleted. Do you want to continue?`, run, 'Delete Sheet')
    else run()
  }

  const hiddenCount = doc.wb.sheets.filter((s) => s.hidden).length

  return (
    <div className="sheet-tabs">
      <div className="st-nav">
        <button type="button" className="st-btn" aria-label="Scroll to the previous sheet" onClick={() => strip.current?.scrollBy({ left: -120, behavior: 'smooth' })}>
          <ChevronLeft size={14} />
        </button>
        <button type="button" className="st-btn" aria-label="Scroll to the next sheet" onClick={() => strip.current?.scrollBy({ left: 120, behavior: 'smooth' })}>
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="st-strip" ref={strip} role="tablist" aria-label="Sheets">
        {doc.wb.sheets.map((s, i) =>
          s.hidden ? null : (
            <div
              key={s.id}
              role="tab"
              aria-selected={i === doc.activeIndex}
              className={cls('st-tab', i === doc.activeIndex && 'is-active', doc.group.size > 1 && doc.group.has(s.id) && 'is-grouped', dropAt === i && 'drop-before')}
              style={s.tabColor ? ({ '--tab-color': s.tabColor } as React.CSSProperties) : undefined}
              draggable={renaming !== i}
              onDragStart={(e) => {
                dragFrom.current = i
                e.dataTransfer.effectAllowed = e.ctrlKey ? 'copy' : 'move'
                e.dataTransfer.setData('text/plain', s.name)
              }}
              onDragOver={(e) => {
                if (dragFrom.current === null) return
                e.preventDefault()
                const r = e.currentTarget.getBoundingClientRect()
                setDropAt(e.clientX < r.left + r.width / 2 ? i : i + 1)
              }}
              onDragLeave={() => setDropAt(null)}
              onDrop={(e) => {
                e.preventDefault()
                const from = dragFrom.current
                dragFrom.current = null
                const to = dropAt ?? i
                setDropAt(null)
                if (from === null) return
                if (e.ctrlKey || e.altKey) duplicateSheet(doc, from, to)
                else moveSheet(doc, from, to)
              }}
              onDragEnd={() => {
                dragFrom.current = null
                setDropAt(null)
              }}
              onMouseDown={(e) => {
                if (e.button !== 0 || renaming === i) return
                const id = doc.wb.sheets[i].id
                if (e.ctrlKey || e.metaKey || e.shiftKey) {
                  // group sheets for editing: Ctrl toggles one sheet, Shift takes the run from the active sheet
                  if (!doc.group.size) doc.group.add(doc.sheet.id)
                  if (e.shiftKey) {
                    const [a, b] = [Math.min(doc.activeIndex, i), Math.max(doc.activeIndex, i)]
                    doc.group = new Set(doc.wb.sheets.slice(a, b + 1).map((s) => s.id))
                  } else if (doc.group.has(id) && id !== doc.sheet.id) doc.group.delete(id)
                  else doc.group.add(id)
                  if (!doc.group.has(id)) return doc.emit()
                } else if (!doc.group.has(id) || doc.group.size < 2) doc.group = new Set()
                activate(i)
              }}
              onDoubleClick={() => startRename(i)}
              onContextMenu={(e) => {
                e.preventDefault()
                if (i !== doc.activeIndex) doc.setActiveSheet(i)
                setMenu({ x: e.clientX, y: e.clientY - 260, index: i })
              }}
            >
              {renaming === i ? (
                <input
                  className="st-rename"
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  value={draft}
                  aria-label="Sheet name"
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={finishRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') finishRename()
                    if (e.key === 'Escape') {
                      setRenaming(null)
                      app.focusGrid()
                    }
                  }}
                  style={{ width: `${Math.max(4, draft.length + 1)}ch` }}
                />
              ) : (
                s.name
              )}
            </div>
          ),
        )}
      </div>
      <button type="button" className="st-btn st-add" title="New sheet (Shift+F11)" aria-label="New sheet" onClick={() => addSheet(doc, doc.wb.sheets.length)}>
        <Plus size={15} />
      </button>
      {menu && !menu.colors && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Insert', onClick: () => addSheet(doc, menu.index) },
            doc.group.size > 1
              ? { label: 'Ungroup Sheets', onClick: () => { doc.group = new Set(); doc.emit() } }
              : { label: 'Select All Sheets', onClick: () => { doc.group = new Set(doc.wb.sheets.filter((s) => !s.hidden).map((s) => s.id)); doc.emit() } },
            { label: 'Delete', onClick: () => confirmDelete(menu.index) },
            { label: 'Rename', onClick: () => startRename(menu.index) },
            { label: 'Move or Copy…', onClick: () => app.dialog({ kind: 'moveCopy' }) },
            { label: 'Tab Color', detail: 'Choose a color for the tab', onClick: () => setTimeout(() => setMenu({ ...menu, colors: true })) },
            'separator',
            {
              label: 'Hide',
              onClick: () => {
                const err = hideSheet(doc, menu.index)
                if (err) app.alert(err)
              },
            },
            { label: 'Unhide…', disabled: !hiddenCount, onClick: () => app.dialog({ kind: 'unhideSheet' }) },
          ]}
        />
      )}
      {menu && menu.colors && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          <div className="palette-menu">
            <FontColorPalette
              autoLabel="No Color"
              onAuto={() => {
                setTabColor(doc, menu.index, undefined)
                setMenu(null)
              }}
              onPick={(c) => {
                setTabColor(doc, menu.index, c)
                setMenu(null)
              }}
            />
          </div>
        </ContextMenu>
      )}
    </div>
  )
}
