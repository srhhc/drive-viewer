/* ============================================
   דרייב-צפייה — UI Engine
   Rendering, theming, DOM management
   ============================================ */

const UI = {
    // Current state
    viewMode: 'grid',   // 'grid' | 'list'
    sortMode: 'name',   // 'name' | 'date' | 'size'
    currentPage: 1,

    // DOM refs (populated on init)
    els: {},

    init() {
        // Cache all DOM references
        this.els = {
            // Sidebar
            sidebar: document.getElementById('sidebar'),
            folderTree: document.getElementById('folderTree'),
            sidebarCount: document.getElementById('sidebarCount'),
            sidebarClose: document.getElementById('sidebarClose'),
            sidebarOverlay: document.getElementById('sidebarOverlay'),
            menuToggle: document.getElementById('menuToggle'),

            // Search
            searchInput: document.getElementById('searchInput'),
            searchClear: document.getElementById('searchClear'),

            // Breadcrumb
            breadcrumbPath: document.getElementById('breadcrumbPath'),

            // Toolbar
            resultsCount: document.getElementById('resultsCount'),
            sortSelect: document.getElementById('sortSelect'),
            viewBtns: document.querySelectorAll('.view-btn'),

            // Content
            contentArea: document.getElementById('contentArea'),
            welcomeState: document.getElementById('welcomeState'),
            loadingState: document.getElementById('loadingState'),
            emptyState: document.getElementById('emptyState'),
            errorState: document.getElementById('errorState'),
            errorMessage: document.getElementById('errorMessage'),
            fileGrid: document.getElementById('fileGrid'),
            fileList: document.getElementById('fileList'),
            pagination: document.getElementById('pagination'),

            // Theme
            themeToggle: document.getElementById('themeToggle'),

            // Disclaimer
            disclaimerBanner: document.getElementById('disclaimerBanner'),
            disclaimerClose: document.getElementById('disclaimerClose'),

            // Misc
            refreshBtn: document.getElementById('refreshBtn'),
            lastUpdated: document.getElementById('lastUpdated')
        };

        this._bindEvents();
        this._loadTheme();
        this._loadDisclaimer();
        this._loadViewMode();
        this._loadSortMode();
    },

    /* --- Event Bindings --- */
    _bindEvents() {
        // Sidebar
        this.els.menuToggle.addEventListener('click', () => this.toggleSidebar());
        this.els.sidebarClose.addEventListener('click', () => this.closeSidebar());
        this.els.sidebarOverlay.addEventListener('click', () => this.closeSidebar());

        // Search
        this.els.searchInput.addEventListener('input', () => App.handleSearchInput());
        this.els.searchClear.addEventListener('click', () => App.clearSearch());

        // Sort
        this.els.sortSelect.addEventListener('change', () => {
            this.sortMode = this.els.sortSelect.value;
            localStorage.setItem(CONFIG.sortModeKey, this.sortMode);
            App.renderCurrentFiles();
        });

        // View buttons
        this.els.viewBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.setViewMode(btn.dataset.view);
            });
        });

        // Theme
        this.els.themeToggle.addEventListener('click', () => this.toggleTheme());

        // Disclaimer
        this.els.disclaimerClose.addEventListener('click', () => this.dismissDisclaimer());

        // Refresh
        this.els.refreshBtn.addEventListener('click', () => App.refresh());

        // Scroll to top
        this._setupScrollToTop();
    },

    /* --- Sidebar --- */
    toggleSidebar() {
        this.els.sidebar.classList.toggle('open');
        this.els.sidebarOverlay.classList.toggle('show');
    },

    closeSidebar() {
        this.els.sidebar.classList.remove('open');
        this.els.sidebarOverlay.classList.remove('show');
    },

    /* --- Folder Tree --- */
    renderFolderTree(activeFolderId) {
        const tree = this.els.folderTree;
        const folders = DataStore.folders;

        if (!folders || folders.length === 0) {
            tree.innerHTML = `
                <div class="tree-loading">
                    <span>אין תיקיות זמינות</span>
                </div>`;
            this.els.sidebarCount.textContent = '0';
            return;
        }

        const totalFiles = folders.reduce((sum, f) => sum + (f.fileCount || 0), 0);
        this.els.sidebarCount.textContent = totalFiles.toLocaleString();

        tree.innerHTML = folders.map(folder => `
            <div class="tree-item${folder.id === activeFolderId ? ' active' : ''}"
                 data-folder-id="${folder.id}"
                 role="button"
                 tabindex="0"
                 aria-label="${folder.name}">
                <span class="folder-icon"><i class="fas fa-folder"></i></span>
                <span class="folder-name">${this._escapeHtml(folder.name)}</span>
                <span class="folder-badge">${(folder.fileCount || 0).toLocaleString()}</span>
            </div>
        `).join('');

        // Bind click events
        tree.querySelectorAll('.tree-item').forEach(item => {
            item.addEventListener('click', () => {
                const folderId = item.dataset.folderId;
                App.selectFolder(folderId);
                this.closeSidebar();
            });
        });
    },

    /* --- Breadcrumb --- */
    renderBreadcrumb(folderId) {
        const path = this.els.breadcrumbPath;
        if (!folderId) {
            path.innerHTML = '';
            return;
        }
        const folder = DataStore.folders.find(f => f.id === folderId);
        if (folder) {
            path.innerHTML = `
                <span class="breadcrumb-separator">/</span>
                <button data-folder="${folder.id}">${this._escapeHtml(folder.name)}</button>
            `;
            // Bind click
            const btn = path.querySelector('button');
            if (btn) {
                btn.addEventListener('click', () => App.selectFolder(btn.dataset.folder));
            }
        }
    },

    /* --- File Grid --- */
    renderFileGrid(files, page) {
        const grid = this.els.fileGrid;
        const start = (page - 1) * CONFIG.itemsPerPage;
        const end = start + CONFIG.itemsPerPage;
        const pageFiles = files.slice(start, end);

        grid.innerHTML = pageFiles.map(file => this._fileCardHtml(file)).join('');
        grid.style.display = 'grid';

        // Bind events
        grid.querySelectorAll('.file-card').forEach(card => {
            const fileId = card.dataset.fileId;
            const file = files.find(f => f.id === fileId);
            if (!file) return;

            // Click on card plays video or opens in drive
            card.addEventListener('click', (e) => {
                // Don't trigger if clicking action buttons
                if (e.target.closest('button') || e.target.closest('a')) return;
                if (file.isVideo) {
                    VideoPlayer.open(file);
                } else {
                    window.open(file.webViewLink || getDrivePreviewUrl(file.id), '_blank');
                }
            });

            // Play button
            const playBtn = card.querySelector('.btn-play');
            if (playBtn) {
                playBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    VideoPlayer.open(file);
                });
            }

            // Download button
            const dlBtn = card.querySelector('.btn-dl');
            if (dlBtn) {
                dlBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                });
            }
        });
    },

    _fileCardHtml(file) {
        const thumbContent = file.thumbnailLink
            ? `<img src="${this._escapeHtml(file.thumbnailLink)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display=''">
               <span class="thumb-icon" style="display:none">${file.icon}</span>`
            : `<span class="thumb-icon">${file.icon}</span>`;

        const badge = file.isVideo
            ? `<span class="thumb-badge"><i class="fas fa-play"></i></span>`
            : '';

        return `
            <div class="file-card" data-file-id="${file.id}">
                <div class="file-card-thumb">
                    ${thumbContent}
                    ${badge}
                </div>
                <div class="file-card-body">
                    <div class="file-card-name" title="${this._escapeHtml(file.name)}">${this._escapeHtml(file.name)}</div>
                    <div class="file-card-meta">
                        <span>${file.sizeFormatted}</span>
                        <span>${file.dateFormatted}</span>
                    </div>
                </div>
                <div class="file-card-actions">
                    ${file.isVideo ? `<button class="btn-play"><i class="fas fa-play"></i> צפה</button>` : ''}
                    <a class="btn-dl" href="${getDriveDownloadUrl(file.id)}" target="_blank" rel="noopener">
                        <i class="fas fa-download"></i> הורד
                    </a>
                </div>
            </div>`;
    },

    /* --- File List --- */
    renderFileList(files, page) {
        const list = this.els.fileList;
        const start = (page - 1) * CONFIG.itemsPerPage;
        const end = start + CONFIG.itemsPerPage;
        const pageFiles = files.slice(start, end);

        list.innerHTML = `
            <div class="file-list-header">
                <span>שם הקובץ</span>
                <span class="file-list-size">גודל</span>
                <span class="file-list-date">תאריך</span>
                <span>פעולות</span>
            </div>
            ${pageFiles.map(file => this._fileListRowHtml(file)).join('')}
        `;
        list.style.display = 'flex';

        // Bind events
        list.querySelectorAll('.file-list-row').forEach(row => {
            const fileId = row.dataset.fileId;
            const file = files.find(f => f.id === fileId);
            if (!file) return;

            row.addEventListener('click', (e) => {
                if (e.target.closest('button') || e.target.closest('a')) return;
                if (file.isVideo) {
                    VideoPlayer.open(file);
                } else {
                    window.open(file.webViewLink || getDrivePreviewUrl(file.id), '_blank');
                }
            });

            const playBtn = row.querySelector('.btn-play');
            if (playBtn) {
                playBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    VideoPlayer.open(file);
                });
            }
        });
    },

    _fileListRowHtml(file) {
        return `
            <div class="file-list-row" data-file-id="${file.id}">
                <div class="file-list-name">
                    <span class="file-icon">${file.icon}</span>
                    <span title="${this._escapeHtml(file.name)}">${this._escapeHtml(file.name)}</span>
                </div>
                <span class="file-list-size">${file.sizeFormatted}</span>
                <span class="file-list-date">${file.dateFormatted}</span>
                <div class="file-list-actions">
                    ${file.isVideo ? `<button class="btn-play"><i class="fas fa-play"></i> צפה</button>` : ''}
                    <a href="${getDriveDownloadUrl(file.id)}" target="_blank" rel="noopener">
                        <i class="fas fa-download"></i>
                    </a>
                </div>
            </div>`;
    },

    /* --- Pagination --- */
    renderPagination(files, currentPage) {
        const totalPages = Math.ceil(files.length / CONFIG.itemsPerPage);
        const pagination = this.els.pagination;

        if (totalPages <= 1) {
            pagination.style.display = 'none';
            return;
        }

        let html = '';
        html += `<button ${currentPage === 1 ? 'disabled' : ''} data-page="${currentPage - 1}">‹</button>`;

        // Show pages around current
        const maxVisible = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);
        if (endPage - startPage < maxVisible - 1) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }

        if (startPage > 1) {
            html += `<button data-page="1">1</button>`;
            if (startPage > 2) html += `<span>…</span>`;
        }

        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) html += `<span>…</span>`;
            html += `<button data-page="${totalPages}">${totalPages}</button>`;
        }

        html += `<button ${currentPage === totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">›</button>`;

        pagination.innerHTML = html;
        pagination.style.display = 'flex';

        // Bind events
        pagination.querySelectorAll('button:not([disabled])').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = parseInt(btn.dataset.page);
                this.currentPage = page;
                App.renderCurrentFiles();
                // Scroll to top of content
                this.els.contentArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    },

    /* --- State Visibility --- */
    showState(state) {
        this.els.welcomeState.style.display = 'none';
        this.els.loadingState.style.display = 'none';
        this.els.emptyState.style.display = 'none';
        this.els.errorState.style.display = 'none';
        this.els.fileGrid.style.display = 'none';
        this.els.fileList.style.display = 'none';
        this.els.pagination.style.display = 'none';

        switch (state) {
            case 'welcome':
                this.els.welcomeState.style.display = '';
                break;
            case 'loading':
                this.els.loadingState.style.display = '';
                break;
            case 'empty':
                this.els.emptyState.style.display = '';
                break;
            case 'error':
                this.els.errorState.style.display = '';
                break;
            case 'content':
                // Grid/list visibility is set by render methods
                break;
        }
    },

    showError(message) {
        this.showState('error');
        if (message) {
            this.els.errorMessage.textContent = message;
        }
    },

    /* --- View Mode --- */
    setViewMode(mode) {
        this.viewMode = mode;
        localStorage.setItem(CONFIG.viewModeKey, mode);

        this.els.viewBtns.forEach(b => {
            b.classList.toggle('active', b.dataset.view === mode);
        });

        App.renderCurrentFiles();
    },

    _loadViewMode() {
        const saved = localStorage.getItem(CONFIG.viewModeKey);
        if (saved === 'list' || saved === 'grid') {
            this.viewMode = saved;
        }
        this.els.viewBtns.forEach(b => {
            b.classList.toggle('active', b.dataset.view === this.viewMode);
        });
    },

    /* --- Sort Mode --- */
    _loadSortMode() {
        const saved = localStorage.getItem(CONFIG.sortModeKey);
        if (saved === 'name' || saved === 'date' || saved === 'size') {
            this.sortMode = saved;
            this.els.sortSelect.value = saved;
        }
    },

    /* --- Theme --- */
    _loadTheme() {
        const saved = localStorage.getItem(CONFIG.themeKey);
        if (saved === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            this._updateThemeIcon('dark');
        } else if (saved === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
            this._updateThemeIcon('light');
        } else {
            // Auto: check system preference
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
            this._updateThemeIcon(prefersDark ? 'dark' : 'light');
        }
    },

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem(CONFIG.themeKey, next);
        this._updateThemeIcon(next);
    },

    _updateThemeIcon(theme) {
        const icon = this.els.themeToggle.querySelector('i');
        if (theme === 'dark') {
            icon.className = 'fas fa-sun';
        } else {
            icon.className = 'fas fa-moon';
        }
    },

    /* --- Disclaimer --- */
    _loadDisclaimer() {
        if (localStorage.getItem(CONFIG.disclaimerKey) === 'dismissed') {
            this.els.disclaimerBanner.classList.add('dismissed');
        }
    },

    dismissDisclaimer() {
        this.els.disclaimerBanner.classList.add('dismissed');
        localStorage.setItem(CONFIG.disclaimerKey, 'dismissed');
    },

    /* --- Results Count --- */
    updateResultsCount(files, filtered) {
        if (filtered) {
            this.els.resultsCount.textContent = `נמצאו ${files.length.toLocaleString()} תוצאות`;
        } else {
            this.els.resultsCount.textContent = `${files.length.toLocaleString()} קבצים`;
        }
    },

    /* --- Scroll to top --- */
    _setupScrollToTop() {
        const btn = document.createElement('button');
        btn.className = 'scroll-top';
        btn.innerHTML = '<i class="fas fa-chevron-up"></i>';
        btn.setAttribute('aria-label', 'חזרה למעלה');
        document.body.appendChild(btn);

        window.addEventListener('scroll', () => {
            if (window.scrollY > 500) {
                btn.classList.add('visible');
            } else {
                btn.classList.remove('visible');
            }
        });

        btn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    },

    /* --- Utility --- */
    _escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    sortFiles(files) {
        const sorted = [...files];
        switch (this.sortMode) {
            case 'name':
                sorted.sort((a, b) => a.name.localeCompare(b.name, 'he'));
                break;
            case 'date':
                sorted.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));
                break;
            case 'size':
                sorted.sort((a, b) => b.size - a.size);
                break;
        }
        return sorted;
    }
};
