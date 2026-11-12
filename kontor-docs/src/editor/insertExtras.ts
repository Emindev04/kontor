import type { Editor, JSONContent } from '@tiptap/core'
import { pickFile } from './commands'
import { t } from '../i18n'

// Insert › Screenshot, Insert › Object › Text from File and the Quick Part gallery (AutoText).

/**
 * Screen Clipping: the browser asks which screen, window or tab to share, one frame of it is taken
 * and inserted as a picture. Returns why it failed, or null.
 */
export async function insertScreenshot(editor: Editor): Promise<string | null> {
  const media = navigator.mediaDevices as MediaDevices & { getDisplayMedia?: (o: object) => Promise<MediaStream> }
  if (!media?.getDisplayMedia) return t('This browser cannot take screenshots.')
  let stream: MediaStream
  try {
    stream = await media.getDisplayMedia({ video: true, audio: false })
  } catch {
    return null // The user cancelled.
  }
  try {
    const video = document.createElement('video')
    video.srcObject = stream
    video.muted = true
    await video.play()
    await new Promise((r) => setTimeout(r, 150))
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    const src = canvas.toDataURL('image/png')
    editor.chain().focus().insertContent({ type: 'image', attrs: { src, alt: t('Screenshot') } }).run()
    return null
  } finally {
    stream.getTracks().forEach((t) => t.stop())
  }
}

/** Reads a document file (.docx, .doc, .odt, .rtf, .md, .html, .txt) as editor content. */
async function readDocumentFile(file: File): Promise<JSONContent[] | string> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.docx')) {
    const { importDocx } = await import('../io/docxImport')
    return (await importDocx(file)).content.content ?? []
  }
  if (name.endsWith('.odt')) {
    const { importOdt } = await import('../io/formats')
    return importOdt(file)
  }
  if (name.endsWith('.md') || name.endsWith('.markdown')) {
    const { importMarkdown } = await import('../io/formats')
    return importMarkdown(await file.text())
  }
  if (name.endsWith('.rtf')) {
    const { importRtf, readRtfFile } = await import('../io/rtf')
    return importRtf(await readRtfFile(file)).html
  }
  if (name.endsWith('.doc')) {
    const { importDoc } = await import('../io/doc')
    return importDoc(new Uint8Array(await file.arrayBuffer())).html
  }
  if (name.endsWith('.html') || name.endsWith('.htm')) return file.text()
  return (await file.text()).split(/\r?\n/).map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] }))
}

/** Text from File: the content of another document goes in at the cursor. */
export async function insertTextFromFile(editor: Editor): Promise<string | null> {
  const file = await pickFile('.docx,.doc,.odt,.rtf,.md,.markdown,.html,.htm,.txt,text/plain')
  if (!file) return null
  try {
    const content = await readDocumentFile(file)
    editor.chain().focus().insertContent(content).run()
    return null
  } catch (e) {
    console.error(e)
    return t('“{name}” could not be read.', { name: file.name })
  }
}

// ---- Quick Parts (AutoText) ----

export type QuickPart = { name: string; content: JSONContent }
const QUICK_PARTS_KEY = 'kontor-write:quick-parts'

export function loadQuickParts(): QuickPart[] {
  try {
    return JSON.parse(localStorage.getItem(QUICK_PARTS_KEY) ?? '[]') as QuickPart[]
  } catch {
    return []
  }
}

function storeQuickParts(parts: QuickPart[]) {
  try {
    localStorage.setItem(QUICK_PARTS_KEY, JSON.stringify(parts))
  } catch {
    // Storage full: the gallery keeps what it had.
  }
}

/** Save Selection to Quick Part Gallery: the selected content, under a name, for later documents. */
export function saveSelectionAsQuickPart(editor: Editor): string | null {
  const { from, to, empty } = editor.state.selection
  if (empty) return t('Select the text or objects to save first.')
  const name = prompt(t('Name of the new building block:'), editor.state.doc.textBetween(from, to, ' ').trim().slice(0, 40))
  if (!name?.trim()) return null
  const content = editor.state.doc.slice(from, to).content.toJSON() as JSONContent[]
  const parts = loadQuickParts().filter((p) => p.name !== name.trim())
  storeQuickParts([...parts, { name: name.trim(), content: { type: 'doc', content } }])
  return null
}

export function insertQuickPart(editor: Editor, part: QuickPart) {
  editor.chain().focus().insertContent(part.content.content ?? []).run()
}

export function deleteQuickPart(name: string) {
  storeQuickParts(loadQuickParts().filter((p) => p.name !== name))
}
