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
        this._initServiceWorker();
        this._initKeyboard();

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
                await this.showHome();
            }
        } else {
            await this.showHome();
        }
    },

    /* --- Keyboard shortcuts --- */
    _initKeyboard() {
        document.addEventListener('keydown', (e) => {
            // Don't hijack when typing in an input
            const tag = (e.target.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

            // '/' focuses search (also opens the box on mobile)
            if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                UI.openSearch();
                return;
            }
            // 'h' or 'g'+'h' → home
            if (e.key === 'h' && !e.ctrlKey && !e.metaKey) {
                this.goHome();
                return;
            }
            // 'f' → favorites
            if (e.key === 'f' && !e.ctrlKey && !e.metaKey) {
                this.showFavorites();
                return;
            }
            // 'n' → what's new
            if (e.key === 'n' && !e.ctrlKey && !e.metaKey) {
                this.showRecent();
                return;
            }
            // 'g' → grid, 'l' → list, 's' → series
            if (e.key === 'g' && !e.ctrlKey && !e.metaKey) { UI.setViewMode('grid'); return; }
            if (e.key === 'l' && !e.ctrlKey && !e.metaKey) { UI.setViewMode('list'); return; }
            if (e.key === 's' && !e.ctrlKey && !e.metaKey) { UI.setViewMode('series'); return; }
            // 't' → toggle theme
            if (e.key === 't' && !e.ctrlKey && !e.metaKey) { UI.toggleTheme(); return; }
        });
    },

    /* --- PWA: register service worker for offline support --- */
    _initServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').catch((err) => {
                console.warn('Service worker registration failed:', err);
            });
        });
    },

    goHome() {
        this.currentPath = '';
        this._updateHash();
        this.showHome();
    },

    /* --- What's new view --- */
    recentMode: false,
    favoritesMode: false,
    homeMode: true,

    /* --- Home dashboard (personal) --- */
    async showHome() {
        this.homeMode = true;
        this.favoritesMode = false;
        this.recentMode = false;
        this.isSearchMode = false;
        this.searchQuery = '';
        UI.matchHighlights = {};

        const lastVisit = this._recordVisit();

        UI.renderFolderTree(null, null, '');
        UI.renderBreadcrumb(null, '');
        UI.showState('welcome');

        const statsEl = document.getElementById('homeStats');
        const sectionsEl = document.getElementById('homeSections');
        if (!statsEl || !sectionsEl) return;

        // Stats
        const totalFiles = DataStore.folders.reduce((acc, f) => acc + (f.fileCount || 0), 0);
        statsEl.innerHTML = '<span class="stat-item"><i class="fas fa-folder"></i> ' + DataStore.folders.length + ' תיקיות</span>'
            + '<span class="stat-item"><i class="fas fa-file-video"></i> ' + totalFiles.toLocaleString('he-IL') + ' קבצים</span>'
            + '<span class="stat-item"><i class="fas fa-tv"></i> ' + this._seriesStat + ' סדרות</span>'
            + '<span class="stat-item"><i class="fas fa-heart"></i> ' + this._getFavorites().length + ' מועדפים</span>';

        // Compute series count lazily (once per session)
        if (this._seriesStat === undefined) {
            this._seriesStat = '…';
            this._countSeries().then(n => {
                this._seriesStat = n;
                const el = document.getElementById('homeStats');
                if (el) {
                    el.innerHTML = '<span class="stat-item"><i class="fas fa-folder"></i> ' + DataStore.folders.length + ' תיקיות</span>'
                        + '<span class="stat-item"><i class="fas fa-file-video"></i> ' + totalFiles.toLocaleString('he-IL') + ' קבצים</span>'
                        + '<span class="stat-item"><i class="fas fa-tv"></i> ' + n + ' סדרות</span>'
                        + '<span class="stat-item"><i class="fas fa-heart"></i> ' + this._getFavorites().length + ' מועדפים</span>';
                }
            });
        }

        // Sections
        const sections = [];

        // Continue watching (from history)
        let history = [];
        try { history = JSON.parse(localStorage.getItem(CONFIG.historyKey) || '[]'); } catch (e) {}
        if (history.length > 0) {
            sections.push({
                title: '<i class="fas fa-history"></i> המשך צפייה',
                items: history.slice(0, 6).map(h => ({
                    id: h.id, name: h.name, mimeType: h.mimeType || '',
                    isVideo: h.isVideo, isAudio: h.isAudio, path: h.path || '',
                    folderName: h.folderName || '', thumbnailLink: h.thumbnailLink || ''
                }))
            });
        }

        // Favorites
        const favs = this._getFavorites();
        if (favs.length > 0) {
            sections.push({
                title: '<i class="fas fa-heart"></i> המועדפים שלך',
                items: favs.slice(0, 6)
            });
        }

        // New since last visit
        if (lastVisit > 0) {
            try {
                const recent = await DataStore.loadRecentFiles();
                const newSince = recent.filter(f => new Date(f.createdTime || 0).getTime() > lastVisit);
                if (newSince.length > 0) {
                    sections.push({
                        title: '<i class="fas fa-sparkles"></i> חדש מאז הביקור האחרון (' + newSince.length + ')',
                        items: newSince.slice(0, 6)
                    });
                }
            } catch (e) { /* recent may be unavailable — skip */ }
        }

        // Top series — most episodes, freshly updated (Netflix-style discovery)
        try {
            const searchFiles = await DataStore.loadSearchIndex();
            const allSeries = SeriesEngine.groupFiles(searchFiles);
            // Top 8 by episode count, prefer recently updated
            const topSeries = allSeries
                .filter(s => s.totalEpisodes >= 2)
                .sort((a, b) => b.totalEpisodes - a.totalEpisodes)
                .slice(0, 8);
            if (topSeries.length > 0) {
                sections.push({
                    title: '<i class="fas fa-crown"></i> הסדרות הכי גדולות',
                    type: 'series',
                    series: topSeries
                });
            }

            // Recommended for you — based on watch history
            const recs = this._recommendSeries(allSeries, history);
            if (recs.length > 0) {
                sections.unshift({
                    title: '<i class="fas fa-wand-magic-sparkles"></i> מומלצים עבורך',
                    type: 'series',
                    series: recs
                });
            }
        } catch (e) { /* skip */ }

        // Trending / recent across all folders
        if (sections.length === 0) {
            try {
                const recent = await DataStore.loadRecentFiles();
                sections.push({
                    title: '<i class="fas fa-bolt"></i> החדש באתר',
                    items: recent.slice(0, 6)
                });
            } catch (e) {}
        }

        sectionsEl.innerHTML = sections.map(sec => {
            // Series-type section (discovery shelf)
            if (sec.type === 'series') {
                return '<div class="home-section">'
                    + '<h3 class="home-section-title">' + sec.title + '</h3>'
                    + '<div class="home-section-grid">'
                    + sec.series.map(s => {
                        const thumb = s.thumbnail
                            ? '<img src="' + this._esc(getImageUrl({ thumbnailLink: s.thumbnail }, 320)) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
                            : '';
                        return '<div class="home-card home-series-card" data-series="' + this._esc(s.name) + '" title="' + this._esc(s.name) + '">'
                            + '<div class="home-card-thumb">' + (thumb || '<i class="fas fa-tv"></i>') + '</div>'
                            + '<div class="home-card-name">' + this._esc(s.name) + '</div>'
                            + '<div class="home-card-folder"><i class="fas fa-layer-group"></i> ' + s.seasonCount + ' עונות · ' + s.totalEpisodes + ' פרקים</div>'
                            + '</div>';
                    }).join('')
                    + '</div></div>';
            }
            // Regular file-type section
            return '<div class="home-section">'
                + '<h3 class="home-section-title">' + sec.title + '</h3>'
                + '<div class="home-section-grid">'
                + sec.items.map(f => {
                    const thumb = f.thumbnailLink
                        ? '<img src="' + this._esc(getImageUrl(f, 320)) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
                        : '';
                    const icon = f.isAudio ? 'fa-music' : (f.isVideo ? 'fa-film' : 'fa-image');
                    return '<div class="home-card" data-id="' + f.id + '" title="' + this._esc(f.name) + '">'
                        + '<div class="home-card-thumb">' + (thumb || '<i class="fas ' + icon + '"></i>') + '</div>'
                        + '<div class="home-card-name">' + this._esc(f.name) + '</div>'
                        + (f.folderName ? '<div class="home-card-folder">' + this._esc(f.folderName) + '</div>' : '')
                        + '</div>';
                }).join('')
                + '</div></div>';
        }).join('') || '<p class="home-empty">הכל שקט כרגע. בחרו תיקייה מהתפריט או חפשו קובץ כדי להתחיל!</p>';

        // Bind file card clicks
        sectionsEl.querySelectorAll('.home-card[data-id]').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.dataset.id;
                const all = sections.flatMap(s => s.items || []);
                const file = all.find(x => x.id === id);
                if (!file) return;
                if (file.isVideo || file.isAudio) {
                    VideoPlayer.open(file, all.filter(x => x.isVideo || x.isAudio));
                } else if (file.mimeType.startsWith('image/')) {
                    this.openLightbox(file);
                } else {
                    window.open(getDrivePreviewUrl(file.id), '_blank');
                }
            });
        });

        // Bind series card clicks → open series detail
        this._homeSeriesList = sections.filter(s => s.type === 'series').flatMap(s => s.series);
        sectionsEl.querySelectorAll('.home-series-card').forEach(card => {
            card.addEventListener('click', () => {
                const name = card.dataset.series;
                const series = this._homeSeriesList.find(s => s.name === name);
                if (!series) return;
                this.openSeries(series.name, this._homeSeriesList);
            });
        });
    },

    /* --- Favorites view --- */
    showFavorites() {
        const favs = this._getFavorites();
        if (favs.length === 0) {
            UI.showToast('אין עדיין מועדפים — לחצו על הלב בכל קובץ');
            return;
        }
        this.favoritesMode = true;
        this.homeMode = false;
        this.recentMode = false;
        this.isSearchMode = false;
        this.searchQuery = '';
        UI.renderFolderTree(null, null, '');
        UI.renderBreadcrumb(null, '');
        document.getElementById('breadcrumb').insertAdjacentHTML('beforeend',
            '<span class="breadcrumb-separator breadcrumb-mode">/</span><span class="breadcrumb-recent breadcrumb-mode"><i class="fas fa-heart"></i> המועדפים</span>');
        UI.matchHighlights = {};
        this.lastSearchFiles = favs;
        this.displayFiles(favs, true);
    },

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
            '<span class="breadcrumb-separator breadcrumb-mode">/</span><span class="breadcrumb-recent breadcrumb-mode"><i class="fas fa-bolt"></i> מה חדש באתר</span>');
            UI.matchHighlights = {};
            this.lastSearchFiles = files;
            this.displayFiles(files, false);
        } catch (err) {
            UI.showError('לא ניתן לטעון את הקבצים החדשים: ' + err.message);
        }
    },

    /* --- Categories & A-Z browsing --- */
    categoriesMode: false,
    _catData: null,
    _catState: null,

    async _loadCategories() {
        if (this._catData) return this._catData;
        const searchFiles = await DataStore.loadSearchIndex();
        const allSeries = SeriesEngine.groupFiles(searchFiles);
        const grouped = CategoryEngine.groupAll(allSeries, searchFiles);
        const moviesEntry = grouped.find(g => g.def.id === 'movies');
        const movies = moviesEntry ? moviesEntry.movies : [];
        this._catData = {
            allSeries,
            grouped,
            movies,
            fileById: new Map(movies.map(m => [m.id, m]))
        };
        return this._catData;
    },

    hideCategories() {
        this.categoriesMode = false;
        this._catState = null;
        if (DataStore.currentFolderId) {
            this.selectFolder(DataStore.currentFolderId);
        } else {
            this.showHome();
        }
    },

    async showCategories(catId, opts) {
        UI.showState('loading');
        try {
            const data = await this._loadCategories();
            this.categoriesMode = true;
            this.homeMode = false;
            this.favoritesMode = false;
            this.recentMode = false;
            this.isSearchMode = false;
            this.searchQuery = '';
            UI.matchHighlights = {};
            UI.renderFolderTree(null, null, '');
            UI.renderBreadcrumb(null, '');
            document.getElementById('breadcrumb').insertAdjacentHTML('beforeend',
                '<span class="breadcrumb-separator breadcrumb-mode">/</span><span class="breadcrumb-recent breadcrumb-mode"><i class="fas fa-layer-group"></i> קטגוריות</span>');

            this._catState = {
                tab: (opts && opts.tab === 'az') ? 'az' : 'grid',
                catId: catId || null,
                letter: (opts && opts.letter) || null,
                azType: (opts && opts.azType) || 'series',
                movieShown: {},
                azMovieShown: {}
            };
            UI.showState('categories');
            this._renderCategories();
        } catch (err) {
            UI.showError('שגיאה בטעינת קטגוריות: ' + err.message);
        }
    },

    _renderCategories() {
        const view = UI.els.categoriesView;
        const st = this._catState;
        const data = this._catData;
        if (!view || !st || !data) return;

        const tabsHtml = '<div class="cat-tabs">'
            + '<button class="cat-tab' + (st.tab === 'grid' ? ' active' : '') + '" data-cat-tab="grid"><i class="fas fa-tags"></i> קטגוריות</button>'
            + '<button class="cat-tab' + (st.tab === 'az' ? ' active' : '') + '" data-cat-tab="az"><i class="fas fa-sort-alpha-down"></i> א-ת</button>'
            + '</div>';

        const body = st.tab === 'az' ? this._azBody(data) : (st.catId ? this._catDetailBody(data) : this._catGridBody(data));
        view.innerHTML = tabsHtml + body;
        view.style.display = 'block';

        // Tabs
        view.querySelectorAll('.cat-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                st.tab = btn.dataset.catTab;
                st.catId = null;
                st.letter = null;
                window.scrollTo({ top: 0, behavior: 'smooth' });
                this._renderCategories();
            });
        });
        // Category cards → detail
        view.querySelectorAll('.category-card').forEach(card => {
            card.addEventListener('click', () => {
                st.catId = card.dataset.cat;
                window.scrollTo({ top: 0, behavior: 'smooth' });
                this._renderCategories();
            });
        });
        // Back to category grid
        const backBtn = view.querySelector('.cat-back');
        if (backBtn) backBtn.addEventListener('click', () => {
            st.catId = null;
            window.scrollTo({ top: 0, behavior: 'smooth' });
            this._renderCategories();
        });
        // A-Z letter chips
        view.querySelectorAll('.az-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                st.letter = chip.dataset.letter;
                this._renderCategories();
                const el = document.getElementById('az-' + st.letter);
                if (el) el.scrollIntoView({ block: 'start' });
            });
        });
        // A-Z type toggle (series / movies)
        view.querySelectorAll('.az-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                st.azType = btn.dataset.type;
                st.letter = null;
                this._renderCategories();
            });
        });
        // Load-more buttons for movies
        view.querySelectorAll('.cat-load-more').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.cat) st.movieShown[btn.dataset.cat] = (st.movieShown[btn.dataset.cat] || 24) + 24;
                if (btn.dataset.letter) st.azMovieShown[btn.dataset.letter] = (st.azMovieShown[btn.dataset.letter] || 24) + 24;
                this._renderCategories();
            });
        });

        this._bindCatSeriesCards(view);
        this._bindCatMovieCards(view);
    },

    _catGridBody(data) {
        const cards = data.grouped.map(g => {
            const thumb = (g.series[0] && g.series[0].thumbnail) || (g.movies[0] && g.movies[0].thumbnailLink) || '';
            const label = g.seriesCount > 0 && g.movieCount > 0
                ? g.seriesCount + ' סדרות · ' + g.movieCount + ' סרטים'
                : g.seriesCount > 0 ? g.seriesCount + ' סדרות' : g.movieCount + ' סרטים';
            return '<div class="category-card" data-cat="' + g.def.id + '">'
                + '<div class="category-card-thumb">'
                + (thumb ? '<img src="' + this._esc(getImageUrl({ thumbnailLink: thumb }, 320)) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '')
                + '<i class="fas ' + g.def.icon + '"></i>'
                + '</div>'
                + '<div class="category-card-body">'
                + '<div class="category-card-name">' + this._esc(g.def.name) + '</div>'
                + '<div class="category-card-count">' + label + '</div>'
                + '</div></div>';
        }).join('');
        return '<div class="category-grid">' + cards + '</div>';
    },

    _catDetailBody(data) {
        const entry = data.grouped.find(g => g.def.id === this._catState.catId);
        if (!entry) return this._catGridBody(data);
        const st = this._catState;
        let html = '<button class="btn btn-sm cat-back"><i class="fas fa-arrow-right"></i> כל הקטגוריות</button>';
        html += '<h3 class="cat-detail-title"><i class="fas ' + entry.def.icon + '"></i> ' + this._esc(entry.def.name) + '</h3>';
        if (entry.series.length) {
            html += '<h4 class="cat-section-title"><i class="fas fa-tv"></i> סדרות (' + entry.series.length + ')</h4>';
            html += '<div class="series-grid cat-series-grid">' + entry.series.map(s => UI.seriesCardHtml(s)).join('') + '</div>';
        }
        if (entry.movies.length) {
            const shown = st.movieShown[entry.def.id] || 24;
            const slice = entry.movies.slice(0, shown);
            html += '<h4 class="cat-section-title"><i class="fas fa-film"></i> סרטים (' + entry.movies.length + ')</h4>';
            html += '<div class="file-grid cat-movie-grid">' + slice.map(f => UI._fileCardHtml(f)).join('') + '</div>';
            if (shown < entry.movies.length) {
                html += '<button class="btn btn-primary cat-load-more" data-cat="' + entry.def.id + '"><i class="fas fa-plus"></i> טען עוד סרטים (' + Math.min(24, entry.movies.length - shown) + ')</button>';
            }
        }
        return html;
    },

    _azBody(data) {
        const st = this._catState;
        const isMovies = st.azType === 'movies';
        const toggle = '<div class="az-type-toggle">'
            + '<button class="az-type-btn' + (!isMovies ? ' active' : '') + '" data-type="series"><i class="fas fa-tv"></i> סדרות</button>'
            + '<button class="az-type-btn' + (isMovies ? ' active' : '') + '" data-type="movies"><i class="fas fa-film"></i> סרטים</button>'
            + '</div>';

        const groupedMap = isMovies
            ? CategoryEngine.groupByLetter(data.movies, f => f.name)
            : CategoryEngine.groupByLetter(data.allSeries, s => s.name);
        const letters = CategoryEngine.availableLetters(groupedMap);

        const chips = '<div class="az-bar">' + letters.map(l => {
            const cnt = groupedMap.get(l).length;
            return '<button class="az-chip' + (st.letter === l ? ' active' : '') + '" data-letter="' + this._esc(l) + '" title="' + cnt + ' פריטים">' + this._esc(l) + '<small>' + cnt + '</small></button>';
        }).join('') + '</div>';

        let body = '';
        if (st.letter && groupedMap.has(st.letter)) {
            const list = groupedMap.get(st.letter);
            if (isMovies) {
                const shown = st.azMovieShown[st.letter] || 24;
                body += '<h4 class="cat-section-title">' + this._esc(st.letter) + ' — סרטים (' + list.length + ')</h4>';
                body += '<div class="file-grid cat-movie-grid">' + list.slice(0, shown).map(f => UI._fileCardHtml(f)).join('') + '</div>';
                if (shown < list.length) {
                    body += '<button class="btn btn-primary cat-load-more" data-letter="' + this._esc(st.letter) + '"><i class="fas fa-plus"></i> טען עוד סרטים (' + Math.min(24, list.length - shown) + ')</button>';
                }
            } else {
                body += '<h4 class="cat-section-title">' + this._esc(st.letter) + ' — סדרות (' + list.length + ')</h4>';
                body += '<div class="series-grid cat-series-grid">' + list.map(s => UI.seriesCardHtml(s)).join('') + '</div>';
            }
        } else {
            body = letters.map(l => {
                const list = groupedMap.get(l);
                let sec = '<h4 class="cat-section-title az-section-title" id="az-' + this._esc(l) + '">' + this._esc(l) + ' <small>(' + list.length + ')</small></h4>';
                if (isMovies) {
                    const shown = st.azMovieShown[l] || 24;
                    sec += '<div class="file-grid cat-movie-grid">' + list.slice(0, shown).map(f => UI._fileCardHtml(f)).join('') + '</div>';
                    if (shown < list.length) {
                        sec += '<button class="btn btn-primary cat-load-more" data-letter="' + this._esc(l) + '"><i class="fas fa-plus"></i> טען עוד (' + Math.min(24, list.length - shown) + ')</button>';
                    }
                } else {
                    sec += '<div class="series-grid cat-series-grid">' + list.map(s => UI.seriesCardHtml(s)).join('') + '</div>';
                }
                return sec;
            }).join('');
        }
        return toggle + chips + '<div class="az-body">' + body + '</div>';
    },

    _bindCatSeriesCards(view) {
        const data = this._catData;
        view.querySelectorAll('.cat-series-grid .series-card').forEach(card => {
            card.addEventListener('click', () => {
                const name = card.dataset.series;
                const series = data.allSeries.find(s => s.name === name);
                if (series) this.openSeries(series.name, data.allSeries);
            });
        });
    },

    _bindCatMovieCards(view) {
        const byId = this._catData.fileById;
        view.querySelectorAll('.cat-movie-grid .file-card').forEach(card => {
            const file = byId.get(card.dataset.fileId);
            if (!file) return;
            const img = card.querySelector('.file-card-thumb img');
            if (img) img.addEventListener('error', () => {
                img.style.display = 'none';
                const fallback = card.querySelector('.file-card-thumb .thumb-icon');
                if (fallback) fallback.style.display = '';
            });
            card.addEventListener('click', (e) => {
                if (e.target.closest('button') || e.target.closest('a')) return;
                if (file.isVideo || file.isAudio) this.playFile(file);
                else if (file.mimeType.startsWith('image/')) this.openLightbox(file);
                else window.open(file.webViewLink || getDrivePreviewUrl(file.id), '_blank');
            });
            const playBtn = card.querySelector('.btn-play');
            if (playBtn) playBtn.addEventListener('click', (e) => { e.stopPropagation(); this.playFile(file); });
            const copyBtn = card.querySelector('.btn-copy');
            if (copyBtn) copyBtn.addEventListener('click', (e) => { e.stopPropagation(); UI._copyToClipboard(file, copyBtn); });
            const favBtn = card.querySelector('.btn-fav');
            if (favBtn) favBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleFavorite(file, favBtn); });
        });
    },

    playFile(file) {
        // In the categories view the play queue is the standalone-movie list
        if (this.categoriesMode && this._catData) {
            const playable = this._catData.movies.filter(f => f.isVideo || f.isAudio);
            VideoPlayer.open(file, playable);
            return;
        }
        VideoPlayer.open(file, this.currentDisplayFiles);
    },

    /* --- Recommend series based on watch history ---
       Scores series by: same folder as watched files (+3),
       shared words with watched series names (+2),
       recent updates (+1). */
    _recommendSeries(allSeries, history) {
        if (!history || history.length === 0) return [];

        // Watched series names + preferred folders
        const watchedSeries = new Set();
        const watchedFolders = new Set();
        for (const h of history) {
            const parsed = SeriesEngine.parse({ name: h.name });
            if (parsed) watchedSeries.add(parsed.seriesName);
            if (h.folderName) watchedFolders.add(h.folderName);
        }
        if (watchedSeries.size === 0 && watchedFolders.size === 0) return [];

        // Build word tokens from watched series for fuzzy similarity
        const watchedTokens = new Set();
        watchedSeries.forEach(name => {
            name.split(/\s+/).filter(w => w.length >= 3).forEach(w => watchedTokens.add(w));
        });

        const scored = [];
        for (const s of allSeries) {
            if (watchedSeries.has(s.name)) continue; // already watching
            if (s.totalEpisodes < 2) continue;
            let score = 0;

            // Same folder as something watched
            const sFolders = new Set(s.files.map(f => f.folderName).filter(Boolean));
            for (const f of watchedFolders) if (sFolders.has(f)) score += 3;

            // Shared tokens with watched series names
            const tokens = s.name.split(/\s+/).filter(w => w.length >= 3);
            for (const t of tokens) if (watchedTokens.has(t)) score += 2;

            // Freshness bonus
            if (Date.now() - s.lastUpdated < 7 * 24 * 3600 * 1000) score += 1;

            if (score > 0) scored.push({ series: s, score });
        }

        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, 8).map(x => x.series);
    },

    /* --- Count series across all folders (lazy, once per session) --- */
    _seriesStat: undefined,
    async _countSeries() {
        try {
            const searchFiles = await DataStore.loadSearchIndex();
            return SeriesEngine.groupFiles(searchFiles).length;
        } catch (e) {
            return 0;
        }
    },

    /* --- Favorites --- */
    _getFavorites() {
        try { return JSON.parse(localStorage.getItem(CONFIG.favoritesKey) || '[]'); }
        catch (e) { return []; }
    },

    isFavorite(fileId) {
        return this._getFavorites().some(f => f.id === fileId);
    },

    toggleFavorite(file, btn) {
        let favs = this._getFavorites();
        const idx = favs.findIndex(f => f.id === file.id);
        if (idx >= 0) {
            favs.splice(idx, 1);
            if (btn) btn.dataset.fav = '0';
            UI.showToast('הוסר מהמועדפים');
        } else {
            favs.unshift({
                id: file.id,
                name: file.name,
                mimeType: file.mimeType || '',
                path: file.path || '',
                folderName: file.folderName || '',
                thumbnailLink: file.thumbnailLink || '',
                isVideo: !!file.isVideo,
                isAudio: !!file.isAudio,
                createdAt: Date.now()
            });
            if (btn) btn.dataset.fav = '1';
            UI.showToast('נוסף למועדפים ♥');
        }
        localStorage.setItem(CONFIG.favoritesKey, JSON.stringify(favs));
        if (btn) {
            btn.classList.toggle('fav-active', idx < 0);
        }
    },

    /* --- Last visit tracking (for 'new since last visit') ---
       Records the visit only once per page load so re-rendering
       the home dashboard doesn't reset the baseline. */
    _visitRecorded: false,
    _recordVisit() {
        const now = Date.now();
        const last = parseInt(localStorage.getItem(CONFIG.lastVisitKey) || '0', 10);
        if (!this._visitRecorded) {
            localStorage.setItem(CONFIG.lastVisitKey, String(now));
            this._visitRecorded = true;
        }
        return last;
    },

    /* --- Series view --- */
    openSeries(seriesName, seriesList) {
        const series = seriesList.find(s => s.name === seriesName);
        if (!series) return;

        this.currentSeries = series;
        this.homeMode = false;
        this.favoritesMode = false;
        this.recentMode = false;
        this.isSearchMode = false;
        this.searchQuery = '';

        UI.renderFolderTree(null, null, '');
        UI.renderBreadcrumb(null, '');
        document.getElementById('breadcrumb').insertAdjacentHTML('beforeend',
            '<span class="breadcrumb-separator breadcrumb-mode">/</span><span class="breadcrumb-recent breadcrumb-mode"><i class="fas fa-tv"></i> ' + this._esc(series.name) + '</span>');
        UI.matchHighlights = {};

        // Render series detail in the main area
        UI.showState('content');
        this.elsFileGrid = UI.els.fileGrid;
        this.elsFileList = UI.els.fileList;
        this.elsSeriesGrid = UI.els.seriesGrid;
        this.elsSeriesGrid.style.display = 'none';
        this.elsFileGrid.style.display = 'none';
        this.elsFileList.style.display = 'none';

        const contentArea = document.getElementById('contentArea');
        // Remove any previous detail view
        const old = document.getElementById('seriesDetail');
        if (old) old.remove();

        const detail = document.createElement('div');
        detail.id = 'seriesDetail';
        detail.className = 'series-detail';

        const allEpisodes = [];
        // Flatten episodes in order for 'continue' logic
        for (const season of series.seasons) {
            for (const ep of season.episodes) allEpisodes.push(ep.file);
        }
        const nextUnwatched = allEpisodes.find(f => !SeriesEngine.isWatched(f.id));
        const hasWatched = allEpisodes.some(f => SeriesEngine.isWatched(f.id));

        let detailHtml = '<div class="series-detail-header">'
            + '<div class="series-detail-thumb">' + (series.thumbnail ? '<img src="' + getImageUrl({ thumbnailLink: series.thumbnail }, 480) + '" alt="">' : '<i class="fas fa-tv"></i>') + '</div>'
            + '<div class="series-detail-info">'
            + '<h2>' + this._esc(series.name) + '</h2>'
            + '<p class="series-detail-meta"><i class="fas fa-layer-group"></i> ' + series.seasonCount + ' עונות · <i class="fas fa-clapperboard"></i> ' + series.totalEpisodes + ' פרקים</p>'
            + '<div class="series-detail-actions">'
            + (nextUnwatched && hasWatched
                ? '<button class="btn btn-primary btn-sm" id="seriesContinue"><i class="fas fa-forward"></i> המשך מהפרק הבא</button>'
                : '')
            + '<button class="btn btn-primary btn-sm" id="seriesPlayAll"><i class="fas fa-play"></i> נגן הכל ברצף</button>'
            + '<button class="btn btn-sm" id="seriesMarkAll"><i class="fas fa-check-double"></i> סמן הכל כנצפה</button>'
            + '</div></div></div>';

        for (const season of series.seasons) {
            detailHtml += '<div class="series-season">'
                + '<h3 class="series-season-title">עונה ' + season.season + '</h3>'
                + '<div class="series-episodes">';
            for (const ep of season.episodes) {
                const watched = SeriesEngine.isWatched(ep.file.id);
                allEpisodes.push(ep.file);
                const isNext = (nextUnwatched && ep.file.id === nextUnwatched.id) ? ' series-episode-next' : '';
                detailHtml += '<div class="series-episode' + isNext + '" data-id="' + ep.file.id + '" data-watched="' + (watched ? '1' : '0') + '">'
                    + (isNext ? '<span class="series-next-badge"><i class="fas fa-play"></i> הבא</span>' : '')
                    + '<button class="series-ep-watched" title="סמן כנצפה"><i class="fas ' + (watched ? 'fa-check-circle' : 'fa-circle') + '"></i></button>'
                    + '<span class="series-ep-num">' + ep.episode + '</span>'
                    + '<span class="series-ep-name" title="' + this._esc(ep.file.name) + '">' + this._esc(ep.file.name) + '</span>'
                    + '<span class="series-ep-meta">' + (ep.file.durationFormatted || ep.file.sizeFormatted || '') + '</span>'
                    + '<button class="btn-play btn-sm"><i class="fas fa-play"></i></button>'
                    + '</div>';
            }
            detailHtml += '</div></div>';
        }
        detail.innerHTML = detailHtml;
        contentArea.appendChild(detail);

        // Bind episode clicks
        detail.querySelectorAll('.series-episode').forEach(row => {
            const fileId = row.dataset.id;
            const file = allEpisodes.find(f => f.id === fileId);
            if (!file) return;

            const playBtn = row.querySelector('.btn-play');
            playBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                SeriesEngine.markWatched(file.id);
                row.dataset.watched = '1';
                row.querySelector('.series-ep-watched i').className = 'fas fa-check-circle';
                VideoPlayer.open(file, allEpisodes.filter(f => f.isVideo || f.isAudio));
            });

            row.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                SeriesEngine.markWatched(file.id);
                row.dataset.watched = '1';
                row.querySelector('.series-ep-watched i').className = 'fas fa-check-circle';
                VideoPlayer.open(file, allEpisodes.filter(f => f.isVideo || f.isAudio));
            });

            const watchBtn = row.querySelector('.series-ep-watched');
            watchBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const nowWatched = SeriesEngine.toggleWatched(file.id);
                row.dataset.watched = nowWatched ? '1' : '0';
                row.querySelector('.series-ep-watched i').className = nowWatched ? 'fas fa-check-circle' : 'fas fa-circle';
            });
        });

        // Bind series-level actions
        const playAllBtn = document.getElementById('seriesPlayAll');
        if (playAllBtn) {
            playAllBtn.addEventListener('click', () => {
                const playable = allEpisodes.filter(f => f.isVideo || f.isAudio);
                if (playable.length > 0) VideoPlayer.open(playable[0], playable);
            });
        }
        const continueBtn = document.getElementById('seriesContinue');
        if (continueBtn && nextUnwatched) {
            continueBtn.addEventListener('click', () => {
                const playable = allEpisodes.filter(f => f.isVideo || f.isAudio);
                VideoPlayer.open(nextUnwatched, playable);
                SeriesEngine.markWatched(nextUnwatched.id);
            });
        }
        const markAllBtn = document.getElementById('seriesMarkAll');
        if (markAllBtn) {
            markAllBtn.addEventListener('click', () => {
                allEpisodes.forEach(f => SeriesEngine.markWatched(f.id));
                detail.querySelectorAll('.series-episode').forEach(row => {
                    row.dataset.watched = '1';
                    const icon = row.querySelector('.series-ep-watched i');
                    if (icon) icon.className = 'fas fa-check-circle';
                });
                UI.showToast('סומנו ' + allEpisodes.length + ' פרקים כנצפו');
            });
        }

        UI.els.resultsCount.textContent = series.totalEpisodes + ' פרקים ב' + series.seasonCount + ' עונות';
        UI.els.loadMoreWrap.style.display = 'none';
    },

    /* --- Copy all visible links --- */
    copyAllLinks() {
        const files = this.currentDisplayFiles || [];
        if (files.length === 0) {
            UI.showToast('אין קבצים להעתקה');
            return;
        }
        const lines = files.map(f => getDriveViewUrl(f.id) + '  ' + f.name);
        const text = lines.join('\n');
        navigator.clipboard.writeText(text).then(() => {
            UI.showToast('הועתקו ' + files.length + ' קישורים');
        }).catch(() => {
            // Fallback for older browsers
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); UI.showToast('הועתקו ' + files.length + ' קישורים'); }
            catch (e) { UI.showToast('שגיאה בהעתקה'); }
            document.body.removeChild(ta);
        });
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
        this.favoritesMode = false;
        this.homeMode = false;
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

        // Remove any lingering series detail view
        const oldDetail = document.getElementById('seriesDetail');
        if (oldDetail) oldDetail.remove();

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
        } else {
            this.showHome();
        }
    },

    /* --- Rendering --- */
    renderCurrentFiles() {
        let files;
        if (this.favoritesMode) {
            files = this._getFavorites();
        } else if (this.recentMode) {
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
        this._updatePlayAllVisibility();
    },

    /* --- Play All (queue from first playable file) --- */
    _updatePlayAllVisibility() {
        const hasPlayable = this.currentDisplayFiles.some(f => f.isVideo || f.isAudio);
        UI.els.playAllBtn.style.display = hasPlayable ? '' : 'none';
    },

    playAll() {
        const playable = this.currentDisplayFiles.filter(f => f.isVideo || f.isAudio);
        if (playable.length === 0) {
            UI.showToast('אין קבצים לנגינה בתצוגה זו');
            return;
        }
        VideoPlayer.open(playable[0], playable);
        UI.showToast('תור ניגון: ' + playable.length + ' קבצים');
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
