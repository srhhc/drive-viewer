/* Deterministic test for VideoPlayer open/minimize/expand/close.
   Runs player.js against a minimal fake DOM — no browser, no Drive iframe. */

const fs = require('fs');
const path = require('path');

// ---------- Minimal fake DOM ----------
function makeEl(id) {
    return {
        id: id || '',
        style: {},
        children: [],
        parentNode: null,
        _text: '',
        get innerHTML() { return this._text; },
        set innerHTML(v) { this._text = String(v); },
        textContent: '',
        title: '',
        disabled: false,
        href: '',
        src: '',
        classList: {
            _set: new Set(),
            add(...c) { c.forEach(x => this._set.add(x)); },
            remove(...c) { c.forEach(x => this._set.delete(x)); },
            contains(c) { return this._set.has(c); },
            toString() { return Array.from(this._set).join(' '); }
        },
        get className() { return Array.from(this.classList._set).join(' '); },
        set className(v) { this.classList._set = new Set(String(v).split(/\s+/).filter(Boolean)); },
        appendChild(child) {
            if (child.parentNode) child.parentNode.removeChild(child);
            child.parentNode = this;
            this.children.push(child);
            return child;
        },
        removeChild(child) {
            const i = this.children.indexOf(child);
            if (i >= 0) this.children.splice(i, 1);
            child.parentNode = null;
            return child;
        },
        contains(el) { return el === this || this.children.some(c => c.contains && c.contains(el)); },
        addEventListener() {},
        querySelector() { return null; },
        getAttribute(k) { return this[k] !== undefined ? String(this[k]) : null; }
    };
}

const ids = [
    'playerModal', 'playerFrame', 'playerTitle', 'playerDownload', 'playerPrev',
    'playerNext', 'playerCounter', 'playerShare', 'playerOpenDrive', 'playerMinimize',
    'playerSize', 'playerFullscreen', 'playerClose', 'miniPlayer', 'miniPlayerFrameWrap',
    'miniPlayerTitle', 'miniPlayerCounter', 'miniPlayerPrev', 'miniPlayerNext',
    'miniPlayerExpand', 'miniPlayerClose'
];
const els = {};
ids.forEach(id => els[id] = makeEl(id));

// player-wrapper inside the modal
const wrapper = makeEl('playerWrapper');
wrapper.classList.add('player-wrapper');
wrapper.appendChild(els.playerFrame);
els.playerModal.appendChild(wrapper);
els.playerModal.appendChild(makeEl('modal-container')); // querySelector('.modal-container') returns null in stub — patch below

// Patch querySelector to answer the selectors the player uses
const modalContainer = makeEl('modal-container');
modalContainer.classList.add('modal-container');
els.playerModal.children.push(modalContainer);
els.playerModal.querySelector = (sel) => {
    if (sel === '.modal-container') return modalContainer;
    if (sel === '.player-wrapper') return wrapper;
    return null;
};

const documentStub = {
    getElementById(id) { return els[id] || null; },
    addEventListener() {},
    querySelector() { return null; },
    createElement() { return makeEl(); },
    body: makeEl('body'),
    fullscreenElement: null,
    webkitFullscreenElement: null,
    exitFullscreen() { this.fullscreenElement = null; return Promise.resolve(); },
    webkitExitFullscreen() { this.fullscreenElement = null; return Promise.resolve(); }
};

const localStorageStub = (() => {
    const m = new Map();
    return {
        getItem(k) { return m.has(k) ? m.get(k) : null; },
        setItem(k, v) { m.set(k, String(v)); },
        removeItem(k) { m.delete(k); }
    };
})();

const CONFIG = {
    historyKey: 'dv-history',
    historyMax: 100,
    drivePreviewUrl: 'https://drive.google.com/file/d/{id}/preview',
    driveDownloadUrl: 'https://drive.google.com/uc?export=download&id={id}',
    driveViewUrl: 'https://drive.google.com/file/d/{id}/view'
};

function getDrivePreviewUrl(id) { return CONFIG.drivePreviewUrl.replace('{id}', id); }
function getDriveDownloadUrl(id) { return CONFIG.driveDownloadUrl.replace('{id}', id); }
function getDriveViewUrl(id) { return CONFIG.driveViewUrl.replace('{id}', id); }

global.window = {};
global.document = documentStub;
global.localStorage = localStorageStub;
global.CONFIG = CONFIG;
global.getDrivePreviewUrl = getDrivePreviewUrl;
global.getDriveDownloadUrl = getDriveDownloadUrl;
global.getDriveViewUrl = getDriveViewUrl;
global.DataStore = { currentFolderId: 'f1' };

// Load player.js and grab the object via globalThis
const playerSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'player.js'), 'utf8');
(0, eval)(playerSrc + '\n;globalThis.__VP = VideoPlayer;');
const VideoPlayer = globalThis.__VP;
delete globalThis.__VP;

let failures = 0;
function check(name, cond, detail) {
    const ok = !!cond;
    if (!ok) failures++;
    console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (ok ? '' : '  ' + JSON.stringify(detail)));
}

VideoPlayer.init();

// --- Test 1: open shows modal ---
VideoPlayer.open({ id: 'v1', name: 'a.mp4', isVideo: true }, [{ id: 'v1', name: 'a.mp4', isVideo: true }, { id: 'v2', name: 'b.mp4', isVideo: true }]);
check('open -> modal display flex', els.playerModal.style.display === 'flex', els.playerModal.style.display);
check('open -> frame src is drive preview', els.playerFrame.src.includes('/preview'), els.playerFrame.src);
check('open -> download href', els.playerDownload.href.includes('id=v1'));
check('open -> openDrive href', els.playerOpenDrive.href.includes('/view'), els.playerOpenDrive.href);
check('open -> counter 1/2', els.playerCounter.textContent === '1 / 2', els.playerCounter.textContent);

// --- Test 2: minimize ---
VideoPlayer.minimize();
check('minimize -> isMinimized', VideoPlayer.isMinimized === true);
check('minimize -> modal hidden', els.playerModal.style.display === 'none');
check('minimize -> iframe moved into mini wrap', els.miniPlayerFrameWrap.contains(els.playerFrame));
check('minimize -> body scroll unlocked', documentStub.body.style.overflow === '');
check('minimize -> mini shown', els.miniPlayer.style.display === 'flex');
check('minimize -> mini title', els.miniPlayerTitle.textContent === 'a.mp4');

// --- Test 3: next while minimized ---
VideoPlayer.next();
check('next (minimized) -> still minimized', VideoPlayer.isMinimized === true);
check('next (minimized) -> iframe stays in mini', els.miniPlayerFrameWrap.contains(els.playerFrame));
check('next -> counter 2/2', els.playerCounter.textContent === '2 / 2', els.playerCounter.textContent);
check('next -> new file title', VideoPlayer.currentFile.name === 'b.mp4');

// --- Test 4: expand ---
VideoPlayer.expand();
check('expand -> not minimized', VideoPlayer.isMinimized === false);
check('expand -> modal shown again', els.playerModal.style.display === 'flex', els.playerModal.style.display);
check('expand -> iframe back in wrapper', wrapper.contains(els.playerFrame));
check('expand -> body locked', documentStub.body.style.overflow === 'hidden', documentStub.body.style.overflow);
check('expand -> mini hidden', els.miniPlayer.style.display === 'none');

// --- Test 5: prev ---
VideoPlayer.prev();
check('prev -> back to v1', VideoPlayer.currentFile.name === 'a.mp4');
check('prev -> counter 1/2', els.playerCounter.textContent === '1 / 2');

// --- Test 6: size cycling ---
const c1 = els.playerModal.querySelector('.modal-container').className;
VideoPlayer.cycleSize();
const c2 = els.playerModal.querySelector('.modal-container').className;
check('cycleSize changes class', c1 !== c2, { c1, c2 });
check('cycleSize persists', localStorageStub.getItem('drive-viewer-player-size') !== null);

// --- Test 7: fullscreen fallback (no API) ---
const fsWrap = wrapper;
fsWrap.requestFullscreen = undefined;
fsWrap.webkitRequestFullscreen = undefined;
VideoPlayer.toggleFullscreen();
check('fullscreen fallback -> wide size', els.playerModal.querySelector('.modal-container').className.includes('size-wide'));

// --- Test 8: close ---
VideoPlayer.close();
check('close -> modal hidden', els.playerModal.style.display === 'none');
check('close -> currentFile null', VideoPlayer.currentFile === null);
check('close -> frame back in wrapper', wrapper.contains(els.playerFrame));
check('close -> frame src cleared', els.playerFrame.src === '');
check('close -> body scroll unlocked', documentStub.body.style.overflow === '');

console.log(failures === 0 ? '\nALL TESTS PASSED' : '\n' + failures + ' TEST(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
