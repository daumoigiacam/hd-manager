const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hdDesktop', {
  isDesktop: true,
  platform: process.platform,
  getMachineId: () => ipcRenderer.invoke('hd-desktop:get-machine-id'),
  checkPcPermissions: () => ipcRenderer.invoke('hd-desktop:check-pc-permissions'),
  openExternal: (url) => ipcRenderer.invoke('hd-desktop:open-external', url),
  readClipboardText: () => ipcRenderer.invoke('hd-desktop:read-clipboard-text'),
  writeClipboardText: (text) => ipcRenderer.invoke('hd-desktop:write-clipboard-text', text),
  sendZaloMessage: (payload) => ipcRenderer.invoke('hd-desktop:send-zalo-message', payload)
});
