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
  filesLength = 0;
  isLoading = false;
  constructor(editor, s3Client) {
    super(editor);
    this.s3Client = s3Client;

    // Cache system for reducing API calls
    this.cache = {
      folders: null,
      folderContents: new Map(), // folderName -> { data, timestamp }
      lastFetch: null,
      cacheDuration: 60000 // 1 minute cache
    };

    this.listenTo(this.editor.model.document, "change", () => this.refresh());
    window.selectFile = this.selectFile.bind(this);
    window.closeDialog = this.closeDialog.bind(this);
    window.updateContent = this.updateContent.bind(this);
    window.uploadFilesToS3 = this.uploadFilesToS3.bind(this);
    window.uploadFileToS3 = this.uploadFileToS3.bind(this);
    window.addFolder = this.addFolder.bind(this);
    window.updateFolder = this.updateFolder.bind(this);
    window.resetDialog = this.resetDialog.bind(this);
    window.deleteFile = this.deleteFile.bind(this);
    window.deleteFolder = this.deleteFolder.bind(this);
    window.getFileIcon = this.getFileIcon.bind(this);
    window.toggleTheme = this.toggleTheme.bind(this);
    this.isDarkMode = false; // Default to dark mode for "futuristic" feel
  }

  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
    const dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
      if (this.isDarkMode) {
        dialog.classList.add('dark');
      } else {
        dialog.classList.remove('dark');
      }
    }
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

  setLoading(show = true) {
    if (this.isLoading === show) return; // Prevent duplicate calls
    this.isLoading = show;

    const existingOverlay = document.getElementById('s3-loading-overlay');

    if (show) {
      // Remove existing overlay if any
      if (existingOverlay) existingOverlay.remove();

      const dialog = document.querySelector('[role="dialog"]');
      if (dialog) {
        dialog.setAttribute('aria-busy', 'true');
        // Add loading overlay to existing dialog
        const overlay = document.createElement('div');
        overlay.id = 's3-loading-overlay';
        overlay.className = 'absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white/80 dark:bg-[#1c1917]/80 backdrop-blur-sm z-50';
        overlay.innerHTML = `
          <div class="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
          <div class="font-semibold text-gray-800 dark:text-gray-200 tracking-wide">Processing...</div>
        `;
        dialog.querySelector('.relative').appendChild(overlay);
      }
    } else {
      // Hide loading overlay
      if (existingOverlay) {
        existingOverlay.remove();
      }
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog) {
        dialog.setAttribute('aria-busy', 'false');
      }
    }
  }

  showLoader() {
    if (this.isLoading) return; // Prevent showing loader if already loading
    this.isLoading = true;

    const themeClass = this.isDarkMode ? 'dark' : '';
    const dialogHTML = `
    <div class="fixed inset-0 flex items-center justify-center z-[1000] bg-gray-900/60 backdrop-blur-md transition-all duration-300 ${themeClass}" aria-busy="false" role="dialog">
        <div class="relative w-[min(1000px,92vw)] max-h-[85vh] min-h-[60vh] rounded-2xl shadow-2xl overflow-hidden flex items-center justify-center
            bg-white/90 dark:bg-[#1c1917]/95 border border-white/20 dark:border-white/10 backdrop-blur-xl transition-colors duration-300">
            <div id="fileList" class="w-full h-full flex items-center justify-center">
              <div class="flex flex-col items-center justify-center py-10 gap-4">
                <div class="relative">
                    <div class="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                    <div class="absolute inset-0 flex items-center justify-center">
                        <div class="w-8 h-8 bg-blue-500/20 rounded-full blur-md animate-pulse"></div>
                    </div>
                </div>
                <span class="text-base font-medium text-gray-600 dark:text-gray-300 tracking-wide animate-pulse">Loading files...</span>
              </div>
            </div>
        </div>
    </div>
    `
    this.closeDialog();
    document.body.insertAdjacentHTML("beforeend", dialogHTML);
  }

  async getFolderNames(bucketName, useCache = true) {
    // Check cache first
    if (useCache && this.cache.folders &&
      Date.now() - this.cache.lastFetch < this.cache.cacheDuration) {
      return this.cache.folders;
    }

    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Delimiter: "/",
    });

    try {
      const response = await this.s3Client.send(command);
      const folderNames = (response.CommonPrefixes || []).map((prefix) =>
        prefix.Prefix.replace("/", "")
      );

      // Update cache
      this.cache.folders = folderNames;
      this.cache.lastFetch = Date.now();

      return folderNames;
    } catch (error) {
      console.error("Error fetching folder names:", error);
      return [];
    }
  }

  async getFolderContents(bucketName, folderName, useCache = true) {
    // Check cache first
    if (useCache && this.cache.folderContents.has(folderName)) {
      const cached = this.cache.folderContents.get(folderName);
      if (Date.now() - cached.timestamp < this.cache.cacheDuration) {
        currentFolder = folderName;
        return cached.data;
      }
    }

    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: folderName + "/",
      Delimiter: "/",
    });
    currentFolder = folderName;

    try {
      const { Contents } = await this.s3Client.send(command);

      // Process files WITHOUT downloading them (major optimization)
      const updatedContents = Contents
        .map((item) => {
          const parts = item.Key.split("/");
          const fileName = parts[parts.length - 1];

          if (!fileName.length) return null;

          return {
            ...item,
            fileName,
            // Mark if needs preview, but don't download yet
            needsPreview: this.isImageFile(fileName)
          };
        })
        .filter(item => item !== null);

      // Cache the results
      this.cache.folderContents.set(folderName, {
        data: updatedContents,
        timestamp: Date.now()
      });

      return updatedContents;
    } catch (error) {
      console.error("Error fetching folder contents:", error);
      return [];
    }
  }

  isImageFile(fileName) {
    const ext = fileName.split(".").pop().toLowerCase();
    return ["png", "jpg", "jpeg", "gif"].includes(ext);
  }

  async getImagePreviewUrl(fileKey) {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
    });

    // Use signed URL instead of downloading - much more efficient
    return await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
  }

  renderFileList(folderList, files) {
    const themeClass = this.isDarkMode ? 'dark' : '';
    let folderListHTML = [];
    let fileListHTML = [];

    // Folder List Logic
    if (folderList.length) {
      folderListHTML = folderList
        .map(
          (folder, i) => `
                <li class="js-folder-item group p-3 my-2 rounded-xl border transition-all duration-200 flex items-center justify-between cursor-pointer
                    ${folder === currentFolder
              ? 'bg-blue-500/10 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.15)] scale-[1.02]'
              : 'bg-gray-50/50 dark:bg-white/5 border-gray-200 dark:border-white/10 hover:bg-blue-50 dark:hover:bg-white/10 hover:border-blue-300 dark:hover:border-white/20 hover:-translate-y-0.5 hover:shadow-lg'
            }">
                    <div class="flex items-center gap-3 cursor-pointer flex-1" onclick="updateContent('${folder}', ${i})">
                        <div class="w-5 h-5 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 transition-colors group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50">
                            ${folderIcon}
                        </div>
                        <span class="text-base font-semibold text-gray-700 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">${folder}</span>
                    </div>
                    <div class="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button class="p-2 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" onclick="event.stopPropagation(); deleteFolder(event, '${folder}')" title="Delete Folder">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                    </div>
                </li>
            `
        )
        .join("");
    } else {
      folderListHTML = `
            <li class="p-8 text-center rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 text-gray-400 dark:text-gray-500">
                <span class="block text-sm font-medium">No folders found</span>
            </li>
        `;
    }

    // File List Logic
    const isFileLimitReached = files.length >= 3;
    this.filesLength = files.length;
    let uploadButtonHTML;

    if (!currentFolder) {
      uploadButtonHTML = `<button class="px-4 py-2 bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-none rounded-lg cursor-not-allowed font-semibold flex items-center gap-2" disabled title="Create or select a folder to upload">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload
           </button>`;
    } else if (isFileLimitReached) {
      uploadButtonHTML = `<span class="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-3 py-1.5 rounded-full border border-amber-200 dark:border-amber-800">Limit Reached (Max 3)</span>`;
    } else {
      uploadButtonHTML = `<button class="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-none rounded-lg cursor-pointer font-semibold shadow-lg shadow-blue-500/30 transition-all hover:shadow-blue-500/50 hover:scale-105 active:scale-95 flex items-center gap-2" onclick="uploadFilesToS3()" id="uploadButton">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload
           </button>`;
    }

    if (files.length) {
      fileListHTML = `
                <div class="flex justify-between items-center mb-4 sticky top-0 bg-white/95 dark:bg-[#1c1917]/95 backdrop-blur-sm z-10 py-2 border-b border-gray-100 dark:border-white/5">
                    <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                        ${currentFolder ? `<span class="text-blue-500">/</span> ${currentFolder}` : `All Files`}
                        <span class="text-xs font-normal text-gray-400 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded-full">${files.length}/3</span>
                    </h3>
                    ${uploadButtonHTML}
                </div>
                <ul id="fileList" class="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4">
                    ${files
          .map(
            (file) => `
                        <li class="group relative p-3 rounded-xl bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 transition-all duration-200 hover:bg-white dark:hover:bg-white/10 hover:border-blue-300 dark:hover:border-blue-500/50 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-500/10 cursor-pointer overflow-hidden" onclick="selectFile('${file.Key}')">
                            <div class="aspect-video w-full rounded-lg bg-gray-200 dark:bg-black/20 overflow-hidden mb-3 flex items-center justify-center relative">
                                ${getFileIcon(file)}
                                <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 dark:group-hover:bg-white/5 transition-colors"></div>
                            </div>
                            <div class="flex items-start justify-between gap-2">
                                <span class="font-medium text-sm text-gray-700 dark:text-gray-200 truncate flex-1" title="${file.fileName}">${file.fileName}</span>
                                <button class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all opacity-0 group-hover:opacity-100" onclick="deleteFile(event, '${file.Key}')" title="Delete File">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                </button>
                            </div>
                        </li>
                    `
          )
          .join("")}
                </ul>
        `;
    } else {
      fileListHTML = ` 
            <div class="flex justify-between items-center mb-4 sticky top-0 bg-white/95 dark:bg-[#1c1917]/95 backdrop-blur-sm z-10 py-2 border-b border-gray-100 dark:border-white/5">
                <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100">${currentFolder ? `<span class="text-blue-500">/</span> ${currentFolder}` : `All Files`}</h3>
                ${uploadButtonHTML}
            </div>
            <div class="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-gray-600 border-2 border-dashed border-gray-200 dark:border-white/5 rounded-xl bg-gray-50/50 dark:bg-white/5">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="mb-4 opacity-50"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                <span class="text-sm font-medium">No files uploaded yet</span>
            </div>`;
    }

    // Folder Creation Logic (Limit to 1 folder)
    const showAddFolder = folderList.length < 1;
    const addFolderHTML = showAddFolder ? `
        <div class="mb-6">
            <div class="relative flex items-center">
                <input type="text" class="w-full pl-4 pr-12 py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl outline-none text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" id="folderNameInput" placeholder="New folder name..." />
                <button class="absolute right-2 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-lg shadow-blue-500/30" id="addFolderButton" onclick="addFolder()" title="Create Folder">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
            </div>
        </div>
    ` : `
        <!-- <div class="mb-6 p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl flex items-center gap-3 text-blue-700 dark:text-blue-300">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span class="text-sm font-medium">Folder limit reached (Max 2)</span>
        </div> -->
    `;

    const dialogHTML = `
            <div class="fixed inset-0 flex items-center justify-center z-[1000] bg-gray-900/60 backdrop-blur-md transition-all duration-300 ${themeClass}" aria-busy="false" role="dialog">
                <div class="relative w-[min(1100px,94vw)] max-h-[85vh] min-h-[60vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col
                    bg-white/95 dark:bg-[#1c1917]/95 border border-white/20 dark:border-white/10 backdrop-blur-xl transition-colors duration-300">
                    
                    <!-- Loading Overlay -->
                    <div class="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-white/80 dark:bg-[#1c1917]/80 backdrop-blur-sm opacity-0 pointer-events-none transition-opacity duration-300 group-aria-[busy=true]:opacity-100 group-aria-[busy=true]:pointer-events-auto z-50">
                        <div class="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                        <div class="font-semibold text-gray-800 dark:text-gray-200 tracking-wide">Processing...</div>
                    </div>

                    <!-- Header -->
                    <div class="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-white/5">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                            </div>
                            <h2 class="text-xl font-bold text-gray-800 dark:text-white tracking-tight">File Manager</h2>
                        </div>
                        <div class="flex items-center gap-3">
                            <!-- <button onclick="toggleTheme()" class="p-2.5 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors" title="Toggle Theme">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="hidden dark:block"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="block dark:hidden"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                            </button> -->
                            <button class="p-2.5 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors" onclick="closeDialog()" title="Close">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                    </div>

                    <!-- Body -->
                    <div class="flex-1 grid grid-cols-1 md:grid-cols-[320px_1fr] gap-0 overflow-hidden">
                        <!-- Sidebar (Folders) -->
                        <div class="bg-gray-50/50 dark:bg-black/20 border-r border-gray-100 dark:border-white/5 px-6 pt-6 pb-2 overflow-y-auto">
                            ${addFolderHTML}
                            <h3 class="mb-4 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Your Folders</h3>
                            <ul id="folderList" class="space-y-2">
                                ${folderListHTML}
                            </ul>
                        </div>
                        
                        <!-- Main Content (Files) -->
                        <div class="s3-file-section p-6 overflow-y-auto bg-white dark:bg-transparent">
                                ${fileListHTML}
                        </div>
                    </div>
                </div>
            </div>`;

    this.closeDialog();
    document.body.insertAdjacentHTML("beforeend", dialogHTML);
    this.isLoading = false; // Reset loading state

    // Load images lazily after render
    setTimeout(() => this.loadLazyImages(), 100);
  }

  async updateContent(folderName, index = null) {
    const dlg = document.querySelector('[role="dialog"]');
    if (dlg) dlg.setAttribute("aria-busy", "true");

    // Use cached data if available
    const contents = await this.getFolderContents(bucketName, folderName, true);
    const fileListElement = document.querySelector(".s3-file-section");
    fileListElement.innerHTML = "";
    if (index !== null) {
      const folderListElement = document.getElementsByClassName("js-folder-item");
      for (let item of folderListElement) {
        // Reset classes
        item.classList.remove('bg-blue-500/10', 'border-blue-500/50', 'shadow-[0_0_15px_rgba(59,130,246,0.15)]', 'scale-[1.02]');
        item.classList.add('bg-gray-50/50', 'dark:bg-white/5', 'border-gray-200', 'dark:border-white/10');
      }
      if (folderListElement[index]) {
        // Add active classes
        folderListElement[index].classList.remove('bg-gray-50/50', 'dark:bg-white/5', 'border-gray-200', 'dark:border-white/10');
        folderListElement[index].classList.add('bg-blue-500/10', 'border-blue-500/50', 'shadow-[0_0_15px_rgba(59,130,246,0.15)]', 'scale-[1.02]');
      }
    }

    let fileListHTML = ``;
    const isFileLimitReached = contents.length >= 3;
    this.filesLength = contents.length;
    let uploadButtonHTML;

    if (!currentFolder) {
      uploadButtonHTML = `<button class="px-4 py-2 bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-none rounded-lg cursor-not-allowed font-semibold flex items-center gap-2" disabled title="Create or select a folder to upload">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload
           </button>`;
    } else if (isFileLimitReached) {
      uploadButtonHTML = `<span class="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-3 py-1.5 rounded-full border border-amber-200 dark:border-amber-800">Limit Reached (Max 3)</span>`;
    } else {
      uploadButtonHTML = `<button class="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-none rounded-lg cursor-pointer font-semibold shadow-lg shadow-blue-500/30 transition-all hover:shadow-blue-500/50 hover:scale-105 active:scale-95 flex items-center gap-2" onclick="uploadFilesToS3()" id="uploadButton">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload
           </button>`;
    }

    if (contents.length) {
      fileListHTML = `
                <div class="flex justify-between items-center mb-4 sticky top-0 bg-white/95 dark:bg-[#1c1917]/95 backdrop-blur-sm z-10 py-2 border-b border-gray-100 dark:border-white/5">
                    <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                        ${currentFolder ? `<span class="text-blue-500">/</span> ${currentFolder}` : `All Files`}
                        <span class="text-xs font-normal text-gray-400 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded-full">${contents.length}/3</span>
                    </h3>
                    ${uploadButtonHTML}
                </div>
                <ul id="fileList" class="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4">
                    ${contents
          .map(
            (file) => `
                        <li class="group relative p-3 rounded-xl bg-gray-50/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 transition-all duration-200 hover:bg-white dark:hover:bg-white/10 hover:border-blue-300 dark:hover:border-blue-500/50 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-500/10 cursor-pointer overflow-hidden" onclick="selectFile('${file.Key}')">
                            <div class="aspect-video w-full rounded-lg bg-gray-200 dark:bg-black/20 overflow-hidden mb-3 flex items-center justify-center relative">
                                ${getFileIcon(file)}
                                <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 dark:group-hover:bg-white/5 transition-colors"></div>
                            </div>
                            <div class="flex items-start justify-between gap-2">
                                <span class="font-medium text-sm text-gray-700 dark:text-gray-200 truncate flex-1" title="${file.fileName}">${file.fileName}</span>
                                <button class="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all opacity-0 group-hover:opacity-100" onclick="deleteFile(event, '${file.Key}')" title="Delete File">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                </button>
                            </div>
                        </li>
                    `
          )
          .join("")}
                </ul>
        `;
    } else {
      fileListHTML = ` 
            <div class="flex justify-between items-center mb-4 sticky top-0 bg-white/95 dark:bg-[#1c1917]/95 backdrop-blur-sm z-10 py-2 border-b border-gray-100 dark:border-white/5">
                <h3 class="text-lg font-bold text-gray-800 dark:text-gray-100">${currentFolder ? `<span class="text-blue-500">/</span> ${currentFolder}` : `All Files`}</h3>
                ${uploadButtonHTML}
            </div>
            <div class="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-gray-600 border-2 border-dashed border-gray-200 dark:border-white/5 rounded-xl bg-gray-50/50 dark:bg-white/5">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="mb-4 opacity-50"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                <span class="text-sm font-medium">No files uploaded yet</span>
            </div>`;
    }

    fileListElement.innerHTML = fileListHTML;

    // Load images lazily
    setTimeout(() => this.loadLazyImages(), 100);

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
            <li class="js-folder-item group p-3 my-2 rounded-xl border transition-all duration-200 flex items-center justify-between cursor-pointer
                    ${folder === currentFolder
              ? 'bg-blue-500/10 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.15)] scale-[1.02]'
              : 'bg-gray-50/50 dark:bg-white/5 border-gray-200 dark:border-white/10 hover:bg-blue-50 dark:hover:bg-white/10 hover:border-blue-300 dark:hover:border-white/20 hover:-translate-y-0.5 hover:shadow-lg'
            }">
                    <div class="flex items-center gap-3 cursor-pointer flex-1" onclick="updateContent('${folder}', ${i})">
                        <div class="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 transition-colors group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50">
                            ${folderIcon}
                        </div>
                        <span class="text-base font-semibold text-gray-700 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">${folder}</span>
                    </div>
                    <div class="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <button class="p-2 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" onclick="event.stopPropagation(); deleteFolder(event, '${folder}')" title="Delete Folder">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                    </div>
                </li>
        `
        )
        .join("");
    } else {
      folderListHTML = `
        <li class="p-8 text-center rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 text-gray-400 dark:text-gray-500">
            <span class="block text-sm font-medium">No folders found</span>
        </li>
    `;
    }

    folderListElement.innerHTML = folderListHTML;
    if (dlg) dlg.setAttribute("aria-busy", "false");
  }


  async selectFile(fileKey) {
    console.log(`Selected file: ${fileKey}`);

    try {
      const fileExtension = fileKey.split(".").pop().toLowerCase();

      if (["png", "jpg", "jpeg", "gif"].includes(fileExtension)) {
        // For images, use signed URL (already loaded in preview)
        const signedUrl = await this.getImagePreviewUrl(fileKey);

        this.editor.execute("insertImage", { source: signedUrl });
      } else if (["mp3", "wav"].includes(fileExtension)) {
        const signedUrl = await this.getImagePreviewUrl(fileKey);

        this.editor.model.change((writer) => {
          const insertPosition = this.editor.model.document.selection.getFirstPosition();
          const audioElement = writer.createElement("audio", {
            src: signedUrl,
            type: `audio/${fileExtension === 'mp3' ? 'mpeg' : 'wav'}`,
          });
          writer.insert(audioElement, insertPosition);
        });
      } else if (["pdf", "doc", "docx"].includes(fileExtension)) {
        console.log(`${fileExtension} file selected`, fileKey);
        // Handle document insertion logic
      } else {
        showWarning(this.editor, "Error", true, "Unsupported file type.", false);
        return;
      }
    } catch (error) {
      console.error("Error selecting file:", error);
      showWarning(this.editor, "Error", true, "Unable to select the file.", false);
    }

    this.closeDialog();
  }

  async addFolder() {
    // Get input value BEFORE showing loader
    const folderNameInput = document?.getElementById("folderNameInput");
    const folderName = folderNameInput?.value?.trim();

    if (!folderName || folderName.length === 0) {
      showWarning(
        this.editor,
        "Add Folder Failed",
        false,
        `Error Adding Folder: please add a folder name`,
        false
      );
      return;
    }

    if (this.isLoading) return; // Prevent multiple calls

    try {
      this.setLoading(true);
      await this.uploadFileToS3(folderName, "", true);
      currentFolder = folderName;

      // Invalidate cache for fresh data
      this.invalidateCache();

      const folderList = await this.getFolderNames(bucketName, false);
      const contents = await this.getFolderContents(bucketName, currentFolder, false);
      this.renderFileList(folderList, contents);
    } catch (error) {
      console.error('Error adding folder:', error);
      showWarning(
        this.editor,
        "Add Folder Failed",
        true,
        `Error Adding Folder: ${error.message}`,
        false
      );
      this.setLoading(false);
    }
  }

  validateFileSize(file, maxSizeMB = 2) {
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
          }, file.type, 0.85); // 85% quality
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  uploadFilesToS3() {

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".png,.jpg,.jpeg";
    fileInput.multiple = true;

    fileInput.onchange = async (event) => {
      const files = Array.from(event.target.files).filter(file =>
        ['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)
      );

      if (files.length === 0) {
        showWarning(
          this.editor,
          "Invalid File",
          true,
          "Please select only PNG or JPG images.",
          false
        );
        return;
      }

      if (this.isLoading) return; // Prevent multiple uploads

      try {
        this.setLoading(true);

        // Process files with size validation and compression
        const processedFiles = [];
        for (const file of files) {
          if (!this.validateFileSize(file, 2)) {
            // Ask user if they want to compress
            const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
            const compress = confirm(
              `${file.name} is ${fileSizeMB}MB (max 2MB).\n\n` +
              `Would you like to compress it before uploading?`
            );

            if (compress) {
              try {
                const compressed = await this.compressImage(file, 2);
                const compressedSizeMB = (compressed.size / (1024 * 1024)).toFixed(2);
                console.log(`Compressed ${file.name} from ${fileSizeMB}MB to ${compressedSizeMB}MB`);
                processedFiles.push(compressed);
              } catch (error) {
                console.error('Compression failed:', error);
                showWarning(
                  this.editor,
                  "Compression Failed",
                  true,
                  `Failed to compress ${file.name}: ${error.message}`,
                  false
                );
              }
            } else {
              showWarning(
                this.editor,
                "File Too Large",
                true,
                `${file.name} exceeds 2MB limit and was skipped.`,
                false
              );
            }
          } else {
            processedFiles.push(file);
          }
        }

        if (processedFiles.length === 0) {
          this.setLoading(false);
          return;
        }

        // Upload processed files
        const canUpload = Math.min(3 - this.filesLength, processedFiles.length);
        await Promise.all(
          processedFiles.slice(0, canUpload).map((file) =>
            this.uploadFileToS3(currentFolder, file, false)
          )
        );

        // Invalidate cache to show new files immediately
        this.invalidateCache(currentFolder);

        await this.updateContent(currentFolder);
        this.setLoading(false);
        showWarning(
          this.editor,
          "Success",
          false,
          "Files uploaded successfully!",
          false
        );
      } catch (error) {
        this.setLoading(false);
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

  async readStreamToBlob(readableStream, contentType) {
    const response = new Response(readableStream);
    const arrayBuffer = await response.arrayBuffer();
    return new Blob([arrayBuffer], { type: contentType });
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

    if (this.isLoading) return; // Prevent multiple deletes

    try {
      this.setLoading(true);
      const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: fileKey,
      });

      await this.s3Client.send(command);

      // Invalidate cache for this folder
      this.invalidateCache(currentFolder);

      await this.updateContent(currentFolder, null);
      this.setLoading(false);
      console.log(`File deleted successfully: ${fileKey}`);
    } catch (error) {
      this.setLoading(false);
      console.error("Error deleting the file:", error);
      showWarning(
        this.editor,
        "Error",
        true,
        `Failed to delete file: ${error.message}`,
        true
      );
    }
  }

  async deleteFolder(e, folderKey) {
    e.stopPropagation();

    if (this.isLoading) return; // Prevent multiple deletes

    try {
      this.setLoading(true);
      const listCommand = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: `${folderKey}/`,
      });

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

        // Invalidate all cache since folder structure changed
        this.invalidateCache();

        await this.resetDialog();
        console.log(`Folder deleted successfully: ${folderKey}`);
      } else {
        this.setLoading(false);
        showWarning(
          this.editor,
          "Error",
          true,
          `No objects found in this folder.`,
          true
        );
        console.log("No objects found in this folder.");
      }
    } catch (error) {
      this.setLoading(false);
      showWarning(
        this.editor,
        "Error",
        true,
        `Failed to delete folder: ${error.message}`,
        true
      );
      console.error("Error deleting the folder:", error);
    }
  }

  getFileIcon(file) {
    const fileExtension = file.fileName.split(".").pop().toLowerCase();
    let iconUrl;

    if (["png", "jpg", "jpeg", "gif"].includes(fileExtension)) {
      // Use lazy loading with data attribute - image will be loaded after render
      return `<img 
        data-file-key="${file.Key}" 
        class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110 lazy-s3-image" 
        alt="${file.fileName}" 
        src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect fill='%23e5e7eb' width='100' height='100'/%3E%3C/svg%3E"
      />`;
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

  async loadLazyImages() {
    const lazyImages = document.querySelectorAll('.lazy-s3-image');

    for (const img of lazyImages) {
      const fileKey = img.getAttribute('data-file-key');
      if (fileKey) {
        try {
          const signedUrl = await this.getImagePreviewUrl(fileKey);
          img.src = signedUrl;
        } catch (error) {
          console.error('Error loading image preview:', error);
        }
      }
    }
  }

  invalidateCache(folderName = null) {
    if (folderName) {
      // Invalidate specific folder cache
      this.cache.folderContents.delete(folderName);
    } else {
      // Invalidate all cache
      this.cache.folders = null;
      this.cache.folderContents.clear();
      this.cache.lastFetch = null;
    }
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
