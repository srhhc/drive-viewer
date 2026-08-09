/* ============================================
   דרייב-צפייה — Main Application
   Orchestration & event coordination
   ============================================ */

const App = {
    searchQuery: '',
    isSearchMode: false,
    currentPath: '',       // Current subfolder path (empty = root)
    folderTree: null,      // Built folder tree from current files

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
        // Reset to root of current folder
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
        UI.currentPage = 1;

        try {
            const files = await DataStore.getFilesForFolder(folderId);
            localStorage.setItem(CONFIG.lastFolderKey, folderId);

            // Build folder tree
            this.folderTree = DataStore.buildFolderTree(files);

            if (files.length === 0) {
                UI.showState('empty');
                UI.updateResultsCount([], false);
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

        UI.currentPage = 1;
        UI.renderFolderTree(folderId, this.folderTree, this.currentPath);
        UI.renderBreadcrumb(folderId, this.currentPath);

        // Filter files by current path
        let files = DataStore.currentFiles;
        if (this.currentPath) {
            files = files.filter(f => f.path === this.currentPath);
        }

        if (files.length === 0) {
            UI.showState('empty');
            UI.updateResultsCount([], false);
        } else {
            this.displayFiles(files, false);
        }
    },

    async handleSearchInput() {
        const query = UI.els.searchInput.value;
        UI.els.searchClear.style.display = query ? 'block' : 'none';

        this.searchQuery = query;

        if (!query || query.length < CONFIG.searchMinChars) {
            this.isSearchMode = false;
            if (DataStore.currentFolderId) {
                this._refreshView();
            }
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
        UI.currentPage = 1;

        UI.renderFolderTree(null, null, '');
        UI.renderBreadcrumb(null, '');

        if (results.length === 0) {
            UI.showState('empty');
            UI.updateResultsCount([], true);
            UI.els.emptyState.innerHTML = '<div class=\"empty-icon\"><i class=\"fas fa-search\"></i></div><h3>לא נמצאו תוצאות</h3><p>נסו מונח חיפוש אחר.</p>';
        } else {
            UI.els.emptyState.innerHTML = '<div class=\"empty-icon\"><i class=\"fas fa-folder-open\"></i></div><h3>אין קבצים בתיקייה זו</h3>';
            const files = results.map(r => r.item);
            this.displayFiles(files, true);
        }
    },

    clearSearch() {
        this.searchQuery = '';
        this.isSearchMode = false;
        UI.els.searchInput.value = '';
        UI.els.searchClear.style.display = 'none';

        if (DataStore.currentFolderId) {
            this.selectFolder(DataStore.currentFolderId);
        }
    },

    renderCurrentFiles() {
        let files;
        if (this.isSearchMode) {
            if (this.searchQuery) {
                const results = SearchEngine.search(this.searchQuery);
                files = results ? results.map(r => r.item) : [];
            } else {
                files = [];
            }
        } else {
            files = DataStore.currentFiles;
            if (this.currentPath) {
                files = files.filter(f => f.path === this.currentPath);
            }
        }

        this.displayFiles(files, this.isSearchMode);
    },

    displayFiles(files, isFiltered) {
        const sorted = UI.sortFiles(files);
        const totalPages = Math.ceil(sorted.length / CONFIG.itemsPerPage);

        if (UI.currentPage > totalPages) UI.currentPage = totalPages;
        if (UI.currentPage < 1) UI.currentPage = 1;

        UI.showState('content');

        if (UI.viewMode === 'grid') {
            UI.renderFileGrid(sorted, UI.currentPage);
        } else {
            UI.renderFileList(sorted, UI.currentPage);
        }

        UI.renderPagination(sorted, UI.currentPage);
        UI.updateResultsCount(sorted, isFiltered);
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
