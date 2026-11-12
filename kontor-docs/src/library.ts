import { durable, loadAutosaveAsync, removeAutosave, storeAutosave } from './io/fileAccess'

// Documents kept in this browser: the open document autosaves under its own key, and the others
// are kept as copies with an index for File > Open > Recent.

export type LibraryEntry = { id: string; title: string; modified: string; words?: number; pinned?: boolean }

const INDEX_KEY = 'kontor-write:library'
const docKey = (id: string) => `kontor-write:doc:${id}`

export function listDocuments(): LibraryEntry[] {
  try {
    const list = JSON.parse(durable.get(INDEX_KEY) ?? '[]') as LibraryEntry[]
    return list.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.modified.localeCompare(a.modified))
  } catch {
    return []
  }
}

function writeIndex(list: LibraryEntry[]) {
  try {
    // Pinned documents always stay in the list.
    const pinned = list.filter((e) => e.pinned)
    durable.set(INDEX_KEY, JSON.stringify([...pinned, ...list.filter((e) => !e.pinned).slice(0, Math.max(0, 50 - pinned.length))]))
  } catch {
    // Storage full: the list is not updated.
  }
}

/** Updates the index entry of a document (title, time). */
export function touchDocument(entry: LibraryEntry) {
  const list = listDocuments()
  const pinned = entry.pinned ?? list.find((e) => e.id === entry.id)?.pinned
  writeIndex([{ ...entry, ...(pinned ? { pinned: true } : {}) }, ...list.filter((e) => e.id !== entry.id)])
}

/** Pins a document to the top of the recent list (or unpins it). */
export function setPinned(entry: LibraryEntry, pinned: boolean) {
  const list = listDocuments()
  const current = list.find((e) => e.id === entry.id) ?? entry
  const next = { ...current, pinned: pinned || undefined }
  if (!pinned) delete next.pinned
  writeIndex([next, ...list.filter((e) => e.id !== entry.id)])
}

/** Keeps a copy of a document that is being closed. Returns false when the browser storage is full. */
export function archiveDocument(id: string, data: unknown, entry: LibraryEntry) {
  try {
    durable.set(docKey(id), JSON.stringify(data))
    touchDocument(entry)
    return true
  } catch {
    return false
  }
}

export function loadArchived<T>(id: string): T | null {
  try {
    const raw = durable.get(docKey(id))
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function removeDocument(id: string) {
  try {
    durable.remove(docKey(id))
  } catch {
    // Ignore: nothing to remove.
  }
  removeVersions(id)
  writeIndex(listDocuments().filter((e) => e.id !== id))
}

// ---- Version history ----
// Earlier states of a document are kept in this browser (or the desktop app's data folder): one on
// every save and, while AutoSave is on, at most one every ten minutes. The newest 20 are kept.

export type VersionEntry = { date: string; words: number; data: unknown }

const versionsKey = (id: string) => `kontor-write:versions:${id}`
export const MAX_VERSIONS = 20

export async function listVersions(id: string): Promise<VersionEntry[]> {
  try {
    const raw = await loadAutosaveAsync(versionsKey(id))
    const list = raw ? (JSON.parse(raw) as VersionEntry[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** Content of a stored document that decides whether two versions differ. */
const contentOf = (data: unknown) => JSON.stringify((data as { content?: unknown } | null)?.content ?? data)

/** The newest stored version of each document seen in this session (date and content). */
const newest = new Map<string, { date: string; content: string }>()

/**
 * Adds a version unless it equals the newest one or (with `minInterval`) the newest one is recent.
 * Returns true when a version was added.
 */
export async function addVersion(id: string, data: unknown, words: number, minInterval = 0, now = new Date()): Promise<boolean> {
  const content = contentOf(data)
  // AutoSave calls this after every pause in typing: decide from the remembered newest version
  // when possible, without reading (and parsing) the whole history again.
  const known = newest.get(id)
  const tooSoon = (date: string) => minInterval > 0 && now.getTime() - new Date(date).getTime() < minInterval
  if (known && (known.content === content || tooSoon(known.date))) return false
  const list = await listVersions(id)
  const last = list[0]
  if (last) newest.set(id, { date: last.date, content: contentOf(last.data) })
  if (last && (contentOf(last.data) === content || tooSoon(last.date))) return false
  const next = [{ date: now.toISOString(), words, data }, ...list].slice(0, MAX_VERSIONS)
  try {
    await storeAutosave(versionsKey(id), JSON.stringify(next))
    newest.set(id, { date: now.toISOString(), content })
    return true
  } catch {
    return false
  }
}

export function removeVersions(id: string) {
  newest.delete(id)
  removeAutosave(versionsKey(id))
}
