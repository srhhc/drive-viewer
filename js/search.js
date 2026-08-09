/* ============================================
   דרייב-צפייה — Search Engine
   Fuzzy search with Fuse.js
   ============================================ */

const SearchEngine = {
    isIndexReady: false,
    debounceTimer: null,

    // Build Fuse.js search index from all files
    buildIndex(files) {
        if (!files || files.length === 0) {
            this.isIndexReady = false;
            DataStore.fuseInstance = null;
            return;
        }

        DataStore.fuseInstance = new Fuse(files, CONFIG.fuseOptions);
        this.isIndexReady = true;
        console.log(`Search index built: ${files.length.toLocaleString()} files`);
    },

    // Search and return results
    search(query) {
        query = query.trim();
        if (!query || query.length < CONFIG.searchMinChars) {
            return null; // Return null to indicate "no search" vs "no results"
        }

        if (!DataStore.fuseInstance) {
            console.warn('Search index not ready');
            return [];
        }

        return DataStore.fuseInstance.search(query);
    },

    // Debounced search handler
    debounceSearch(query, callback) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            const results = this.search(query);
            callback(results);
        }, CONFIG.searchDebounceMs);
    }
};
