import type { Presentation } from '../model/types'
import { STORAGE_KEY } from '../brand'

export type Saved = { title: string; pres: Presentation; savedAt: string }

const DB = 'kontor-slides'
const STORE = 'docs'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbSet(value: Saved) {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, 'current')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function idbGet(): Promise<Saved | null> {
  const db = await openDb()
  const value = await new Promise<Saved | null>((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get('current')
    req.onsuccess = () => resolve((req.result as Saved) ?? null)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return value
}

/** Saves to localStorage, falling back to IndexedDB when pictures exceed the quota. */
export async function saveLocal(title: string, pres: Presentation): Promise<'local' | 'idb'> {
  const value: Saved = { title, pres, savedAt: new Date().toISOString() }
  const json = JSON.stringify(value)
  try {
    localStorage.setItem(STORAGE_KEY, json)
    return 'local'
  } catch {
    await idbSet(value)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ where: 'idb', savedAt: value.savedAt }))
    return 'idb'
  }
}

export async function loadLocal(): Promise<Saved | null> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed.where === 'idb') return await idbGet()
    return parsed.pres ? (parsed as Saved) : null
  } catch {
    return null
  }
}

export async function clearLocal() {
  localStorage.removeItem(STORAGE_KEY)
  try {
    const db = await openDb()
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete('current')
    db.close()
  } catch {
    // Nothing stored.
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function safeFilename(title: string) {
  return title.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Presentation'
}

// ---------- Recent presentations (File > Open / Home) ----------

export type RecentEntry = { id: string; title: string; openedAt: string; slides: number }
const RECENT_KEY = 'kontor-slides:recent'
const RECENT_MAX = 12

export function listRecent(): RecentEntry[] {
  try {
    return (JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as RecentEntry[]).slice(0, RECENT_MAX)
  } catch {
    return []
  }
}

async function idbPut(key: string, value: unknown) {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

/** Remembers a presentation that was opened or saved, with a copy to reopen it from the list. */
export async function addRecent(title: string, pres: Presentation) {
  const id = `recent:${title.trim().toLowerCase() || 'untitled'}`
  try {
    await idbPut(id, { title, pres, savedAt: new Date().toISOString() } satisfies Saved)
    const list = [{ id, title, openedAt: new Date().toISOString(), slides: pres.slides.length }, ...listRecent().filter((r) => r.id !== id)].slice(0, RECENT_MAX)
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
    window.dispatchEvent(new Event('kontor:recent'))
  } catch {
    // The list is a convenience; ignore storage errors.
  }
}

export async function loadRecent(id: string): Promise<Saved | null> {
  const db = await openDb()
  const value = await new Promise<Saved | null>((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id)
    req.onsuccess = () => resolve((req.result as Saved) ?? null)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return value
}

export async function removeRecent(id: string) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(listRecent().filter((r) => r.id !== id)))
  window.dispatchEvent(new Event('kontor:recent'))
  try {
    const db = await openDb()
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id)
    db.close()
  } catch {
    // Already gone.
  }
}
