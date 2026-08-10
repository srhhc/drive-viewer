/* ============================================
   דרייב-צפייה — Video/Audio Player
   Modal with embedded Google Drive player,
   queue navigation (next/prev), history
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
    currentFile: null,
    queue: [],          // files in current view order
    queueIndex: -1,

    init() {
        this.modal = document.getElementById('playerModal');
        this.frame = document.getElementById('playerFrame');
        this.title = document.getElementById('playerTitle');
        this.downloadBtn = document.getElementById('playerDownload');
        this.prevBtn = document.getElementById('playerPrev');
        this.nextBtn = document.getElementById('playerNext');
        this.counter = document.getElementById('playerCounter');
        this.shareBtn = document.getElementById('playerShare');

        document.getElementById('playerClose').addEventListener('click', () => this.close());

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });

        document.addEventListener('keydown', (e) => {
            if (this.modal.style.display === 'none') return;
            if (e.key === 'Escape') this.close();
            if (e.key === 'ArrowRight') this.next();
            if (e.key === 'ArrowLeft') this.prev();
        });

        this.prevBtn.addEventListener('click', () => this.prev());
        this.nextBtn.addEventListener('click', () => this.next());
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
        this.frame.src = getDrivePreviewUrl(file.id);
        this.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        this._updateNavState();
        this._recordHistory(file);
    },

    _updateNavState() {
        if (this.queue.length > 1 && this.queueIndex >= 0) {
            this.counter.textContent = (this.queueIndex + 1) + ' / ' + this.queue.length;
            this.prevBtn.disabled = this.queueIndex === 0;
            this.nextBtn.disabled = this.queueIndex === this.queue.length - 1;
            this.counter.style.display = '';
        } else {
            this.prevBtn.disabled = true;
            this.nextBtn.disabled = true;
            this.counter.style.display = 'none';
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
        this.frame.src = '';
        this.modal.style.display = 'none';
        document.body.style.overflow = '';
        this.currentFile = null;
        this.queue = [];
        this.queueIndex = -1;
    },

    isOpen() {
        return this.modal && this.modal.style.display !== 'none';
    }
};
