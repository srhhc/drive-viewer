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
            let data;
            try {
                data = await resp.json();
            } catch {
                // Not valid JSON (e.g. HTML error page) — treat as empty
                console.warn(`Folder ${folderId} returned invalid data; treating as empty.`);
                return [];
            }
            return this.processFiles(data.files || [], data.folderName || '');
        } catch (err) {
            console.warn(`Could not load folder ${folderId}:`, err.message);
            return [];
        }
    },

    // Process raw file data into enriched format
    processFiles(files, folderName) {
        return files.map(f => {
            const size = parseInt(f.size, 10) || 0;
            const modifiedTime = f.modifiedTime || '';
            return {
                id: f.id,
                name: f.name,
                size: size,
                mimeType: f.mimeType || '',
                modifiedTime: modifiedTime,
                createdTime: f.createdTime || '',
                thumbnailLink: f.thumbnailLink || '',
                webViewLink: f.webViewLink || '',
                webContentLink: f.webContentLink || '',
                path: f.path || '',
                folderName: folderName,
                durationMs: parseInt(f.durationMs, 10) || 0,
                width: f.width || 0,
                height: f.height || 0,
                // Derived properties
                extension: getFileExtension(f.name),
                isVideo: isVideoFile(f.name, f.mimeType),
                isAudio: isAudioFile(f.name, f.mimeType),
                sizeFormatted: formatFileSize(size),
                dateFormatted: formatDate(modifiedTime),
                icon: getFileIcon(f.name, f.mimeType),
                isNew: isRecentlyAdded(f.createdTime || modifiedTime),
                durationFormatted: formatDuration(parseInt(f.durationMs, 10) || 0),
                qualityLabel: getQualityLabel(f.width, f.height)
            };
        });
    },

    // Build a folder tree from file paths
    // Returns: { name, path, fileCount, children: [...] }
    buildFolderTree(files) {
        const root = { name: 'הכל', path: '', fileCount: 0, children: {} };

        for (const file of files) {
            const parts = file.path ? file.path.split('/') : [];
            let current = root;

            // Count files at each level
            for (let i = 0; i <= parts.length; i++) {
                current.fileCount++;
                if (i < parts.length) {
                    const part = parts[i];
                    const childPath = parts.slice(0, i + 1).join('/');
                    if (!current.children[part]) {
                        current.children[part] = { name: part, path: childPath, fileCount: 0, children: {} };
                    }
                    current = current.children[part];
                }
            }
        }

        // Convert children objects to sorted arrays
        function toArray(node) {
            const children = Object.values(node.children)
                .map(toArray)
                .sort((a, b) => a.name.localeCompare(b.name, 'he'));
            return { name: node.name, path: node.path, fileCount: node.fileCount, children };
        }

        return toArray(root);
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

function isAudioFile(name, mimeType) {
    if (mimeType && mimeType.startsWith('audio/')) return true;
    const ext = getFileExtension(name);
    return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'opus'].includes(ext);
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

function isRecentlyAdded(dateStr) {
    if (!dateStr) return false;
    try {
        const date = new Date(dateStr);
        const diffMs = Date.now() - date.getTime();
        return diffMs >= 0 && diffMs < CONFIG.newDaysThreshold * 24 * 60 * 60 * 1000;
    } catch { return false; }
}

function formatDuration(ms) {
    if (!ms) return '';
    const totalSec = Math.round(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    if (hours > 0) return hours + ':' + String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    return minutes + ':' + String(seconds).padStart(2, '0');
}

function getQualityLabel(width, height) {
    if (!width || !height) return '';
    if (height >= 2160 || width >= 3840) return '4K';
    if (height >= 1080 || width >= 1920) return 'HD';
    if (height >= 720 || width >= 1280) return '720p';
    if (height >= 480 || width >= 854) return '480p';
    if (height >= 360) return '360p';
    return '';
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

/**
 * Get a direct image URL from a Drive thumbnail at the requested size.
 * Drive thumbnails use the =sNNN suffix to control resolution.
 */
function getImageUrl(file, size) {
    if (file.thumbnailLink) {
        return file.thumbnailLink.replace(/=s\d+/, '=s' + (size || 640));
    }
    return file.webViewLink || getDrivePreviewUrl(file.id);
}
