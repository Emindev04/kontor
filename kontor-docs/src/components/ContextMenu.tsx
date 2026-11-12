import { useEffect, useState } from 'react'
import {
  Check, ClipboardPaste, Copy, ExternalLink, MessageSquarePlus, MessageSquareX, X, Image as ImageIcon, Link, Pilcrow, Scissors, Search, Table, Trash2, Type, Unlink,
} from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { clipboardCommand, pasteFromClipboard } from '../editor/commands'
import { convertShapeToTextBox } from '../editor/Shape'
import { SHAPES } from '../editor/shapePaths'
import { changeAt, commentsAt } from '../editor/Review'
import { MenuList, Popup, type MenuItem } from './ui'
import type { AppApi } from './tabs/types'
import { t } from '../i18n'

/**
 * Right-click menu like the original's. Shift+right-click (or right-click with the menu open)
 * shows the browser's own menu, which has the spell checker's suggestions.
 */
export function ContextMenu({ editor, app }: { editor: Editor; app: AppApi }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const onMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (e.shiftKey || !target.closest('.pages .ProseMirror')) return
      e.preventDefault()
      setAt({ x: e.clientX, y: e.clientY })
    }
    const close = () => setAt(null)
    document.addEventListener('contextmenu', onMenu)
    document.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('contextmenu', onMenu)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [])

  useEffect(() => {
    if (!at) return
    const onDown = (e: MouseEvent) => !(e.target as HTMLElement).closest('.menu') && setAt(null)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAt(null)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [at])

  if (!at) return null

  const chain = () => editor.chain().focus()
  const { from, to, empty } = editor.state.selection
  const selected = empty ? '' : editor.state.doc.textBetween(from, to, ' ').slice(0, 30)
  const inTable = editor.isActive('table')
  const selectedNode = editor.state.selection instanceof NodeSelection ? editor.state.selection.node : null
  const onImage = selectedNode?.type.name === 'image'
  const onShape = selectedNode?.type.name === 'shape'
  const onDrawing = !!selectedNode && ['image', 'shape', 'chart', 'diagram', 'signatureLine'].includes(selectedNode.type.name)
  const link = editor.getAttributes('link').href as string | undefined

  const items: MenuItem[] = [
    { label: t('Cut'), icon: Scissors, shortcut: 'Ctrl+X', disabled: empty && !onDrawing, onClick: () => clipboardCommand(editor, 'cut') },
    { label: t('Copy'), icon: Copy, shortcut: 'Ctrl+C', disabled: empty && !onDrawing, onClick: () => clipboardCommand(editor, 'copy') },
    { label: t('Paste'), icon: ClipboardPaste, shortcut: 'Ctrl+V', onClick: () => pasteFromClipboard(editor) },
    { label: t('Paste: Merge Formatting'), icon: ClipboardPaste, onClick: () => pasteFromClipboard(editor, 'merge') },
    { label: t('Paste: Keep Text Only'), icon: ClipboardPaste, onClick: () => pasteFromClipboard(editor, 'text') },
    'separator',
  ]
  if (onImage) {
    items.push({ label: t('Edit Alt Text…'), icon: ImageIcon, onClick: () => app.openDialog('altText') })
    items.push({ label: t('Reset Picture Size'), icon: ImageIcon, onClick: () => chain().updateAttributes('image', { width: null, height: null }).run() })
    items.push('separator')
  }
  if (onShape && !SHAPES[selectedNode!.attrs.kind as string]?.line) {
    items.push({ label: t('Add Text'), icon: Type, onClick: () => convertShapeToTextBox(editor.view, editor.state.selection.from) })
  }
  if (onDrawing) {
    items.push(
      { label: t('Bring to Front'), onClick: () => chain().updateAttributes(selectedNode!.type.name, { zIndex: 50 }).run() },
      { label: t('Send to Back'), onClick: () => chain().updateAttributes(selectedNode!.type.name, { zIndex: -50 }).run() },
      { label: t('Selection Pane…'), onClick: () => app.setShowSelectionPane(true) },
      'separator',
    )
  }
  if (inTable) {
    items.push(
      { heading: t('Table') },
      { label: t('Insert Row Above'), icon: Table, onClick: () => chain().addRowBefore().run() },
      { label: t('Insert Row Below'), icon: Table, onClick: () => chain().addRowAfter().run() },
      { label: t('Insert Column Left'), icon: Table, onClick: () => chain().addColumnBefore().run() },
      { label: t('Insert Column Right'), icon: Table, onClick: () => chain().addColumnAfter().run() },
      { label: t('Delete Row'), icon: Trash2, onClick: () => chain().deleteRow().run() },
      { label: t('Delete Column'), icon: Trash2, onClick: () => chain().deleteColumn().run() },
      { label: t('Delete Table'), icon: Trash2, onClick: () => chain().deleteTable().run() },
      ...(editor.can().mergeCells() ? [{ label: t('Merge Cells'), icon: Table, onClick: () => chain().mergeCells().run() }] : []),
      ...(editor.can().splitCell() ? [{ label: t('Split Cells'), icon: Table, onClick: () => chain().splitCell().run() }] : []),
      'separator',
    )
  }
  items.push(
    { label: t('Font…'), icon: Type, shortcut: 'Ctrl+D', onClick: () => app.openDialog('font') },
    { label: t('Paragraph…'), icon: Pilcrow, onClick: () => app.openDialog('paragraph') },
    'separator',
  )
  if (link) {
    items.push(
      { label: t('Edit Link…'), icon: Link, onClick: () => app.openDialog('link') },
      { label: t('Open Link'), icon: ExternalLink, onClick: () => window.open(link, '_blank', 'noopener') },
      { label: t('Remove Link'), icon: Unlink, onClick: () => chain().extendMarkRange('link').unsetLink().run() },
    )
  } else items.push({ label: t('Link…'), icon: Link, shortcut: 'Ctrl+K', onClick: () => app.openDialog('link') })
  if (selected) items.push({ label: t('Search “{text}”', { text: selected }), icon: Search, onClick: () => app.openDialog('find') })
  if (editor === app.mainEditor) {
    const change = changeAt(editor.state)
    const comment = commentsAt(editor.state).find((id) => app.comments[id])
    items.push('separator', { label: t('New Comment'), icon: MessageSquarePlus, shortcut: 'Ctrl+Alt+M', onClick: app.newComment })
    if (comment)
      items.push({
        label: t('Delete Comment'),
        icon: MessageSquareX,
        onClick: () => {
          editor.commands.removeComment(comment)
          app.setComments((c) => {
            const next = { ...c }
            delete next[comment]
            return next
          })
        },
      })
    if (change)
      items.push(
        { label: change.kind === 'insertion' ? t('Accept Insertion') : t('Accept Deletion'), icon: Check, onClick: () => chain().acceptChange(change).run() },
        { label: change.kind === 'insertion' ? t('Reject Insertion') : t('Reject Deletion'), icon: X, onClick: () => chain().rejectChange(change).run() },
      )
  }

  return (
    <Popup point={at} className="context-menu" role="menu">
      <MenuList items={items} close={() => setAt(null)} />
      <div className="menu-footnote">{t('Shift+right-click for spelling suggestions')}</div>
    </Popup>
  )
}
