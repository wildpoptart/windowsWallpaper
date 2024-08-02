const ffi = require('ffi-napi');
const ref = require('ref-napi');
const Struct = require('ref-struct-napi');
const ArrayType = require('ref-array-napi');

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const user32 = ffi.Library('user32', {
    'EnumDisplayMonitors': ['bool', ['void*', 'void*', 'pointer', 'void*']],
    'GetMonitorInfoW': ['bool', ['void*', 'pointer']],
    'SystemParametersInfoW': ['bool', ['uint', 'uint', 'pointer', 'uint']]
});

const rect = Struct({
    left: 'long',
    top: 'long',
    right: 'long',
    bottom: 'long'
});

const WideCharArray = ArrayType('ushort', 32);
const MONITORINFOEX = Struct({
    cbSize: 'uint',
    rcMonitor: rect,
    rcWork: rect,
    dwFlags: 'uint',
    szDevice: WideCharArray
});

const MAX_PATH = 260;
const SPI_GETDESKWALLPAPER = 0x0073;
const SPI_SETDESKWALLPAPER = 0x0014;

let themesDirectory = ''

function getCurrentWallpaper() {
    const wallpaperBuffer = Buffer.alloc(MAX_PATH * 2);
    user32.SystemParametersInfoW(SPI_GETDESKWALLPAPER, MAX_PATH, wallpaperBuffer, 0);
    const wallpaperPath = wallpaperBuffer.toString('ucs2').replace(/\0/g, '');
    return wallpaperPath;
}

function setCurrentWallpaper(wallpaperPath) {
    const wallpaperBuffer = Buffer.from(wallpaperPath + '\0', 'ucs2');
    user32.SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, wallpaperBuffer, 0);
    execSync(`REG ADD "HKCU\\Control Panel\\Desktop" /v WallpaperStyle /t REG_SZ /d 22 /f`);
    execSync(`REG ADD "HKCU\\Control Panel\\Desktop" /v TileWallpaper /t REG_SZ /d 0 /f`);
    // execSync(`SystemParametersInfoW`, [20, 0, wallpaperBuffer, 2]);
}

function getMonitorInfo(hMonitor) {
    const mi = new MONITORINFOEX();
    mi.cbSize = MONITORINFOEX.size;
    if (user32.GetMonitorInfoW(hMonitor, mi.ref())) {
        const deviceNameBuffer = ref.reinterpretUntilZeros(mi.szDevice.buffer, 2);
        const deviceName = deviceNameBuffer.toString('ucs2');
        const uniqueId = deviceName.trim(); // Use the device name as a unique identifier
        return {
            uniqueId,
            coordinates: {
                left: mi.rcMonitor.left,
                top: mi.rcMonitor.top,
                right: mi.rcMonitor.right,
                bottom: mi.rcMonitor.bottom
            },
            workArea: {
                left: mi.rcWork.left,
                top: mi.rcWork.top,
                right: mi.rcWork.right,
                bottom: mi.rcWork.bottom
            },
            isPrimary: !!(mi.dwFlags & 1),
            position: {
                x: mi.rcMonitor.left,
                y: mi.rcMonitor.top
            }
        };
    }
    return null;
}

function getMonitorDetailsFromPowerShell() {
    const command = 'Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorBasicDisplayParams | Select-Object InstanceName, ManufacturerName, ProductCodeID, SerialNumberID';
    const output = execSync(`powershell -Command "${command}"`, { encoding: 'utf8' });
    const lines = output.trim().split('\n');
    const headers = lines[0].trim().split(/\s+/);
    const data = lines.slice(1).map(line => {
        const values = line.trim().split(/\s+/);
        return headers.reduce((obj, header, index) => {
            obj[header] = values[index];
            return obj;
        }, {});
    });
    return data;
}

function getMonitors() {
    const monitors = [];
    const MonitorEnumProc = ffi.Callback('bool', ['void*', 'void*', 'pointer', 'void*'], (hMonitor, hdcMonitor, lprcMonitor, dwData) => {
        const monitorInfo = getMonitorInfo(hMonitor);
        if (monitorInfo) monitors.push(monitorInfo);
        return true;
    });
    user32.EnumDisplayMonitors(ref.NULL, ref.NULL, MonitorEnumProc, ref.NULL);

    // Get additional details from PowerShell
    const additionalDetails = getMonitorDetailsFromPowerShell();

    // Combine the details
    for (const monitor of monitors) {
        const details = additionalDetails.find(detail => detail.InstanceName.includes(monitor.uniqueId));
        if (details) {
            monitor.details = {
                manufacturer: details.ManufacturerName,
                productCode: details.ProductCodeID,
                serialNumber: details.SerialNumberID
            };
        }
    }

    return monitors;
}

async function getTranscodedImages(app) {
    const userDataPath = app.getPath('userData');
    themesDirectory = path.join(userDataPath, '..', 'Microsoft', 'Windows', 'Themes');
    const transcodedFiles = await fs.promises.readdir(themesDirectory);

    const compositeExists = transcodedFiles.includes('final_composite_wallpaper.png');
    // Filter files with underscores
    if (compositeExists) {
        return ['final_composite_wallpaper.png'];
    } else {
        // If final_composite_wallpaper does not exist, proceed as before
        // Filter files with underscores
        const filteredFiles = transcodedFiles.filter(fileName => fileName.startsWith('Transcoded_') && !fileName.endsWith('.png'));
        // const fullPathFiles = filteredFiles.map(fileName => path.join(themesDirectory, fileName));
        return filteredFiles;
    }
}

async function createTranscodedImageFiles(transcodedFiles) {
    const pngFiles = [];
    try {
        for (const fileName of transcodedFiles) {
            console.log(fileName);
            let pngFileName = fileName;
            // Check if the file name already ends with ".png"
            if (!fileName.endsWith(".png")) {
                pngFileName += ".png"; // If not, append ".png"
            }
            const transcodedFilePath = path.join(themesDirectory, fileName);
            const pngFilePath = path.join(themesDirectory, pngFileName);

            // Check if the PNG file already exists
            try {
                await fs.promises.access(pngFilePath);
                console.log(`${pngFileName} already exists in ${themesDirectory}`);
                pngFiles.push(pngFilePath);
            } catch (error) {
                // If the file does not exist, create it
                console.log(`${pngFileName} does not exist. Creating...`);
                const imageData = await fs.promises.readFile(transcodedFilePath);
                await fs.promises.writeFile(pngFilePath, imageData);
                pngFiles.push(pngFilePath);
            }
        }
        return pngFiles;
    } catch (error) {
        console.error("Error creating transcoded image files:", error);
        return []; // Return an empty array if an error occurs
    }
}

async function stashCurrentWallpapers(tempCompositePath, monitorWallpapers, monitorIndex) {
    const stashedWallpapers = [];
    const minX = Math.min(...monitorWallpapers.map(mw => mw.coordinates.left));
    const minY = Math.min(...monitorWallpapers.map(mw => mw.coordinates.top));

    for (const [index, monitorWallpaper] of monitorWallpapers.entries()) {
        if (index !== monitorIndex) {
            const { coordinates } = monitorWallpaper;
            const width = coordinates.right - coordinates.left;
            const height = coordinates.bottom - coordinates.top;

            const croppedImageBuffer = await sharp(tempCompositePath)
                .extract({ left: coordinates.left - minX, top: coordinates.top - minY, width, height })
                .toBuffer();

            // Save the stashed wallpaper to a file
            const stashedWallpaperPath = path.join(themesDirectory, `stashed_wallpaper_${index}.png`);
            await sharp(croppedImageBuffer).toFile(stashedWallpaperPath);

            stashedWallpapers.push({
                index,
                path: stashedWallpaperPath,
                left: coordinates.left - minX,
                top: coordinates.top - minY,
            });
        }
    }
    return stashedWallpapers;
}

async function updateWallpaperForMonitor(monitorWallpapers, monitorIndex, newWallpaperPath) {
    try {
        const tempCompositePath = path.join(themesDirectory, 'temp_composite_wallpaper.png');
        const finalCompositePath = path.join(themesDirectory, 'final_composite_wallpaper.png');

        // Create the initial composite wallpaper to determine the dimensions
        await createCompositeWallpaper(monitorWallpapers, newWallpaperPath, tempCompositePath);

        // Get stashed wallpapers for all monitors except the current one
        const stashedWallpapers = await stashCurrentWallpapers(tempCompositePath, monitorWallpapers, monitorIndex);

        // Update the monitor wallpaper path
        monitorWallpapers[monitorIndex].wallpaperPath = newWallpaperPath;

        // Create the final composite wallpaper including the stashed images
        await createFinalCompositeWallpaper(monitorWallpapers, stashedWallpapers, finalCompositePath);

        // Set the final composite as the current wallpaper
        setCurrentWallpaper(finalCompositePath);
        console.log(`Composite wallpaper updated and set to: ${finalCompositePath}`);
    } catch (error) {
        console.error('Error in updateWallpaperForMonitor:', error);
    }
}

async function createCompositeWallpaper(monitorWallpapers, userSelectedImage, outputPath) {
    // Calculate composite dimensions based on all monitor work areas.
    let minX = Math.min(...monitorWallpapers.map(mw => mw.coordinates.left));
    let minY = Math.min(...monitorWallpapers.map(mw => mw.coordinates.top));
    let maxX = Math.max(...monitorWallpapers.map(mw => mw.coordinates.right));
    let maxY = Math.max(...monitorWallpapers.map(mw => mw.coordinates.bottom));

    const totalWidth = maxX - minX;
    const totalHeight = maxY - minY;

    // Create a base image for the composite with the calculated dimensions.
    let compositeImage = sharp({
        create: {
            width: totalWidth,
            height: totalHeight,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    });

    // Load the user-selected image and get its metadata.
    const userImageBuffer = await sharp(userSelectedImage).toBuffer();
    const userImageMetadata = await sharp(userImageBuffer).metadata();

    // Prepare to composite each monitor's image onto the base image.
    const compositeArray = [];
    for (const monitorWallpaper of monitorWallpapers) {
        const displayWidth = monitorWallpaper.workArea.right - monitorWallpaper.workArea.left;
        const displayHeight = monitorWallpaper.workArea.bottom - monitorWallpaper.workArea.top;

        const taskbarHeight = monitorWallpaper.coordinates.bottom - monitorWallpaper.workArea.bottom;

        // Ensure that resized image fits within the monitor's work area.
        const resizedImageBuffer = await sharp(userImageBuffer)
            .resize(displayWidth, displayHeight + taskbarHeight, { fit: 'cover' })  // Resize to exactly fit the display area
            .toBuffer();

        // Calculate the position of the monitor's image within the composite.
        const left = monitorWallpaper.workArea.left - minX;
        const top = monitorWallpaper.workArea.top - minY;

        // Add the resized image to the array for compositing.
        compositeArray.push({ input: resizedImageBuffer, left, top });
    }

    // Composite all resized images onto the base image.
    compositeImage = compositeImage.composite(compositeArray);

    // Save the final composite image.
    await compositeImage.toFile(outputPath);
    console.log('Composite wallpaper created at:', outputPath);
    return outputPath;
}

async function createFinalCompositeWallpaper(monitorWallpapers, stashedWallpapers, finalCompositePath) {
    // Calculate composite dimensions based on all monitor work areas.
    let minX = Math.min(...monitorWallpapers.map(mw => mw.coordinates.left));
    let minY = Math.min(...monitorWallpapers.map(mw => mw.coordinates.top));
    let maxX = Math.max(...monitorWallpapers.map(mw => mw.coordinates.right));
    let maxY = Math.max(...monitorWallpapers.map(mw => mw.coordinates.bottom));

    const totalWidth = maxX - minX;
    const totalHeight = maxY - minY;

    // Create a base image for the composite with the calculated dimensions.
    let compositeImage = sharp({
        create: {
            width: totalWidth,
            height: totalHeight,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    });

    // Prepare to composite each monitor's image onto the base image.
    const compositeArray = [];

    // Add stashed wallpapers for other monitors
    for (const stashed of stashedWallpapers) {
        const stashedImageBuffer = await sharp(stashed.path).toBuffer();
        compositeArray.push({ input: stashedImageBuffer, left: stashed.left, top: stashed.top });
    }

    // Add the newly selected wallpaper for the current monitor
    for (const monitorWallpaper of monitorWallpapers) {
        if (monitorWallpaper.wallpaperPath) {
            const displayWidth = monitorWallpaper.workArea.right - monitorWallpaper.workArea.left;
            const displayHeight = monitorWallpaper.workArea.bottom - monitorWallpaper.workArea.top;

            const taskbarHeight = monitorWallpaper.coordinates.bottom - monitorWallpaper.workArea.bottom;

            const resizedImageBuffer = await sharp(monitorWallpaper.wallpaperPath)
                .resize(displayWidth, displayHeight + taskbarHeight, { fit: 'cover' })
                .toBuffer();

            const left = monitorWallpaper.workArea.left - minX;
            const top = monitorWallpaper.workArea.top - minY;

            compositeArray.push({ input: resizedImageBuffer, left, top });
        }
    }

    // Composite all images onto the base image.
    compositeImage = compositeImage.composite(compositeArray);

    // Save the final composite image.
    await compositeImage.toFile(finalCompositePath);
    console.log('Final composite wallpaper created at:', finalCompositePath);
    return finalCompositePath;
}

module.exports = {
    getCurrentWallpaper,
    setCurrentWallpaper,
    getMonitors,
    getTranscodedImages,
    createTranscodedImageFiles,
    updateWallpaperForMonitor
};
