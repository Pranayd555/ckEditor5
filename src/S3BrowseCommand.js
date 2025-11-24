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
    <div class="fixed inset-0 flex items-center justify-center z-[1000] bg-gray-900/55 backdrop-blur-sm" aria-busy="false" role="dialog">
                <div class="relative bg-white w-[min(1000px,92vw)] max-h-[85vh] min-h-[60vh] rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex items-center justify-center">
            <div id="fileList" class="w-full h-full flex items-center justify-center">
              <div class="flex flex-col items-center justify-center py-10 gap-2.5">
                <div class="w-10 h-10 border-4 border-black/15 border-t-blue-500 rounded-full animate-spin"></div>
                <span class="text-sm font-medium text-gray-700/85">Loading files...</span>
              </div>
            </div>
            </div>
            </div>
                    `
    this.closeDialog();
    // this.addDialogStyles(); // Removed custom styles
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
                <li class="js-folder-item p-3 my-2 rounded-lg bg-gray-50 border border-gray-200 transition flex items-center justify-between hover:bg-blue-50 hover:border-blue-300 hover:-translate-y-px hover:shadow-md cursor-pointer ${folder === currentFolder ? 'bg-orange-100/30 scale-102' : ''}">
                    <div class="flex items-center gap-2.5 cursor-pointer" onclick="updateContent('${folder}', ${i})">
                        <div class="w-10 h-[22px] inline-flex shrink-0 items-center justify-center text-gray-500">${folderIcon}</div>
                        <span class="text-base font-bold text-gray-700">${folder}</span>
                    </div>
                    <div class="flex justify-end">
                        <button class="px-3 py-2 bg-red-500 text-white border-none rounded-lg cursor-pointer ml-2.5 font-semibold transition hover:bg-red-600 hover:shadow-lg hover:scale-102" onclick="event.stopPropagation(); deleteFolder(event, '${folder}')">Delete</button>
                    </div>
                </li>
            `
        )
        .join("");
    } else {
      folderListHTML = `
            <li class="p-3 my-2 rounded-lg bg-gray-50 border border-gray-200">
                <span class="text-gray-500">No folders found</span>
            </li>
        `;
    }

    if (files.length) {
      fileListHTML = `
                <div class="flex justify-between items-center mb-2.5">
                <h3 class="mb-3 text-base font-semibold text-gray-900">${currentFolder ? `${currentFolder} - Files` : `All Files`}</h3>
                <button class="px-3 py-2 bg-blue-600 text-white border-none rounded-lg cursor-pointer ml-2.5 font-semibold transition hover:bg-blue-700 hover:shadow-lg hover:scale-102" onclick="uploadFilesToS3()" id="uploadButton">Upload</button>
                </div>
                    <ul id="fileList" class="list-none p-0 m-0">
                        ${files
          .map(
            (file) => `
                            <li class="p-3 my-2 rounded-lg bg-gray-50 border border-gray-200 transition flex items-center justify-between hover:bg-blue-50 hover:border-blue-300 hover:-translate-y-px hover:shadow-md cursor-pointer">
                                <div class="flex items-center gap-2.5 flex-1" data-file="${file.key}" onclick="selectFile('${file.Key
              }')">
                                    ${getFileIcon(file)}
                                    <span class="font-semibold ml-2.5 text-gray-800 break-words whitespace-normal overflow-wrap-anywhere">${file.fileName
              }</span>
                                </div>
                                <div class="flex gap-2">
                                    <button class="px-3 py-2 bg-red-500 text-white border-none rounded-lg cursor-pointer ml-2.5 font-semibold transition hover:bg-red-600 hover:shadow-lg hover:scale-102" onclick="deleteFile(event, '${file.Key
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
            <div class="flex justify-between items-center mb-2.5">
            <h3 class="mb-3 text-base font-semibold text-gray-900">${currentFolder ? `${currentFolder} - Files` : `All Files`}</h3>
            <button class="px-3 py-2 bg-blue-600 text-white border-none rounded-lg cursor-pointer ml-2.5 font-semibold transition hover:bg-blue-700 hover:shadow-lg hover:scale-102" onclick="uploadFilesToS3()" id="uploadButton">Upload</button>
            </div>
            <ul id="fileList" class="list-none p-0 m-0">
                <li class="p-3 my-2 rounded-lg bg-gray-50 border border-gray-200">
                    <span class="text-gray-500">No files found</span>
                </li>
            </ul>`;
    }

    const dialogHTML = `
            <div class="fixed inset-0 flex items-center justify-center z-[1000] bg-gray-900/55 backdrop-blur-sm" aria-busy="false" role="dialog">
                <div class="relative bg-white w-[min(1000px,92vw)] max-h-[85vh] min-h-[60vh] rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
                    <div class="absolute inset-0 flex items-center justify-center gap-3 bg-white/65 opacity-0 pointer-events-none transition-opacity duration-200 group-aria-[busy=true]:opacity-100 group-aria-[busy=true]:pointer-events-auto z-50">
                        <div class="w-7 h-7 rounded-full border-[3px] border-blue-300 border-t-blue-600 animate-spin"></div>
                        <div class="font-semibold text-gray-900">Loading</div>
                    </div>
                    <span class="absolute right-3.5 top-2.5 cursor-pointer text-xl text-gray-500 hover:text-red-500 hover:scale-110 transition-transform z-10" onclick="closeDialog()">&times;</span>
                    <h2 class="text-xl font-bold pt-4 px-5 text-gray-900">File Manager</h2>
                    <div class="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4 p-5">
                        <div class="bg-white border border-gray-200 rounded-xl p-4 overflow-y-auto max-h-[400px]">
                            <input type="text" class="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-400/35" id="folderNameInput" placeholder="Enter folder name" />
                            <div class="flex justify-end items-center mt-1.5">
                            <button class="px-3 py-2 bg-blue-600 text-white border-none rounded-lg cursor-pointer ml-2.5 font-semibold transition hover:bg-blue-700 hover:shadow-lg hover:scale-102 mt-[5px]" id="addFolderButton" onclick="addFolder()">Add Folder</button>
                            </div>
                            <h3 class="mb-3 text-base font-semibold text-gray-900">Folders</h3>
                            <ul id="folderList" class="list-none p-0 m-0">
                                ${folderListHTML}
                            </ul>
                        </div>
                        <div class="s3-file-section bg-white border border-gray-200 rounded-xl p-4 overflow-y-auto max-h-[400px]">
                                ${fileListHTML}
                        </div>
                    </div>
                </div>
            </div>`;

    this.closeDialog();
    document.body.insertAdjacentHTML("beforeend", dialogHTML);
    // this.addDialogStyles(); // Removed
  }

  // addDialogStyles removed


  async updateContent(folderName, index = null) {
    const dlg = document.querySelector('[role="dialog"]'); // Updated selector
    if (dlg) dlg.setAttribute("aria-busy", "true");
    const contents = await this.getFolderContents(bucketName, folderName);
    const fileListElement = document.querySelector(".s3-file-section");
    fileListElement.innerHTML = "";
    if (index !== null) {
      const folderListElement = document.getElementsByClassName("js-folder-item");
      // Remove active classes from all items (or specifically the previously selected one if we tracked it, but iterating is fine for small lists)
      // Actually, we can just find the one with the active class.
      // But let's just loop or find the one with the specific class.
      for (let item of folderListElement) {
        if (item.classList.contains('bg-orange-100/30')) {
          item.classList.remove('bg-orange-100/30', 'scale-102');
        }
      }
      // Add active classes to the new one
      if (folderListElement[index]) {
        folderListElement[index].classList.add('bg-orange-100/30', 'scale-102');
      }
    }
    let fileListHTML = ``;
    if (contents.length) {
      fileListHTML = `
      <div class="flex justify-between items-center mb-2.5">
        <h3 class="mb-3 text-base font-semibold text-gray-900">${currentFolder ? `${currentFolder} - Files` : `All Files`}</h3>
        <button class="px-3 py-2 bg-blue-600 text-white border-none rounded-lg cursor-pointer ml-2.5 font-semibold transition hover:bg-blue-700 hover:shadow-lg hover:scale-102" onclick="uploadFilesToS3()" id="uploadButton">Upload</button>
        </div>
                    <ul id="fileList" class="list-none p-0 m-0">
                        ${contents
          .map(
            (file) => `
                            <li class="p-3 my-2 rounded-lg bg-gray-50 border border-gray-200 transition flex items-center justify-between hover:bg-blue-50 hover:border-blue-300 hover:-translate-y-px hover:shadow-md cursor-pointer" data-file="${file.Key}" onclick="selectFile('${file.Key
              }')">
                                <div class="flex items-center gap-2.5 flex-1">
                                    ${getFileIcon(file)}
                                    <span class="font-semibold ml-2.5 text-gray-800 break-words whitespace-normal overflow-wrap-anywhere">${file.fileName
              }</span>
                                </div>
                                <div class="flex gap-2">
                                    <button class="px-3 py-2 bg-red-500 text-white border-none rounded-lg cursor-pointer ml-2.5 font-semibold transition hover:bg-red-600 hover:shadow-lg hover:scale-102" onclick="deleteFile(event, '${file.Key
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
      <div class="flex justify-between items-center mb-2.5">
        <h3 class="mb-3 text-base font-semibold text-gray-900">${currentFolder ? `${currentFolder} - Files` : `All Files`}</h3>
        <button class="px-3 py-2 bg-blue-600 text-white border-none rounded-lg cursor-pointer ml-2.5 font-semibold transition hover:bg-blue-700 hover:shadow-lg hover:scale-102" onclick="uploadFilesToS3()" id="uploadButton">Upload</button>
        </div>
        <ul id="fileList" class="list-none p-0 m-0">
            <li class="p-3 my-2 rounded-lg bg-gray-50 border border-gray-200">
                <span class="text-gray-500">No files found</span>
            </li>
        </ul>
        `;
    }

    fileListElement.innerHTML = fileListHTML;
    if (dlg) dlg.setAttribute("aria-busy", "false");
  }

  async updateFolder() {
    const dlg = document.querySelector('[role="dialog"]');
    if (dlg) dlg.setAttribute("aria-busy", "true");
    const contents = await this.getFolderNames(bucketName);
    const folderListElement = document.getElementById("folderList");
    folderListElement.innerHTML = "";

    let folderListHTML = ``;
    if (contents.length) {
      folderListHTML = contents
        .map(
          (folder, i) => `
            <li class="js-folder-item p-3 my-2 rounded-lg bg-gray-50 border border-gray-200 transition flex items-center justify-between hover:bg-blue-50 hover:border-blue-300 hover:-translate-y-px hover:shadow-md cursor-pointer ${folder === currentFolder ? 'bg-orange-100/30 scale-102' : ''}">
                    <div class="flex items-center gap-2.5 cursor-pointer" onclick="updateContent('${folder}', ${i})">
                        <div class="w-10 h-[22px] inline-flex shrink-0 items-center justify-center text-gray-500">${folderIcon}</div>
                        <span class="text-base font-bold text-gray-700">${folder}</span>
                    </div>
                    <div class="flex justify-end">
                        <button class="px-3 py-2 bg-red-500 text-white border-none rounded-lg cursor-pointer ml-2.5 font-semibold transition hover:bg-red-600 hover:shadow-lg hover:scale-102" onclick="event.stopPropagation(); deleteFolder(event, '${folder}')">Delete</button>
                    </div>
                </li>
        `
        )
        .join("");
    } else {
      folderListHTML = `
        <li class="p-3 my-2 rounded-lg bg-gray-50 border border-gray-200">
            <span class="text-gray-500">No folders found</span>
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
      const dlg = document.querySelector('[role="dialog"]');
      if (dlg) dlg.setAttribute("aria-busy", "true");
      await this.uploadFileToS3(folderName, "", true);
      currentFolder = folderName;
      const folderList = await this.getFolderNames(bucketName);
      const contents = await this.getFolderContents(bucketName, currentFolder);
      this.renderFileList(folderList, contents);
      const ndlg = document.querySelector('[role="dialog"]');
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
        const dlg = document.querySelector('[role="dialog"]');
        if (dlg) dlg.setAttribute("aria-busy", "true");
        await Promise.all(
          files.map((file) => this.uploadFileToS3(currentFolder, file, false))
        );
        await this.updateContent(currentFolder);
        const ndlg = document.querySelector('[role="dialog"]');
        if (ndlg) ndlg.setAttribute("aria-busy", "false");
        showWarning(
          this.editor,
          "Success",
          false,
          "Files uploaded successfully!",
          false
        );
      } catch (error) {
        const ndlg = document.querySelector('[role="dialog"]');
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
    const dlg = document.querySelector('[role="dialog"]');
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
    const ndlg = document.querySelector('[role="dialog"]');
    if (ndlg) ndlg.setAttribute("aria-busy", "false");
  }

  async deleteFolder(e, folderKey) {
    e.stopPropagation();
    const dlg = document.querySelector('[role="dialog"]');
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
    const ndlg = document.querySelector('[role="dialog"]');
    if (ndlg) ndlg.setAttribute("aria-busy", "false");
  }

  getFileIcon(file) {
    const fileExtension = file.fileName.split(".").pop().toLowerCase();
    let iconUrl;

    if (["png", "jpg", "jpeg", "gif"].includes(fileExtension)) {
      return `<img src="${file.imageUrl}" alt="${file.fileName}" class="max-w-[clamp(160px,35vw,260px)] max-h-[200px] rounded-lg"/>`;
    } else if (["mp3", "wav"].includes(fileExtension)) {
      iconUrl = audioIcon;
    } else if (["pdf"].includes(fileExtension)) {
      iconUrl = pdfIcon;
    } else if (["doc", "docx"].includes(fileExtension)) {
      iconUrl = docsIcon;
    } else {
      iconUrl = defaultIcon;
    }

    return `<div class="w-10 h-[22px] inline-flex shrink-0 items-center justify-center">${iconUrl}</div>`;
  }

  async resetDialog() {
    const folderList = await this.getFolderNames(bucketName);
    const contents = await this.getFolderContents(bucketName, folderList[0]);
    currentFolder = folderList[0];
    this.renderFileList(folderList, contents);
  }

  closeDialog() {
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
      dialog.remove();
    }
  }

  refresh() {
    this.isEnabled = true;
  }
}
