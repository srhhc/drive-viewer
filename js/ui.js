/* ============================================
   דרייב-צפייה — UI Engine
   Rendering, theming, DOM management
   ============================================ */

const UI = {
    viewMode: 'grid',   // 'grid' | 'list'
    sortMode: null,     // 'name' | 'date' | 'size'
    currentPage: 1,     // legacy, kept for safety
    visibleCount: 0,    // how many files currently rendered
    totalCount: 0,      // total files in current view
    matchHighlights: {},// fileId -> indices for search highlight
    loadMoreObserver: null,

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
            typeFilterBtns: document.querySelectorAll('.type-filter-btn'),
            loadMoreBtn: document.getElementById('loadMoreBtn'),
            loadMoreWrap: document.getElementById('loadMoreWrap'),

            contentArea: document.getElementById('contentArea'),
            welcomeState: document.getElementById('welcomeState'),
            loadingState: document.getElementById('loadingState'),
            emptyState: document.getElementById('emptyState'),
            errorState: document.getElementById('errorState'),
            errorMessage: document.getElementById('errorMessage'),
            fileGrid: document.getElementById('fileGrid'),
            fileList: document.getElementById('fileList'),

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
        this._loadFilterMode();
        this._setupLoadMoreObserver();
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

        this.els.typeFilterBtns.forEach(btn => {
            btn.addEventListener('click', () => { this.setTypeFilter(btn.dataset.filter); });
        });

        this.els.loadMoreBtn.addEventListener('click', () => App.loadMore());

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
            tree.innerHTML = '<div class="tree-loading"><span>אין תיקיות זמינות</span></div>';
            this.els.sidebarCount.textContent = '0';
            return;
        }

        const totalFiles = folders.reduce((sum, f) => sum + (f.fileCount || 0), 0);
        this.els.sidebarCount.textContent = totalFiles.toLocaleString();

        let html = '';

        folders.forEach(folder => {
            const isActive = folder.id === activeFolderId;
            const hasError = !!folder.error;
            html += '<div class="tree-item' + (isActive ? ' active' : '') + '" data-folder-id="' + folder.id + '" role="button" tabindex="0">';
            html += '<span class="folder-icon"><i class="fas fa-folder"></i></span>';
            html += '<span class="folder-name">' + this._escapeHtml(folder.name) + '</span>';
            html += '<span class="folder-badge' + (hasError ? ' badge-error' : '') + '">' + (folder.fileCount || 0).toLocaleString() + '</span>';
            html += '</div>';

            if (isActive && subfolderTree && subfolderTree.children && subfolderTree.children.length > 0) {
                html += '<div class="subfolder-tree">';
                html += this._renderSubfolderTree(subfolderTree.children, currentPath || '', 1);
                html += '</div>';
            }
        });

        tree.innerHTML = html;

        tree.querySelectorAll('.tree-item[data-folder-id]').forEach(item => {
            item.addEventListener('click', () => {
                App.selectFolder(item.dataset.folderId);
                this.closeSidebar();
            });
        });

        tree.querySelectorAll('.tree-subitem').forEach(item => {
            // Chevron click toggles collapse
            const chevron = item.querySelector('.tree-chevron');
            if (chevron) {
                chevron.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const childrenWrap = item.nextElementSibling;
                    if (childrenWrap && childrenWrap.classList.contains('tree-children')) {
                        const collapsed = childrenWrap.classList.toggle('collapsed');
                        chevron.classList.toggle('closed', collapsed);
                    }
                });
            }
            // Click on the item navigates
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                App.navigateToPath(item.dataset.path);
            });
        });
    },

    _renderSubfolderTree(children, currentPath, depth) {
        let html = '';
        children.forEach(child => {
            const isActive = child.path === currentPath;
            const hasChildren = child.children && child.children.length > 0;
            // Default: collapsed unless it's an ancestor of the active path
            const pathParts = currentPath ? currentPath.split('/') : [];
            const isAncestor = hasChildren && pathParts.some((_, i) => pathParts.slice(0, i + 1).join('/') === child.path);
            const collapsed = hasChildren && !isActive && !isAncestor;

            const indent = (depth - 1) * 20;
            html += '<div class="tree-subitem' + (isActive ? ' active' : '') + '" data-path="' + this._escapeHtml(child.path) + '" style="padding-right:' + (16 + indent) + 'px" role="button" tabindex="0">';
            if (hasChildren) {
                html += '<span class="tree-chevron' + (collapsed ? ' closed' : '') + '"><i class="fas fa-chevron-down"></i></span>';
            } else {
                html += '<span class="tree-chevron tree-chevron-spacer"></span>';
            }
            html += '<span class="folder-icon"><i class="fas fa-folder' + (isActive ? '-open' : '') + '"></i></span>';
            html += '<span class="folder-name">' + this._escapeHtml(child.name) + '</span>';
            html += '<span class="folder-badge">' + (child.fileCount || 0).toLocaleString() + '</span>';
            html += '</div>';

            if (hasChildren) {
                html += '<div class="tree-children' + (collapsed ? ' collapsed' : '') + '">';
                html += this._renderSubfolderTree(child.children, currentPath, depth + 1);
                html += '</div>';
            }
        });
        return html;
    },

    /* --- Breadcrumb --- */
    renderBreadcrumb(folderId, currentPath) {
        const path = this.els.breadcrumbPath;
        if (!folderId) { path.innerHTML = ''; return; }

        const folder = DataStore.folders.find(f => f.id === folderId);
        if (!folder) { path.innerHTML = ''; return; }

        let html = '<span class="breadcrumb-separator">/</span>';
        html += '<button data-folder="' + folder.id + '">' + this._escapeHtml(folder.name) + '</button>';

        if (currentPath) {
            const parts = currentPath.split('/');
            let accumulated = '';
            parts.forEach((part, i) => {
                accumulated = i === 0 ? part : accumulated + '/' + part;
                html += '<span class="breadcrumb-separator">/</span>';
                html += '<button data-path="' + this._escapeHtml(accumulated) + '">' + this._escapeHtml(part) + '</button>';
            });
        }

        path.innerHTML = html;

        const folderBtn = path.querySelector('button[data-folder]');
        if (folderBtn) {
            folderBtn.addEventListener('click', () => App.selectFolder(folderBtn.dataset.folder));
        }

        path.querySelectorAll('button[data-path]').forEach(btn => {
            btn.addEventListener('click', () => App.navigateToPath(btn.dataset.path));
        });
    },

    /* --- Rendering: grid/list with load-more --- */
    renderFiles(files, isFiltered) {
        this.totalCount = files.length;
        this.els.resultsCount.textContent = isFiltered
            ? 'נמצאו ' + files.length.toLocaleString() + ' תוצאות'
            : files.length.toLocaleString() + ' קבצים';

        const visible = files.slice(0, this.visibleCount);

        if (this.viewMode === 'grid') {
            this.renderFileGrid(visible);
        } else {
            this.renderFileList(visible);
        }

        // Load more button
        const hasMore = this.visibleCount < files.length;
        this.els.loadMoreWrap.style.display = hasMore ? 'flex' : 'none';
        if (hasMore) {
            const remaining = files.length - this.visibleCount;
            this.els.loadMoreBtn.textContent = 'טען עוד (' + Math.min(remaining, CONFIG.itemsPerPage) + ') — נותרו ' + remaining.toLocaleString();
        }
    },

    /* --- File Grid --- */
    renderFileGrid(files) {
        const grid = this.els.fileGrid;
        grid.innerHTML = files.map(file => this._fileCardHtml(file)).join('');
        grid.style.display = 'grid';

        grid.querySelectorAll('.file-card').forEach(card => {
            const fileId = card.dataset.fileId;
            const file = files.find(f => f.id === fileId);
            if (!file) return;

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

            const copyBtn = card.querySelector('.btn-copy');
            if (copyBtn) {
                copyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._copyToClipboard(file, copyBtn);
                });
            }
        });
    },

    _copyToClipboard(file, btn) {
        const url = file.webViewLink || getDrivePreviewUrl(file.id);
        const flash = () => {
            const old = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => { if (btn.isConnected) btn.innerHTML = old; }, 1200);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(flash, flash);
        } else {
            const ta = document.createElement('textarea');
            ta.value = url;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch (e) {}
            document.body.removeChild(ta);
            flash();
        }
    },

    _highlightName(file) {
        const name = this._escapeHtml(file.name);
        const match = this.matchHighlights[file.id];
        if (!match || !match.indices || match.indices.length === 0) return name;

        // Build highlighted name using match indices
        let result = '';
        let lastEnd = 0;
        // Escape the name first into HTML, but indices are on raw text...
        // Simpler robust approach: operate on raw text, escape fragments
        for (const [start, end] of match.indices) {
            result += this._escapeHtml(file.name.slice(lastEnd, start));
            result += '<mark class="search-highlight">' + this._escapeHtml(file.name.slice(start, end + 1)) + '</mark>';
            lastEnd = end + 1;
        }
        result += this._escapeHtml(file.name.slice(lastEnd));
        return result;
    },

    _fileCardHtml(file) {
        const es = (s) => this._escapeHtml(s);
        const thumbContent = file.thumbnailLink
            ? '<img src="' + es(file.thumbnailLink) + '" alt="" loading="lazy"><span class="thumb-icon" style="display:none">' + file.icon + '</span>'
            : '<span class="thumb-icon">' + file.icon + '</span>';

        const badges = [];
        if (file.isNew) badges.push('<span class="badge-new">חדש</span>');
        if (file.qualityLabel && file.isVideo) badges.push('<span class="badge-quality">' + file.qualityLabel + '</span>');

        const thumbOverlay = (file.isVideo && file.durationFormatted)
            ? '<span class="thumb-badge"><i class="fas fa-play"></i> ' + file.durationFormatted + '</span>'
            : (file.isVideo ? '<span class="thumb-badge"><i class="fas fa-play"></i></span>' : '');

        const pathLabel = file.path
            ? '<div class="file-card-path" title="' + es(file.path) + '"><i class="fas fa-folder"></i> ' + es(file.path) + '</div>'
            : '';

        const folderChip = (App.isSearchMode && file.folderName)
            ? '<div class="file-card-folder" title="' + es(file.folderName) + '"><i class="fas fa-drive"></i> ' + es(file.folderName) + '</div>'
            : '';

        return '<div class="file-card" data-file-id="' + file.id + '">'
            + '<div class="file-card-thumb">' + thumbContent
            + (badges.length ? '<div class="thumb-corner">' + badges.join('') + '</div>' : '')
            + thumbOverlay + '</div>'
            + '<div class="file-card-body">'
            + '<div class="file-card-name" title="' + es(file.name) + '">' + this._highlightName(file) + '</div>'
            + pathLabel + folderChip
            + '<div class="file-card-meta"><span>' + file.sizeFormatted + '</span><span>' + file.dateFormatted + '</span></div>'
            + '</div>'
            + '<div class="file-card-actions">'
            + (file.isVideo ? '<button class="btn-play"><i class="fas fa-play"></i> צפה</button>' : '')
            + '<button class="btn-copy" title="העתק קישור"><i class="fas fa-link"></i></button>'
            + '<a class="btn-dl" href="' + getDriveDownloadUrl(file.id) + '" target="_blank" rel="noopener"><i class="fas fa-download"></i> הורד</a>'
            + '</div></div>';
    },

    /* --- File List --- */
    renderFileList(files) {
        const list = this.els.fileList;
        list.innerHTML = '<div class="file-list-header"><span>שם הקובץ</span><span class="file-list-size">גודל</span><span class="file-list-date">תאריך</span><span>פעולות</span></div>'
            + files.map(file => this._fileListRowHtml(file)).join('');
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

            const copyBtn = row.querySelector('.btn-copy');
            if (copyBtn) {
                copyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._copyToClipboard(file, copyBtn);
                });
            }
        });
    },

    _fileListRowHtml(file) {
        return '<div class="file-list-row" data-file-id="' + file.id + '">'
            + '<div class="file-list-name"><span class="file-icon">' + file.icon + '</span>'
            + (file.isNew ? '<span class="badge-new">חדש</span>' : '')
            + '<span title="' + this._escapeHtml(file.name) + '">' + this._highlightName(file) + '</span></div>'
            + '<span class="file-list-size">' + file.sizeFormatted + '</span>'
            + '<span class="file-list-date">' + file.dateFormatted + '</span>'
            + '<div class="file-list-actions">'
            + (file.isVideo ? '<button class="btn-play"><i class="fas fa-play"></i> צפה</button>' : '')
            + '<button class="btn-copy" title="העתק קישור"><i class="fas fa-link"></i></button>'
            + '<a href="' + getDriveDownloadUrl(file.id) + '" target="_blank" rel="noopener"><i class="fas fa-download"></i></a>'
            + '</div></div>';
    },

    /* --- Load More --- */
    _setupLoadMoreObserver() {
        this.loadMoreObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && this.els.loadMoreWrap.style.display !== 'none') {
                    App.loadMore();
                }
            });
        }, { rootMargin: '200px' });
        this.loadMoreObserver.observe(this.els.loadMoreBtn);
    },

    /* --- State Visibility --- */
    showState(state) {
        ['welcomeState','loadingState','emptyState','errorState','fileGrid','fileList'].forEach(id => {
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
        } else {
            this.sortMode = CONFIG.defaultSortMode;
        }
        this.els.sortSelect.value = this.sortMode;
    },

    /* --- Type Filter --- */
    setTypeFilter(filter) {
        localStorage.setItem(CONFIG.filterModeKey, filter);
        this.els.typeFilterBtns.forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
        App.setTypeFilter(filter);
    },

    _loadFilterMode() {
        const saved = localStorage.getItem(CONFIG.filterModeKey);
        const valid = ['all', 'video', 'audio', 'image', 'document'];
        const filter = valid.includes(saved) ? saved : 'all';
        this.els.typeFilterBtns.forEach(b => b.classList.toggle('active', b.dataset.filter === filter));
        App.setTypeFilter(filter);
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

    /* --- Scroll to top --- */
    _setupScrollToTop() {
        const btn = document.createElement('button');
        btn.className = 'scroll-top';
        btn.innerHTML = '<i class="fas fa-chevron-up"></i>';
        btn.setAttribute('aria-label', 'חזרה למעלה');
        document.body.appendChild(btn);

        window.addEventListener('scroll', () => btn.classList.toggle('visible', window.scrollY > 500));
        btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    },

    /* --- Utility --- */
    _escapeHtml(str) {
        if (str === undefined || str === null) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
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
