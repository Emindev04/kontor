// Desktop shell: runs the web app in its own window and gives it real files on disk.
// This file is the same in every program folder; only ./config.cjs differs.
const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const config = require('./config.cjs')

const DIST = path.join(__dirname, '..', 'dist')
const DEV_URL = process.env.KONTOR_DEV_URL
const SCHEME = 'kontor'
const ORIGIN = `${SCHEME}://${config.id}`

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
])

/** @type {BrowserWindow | null} */
let win = null
let rendererReady = false
/** Files the system asked us to open before the window could take them. */
const pending = []

const isDocument = (file) => config.extensions.includes(path.extname(file).slice(1).toLowerCase())

function readForRenderer(file) {
  return { path: file, name: path.basename(file), data: fs.readFileSync(file) }
}

function queueOpen(file) {
  if (!file || !isDocument(file) || !fs.existsSync(file)) return
  pending.push(file)
  if (app.isReady() && !win) createWindow()
  else flush()
}

function flush() {
  if (!win || !rendererReady) return
  while (pending.length) {
    const file = pending.shift()
    try {
      win.webContents.send('kontor:open-file', readForRenderer(file))
      app.addRecentDocument(file)
    } catch (error) {
      dialog.showErrorBox(config.name, `The file could not be opened.\n\n${error.message}`)
    }
  }
  if (win.isMinimized()) win.restore()
  win.focus()
}

// ---------- AutoSave store: one file per key in the user data folder ----------

const storeDir = () => path.join(app.getPath('userData'), 'autosave')
const storeFile = (key) => path.join(storeDir(), `${String(key).replace(/[^a-zA-Z0-9._-]/g, '_')}.json`)

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, data)
  fs.renameSync(tmp, file)
}

ipcMain.on('kontor:store-get', (event, key) => {
  try {
    event.returnValue = fs.readFileSync(storeFile(key), 'utf8')
  } catch {
    event.returnValue = null
  }
})
ipcMain.on('kontor:store-set', (_event, key, value) => {
  try {
    writeAtomic(storeFile(key), String(value))
  } catch (error) {
    console.error('AutoSave failed', error)
  }
})
ipcMain.on('kontor:store-remove', (_event, key) => {
  fs.rmSync(storeFile(key), { force: true })
})

// ---------- Open and save dialogs ----------

ipcMain.handle('kontor:open-dialog', async (_event, filters) => {
  const result = await dialog.showOpenDialog(win, { properties: ['openFile'], filters })
  if (result.canceled || !result.filePaths[0]) return null
  app.addRecentDocument(result.filePaths[0])
  return readForRenderer(result.filePaths[0])
})

ipcMain.handle('kontor:save', async (_event, { path: target, defaultName, filters, data }) => {
  let file = target
  if (!file) {
    const result = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), defaultName), filters })
    if (result.canceled || !result.filePath) return null
    file = result.filePath
  }
  writeAtomic(file, Buffer.from(data))
  app.addRecentDocument(file)
  return { path: file, name: path.basename(file) }
})

// ---------- PDF export ----------

const PDF_PAPER = { letter: 'Letter', legal: 'Legal', tabloid: 'Tabloid', a4: 'A4', a3: 'A3' }

ipcMain.handle('kontor:print-pdf', async (_event, { html, landscape, paper, margins }) => {
  const file = path.join(app.getPath('temp'), `kontor-print-${process.pid}-${Date.now()}.html`)
  fs.writeFileSync(file, html, 'utf8')
  const page = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
  try {
    await page.loadFile(file)
    return await page.webContents.printToPDF({
      landscape: !!landscape,
      pageSize: PDF_PAPER[paper] || 'Letter',
      printBackground: true,
      margins: { top: margins?.top ?? 0.75, bottom: margins?.bottom ?? 0.75, left: margins?.left ?? 0.7, right: margins?.right ?? 0.7 },
    })
  } finally {
    page.destroy()
    fs.rmSync(file, { force: true })
  }
})

ipcMain.on('kontor:ready', () => {
  rendererReady = true
  flush()
})

// ---------- Window ----------

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 720,
    minHeight: 480,
    title: config.name,
    backgroundColor: '#f3f3f3',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
    },
  })
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    win = null
    rendererReady = false
  })

  // Links open in the normal browser; the app itself never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(ORIGIN) && !(DEV_URL && url.startsWith(DEV_URL))) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    }
  })

  win.loadURL(DEV_URL || `${ORIGIN}/index.html`)
}

function buildMenu() {
  if (process.platform !== 'darwin') {
    // The program has its own ribbon; Windows and Linux need no menu bar.
    Menu.setApplicationMenu(null)
    return
  }
  // Only standard entries: the program's own shortcuts (Cmd+S, Cmd+B, …) reach the page.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      {
        label: 'Edit',
        submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
      },
      {
        label: 'View',
        submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, ...(DEV_URL ? [{ role: 'toggleDevTools' }] : [])],
      },
      { role: 'windowMenu' },
      {
        role: 'help',
        submenu: [{ label: 'Website', click: () => shell.openExternal(config.website) }],
      },
    ]),
  )
}

// ---------- App lifecycle ----------

// macOS hands over files with this event, also before the app is ready.
app.on('open-file', (event, file) => {
  event.preventDefault()
  queueOpen(file)
})

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    argv.slice(1).forEach(queueOpen)
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    protocol.handle(SCHEME, (request) => {
      const url = new URL(request.url)
      let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)))
      if (!file.startsWith(DIST)) return new Response('Not found', { status: 404 })
      if (!path.extname(file)) file = path.join(DIST, 'index.html')
      return net.fetch(pathToFileURL(file).toString())
    })
    buildMenu()
    // Windows and Linux pass files as arguments.
    if (process.platform !== 'darwin') process.argv.slice(app.isPackaged ? 1 : 2).forEach(queueOpen)
    createWindow()
    app.on('activate', () => {
      if (!win) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
