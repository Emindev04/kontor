// Recent workbooks: names and dates in localStorage, a copy of each workbook in IndexedDB so the
// File > Open list can reopen it (browsers cannot reopen a file from its path).
import type { JWorkbook } from './json'

const KEY = 'kontor-sheets:recent-files'
const DB = 'kontor-sheets'
const STORE = 'recent'

export type RecentFile = { id: string; name: string; date: string }

export function recentFiles(): RecentFile[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function noteRecent(name: string, book: JWorkbook) {
  const id = name.toLowerCase()
  const list = [{ id, name, date: new Date().toISOString() }, ...recentFiles().filter((f) => f.id !== id)].slice(0, 12)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
    const db = await open()
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(book, id)
    // forget copies that dropped off the list
    const keys = tx.objectStore(STORE).getAllKeys()
    keys.onsuccess = () => {
      for (const k of keys.result) if (!list.some((f) => f.id === k)) tx.objectStore(STORE).delete(k)
    }
  } catch {
    // storage unavailable: the list just stays shorter
  }
}

export async function loadRecent(id: string): Promise<JWorkbook | null> {
  try {
    const db = await open()
    return await new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(id)
      req.onsuccess = () => resolve((req.result as JWorkbook) ?? null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}
