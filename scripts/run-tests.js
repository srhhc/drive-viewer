/* ============================================
   דרייב-צפייה — Comprehensive Test Runner
   Covers: syntax, HTML/JS cross-references,
   config integrity, data integrity (index,
   folders, search_index, recent), series
   engine, search index shape, player logic.
   Run: node scripts/run-tests.js
   ============================================ */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const JS = path.join(ROOT, 'js');

let passed = 0, failed = 0;
const failures = [];

function t(name, fn) {
    try {
        fn();
        passed++;
        console.log('  PASS  ' + name);
    } catch (e) {
        failed++;
        failures.push({ name, error: e.message });
        console.log('  FAIL  ' + name + '  →  ' + e.message);
    }
}

function read(p) { return fs.readFileSync(p, 'utf8'); }
function jread(p) { return JSON.parse(read(p)); }

console.log('\n=== 1. SYNTAX CHECKS ===');
const jsFiles = fs.readdirSync(JS).filter(f => f.endsWith('.js')).map(f => path.join(JS, f));
jsFiles.push(path.join(ROOT, 'sw.js'));
for (const f of jsFiles) {
    t('syntax: ' + path.basename(f), () => {
        const r = cp.spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
        if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'parse error').trim().split('\n')[0]);
    });
}
for (const f of ['generate-manifest.js', 'get-refresh-token.js', 'test-player-logic.js', 'run-tests.js']) {
    t('syntax: scripts/' + f, () => {
        const r = cp.spawnSync(process.execPath, ['--check', path.join(__dirname, f)], { encoding: 'utf8' });
        if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'parse error').trim().split('\n')[0]);
    });
}

console.log('\n=== 2. HTML ↔ JS ID CROSS-REFERENCE ===');
const html = read(path.join(ROOT, 'index.html'));
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const jsAll = jsFiles.filter(f => !f.endsWith('sw.js')).map(f => read(f)).join('\n');
const jsIds = new Set([...jsAll.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]));
// IDs created dynamically by the app itself (not in static HTML)
const dynamicIds = new Set(['seriesDetail', 'seriesContinue', 'seriesMarkAll', 'seriesPlayAll', 'toast']);
const missing = [...jsIds].filter(id => !htmlIds.has(id) && !dynamicIds.has(id));
t('every getElementById has a matching element (' + jsIds.size + ' refs)', () => {
    if (missing.length) throw new Error('missing: ' + missing.join(', '));
});
t('static HTML has no duplicate ids', () => {
    const counts = {};
    for (const id of htmlIds) counts[id] = (counts[id] || 0) + 1;
    const dupes = Object.entries(counts).filter(([, c]) => c > 1).map(([k]) => k);
    if (dupes.length) throw new Error('duplicates: ' + dupes.join(', '));
});

console.log('\n=== 3. CROSS-FILE API REFERENCES ===');
// Map: object name → file that defines it
const apiDefs = {
    UI: 'ui.js', DataStore: 'data.js', App: 'app.js',
    VideoPlayer: 'player.js', SearchEngine: 'search.js', SeriesEngine: 'series.js'
};
for (const [objName, defFile] of Object.entries(apiDefs)) {
    const defSrc = read(path.join(JS, defFile));
    const refs = new Set([...jsAll.matchAll(new RegExp('\\b' + objName + '\\.(\\w+)\\(', 'g'))].map(m => m[1]));
    // Method definitions: `name() {`, `async name() {`, or `name: function ()`
    const defined = new Set([...defSrc.matchAll(/(?:^|\n)\s*(?:async\s+)?(\w+)\s*\(/g)].map(m => m[1]));
    for (const m of defSrc.matchAll(/(\w+)\s*:\s*(?:function\s*\()/g)) defined.add(m[1]);
    const reallyMissing = [...refs].filter(r => !defined.has(r));
    t(objName + ' methods referenced exist in ' + defFile + ' (' + refs.size + ' refs)', () => {
        if (reallyMissing.length) throw new Error('missing: ' + reallyMissing.join(', '));
    });
}
// Global helper functions
const globalFns = new Set([...jsAll.matchAll(/\b(getDrive\w+|getImageUrl)\s*\(/g)].map(m => m[1]));
const definedGlobals = new Set([...read(path.join(JS, 'data.js')).matchAll(/^function (\w+)/gm)].map(m => m[1]));
t('global helper functions are defined', () => {
    const missing = [...globalFns].filter(f => !definedGlobals.has(f));
    if (missing.length) throw new Error('missing: ' + missing.join(', '));
});

console.log('\n=== 4. CONFIG INTEGRITY ===');
const configSrc = read(path.join(JS, 'config.js'));
t('config.js defines CONFIG object', () => { if (!/const CONFIG = \{/.test(configSrc)) throw new Error('no CONFIG literal found'); });
(0, eval)(configSrc + '\n;globalThis.__CFG = CONFIG;');
const config = globalThis.__CFG;
delete globalThis.__CFG;
const configKeys = new Set([...jsAll.matchAll(/\bCONFIG\.(\w+)/g)].map(m => m[1]));
t('every CONFIG.x reference exists in config.js (' + configKeys.size + ' refs)', () => {
    const missing = [...configKeys].filter(k => !(k in config));
    if (missing.length) throw new Error('missing: ' + missing.join(', '));
});
t('drive URL templates contain {id}', () => {
    for (const k of ['drivePreviewUrl', 'driveDownloadUrl', 'driveViewUrl']) {
        if (!String(config[k]).includes('{id}')) throw new Error(k + ' has no {id} placeholder: ' + config[k]);
    }
});
t('fileIcons are Font Awesome (no emoji)', () => {
    for (const [k, v] of Object.entries(config.fileIcons)) {
        if (!String(v).includes('fas fa-')) throw new Error('icon ' + k + ' is not Font Awesome: ' + v);
        if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(String(v))) throw new Error('icon ' + k + ' contains an emoji');
    }
});
t('videoExtensions non-empty and lowercase', () => {
    if (!Array.isArray(config.videoExtensions) || config.videoExtensions.length < 10) throw new Error('videoExtensions too small');
    for (const e of config.videoExtensions) if (e !== e.toLowerCase()) throw new Error('not lowercase: ' + e);
});

console.log('\n=== 5. DATA INTEGRITY ===');
const index = jread(path.join(DATA, 'index.json'));
t('index.json structure', () => {
    if (!Array.isArray(index.folders)) throw new Error('folders not an array');
    if (!index.lastUpdated) throw new Error('no lastUpdated');
    if (typeof index.totalFiles !== 'number') throw new Error('no totalFiles');
    if (index.folders.length < 5) throw new Error('only ' + index.folders.length + ' folders');
});
t('index.json: all folders have id + name', () => {
    for (const f of index.folders) {
        if (!f.id || !f.name) throw new Error('folder missing id/name: ' + JSON.stringify(f).slice(0, 80));
    }
});
t('index.json: no duplicate folder ids', () => {
    const ids = index.folders.map(f => f.id);
    if (new Set(ids).size !== ids.length) throw new Error('duplicate folder ids');
});

// Load every folder file
const folderFiles = fs.readdirSync(DATA).filter(f => /^folder_[A-Za-z0-9_-]+\.json$/.test(f));
t('every index folder (non-error) has a data file', () => {
    const onDisk = new Set(folderFiles.map(f => f.replace(/^folder_|\.json$/g, '')));
    for (const f of index.folders) {
        if (f.error) continue; // folder we can't access — no file expected
        if (!onDisk.has(f.id)) throw new Error('missing data file for folder ' + f.id);
    }
});
t('every data file maps to an index folder', () => {
    const inIndex = new Set(index.folders.map(f => f.id));
    for (const f of folderFiles) {
        const id = f.replace(/^folder_|\.json$/g, '');
        if (!inIndex.has(id)) throw new Error('orphan data file ' + f);
    }
});

const allFiles = [];      // {folderId, ...file}
const idToFile = new Map();
let folderTotal = 0;
const allFileIdsPerFolder = new Map();
for (const ff of folderFiles) {
    const d = jread(path.join(DATA, ff));
    const folderId = d.folderId;
    allFileIdsPerFolder.set(folderId, new Set());
    t('data/' + ff + ' structure', () => {
        if (!d.folderId || !d.folderName) throw new Error('missing folderId/folderName');
        if (!Array.isArray(d.files)) throw new Error('files not an array');
    });
    for (const file of d.files) {
        allFiles.push({ folderId, file });
        idToFile.set(file.id, file);
        allFileIdsPerFolder.get(folderId).add(file.id);
    }
    folderTotal += d.files.length;
}
t('folder fileCount matches actual files', () => {
    for (const ff of folderFiles) {
        const d = jread(path.join(DATA, ff));
        if (d.count !== d.files.length) throw new Error(ff + ': count=' + d.count + ' but files=' + d.files.length);
    }
});
t('total files across folders', () => {
    if (folderTotal < 1000) throw new Error('only ' + folderTotal + ' files — expected thousands');
});

console.log('      (loaded ' + allFiles.length + ' files)');

t('every file has id + name + mimeType', () => {
    const bad = allFiles.filter(({ file }) => !file.id || !file.name || !file.mimeType);
    if (bad.length) throw new Error(bad.length + ' bad entries, e.g. ' + JSON.stringify(bad[0].file).slice(0, 100));
});
t('file ids unique within each folder', () => {
    let dupes = 0;
    for (const [folderId, set] of allFileIdsPerFolder) {
        if (set.size !== allFiles.filter(a => a.folderId === folderId).length) {
            const ids = allFiles.filter(a => a.folderId === folderId).map(a => a.file.id);
            const seen = new Set();
            for (const id of ids) if (seen.has(id)) dupes++;
        }
    }
    if (dupes) throw new Error(dupes + ' duplicate ids inside a single folder');
});
// Same file shared across folders is legitimate (common with shared drives)
const crossFolderDupes = (() => {
    const seen = new Map();
    for (const { file } of allFiles) seen.set(file.id, (seen.get(file.id) || 0) + 1);
    return [...seen.values()].filter(c => c > 1).length;
})();
console.log('      (info: ' + crossFolderDupes + ' files shared across multiple folders)');
t('video/audio/image mime types are sane', () => {
    const bad = allFiles.filter(({ file }) => {
        if (file.mimeType.startsWith('video/') || file.mimeType.startsWith('audio/') ||
            file.mimeType.startsWith('image/') || file.mimeType.startsWith('application/') ||
            file.mimeType.startsWith('text/')) return false;
        return true;
    });
    if (bad.length) throw new Error('unexpected mimes: ' + [...new Set(bad.map(b => b.file.mimeType))].slice(0, 6).join(', '));
});
t('no video is tagged with a KNOWN non-video extension (mimeType is authoritative)', () => {
    // Dates in names ("11.1.25") look like extensions — only flag known non-video types
    const NON_VIDEO_EXTS = ['txt', 'pdf', 'jpg', 'jpeg', 'png', 'gif', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar', '7z', 'exe', 'html', 'json', 'mp3', 'wav'];
    const bad = allFiles.filter(({ file }) => {
        if (!file.mimeType.startsWith('video/')) return false;
        const ext = (file.name.toLowerCase().match(/\.([a-z0-9]{1,5})$/i) || [])[1] || '';
        return NON_VIDEO_EXTS.includes(ext);
    });
    if (bad.length) throw new Error(bad.length + ' videos with non-video extensions, e.g. ' + bad[0].file.name);
});
t('webViewLink/webContentLink point at the right file id', () => {
    const bad = allFiles.filter(({ file }) => {
        // Google-native files (Docs/Sheets/Forms/Script) use docs.google.com links and have no webContentLink
        if (file.mimeType && file.mimeType.startsWith('application/vnd.google-apps.')) return false;
        if (!file.webViewLink || !file.webContentLink) return true;
        return !file.webViewLink.includes('/d/' + file.id) || !file.webContentLink.includes('id=' + file.id);
    });
    if (bad.length) throw new Error(bad.length + ' files with mismatched links, e.g. ' + JSON.stringify(bad[0].file).slice(0, 120));
});

// search_index cross-check
const searchIndex = jread(path.join(DATA, 'search_index.json'));
t('search_index.json structure', () => {
    if (!Array.isArray(searchIndex.files)) throw new Error('no files array');
    if (searchIndex.files.length < 1000) throw new Error('only ' + searchIndex.files.length + ' entries');
});
t('search_index count matches total folder files', () => {
    const delta = Math.abs(searchIndex.files.length - folderTotal);
    if (delta > 0) throw new Error('search_index=' + searchIndex.files.length + ' vs folders=' + folderTotal);
});
t('search_index ids ⊇ folder file ids', () => {
    const si = new Set(searchIndex.files.map(f => f.id));
    const missing = allFiles.filter(({ file }) => !si.has(file.id));
    if (missing.length) throw new Error(missing.length + ' folder files absent from search index, e.g. ' + missing[0].file.id);
});
t('search_index entries have searchable fields', () => {
    const bad = searchIndex.files.filter(f => !f.name || !f.id);
    if (bad.length) throw new Error(bad.length + ' entries missing name/id');
    const noFolder = searchIndex.files.filter(f => !f.folderName);
    if (noFolder.length > searchIndex.files.length * 0.01) throw new Error(noFolder.length + ' entries lack folderName (fuse searches it)');
});

// recent cross-check
const recent = jread(path.join(DATA, 'recent.json'));
t('recent.json structure + max 60 entries', () => {
    if (!Array.isArray(recent.files)) throw new Error('no files array');
    if (recent.files.length > 60) throw new Error(recent.files.length + ' entries (over 60)');
    if (recent.files.length < 1) throw new Error('empty');
});
t('recent.json sorted newest-first by createdTime', () => {
    const times = recent.files.map(f => new Date(f.createdTime || f.modifiedTime).getTime());
    for (let i = 1; i < times.length; i++) {
        if (times[i] > times[i - 1]) throw new Error('not sorted at index ' + i);
    }
});
t('recent.json entries exist in the folder data', () => {
    const missing = recent.files.filter(f => !idToFile.has(f.id));
    if (missing.length) throw new Error(missing.length + ' entries unknown: ' + missing[0].id);
});

console.log('\n=== 6. SERIES ENGINE ===');
// Load series.js with stubbed localStorage
const seriesSrc = read(path.join(JS, 'series.js'));
const lsStub = (() => { const m = new Map(); return {
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); }
}; })();
global.localStorage = lsStub;
(0, eval)(seriesSrc + '\n;globalThis.__SE = SeriesEngine;');
const SeriesEngine = globalThis.__SE;
delete globalThis.__SE;

t('series engine detects real series', () => {
    const series = SeriesEngine.groupFiles(allFiles.map(a => a.file));
    if (series.length < 100) throw new Error('only ' + series.length + ' series detected (expected 100s)');
    console.log('      → ' + series.length + ' series from ' + allFiles.length + ' files');
});
t('every series episode maps to a real file', () => {
    for (const s of SeriesEngine.groupFiles(allFiles.map(a => a.file))) {
        for (const season of s.seasons) {
            for (const ep of season.episodes) {
                if (!idToFile.has(ep.file.id)) throw new Error('episode file unknown: ' + ep.file.id);
                if (!Number.isInteger(ep.episode) || ep.episode < 1) throw new Error('bad episode number: ' + ep.episode);
                if (!Number.isInteger(season.season) || season.season < 1) throw new Error('bad season number: ' + season.season);
            }
        }
    }
});
t('no empty/duplicate series names', () => {
    const names = new Set();
    for (const s of SeriesEngine.groupFiles(allFiles.map(a => a.file))) {
        if (!s.name || !s.name.trim()) throw new Error('empty series name');
        if (names.has(s.name)) throw new Error('duplicate name: ' + s.name);
        names.add(s.name);
    }
});
t('series sorted newest-first + totalEpisodes consistent', () => {
    const series = SeriesEngine.groupFiles(allFiles.map(a => a.file));
    for (let i = 1; i < series.length; i++) {
        if (series[i].lastUpdated > series[i - 1].lastUpdated) throw new Error('sort broken');
    }
    for (const s of series) {
        const sum = s.seasons.reduce((acc, se) => acc + se.episodes.length, 0);
        if (sum !== s.totalEpisodes || sum !== s.files.length) throw new Error('episode count mismatch for ' + s.name);
    }
});
t('watched tracking round-trips', () => {
    const sample = allFiles[0].file;
    SeriesEngine.clearWatched();
    if (SeriesEngine.isWatched(sample.id)) throw new Error('should start unwatched');
    SeriesEngine.markWatched(sample.id);
    if (!SeriesEngine.isWatched(sample.id)) throw new Error('markWatched failed');
    if (SeriesEngine.toggleWatched(sample.id) !== false) throw new Error('toggle from watched should return false');
    if (SeriesEngine.isWatched(sample.id)) throw new Error('still watched after toggle');
    if (SeriesEngine.toggleWatched(sample.id) !== true) throw new Error('toggle from unwatched should return true');
    if (!SeriesEngine.isWatched(sample.id)) throw new Error('not watched after re-toggle');
    SeriesEngine.markUnwatched(sample.id);
    if (SeriesEngine.isWatched(sample.id)) throw new Error('markUnwatched failed');
});
t('no series contains the same file twice (cross-folder dedupe)', () => {
    for (const s of SeriesEngine.groupFiles(allFiles.map(a => a.file))) {
        const ids = s.files.map(f => f.id);
        if (new Set(ids).size !== ids.length) throw new Error('duplicate episode in series: ' + s.name);
    }
});
t('parse handles edge-case names without throwing', () => {
    const edges = [
        { name: 'סדרה עונה 1 פרק 1.mp4' },
        { name: 'Show S01E02 720p.mkv' },
        { name: 'דבר 1x05.mp4' },
        { name: 'פרק 12 בלבד.mp4' },
        { name: 'אין כאן פרק.mp4' },
        { name: '‏עונה 3 פרק 7.mp4' },   // RLO mark
        { name: '' },
        { name: 'movie (2024) 1080p.mp4' },
        { name: 'אחרון לעונה 2 פרק 8.mp4' }
    ];
    for (const e of edges) {
        const r = SeriesEngine.parse(e);
        if (r && (!r.seriesName || r.episode < 1)) throw new Error('bad parse for ' + JSON.stringify(e) + ': ' + JSON.stringify(r));
    }
});

console.log('\n=== 7. SEARCH INDEX SHAPE (Fuse compatibility) ===');
t('fuseOptions keys match search_index fields', () => {
    const fuseKeys = config.fuseOptions.keys.map(k => (typeof k === 'string' ? k : k.name));
    const sample = searchIndex.files[0] || {};
    for (const k of fuseKeys) {
        if (!(k in sample)) throw new Error('fuse key "' + k + '" missing from search_index entries');
    }
});
t('fuseOptions has sane threshold', () => {
    if (typeof config.fuseOptions.threshold !== 'number' || config.fuseOptions.threshold < 0 || config.fuseOptions.threshold > 1) {
        throw new Error('bad threshold: ' + config.fuseOptions.threshold);
    }
});
t('search_min_chars is small enough for UX', () => {
    if (config.searchMinChars < 1 || config.searchMinChars > 3) throw new Error('searchMinChars=' + config.searchMinChars);
});

console.log('\n=== 8. PLAYER LOGIC SUITE ===');
t('player state machine (30 checks in test-player-logic.js)', () => {
    const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'test-player-logic.js')], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error((r.stdout || r.stderr || 'failed').trim().split('\n').slice(-3).join(' | '));
});

// ---- Summary ----
console.log('\n==========================================');
console.log('RESULT: ' + passed + ' passed, ' + failed + ' failed');
if (failed) {
    console.log('\nFailures:');
    for (const f of failures) console.log('  ✗ ' + f.name + '\n      ' + f.error);
    process.exit(1);
}
console.log('ALL TESTS PASSED ✅');
