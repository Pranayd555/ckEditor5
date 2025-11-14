import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { showWarning } from "./utils";
import { Command } from "ckeditor5";
import audioIcon from "./assets/icons/audio.svg";
import pdfIcon from "./assets/icons/pdf.svg";
import docsIcon from "./assets/icons/docs.svg";
import defaultIcon from "./assets/icons/default.svg";
import folderIcon from "./assets/icons/icon-graphic-folder.svg";

const bucketName =
  process.env.R2_BUCKET_NAME ||
  process.env.S3_BUCKET_NAME ||
  "pranay-poc-bucket";
let currentFolder = "";

export default class S3BrowserCommand extends Command {
  constructor(editor, s3Client) {
    super(editor);
    this.s3Client = s3Client;

    this.listenTo(this.editor.model.document, "change", () => this.refresh());
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
      this.showLoader();
      const folderList = await this.getFolderNames(bucketName);
      console.log("folder names", folderList);
      let contents = [];
      if (folderList.length) {
        contents = await this.getFolderContents(bucketName, folderList[0]);
      }
      this.renderFileList(folderList, contents);
    } catch (error) {
      showWarning(
        this.editor,
        "Error",
        true,
        `Failed to list files: ${error.message}`,
        true
      );
    }
  }

  showLoader() {
    const dialogHTML = `
    <div class="s3-dialog" aria-busy="false" role="dialog">
                <div class="s3-dialog-content loader">
            <div id="fileList">
              <div class="loader-container">
                <div class="spinner"></div>
                <span class="loading-text">Loading files...</span>
              </div>
            </div>
            </div>
            </div>
                    `
                    this.closeDialog();              
                    this.addDialogStyles();
                    document.body.insertAdjacentHTML("beforeend", dialogHTML);
  }

  async getFolderNames(bucketName) {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Delimiter: "/",
    });

    try {
      const response = await this.s3Client.send(command);
      const folderNames = (response.CommonPrefixes || []).map((prefix) =>
        prefix.Prefix.replace("/", "")
      );
      return folderNames;
    } catch (error) {
      console.error("Error fetching folder names:", error);
      return [];
    }
  }

  async getFolderContents(bucketName, folderName) {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: folderName + "/",
      Delimiter: "/",
    });
    currentFolder = folderName;

    try {
      const { Contents } = await this.s3Client.send(command);
      const updatedContents = await Promise.all(
        Contents.map(async (a) => {
          const parts = a.Key.split("/");
          a.fileName = parts[parts.length - 1];
          if (a.fileName.length)
            a.imageUrl = await this.selectFileFlmngr(a.Key);
          return a.fileName.length !== 0 ? a : null;
        })
      );
      return updatedContents.filter((a) => a !== null);
    } catch (error) {
      console.error("Error fetching folder contents:", error);
      return [];
    }
  }

  renderFileList(folderList, files) {
    let folderListHTML = [];
    let fileListHTML = [];
    if (folderList.length) {
      folderListHTML = folderList
        .map(
          (folder, i) => `
                <li class="folder-item ${folder === currentFolder ? 'selected' : ''}">
                    <div class="folder-info" onclick="updateContent('${folder}', ${i})">
                        <div class="icon">${folderIcon}</div>
                        <span class="folderName">${folder}</span>
                    </div>
                    <div class="folder-actions">
                        <button class="delete-btn" onclick="event.stopPropagation(); deleteFolder(event, '${folder}')">Delete</button>
                    </div>
                </li>
            `
        )
        .join("");
    } else {
      folderListHTML = `
            <li>
                <span>No folders found</span>
            </li>
        `;
    }

    if (files.length) {
      fileListHTML = `
                <div class="header-row">
                <h3>${currentFolder ? `${currentFolder} - Files` : `All Files`}</h3>
                <button onclick="uploadFilesToS3()" id="uploadButton">Upload</button>
                </div>
                    <ul id="fileList">
                        ${files
                          .map(
                            (file) => `
                            <li class="file-item">
                                <div class="file-info" data-file="${file.key}" onclick="selectFile('${
                                      file.Key
                                    }')">
                                    ${getFileIcon(file)}
                                    <span class="fileName">${
                                      file.fileName
                                    }</span>
                                </div>
                                <div class="file-actions">
                                    <button class="delete-btn" onclick="deleteFile(event, '${
                                      file.Key
                                    }')">Delete</button>
                                </div>
                            </li>
                        `
                          )
                          .join("")}
                    </ul>
        `;
    } else {
      fileListHTML = ` 
            <div class="header-row">
            <h3>${currentFolder ? `${currentFolder} - Files` : `All Files`}</h3>
            <button onclick="uploadFilesToS3()" id="uploadButton">Upload</button>
            </div>
            <ul id="fileList">
                <li>
                    <span>No files found</span>
                </li>
            </ul>`;
    }

    const dialogHTML = `
            <div class="s3-dialog" aria-busy="false" role="dialog">
                <div class="s3-dialog-content">
                    <div class="s3-loader"><div class="s3-spinner"></div><div class="s3-loading-text">Loading</div></div>
                    <span class="s3-dialog-close" onclick="closeDialog()">&times;</span>
                    <h2>File Manager</h2>
                    <div class="s3-dialog-body">
                        <div class="s3-folder-section">
                            <input type="text" id="folderNameInput" placeholder="Enter folder name" />
                            <div class="btn-wrap">
                            <button id="addFolderButton" style="margin-top: 5px;" onclick="addFolder()">Add Folder</button>
                            </div>
                            <h3>Folders</h3>
                            <ul id="folderList">
                                ${folderListHTML}
                            </ul>
                        </div>
                        <div class="s3-file-section">
                                ${fileListHTML}
                        </div>
                    </div>
                </div>
            </div>`;

    this.closeDialog();
    document.body.insertAdjacentHTML("beforeend", dialogHTML);
    // this.addDialogStyles();
  }

  addDialogStyles() {
    const flmngrStyles = `
            .s3-dialog {
                position: fixed;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
                background-color: rgba(17, 24, 39, 0.55);
                backdrop-filter: saturate(180%) blur(6px);
            }

            .s3-dialog-content {
                position: relative;
                background-color: #ffffff;
                width: min(1000px, 92vw);
                max-height: 85vh;
                min-height: 60vh;
                border-radius: 12px;
                box-shadow: 0 20px 40px rgba(2, 6, 23, 0.18);
                border: 1px solid #e5e7eb;
                overflow: hidden;
            }

            .s3-dialog-close {
                position: absolute;
                right: 14px;
                top: 10px;
                cursor: pointer;
                font-size: 22px;
                color: #6b7280;
            }

            .s3-dialog-close:hover { color: #ef4444; scale: 1.1 }

            .s3-dialog-body {
                display: grid;
                grid-template-columns: 300px 1fr;
                gap: 16px;
                padding: 20px;
            }

            .s3-folder-section, .s3-file-section {
                background-color: #ffffff;
                border: 1px solid #e5e7eb;
                border-radius: 12px;
                padding: 16px;
                overflow-y: auto;
                max-height: 400px;
            }

            .header-row {
            display: flex;
            justify-content: space-between; /* h3 left, button right */
            align-items: center;            /* vertically center */
            margin-bottom: 10px;
            }


            h2 { font-size: 20px; font-weight: 700; padding: 16px 20px 0; }
            h3 { margin-bottom: 12px; font-size: 16px; font-weight: 600; color: #111827; }

            ul { list-style: none; padding: 0; margin: 0; }

            li {
                padding: 12px;
                margin: 8px 0;
                border-radius: 10px;
                background-color: #f9fafb;
                border: 1px solid #e5e7eb;
                transition: background-color .2s ease, transform .2s ease, border-color .2s ease;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            li:hover { background-color: #eff6ff; border-color: #93c5fd; transform: translateY(-1px); box-shadow: 0px 10px 5px rgba(0, 0, 0, 0.3); scale: 1.02}

            input[type="text"] {
                padding: 10px 12px;
                border: 1px solid #d1d5db;
                border-radius: 10px;
                width: 100%;
                outline: none;
                transition: border-color .2s ease, box-shadow .2s ease;
            }
            input[type="text"]:focus { border-color: #60a5fa; box-shadow: 0 0 0 3px rgba(96,165,250,0.35); }

            button {
                padding: 8px 12px;
                background-color: #2563eb;
                color: #ffffff;
                border: none;
                border-radius: 10px;
                cursor: pointer;
                margin-left: 10px;
                font-weight: 600;
                transition: background-color .2s ease, box-shadow .2s ease, transform .1s ease;
            }
            button:hover { background-color: #1d4ed8; box-shadow: 0 8px 16px rgba(29,78,216,0.2); scale: 1.02 }
            .btn-wrap { display: flex;
            justify-content: flex-end;
            align-items: center;}
            .select-btn { background-color: #10b981; }
            .select-btn:hover { background-color: #0ea5e9; }
            .delete-btn { background-color: #ef4444; }
            .delete-btn:hover { background-color: #eb2f2fff; }

            .folder-item { display: flex; gap: 12px; align-items: center; }
            .folder-item.selected { background: #e9967a54; scale: 1.02 }
            .folder-info { display: flex; align-items: center; gap: 10px; cursor: pointer; }
            .icon { width: 40px; height: 22px; display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; }
            .fileName { font-weight: 600;
            margin-left: 10px;
            color: #1f2937;
            white-space: normal;
            white-space: normal;
            overflow-wrap: anywhere;
            word-break: break-word; }
            .folderName { font-size: 16px; font-weight: 700; color: #374151; }
            .folder-actions { display: flex; justify-content: flex-end; }

            .file-item { align-items: center; cursor: pointer; }
            .file-info { display: flex; align-items: center; gap: 10px; flex: 1; }
            .file-image { max-width: clamp(160px, 35vw, 260px); max-height: 200px; border-radius: 8px; }
            .file-actions { display: flex; gap: 8px; }

            .s3-loader {
                position: absolute;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 12px;
                background: rgba(255,255,255,0.65);
                opacity: 0;
                pointer-events: none;
                transition: opacity .2s ease;
            }
            .s3-dialog[aria-busy="true"] .s3-loader { opacity: 1; pointer-events: auto; }
            .s3-spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid #93c5fd; border-top-color: #2563eb; animation: s3spin 1s linear infinite; }
            .s3-loading-text { font-weight: 600; color: #111827; }
            @keyframes s3spin { to { transform: rotate(360deg); } }

            /* Loader wrapper */
              .loader-container {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 40px 0;
                gap: 10px;
              }

              .loader {
                  display: flex;
                  align-items: center;
                  justify-content: center;
                }

              /* Modern smooth spinner */
              .spinner {
                width: 40px;
                height: 40px;
                border: 4px solid rgba(0, 0, 0, 0.15);
                border-top-color: #4a90e2; /* primary color */
                border-radius: 50%;
                animation: spin 0.9s linear infinite;
              }

              /* Spinner animation */
              @keyframes spin {
                to {
                  transform: rotate(360deg);
                }
              }

              /* Text under loader */
              .loading-text {
                font-size: 14px;
                font-weight: 500;
                color: #444;
                opacity: 0.85;
              }

            @media (max-width: 768px) {
                .s3-dialog-body { grid-template-columns: 1fr; }
            }
        `;
    const styleSheet = document.createElement("style");
    styleSheet.innerText = flmngrStyles;
    document.head.appendChild(styleSheet);
  }

  async updateContent(folderName, index = null) {
    const dlg = document.querySelector(".s3-dialog");
    if (dlg) dlg.setAttribute("aria-busy", "true");
    const contents = await this.getFolderContents(bucketName, folderName);
    const fileListElement = document.querySelector(".s3-file-section");
    fileListElement.innerHTML = "";
    if(index !== null) {
    const folderListElement = document.getElementsByClassName("folder-item");
    const selectedFolder = document.getElementsByClassName("selected");
    selectedFolder[0].classList.remove("selected");
    folderListElement[index].classList.add("selected");
  }
    let fileListHTML = ``;
    if (contents.length) {
      fileListHTML = `
      <div class="header-row">
        <h3>${currentFolder ? `${currentFolder} - Files` : `All Files`}</h3>
        <button onclick="uploadFilesToS3()" id="uploadButton">Upload</button>
        </div>
                    <ul id="fileList">
                        ${contents
                          .map(
                            (file) => `
                            <li class="file-item" data-file="${file.Key}" onclick="selectFile('${
                                      file.Key
                                    }')">
                                <div class="file-info">
                                    ${getFileIcon(file)}
                                    <span class="fileName">${
                                      file.fileName
                                    }</span>
                                </div>
                                <div class="file-actions">
                                    <button class="delete-btn" onclick="deleteFile(event, '${
                                      file.Key
                                    }')">Delete</button>
                                </div>
                            </li>
                        `
                          )
                          .join("")}
                    </ul>
        `;
    } else {
      fileListHTML = `
      <div class="header-row">
        <h3>${currentFolder ? `${currentFolder} - Files` : `All Files`}</h3>
        <button onclick="uploadFilesToS3()" id="uploadButton">Upload</button>
        </div>
        <ul id="fileList">
            <li>
                <span>No files found</span>
            </li>
        </ul>
        `;
    }

    fileListElement.innerHTML = fileListHTML;
    if (dlg) dlg.setAttribute("aria-busy", "false");
  }

  async updateFolder() {
    const dlg = document.querySelector(".s3-dialog");
    if (dlg) dlg.setAttribute("aria-busy", "true");
    const contents = await this.getFolderNames(bucketName);
    const folderListElement = document.getElementById("folderList");
    folderListElement.innerHTML = "";

    let folderListHTML = ``;
    if (contents.length) {
      folderListHTML = contents
        .map(
          (folder, i ) => `
            <li class="folder-item ${folder === currentFolder ? 'selected' : ''}">
                    <div class="folder-info">
                        <div class="icon" onclick="updateContent('${folder}', ${i})">${folderIcon}</div>
                        <span class="folderName">${folder}</span>
                    </div>
                    <div class="folder-actions">
                        <button class="delete-btn" onclick="event.stopPropagation(); deleteFolder(event, '${folder}')">Delete</button>
                    </div>
                </li>
        `
        )
        .join("");
    } else {
      folderListHTML = `
        <li>
            <span>No folders found</span>
        </li>
    `;
    }

    folderListElement.innerHTML = folderListHTML;
    if (dlg) dlg.setAttribute("aria-busy", "false");
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
      console.error("Error downloading the file **:", error);
      showWarning(
        this.editor,
        "Error",
        true,
        "Unable to download the file.",
        false
      );
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
      console.log("Signed URL:", signedUrl);

      const response = await this.s3Client.send(command);
      const { Body, ContentType } = response;

      const fileExtension = fileKey.split(".").pop().toLowerCase();
      let blob = await this.readStreamToBlob(Body);

      if (["png", "jpg", "jpeg", "gif"].includes(fileExtension)) {
        const fileContents = await this.convertBlobToBase64(blob);
        this.editor.execute("insertImage", { source: fileContents });
      } else if (["mp3", "wav"].includes(fileExtension)) {
        const audioType = ContentType; // e.g., "audio/mpeg"

        // Create audio element using writer
        this.editor.model.change((writer) => {
          const insertPosition =
            this.editor.model.document.selection.getFirstPosition();
          console.log("insert position", insertPosition);

          // Create the audio element
          const audioElement = writer.createElement("audio", {
            src: signedUrl,
            type: audioType,
          });
          writer.insert(audioElement, insertPosition);
        });
      } else if (["pdf"].includes(fileExtension)) {
        console.log("pdf**", Body, ContentType);
        // Handle PDF insertion logic
      } else if (["doc", "docx"].includes(fileExtension)) {
        console.log("doc**", Body, ContentType);
        // Handle DOC/DOCX insertion logic
      } else {
        console.log("Unsupported file type", Body, ContentType);
        showWarning(
          this.editor,
          "Error",
          true,
          "Unsupported file type.",
          false
        );
        return;
      }
    } catch (error) {
      console.error("Error downloading the file:", error);
      showWarning(
        this.editor,
        "Error",
        true,
        "Unable to download the file.",
        false
      );
    }
    this.closeDialog();
  }

  async addFolder() {
    const folderNameInput = document.getElementById("folderNameInput");
    const folderName = folderNameInput.value.trim();
    if (folderName.length) {
      const dlg = document.querySelector(".s3-dialog");
      if (dlg) dlg.setAttribute("aria-busy", "true");
      await this.uploadFileToS3(folderName, "", true);
      currentFolder = folderName;
      const folderList = await this.getFolderNames(bucketName);
      const contents = await this.getFolderContents(bucketName, currentFolder);
      this.renderFileList(folderList, contents);
      const ndlg = document.querySelector(".s3-dialog");
      if (ndlg) ndlg.setAttribute("aria-busy", "false");
    } else {
      showWarning(
        this.editor,
        "Add Folder Failed",
        false,
        `Error Adding Folder: please add a folder name`,
        false
      );
    }
  }

  uploadFilesToS3() {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".mp3,.png,.pdf,.doc,.docx,.jpg,.jpeg";
    fileInput.multiple = true;

    fileInput.onchange = async (event) => {
      const files = Array.from(event.target.files);
      try {
        const dlg = document.querySelector(".s3-dialog");
        if (dlg) dlg.setAttribute("aria-busy", "true");
        await Promise.all(
          files.map((file) => this.uploadFileToS3(currentFolder, file, false))
        );
        await this.updateContent(currentFolder);
        const ndlg = document.querySelector(".s3-dialog");
        if (ndlg) ndlg.setAttribute("aria-busy", "false");
        showWarning(
          this.editor,
          "Success",
          false,
          "Files uploaded successfully!",
          false
        );
      } catch (error) {
        const ndlg = document.querySelector(".s3-dialog");
        if (ndlg) ndlg.setAttribute("aria-busy", "false");
        showWarning(
          this.editor,
          "Upload Failed",
          true,
          `Error uploading files: ${error.message}`,
          true
        );
      }
    };

    fileInput.click();
  }

  async uploadFileToS3(folderName, file, isAddFolder = false) {
    let command = {};
    if (isAddFolder) {
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
        console.log("Folder created successfully:", folderName);
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

  async deleteFile(e, fileKey) {
    e.stopPropagation();
    const dlg = document.querySelector(".s3-dialog");
    if (dlg) dlg.setAttribute("aria-busy", "true");
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
    });

    try {
      await this.s3Client.send(command);
      await this.updateContent(currentFolder);
      console.log(`File deleted successfully: ${fileKey}`);
    } catch (error) {
      console.error("Error deleting the file:", error);
      showWarning(
        this.editor,
        "Error",
        true,
        `Failed to delete file: ${error.message}`,
        true
      );
    }
    const ndlg = document.querySelector(".s3-dialog");
    if (ndlg) ndlg.setAttribute("aria-busy", "false");
  }

  async deleteFolder(e, folderKey) {
    e.stopPropagation();
    const dlg = document.querySelector(".s3-dialog");
    if (dlg) dlg.setAttribute("aria-busy", "true");
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: `${folderKey}/`,
    });

    try {
      const response = await this.s3Client.send(listCommand);
      const objectsToDelete = response.Contents.map((object) => ({
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
        showWarning(
          this.editor,
          "Error",
          true,
          `Failed to delete folder: ${error.message}`,
          true
        );
        console.log("No objects found in this folder.");
      }
    } catch (error) {
      showWarning(
        this.editor,
        "Error",
        true,
        `Failed to delete folder: ${error.message}`,
        true
      );
      console.error("Error deleting the folder:", error);
    }
    const ndlg = document.querySelector(".s3-dialog");
    if (ndlg) ndlg.setAttribute("aria-busy", "false");
  }

  getFileIcon(file) {
    const fileExtension = file.fileName.split(".").pop().toLowerCase();
    let iconUrl;

    if (["png", "jpg", "jpeg", "gif"].includes(fileExtension)) {
      return `<img src="${file.imageUrl}" alt="${file.fileName}" class="file-image"/>`;
    } else if (["mp3", "wav"].includes(fileExtension)) {
      iconUrl = audioIcon;
    } else if (["pdf"].includes(fileExtension)) {
      iconUrl = pdfIcon;
    } else if (["doc", "docx"].includes(fileExtension)) {
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
    const dialog = document.querySelector(".s3-dialog");
    if (dialog) {
      dialog.remove();
    }
  }

  refresh() {
    this.isEnabled = true;
  }
}
