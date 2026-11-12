// Bridge between the desktop shell and the web app (window.kontorDesktop, used by src/io/fileAccess.ts).
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('kontorDesktop', {
  platform: process.platform,
  openFile: (filters) => ipcRenderer.invoke('kontor:open-dialog', filters),
  saveFile: (options) => ipcRenderer.invoke('kontor:save', options),
  onOpenFile: (callback) => {
    ipcRenderer.on('kontor:open-file', (_event, file) => callback(file))
    ipcRenderer.send('kontor:ready')
  },
  storage: {
    get: (key) => ipcRenderer.sendSync('kontor:store-get', key),
    set: (key, value) => ipcRenderer.send('kontor:store-set', key, value),
    remove: (key) => ipcRenderer.send('kontor:store-remove', key),
  },
})
