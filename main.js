const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

const { getCurrentWallpaper, setCurrentWallpaper, getMonitors, getTranscodedImages, createTranscodedImageFiles, updateWallpaperForMonitor } = require('./windows-wallpaper');

let win;

function createWindow() {
    win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            enableRemoteModule: false
        }
    });

    win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.disableHardwareAcceleration()

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

ipcMain.handle('get-wallpaper', async () => {
    return getCurrentWallpaper();
});

ipcMain.handle('set-wallpaper', async (event, wallpaperPath, monitorDevice) => {
    console.log(`Setting wallpaper for ${monitorDevice}: ${wallpaperPath}`);
    setCurrentWallpaper(wallpaperPath, monitorDevice);
});

ipcMain.handle('set-composite-wallpaper', async (event, monitorWallpapers) => {
    // await setCompositeWallpaper(monitorWallpapers);
});

ipcMain.handle('get-monitors', async () => {
    return getMonitors();
});

ipcMain.handle('select-wallpaper', async () => {
    const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['jpg', 'png', 'bmp'] }]
    });
    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }
    return result.filePaths[0];
});

ipcMain.handle('update-wallpaper-for-monitor', async (event, monitorWallpapers, monitorIndex, newWallpaperPath) => {
    return updateWallpaperForMonitor(monitorWallpapers, monitorIndex, newWallpaperPath);
});

ipcMain.handle('get-trans-images', async () => {
    return getTranscodedImages(app)
});

ipcMain.handle('create-transcoded-image-files', async (event, transcodedFiles) => {
    console.log(transcodedFiles)
    try {
        const pngFiles = await createTranscodedImageFiles(transcodedFiles);
        return pngFiles;
    } catch (error) {
        console.error('Error creating transcoded image files:', error);
        return null;
    }
});