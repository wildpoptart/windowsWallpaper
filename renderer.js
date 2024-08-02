document.addEventListener('DOMContentLoaded', async () => {
    let monitorWallpapers = [];

    const MAX_CANVAS_WIDTH = 600;  // Define the maximum width for scaling
    const MAX_CANVAS_HEIGHT = 800;  // Define the maximum height for scaling
    const PADDING = 20;  // Define padding around each image

    function mapWorkAreaPositions(monitors) {
        let minX = Infinity;
        let minY = Infinity;
    
        // Find the minimum x and y values
        monitors.forEach(monitor => {
            if (monitor.workArea.left < minX) {
                minX = monitor.workArea.left;
            }
            if (monitor.workArea.top < minY) {
                minY = monitor.workArea.top;
            }
        });
    
        // Adjust the work area positions
        return monitors.map(monitor => {
            const adjustedWorkArea = {
                left: monitor.workArea.left - minX,
                top: monitor.workArea.top - minY,
                right: monitor.workArea.right - minX,
                bottom: monitor.workArea.bottom - minY
            };
            const workAreaWidth = adjustedWorkArea.right - adjustedWorkArea.left;
            const workAreaHeight = adjustedWorkArea.bottom - adjustedWorkArea.top;
    
            return {
                ...monitor,
                adjustedWorkArea,
                workAreaWidth,
                workAreaHeight
            };
        });
    }

    function createImageElement(imagePath, altText, monitor, totalWidth, totalHeight, displayWidth, displayHeight) {
        const uniqueParam = new Date().getTime(); // Generate a unique timestamp
        const imageUrl = imagePath.startsWith('file://') ? imagePath : `file://${imagePath}?${uniqueParam}`;
    
        const imageElement = document.createElement('img');
        imageElement.src = imageUrl;
        imageElement.alt = altText;
    
        // Set image styles to clip and position correctly within its container
        imageElement.style.width = `${totalWidth}px`; // Use the total width of the composite image
        imageElement.style.height = `${totalHeight}px`; // Use the total height of the composite image
    
        return imageElement;
    }
    
    // Function to populate monitorWallpapers array with monitor objects
    async function populateMonitorWallpapers() {
        try {
            const monitors = await window.electronAPI.getMonitors();
            monitorWallpapers = monitors.map(monitor => ({ wallpaperPath: '', ...monitor }));
        } catch (error) {
            console.error('Error populating monitorWallpapers:', error);
        }
    }
    await populateMonitorWallpapers();

    async function createTranscodedImageFiles(transcodedFiles) {
        const pngFiles = await window.electronAPI.createTranscodedImageFiles(transcodedFiles);
        return pngFiles;
    }

    async function displayCurrentWallpaper() {
        try {
            const monitorContainer = document.getElementById('monitorContainer');
            monitorContainer.innerHTML = ''; // Clear previous content
            monitorContainer.style.position = 'relative'; // Contain absolutely positioned children

            const canvas = document.createElement('canvas');
            canvas.style.display='none'
            canvas.classList.add('canvas')
            monitorContainer.appendChild(canvas)
            const monitorCanvas = document.querySelector('.canvas');
            const ctx = monitorCanvas.getContext("2d");

            const transcodedImages = await window.electronAPI.getTransImages();
            const transcodedImageFiles = await createTranscodedImageFiles(transcodedImages);

            const monitors = await window.electronAPI.getMonitors();

            // Adjust monitor positions
            const adjustedMonitors = mapWorkAreaPositions(monitors);

            // let totalWidth = 0;
            // let totalHeight = 0;

            // adjustedMonitors.forEach(monitor => {
            //     totalWidth = Math.max(totalWidth, monitor.adjustedWorkArea.right - PADDING);
            //     totalHeight = Math.max(totalHeight, monitor.adjustedWorkArea.bottom - PADDING);
            // });

            // // Calculate scale factors to fit within the maximum dimensions
            // const scaleX = (MAX_CANVAS_WIDTH + PADDING * adjustedMonitors.length) / totalWidth;
            // const scaleY = (MAX_CANVAS_HEIGHT + PADDING * adjustedMonitors.length) / totalHeight;
            // const scale = Math.min(scaleX, scaleY);

            // const scaledWidth = totalWidth * scale;
            // const scaledHeight = totalHeight * scale;

            // monitorCanvas.width = scaledWidth;
            // monitorCanvas.height = scaledHeight;
            // monitorCanvas.style.border = '5px solid black';

            // ctx.scale(scale, scale); // Apply scaling to the context
            // ctx.clearRect(0, 0, monitorCanvas.width / scale, monitorCanvas.height / scale);

            for (const [index, monitor] of adjustedMonitors.entries()) {
                let totalWidth = 0;
                let totalHeight = 0;

                const currentWallpaper = await window.electronAPI.getWallpaper(monitor.device);
                const monitorDiv = createMonitorDiv(index, monitor, currentWallpaper, transcodedImageFiles, totalWidth, totalHeight);

                const monitorCanvas = document.createElement('canvas');
               
                // const monitorCanvas = document.querySelector('.canvas');
                const ctx = monitorCanvas.getContext("2d");

                totalWidth = Math.max(totalWidth, monitor.adjustedWorkArea.right);
                totalHeight = Math.max(totalHeight, monitor.adjustedWorkArea.bottom);

                // Calculate scale factors to fit within the maximum dimensions
                const scaleX = (parseFloat(monitorDiv.querySelector('.monitor').style.width)) / totalWidth;
                const scaleY = (parseFloat(monitorDiv.querySelector('.monitor').style.height)) / totalHeight;
                const scale = Math.min(scaleX, scaleY);

                console.log(scale, scaleX, scaleY)

                const scaledWidth = totalWidth * scale;
                const scaledHeight = totalHeight * scale;

                monitorCanvas.width = scaledWidth;
                monitorCanvas.height = scaledHeight;

                ctx.scale(scale, scale); // Apply scaling to the context
                // ctx.clearRect(0, 0, monitorCanvas.width / scale, monitorCanvas.height / scale);

                let dataURL;
                const imgElement = document.createElement('img');

                const img = new Image();
                img.src = currentWallpaper;

                const workArea = monitor.adjustedWorkArea;
                console.log(
                    monitor.workArea.left - Math.min(...monitors.map(m => m.workArea.left)), 
                    monitor.workArea.top - Math.min(...monitors.map(m => m.workArea.top)), 
                    workArea.right - workArea.left, 
                    workArea.bottom - workArea.top, 
                    workArea.left, 
                    workArea.top, 
                    workArea.right - workArea.left,
                    workArea.bottom - workArea.top  
                )

                img.onload = () => {
                    ctx.drawImage(
                        img,
                        monitor.workArea.left - Math.min(...monitors.map(m => m.workArea.left)), // Source x
                        monitor.workArea.top - Math.min(...monitors.map(m => m.workArea.top)), // Source y
                        workArea.right - workArea.left, // Source width
                        workArea.bottom - workArea.top, // Source height
                        0, // Destination x with padding
                        0, // Destination y with padding
                        workArea.right - workArea.left, // Destination width with padding
                        workArea.bottom - workArea.top  // Destination height with padding
                    );

                    dataURL = monitorCanvas.toDataURL();
                    imgElement.src = dataURL;
                    // monitorDiv.querySelector('.monitor').removeChild(monitorDiv.querySelector('.monitor').children[0])
                    monitorDiv.querySelector('.monitor').appendChild(imgElement)
                    monitorContainer.appendChild(monitorDiv);

                };

                // Append the button below the image
                // const setWallpaperButton = createSetWallpaperButton(index);
                // const buttonWrapper = document.createElement('div');
                // buttonWrapper.style.position = 'absolute';
                // buttonWrapper.style.left = `${workArea.left + PADDING}px`;
                // buttonWrapper.style.top = `${workArea.bottom + PADDING}px`;
                // buttonWrapper.appendChild(setWallpaperButton);
                // monitorContainer.appendChild(buttonWrapper);
                console.log(monitorDiv.querySelector('.monitor'))
                // monitorDiv.querySelector('.monitor').appendChild(imgElement)
                // monitorDiv.querySelector('.monitor').removeChild(monitorDiv.querySelector('.monitor').children[0])
                
                // monitorContainer.appendChild(monitorDiv);
            }
        } catch (error) {
            console.error('Error displaying current wallpaper:', error);
        }
    }

    function createMonitorDiv(index, monitor, currentWallpaper, transcodedFiles, totalWidth, totalHeight) {
        const monitorDiv = document.createElement('div');
        monitorDiv.classList.add('monitor-container');

        const monitorTitle = document.createElement('h2');
        monitorTitle.textContent = `Monitor ${index + 1}`;
        monitorDiv.appendChild(monitorTitle);

        const monitorPrimary = document.createElement('p');
        if (monitor.isPrimary) {
            monitorPrimary.textContent = `Primary`;
            monitorDiv.appendChild(monitorPrimary);
        }

        const monitorContent = document.createElement('div');
        monitorContent.classList.add('monitor');
        monitorContent.style.position = 'relative';
        monitorContent.style.border = '5px solid black';

        const width = monitor.coordinates.right - monitor.coordinates.left;
        const height = monitor.coordinates.bottom - monitor.coordinates.top;
        monitorContent.style.width = `${width / 10}px`; // Scale down for display
        monitorContent.style.height = `${height / 10}px`; // Scale down for display

        if (transcodedFiles.length > 0) {
            // Add Transcoded_xxx files
            transcodedFiles.forEach(fileName => {
                const transcodedImage = createImageElement(fileName, 'Transcoded Image', monitor, totalWidth, totalHeight);
                // monitorContent.appendChild(transcodedImage);
            });
        } else {
            const wallpaperImage = createImageElement(currentWallpaper, `Current Wallpaper for ${monitor.device}`, monitor, totalWidth, totalHeight);
            // monitorContent.appendChild(wallpaperImage);
        }

        monitorDiv.appendChild(monitorContent);



        const setWallpaperButton = createSetWallpaperButton(index);
        monitorDiv.appendChild(setWallpaperButton);

        return monitorDiv;
    }

    function createSetWallpaperButton(index) {
        const setWallpaperButton = document.createElement('button');
        setWallpaperButton.textContent = 'Set New Wallpaper';
        setWallpaperButton.style.marginTop = '10px';
        setWallpaperButton.addEventListener('click', async () => {
            const newWallpaperPath = await window.electronAPI.selectWallpaper();
            if (newWallpaperPath) {
                console.log(`Updating wallpaper for monitor ${index} with new path: ${newWallpaperPath}`);
                console.log(newWallpaperPath)
                monitorWallpapers[index].wallpaperPath = newWallpaperPath; // Update the local array
                await window.electronAPI.updateWallpaperForMonitor(monitorWallpapers, index, newWallpaperPath);
                await displayCurrentWallpaper(); // Refresh the UI
            }
        });
        return setWallpaperButton;
    }

    // Add refresh button and logic
    const refreshButton = document.createElement('button');
    refreshButton.textContent = 'Refresh Monitors';
    refreshButton.addEventListener('click', async () => {
        console.log('Refreshing monitors...');
        await displayCurrentWallpaper();
    });

    document.body.insertBefore(refreshButton, document.body.firstChild);

    await displayCurrentWallpaper();
});
