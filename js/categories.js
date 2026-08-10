/* ============================================
   דרייב-צפייה — Category Engine
   Auto-classifies series & standalone movies into
   genres using Hebrew/English keyword matching,
   and groups them by first letter for A-Z browsing.
   ============================================ */

const CategoryEngine = {
    /* Genre definitions. 'movies' is special — it collects every standalone
       video file that isn't part of a detected series. */
    defs: [
        { id: 'movies',    name: 'סרטים',              icon: 'fa-film',              keywords: [] },
        { id: 'action',    name: 'אקשן ופעולה',       icon: 'fa-bolt',              keywords: ['אקשן', 'פעולה', 'הנוקמים', 'avengers', 'באטמן', 'batman', 'סופרמן', 'superman', 'ספיידרמן', 'spiderman', 'ג\'ון וויק', 'john wick', 'מהיר ועצבני', 'fast and furious', 'rambo', 'mission impossible', 'משימה בלתי אפשרית', 'לוחם', 'warrior', 'נקמה', 'revenge', 'שומרי הגלקסיה'] },
        { id: 'comedy',    name: 'קומדיה',             icon: 'fa-face-laugh-squint', keywords: ['קומדיה', 'comedy', 'מצחיק', 'סטנדאפ', 'stand up', 'בדיחה', 'בדיחות', 'joke', 'צחוק'] },
        { id: 'drama',     name: 'דרמה',               icon: 'fa-masks-theater',     keywords: ['דרמה', 'drama', 'ביוגרפיה', 'biography', 'סיפור חיים', 'חיים של'] },
        { id: 'thriller',  name: 'מתח ופשע',           icon: 'fa-user-secret',       keywords: ['מתח', 'פשע', 'thriller', 'crime', 'בלש', 'בלשים', 'detective', 'רצח', 'murder', 'חקירה', 'משפט', 'חוק', 'csi', 'ncis', 'קרימינל', 'סקנדל', 'המפצח', 'פרשה', 'חטיפה', 'kidnap', 'הבלש'] },
        { id: 'horror',    name: 'אימה',               icon: 'fa-ghost',             keywords: ['אימה', 'horror', 'מפחיד', 'צמרמורת', 'זומבי', 'zombie', 'רוע', 'ערפד', 'vampire'] },
        { id: 'scifi',     name: 'מדע בדיוני ופנטזיה', icon: 'fa-rocket',            keywords: ['מדע בדיוני', 'בדיוני', 'sci-fi', 'science fiction', 'פנטזיה', 'fantasy', 'חייזרים', 'aliens', 'חלל', 'space', 'גלקסיה', 'galaxy', 'מלחמת הכוכבים', 'star wars', 'מסע בין כוכבים', 'star trek', 'marvel', 'אקס-מן', 'x-men', 'הארי פוטר', 'harry potter', 'שר הטבעות', 'lord of the rings', 'כוכבים'] },
        { id: 'anime',     name: 'אנימה',              icon: 'fa-dragon',            keywords: ['אנימה', 'anime', 'דרגון בול', 'dragon ball', 'נארוטו', 'naruto', 'וואן פיס', 'one piece', 'סיילור מון', 'sailor moon', 'פוקימון', 'pokemon', 'האנטר', 'hunter x', 'סאיין', 'סייטמה', 'one punch', 'התקפת הטיטאנים', 'attack on titan', 'death note', 'דת\' נוט', 'טוקיו'] },
        { id: 'romance',   name: 'רומנטיקה',           icon: 'fa-heart',             keywords: ['רומנטי', 'רומנטיקה', 'romance', 'אהבה', 'love', 'חתונה', 'wedding', 'לב'] },
        { id: 'kids',      name: 'ילדים ומשפחה',       icon: 'fa-children',          keywords: ['ילדים', 'לילדים', 'kids', 'kid', 'מצויר', 'cartoon', 'דיסני', 'disney', 'בוב ספוג', 'spongebob', 'פו הדב', 'winnie', 'מיקי מאוס', 'סינדרלה', 'מלך האריות', 'lion king', 'לשבור את הקרח', 'frozen', 'צעצוע של סיפור', 'toy story', 'פינוקיו', 'paw patrol', 'פאו פטרול'] },
        { id: 'documentary', name: 'דוקו וחדשות',      icon: 'fa-newspaper',         keywords: ['דוקו', 'דוקומנטרי', 'documentary', 'חדשות', 'מהדורה', 'מהדורות', 'אקטואליה', 'news', 'עובדה', 'פוליטיקה', 'תחקיר', 'תחקירים', 'בגבולות', 'המגזין', 'עולם'] },
        { id: 'music',     name: 'מוזיקה ובידור',      icon: 'fa-music',             keywords: ['מוזיקה', 'שירים', 'שיר', 'music', 'הופעה', 'concert', 'ריאליטי', 'reality', 'הכוכב הבא', 'אקס פקטור', 'x factor', 'הזמר במסכה', 'כוכב נולד', 'המרדף', 'שש עם', 'רוקדים'] },
        { id: 'sports',    name: 'ספורט',              icon: 'fa-futbol',            keywords: ['ספורט', 'sport', 'sports', 'כדורגל', 'football', 'כדורסל', 'basketball', 'טניס', 'tennis', 'אליפות', 'championship', 'גביע', 'אולימפיאדה', 'olympics', 'פורמולה', 'formula', 'גרנד פרי', 'קרב'] },
        { id: 'food',      name: 'אוכל ובישול',        icon: 'fa-utensils',          keywords: ['אוכל', 'בישול', 'מתכון', 'מתכונים', 'recipe', 'המטבח', 'שף', 'masterchef', 'מאסטר שף', 'אפייה', 'בישולים', 'מחשב מתכון'] }
    ],

    /* Common prefixes that repeat in shared drives and don't affect genre */
    _stripPrefix(name) {
        return (name || '').replace(/^(copy of|עותק של|העותק|עותק)\s+/i, '').trim();
    },

    /**
     * Match free text (lowercased) against category keywords.
     * Returns an array of category ids. 'movies' is never matched here.
     */
    classify(text) {
        const t = (' ' + (text || '').toLowerCase() + ' ');
        const hits = [];
        for (const def of this.defs) {
            if (def.id === 'movies' || !def.keywords.length) continue;
            for (const kw of def.keywords) {
                if (t.indexOf(kw) !== -1) { hits.push(def.id); break; }
            }
        }
        return hits;
    },

    /** Classify a series using its name, a few episode names, and its folder. */
    classifySeries(series) {
        let text = this._stripPrefix(series.name);
        for (let i = 0; i < Math.min(3, series.files.length); i++) {
            text += ' ' + (series.files[i].name || '');
        }
        if (series.files[0] && series.files[0].folderName) text += ' ' + series.files[0].folderName;
        return this.classify(text);
    },

    /** Classify a standalone file (movie) by name + folder. */
    classifyFile(file) {
        let text = this._stripPrefix((file.name || '').replace(/\.[a-z0-9]{1,5}$/i, ''));
        if (file.folderName) text += ' ' + file.folderName;
        return this.classify(text);
    },

    /**
     * Group series and standalone movies into categories.
     * @param seriesList  result of SeriesEngine.groupFiles()
     * @param allFiles    full processed file list (for standalone movies)
     * @returns [{ def, series: [], movies: [], seriesCount, movieCount, total }] sorted by total desc
     */
    groupAll(seriesList, allFiles) {
        // Build a set of file ids that belong to a series
        const seriesIds = new Set();
        for (const s of seriesList) for (const f of s.files) seriesIds.add(f.id);

        // Standalone movies = video files not in any series
        const movies = (allFiles || []).filter(f => f.isVideo && !seriesIds.has(f.id));

        const map = new Map(this.defs.map(d => [d.id, { def: d, series: [], movies: [] }]));

        for (const s of seriesList) {
            for (const cid of this.classifySeries(s)) {
                const entry = map.get(cid);
                if (entry && entry.series.indexOf(s) === -1) entry.series.push(s);
            }
        }

        // Every standalone movie goes to the generic 'movies' category,
        // and to any genre its name matches.
        for (const m of movies) {
            map.get('movies').movies.push(m);
            for (const cid of this.classifyFile(m)) {
                const entry = map.get(cid);
                if (entry && entry.movies.indexOf(m) === -1) entry.movies.push(m);
            }
        }

        const result = [];
        for (const entry of map.values()) {
            const seriesCount = entry.series.length;
            const movieCount = entry.movies.length;
            if (seriesCount + movieCount === 0) continue;
            result.push({
                def: entry.def,
                series: entry.series,
                movies: entry.movies,
                seriesCount,
                movieCount,
                total: seriesCount + movieCount
            });
        }
        result.sort((a, b) => b.total - a.total);
        return result;
    },

    /* --- A-Z helpers --- */
    hebrewLetters: 'אבגדהוזחטיכלמנסעפצקרשת',

    /** First meaningful letter of a name for A-Z browsing. */
    firstLetter(name) {
        let n = this._stripPrefix(name || '');
        n = n.replace(/^["'«»“‘]+/, '').trim();
        if (!n) return '#';
        const ch = n.charAt(0);
        if (/[\u05D0-\u05EA]/.test(ch)) return ch;
        if (/[a-zA-Z]/.test(ch)) return ch.toUpperCase();
        if (/[0-9]/.test(ch)) return '#';
        return '#';
    },

    /** All letters present in a grouped map, Hebrew first then A-Z then #. */
    availableLetters(groupedMap) {
        const hebrew = [...this.hebrewLetters].filter(l => groupedMap.has(l));
        const latin = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(l => groupedMap.has(l));
        const other = groupedMap.has('#') ? ['#'] : [];
        return hebrew.concat(latin, other);
    },

    /** Group a list of { key: name, value } into Map letter → entries. */
    groupByLetter(items, nameOf) {
        const map = new Map();
        for (const item of items) {
            const letter = this.firstLetter(nameOf(item));
            if (!map.has(letter)) map.set(letter, []);
            map.get(letter).push(item);
        }
        for (const arr of map.values()) arr.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'he'));
        return map;
    }
};
