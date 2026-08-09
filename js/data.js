/* ============================================
   דרייב-צפייה — Data Layer
   Manifest loading, cache, state, utilities
   ============================================ */

const DataStore = {
    // State
    folders: [],            // All top-level folders from manifest
    currentFolderId: null,  // Currently selected folder ID
    currentFiles: [],       // Files in current folder (processed)
    allFiles: [],           // All files across folders (for search)
    lastUpdated: null,      // Timestamp of last manifest update
    fuseInstance: null,     // Fuse.js search instance
    isLoading: false,

    // Load manifest index (folder list + search data)
    async loadIndex() {
        const indexPath = `${CONFIG.dataBasePath}/index.json`;
        try {
            const resp = await fetch(indexPath, { cache: 'no-cache' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            this.folders = data.folders || [];
            this.lastUpdated = data.lastUpdated || null;
            return data;
        } catch (err) {
            console.error('Failed to load index:', err);
            throw err;
        }
    },

    // Load files for a specific folder (returns empty array if folder file missing)
    async loadFolderFiles(folderId) {
        const folderPath = `${CONFIG.dataBasePath}/folder_${folderId}.json`;
        try {
            const resp = await fetch(folderPath, { cache: 'no-cache' });
            if (!resp.ok) {
                // 404 = folder file not generated yet, that's OK — return empty
                if (resp.status === 404) {
                    console.warn(`Folder data not yet generated for ${folderId}`);
                    return [];
                }
                throw new Error(`HTTP ${resp.status}`);
            }
            const data = await resp.json();
            return this.processFiles(data.files || [], data.folderName || '');
        } catch (err) {
            console.warn(`Could not load folder ${folderId}:`, err.message);
            return [];
        }
    },

    // Process raw file data into enriched format
    processFiles(files, folderName) {
        return files.map(f => ({
            id: f.id,
            name: f.name,
            size: f.size || 0,
            mimeType: f.mimeType || '',
            modifiedTime: f.modifiedTime || '',
            thumbnailLink: f.thumbnailLink || '',
            webViewLink: f.webViewLink || '',
            webContentLink: f.webContentLink || '',
            folderName: folderName,
            // Derived properties
            extension: getFileExtension(f.name),
            isVideo: isVideoFile(f.name, f.mimeType),
            sizeFormatted: formatFileSize(f.size),
            dateFormatted: formatDate(f.modifiedTime),
            icon: getFileIcon(f.name, f.mimeType)
        }));
    },

    // Load all files from all folders (for search)
    async loadAllFiles() {
        const allFiles = [];
        for (const folder of this.folders) {
            try {
                const files = await this.loadFolderFiles(folder.id);
                allFiles.push(...files);
            } catch (err) {
                console.warn(`Skipping folder ${folder.id}:`, err);
            }
        }
        this.allFiles = allFiles;
        return allFiles;
    },

    // Get files for current folder (from cache or load)
    async getFilesForFolder(folderId) {
        if (this.currentFolderId === folderId && this.currentFiles.length > 0) {
            return this.currentFiles;
        }
        const folder = this.folders.find(f => f.id === folderId);
        const files = await this.loadFolderFiles(folderId);
        this.currentFolderId = folderId;
        this.currentFiles = files;
        return files;
    },

    // Initialize: load index
    async init() {
        this.isLoading = true;
        try {
            await this.loadIndex();
            // Update last updated display
            if (this.lastUpdated) {
                const el = document.getElementById('lastUpdated');
                if (el) el.textContent = formatDate(this.lastUpdated);
            }
            return true;
        } catch (err) {
            console.error('DataStore init failed:', err);
            return false;
        } finally {
            this.isLoading = false;
        }
    }
};

/* --- Utility Functions --- */

function getFileExtension(filename) {
    if (!filename) return '';
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function isVideoFile(name, mimeType) {
    if (mimeType && mimeType.startsWith('video/')) return true;
    const ext = getFileExtension(name);
    return CONFIG.videoExtensions.includes(ext);
}

function getFileIcon(name, mimeType) {
    if (mimeType) {
        if (mimeType.startsWith('video/')) return CONFIG.fileIcons.video;
        if (mimeType.startsWith('audio/')) return CONFIG.fileIcons.audio;
        if (mimeType.startsWith('image/')) return CONFIG.fileIcons.image;
        if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text/') || mimeType.includes('spreadsheet') || mimeType.includes('presentation')) return CONFIG.fileIcons.document;
        if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive') || mimeType.includes('compress')) return CONFIG.fileIcons.archive;
    }
    const ext = getFileExtension(name);
    if (CONFIG.videoExtensions.includes(ext)) return CONFIG.fileIcons.video;
    return CONFIG.fileIcons.default;
}

function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++;
    }
    return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'היום';
        if (diffDays === 1) return 'אתמול';
        if (diffDays < 7) return `לפני ${diffDays} ימים`;
        if (diffDays < 30) return `לפני ${Math.floor(diffDays / 7)} שבועות`;

        return date.toLocaleDateString('he-IL', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch {
        return dateStr;
    }
}

function getDrivePreviewUrl(fileId) {
    return CONFIG.drivePreviewUrl.replace('{id}', fileId);
}

function getDriveDownloadUrl(fileId) {
    return CONFIG.driveDownloadUrl.replace('{id}', fileId);
}
