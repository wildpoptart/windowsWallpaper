const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getWallpaper: () => ipcRenderer.invoke('get-wallpaper'),
    setWallpaper: (path, monitorDevice) => ipcRenderer.invoke('set-wallpaper', path, monitorDevice),
    getMonitors: () => ipcRenderer.invoke('get-monitors'),
    selectWallpaper: () => ipcRenderer.invoke('select-wallpaper'),
    getTransImages: () => ipcRenderer.invoke('get-trans-images'),
    createTranscodedImageFiles: (transcodedFiles) => ipcRenderer.invoke('create-transcoded-image-files', transcodedFiles),
    updateWallpaperForMonitor: (monitorWallpapers, monitorIndex, newWallpaperPath) => ipcRenderer.invoke('update-wallpaper-for-monitor', monitorWallpapers, monitorIndex, newWallpaperPath)
    });
