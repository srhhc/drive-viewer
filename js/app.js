/* ============================================
   דרייב-צפייה — Main Application
   Orchestration & event coordination
   ============================================ */

const App = {
    // Search state
    searchQuery: '',
    isSearchMode: false,

    async init() {
        // Initialize UI first
        UI.init();
        VideoPlayer.init();

        // Show loading in sidebar
        UI.showState('loading');

        // Load data index
        const success = await DataStore.init();

        if (!success) {
            UI.showError('לא ניתן לטעון את רשימת התיקיות. אנא ודאו שקובץ ה-index.json קיים ונסו שוב.');
            return;
        }

        // Render folder tree
        UI.renderFolderTree(null);

        // Check for last viewed folder
        const lastFolder = localStorage.getItem(CONFIG.lastFolderKey);
        if (lastFolder && DataStore.folders.find(f => f.id === lastFolder)) {
            await this.selectFolder(lastFolder);
        } else if (DataStore.folders.length > 0) {
            // Auto-select first folder
            await this.selectFolder(DataStore.folders[0].id);
        } else {
            UI.showState('welcome');
        }
    },

    async selectFolder(folderId) {
        if (!folderId) return;

        // Clear search
        if (this.isSearchMode) {
            this.clearSearch();
        }

        this.searchQuery = '';
        this.isSearchMode = false;

        // Update UI
        UI.showState('loading');
        UI.closeSidebar();
        UI.currentPage = 1;

        // Highlight in tree
        UI.renderFolderTree(folderId);
        UI.renderBreadcrumb(folderId);

        // Load files
        try {
            const files = await DataStore.getFilesForFolder(folderId);
            localStorage.setItem(CONFIG.lastFolderKey, folderId);

            if (files.length === 0) {
                UI.showState('empty');
                UI.updateResultsCount([], false);
            } else {
                this.displayFiles(files, false);
            }
        } catch (err) {
            UI.showError(`שגיאה בטעינת הקבצים: ${err.message}`);
        }
    },

    async handleSearchInput() {
        const query = UI.els.searchInput.value;
        UI.els.searchClear.style.display = query ? 'block' : 'none';

        this.searchQuery = query;

        if (!query || query.length < CONFIG.searchMinChars) {
            // If search cleared, restore current folder view
            this.isSearchMode = false;
            if (DataStore.currentFolderId) {
                UI.renderBreadcrumb(DataStore.currentFolderId);
                UI.renderFolderTree(DataStore.currentFolderId);
                this.displayFiles(DataStore.currentFiles, false);
            }
            return;
        }

        // Need to build index if not ready
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
        if (results === null) {
            // No search (query too short)
            this.isSearchMode = false;
            return;
        }

        this.isSearchMode = true;
        UI.currentPage = 1;

        // Deselect all folders in tree
        UI.renderFolderTree(null);
        UI.renderBreadcrumb(null);

        if (results.length === 0) {
            UI.showState('empty');
            UI.updateResultsCount([], true);
            // Change empty state message
            UI.els.emptyState.innerHTML = `
                <div class="empty-icon"><i class="fas fa-search"></i></div>
                <h3>לא נמצאו תוצאות</h3>
                <p>נסו מונח חיפוש אחר.</p>
            `;
        } else {
            // Restore empty state
            UI.els.emptyState.innerHTML = `
                <div class="empty-icon"><i class="fas fa-folder-open"></i></div>
                <h3>אין קבצים בתיקייה זו</h3>
            `;

            // Extract items from Fuse results
            const files = results.map(r => r.item);
            this.displayFiles(files, true);
        }
    },

    clearSearch() {
        this.searchQuery = '';
        this.isSearchMode = false;
        UI.els.searchInput.value = '';
        UI.els.searchClear.style.display = 'none';

        // Restore folder view
        if (DataStore.currentFolderId) {
            this.selectFolder(DataStore.currentFolderId);
        }
    },

    renderCurrentFiles() {
        const files = this.isSearchMode
            ? this.getCurrentFileList()
            : DataStore.currentFiles;

        this.displayFiles(files, this.isSearchMode);
    },

    getCurrentFileList() {
        // This is called after search results are already processed
        // The files were stored from the last search handler call
        // We re-run search to get current results
        if (this.isSearchMode && this.searchQuery) {
            const results = SearchEngine.search(this.searchQuery);
            return results ? results.map(r => r.item) : [];
        }
        return DataStore.currentFiles;
    },

    displayFiles(files, isFiltered) {
        const sorted = UI.sortFiles(files);
        const totalPages = Math.ceil(sorted.length / CONFIG.itemsPerPage);

        // Clamp page
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
        // Clear cache and reload
        DataStore.currentFiles = [];
        DataStore.allFiles = [];
        DataStore.fuseInstance = null;
        SearchEngine.isIndexReady = false;

        UI.showState('loading');
        const success = await DataStore.init();

        if (!success) {
            UI.showError('הרענון נכשל. אנא נסו שוב.');
            return;
        }

        UI.renderFolderTree(null);

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
        document.getElementById('errorMessage').textContent =
            'שגיאה באתחול האפליקציה. אנא רעננו את העמוד.';
    });
});
