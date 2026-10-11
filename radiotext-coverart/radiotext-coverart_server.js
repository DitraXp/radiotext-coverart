// RadioText Cover Art — server-side companion (v1.3.1)

const router = require('../../server/endpoints');

const CACHE_TTL_MS = 60 * 60 * 1000;
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
            headers: { 'User-Agent': 'fm-dx-webserver-radiotext-coverart-plugin/1.1' }
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
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/['']/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function cleanTitle(s) {
    const text = (s || '').toString();
    const cleaned = text
        .replace(/\s*[\(\[].*$/, '')
        .replace(/\s+[-\u2013\u2014]\s.*$/, '')
        .replace(/\s+(?:feat\.?|ft\.?|featuring)\s.*$/i, '')
        .trim();
    return cleaned || text;
}

function fieldScore(candidate, wanted) {
    if (!candidate || !wanted) return 0;
    if (candidate === wanted) return 3;
    if (candidate.includes(wanted) || wanted.includes(candidate)) {
        const shorter = Math.min(candidate.length, wanted.length);
        const longer = Math.max(candidate.length, wanted.length);
        return shorter / longer >= 0.5 ? 2 : 1;
    }
    return 0;
}

function artistMatches(candidateArtist, wantedArtist) {
    const c = normalize(candidateArtist);
    const w = normalize(wantedArtist);
    if (!c || !w) return false;
    if (c.includes(w) || w.includes(c)) return true;
    const cw = new Set(c.split(' ').filter(x => x.length >= 3));
    return w.split(' ').filter(x => x.length >= 3).some(x => cw.has(x));
}

function scoreCandidate(track, wantArtist, wantTitle) {
    const artistScore = fieldScore(normalize(track.artistName), normalize(wantArtist));
    const titleScore = fieldScore(normalize(cleanTitle(track.trackName)), normalize(cleanTitle(wantTitle)));
    const artistOk = artistMatches(track.artistName, wantArtist);
    return { artistScore, titleScore, artistOk, total: artistScore + titleScore };
}

function pickBestMatch(results, wantArtist, wantTitle) {
    let best = null;
    let bestScore = null;
    for (const track of results) {
        const score = scoreCandidate(track, wantArtist, wantTitle);
        if (score.titleScore < 2 || !score.artistOk) continue;
        if (!bestScore || score.total > bestScore.total) {
            bestScore = score;
            best = track;
        }
    }
    return { track: best, score: bestScore };
}

function fromItunes(t) {
    const art100 = t.artworkUrl100 || '';
    return {
        artistName: t.artistName || '',
        trackName: t.trackName || '',
        collectionName: t.collectionName || '',
        year: t.releaseDate ? String(t.releaseDate).slice(0, 4) : '',
        artwork: art100.replace('100x100bb', '300x300bb'),
        artworkBig: art100.replace('100x100bb', '600x600bb'),
        storeUrl: t.trackViewUrl || '',
        source: 'Apple Music'
    };
}

function fromDeezer(t) {
    const album = t.album || {};
    return {
        artistName: (t.artist && t.artist.name) || '',
        trackName: t.title || '',
        collectionName: album.title || '',
        year: '',
        artwork: album.cover_medium || '',
        artworkBig: album.cover_big || album.cover_medium || '',
        storeUrl: t.link || '',
        source: 'Deezer'
    };
}

const providers = {
    itunes: {
        async byArtist(artist) {
            const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&attribute=artistTerm&entity=song&limit=25`;
            const data = await fetchWithTimeout(url);
            return ((data && data.results) || []).map(fromItunes);
        },
        async general(text, limit = 5) {
            const url = `https://itunes.apple.com/search?term=${encodeURIComponent(text)}&entity=song&limit=${limit}`;
            const data = await fetchWithTimeout(url);
            return ((data && data.results) || []).map(fromItunes);
        }
    },
    deezer: {
        async byArtist(artist) {
            const url = `https://api.deezer.com/search?q=${encodeURIComponent(`artist:"${artist}"`)}&limit=25`;
            const data = await fetchWithTimeout(url);
            return ((data && data.data) || []).map(fromDeezer);
        },
        async general(text, limit = 5) {
            const url = `https://api.deezer.com/search?q=${encodeURIComponent(text)}&limit=${limit}`;
            const data = await fetchWithTimeout(url);
            return ((data && data.data) || []).map(fromDeezer);
        }
    }
};

const PROVIDER_ORDER = ['itunes', 'deezer'];

const MIN_TITLE_SCORE = 2;

function leadArtist(artist) {
    const first = artist.split(/\s*(?:\/|;|,|&|\+|\bfeat\.?|\bft\.?|\bfeaturing\b|\bvs\.?)\s*/i)[0].trim();
    return first || artist;
}

async function tryInterpretation(provider, rawArtist, title) {
    const artist = leadArtist(rawArtist);

    if (artist) {
        try {
            const artistResults = await provider.byArtist(artist);
            if (artistResults.length > 0) {
                const match = pickBestMatch(artistResults, artist, title);
                if (match.track && match.score.titleScore >= MIN_TITLE_SCORE) return match.track;
            }
        } catch (err) {
        }
    }

    try {
        const generalResults = await provider.general(`${artist} ${title}`.trim());
        if (generalResults.length > 0) {
            const match = pickBestMatch(generalResults, artist, title);
            if (match.track && match.score.titleScore >= MIN_TITLE_SCORE) return match.track;
        }
    } catch (err) {
    }

    return null;
}

async function freeTextOnProvider(provider, q, words) {
    let results;
    try {
        results = await provider.general(q, 15);
    } catch (err) {
        return null;
    }

    let best = null;
    let bestExtra = Infinity;
    for (const track of results) {
        const candWords = normalize(`${track.artistName} ${track.trackName}`).split(' ').filter(Boolean);
        const set = new Set(candWords);
        if (!words.every(w => set.has(w))) continue;
        const extra = candWords.filter(w => !words.includes(w)).length;
        if (extra < bestExtra) {
            bestExtra = extra;
            best = track;
        }
    }
    return best;
}

async function freeTextLookup(q) {
    const words = normalize(q).split(' ').filter(Boolean);
    if (words.length < 2) return null;
    for (const name of PROVIDER_ORDER) {
        const found = await freeTextOnProvider(providers[name], q, words);
        if (found) return found;
    }
    return null;
}

function buildResult(best, fallbackArtist, fallbackTitle) {
    if (!best || !best.artwork) return { found: false };
    return {
        found: true,
        artwork: best.artwork,
        artworkBig: best.artworkBig || best.artwork,
        trackName: best.trackName || fallbackTitle,
        artistName: best.artistName || fallbackArtist,
        collectionName: best.collectionName || '',
        year: best.year || '',
        storeUrl: best.storeUrl || '',
        source: best.source || ''
    };
}

router.get('/radiotext-coverart/get', async (req, res) => {
    const q = (req.query.q || '').toString().trim().slice(0, 120);

    if (q) {
        const qKey = `q|||${normalize(q).split(' ').sort().join(' ')}`;
        const cachedQ = cacheGet(qKey);
        if (cachedQ) return res.json(cachedQ);

        const found = await freeTextLookup(q);
        const qResult = buildResult(found, '', q);
        cacheSet(qKey, qResult);
        return res.json(qResult);
    }

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

    let best = null;
    let resultArtist = artist;
    let resultTitle = title;

    for (const name of PROVIDER_ORDER) {
        const provider = providers[name];
        best = await tryInterpretation(provider, artist, title);
        if (!best) {
            best = await tryInterpretation(provider, title, artist);
            if (best) {
                resultArtist = title;
                resultTitle = artist;
            }
        }
        if (best) break;
    }

    const result = buildResult(best, resultArtist, resultTitle);
    cacheSet(cacheKey, result);
    res.json(result);
});

module.exports = {};
