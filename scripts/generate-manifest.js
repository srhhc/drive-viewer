/**
 * ============================================
 * generate-manifest.js
 *
 * סורק תיקיות Google Drive מוגדרות,
 * שומר את כל הקבצים כקבצי JSON מחולקים לפי תיקייה.
 *
 * תומך בשני מצבי הזדהות:
 *   A) OAuth 2.0 (מומלץ) — DRIVE_CLIENT_ID + DRIVE_CLIENT_SECRET + DRIVE_REFRESH_TOKEN
 *      עובד גם על תיקיות שהמשתמש צופה בהן (לא חייבות להיות Anyone with link).
 *   B) API Key — DRIVE_API_KEY
 *      עובד רק על תיקיות ציבוריות (Anyone with the link).
 *
 * ניתן לספק את שניהם — OAuth ינוסה ראשון, API Key כגיבוי.
 *
 * הרצה:
 *   node generate-manifest.js
 * ============================================
 */

const fs = require('fs');
const path = require('path');

// --- Configuration from environment ---

const API_KEY = process.env.DRIVE_API_KEY || '';
const CLIENT_ID = process.env.DRIVE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.DRIVE_CLIENT_SECRET || '';
const REFRESH_TOKEN = process.env.DRIVE_REFRESH_TOKEN || '';
const FOLDER_IDS_RAW = process.env.DRIVE_FOLDER_IDS || '';
const OUTPUT_DIR = path.resolve(__dirname, '..', 'data');

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const INCLUDE_MIME_TYPES = null; // null = include all
const EXCLUDE_MIME_TYPES = [
    'application/vnd.google-apps.folder',
    'application/vnd.google-apps.shortcut'
];

const FILE_FIELDS = [
    'id', 'name', 'mimeType', 'size', 'modifiedTime',
    'thumbnailLink', 'webViewLink', 'webContentLink', 'videoMediaMetadata'
].join(',');

// --- Auth State ---

let authMode = null;      // 'oauth' | 'apikey'
let accessToken = null;
let tokenExpiry = 0;

// --- Main ---

async function main() {
    // Validate folder IDs
    if (!FOLDER_IDS_RAW) {
        console.error('❌ Missing DRIVE_FOLDER_IDS environment variable.');
        process.exit(1);
    }

    const folderIds = FOLDER_IDS_RAW.split(',')
        .map(id => id.trim())
        .filter(id => id.length > 0);

    if (folderIds.length === 0) {
        console.error('❌ No valid folder IDs found.');
        process.exit(1);
    }

    // Authenticate
    await authenticate();

    console.log(`🔍 Scanning ${folderIds.length} folder(s) using ${authMode} auth...`);

    // Ensure output directory
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const allFolders = [];
    let totalFiles = 0;

    for (const folderId of folderIds) {
        console.log(`\n📁 Scanning folder: ${folderId}`);
        try {
            const result = await scanFolder(folderId);
            allFolders.push({
                id: folderId,
                name: result.name,
                fileCount: result.files.length
            });

            const folderFile = path.join(OUTPUT_DIR, `folder_${folderId}.json`);
            fs.writeFileSync(folderFile, JSON.stringify({
                folderId: folderId,
                folderName: result.name,
                files: result.files,
                count: result.files.length,
                scrapedAt: new Date().toISOString()
            }, null, 2));

            totalFiles += result.files.length;
            console.log(`   ✅ ${result.name}: ${result.files.length.toLocaleString()} files`);
        } catch (err) {
            console.error(`   ❌ Failed: ${err.message}`);
            allFolders.push({
                id: folderId,
                name: `תיקייה ${folderId}`,
                fileCount: 0,
                error: err.message
            });
        }
    }

    // Save index
    const indexPath = path.join(OUTPUT_DIR, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify({
        folders: allFolders,
        lastUpdated: new Date().toISOString(),
        totalFiles: totalFiles,
        generatedBy: 'generate-manifest.js'
    }, null, 2));

    console.log(`\n🎉 Done! ${totalFiles.toLocaleString()} total files across ${allFolders.length} folders.`);
}

// --- Authentication ---

async function authenticate() {
    // Try OAuth first (works for both public and private folders)
    if (CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN) {
        try {
            console.log('🔑 Authenticating with OAuth 2.0...');
            await refreshAccessToken();
            authMode = 'oauth';
            console.log('   ✅ OAuth authenticated.');
            return;
        } catch (err) {
            console.warn(`   ⚠️ OAuth failed: ${err.message}`);
        }
    }

    // Fall back to API Key
    if (API_KEY) {
        console.log('🔑 Using API Key authentication.');
        authMode = 'apikey';
        return;
    }

    console.error('❌ No valid authentication method.');
    console.error('   Provide either:');
    console.error('   A) DRIVE_CLIENT_ID + DRIVE_CLIENT_SECRET + DRIVE_REFRESH_TOKEN (OAuth)');
    console.error('   B) DRIVE_API_KEY (API Key, public folders only)');
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
        throw new Error(`Token refresh failed: HTTP ${response.status} — ${body.substring(0, 200)}`);
    }

    const data = await response.json();
    accessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
}

// --- Scanning ---

async function scanFolder(folderId) {
    const folderMeta = await apiRequest(`/files/${folderId}?fields=name`);
    const folderName = folderMeta.name || folderId;

    const allFiles = [];
    await listFilesRecursive(folderId, allFiles);

    return { name: folderName, files: allFiles };
}

async function listFilesRecursive(folderId, accumulator, pageToken = null, depth = 0) {
    const indent = '  '.repeat(Math.min(depth, 5));

    const query = `'${folderId}' in parents and trashed = false`;
    let url = `/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(${FILE_FIELDS})&pageSize=1000&orderBy=name`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const data = await apiRequest(url);

    if (!data.files || data.files.length === 0) {
        if (depth === 0) console.log(`${indent}(empty)`);
        return;
    }

    const folders = [];
    const files = [];

    for (const file of data.files) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
            folders.push(file);
        } else if (!EXCLUDE_MIME_TYPES.includes(file.mimeType)) {
            if (!INCLUDE_MIME_TYPES || INCLUDE_MIME_TYPES.includes(file.mimeType)) {
                files.push(file);
            }
        }
    }

    accumulator.push(...files);

    if (depth === 0) {
        console.log(`${indent}Found ${files.length} files and ${folders.length} subfolders`);
    }

    for (const subFolder of folders) {
        console.log(`${indent}  ↳ Entering subfolder: ${subFolder.name}`);
        await listFilesRecursive(subFolder.id, accumulator, null, depth + 1);
    }

    if (data.nextPageToken) {
        console.log(`${indent}  (more pages...)`);
        await listFilesRecursive(folderId, accumulator, data.nextPageToken, depth);
    }
}

// --- API Request ---

async function apiRequest(endpoint, retries = 3) {
    // Refresh OAuth token if needed
    if (authMode === 'oauth' && Date.now() > tokenExpiry - 60000) {
        await refreshAccessToken();
    }

    const separator = endpoint.includes('?') ? '&' : '?';
    let url;

    if (authMode === 'oauth') {
        url = `${DRIVE_API_BASE}${endpoint}`;
    } else {
        url = `${DRIVE_API_BASE}${endpoint}${separator}key=${API_KEY}`;
    }

    const headers = {};
    if (authMode === 'oauth') {
        headers['Authorization'] = `Bearer ${accessToken}`;
    }

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await fetch(url, { headers });

            if (response.status === 429) {
                const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
                console.warn(`   ⚠️ Rate limited. Waiting ${Math.round(delay)}ms...`);
                await sleep(delay);
                continue;
            }

            if (response.status === 401 && authMode === 'oauth' && attempt < retries - 1) {
                // Token expired — refresh and retry
                await refreshAccessToken();
                headers['Authorization'] = `Bearer ${accessToken}`;
                continue;
            }

            if (!response.ok) {
                const body = await response.text();
                throw new Error(`HTTP ${response.status}: ${body.substring(0, 200)}`);
            }

            return await response.json();
        } catch (err) {
            if (attempt === retries - 1) throw err;
            const delay = Math.pow(2, attempt) * 1000;
            console.warn(`   ⚠️ Attempt ${attempt + 1}/${retries} failed. Retrying in ${delay}ms...`);
            await sleep(delay);
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Run ---

main().catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
});
