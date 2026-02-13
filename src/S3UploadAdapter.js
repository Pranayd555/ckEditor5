export default class S3UploadAdapter {
    constructor(loader, s3Client, bucketName) {
        this.loader = loader;
        this.s3Client = s3Client;
        this.bucketName = bucketName;
    }

    async upload() {
        try {
            const file = await this.loader.file;

            // Validate file type - only accept jpg, jpeg, and png
            const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
            if (!validTypes.includes(file.type)) {
                throw new Error('Only JPG, JPEG, and PNG files are allowed');
            }

            // Show crop dialog and get cropped image
            const croppedFile = await this.showCropDialog(file);

            // If user cancelled, abort upload silently
            if (!croppedFile) {
                return; // Exit without throwing error
            }

            // Check if cropped image is over 2MB and offer optimization
            let finalFile = croppedFile;
            if (this.validateFileSize(croppedFile, 2) === false) {
                const fileSizeMB = (croppedFile.size / (1024 * 1024)).toFixed(2);
                const optimize = confirm(
                    `The cropped image is ${fileSizeMB}MB (larger than 2MB).\n\n` +
                    `Would you like to optimize it to reduce file size?`
                );

                if (optimize) {
                    finalFile = await this.compressImage(croppedFile, 2);
                    const compressedSizeMB = (finalFile.size / (1024 * 1024)).toFixed(2);
                    console.log(`Optimized from ${fileSizeMB}MB to ${compressedSizeMB}MB`);
                }
            }

            // Convert image to base64
            const base64Url = await this.fileToBase64(finalFile);

            return {
                default: base64Url
            };
        } catch (error) {
            console.error('Upload error:', error);
            throw error;
        }
    }

    validateFileSize(file, maxSizeMB) {
        const maxBytes = maxSizeMB * 1024 * 1024;
        return file.size <= maxBytes;
    }

    async compressImage(file, maxSizeMB = 2) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // Calculate scaling to reduce file size
                    const scaleFactor = Math.sqrt(maxSizeMB / (file.size / (1024 * 1024)));
                    if (scaleFactor < 1) {
                        width *= scaleFactor;
                        height *= scaleFactor;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(new File([blob], file.name, { type: file.type }));
                        } else {
                            reject(new Error('Failed to compress image'));
                        }
                    }, file.type, 0.85);
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }

    showCropDialog(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    // Create modal overlay
                    const overlay = document.createElement('div');
                    overlay.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-[10000] backdrop-blur-sm';

                    // Create dialog container
                    const dialog = document.createElement('div');
                    dialog.className = 'bg-white rounded-2xl p-4 sm:p-6 w-[95vw] sm:max-w-[90vw] h-[95vh] sm:max-h-[90vh] shadow-2xl flex flex-col gap-3 sm:gap-4';

                    // Header
                    const header = document.createElement('div');
                    header.innerHTML = `
                        <h2 class="m-0 text-xl font-semibold text-gray-800">Crop Image</h2>
                        <p class="mt-2 mb-0 text-sm text-gray-600">Drag to select the area you want to keep</p>
                    `;

                    // Canvas container
                    const canvasContainer = document.createElement('div');
                    canvasContainer.className = 'relative w-full flex-1 overflow-hidden border-2 border-gray-200 rounded-lg bg-gray-50 touch-none';
                    canvasContainer.style.cursor = 'grab';

                    const canvas = document.createElement('canvas');
                    canvas.className = 'w-full h-full object-contain';
                    const ctx = canvas.getContext('2d');

                    // Scale image to fit - use fixed max dimensions for initial sizing
                    const maxWidth = 800;
                    const maxHeight = 600;
                    let displayWidth = img.width;
                    let displayHeight = img.height;

                    if (displayWidth > maxWidth || displayHeight > maxHeight) {
                        const ratio = Math.min(maxWidth / displayWidth, maxHeight / displayHeight);
                        displayWidth *= ratio;
                        displayHeight *= ratio;
                    }

                    canvas.width = displayWidth;
                    canvas.height = displayHeight;
                    ctx.drawImage(img, 0, 0, displayWidth, displayHeight);

                    // Crop selection state
                    let cropState = {
                        x: displayWidth * 0.1,
                        y: displayHeight * 0.1,
                        width: displayWidth * 0.8,
                        height: displayHeight * 0.8,
                        isDragging: false,
                        isResizing: false,
                        dragStart: { x: 0, y: 0 },
                        resizeHandle: null,
                        aspectRatio: null, // Locked aspect ratio when preset selected
                        activePreset: null // Track which preset is active
                    };

                    // Draw crop overlay
                    const drawCropOverlay = () => {
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(img, 0, 0, displayWidth, displayHeight);

                        // Darken outside crop area
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                        ctx.fillRect(0, 0, canvas.width, cropState.y);
                        ctx.fillRect(0, cropState.y, cropState.x, cropState.height);
                        ctx.fillRect(cropState.x + cropState.width, cropState.y, canvas.width - cropState.x - cropState.width, cropState.height);
                        ctx.fillRect(0, cropState.y + cropState.height, canvas.width, canvas.height - cropState.y - cropState.height);

                        // Draw crop border
                        ctx.strokeStyle = '#3b82f6';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(cropState.x, cropState.y, cropState.width, cropState.height);

                        // Draw resize handles - larger for better mobile touch
                        const handleSize = 12;
                        ctx.fillStyle = '#3b82f6';
                        ctx.fillRect(cropState.x - handleSize / 2, cropState.y - handleSize / 2, handleSize, handleSize);
                        ctx.fillRect(cropState.x + cropState.width - handleSize / 2, cropState.y - handleSize / 2, handleSize, handleSize);
                        ctx.fillRect(cropState.x - handleSize / 2, cropState.y + cropState.height - handleSize / 2, handleSize, handleSize);
                        ctx.fillRect(cropState.x + cropState.width - handleSize / 2, cropState.y + cropState.height - handleSize / 2, handleSize, handleSize);
                    };

                    // Helper to get coordinates from mouse or touch event
                    const getEventCoordinates = (e) => {
                        const rect = canvas.getBoundingClientRect();
                        const scaleX = canvas.width / rect.width;
                        const scaleY = canvas.height / rect.height;

                        let clientX, clientY;
                        if (e.type.startsWith('touch')) {
                            const touch = e.touches[0] || e.changedTouches[0];
                            clientX = touch.clientX;
                            clientY = touch.clientY;
                        } else {
                            clientX = e.clientX;
                            clientY = e.clientY;
                        }

                        return {
                            x: (clientX - rect.left) * scaleX,
                            y: (clientY - rect.top) * scaleY
                        };
                    };

                    // Update cursor based on position/state
                    const updateCursor = (x = null, y = null) => {
                        if (cropState.isDragging) {
                            canvasContainer.style.cursor = 'grabbing';
                        } else if (cropState.isResizing) {
                            const handle = cropState.resizeHandle;
                            if (handle === 'tl' || handle === 'br') {
                                canvasContainer.style.cursor = 'nwse-resize';
                            } else {
                                canvasContainer.style.cursor = 'nesw-resize';
                            }
                        } else if (x !== null && y !== null) {
                            // Preview cursor on hover - larger hit area for mobile
                            const handleSize = 24;
                            if (Math.abs(x - cropState.x) < handleSize && Math.abs(y - cropState.y) < handleSize) {
                                canvasContainer.style.cursor = 'nwse-resize';
                            } else if (Math.abs(x - (cropState.x + cropState.width)) < handleSize && Math.abs(y - cropState.y) < handleSize) {
                                canvasContainer.style.cursor = 'nesw-resize';
                            } else if (Math.abs(x - cropState.x) < handleSize && Math.abs(y - (cropState.y + cropState.height)) < handleSize) {
                                canvasContainer.style.cursor = 'nesw-resize';
                            } else if (Math.abs(x - (cropState.x + cropState.width)) < handleSize && Math.abs(y - (cropState.y + cropState.height)) < handleSize) {
                                canvasContainer.style.cursor = 'nwse-resize';
                            } else if (x >= cropState.x && x <= cropState.x + cropState.width && y >= cropState.y && y <= cropState.y + cropState.height) {
                                canvasContainer.style.cursor = 'grab';
                            } else {
                                canvasContainer.style.cursor = 'default';
                            }
                        } else {
                            canvasContainer.style.cursor = 'grab';
                        }
                    };

                    // Mouse and touch event handlers
                    const handleStart = (e) => {
                        e.preventDefault();
                        const { x, y } = getEventCoordinates(e);

                        const handleSize = 24; // Larger for better mobile touch detection
                        // Check resize handles
                        if (Math.abs(x - cropState.x) < handleSize && Math.abs(y - cropState.y) < handleSize) {
                            cropState.isResizing = true;
                            cropState.resizeHandle = 'tl';
                        } else if (Math.abs(x - (cropState.x + cropState.width)) < handleSize && Math.abs(y - cropState.y) < handleSize) {
                            cropState.isResizing = true;
                            cropState.resizeHandle = 'tr';
                        } else if (Math.abs(x - cropState.x) < handleSize && Math.abs(y - (cropState.y + cropState.height)) < handleSize) {
                            cropState.isResizing = true;
                            cropState.resizeHandle = 'bl';
                        } else if (Math.abs(x - (cropState.x + cropState.width)) < handleSize && Math.abs(y - (cropState.y + cropState.height)) < handleSize) {
                            cropState.isResizing = true;
                            cropState.resizeHandle = 'br';
                        } else if (x >= cropState.x && x <= cropState.x + cropState.width && y >= cropState.y && y <= cropState.y + cropState.height) {
                            cropState.isDragging = true;
                            cropState.dragStart = { x: x - cropState.x, y: y - cropState.y };
                        }
                        updateCursor();
                    };

                    const handleMove = (e) => {
                        e.preventDefault();
                        const { x, y } = getEventCoordinates(e);

                        if (cropState.isDragging) {
                            cropState.x = Math.max(0, Math.min(x - cropState.dragStart.x, canvas.width - cropState.width));
                            cropState.y = Math.max(0, Math.min(y - cropState.dragStart.y, canvas.height - cropState.height));
                            drawCropOverlay();
                        } else if (cropState.isResizing) {
                            const handle = cropState.resizeHandle;

                            if (cropState.aspectRatio) {
                                // Resize with locked aspect ratio
                                if (handle.includes('r') || handle.includes('l')) {
                                    let newWidth;
                                    if (handle.includes('r')) {
                                        newWidth = Math.max(20, Math.min(x - cropState.x, canvas.width - cropState.x));
                                    } else {
                                        const newX = Math.max(0, x);
                                        newWidth = cropState.width + (cropState.x - newX);
                                        if (newWidth > 20) {
                                            cropState.x = newX;
                                        }
                                    }
                                    if (newWidth > 20) {
                                        cropState.width = newWidth;
                                        cropState.height = newWidth / cropState.aspectRatio;
                                    }
                                }
                                if (handle.includes('t') || handle.includes('b')) {
                                    let newHeight;
                                    if (handle.includes('b')) {
                                        newHeight = Math.max(20, Math.min(y - cropState.y, canvas.height - cropState.y));
                                    } else {
                                        const newY = Math.max(0, y);
                                        newHeight = cropState.height + (cropState.y - newY);
                                        if (newHeight > 20) {
                                            cropState.y = newY;
                                        }
                                    }
                                    if (newHeight > 20) {
                                        cropState.height = newHeight;
                                        cropState.width = newHeight * cropState.aspectRatio;
                                    }
                                }
                            } else {
                                // Free resize
                                if (handle.includes('t')) {
                                    const newY = Math.max(0, y);
                                    const newHeight = cropState.height + (cropState.y - newY);
                                    if (newHeight > 20) {
                                        cropState.y = newY;
                                        cropState.height = newHeight;
                                    }
                                }
                                if (handle.includes('b')) {
                                    cropState.height = Math.max(20, Math.min(y - cropState.y, canvas.height - cropState.y));
                                }
                                if (handle.includes('l')) {
                                    const newX = Math.max(0, x);
                                    const newWidth = cropState.width + (cropState.x - newX);
                                    if (newWidth > 20) {
                                        cropState.x = newX;
                                        cropState.width = newWidth;
                                    }
                                }
                                if (handle.includes('r')) {
                                    cropState.width = Math.max(20, Math.min(x - cropState.x, canvas.width - cropState.x));
                                }
                            }
                            drawCropOverlay();
                        } else {
                            // Update cursor preview when hovering
                            updateCursor(x, y);
                        }
                    };

                    const handleEnd = (e) => {
                        e.preventDefault();
                        cropState.isDragging = false;
                        cropState.isResizing = false;
                        cropState.resizeHandle = null;
                        updateCursor();
                    };

                    // Add both mouse and touch events
                    canvas.addEventListener('mousedown', handleStart);
                    canvas.addEventListener('touchstart', handleStart);

                    canvas.addEventListener('mousemove', handleMove);
                    canvas.addEventListener('touchmove', handleMove);

                    canvas.addEventListener('mouseup', handleEnd);
                    canvas.addEventListener('touchend', handleEnd);
                    canvas.addEventListener('touchcancel', handleEnd);

                    drawCropOverlay();
                    canvasContainer.appendChild(canvas);

                    // Preset buttons
                    const presetContainer = document.createElement('div');
                    presetContainer.className = 'flex gap-2 flex-wrap';

                    const createPresetButton = (label, aspectRatio) => {
                        const btn = document.createElement('button');
                        btn.textContent = label;
                        btn.className = 'px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 hover:border-gray-400 rounded-lg cursor-pointer text-sm transition-all duration-200';
                        btn.dataset.ratio = aspectRatio;

                        btn.onclick = () => {
                            // Toggle selection
                            if (cropState.activePreset === btn) {
                                // Deselect - free resize
                                cropState.activePreset = null;
                                cropState.aspectRatio = null;
                                btn.className = 'px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 hover:border-gray-400 rounded-lg cursor-pointer text-sm transition-all duration-200';
                            } else {
                                // Deselect previous button
                                if (cropState.activePreset) {
                                    cropState.activePreset.className = 'px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 hover:border-gray-400 rounded-lg cursor-pointer text-sm transition-all duration-200';
                                }

                                // Select this button and lock aspect ratio
                                cropState.activePreset = btn;
                                cropState.aspectRatio = aspectRatio;
                                btn.className = 'px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white border border-blue-600 rounded-lg cursor-pointer text-sm transition-all duration-200';

                                // Adjust crop to match aspect ratio
                                const centerX = canvas.width / 2;
                                const centerY = canvas.height / 2;
                                const maxSize = Math.min(canvas.width, canvas.height) * 0.8;

                                if (aspectRatio) {
                                    cropState.width = maxSize;
                                    cropState.height = maxSize / aspectRatio;
                                    if (cropState.height > canvas.height * 0.8) {
                                        cropState.height = canvas.height * 0.8;
                                        cropState.width = cropState.height * aspectRatio;
                                    }
                                } else {
                                    cropState.width = maxSize;
                                    cropState.height = maxSize;
                                }

                                cropState.x = centerX - cropState.width / 2;
                                cropState.y = centerY - cropState.height / 2;
                                drawCropOverlay();
                            }
                        };
                        return btn;
                    };

                    presetContainer.appendChild(createPresetButton('Passport (7:9)', 7 / 9));
                    presetContainer.appendChild(createPresetButton('Square (1:1)', 1));
                    presetContainer.appendChild(createPresetButton('Portrait (3:4)', 3 / 4));
                    presetContainer.appendChild(createPresetButton('Landscape (16:9)', 16 / 9));

                    // Action buttons
                    const buttonContainer = document.createElement('div');
                    buttonContainer.className = 'flex gap-3 justify-end';

                    const cancelBtn = document.createElement('button');
                    cancelBtn.textContent = 'Cancel';
                    cancelBtn.className = 'px-5 py-2.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-lg cursor-pointer text-sm font-medium transition-all duration-200';
                    cancelBtn.onclick = () => {
                        document.body.removeChild(overlay);
                        resolve(null); // Resolve with null instead of rejecting
                    };

                    const cropBtn = document.createElement('button');
                    cropBtn.textContent = 'Crop & Insert';
                    cropBtn.className = 'px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg cursor-pointer text-sm font-semibold shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 transition-all duration-200';
                    cropBtn.onclick = () => {
                        // Create cropped canvas
                        const croppedCanvas = document.createElement('canvas');
                        const croppedCtx = croppedCanvas.getContext('2d');

                        // Calculate scale factor from display to original
                        const scaleX = img.width / displayWidth;
                        const scaleY = img.height / displayHeight;

                        croppedCanvas.width = cropState.width * scaleX;
                        croppedCanvas.height = cropState.height * scaleY;

                        croppedCtx.drawImage(
                            img,
                            cropState.x * scaleX,
                            cropState.y * scaleY,
                            cropState.width * scaleX,
                            cropState.height * scaleY,
                            0,
                            0,
                            croppedCanvas.width,
                            croppedCanvas.height
                        );

                        croppedCanvas.toBlob((blob) => {
                            document.body.removeChild(overlay);
                            resolve(new File([blob], file.name, { type: file.type }));
                        }, file.type, 0.95);
                    };

                    buttonContainer.appendChild(cancelBtn);
                    buttonContainer.appendChild(cropBtn);

                    dialog.appendChild(header);
                    dialog.appendChild(presetContainer);
                    dialog.appendChild(canvasContainer);
                    dialog.appendChild(buttonContainer);
                    overlay.appendChild(dialog);
                    document.body.appendChild(overlay);
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(file);
        });
    }

    abort() {
        // Implement abort logic if needed
        console.log('Upload aborted');
    }
}
