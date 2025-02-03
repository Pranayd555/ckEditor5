import { DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { showWarning } from './utils';
import { Command } from 'ckeditor5';
import audioIcon from './assets/icons/audio.svg';
import pdfIcon from './assets/icons/pdf.svg';
import docsIcon from './assets/icons/docs.svg';
import defaultIcon from './assets/icons/default.svg';
import folderIcon from './assets/icons/folder.svg';
const bucketName = 'pranay-poc-bucket';
let currentFolder = '';

export default class S3BrowserCommand extends Command {
    
    constructor(editor, s3Client) {
        super(editor);
        this.s3Client = s3Client;

        this.listenTo(this.editor.model.document, 'change', () => this.refresh());
        window.selectFile = this.selectFile.bind(this);
        window.closeDialog = this.closeDialog.bind(this);
        window.updateContent = this.updateContent.bind(this);
        window.uploadFilesToS3 = this.uploadFilesToS3.bind(this);
        window.uploadFileToS3 = this.uploadFileToS3.bind(this);
        window.addFolder = this.addFolder.bind(this);
        window.updateFolder = this.updateFolder.bind(this);
        window.selectFileFlmngr = this.selectFileFlmngr.bind(this);
        window.resetDialog = this.resetDialog.bind(this);
        window.deleteFile = this.deleteFile.bind(this);
        window.deleteFolder = this.deleteFolder.bind(this);
        window.getFileIcon = this.getFileIcon.bind(this);
    }

    async execute() {
        try {
            const folderList = await this.getFolderNames(bucketName); 
            console.log('folder names', folderList);
            const contents = await this.getFolderContents(bucketName, folderList[0]); 
            this.renderFileList(folderList, contents); 
        } catch (error) {
            showWarning(this.editor, 'Error', true, `Failed to list files: ${error.message}`, true);
        }
    }

    async getFolderNames(bucketName) {

        const command = new ListObjectsV2Command({
            Bucket: bucketName,
            Delimiter: '/' 
        });

        try {
            const response = await this.s3Client.send(command);
            const folderNames = response.CommonPrefixes.map(prefix => prefix.Prefix.replace('/', '')); 
            return folderNames;
        } catch (error) {
            console.error('Error fetching folder names:', error);
            return [];
        }
    }

    async getFolderContents(bucketName, folderName) {
        const command = new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: folderName + '/', 
            Delimiter: '/' 
        });
        currentFolder = folderName;

        try {
            const { Contents } = await this.s3Client.send(command);
            const updatedContents = await Promise.all(Contents.map(async a => {
                const parts = a.Key.split('/');
                a.fileName = parts[parts.length - 1];
                if (a.fileName.length) a.imageUrl = await this.selectFileFlmngr(a.Key);
                return a.fileName.length !== 0 ? a : null;
            }));
            return updatedContents.filter(a => a !== null);
        } catch (error) {
            console.error('Error fetching folder contents:', error);
            return [];
        }
    }

    renderFileList(folderList, files) {
        let folderListHTML = []
        let fileListHTML = []
        if (folderList.length) {
            folderListHTML = folderList.map(folder => `
                <li class="folder-item">
                    <div class="folder-info">
                        <div class="icon">${folderIcon}</div>
                        <span class="folderName">${folder}</span>
                    </div>
                    <div class="folder-actions">
                        <button class="select-btn" onclick="updateContent('${folder}')">Select</button>
                        <button class="delete-btn" onclick="deleteFolder('${folder}')">Delete</button>
                    </div>
                </li>
            `).join('');
        } else {
        folderListHTML = `
            <li>
                <span>Folder is Empty</span>
            </li>
        `;
        }

        if(files.length) {
            fileListHTML = `
                <h3>${currentFolder} - Files</h3>
                    <ul id="fileList">
                        ${files.map(file => `
                            <li class="file-item">
                                <div class="file-info">
                                    ${getFileIcon(file)}
                                    <span class="fileName">${file.fileName}</span>
                                </div>
                                <div class="file-actions">
                                    <button onclick="selectFile('${file.Key}')">Select</button>
                                    <button onclick="deleteFile('${file.Key}')">Delete</button>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
        `;
        } else {
            fileListHTML = ` 
            <h3>${currentFolder} - Files</h3>
            <ul id="fileList">
                <li>
                    <span>Folders is Empty</span>
                </li>
            </ul>`
        }
    
        const dialogHTML = `
            <div class="s3-dialog">
                <div class="s3-dialog-content">
                    <span class="s3-dialog-close" onclick="closeDialog()">&times;</span>
                    <h2>Files in S3</h2>
                    <div class="s3-dialog-body">
                        <div class="s3-folder-section">
                            <h3>Folders</h3>
                            <ul id="folderList">
                                ${folderListHTML}
                            </ul>
                            <input type="text" id="folderNameInput" placeholder="Enter folder name" />
                            <button id="addFolderButton" style="margin-top: 5px;" onclick="addFolder()">Add Folder</button>
                        </div>
                        <div class="s3-file-section">
                                ${fileListHTML}
                            <button onclick="uploadFilesToS3()" id="uploadButton">Upload</button>
                        </div>
                    </div>
                </div>
            </div>`;
    
        this.closeDialog();
        document.body.insertAdjacentHTML('beforeend', dialogHTML);
        this.addDialogStyles();
    }
  
    
    addDialogStyles() {
        const flmngrStyles = `
            .s3-dialog {
            display: flex;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            overflow: hidden; /* Hide the main overflow */
            background-color: rgba(0, 0, 0, 0.7);
        }

        .s3-dialog-content {
            background-color: #fff;
            margin: auto;
            padding: 20px;
            border: 1px solid #888;
            width: 80%;
            max-width: 80%;
            max-height: 80%; /* Limit height */
            overflow-y: auto; /* Add vertical scroll */
            position: relative;
            border-radius: 5px;
        }
    
            .s3-dialog-close {
                position: absolute;
                right: 10px;
                top: 10px;
                cursor: pointer;
                font-size: 24px;
                color: #aaa;
            }
    
            .s3-dialog-close:hover {
                color: red;
            }
    
            .s3-dialog-body {
                display: flex;
            }
    
            .s3-file-section {
                width: 70%;
                padding: 20px;
                background-color: #f9f9f9;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            }
    
            .s3-folder-section {
                padding: 20px;
                background-color: #f9f9f9;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            }
    
            h3 {
                margin-bottom: 10px;
            }
    
            li {
                padding: 10px;
                margin: 5px 0;
                border-radius: 4px;
                background-color: #e6f7ff;
                transition: background-color 0.3s, transform 0.3s;
                display: flex; /* Flex for better alignment */
                align-items: center; /* Center items vertically */
                justify-content: space-between; /* Space between elements */
            }
    
            li:hover {
                background-color: #b3e0ff;
                transform: scale(1.02);
                cursor: pointer;
            }
    
            input[type="text"] {
                padding: 10px;
                border: 1px solid #ccc;
                border-radius: 4px;
                width: calc(100% - 22px);
                margin-top: 10px;
            }
    
            button {
                padding: 5px 10px;
                background-color: #007bff;
                color: #fff;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                margin-left: 10px; /* Add space between buttons */
                transition: background-color 0.3s;
            }
    
            button:hover {
                background-color: #0056b3;
            }
    
            ul {
                list-style-type: none;
                padding: 0;
            }
    
            li img {
                width: 250px;
                height: auto;
                margin-right: 10px;
            }

            .fileName {
            margin-left: 10px;
            }

            .folder-item {
                display: flex;
                flex-direction: row;
                padding: 10px;
                background-color: #e6f7ff;
                margin: 5px 0;
                border-radius: 4px;
            }

            .folder-info {
                display: flex;
                align-items: center;
            }

            .icon {
                width: 20px; /* Adjust size as needed */
                height: 20px; /* Adjust size as needed */
                margin-right: 10px;
            }

            .fileName {
                font-weight: bold;
            }

            .folderName {
                font-size: 20px;
                font-weight: 800;
                font-family: cursive;
                color: coral;
            }

            .folder-actions {
                margin-top: 10px;
                display: flex;
                justify-content: flex-end;
            }

            .file-item {
                display: flex;
                justify-content: space-between;
                padding: 10px;
                background-color: #e6f7ff;
                margin: 5px 0;
                border-radius: 4px;
                align-items: center;
            }

            .file-info {
                display: flex;
                align-items: center;
                flex-grow: 1;
            }

            .file-image {
                width: 250px;
                height: auto;
                margin-right: 10px;
            }

            .file-actions {
                display: flex;
                margin-left: 10px;
            }

        `;
        const styleSheet = document.createElement("style");
        styleSheet.innerText = flmngrStyles;
        document.head.appendChild(styleSheet);
    }
    
    

    async updateContent(folderName) {
    const contents = await this.getFolderContents(bucketName, folderName);
    const fileListElement = document.querySelector('.s3-file-section');
    fileListElement.innerHTML = '';

    let fileListHTML = ``;
    if(contents.length) {
        fileListHTML = `
        <h3>${currentFolder} - Files</h3>
                    <ul id="fileList">
                        ${contents.map(file => `
                            <li class="file-item">
                                <div class="file-info">
                                    ${getFileIcon(file)}
                                    <span class="fileName">${file.fileName}</span>
                                </div>
                                <div class="file-actions">
                                    <button onclick="selectFile('${file.Key}')">Select</button>
                                    <button onclick="deleteFile('${file.Key}')">Delete</button>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                    <button onclick="uploadFilesToS3()" id="uploadButton">Upload</button>
        `;
    } else {
        fileListHTML = `
        <h3>${currentFolder} - Files</h3>
        <ul id="fileList">
            <li>
                <span>Folders is Empty</span>
            </li>
        </ul>`
    }

    fileListElement.innerHTML = fileListHTML; 
    }

    async updateFolder() {
    const contents = await this.getFolderNames(bucketName);
    const folderListElement = document.getElementById('folderList');
    folderListElement.innerHTML = ''; 

    let folderListHTML = ``;
    if (folderList.length) {
        folderListHTML = contents.map(folder => `
            <li class="folder-item">
                    <div class="folder-info">
                        <div class="icon">${folderIcon}</div>
                        <span class="folderName">${folder}</span>
                    </div>
                    <div class="folder-actions">
                        <button class="select-btn" onclick="updateContent('${folder}')">Select</button>
                        <button class="delete-btn" onclick="deleteFolder('${folder}')">Delete</button>
                    </div>
                </li>
        `).join('');
    } else {
    folderListHTML = `
        <li>
            <span>Folders is Empty</span>
        </li>
    `;
    }

    folderListElement.innerHTML = folderListHTML; 
    }

    async selectFileFlmngr(fileKey) {
        try {
            const command = new GetObjectCommand({
                Bucket: bucketName,
                Key: fileKey,
            });
            const response = await this.s3Client.send(command);
            const { Body, ContentType } = response;
            const blob = await this.readStreamToBlob(Body);
            const base64 = await this.convertBlobToBase64(blob);
            return base64;
        } catch (error) {
            console.error('Error downloading the file **:', error);
            showWarning(this.editor, 'Error', true, 'Unable to download the file.', false);
        }
    }

    async selectFile(fileKey) {
        console.log(`Selected file: ${fileKey}`);
        
        try {
            const command = new GetObjectCommand({
                Bucket: bucketName,
                Key: fileKey,
            });

            const signedUrl = await getSignedUrl(this.s3Client, command);
            console.log('Signed URL:', signedUrl);
    
            const response = await this.s3Client.send(command);
            const { Body, ContentType } = response;
    
            const fileExtension = fileKey.split('.').pop().toLowerCase();
            let blob = await this.readStreamToBlob(Body);
            
            if (['png', 'jpg', 'jpeg', 'gif'].includes(fileExtension)) {
                const fileContents = await this.convertBlobToBase64(blob);
                this.editor.execute('insertImage', { source: fileContents });
            } else if (['mp3', 'wav'].includes(fileExtension)) {
                const audioType = ContentType; // e.g., "audio/mpeg"
    
                // Create audio element using writer
                this.editor.model.change(writer => {
                    const insertPosition = this.editor.model.document.selection.getFirstPosition();
                    console.log('insert position', insertPosition)
    
                    // Create the audio element
                    const audioElement = writer.createElement('audio', {
                        src: signedUrl,
                        type: audioType
                    });
                    writer.insert( audioElement, insertPosition );
                });
    
            } else if (['pdf'].includes(fileExtension)) {
                console.log('pdf**', Body, ContentType);
                // Handle PDF insertion logic
            } else if (['doc', 'docx'].includes(fileExtension)) {
                console.log('doc**', Body, ContentType);
                // Handle DOC/DOCX insertion logic
            } else {
                console.log('Unsupported file type', Body, ContentType);
                showWarning(this.editor, 'Error', true, 'Unsupported file type.', false);
                return;
            }
        } catch (error) {
            console.error('Error downloading the file:', error);
            showWarning(this.editor, 'Error', true, 'Unable to download the file.', false);
        }
        this.closeDialog();
    }
    
    

    async addFolder() {
        const folderNameInput = document.getElementById('folderNameInput');
        const folderName = folderNameInput.value.trim();
        if(folderName.length) {
        await this.uploadFileToS3(folderName, '', true);
        currentFolder = folderName;
        const folderList = await this.getFolderNames(bucketName);
        const contents = await this.getFolderContents(bucketName, currentFolder);
        this.renderFileList(folderList, contents);
        } else {
            showWarning(this.editor, 'Add Folder Failed', false, `Error Adding Folder: please add a folder name`, false);
        }
    }

    uploadFilesToS3() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = ".mp3,.png,.pdf,.doc,.docx"
        fileInput.multiple = true;

        fileInput.onchange = async (event) => {
            const files = Array.from(event.target.files);
            try {
                await Promise.all(files.map(file => this.uploadFileToS3(currentFolder, file, false)));
                await this.updateContent(currentFolder);
                showWarning(this.editor, 'Success', false, 'Files uploaded successfully!', false);
            } catch (error) {
                showWarning(this.editor, 'Upload Failed', true, `Error uploading files: ${error.message}`, true);
            }
        };

        fileInput.click();
    }

    async uploadFileToS3(folderName, file, isAddFolder = false) {
        let command = {};
        if(isAddFolder) {
            command = new PutObjectCommand({
                Bucket: bucketName,
                Key: `${folderName}/`,
            });
        } else {
            command = new PutObjectCommand({
                Bucket: bucketName,
                Key: `${folderName}/${file.name}`,
                Body: file,
                ContentType: file.type,
            });
        }

        try {
            await this.s3Client.send(command);
            if (isAddFolder) {
            console.log('Folder created successfully:', folderName);
        }
        } catch (error) {
            throw new Error(`Failed to upload ${file.name}: ${error.message}`);
        }
    }

    async readStreamToBlob(readableStream) {
        const response = new Response(readableStream);
        const blob = await response.blob();
        return blob;
    }

    async convertBlobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async deleteFile(fileKey) {
        const command = new DeleteObjectCommand({
            Bucket: bucketName,
            Key: fileKey,
        });
    
        try {
            await this.s3Client.send(command);
            await this.updateContent(currentFolder);
            console.log(`File deleted successfully: ${fileKey}`);
        } catch (error) {
            console.error('Error deleting the file:', error);
            showWarning(this.editor, 'Error', true, `Failed to delete file: ${error.message}`, true);
        }
    }

    async deleteFolder(folderKey) {
        
        const listCommand = new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: `${folderKey}/`,
        });
    
        try {
            const response = await this.s3Client.send(listCommand);
            const objectsToDelete = response.Contents.map(object => ({
                Key: object.Key,
            }));
    
            if (objectsToDelete.length > 0) {
                const deleteCommand = new DeleteObjectsCommand({
                    Bucket: bucketName,
                    Delete: {
                        Objects: objectsToDelete,
                    },
                });
    
                await this.s3Client.send(deleteCommand);
                await this.resetDialog();
                console.log(`Folder deleted successfully: ${folderKey}`);
            } else {
                showWarning(this.editor, 'Error', true, `Failed to delete folder: ${error.message}`, true);
                console.log('No objects found in this folder.');
            }
        } catch (error) {
            showWarning(this.editor, 'Error', true, `Failed to delete folder: ${error.message}`, true);
            console.error('Error deleting the folder:', error);
        }
    }

    getFileIcon(file) {
        const fileExtension = file.fileName.split('.').pop().toLowerCase();
        let iconUrl;
    
        if (['png', 'jpg', 'jpeg', 'gif'].includes(fileExtension)) {
            return `<img src="${file.imageUrl}" alt="${file.fileName}" class="file-image"/>`;
        } else if (['mp3', 'wav'].includes(fileExtension)) {
            iconUrl = audioIcon;
        } else if (['pdf'].includes(fileExtension)) {
            iconUrl = pdfIcon; 
        } else if (['doc', 'docx'].includes(fileExtension)) {
            iconUrl = docsIcon; 
        } else {
            iconUrl = defaultIcon;
        }
    
        return `<div class="icon">${iconUrl}</div>`;
    }

    async resetDialog() {
        const folderList = await this.getFolderNames(bucketName);
        const contents = await this.getFolderContents(bucketName, folderList[0]);
        currentFolder = folderList[0];
        this.renderFileList(folderList, contents);
    }

    closeDialog() {
        const dialog = document.querySelector('.s3-dialog');
        if (dialog) {
            dialog.remove();
        }
    }

    refresh() {
        this.isEnabled = true; 
    }
}
