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
        this.els = {
            sidebar: document.getElementById('sidebar'),
            folderTree: document.getElementById('folderTree'),
            sidebarCount: document.getElementById('sidebarCount'),
            sidebarClose: document.getElementById('sidebarClose'),
            sidebarOverlay: document.getElementById('sidebarOverlay'),
            menuToggle: document.getElementById('menuToggle'),

            searchInput: document.getElementById('searchInput'),
            searchClear: document.getElementById('searchClear'),

            breadcrumbHome: document.getElementById('breadcrumb').querySelector('.breadcrumb-home'),
            breadcrumbPath: document.getElementById('breadcrumbPath'),

            resultsCount: document.getElementById('resultsCount'),
            sortSelect: document.getElementById('sortSelect'),
            viewBtns: document.querySelectorAll('.view-btn'),

            contentArea: document.getElementById('contentArea'),
            welcomeState: document.getElementById('welcomeState'),
            loadingState: document.getElementById('loadingState'),
            emptyState: document.getElementById('emptyState'),
            errorState: document.getElementById('errorState'),
            errorMessage: document.getElementById('errorMessage'),
            fileGrid: document.getElementById('fileGrid'),
            fileList: document.getElementById('fileList'),
            pagination: document.getElementById('pagination'),

            themeToggle: document.getElementById('themeToggle'),
            disclaimerBanner: document.getElementById('disclaimerBanner'),
            disclaimerClose: document.getElementById('disclaimerClose'),

            refreshBtn: document.getElementById('refreshBtn'),
            lastUpdated: document.getElementById('lastUpdated')
        };

        this._bindEvents();
        this._loadTheme();
        this._loadDisclaimer();
        this._loadViewMode();
        this._loadSortMode();
    },

    _bindEvents() {
        this.els.menuToggle.addEventListener('click', () => this.toggleSidebar());
        this.els.sidebarClose.addEventListener('click', () => this.closeSidebar());
        this.els.sidebarOverlay.addEventListener('click', () => this.closeSidebar());

        this.els.searchInput.addEventListener('input', () => App.handleSearchInput());
        this.els.searchClear.addEventListener('click', () => App.clearSearch());

        this.els.sortSelect.addEventListener('change', () => {
            this.sortMode = this.els.sortSelect.value;
            localStorage.setItem(CONFIG.sortModeKey, this.sortMode);
            App.renderCurrentFiles();
        });

        this.els.viewBtns.forEach(btn => {
            btn.addEventListener('click', () => { this.setViewMode(btn.dataset.view); });
        });

        this.els.themeToggle.addEventListener('click', () => this.toggleTheme());
        this.els.disclaimerClose.addEventListener('click', () => this.dismissDisclaimer());
        this.els.breadcrumbHome.addEventListener('click', () => App.goHome());
        this.els.refreshBtn.addEventListener('click', () => App.refresh());

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

    /* --- Folder Tree (Drive folders + subfolder tree) --- */
    renderFolderTree(activeFolderId, subfolderTree, currentPath) {
        const tree = this.els.folderTree;
        const folders = DataStore.folders;

        if (!folders || folders.length === 0) {
            tree.innerHTML = '<div class=\"tree-loading\"><span>אין תיקיות זמינות</span></div>';
            this.els.sidebarCount.textContent = '0';
            return;
        }

        const totalFiles = folders.reduce((sum, f) => sum + (f.fileCount || 0), 0);
        this.els.sidebarCount.textContent = totalFiles.toLocaleString();

        let html = '';

        // Top-level Drive folders
        folders.forEach(folder => {
            const isActive = folder.id === activeFolderId;
            html += '<div class=\"tree-item' + (isActive ? ' active' : '') + '\" data-folder-id=\"' + folder.id + '\" role=\"button\" tabindex=\"0\">';
            html += '<span class=\"folder-icon\"><i class=\"fas fa-folder\"></i></span>';
            html += '<span class=\"folder-name\">' + this._escapeHtml(folder.name) + '</span>';
            html += '<span class=\"folder-badge\">' + (folder.fileCount || 0).toLocaleString() + '</span>';
            html += '</div>';

            // Subfolder tree for the active Drive folder
            if (isActive && subfolderTree && subfolderTree.children && subfolderTree.children.length > 0) {
                html += '<div class=\"subfolder-tree\">';
                html += this._renderSubfolderTree(subfolderTree.children, currentPath || '', 1);
                html += '</div>';
            }
        });

        tree.innerHTML = html;

        // Bind top-level folder clicks
        tree.querySelectorAll('.tree-item[data-folder-id]').forEach(item => {
            item.addEventListener('click', () => {
                App.selectFolder(item.dataset.folderId);
                this.closeSidebar();
            });
        });

        // Bind subfolder clicks
        tree.querySelectorAll('.tree-subitem').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const path = item.dataset.path;
                App.navigateToPath(path);
            });
        });
    },

    _renderSubfolderTree(children, currentPath, depth) {
        let html = '';
        children.forEach(child => {
            const isActive = child.path === currentPath;
            const indent = (depth - 1) * 20;
            html += '<div class=\"tree-subitem' + (isActive ? ' active' : '') + '\" data-path=\"' + child.path + '\" style=\"padding-right:' + (16 + indent) + 'px\" role=\"button\" tabindex=\"0\">';
            html += '<span class=\"folder-icon\"><i class=\"fas fa-folder' + (isActive ? '-open' : '') + '\"></i></span>';
            html += '<span class=\"folder-name\">' + this._escapeHtml(child.name) + '</span>';
            html += '<span class=\"folder-badge\">' + (child.fileCount || 0).toLocaleString() + '</span>';
            html += '</div>';

            if (child.children && child.children.length > 0) {
                html += this._renderSubfolderTree(child.children, currentPath, depth + 1);
            }
        });
        return html;
    },

    /* --- Breadcrumb (with subfolder path support) --- */
    renderBreadcrumb(folderId, currentPath) {
        const path = this.els.breadcrumbPath;
        if (!folderId) { path.innerHTML = ''; return; }

        const folder = DataStore.folders.find(f => f.id === folderId);
        if (!folder) { path.innerHTML = ''; return; }

        let html = '<span class=\"breadcrumb-separator\">/</span>';
        html += '<button data-folder=\"' + folder.id + '\">' + this._escapeHtml(folder.name) + '</button>';

        // Subfolder breadcrumbs
        if (currentPath) {
            const parts = currentPath.split('/');
            let accumulated = '';
            parts.forEach((part, i) => {
                accumulated = i === 0 ? part : accumulated + '/' + part;
                html += '<span class=\"breadcrumb-separator\">/</span>';
                html += '<button data-path=\"' + accumulated + '\">' + this._escapeHtml(part) + '</button>';
            });
        }

        path.innerHTML = html;

        // Bind folder click (go to root)
        const folderBtn = path.querySelector('button[data-folder]');
        if (folderBtn) {
            folderBtn.addEventListener('click', () => App.selectFolder(folderBtn.dataset.folder));
        }

        // Bind subfolder clicks
        path.querySelectorAll('button[data-path]').forEach(btn => {
            btn.addEventListener('click', () => App.navigateToPath(btn.dataset.path));
        });
    },

    /* --- File Grid --- */
    renderFileGrid(files, page) {
        const grid = this.els.fileGrid;
        const start = (page - 1) * CONFIG.itemsPerPage;
        const end = start + CONFIG.itemsPerPage;
        const pageFiles = files.slice(start, end);

        grid.innerHTML = pageFiles.map(file => this._fileCardHtml(file)).join('');
        grid.style.display = 'grid';

        grid.querySelectorAll('.file-card').forEach(card => {
            const fileId = card.dataset.fileId;
            const file = files.find(f => f.id === fileId);
            if (!file) return;

            // Handle broken images: hide img, show fallback icon
            const img = card.querySelector('.file-card-thumb img');
            if (img) {
                img.addEventListener('error', () => {
                    img.style.display = 'none';
                    const fallback = card.querySelector('.file-card-thumb .thumb-icon');
                    if (fallback) fallback.style.display = '';
                });
            }

            card.addEventListener('click', (e) => {
                if (e.target.closest('button') || e.target.closest('a')) return;
                if (file.isVideo) VideoPlayer.open(file);
                else window.open(file.webViewLink || getDrivePreviewUrl(file.id), '_blank');
            });

            const playBtn = card.querySelector('.btn-play');
            if (playBtn) {
                playBtn.addEventListener('click', (e) => { e.stopPropagation(); VideoPlayer.open(file); });
            }
        });
    },

    _fileCardHtml(file) {
        const es = (s) => this._escapeHtml(s);
        const thumbContent = file.thumbnailLink
            ? '<img src="' + es(file.thumbnailLink) + '" alt="" loading="lazy"><span class="thumb-icon" style="display:none">' + file.icon + '</span>'
            : '<span class="thumb-icon">' + file.icon + '</span>';

        const badge = file.isVideo ? '<span class=\"thumb-badge\"><i class=\"fas fa-play\"></i></span>' : '';
        const pathLabel = file.path ? '<div class=\"file-card-path\" title=\"' + this._escapeHtml(file.path) + '\"><i class=\"fas fa-folder\"></i> ' + this._escapeHtml(file.path) + '</div>' : '';

        return '<div class=\"file-card\" data-file-id=\"' + file.id + '\">'
            + '<div class=\"file-card-thumb\">' + thumbContent + badge + '</div>'
            + '<div class=\"file-card-body\">'
            + '<div class=\"file-card-name\" title=\"' + this._escapeHtml(file.name) + '\">' + this._escapeHtml(file.name) + '</div>'
            + pathLabel
            + '<div class=\"file-card-meta\"><span>' + file.sizeFormatted + '</span><span>' + file.dateFormatted + '</span></div>'
            + '</div>'
            + '<div class=\"file-card-actions\">'
            + (file.isVideo ? '<button class=\"btn-play\"><i class=\"fas fa-play\"></i> צפה</button>' : '')
            + '<a class=\"btn-dl\" href=\"' + getDriveDownloadUrl(file.id) + '\" target=\"_blank\" rel=\"noopener\"><i class=\"fas fa-download\"></i> הורד</a>'
            + '</div></div>';
    },

    /* --- File List --- */
    renderFileList(files, page) {
        const list = this.els.fileList;
        const start = (page - 1) * CONFIG.itemsPerPage;
        const end = start + CONFIG.itemsPerPage;
        const pageFiles = files.slice(start, end);

        list.innerHTML = '<div class=\"file-list-header\"><span>שם הקובץ</span><span class=\"file-list-size\">גודל</span><span class=\"file-list-date\">תאריך</span><span>פעולות</span></div>'
            + pageFiles.map(file => this._fileListRowHtml(file)).join('');
        list.style.display = 'flex';

        list.querySelectorAll('.file-list-row').forEach(row => {
            const fileId = row.dataset.fileId;
            const file = files.find(f => f.id === fileId);
            if (!file) return;

            row.addEventListener('click', (e) => {
                if (e.target.closest('button') || e.target.closest('a')) return;
                if (file.isVideo) VideoPlayer.open(file);
                else window.open(file.webViewLink || getDrivePreviewUrl(file.id), '_blank');
            });

            const playBtn = row.querySelector('.btn-play');
            if (playBtn) {
                playBtn.addEventListener('click', (e) => { e.stopPropagation(); VideoPlayer.open(file); });
            }
        });
    },

    _fileListRowHtml(file) {
        return '<div class=\"file-list-row\" data-file-id=\"' + file.id + '\">'
            + '<div class=\"file-list-name\"><span class=\"file-icon\">' + file.icon + '</span>'
            + '<span title=\"' + this._escapeHtml(file.name) + '\">' + this._escapeHtml(file.name) + '</span></div>'
            + '<span class=\"file-list-size\">' + file.sizeFormatted + '</span>'
            + '<span class=\"file-list-date\">' + file.dateFormatted + '</span>'
            + '<div class=\"file-list-actions\">'
            + (file.isVideo ? '<button class=\"btn-play\"><i class=\"fas fa-play\"></i> צפה</button>' : '')
            + '<a href=\"' + getDriveDownloadUrl(file.id) + '\" target=\"_blank\" rel=\"noopener\"><i class=\"fas fa-download\"></i></a>'
            + '</div></div>';
    },

    /* --- Pagination --- */
    renderPagination(files, currentPage) {
        const totalPages = Math.ceil(files.length / CONFIG.itemsPerPage);
        const pagination = this.els.pagination;

        if (totalPages <= 1) { pagination.style.display = 'none'; return; }

        let html = '<button ' + (currentPage === 1 ? 'disabled' : '') + ' data-page=\"' + (currentPage - 1) + '\">‹</button>';
        const maxVisible = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);
        if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);

        if (startPage > 1) {
            html += '<button data-page=\"1\">1</button>';
            if (startPage > 2) html += '<span>…</span>';
        }
        for (let i = startPage; i <= endPage; i++) {
            html += '<button class=\"' + (i === currentPage ? 'active' : '') + '\" data-page=\"' + i + '\">' + i + '</button>';
        }
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) html += '<span>…</span>';
            html += '<button data-page=\"' + totalPages + '\">' + totalPages + '</button>';
        }
        html += '<button ' + (currentPage === totalPages ? 'disabled' : '') + ' data-page=\"' + (currentPage + 1) + '\">›</button>';

        pagination.innerHTML = html;
        pagination.style.display = 'flex';

        pagination.querySelectorAll('button:not([disabled])').forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentPage = parseInt(btn.dataset.page);
                App.renderCurrentFiles();
                this.els.contentArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    },

    /* --- State Visibility --- */
    showState(state) {
        ['welcomeState','loadingState','emptyState','errorState','fileGrid','fileList','pagination'].forEach(id => {
            this.els[id].style.display = 'none';
        });
        if (state === 'content') return;
        const el = this.els[state + 'State'];
        if (el) el.style.display = '';
    },

    showError(message) {
        this.showState('error');
        if (message) this.els.errorMessage.textContent = message;
    },

    /* --- View Mode --- */
    setViewMode(mode) {
        this.viewMode = mode;
        localStorage.setItem(CONFIG.viewModeKey, mode);
        this.els.viewBtns.forEach(b => b.classList.toggle('active', b.dataset.view === mode));
        App.renderCurrentFiles();
    },

    _loadViewMode() {
        const saved = localStorage.getItem(CONFIG.viewModeKey);
        if (saved === 'list' || saved === 'grid') this.viewMode = saved;
        this.els.viewBtns.forEach(b => b.classList.toggle('active', b.dataset.view === this.viewMode));
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
        if (saved === 'dark') { document.documentElement.setAttribute('data-theme', 'dark'); this._updateThemeIcon('dark'); }
        else if (saved === 'light') { document.documentElement.setAttribute('data-theme', 'light'); this._updateThemeIcon('light'); }
        else {
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
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
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
        this.els.resultsCount.textContent = filtered
            ? 'נמצאו ' + files.length.toLocaleString() + ' תוצאות'
            : files.length.toLocaleString() + ' קבצים';
    },

    /* --- Scroll to top --- */
    _setupScrollToTop() {
        const btn = document.createElement('button');
        btn.className = 'scroll-top';
        btn.innerHTML = '<i class=\"fas fa-chevron-up\"></i>';
        btn.setAttribute('aria-label', 'חזרה למעלה');
        document.body.appendChild(btn);

        window.addEventListener('scroll', () => btn.classList.toggle('visible', window.scrollY > 500));
        btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
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
            case 'name': sorted.sort((a, b) => a.name.localeCompare(b.name, 'he')); break;
            case 'date': sorted.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime)); break;
            case 'size': sorted.sort((a, b) => b.size - a.size); break;
        }
        return sorted;
    }
};
