/* ============================================
   דרייב-צפייה — Video Player
   Modal with embedded Google Drive player
   ============================================ */

const VideoPlayer = {
    modal: null,
    frame: null,
    title: null,
    downloadBtn: null,
    currentFile: null,

    init() {
        this.modal = document.getElementById('playerModal');
        this.frame = document.getElementById('playerFrame');
        this.title = document.getElementById('playerTitle');
        this.downloadBtn = document.getElementById('playerDownload');

        // Close button
        document.getElementById('playerClose').addEventListener('click', () => this.close());

        // Close on overlay click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display !== 'none') {
                this.close();
            }
        });
    },

    open(file) {
        this.currentFile = file;
        this.title.textContent = file.name;
        this.downloadBtn.href = getDriveDownloadUrl(file.id);
        this.frame.src = getDrivePreviewUrl(file.id);
        this.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        // Type icon next to title (safe text via textContent)
        const icon = file.isAudio ? 'fa-music' : 'fa-film';
        this.title.innerHTML = '';
        const iconEl = document.createElement('i');
        iconEl.className = 'fas ' + icon;
        iconEl.style.marginLeft = '8px';
        iconEl.style.color = 'var(--accent)';
        this.title.appendChild(iconEl);
        const textSpan = document.createElement('span');
        textSpan.textContent = file.name;
        this.title.appendChild(textSpan);
    },

    close() {
        this.frame.src = '';
        this.modal.style.display = 'none';
        document.body.style.overflow = '';
        this.currentFile = null;
    },

    isOpen() {
        return this.modal && this.modal.style.display !== 'none';
    }
};
