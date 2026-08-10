/* ============================================
   דרייב-צפייה — Video/Audio Player
   Modal with embedded Google Drive player,
   queue navigation (next/prev), history,
   and mini-player mode (keep browsing while
   the video keeps playing).
   ============================================ */

const VideoPlayer = {
    modal: null,
    frame: null,
    title: null,
    downloadBtn: null,
    prevBtn: null,
    nextBtn: null,
    counter: null,
    shareBtn: null,
    minimizeBtn: null,
    mini: null,             // mini-player container
    miniFrameWrap: null,
    miniTitle: null,
    miniCounter: null,
    currentFile: null,
    queue: [],              // files in current view order
    queueIndex: -1,
    isMinimized: false,

    init() {
        this.modal = document.getElementById('playerModal');
        this.frame = document.getElementById('playerFrame');
        this.title = document.getElementById('playerTitle');
        this.downloadBtn = document.getElementById('playerDownload');
        this.prevBtn = document.getElementById('playerPrev');
        this.nextBtn = document.getElementById('playerNext');
        this.counter = document.getElementById('playerCounter');
        this.shareBtn = document.getElementById('playerShare');
        this.minimizeBtn = document.getElementById('playerMinimize');

        this.mini = document.getElementById('miniPlayer');
        this.miniFrameWrap = document.getElementById('miniPlayerFrameWrap');
        this.miniTitle = document.getElementById('miniPlayerTitle');
        this.miniCounter = document.getElementById('miniPlayerCounter');

        document.getElementById('playerClose').addEventListener('click', () => this.close());

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });

        document.addEventListener('keydown', (e) => {
            if (this.modal.style.display === 'none' && !this.isMinimized) return;
            if (e.key === 'Escape') {
                if (this.isMinimized) this.expand();
                else this.close();
            }
            if (e.key === 'ArrowRight') this.next();
            if (e.key === 'ArrowLeft') this.prev();
        });

        this.prevBtn.addEventListener('click', () => this.prev());
        this.nextBtn.addEventListener('click', () => this.next());
        this.minimizeBtn.addEventListener('click', () => this.minimize());

        // Mini-player controls
        document.getElementById('miniPlayerPrev').addEventListener('click', () => this.prev());
        document.getElementById('miniPlayerNext').addEventListener('click', () => this.next());
        document.getElementById('miniPlayerExpand').addEventListener('click', () => this.expand());
        document.getElementById('miniPlayerClose').addEventListener('click', () => this.close());
    },

    /**
     * Open a file. Optionally provide the full view queue so
     * next/prev buttons work.
     */
    open(file, queue) {
        this.currentFile = file;
        if (Array.isArray(queue) && queue.length > 1) {
            this.queue = queue;
            this.queueIndex = queue.findIndex(f => f.id === file.id);
        } else {
            this.queue = [];
            this.queueIndex = -1;
        }

        this.title.innerHTML = '';
        const iconEl = document.createElement('i');
        iconEl.className = 'fas ' + (file.isAudio ? 'fa-music' : 'fa-film');
        iconEl.style.marginLeft = '8px';
        iconEl.style.color = 'var(--accent)';
        this.title.appendChild(iconEl);
        const textSpan = document.createElement('span');
        textSpan.textContent = file.name;
        this.title.appendChild(textSpan);

        this.downloadBtn.href = getDriveDownloadUrl(file.id);
        this.shareBtn.href = 'https://wa.me/?text=' + encodeURIComponent(file.name + '\n' + getDriveViewUrl(file.id));

        // Load the new file's preview (works both in modal and mini bar)
        this.frame.src = getDrivePreviewUrl(file.id);

        if (this.isMinimized) {
            this._updateMiniInfo();
            this._updateNavState();
            this._recordHistory(file);
            return;
        }

        this.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        this._updateNavState();
        this._recordHistory(file);
    },

    /* --- Mini player --- */
    minimize() {
        if (!this.currentFile || this.isMinimized) return;

        // Move the live iframe into the mini player so playback continues
        const wrap = this.modal.querySelector('.player-wrapper');
        if (wrap && this.frame.parentNode === wrap) {
            wrap.removeChild(this.frame);
        }
        this.miniFrameWrap.appendChild(this.frame);
        this.frame.style.width = '100%';
        this.frame.style.height = '100%';

        this.modal.style.display = 'none';
        document.body.style.overflow = '';
        this.isMinimized = true;

        this._updateMiniInfo();
        this._updateNavState();
        this.mini.style.display = 'flex';
    },

    expand() {
        if (!this.isMinimized) return;

        // Move the live iframe back into the modal
        const wrap = this.modal.querySelector('.player-wrapper');
        if (this.frame.parentNode === this.miniFrameWrap) {
            this.miniFrameWrap.removeChild(this.frame);
        }
        wrap.appendChild(this.frame);

        this.mini.style.display = 'none';
        this.isMinimized = false;
        this.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        this._updateNavState();
    },

    _updateMiniInfo() {
        if (!this.currentFile) return;
        this.miniTitle.textContent = this.currentFile.name;
        this.miniTitle.title = this.currentFile.name;
    },

    _updateNavState() {
        if (this.queue.length > 1 && this.queueIndex >= 0) {
            const label = (this.queueIndex + 1) + ' / ' + this.queue.length;
            this.counter.textContent = label;
            this.prevBtn.disabled = this.queueIndex === 0;
            this.nextBtn.disabled = this.queueIndex === this.queue.length - 1;
            this.counter.style.display = '';
            this.miniCounter.textContent = label;
            this.miniCounter.style.display = '';
        } else {
            this.prevBtn.disabled = true;
            this.nextBtn.disabled = true;
            this.counter.style.display = 'none';
            this.miniCounter.style.display = 'none';
        }
    },

    next() {
        if (this.queueIndex >= 0 && this.queueIndex < this.queue.length - 1) {
            const nextFile = this.queue[this.queueIndex + 1];
            if (nextFile && (nextFile.isVideo || nextFile.isAudio)) {
                this.open(nextFile, this.queue);
            }
        }
    },

    prev() {
        if (this.queueIndex > 0) {
            const prevFile = this.queue[this.queueIndex - 1];
            if (prevFile && (prevFile.isVideo || prevFile.isAudio)) {
                this.open(prevFile, this.queue);
            }
        }
    },

    _recordHistory(file) {
        try {
            const history = JSON.parse(localStorage.getItem(CONFIG.historyKey) || '[]');
            const entry = {
                id: file.id,
                name: file.name,
                folderId: DataStore.currentFolderId,
                path: file.path || '',
                isVideo: !!file.isVideo,
                isAudio: !!file.isAudio,
                mimeType: file.mimeType,
                thumbnailLink: file.thumbnailLink || '',
                folderName: file.folderName || '',
                ts: Date.now()
            };
            const filtered = history.filter(h => h.id !== file.id);
            filtered.unshift(entry);
            localStorage.setItem(CONFIG.historyKey, JSON.stringify(filtered.slice(0, CONFIG.historyMax)));
            // Refresh sidebar history
            if (window.App && typeof App.refreshHistory === 'function') App.refreshHistory();
        } catch (e) { /* ignore */ }
    },

    close() {
        // Stop playback & clean up
        if (this.isMinimized) {
            this.mini.style.display = 'none';
            this.isMinimized = false;
            this.frame.src = '';
        } else {
            this.frame.src = '';
            this.modal.style.display = 'none';
        }
        document.body.style.overflow = '';
        this.currentFile = null;
        this.queue = [];
        this.queueIndex = -1;
        // Ensure the iframe is back in the modal wrapper for next open
        const wrap = this.modal.querySelector('.player-wrapper');
        if (this.frame.parentNode !== wrap && wrap) {
            if (this.frame.parentNode) this.frame.parentNode.removeChild(this.frame);
            wrap.appendChild(this.frame);
        }
    },

    isOpen() {
        return this.modal && (this.modal.style.display !== 'none' || this.isMinimized);
    }
};
