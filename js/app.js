/* ============================================
   דרייב-צפייה — Main Application
   Orchestration & event coordination
   ============================================ */

const App = {
    searchQuery: '',
    isSearchMode: false,
    currentPath: '',
    folderTree: null,
    typeFilter: 'all',   // 'all' | 'video' | 'audio' | 'image' | 'document'

    currentDisplayFiles: [],
    lastSearchFiles: [],

    async init() {
        UI.init();
        VideoPlayer.init();
        this._initLightbox();
        this._initHistory();
        this._initDeepLinks();

        UI.showState('loading');

        const success = await DataStore.init();
        if (!success) {
            UI.showError('לא ניתן לטעון את רשימת התיקיות. אנא ודאו שקובץ ה-index.json קיים ונסו שוב.');
            return;
        }

        UI.renderFolderTree(null, null, '');

        const hash = location.hash;
        if (hash && hash !== '#/') {
            // Deep link — navigate to it
            await this._handleHash();
            if (!this._hashHandledFolder) {
                const lastFolder = localStorage.getItem(CONFIG.lastFolderKey);
                if (lastFolder && DataStore.folders.find(f => f.id === lastFolder)) {
                    await this.selectFolder(lastFolder);
                } else if (DataStore.folders.length > 0) {
                    await this.selectFolder(DataStore.folders[0].id);
                }
            }
        } else {
            const lastFolder = localStorage.getItem(CONFIG.lastFolderKey);
            if (lastFolder && DataStore.folders.find(f => f.id === lastFolder)) {
                await this.selectFolder(lastFolder);
            } else if (DataStore.folders.length > 0) {
                await this.selectFolder(DataStore.folders[0].id);
            } else {
                UI.showState('welcome');
            }
        }
    },

    goHome() {
        if (DataStore.currentFolderId) {
            this.currentPath = '';
            this._refreshView();
            this._updateHash();
        } else if (DataStore.folders.length > 0) {
            this.selectFolder(DataStore.folders[0].id);
        }
    },

    /* --- What's new view --- */
    recentMode: false,

    async showRecent() {
        UI.showState('loading');
        try {
            const files = await DataStore.loadRecentFiles();
            this.recentMode = true;
            this.isSearchMode = false;
            this.searchQuery = '';
            UI.renderFolderTree(null, null, '');
            UI.renderBreadcrumb(null, '');
            document.getElementById('breadcrumb').insertAdjacentHTML('beforeend',
                '<span class="breadcrumb-separator">/</span><span class="breadcrumb-recent"><i class="fas fa-bolt"></i> מה חדש באתר</span>');
            UI.matchHighlights = {};
            this.lastSearchFiles = files;
            this.displayFiles(files, false);
        } catch (err) {
            UI.showError('לא ניתן לטעון את הקבצים החדשים: ' + err.message);
        }
    },

    playFile(file) {
        // Open in player with the current view as the queue
        VideoPlayer.open(file, this.currentDisplayFiles);
    },

    /* --- Image lightbox --- */
    _initLightbox() {
        this.lightbox = {
            modal: document.getElementById('lightboxModal'),
            img: document.getElementById('lightboxImage'),
            title: document.getElementById('lightboxTitle'),
            download: document.getElementById('lightboxDownload')
        };
        document.getElementById('lightboxClose').addEventListener('click', () => this.closeLightbox());
        this.lightbox.modal.addEventListener('click', (e) => {
            if (e.target === this.lightbox.modal) this.closeLightbox();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.lightbox.modal.style.display !== 'none') this.closeLightbox();
        });
    },

    openLightbox(file) {
        this.lightbox.title.textContent = file.name;
        this.lightbox.img.src = getImageUrl(file, 1600);
        this.lightbox.download.href = getDriveDownloadUrl(file.id);
        this.lightbox.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },

    closeLightbox() {
        this.lightbox.modal.style.display = 'none';
        this.lightbox.img.src = '';
        document.body.style.overflow = '';
    },

    /* --- Watch history --- */
    _initHistory() {
        this.historyEls = {
            section: document.getElementById('historySection'),
            list: document.getElementById('historyList'),
            clear: document.getElementById('historyClear')
        };
        this.historyEls.clear.addEventListener('click', () => {
            localStorage.removeItem(CONFIG.historyKey);
            this.refreshHistory();
        });
        this.refreshHistory();
    },

    refreshHistory() {
        if (!this.historyEls) return;
        let history = [];
        try { history = JSON.parse(localStorage.getItem(CONFIG.historyKey) || '[]'); } catch (e) {}

        if (!history.length) {
            this.historyEls.section.style.display = 'none';
            return;
        }
        this.historyEls.section.style.display = '';
        this.historyEls.list.innerHTML = history.map(h => {
            const icon = h.isAudio ? 'fa-music' : (h.isVideo ? 'fa-film' : 'fa-image');
            return '<div class="history-item" data-id="' + h.id + '" title="' + this._esc(h.name) + '">'
                + '<i class="fas ' + icon + '"></i>'
                + '<span class="history-name">' + this._esc(h.name) + '</span>'
                + '</div>';
        }).join('');

        this.historyEls.list.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                const h = history.find(x => x.id === item.dataset.id);
                if (!h) return;
                // Reconstruct a minimal file object and open the player
                const file = {
                    id: h.id,
                    name: h.name,
                    mimeType: h.mimeType || '',
                    isVideo: h.isVideo,
                    isAudio: h.isAudio,
                    path: h.path || '',
                    webViewLink: 'https://drive.google.com/file/d/' + h.id + '/view',
                    sizeFormatted: '',
                    dateFormatted: '',
                    icon: ''
                };
                if (h.isVideo || h.isAudio) {
                    VideoPlayer.open(file, []);
                } else if (h.mimeType.startsWith('image/')) {
                    this.openLightbox(file);
                }
            });
        });
    },

    _esc(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    },

    /* --- Deep links (#/folderId/path...) --- */
    _initDeepLinks() {
        window.addEventListener('hashchange', () => this._handleHash());
    },

    async _handleHash() {
        const hash = location.hash;
        if (!hash || hash === '#/') return;
        const parts = hash.replace(/^#\//, '').split('/').map(decodeURIComponent);
        const folderId = parts[0];
        if (!folderId || !DataStore.folders.find(f => f.id === folderId)) return;
        const path = parts.slice(1).join('/');
        await this.selectFolder(folderId);
        this._hashHandledFolder = folderId;
        if (path) {
            this.navigateToPath(path);
        }
    },

    _updateHash() {
        if (!DataStore.currentFolderId) return;
        let hash = '#/' + DataStore.currentFolderId;
        if (this.currentPath) {
            hash += '/' + this.currentPath.split('/').map(encodeURIComponent).join('/');
        }
        if (location.hash !== hash) {
            history.replaceState(null, '', hash);
        }
    },

    navigateToPath(path) {
        this.currentPath = path;
        this._refreshView();
    },

    async selectFolder(folderId) {
        if (!folderId) return;

        if (this.isSearchMode) this.clearSearch();

        this.searchQuery = '';
        this.isSearchMode = false;
        this.recentMode = false;
        this.currentPath = '';

        UI.showState('loading');
        UI.closeSidebar();

        try {
            const files = await DataStore.getFilesForFolder(folderId);
            localStorage.setItem(CONFIG.lastFolderKey, folderId);
            this.folderTree = DataStore.buildFolderTree(files);

            if (files.length === 0) {
                UI.showState('empty');
                UI.els.resultsCount.textContent = '0 קבצים';
                UI.renderFolderTree(folderId, this.folderTree, '');
                UI.renderBreadcrumb(folderId, '');
            } else {
                this._refreshView();
            }
        } catch (err) {
            UI.showError('שגיאה בטעינת הקבצים: ' + err.message);
        }
    },

    _refreshView() {
        const folderId = DataStore.currentFolderId;
        if (!folderId) return;

        UI.renderFolderTree(folderId, this.folderTree, this.currentPath);
        UI.renderBreadcrumb(folderId, this.currentPath);
        this._updateHash();

        let files = DataStore.currentFiles;
        if (this.currentPath) {
            // Include descendants (files in subfolders of this path)
            const prefix = this.currentPath + '/';
            files = files.filter(f => f.path === this.currentPath || f.path.startsWith(prefix));
        }

        if (files.length === 0) {
            UI.showState('empty');
            UI.els.resultsCount.textContent = '0 קבצים';
            UI.els.loadMoreWrap.style.display = 'none';
        } else {
            this.displayFiles(files, false);
        }
    },

    /* --- Type filter --- */
    setTypeFilter(filter) {
        this.typeFilter = filter;
        this.renderCurrentFiles();
    },

    _applyTypeFilter(files) {
        if (this.typeFilter === 'all') return files;
        const mimePrefix = {
            video: 'video/',
            audio: 'audio/',
            image: 'image/',
            document: ['application/pdf', 'application/msword', 'application/vnd.google-apps.document', 'application/vnd.google-apps.spreadsheet', 'application/vnd.google-apps.presentation', 'text/']
        }[this.typeFilter];

        return files.filter(f => {
            if (Array.isArray(mimePrefix)) {
                return mimePrefix.some(p => f.mimeType.startsWith(p));
            }
            return f.mimeType.startsWith(mimePrefix);
        });
    },

    /* --- Search --- */
    async handleSearchInput() {
        const query = UI.els.searchInput.value;
        UI.els.searchClear.style.display = query ? 'block' : 'none';
        this.searchQuery = query;

        if (!query || query.length < CONFIG.searchMinChars) {
            this.isSearchMode = false;
            if (DataStore.currentFolderId) this._refreshView();
            return;
        }

        if (!SearchEngine.isIndexReady) {
            UI.showState('loading');
            const loadingText = UI.els.loadingState.querySelector('span');
            if (loadingText) loadingText.textContent = 'מכין חיפוש...';
            try {
                let searchFiles = null;
                try {
                    searchFiles = await DataStore.loadSearchIndex();
                } catch (e) {
                    // Fall back to loading all folder files
                    searchFiles = await DataStore.loadAllFiles();
                }
                SearchEngine.buildIndex(searchFiles);
                DataStore.allFiles = searchFiles;
            } catch (err) {
                UI.showError('שגיאה בבניית אינדקס החיפוש.');
                return;
            } finally {
                if (loadingText) loadingText.textContent = 'טוען קבצים...';
            }
        }

        SearchEngine.debounceSearch(query, (results) => {
            this.handleSearchResults(results);
        });
    },

    handleSearchResults(results) {
        if (results === null) { this.isSearchMode = false; return; }

        this.isSearchMode = true;
        UI.renderFolderTree(null, null, '');
        UI.renderBreadcrumb(null, '');

        if (results.length === 0) {
            UI.showState('empty');
            UI.els.resultsCount.textContent = 'לא נמצאו תוצאות';
            UI.els.loadMoreWrap.style.display = 'none';
            UI.els.emptyState.innerHTML = '<div class="empty-icon"><i class="fas fa-search"></i></div><h3>לא נמצאו תוצאות</h3><p>נסו מונח חיפוש אחר.</p>';
            return;
        }

        UI.els.emptyState.innerHTML = '<div class="empty-icon"><i class="fas fa-folder-open"></i></div><h3>אין קבצים בתיקייה זו</h3>';

        // Build highlight map: fileId -> first match indices
        const highlights = {};
        results.forEach(r => {
            if (!highlights[r.item.id] && r.matches) {
                const nameMatch = r.matches.find(m => m.key === 'name');
                if (nameMatch && nameMatch.indices) {
                    highlights[r.item.id] = { indices: nameMatch.indices };
                }
            }
        });
        UI.matchHighlights = highlights;

        const files = results.map(r => r.item);
        this.lastSearchFiles = files;
        this.displayFiles(files, true);
    },

    clearSearch() {
        this.searchQuery = '';
        this.isSearchMode = false;
        this.recentMode = false;
        UI.els.searchInput.value = '';
        UI.els.searchClear.style.display = 'none';
        UI.matchHighlights = {};

        if (DataStore.currentFolderId) {
            this.selectFolder(DataStore.currentFolderId);
        }
    },

    /* --- Rendering --- */
    renderCurrentFiles() {
        let files;
        if (this.recentMode) {
            files = this.lastSearchFiles;
        } else if (this.isSearchMode) {
            files = this.searchQuery ? this.lastSearchFiles : [];
        } else {
            files = DataStore.currentFiles;
            if (this.currentPath) {
                const prefix = this.currentPath + '/';
                files = files.filter(f => f.path === this.currentPath || f.path.startsWith(prefix));
            }
        }
        this.displayFiles(files, this.isSearchMode || this.recentMode);
    },

    displayFiles(files, isFiltered) {
        const filtered = this._applyTypeFilter(files);
        const sorted = UI.sortFiles(filtered);
        this.currentDisplayFiles = sorted;

        UI.currentPage = 1;
        UI.visibleCount = Math.min(CONFIG.initialBatch, sorted.length);
        UI.showState('content');
        UI.renderFiles(sorted, isFiltered);
    },

    loadMore() {
        UI.visibleCount += CONFIG.itemsPerPage;
        UI.renderFiles(this.currentDisplayFiles, this.isSearchMode);
    },

    async refresh() {
        DataStore.currentFiles = [];
        DataStore.allFiles = [];
        DataStore.fuseInstance = null;
        SearchEngine.isIndexReady = false;

        UI.showState('loading');
        const success = await DataStore.init();
        if (!success) { UI.showError('הרענון נכשל. אנא נסו שוב.'); return; }

        UI.renderFolderTree(null, null, '');

        if (DataStore.folders.length > 0) {
            await this.selectFolder(DataStore.folders[0].id);
        } else {
            UI.showState('welcome');
        }
    }
};

// --- Bootstrap ---
document.addEventListener('DOMContentLoaded', () => {
    App.init().catch(err => {
        console.error('App initialization failed:', err);
        document.getElementById('errorState').style.display = '';
        document.getElementById('errorMessage').textContent = 'שגיאה באתחול האפליקציה. אנא רעננו את העמוד.';
    });
});
