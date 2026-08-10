/**
 * ============================================
 * generate-manifest.js
 *
 * סורק תיקיות Google Drive מוגדרות,
 * שומר את כל הקבצים כקבצי JSON מחולקים לפי תיקייה.
 * כל קובץ כולל שדה path לנתיב היחסי בתוך התיקייה.
 *
 * תומך ב-OAuth 2.0 ו-API Key.
 * ============================================
 */

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.DRIVE_API_KEY || '';
const CLIENT_ID = process.env.DRIVE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.DRIVE_CLIENT_SECRET || '';
const REFRESH_TOKEN = process.env.DRIVE_REFRESH_TOKEN || '';
const FOLDER_IDS_RAW = process.env.DRIVE_FOLDER_IDS || '';
const OUTPUT_DIR = path.resolve(__dirname, '..', 'data');

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const EXCLUDE_MIME_TYPES = [
    'application/vnd.google-apps.folder',
    'application/vnd.google-apps.shortcut'
];

const FILE_FIELDS = [
    'id', 'name', 'mimeType', 'size', 'modifiedTime', 'createdTime',
    'thumbnailLink', 'webViewLink', 'webContentLink', 'videoMediaMetadata'
].join(',');

let authMode = null;
let accessToken = null;
let tokenExpiry = 0;

// --- Main ---

async function main() {
    if (!FOLDER_IDS_RAW) {
        console.error('❌ Missing DRIVE_FOLDER_IDS.');
        process.exit(1);
    }

    const folderIds = FOLDER_IDS_RAW.split(',').map(id => id.trim()).filter(id => id.length > 0);
    if (folderIds.length === 0) {
        console.error('❌ No valid folder IDs.');
        process.exit(1);
    }

    await authenticate();
    console.log('Scanning ' + folderIds.length + ' folder(s) using ' + authMode + ' auth...');

    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const allFolders = [];
    let totalFiles = 0;

    for (const folderId of folderIds) {
        console.log('\nScanning folder: ' + folderId);
        try {
            const result = await scanFolder(folderId);
            allFolders.push({
                id: folderId,
                name: result.name,
                fileCount: result.files.length
            });

            const folderFile = path.join(OUTPUT_DIR, 'folder_' + folderId + '.json');
            fs.writeFileSync(folderFile, JSON.stringify({
                folderId: folderId,
                folderName: result.name,
                files: result.files,
                count: result.files.length,
                scrapedAt: new Date().toISOString()
            }, null, 2));

            totalFiles += result.files.length;
            console.log('   ✅ ' + result.name + ': ' + result.files.length.toLocaleString() + ' files');
        } catch (err) {
            console.error('   ❌ Failed: ' + err.message);
            allFolders.push({
                id: folderId,
                name: 'תיקייה ' + folderId,
                fileCount: 0,
                error: err.message
            });
        }
    }

    const indexPath = path.join(OUTPUT_DIR, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify({
        folders: allFolders,
        lastUpdated: new Date().toISOString(),
        totalFiles: totalFiles,
        generatedBy: 'generate-manifest.js'
    }, null, 2));

    // Build search index (lightweight — for fast client-side search)
    const searchEntries = [];
    const recentCandidates = [];
    for (const folder of allFolders) {
        const folderFile = path.join(OUTPUT_DIR, 'folder_' + folder.id + '.json');
        if (!fs.existsSync(folderFile)) continue;
        let data;
        try { data = JSON.parse(fs.readFileSync(folderFile, 'utf8')); } catch (e) { continue; }
        const folderName = data.folderName || folder.name;
        for (const f of data.files || []) {
            searchEntries.push({
                id: f.id,
                name: f.name,
                mimeType: f.mimeType || '',
                size: f.size || 0,
                modifiedTime: f.modifiedTime || '',
                createdTime: f.createdTime || '',
                thumbnailLink: f.thumbnailLink || '',
                path: f.path || '',
                folderId: folder.id,
                folderName: folderName
            });
            recentCandidates.push(searchEntries[searchEntries.length - 1]);
        }
    }

    // recent.json — newest files across all folders
    recentCandidates.sort((a, b) => new Date(b.createdTime || b.modifiedTime) - new Date(a.createdTime || a.modifiedTime));
    fs.writeFileSync(path.join(OUTPUT_DIR, 'recent.json'), JSON.stringify({
        lastUpdated: new Date().toISOString(),
        files: recentCandidates.slice(0, 60)
    }, null, 2));

    // search_index.json — compact search data
    fs.writeFileSync(path.join(OUTPUT_DIR, 'search_index.json'), JSON.stringify({
        lastUpdated: new Date().toISOString(),
        files: searchEntries
    }, null, 2));

    console.log('\nDone! ' + totalFiles.toLocaleString() + ' total files across ' + allFolders.length + ' folders.');
    console.log('   search_index.json: ' + searchEntries.length.toLocaleString() + ' entries');
}

// --- Authentication ---

async function authenticate() {
    if (CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN) {
        try {
            console.log('Authenticating with OAuth 2.0...');
            await refreshAccessToken();
            authMode = 'oauth';
            console.log('   ✅ OAuth authenticated.');
            return;
        } catch (err) {
            console.warn('   ⚠️ OAuth failed: ' + err.message);
        }
    }

    if (API_KEY) {
        console.log('Using API Key authentication.');
        authMode = 'apikey';
        return;
    }

    console.error('❌ No valid authentication method.');
    process.exit(1);
}

async function refreshAccessToken() {
    const response = await fetch(OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            refresh_token: REFRESH_TOKEN,
            grant_type: 'refresh_token'
        })
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error('Token refresh failed: HTTP ' + response.status + ' — ' + body.substring(0, 200));
    }

    const data = await response.json();
    accessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
}

// --- Scanning ---

async function scanFolder(folderId) {
    const folderMeta = await apiRequest('/files/' + folderId + '?fields=name');
    const folderName = folderMeta.name || folderId;

    const allFiles = [];
    await listFilesRecursive(folderId, '', allFiles);

    // Normalize file metadata
    for (const f of allFiles) {
        // Google returns size as a string
        f.size = parseInt(f.size, 10) || 0;

        // Extract duration & resolution from video metadata
        if (f.videoMediaMetadata) {
            f.durationMs = parseInt(f.videoMediaMetadata.durationMillis, 10) || 0;
            f.width = f.videoMediaMetadata.width || 0;
            f.height = f.videoMediaMetadata.height || 0;
        }
        // Don't ship the raw videoMediaMetadata (redundant)
        delete f.videoMediaMetadata;
    }

    return { name: (folderName || '').trim(), files: allFiles };
}

async function listFilesRecursive(folderId, currentPath, accumulator, pageToken = null, depth = 0) {
    const indent = '  '.repeat(Math.min(depth, 5));

    const query = "'" + folderId + "' in parents and trashed = false";
    let url = '/files?q=' + encodeURIComponent(query) + '&fields=nextPageToken,files(' + FILE_FIELDS + ')&pageSize=1000&orderBy=name';
    if (pageToken) url += '&pageToken=' + pageToken;

    const data = await apiRequest(url);

    if (!data.files || data.files.length === 0) {
        if (depth === 0) console.log(indent + '(empty)');
        return;
    }

    const folders = [];
    const files = [];

    for (const file of data.files) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
            folders.push(file);
        } else if (!EXCLUDE_MIME_TYPES.includes(file.mimeType)) {
            // Add relative path from root folder (trimmed segments)
            file.path = currentPath.split('/').map(s => s.trim()).filter(Boolean).join('/');
            files.push(file);
        }
    }

    accumulator.push(...files);

    if (depth === 0) {
        console.log(indent + 'Found ' + files.length + ' files and ' + folders.length + ' subfolders');
    }

    for (const subFolder of folders) {
        const cleanName = (subFolder.name || '').trim();
        const subPath = currentPath ? currentPath + '/' + cleanName : cleanName;
        console.log(indent + '  -> Entering: ' + cleanName);
        await listFilesRecursive(subFolder.id, subPath, accumulator, null, depth + 1);
    }

    if (data.nextPageToken) {
        console.log(indent + '  (more pages...)');
        await listFilesRecursive(folderId, currentPath, accumulator, data.nextPageToken, depth);
    }
}

// --- API Request ---

async function apiRequest(endpoint, retries = 3) {
    if (authMode === 'oauth' && Date.now() > tokenExpiry - 60000) {
        await refreshAccessToken();
    }

    const separator = endpoint.includes('?') ? '&' : '?';
    let url;

    if (authMode === 'oauth') {
        url = DRIVE_API_BASE + endpoint;
    } else {
        url = DRIVE_API_BASE + endpoint + separator + 'key=' + API_KEY;
    }

    const headers = {};
    if (authMode === 'oauth') {
        headers['Authorization'] = 'Bearer ' + accessToken;
    }

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await fetch(url, { headers });

            if (response.status === 429) {
                const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                console.warn('   ⚠️ Rate limited. Waiting ' + Math.round(delay) + 'ms...');
                await sleep(delay);
                continue;
            }

            if (response.status === 401 && authMode === 'oauth' && attempt < retries - 1) {
                await refreshAccessToken();
                headers['Authorization'] = 'Bearer ' + accessToken;
                continue;
            }

            if (!response.ok) {
                const body = await response.text();
                throw new Error('HTTP ' + response.status + ': ' + body.substring(0, 200));
            }

            return await response.json();
        } catch (err) {
            if (attempt === retries - 1) throw err;
            const delay = Math.pow(2, attempt) * 1000;
            console.warn('   ⚠️ Attempt ' + (attempt + 1) + '/' + retries + ' failed. Retrying in ' + delay + 'ms...');
            await sleep(delay);
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
});
