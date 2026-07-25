// RadioText Cover Art — server-side companion (v1.2)
//
// Exposes GET /radiotext-coverart/get?artist=...&title=...
// which looks up cover art via the free, keyless iTunes Search API
// and returns a small JSON payload. Results are cached in memory so
// repeat lookups (e.g. the same song playing again, or several
// browser tabs open) don't keep hitting the external API.

const router = require('../../server/endpoints');

// ---- simple in-memory cache ----
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CACHE_MAX_ENTRIES = 500;
const cache = new Map();

function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

function cacheSet(key, data) {
    if (cache.size >= CACHE_MAX_ENTRIES) {
        // Drop the oldest entry (Map preserves insertion order)
        const oldestKey = cache.keys().next().value;
        cache.delete(oldestKey);
    }
    cache.set(key, { data, ts: Date.now() });
}

async function fetchWithTimeout(url, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'fm-dx-webserver-radiotext-coverart-plugin/1.2' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

function normalize(s) {
    return (s || '')
        .toString()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '') // strip accents so e.g. "Marics Peti" ~= "Marics Péti"
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

// 3 = exact normalized match, 2 = one contains the other, 0 = no real match.
function fieldScore(candidate, wanted) {
    if (!candidate || !wanted) return 0;
    if (candidate === wanted) return 3;
    if (candidate.includes(wanted) || wanted.includes(candidate)) return 2;
    return 0;
}

function scoreCandidate(track, wantArtist, wantTitle) {
    return fieldScore(normalize(track.artistName), normalize(wantArtist)) +
           fieldScore(normalize(track.trackName), normalize(wantTitle));
}

// Picks the best-looking match out of a set of candidates instead of
// blindly trusting whichever one iTunes ranked first.
function pickBestMatch(results, wantArtist, wantTitle) {
    let best = null;
    let bestScore = -1;
    for (const track of results) {
        const score = scoreCandidate(track, wantArtist, wantTitle);
        if (score > bestScore) {
            bestScore = score;
            best = track;
        }
    }
    return { track: best, score: bestScore };
}

async function searchByArtist(artist, limit = 25) {
    const term = encodeURIComponent(artist);
    const url = `https://itunes.apple.com/search?term=${term}&attribute=artistTerm&entity=song&limit=${limit}`;
    const data = await fetchWithTimeout(url);
    return (data && Array.isArray(data.results)) ? data.results : [];
}

async function searchGeneral(artist, title, limit = 5) {
    const term = encodeURIComponent(`${artist} ${title}`.trim());
    const url = `https://itunes.apple.com/search?term=${term}&entity=song&limit=${limit}`;
    const data = await fetchWithTimeout(url);
    return (data && Array.isArray(data.results)) ? data.results : [];
}

// Below this, a "match" is more likely to be noise than a real hit, so we'd
// rather report not-found than show confidently-wrong art.
const MIN_ACCEPT_SCORE = 2;

router.get('/radiotext-coverart/get', async (req, res) => {
    const artist = (req.query.artist || '').toString().trim().slice(0, 100);
    const title = (req.query.title || '').toString().trim().slice(0, 100);

    if (!title) {
        return res.json({ found: false });
    }

    const cacheKey = `${artist.toLowerCase()}|||${title.toLowerCase()}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
        return res.json(cached);
    }

    try {
        let best = null;

        // Pass 1: search restricted to this specific artist, then find the
        // best title match among *their* tracks. This is what actually
        // fixes title collisions - e.g. Maggie Reilly's 1992 "Everytime We
        // Touch" vs Cascada's much more famous 2006 song of the same name.
        // A blended search tends to favour the more popular one regardless
        // of which artist was asked for; searching by artist first and then
        // matching the title within their catalogue doesn't have that bias.
        if (artist) {
            const artistResults = await searchByArtist(artist);
            if (artistResults.length > 0) {
                const match = pickBestMatch(artistResults, artist, title);
                if (match.track && match.score >= MIN_ACCEPT_SCORE) best = match.track;
            }
        }

        // Pass 2: fall back to a general blended search if pass 1 didn't
        // turn up a confident match (e.g. iTunes' artist metadata doesn't
        // closely match the RDS-transmitted artist name).
        if (!best) {
            const generalResults = await searchGeneral(artist, title);
            if (generalResults.length > 0) {
                const match = pickBestMatch(generalResults, artist, title);
                if (match.track && match.score >= MIN_ACCEPT_SCORE) best = match.track;
            }
        }

        let result = { found: false };

        if (best) {
            // iTunes gives us a 100x100 thumbnail URL; this pattern swap gets a
            // larger 300x300 version of the same artwork for free.
            const artwork = (best.artworkUrl100 || '').replace('100x100bb', '300x300bb');

            if (artwork) {
                result = {
                    found: true,
                    artwork,
                    trackName: best.trackName || title,
                    artistName: best.artistName || artist,
                    collectionName: best.collectionName || ''
                };
            }
        }

        cacheSet(cacheKey, result);
        res.json(result);
    } catch (err) {
        // Fail quietly - the front-end just keeps whatever it was already showing
        res.json({ found: false, error: err.message });
    }
});

module.exports = {};
