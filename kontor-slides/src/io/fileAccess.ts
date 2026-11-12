// Real files on disk and a durable AutoSave store.
//
// Opening and saving work in three environments:
// - the desktop app: its preload script exposes `window.kontorDesktop` (native dialogs, writes to the path);
// - Chromium browsers: the File System Access API (save writes back into the same file);
// - other browsers: a file input to open and a download to save.
//
// "Save" writes back into the file that was opened or saved last, as long as that file has the
// program's main format (for example .docx). Otherwise it asks where to save, like Save As.
//
// This file is copied unchanged into every program folder so the folders stay independent.

export type FileType = { description: string; extensions: string[]; mime: string }
export type SaveResult = 'saved' | 'downloaded' | 'cancelled'

type DesktopFile = { path: string; name: string; data: Uint8Array }
type DesktopBridge = {
  platform: string
  openFile(filters: { name: string; extensions: string[] }[]): Promise<DesktopFile | null>
  saveFile(options: { path?: string; defaultName: string; filters: { name: string; extensions: string[] }[]; data: Uint8Array }): Promise<{ path: string; name: string } | null>
  onOpenFile(callback: (file: DesktopFile) => void): void
  storage: { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void }
}

type PickerHandle = {
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>
}
type PickerWindow = Window & {
  showOpenFilePicker?: (options: unknown) => Promise<PickerHandle[]>
  showSaveFilePicker?: (options: unknown) => Promise<PickerHandle>
}

export const desktop: DesktopBridge | null = (globalThis as { kontorDesktop?: DesktopBridge }).kontorDesktop ?? null
const picker = globalThis as unknown as PickerWindow

type Target = { kind: 'desktop'; path: string; name: string } | { kind: 'handle'; handle: PickerHandle; name: string }
let target: Target | null = null

const extOf = (name: string) => (/\.([^.]+)$/.exec(name)?.[1] ?? '').toLowerCase()
const isAbort = (e: unknown) => (e as { name?: string })?.name === 'AbortError'

/** Name of the file that Save writes to, or null when Save will ask where to save. */
export function currentFileName(): string | null {
  return target?.name ?? null
}

/** Called for a new or reopened document: the next Save asks where to save. */
export function forgetFile() {
  target = null
}

/**
 * Lets the user pick a file. `mainExtension` is the program's own format: when the picked file has
 * it, later saves write back into that file.
 */
export async function openFilePicker(types: FileType[], mainExtension: string): Promise<File | null> {
  const extensions = types.flatMap((t) => t.extensions)
  if (desktop) {
    const picked = await desktop.openFile([{ name: 'Documents', extensions }, ...types.map((t) => ({ name: t.description, extensions: t.extensions }))])
    if (!picked) return null
    target = extOf(picked.name) === mainExtension ? { kind: 'desktop', path: picked.path, name: picked.name } : null
    return new File([picked.data as BlobPart], picked.name)
  }
  if (picker.showOpenFilePicker) {
    try {
      const [handle] = await picker.showOpenFilePicker({
        multiple: false,
        excludeAcceptAllOption: false,
        types: types.map((t) => ({ description: t.description, accept: { [t.mime]: t.extensions.map((e) => `.${e}`) } })),
      })
      const file = await handle.getFile()
      target = extOf(file.name) === mainExtension ? { kind: 'handle', handle, name: file.name } : null
      return file
    } catch (e) {
      if (isAbort(e)) return null
      // Fall through to the plain file input (for example inside a sandboxed frame).
    }
  }
  const file = await inputPick(extensions.map((e) => `.${e}`).join(','))
  if (file) target = null
  return file
}

function inputPick(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}

/**
 * Saves `blob`. With `saveAs` (or when there is no file yet) the user picks the place; otherwise it
 * writes back into the current file. `remember` makes the picked file the target of later saves.
 */
export async function saveFile(blob: Blob, suggestedName: string, type: FileType, options: { saveAs?: boolean; remember?: boolean } = {}): Promise<SaveResult> {
  const remember = options.remember ?? true
  const reuse = !options.saveAs && target && extOf(target.name) === type.extensions[0]
  if (desktop) {
    const data = new Uint8Array(await blob.arrayBuffer())
    const path = reuse && target?.kind === 'desktop' ? target.path : undefined
    const saved = await desktop.saveFile({ path, defaultName: suggestedName, filters: [{ name: type.description, extensions: type.extensions }], data })
    if (!saved) return 'cancelled'
    if (remember) target = { kind: 'desktop', path: saved.path, name: saved.name }
    return 'saved'
  }
  if (reuse && target?.kind === 'handle') {
    try {
      await writeHandle(target.handle, blob)
      return 'saved'
    } catch (e) {
      if (isAbort(e)) return 'cancelled'
      // Permission was withdrawn or the file moved: ask again below.
    }
  }
  if (picker.showSaveFilePicker) {
    try {
      const handle = await picker.showSaveFilePicker({
        suggestedName,
        types: [{ description: type.description, accept: { [type.mime]: type.extensions.map((e) => `.${e}`) } }],
      })
      await writeHandle(handle, blob)
      if (remember) target = { kind: 'handle', handle, name: handle.name }
      return 'saved'
    } catch (e) {
      if (isAbort(e)) return 'cancelled'
    }
  }
  download(blob, suggestedName)
  return 'downloaded'
}

async function writeHandle(handle: PickerHandle, blob: Blob) {
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/**
 * Files the operating system hands to the desktop app (double-click on a document, "Open With",
 * dropping it on the app icon). Does nothing in the browser.
 */
let systemOpenRegistered = false
export function onSystemOpenFile(mainExtension: string, open: (file: File) => void) {
  if (!desktop || systemOpenRegistered) return
  systemOpenRegistered = true
  desktop.onOpenFile((picked) => {
    target = extOf(picked.name) === mainExtension ? { kind: 'desktop', path: picked.path, name: picked.name } : null
    open(new File([picked.data as BlobPart], picked.name))
  })
}

// ---------- AutoSave store ----------
// The desktop app keeps AutoSave data in files (no size limit). The browser uses localStorage and
// moves to IndexedDB when localStorage is full, for example with large pictures.

const IDB_NAME = 'kontor-autosave'
const IDB_STORE = 'docs'
const IDB_MARK = '{"kontorIdb":true}'

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbRun<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await idb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, mode)
      const req = run(tx.objectStore(IDB_STORE))
      tx.oncomplete = () => resolve(req.result as T)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/** Stores AutoSave data. Throws when no storage could take it. */
export async function storeAutosave(key: string, json: string): Promise<void> {
  if (desktop) {
    desktop.storage.set(key, json)
    return
  }
  try {
    localStorage.setItem(key, json)
    return
  } catch {
    // localStorage is full: use IndexedDB.
  }
  await idbRun('readwrite', (s) => s.put(json, key))
  localStorage.setItem(key, IDB_MARK)
}

/**
 * Reads AutoSave data synchronously. Returns `undefined` when the data lives in IndexedDB and has to
 * be read with `loadAutosaveAsync`.
 */
export function loadAutosaveSync(key: string): string | null | undefined {
  try {
    if (desktop) {
      const value = desktop.storage.get(key)
      if (value != null) return value
      // First start of the desktop app: nothing on disk yet.
      return null
    }
    const raw = localStorage.getItem(key)
    return raw === IDB_MARK ? undefined : raw
  } catch {
    return null
  }
}

export async function loadAutosaveAsync(key: string): Promise<string | null> {
  const sync = loadAutosaveSync(key)
  if (sync !== undefined) return sync
  try {
    return (await idbRun<string | undefined>('readonly', (s) => s.get(key))) ?? null
  } catch {
    return null
  }
}

export function removeAutosave(key: string) {
  try {
    if (desktop) desktop.storage.remove(key)
    else localStorage.removeItem(key)
  } catch {
    // Nothing stored.
  }
  if (!desktop) void idbRun('readwrite', (s) => s.delete(key)).catch(() => undefined)
}

/** A small key-value store for data that must survive (document copies, lists): files on desktop, localStorage in the browser. */
export const durable = {
  get(key: string): string | null {
    try {
      return desktop ? desktop.storage.get(key) : localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string) {
    if (desktop) desktop.storage.set(key, value)
    else localStorage.setItem(key, value)
  },
  remove(key: string) {
    try {
      if (desktop) desktop.storage.remove(key)
      else localStorage.removeItem(key)
    } catch {
      // Nothing stored.
    }
  },
}
