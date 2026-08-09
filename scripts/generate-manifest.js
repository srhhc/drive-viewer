/**
 * ============================================
 * generate-manifest.js
 *
 * סורק תיקיות Google Drive מוגדרות,
 * שומר את כל הקבצים כקבצי JSON מחולקים לפי תיקייה.
 *
 * הרצה: DRIVE_API_KEY=xxx DRIVE_FOLDER_IDS=id1,id2 node generate-manifest.js
 * ============================================
 */

const fs = require('fs');
const path = require('path');

// --- Configuration ---

const API_KEY = process.env.DRIVE_API_KEY || '';
const FOLDER_IDS_RAW = process.env.DRIVE_FOLDER_IDS || '';
const OUTPUT_DIR = path.resolve(__dirname, '..', 'data');

// Drive API endpoint
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';

// File types to include (everything, but we can filter)
const INCLUDE_MIME_TYPES = null; // null = include all
const EXCLUDE_MIME_TYPES = [
    'application/vnd.google-apps.folder',
    'application/vnd.google-apps.shortcut'
];

// Fields to request from the API
const FILE_FIELDS = [
    'id',
    'name',
    'mimeType',
    'size',
    'modifiedTime',
    'thumbnailLink',
    'webViewLink',
    'webContentLink',
    'videoMediaMetadata'
].join(',');

// --- Main ---

async function main() {
    if (!API_KEY) {
        console.error('❌ Missing DRIVE_API_KEY environment variable.');
        console.error('   Set it in GitHub Secrets or pass as env var.');
        process.exit(1);
    }

    if (!FOLDER_IDS_RAW) {
        console.error('❌ Missing DRIVE_FOLDER_IDS environment variable.');
        console.error('   Set comma-separated folder IDs in GitHub Secrets.');
        process.exit(1);
    }

    // Parse and clean folder IDs
    const folderIds = FOLDER_IDS_RAW.split(',')
        .map(id => id.trim())
        .filter(id => id.length > 0);

    if (folderIds.length === 0) {
        console.error('❌ No valid folder IDs found.');
        process.exit(1);
    }

    console.log(`🔍 Scanning ${folderIds.length} folder(s)...`);

    // Ensure output directory exists
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

            // Save folder-specific manifest
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
            console.error(`   ❌ Failed to scan folder ${folderId}:`, err.message);
            allFolders.push({
                id: folderId,
                name: `תיקייה ${folderId}`,
                fileCount: 0,
                error: err.message
            });
        }
    }

    // Save index file
    const indexPath = path.join(OUTPUT_DIR, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify({
        folders: allFolders,
        lastUpdated: new Date().toISOString(),
        totalFiles: totalFiles,
        generatedBy: 'generate-manifest.js'
    }, null, 2));

    console.log(`\n🎉 Done! ${totalFiles.toLocaleString()} total files across ${allFolders.length} folders.`);
    console.log(`   Index saved to: ${indexPath}`);
}

/**
 * Scan a folder recursively, returning { name, files }
 */
async function scanFolder(folderId) {
    // First, get folder metadata
    const folderMeta = await apiRequest(`/files/${folderId}?fields=name`);
    const folderName = folderMeta.name || folderId;

    // Then, recursively list all files
    const allFiles = [];
    await listFilesRecursive(folderId, allFiles);

    return {
        name: folderName,
        files: allFiles
    };
}

/**
 * Recursively list files in a folder
 */
async function listFilesRecursive(folderId, accumulator, pageToken = null, depth = 0) {
    const indent = '  '.repeat(Math.min(depth, 5));

    let query = `'${folderId}' in parents and trashed = false`;

    // Build URL
    let url = `/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(${FILE_FIELDS})&pageSize=1000&orderBy=name`;
    if (pageToken) {
        url += `&pageToken=${pageToken}`;
    }

    const data = await apiRequest(url);

    if (!data.files || data.files.length === 0) {
        if (depth === 0) {
            console.log(`${indent}(empty)`);
        }
        return;
    }

    // Separate folders from files
    const folders = [];
    const files = [];

    for (const file of data.files) {
        if (file.mimeType === 'application/vnd.google-apps.folder') {
            folders.push(file);
        } else if (!EXCLUDE_MIME_TYPES.includes(file.mimeType)) {
            // Check if we should include this MIME type
            if (!INCLUDE_MIME_TYPES || INCLUDE_MIME_TYPES.includes(file.mimeType)) {
                files.push(file);
            }
        }
    }

    // Add files from this level
    accumulator.push(...files);

    if (depth === 0) {
        console.log(`${indent}Found ${files.length} files and ${folders.length} subfolders`);
    }

    // Recurse into subfolders
    for (const subFolder of folders) {
        console.log(`${indent}  ↳ Entering subfolder: ${subFolder.name}`);
        await listFilesRecursive(subFolder.id, accumulator, null, depth + 1);
    }

    // Handle pagination
    if (data.nextPageToken) {
        console.log(`${indent}  (more pages...)`);
        await listFilesRecursive(folderId, accumulator, data.nextPageToken, depth);
    }
}

/**
 * Make a Google Drive API request
 */
async function apiRequest(endpoint, retries = 3) {
    const url = `${DRIVE_API_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}key=${API_KEY}`;

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await fetch(url);

            if (response.status === 429) {
                // Rate limited — exponential backoff
                const delay = Math.pow(2, attempt) * 1000;
                console.warn(`   ⚠️ Rate limited. Waiting ${delay}ms...`);
                await sleep(delay);
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
            console.warn(`   ⚠️ Request failed (attempt ${attempt + 1}/${retries}). Retrying in ${delay}ms...`);
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
