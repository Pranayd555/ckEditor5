export function showWarning(
    editor,
    title,
    doLocalizeTitle,
    message,
    doLocalizeMessage
) {
    const notification = editor.plugins.get('Notification');
    console.log('noification', notification)
    const t = editor.locale.t;

    if (notification) {
        notification.showWarning(
            doLocalizeMessage ? t(message) : message,
            {
                title: doLocalizeTitle ? t(title) : title,
                namespace: 'AmazonS3Plugin'
            }
        );
    } else {
        alert(
            (doLocalizeTitle ? t(title) : title) + "\n\n" +
            (doLocalizeMessage ? t(message) : message)
        );
    }
}

// export function showSuccess(editor, title, message) {
//     const notification = editor.plugins.get('Notification');
//     console.log('notification from util', notification);
//     const t = editor.locale.t;

//     if (notification) {
//         notification.showSuccess(message, {
//             title: title,
//             namespace: 'AmazonS3Plugin'
//         });
//     } else {
//         alert(title + "\n\n" + message);
//     }
// }

export function showSuccess(
    editor,
    title,
    doLocalizeTitle,
    message,
    doLocalizeMessage
) {
    const notification = editor.plugins.get('Notification');
    const t = editor.locale.t;

    if (notification) {
        notification.showSuccess(
            doLocalizeMessage ? t(message) : message,
            {
                title: doLocalizeTitle ? t(title) : title,
                namespace: 'AmazonS3Plugin'
            }
        );
    } else {
        alert(
            (doLocalizeTitle ? t(title) : title) + "\n\n" +
            (doLocalizeMessage ? t(message) : message)
        );
    }
}

export function isImageFile(filepath) {
    const imageExtensions = ['jpeg', 'jpg', 'png', 'gif', 'bmp', 'svg', 'webp'];
    const extension = filepath.split('.').pop().toLowerCase();
    return imageExtensions.includes(extension);
}

export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}
