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

        UI.showState('loading');

        const success = await DataStore.init();
        if (!success) {
            UI.showError('לא ניתן לטעון את רשימת התיקיות. אנא ודאו שקובץ ה-index.json קיים ונסו שוב.');
            return;
        }

        UI.renderFolderTree(null, null, '');

        const lastFolder = localStorage.getItem(CONFIG.lastFolderKey);
        if (lastFolder && DataStore.folders.find(f => f.id === lastFolder)) {
            await this.selectFolder(lastFolder);
        } else if (DataStore.folders.length > 0) {
            await this.selectFolder(DataStore.folders[0].id);
        } else {
            UI.showState('welcome');
        }
    },

    goHome() {
        if (DataStore.currentFolderId) {
            this.currentPath = '';
            this._refreshView();
        } else if (DataStore.folders.length > 0) {
            this.selectFolder(DataStore.folders[0].id);
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
            try {
                const allFiles = await DataStore.loadAllFiles();
                SearchEngine.buildIndex(allFiles);
            } catch (err) {
                UI.showError('שגיאה בבניית אינדקס החיפוש.');
                return;
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
        if (this.isSearchMode) {
            files = this.searchQuery ? this.lastSearchFiles : [];
        } else {
            files = DataStore.currentFiles;
            if (this.currentPath) {
                const prefix = this.currentPath + '/';
                files = files.filter(f => f.path === this.currentPath || f.path.startsWith(prefix));
            }
        }
        this.displayFiles(files, this.isSearchMode);
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
