import { durable } from './io/fileAccess'

// Documents kept in this browser: the open document autosaves under its own key, and the others
// are kept as copies with an index for File > Open > Recent.

export type LibraryEntry = { id: string; title: string; modified: string; words?: number }

const INDEX_KEY = 'kontor-write:library'
const docKey = (id: string) => `kontor-write:doc:${id}`

export function listDocuments(): LibraryEntry[] {
  try {
    const list = JSON.parse(durable.get(INDEX_KEY) ?? '[]') as LibraryEntry[]
    return list.sort((a, b) => b.modified.localeCompare(a.modified))
  } catch {
    return []
  }
}

function writeIndex(list: LibraryEntry[]) {
  try {
    durable.set(INDEX_KEY, JSON.stringify(list.slice(0, 50)))
  } catch {
    // Storage full: the list is not updated.
  }
}

/** Updates the index entry of a document (title, time). */
export function touchDocument(entry: LibraryEntry) {
  writeIndex([entry, ...listDocuments().filter((e) => e.id !== entry.id)])
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
  writeIndex(listDocuments().filter((e) => e.id !== id))
}
