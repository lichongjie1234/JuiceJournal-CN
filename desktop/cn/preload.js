const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cnDesktop', {
  capture: () => ipcRenderer.invoke('cn:capture'),
  digits: images => ipcRenderer.invoke('cn:digits', images)
});
