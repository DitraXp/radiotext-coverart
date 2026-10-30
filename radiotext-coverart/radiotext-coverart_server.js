// RadioText Cover Art — server-side companion (v2.1)

const router = require('../../server/endpoints');
const fs = require('fs');
const path = require('path');

const CACHE_TTL_MS = 60 * 60 * 1000;
const NEGATIVE_CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const USER_AGENT = 'fm-dx-webserver-radiotext-coverart/2.1 (https://github.com/NoobishSVK/fm-dx-webserver)';
const cache = new Map();
const inFlight = new Map();
let musicBrainzQueue = Promise.resolve();
let lastMusicBrainzCall = 0;
const rootDir = path.dirname(require.main.filename);
const preferredConfigDir = path.join(rootDir, 'plugins_configs');
const legacyConfigDir = path.join(rootDir, 'plugin_configs');
const configDir = fs.existsSync(preferredConfigDir) || !fs.existsSync(legacyConfigDir)
    ? preferredConfigDir : legacyConfigDir;
const CONFIG_PATH = path.join(configDir, 'radiotext-coverart.json');
const PLUGIN_HEADER = 'radiotext-coverart';
const MAX_CONFIG_BYTES = 64 * 1024;
const ALLOWED_ADMIN_DEFAULTS = new Set([
    'stableDelay', 'defaultImage', 'anchor', 'side', 'placementMode', 'insideInset', 'gap',
    'overlayX', 'overlayY', 'overlayWidth', 'overlayHeight',
    'overlayPinned', 'overlayPinAnchor', 'overlayPinOffsetX', 'overlayPinOffsetY',
    'overlayViewportX', 'overlayViewportY',
    'enabled', 'songSource', 'useITunes', 'useDeezer', 'useMusicBrainz', 'useTheAudioDB', 'parsePs', 'idleBehaviour', 'retainLastArt', 'showCaption', 'waitingBackgroundOpacity',
    'debugLogging', 'persistentCache', 'minConfidence', 'noArtworkRetrySeconds',
    'panelBackdrop', 'backdropBlur', 'rtPriorityMs'
]);
let sharedConfig = {};

function validatedAdminDefaults(input) {
    if (!input || Array.isArray(input) || typeof input !== 'object') return {};
    const source = input.defaults && typeof input.defaults === 'object' ? input.defaults : input;
    const result = {};
    Object.entries(source).forEach(([key, value]) => {
        if (ALLOWED_ADMIN_DEFAULTS.has(key)) result[key] = value;
    });
    if (result.anchor && !['radiotext', 'ps', 'af'].includes(result.anchor)) delete result.anchor;
    if (result.side && !['before', 'after'].includes(result.side)) delete result.side;
    if (result.placementMode && !['separate', 'inside', 'overlay'].includes(result.placementMode)) delete result.placementMode;
    if (result.overlayPinAnchor && !['ps', 'station', 'radiotext', 'af'].includes(result.overlayPinAnchor)) delete result.overlayPinAnchor;
    if (result.panelBackdrop && !['off', 'ps', 'rt', 'both'].includes(result.panelBackdrop)) delete result.panelBackdrop;
    ['gap', 'insideInset', 'stableDelay', 'minConfidence', 'noArtworkRetrySeconds', 'backdropBlur', 'rtPriorityMs', 'waitingBackgroundOpacity',
        'overlayX', 'overlayY', 'overlayWidth', 'overlayHeight', 'overlayPinOffsetX', 'overlayPinOffsetY',
        'overlayViewportX', 'overlayViewportY']
        .forEach(key => {
            if (key in result && !Number.isFinite(Number(result[key]))) delete result[key];
            else if (key in result) result[key] = Number(result[key]);
        });
    if (result.songSource && !['both', 'rt', 'ps'].includes(result.songSource)) delete result.songSource;
    if (result.idleBehaviour && !['keep', 'stationLogo', 'default'].includes(result.idleBehaviour)) delete result.idleBehaviour;
    if ('waitingBackgroundOpacity' in result && ![0, 25, 50, 75, 100].includes(result.waitingBackgroundOpacity)) {
        delete result.waitingBackgroundOpacity;
    }
    if ('insideInset' in result) result.insideInset = Math.min(8, Math.max(0, result.insideInset));
    ['enabled', 'useITunes', 'useDeezer', 'useMusicBrainz', 'useTheAudioDB', 'parsePs', 'retainLastArt', 'showCaption', 'debugLogging', 'persistentCache',
        'overlayPinned']
        .forEach(key => { if (key in result && typeof result[key] !== 'boolean') delete result[key]; });
    if ('defaultImage' in result && result.defaultImage !== null && typeof result.defaultImage !== 'string') delete result.defaultImage;
    return result;
}

function writeConfigAtomic(config) {
    const json = JSON.stringify(config, null, 2);
    if (Buffer.byteLength(json, 'utf8') > MAX_CONFIG_BYTES) throw new Error('Config is too large');
    fs.mkdirSync(configDir, { recursive: true });
    const temporaryPath = `${CONFIG_PATH}.tmp`;
    fs.writeFileSync(temporaryPath, json, 'utf8');
    fs.renameSync(temporaryPath, CONFIG_PATH);
}

function loadSharedConfig() {
    try {
        fs.mkdirSync(configDir, { recursive: true });
        if (!fs.existsSync(CONFIG_PATH)) writeConfigAtomic({});
        sharedConfig = validatedAdminDefaults(JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8') || '{}'));
    } catch (error) {
        sharedConfig = {};
        console.warn(`[RadioText Cover Art] Could not load ${CONFIG_PATH}: ${error.message}`);
    }
    return sharedConfig;
}

function saveSharedConfig(config) {
    const sanitized = validatedAdminDefaults(config);
    writeConfigAtomic(sanitized);
    sharedConfig = sanitized;
    return sharedConfig;
}

function isPluginRequest(req) {
    return (req.get('X-Plugin-Name') || '') === PLUGIN_HEADER;
}

function isAdminRequest(req) {
    return req.session?.isAdminAuthenticated === true;
}

function requireAdmin(req, res, next) {
    if (isAdminRequest(req)) return next();
    return res.status(401).json({ ok: false, error: 'Unauthorised' });
}

function readJsonBody(req, callback) {
    if (req.body && typeof req.body === 'object') return callback(null, req.body);
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
        raw += chunk;
        if (raw.length > MAX_CONFIG_BYTES) req.destroy();
    });
    req.on('end', () => {
        try { callback(null, raw ? JSON.parse(raw) : {}); }
        catch (error) { callback(error); }
    });
    req.on('error', callback);
}

function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    const ttl = entry.data && entry.data.found ? CACHE_TTL_MS : NEGATIVE_CACHE_TTL_MS;
    if (Date.now() - entry.ts > ttl) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

function cacheSet(key, data) {
    if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(key, { data, ts: Date.now() });
}

async function fetchJson(url, timeoutMs = 6500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

function normalize(value) {
    return (value || '').toString().toLowerCase().normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[’'`]/g, '')
        .replace(/\b(feat(?:uring)?|ft|with|mit|avec|con|com|junto\s+com|em\s+parceria\s+com|vs)\.?\b/g, ' ')
        .replace(/\b(remaster(?:ed)?|radio edit|album version|single version|official|audio|video|lyrics?|live)\b/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(value) {
    return new Set(normalize(value).split(' ').filter(token => token.length > 1));
}

function editSimilarity(left, right) {
    if (!left || !right) return 0;
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i += 1) {
        const current = [i];
        for (let j = 1; j <= right.length; j += 1) {
            current[j] = Math.min(
                current[j - 1] + 1,
                previous[j] + 1,
                previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
            );
        }
        previous.splice(0, previous.length, ...current);
    }
    return 1 - (previous[right.length] / Math.max(left.length, right.length, 1));
}

function similarity(candidate, wanted) {
    const a = normalize(candidate);
    const b = normalize(wanted);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.82;
    const at = tokens(a);
    const bt = tokens(b);
    let intersection = 0;
    bt.forEach(token => { if (at.has(token)) intersection += 1; });
    return intersection / Math.max(at.size, bt.size, 1);
}

function scoreTrack(track, artist, title, strict = false) {
    const candidateArtist = track.artistName || track['artist-credit']?.[0]?.name;
    let artistScore = similarity(candidateArtist, artist);
    // Use edit similarity for both RT and PS so Greeklish/transliterated names
    // remain valid while an unrelated artist with the same title is rejected.
    if (artist) {
        artistScore = Math.max(artistScore, editSimilarity(normalize(candidateArtist), normalize(artist)));
    }
    let titleScore = similarity(track.trackName || track.title, title);
    titleScore = Math.max(titleScore, editSimilarity(normalize(track.trackName || track.title), normalize(title)));
    return { artistScore, titleScore, total: titleScore * 0.62 + artistScore * 0.38 };
}

function bestTrack(results, artist, title, strict = false) {
    if (!Array.isArray(results) || results.length === 0) return null;
    let best = null;
    let bestScore = null;
    results.forEach(track => {
        const score = scoreTrack(track, artist, title, strict);
        if (!bestScore || score.total > bestScore.total) {
            best = track;
            bestScore = score;
        }
    });
    if (!best || !bestScore) return null;
    const minTitle = strict ? 0.76 : 0.64;
    const minTotal = strict ? (artist ? 0.72 : 0.66) : (artist ? 0.62 : 0.68);
    const minArtist = strict ? 0.48 : 0.44;
    const artistMatches = !artist || bestScore.artistScore >= minArtist;
    return best && artistMatches && bestScore.titleScore >= minTitle && bestScore.total >= minTotal
        ? { track: best, score: bestScore }
        : null;
}

async function searchITunes(artist, title, strict, debug = false) {
    const primaryArtist = leadArtist(artist);
    const queries = [
        `${primaryArtist} ${title}`.trim(),
        `"${title}" "${primaryArtist}"`.trim(),
        title
    ].filter(Boolean);
    for (const query of [...new Set(queries)]) {
        try {
            const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=25`;
            const data = await fetchJson(url);
            const match = bestTrack(Array.isArray(data.results) ? data.results : [], primaryArtist, title, strict);
            if (match && match.track.artworkUrl100) {
                const track = match.track;
                return {
                    found: true,
                    artwork: track.artworkUrl100.replace(/100x100(?:bb)?/, '600x600bb'),
                    artworkBig: track.artworkUrl100.replace(/100x100(?:bb)?/, '1200x1200bb'),
                    trackName: track.trackName || title,
                    artistName: track.artistName || artist,
                    collectionName: track.collectionName || '',
                    year: track.releaseDate ? String(track.releaseDate).slice(0, 4) : '',
                    storeUrl: track.trackViewUrl || '',
                    source: 'Apple Music',
                    provider: 'iTunes',
                    confidence: Number(match.score.total.toFixed(3))
                };
            }
        } catch (error) {
            if (debug) console.warn('[RadioText Cover Art] iTunes lookup failed:', error.message);
        }
    }
    return null;
}

function leadArtist(artist) {
    const first = String(artist || '').split(/\s*(?:\/|;|,|&|\+|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b|\bmit\b|\bavec\b|\bcon\b|\bcom\b|\bjunto\s+com\b|\bem\s+parceria\s+com\b|\bvs\.?)\s*/i)[0].trim();
    return first || String(artist || '').trim();
}

function adaptDeezerTrack(track) {
    const album = track.album || {};
    return {
        ...track,
        artistName: track.artist?.name || '',
        trackName: track.title || '',
        collectionName: album.title || ''
    };
}

async function searchDeezer(artist, title, strict, debug = false) {
    const primaryArtist = leadArtist(artist);
    const queries = [
        `artist:\"${primaryArtist}\" track:\"${title}\"`,
        `${primaryArtist} ${title}`.trim(),
        title
    ].filter(Boolean);
    for (const query of [...new Set(queries)]) {
        try {
            const url = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=25`;
            const data = await fetchJson(url);
            const tracks = Array.isArray(data.data) ? data.data.map(adaptDeezerTrack) : [];
            const match = bestTrack(tracks, primaryArtist, title, strict);
            if (match && match.track.album?.cover_medium) {
                const track = match.track;
                return {
                    found: true,
                    artwork: track.album.cover_xl || track.album.cover_big || track.album.cover_medium,
                    artworkBig: track.album.cover_xl || track.album.cover_big || track.album.cover_medium,
                    trackName: track.title || title,
                    artistName: track.artist?.name || artist,
                    collectionName: track.album?.title || '',
                    year: '',
                    storeUrl: track.link || '',
                    source: 'Deezer',
                    provider: 'Deezer',
                    confidence: Number(match.score.total.toFixed(3))
                };
            }
        } catch (error) {
            if (debug) console.warn('[RadioText Cover Art] Deezer lookup failed:', error.message);
        }
    }
    return null;
}

function musicBrainzRequest(url) {
    const task = musicBrainzQueue.then(async () => {
        const wait = Math.max(0, 1050 - (Date.now() - lastMusicBrainzCall));
        if (wait) await new Promise(resolve => setTimeout(resolve, wait));
        lastMusicBrainzCall = Date.now();
        return fetchJson(url, 8000);
    });
    musicBrainzQueue = task.catch(() => {});
    return task;
}

async function coverArtForRelease(releaseId) {
    if (!releaseId) return null;
    try {
        const data = await fetchJson(`https://coverartarchive.org/release/${encodeURIComponent(releaseId)}`);
        const image = (data.images || []).find(item => item.front) || (data.images || [])[0];
        return image && (image.thumbnails?.large || image.thumbnails?.['500'] || image.image);
    } catch (error) {
        return null;
    }
}

async function searchMusicBrainz(artist, title, strict, debug = false) {
    const primaryArtist = leadArtist(artist);
    const query = `recording:${JSON.stringify(title)}${primaryArtist ? ` AND artist:${JSON.stringify(primaryArtist)}` : ''}`;
    try {
        const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=10`;
        const data = await musicBrainzRequest(url);
        const recordings = Array.isArray(data.recordings) ? data.recordings : [];
        const adapted = recordings.map(item => ({
            ...item,
            artistName: (item['artist-credit'] || []).map(a => a.name).join(' & '),
            trackName: item.title
        }));
        const match = bestTrack(adapted, primaryArtist, title, strict);
        if (!match) return null;
        const releases = match.track.releases || [];
        for (const release of releases.slice(0, 3)) {
            const artwork = await coverArtForRelease(release.id);
            if (artwork) {
                return {
                    found: true,
                    artwork,
                    artworkBig: artwork,
                    trackName: match.track.title || title,
                    artistName: match.track.artistName || artist,
                    collectionName: release.title || '',
                    year: release.date ? String(release.date).slice(0, 4) : '',
                    storeUrl: match.track.id ? `https://musicbrainz.org/recording/${encodeURIComponent(match.track.id)}` : '',
                    source: 'MusicBrainz',
                    provider: 'MusicBrainz / Cover Art Archive',
                    confidence: Number(match.score.total.toFixed(3))
                };
            }
        }
    } catch (error) {
        if (debug) console.warn('[RadioText Cover Art] MusicBrainz lookup failed:', error.message);
    }
    return null;
}

function adaptTheAudioDBTrack(track) {
    return {
        ...track,
        artistName: track.strArtist || '',
        trackName: track.strTrack || '',
        collectionName: track.strAlbum || ''
    };
}

async function searchTheAudioDB(artist, title, strict, debug = false) {
    const primaryArtist = leadArtist(artist);
    if (!primaryArtist || !title) return null;
    try {
        const url = `https://www.theaudiodb.com/api/v1/json/123/searchtrack.php?s=${encodeURIComponent(primaryArtist)}&t=${encodeURIComponent(title)}`;
        const data = await fetchJson(url, 8000);
        const tracks = Array.isArray(data.track) ? data.track.map(adaptTheAudioDBTrack) : [];
        const match = bestTrack(tracks, primaryArtist, title, strict);
        if (!match) return null;
        const track = match.track;
        let album = null;
        if (track.idAlbum) {
            try {
                const albumData = await fetchJson(`https://www.theaudiodb.com/api/v1/json/123/album.php?m=${encodeURIComponent(track.idAlbum)}`, 8000);
                album = Array.isArray(albumData.album) ? albumData.album[0] : null;
            } catch (error) {
                if (debug) console.warn('[RadioText Cover Art] TheAudioDB album-art lookup failed:', error.message);
            }
        }
        const artwork = album?.strAlbumThumbHQ || album?.strAlbumThumb || track.strTrackThumb;
        if (!artwork) return null;
        return {
            found: true,
            artwork,
            artworkBig: artwork,
            trackName: track.strTrack || title,
            artistName: track.strArtist || artist,
            collectionName: track.strAlbum || '',
            year: album?.intYearReleased ? String(album.intYearReleased) : '',
            storeUrl: track.idTrack ? `https://www.theaudiodb.com/track/${encodeURIComponent(track.idTrack)}` : '',
            source: 'TheAudioDB',
            provider: 'TheAudioDB',
            confidence: Number(match.score.total.toFixed(3))
        };
    } catch (error) {
        if (debug) console.warn('[RadioText Cover Art] TheAudioDB lookup failed:', error.message);
    }
    return null;
}

async function resolveArtwork({ artist, title, source, providers, debug }) {
    const strict = source === 'ps';
    let result = null;
    if (providers.has('itunes')) result = await searchITunes(artist, title, strict, debug);
    if (!result && providers.has('deezer')) result = await searchDeezer(artist, title, strict, debug);
    if (!result && providers.has('theaudiodb')) result = await searchTheAudioDB(artist, title, strict, debug);
    if (!result && providers.has('musicbrainz')) result = await searchMusicBrainz(artist, title, strict, debug);
    return result || { found: false };
}

loadSharedConfig();

router.get('/radiotext-coverart/config', (req, res) => {
    if (!isPluginRequest(req)) return res.status(403).json({ ok: false, error: 'Unauthorised' });
    // Reload on GET so a manually edited plugins_configs file is picked up
    // without restarting the webserver.
    loadSharedConfig();
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, isAdmin: isAdminRequest(req), config: sharedConfig });
});

router.post('/radiotext-coverart/config', requireAdmin, (req, res) => {
    if (!isPluginRequest(req)) return res.status(403).json({ ok: false, error: 'Unauthorised' });
    readJsonBody(req, (bodyError, body) => {
        if (bodyError) return res.status(400).json({ ok: false, error: 'Invalid JSON' });
        try {
            const config = body?.config || body || {};
            return res.json({ ok: true, config: saveSharedConfig(config) });
        } catch (error) {
            return res.status(500).json({ ok: false, error: error.message || 'Could not save config' });
        }
    });
});

router.get('/radiotext-coverart/get', async (req, res) => {
    const artist = (req.query.artist || '').toString().trim().slice(0, 120);
    const title = (req.query.title || '').toString().trim().slice(0, 120);
    const source = req.query.source === 'ps' ? 'ps' : 'rt';
    const debug = req.query.debug === '1';
    const forceRefresh = req.query.force === '1';
    const allowedProviders = new Set(['itunes', 'deezer', 'theaudiodb', 'musicbrainz']);
    const providers = new Set((req.query.providers || 'itunes,deezer,theaudiodb,musicbrainz').toString().split(',')
        .map(value => value.trim().toLowerCase()).filter(value => allowedProviders.has(value)));
    if (!title || title.length < 2 || !providers.size) return res.json({ found: false });

    const cacheKey = `${source}|${[...providers].sort().join(',')}|${normalize(artist)}|${normalize(title)}`;
    const cached = forceRefresh ? null : cacheGet(cacheKey);
    if (cached) return res.json(cached);

    let task = forceRefresh ? null : inFlight.get(cacheKey);
    if (forceRefresh) {
        // User-configured retries must perform a real provider lookup instead
        // of receiving the five-minute negative cache entry again.
        task = resolveArtwork({ artist, title, source, providers, debug })
            .then(response => { cacheSet(cacheKey, response); return response; });
    } else if (!task) {
        task = resolveArtwork({ artist, title, source, providers, debug })
            .then(response => { cacheSet(cacheKey, response); return response; })
            .finally(() => inFlight.delete(cacheKey));
        inFlight.set(cacheKey, task);
    }
    try {
        const response = await task;
        if (!res.headersSent) res.json(response);
    } catch (error) {
        if (debug) console.warn('[RadioText Cover Art] Lookup failed:', error.message);
        if (!res.headersSent) res.json({ found: false });
    }
});

module.exports = {};
