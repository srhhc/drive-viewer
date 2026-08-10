/* ============================================
   דרייב-צפייה — Configuration
   ============================================ */

const CONFIG = {
    // Data source
    dataBasePath: './data',

    // Loading
    itemsPerPage: 24,        // per load-more batch
    initialBatch: 48,        // first render

    // 'חדש' badge threshold (days)
    newDaysThreshold: 7,

    // Search
    searchMinChars: 2,
    searchDebounceMs: 250,
    fuseOptions: {
        keys: [
            { name: 'name', weight: 0.7 },
            { name: 'folderName', weight: 0.3 }
        ],
        threshold: 0.4,
        distance: 100,
        includeMatches: true,
        minMatchCharLength: 2
    },

    // Cache TTL (ms) — 1 hour
    cacheTTL: 60 * 60 * 1000,

    // Theme
    themeKey: 'drive-viewer-theme',
    defaultTheme: 'light',

    // Disclaimer dismissed flag
    disclaimerKey: 'drive-viewer-disclaimer-dismissed',

    // Last viewed folder
    lastFolderKey: 'drive-viewer-last-folder',

    // View mode
    viewModeKey: 'drive-viewer-view-mode',

    // Sort mode
    sortModeKey: 'drive-viewer-sort-mode',
    defaultSortMode: 'date',

    // File type filter
    filterModeKey: 'drive-viewer-filter-mode',

    // Watch history
    historyKey: 'drive-viewer-history',
    historyMax: 15,

    // Favorites
    favoritesKey: 'drive-viewer-favorites',

    // Last visit timestamp (for 'new since last visit')
    lastVisitKey: 'drive-viewer-last-visit',

    // Video extensions to show with video icon
    videoExtensions: [
        'mp4', 'mkv', 'webm', 'avi', 'mov', 'wmv',
        'flv', 'm4v', 'mpg', 'mpeg', '3gp', 'ogv',
        'ts', 'vob', 'mts', 'm2ts'
    ],

    // Google Drive URLs
    drivePreviewUrl: 'https://drive.google.com/file/d/{id}/preview',
    driveDownloadUrl: 'https://drive.google.com/uc?export=download&id={id}',
    driveViewUrl: 'https://drive.google.com/file/d/{id}/view',

    // File type icons (Font Awesome classes — these are now HTML strings)
    fileIcons: {
        video:     '<i class="fas fa-film"></i>',
        audio:     '<i class="fas fa-music"></i>',
        image:     '<i class="fas fa-image"></i>',
        document:  '<i class="fas fa-file-alt"></i>',
        archive:   '<i class="fas fa-file-archive"></i>',
        folder:    '<i class="fas fa-folder"></i>',
        default:   '<i class="fas fa-file"></i>'
    }
};

// Freeze to prevent accidental modification
Object.freeze(CONFIG);
Object.freeze(CONFIG.fuseOptions);
Object.freeze(CONFIG.fileIcons);
Object.freeze(CONFIG.videoExtensions);
