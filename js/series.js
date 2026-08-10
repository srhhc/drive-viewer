/* ============================================
   דרייב-צפייה — Series Detection & Grouping
   Auto-detects series from file names
   (עונה X פרק Y / S01E02 / פרק N patterns),
   groups files into series → seasons → episodes,
   and tracks watched episodes locally.
   ============================================ */

const SeriesEngine = {
    /* --- Episode detection patterns (ordered by specificity) --- */
    _patterns: [
        // עונה X פרק Y (Hebrew, most specific)
        { re: /עונה\s*(\d+)\s*פרק\s*(\d+)/i, season: 1, episode: 2 },
        // S01E02 style
        { re: /[sS]\s*(\d+)\s*[eE]\s*(\d+)/, season: 1, episode: 2 },
        // 1x02 style
        { re: /(\d+)\s*[xX]\s*(\d+)/, season: 1, episode: 2 },
        // פרק N only (Hebrew)
        { re: /פרק\s*(\d+)/i, season: null, episode: 1 },
        // E02 only (no season)
        { re: /[eE]\s*(\d+)/, season: null, episode: 1 }
    ],

    /* Noise words stripped from series names */
    _noise: /הועלה\s*ע[^ ]*\s*[^\s]+|הועלה\s*ע[^ ]*|לצפייה\s*ישירה|אחרון\s*לעונה|עונה\s*\d+|פרק\s*[\d\-]+|\([^)]*\)|\[[^\]]*\]|\d{3,4}[pPiI]|\d+\.\d+[pP]/g,

    /* Separator / invisible-character cleanup (applied after noise strip) */
    _cleanName(raw) {
        return raw
            // Remove invisible bidi marks (LRO/RLO/PDF etc.)
            .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\u202C]+/g, '')
            .replace(/\s*[-–—]\s*/g, ' ')
            .replace(/[\s_.]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    /**
     * Parse a file name into { seriesName, season, episode } or null.
     */
    parse(file) {
        // Strip invisible bidi marks first, then extension
        let name = (file.name || '').replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069\u202C]+/g, '');
        name = name.replace(/\.[a-z0-9]{1,5}$/i, '');
        if (!name) return null;

        for (const p of this._patterns) {
            const m = name.match(p.re);
            if (m) {
                let seriesName = name.replace(p.re, '');
                // Clean the series name: strip noise, then normalize separators
                seriesName = this._cleanName(seriesName.replace(this._noise, ' '));
                if (!seriesName) return null;

                const season = p.season ? parseInt(m[p.season], 10) : 1;
                const episode = parseInt(m[p.episode], 10);
                if (isNaN(episode)) return null;

                return { seriesName, season, episode };
            }
        }
        return null;
    },

    /**
     * Group files into series objects:
     * [{ name, files, totalEpisodes, seasons: [{season, episodes: [file]}], lastUpdated, thumbnail }]
     */
    groupFiles(files) {
        const seriesMap = new Map();

        for (const file of files) {
            const parsed = this.parse(file);
            if (!parsed) continue;

            let series = seriesMap.get(parsed.seriesName);
            if (!series) {
                series = { name: parsed.seriesName, seasons: new Map(), files: [], _ids: new Set(), lastUpdated: 0, thumbnail: '' };
                seriesMap.set(parsed.seriesName, series);
            }

            // Skip exact duplicate files — the same Drive file is often shared
            // in several folders, and must appear only once per series.
            if (series._ids.has(file.id)) continue;
            series._ids.add(file.id);

            series.files.push(file);

            let season = series.seasons.get(parsed.season);
            if (!season) {
                season = { season: parsed.season, episodes: [] };
                series.seasons.set(parsed.season, season);
            }
            season.episodes.push({ file, episode: parsed.episode });

            const t = new Date(file.modifiedTime || 0).getTime();
            if (t > series.lastUpdated) series.lastUpdated = t;
            if (!series.thumbnail && file.thumbnailLink) series.thumbnail = file.thumbnailLink;
        }

        const result = [];
        for (const series of seriesMap.values()) {
            // Sort episodes within seasons
            for (const season of series.seasons.values()) {
                season.episodes.sort((a, b) => a.episode - b.episode);
            }
            // Sort seasons
            const seasons = [...series.seasons.values()].sort((a, b) => a.season - b.season);
            result.push({
                name: series.name,
                files: series.files,
                seasons,
                totalEpisodes: series.files.length,
                seasonCount: seasons.length,
                lastUpdated: series.lastUpdated,
                thumbnail: series.thumbnail
            });
            delete series._ids;
        }

        // Sort series: newest first
        result.sort((a, b) => b.lastUpdated - a.lastUpdated);
        return result;
    },

    /* --- Watched tracking (localStorage) --- */
    watchedKey: 'drive-viewer-watched',

    _getWatched() {
        try { return JSON.parse(localStorage.getItem(this.watchedKey) || '{}'); }
        catch (e) { return {}; }
    },

    isWatched(fileId) {
        return !!this._getWatched()[fileId];
    },

    markWatched(fileId) {
        const w = this._getWatched();
        w[fileId] = Date.now();
        localStorage.setItem(this.watchedKey, JSON.stringify(w));
    },

    markUnwatched(fileId) {
        const w = this._getWatched();
        delete w[fileId];
        localStorage.setItem(this.watchedKey, JSON.stringify(w));
    },

    toggleWatched(fileId) {
        if (this.isWatched(fileId)) this.markUnwatched(fileId);
        else this.markWatched(fileId);
        return this.isWatched(fileId);
    },

    clearWatched() {
        localStorage.removeItem(this.watchedKey);
    }
};
