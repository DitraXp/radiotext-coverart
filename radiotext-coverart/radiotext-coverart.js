/* global $ */
// RadioText Cover Art — front-end (v2.1)

(function () {
    'use strict';

    const BUILD_ID = '2.1';
    const CONFIG_ENDPOINT = '/radiotext-coverart/config';
    const PLUGIN_HEADER = 'radiotext-coverart';

    // New key deliberately avoids inheriting placement geometry saved by the
    // pre-docking builds while this layout model is being tested.
    const STORAGE_KEY = 'radiotextCoverArtConfigV23FixedLayout';
    const PROFILE_KEY = 'radiotextCoverArtStationProfilesV4';
    const CACHE_KEY = 'radiotextCoverArtPersistentCacheV41';
    const HISTORY_KEY = 'radiotextCoverArtHistoryV1';
    const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
    const NEGATIVE_CACHE_TTL = 10 * 60 * 1000;
    const DEFAULT_CACHE_LIMIT = 250;
    const PINNED_OVERLAY_MAX_ZOOM_PX = 720;
    const DEFAULTS = {
        enabled: true,
        songSource: 'both',
        stableDelay: 2500,
        defaultImage: null,
        defaultBackgroundMode: 'builtIn',
        anchor: 'radiotext',
        side: 'after',
        placementMode: 'separate',
        insideInset: 0,
        overlayX: 24,
        overlayY: 120,
        overlayWidth: 110,
        overlayHeight: 110,
        overlayPinned: false,
        overlayPinAnchor: 'ps',
        overlayPinOffsetX: 0,
        overlayPinOffsetY: 0,
        overlayViewportX: 0,
        overlayViewportY: 0,
        gap: 6,
        useITunes: true,
        useDeezer: true,
        useMusicBrainz: true,
        useTheAudioDB: true,
        parsePs: true,
        idleBehaviour: 'keep',
        retainLastArt: true,
        showCaption: true,
        showNoRdsMessage: true,
        showNoMetadataMessage: true,
        showWaitingMessage: true,
        waitingBackgroundOpacity: 75,
        debugLogging: false,
        persistentCache: true,
        cacheLimit: DEFAULT_CACHE_LIMIT,
        minConfidence: 40,
        noArtworkRetrySeconds: 0,
        panelBackdrop: 'off',
        backdropBlur: 10,
        rtPriorityMs: 120000
    };

    function storedSettings() {
        try {
            const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            if (value && !Object.prototype.hasOwnProperty.call(value, 'idleBehaviour') &&
                typeof value.retainLastArt === 'boolean') {
                value.idleBehaviour = value.retainLastArt ? 'keep' : 'default';
            }
            if (value?.idleBehaviour === 'stationLogo') {
                value.idleBehaviour = 'default';
                value.defaultBackgroundMode = 'stationLogo';
            }
            if (value && !value.defaultBackgroundMode) {
                value.defaultBackgroundMode = value.defaultImage ? 'custom' : 'builtIn';
            }
            return value && !Array.isArray(value) && typeof value === 'object' ? value : {};
        } catch (error) { return {}; }
    }

    let adminDefaults = {};
    let isAdminSession = false;
    let settings = { ...DEFAULTS, ...storedSettings() };
    delete settings.showHistory;
    try {
        localStorage.removeItem('radiotextCoverArtHistoryV4');
        localStorage.removeItem('radiotextCoverArtPersistentCacheV4');
    } catch (error) { /* private mode */ }
    function readStoredObject(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key) || '') || fallback; }
        catch (error) { return fallback; }
    }
    let stationProfiles = readStoredObject(PROFILE_KEY, {});
    let persistentCache = readStoredObject(CACHE_KEY, {});
    let songHistory = readStoredObject(HISTORY_KEY, []);
    if (!Array.isArray(songHistory)) songHistory = [];
    if (!stationProfiles || Array.isArray(stationProfiles) || typeof stationProfiles !== 'object') stationProfiles = {};
    if (!persistentCache || Array.isArray(persistentCache) || typeof persistentCache !== 'object') persistentCache = {};
    hydrateHistoryFromCache();
    function debugLog(...args) {
        if (settings.debugLogging) console.info(...args);
    }

    async function loadSharedConfig() {
        try {
            const response = await fetch(CONFIG_ENDPOINT, {
                cache: 'no-store', headers: { 'X-Plugin-Name': PLUGIN_HEADER }
            });
            if (!response.ok) return;
            const payload = await response.json();
            const received = payload?.config;
            if (!received || Array.isArray(received) || typeof received !== 'object') return;
            if (!Object.prototype.hasOwnProperty.call(received, 'idleBehaviour') &&
                typeof received.retainLastArt === 'boolean') {
                received.idleBehaviour = received.retainLastArt ? 'keep' : 'default';
            }
            if (received.idleBehaviour === 'stationLogo') {
                received.idleBehaviour = 'default';
                received.defaultBackgroundMode = 'stationLogo';
            }
            if (!received.defaultBackgroundMode) {
                received.defaultBackgroundMode = received.defaultImage ? 'custom' : 'builtIn';
            }
            adminDefaults = received;
            isAdminSession = payload?.isAdmin === true;
        } catch (error) {
            adminDefaults = {};
            isAdminSession = false;
        }
        settings = isAdminSession
            ? { ...DEFAULTS, ...adminDefaults }
            : { ...DEFAULTS, ...adminDefaults, ...storedSettings() };
        delete settings.showHistory;
        hydrateHistoryFromCache();
    }

    function userSettingOverrides(fullSettings) {
        const base = { ...DEFAULTS, ...adminDefaults };
        return Object.fromEntries(Object.entries(fullSettings).filter(([key, value]) =>
            JSON.stringify(value) !== JSON.stringify(base[key])));
    }

    async function saveSharedConfig(config) {
        const response = await fetch(CONFIG_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Plugin-Name': PLUGIN_HEADER },
            body: JSON.stringify({ config })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.ok !== true) throw new Error(payload?.error || `HTTP ${response.status}`);
        return payload.config || config;
    }
    debugLog(`[RadioText Cover Art] Front-end v${BUILD_ID} loaded`);
    const DEFAULT_IMAGE_SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>" +
        "<rect width='100' height='100' rx='14' fill='#2b2b2e'/>" +
        "<circle cx='50' cy='50' r='34' fill='none' stroke='#55555a' stroke-width='2'/>" +
        "<circle cx='50' cy='50' r='26' fill='none' stroke='#45454a' stroke-width='1.5'/>" +
        "<circle cx='50' cy='50' r='9' fill='#55555a'/><circle cx='50' cy='50' r='3' fill='#2b2b2e'/>" +
        "</svg>";
    const DEFAULT_IMAGE_URL = 'data:image/svg+xml,' + encodeURIComponent(DEFAULT_IMAGE_SVG);
    const WAITING_TOOLTIP = 'Waiting for song info…';
    const channels = {
        rt0: { lastText: null, timer: null },
        rt1: { lastText: null, timer: null },
        ps: { lastText: null, timer: null }
    };
    let lastObservedPsText = '';
    let observedPsHistory = [];
    const localCache = {};
    const requestIds = { rt: 0, ps: 0 };
    const requestControllers = { rt: null, ps: null };
    const retryTimers = { rt: null, ps: null };
    let currentSongKey = null;
    let currentSource = null;
    let currentArtworkUrl = null;
    let currentArtworkLabel = '';
    let currentResult = null;
    let lastValidRtAt = 0;
    let activeRtChannel = 'rt0';
    let lastFreq = null;
    let lastPi = null;
    let rdsPresent = false;
    let metadataPresent = false;
    let availabilityTimer = null;
    let availabilityMessageType = null;
    let placeholderMessageType = 'waiting';
    let resizeObserver = null;
    let psObserver = null;
    let lastPsSocketAt = 0;
    let lastPsAriaAt = 0;
    let usingAriaPs = false;
    let layoutRestore = null;
    let uiPresenceObserver = null;
    let mainUiActive = false;
    let socketListenerAttached = false;
    let overlayGesture = null;
    let overlayVisibilityObserver = null;
    let overlayVisibilityTimer = null;
    let suppressArtworkClick = false;
    let settingsTriggerElement = null;
    let lastMobileState = window.innerWidth <= 768;
    const psAssembly = {
        buffer: '', firstFrame: '', lastFrame: '', timer: null, updatedAt: 0,
        frameCount: 0, frames: [], markerActive: false,
        pendingFrame: '', pendingKey: ''
    };

    function resetPsAssembly(markerActive = false) {
        clearTimeout(psAssembly.timer);
        Object.assign(psAssembly, {
            buffer: '', firstFrame: '', lastFrame: '', timer: null, updatedAt: 0,
            frameCount: 0, frames: [], markerActive, pendingFrame: '', pendingKey: ''
        });
    }

    function clearRetryTimers() {
        Object.keys(retryTimers).forEach(source => {
            clearTimeout(retryTimers[source]);
            retryTimers[source] = null;
        });
    }

    function stationKey(freq = lastFreq) {
        return freq === null || typeof freq === 'undefined' ? 'unknown' : String(freq).trim();
    }

    function stationProfile(create = true) {
        const key = stationKey();
        if (!stationProfiles[key] && create) {
            stationProfiles[key] = {
                order: 'auto', learnedOrder: 'auto', orderVotes: {}, psMode: 'auto', learnedPsMode: 'auto',
                stationTokens: [], tokenCounts: {}, tokenSongs: {}
            };
        }
        if (stationProfiles[key]) {
            stationProfiles[key] = {
                order: 'auto', learnedOrder: 'auto', orderVotes: {}, psMode: 'auto', learnedPsMode: 'auto',
                stationTokens: [], tokenCounts: {}, tokenSongs: {},
                ...stationProfiles[key]
            };
            delete stationProfiles[key].lastTrack;
        }
        return stationProfiles[key] || null;
    }

    function effectiveProfileOrder() {
        const profile = stationProfile(false);
        return profile?.order && profile.order !== 'auto' ? profile.order : (profile?.learnedOrder || 'auto');
    }

    function effectivePsMode() {
        const profile = stationProfile(false);
        return profile?.psMode && profile.psMode !== 'auto' ? profile.psMode : 'auto';
    }

    function learnProfileFromMatch(candidate, source) {
        const profile = stationProfile();
        if (source === 'rt') {
            const direction = /title-first/i.test(candidate.evidence) ? 'title-artist' :
                (/artist-title/i.test(candidate.evidence) ? 'artist-title' : null);
            if (direction) {
                profile.orderVotes[direction] = (profile.orderVotes[direction] || 0) + 1;
                const other = direction === 'title-artist' ? 'artist-title' : 'title-artist';
                if (profile.orderVotes[direction] >= (profile.orderVotes[other] || 0) + 2) profile.learnedOrder = direction;
            }
        } else if (/metadata|labels/i.test(candidate.evidence)) {
            profile.learnedPsMode = 'structured';
        } else if (/quoted/i.test(candidate.evidence)) {
            profile.learnedPsMode = 'quoted';
        }
        saveProfiles();
    }

    function saveProfiles() {
        try { localStorage.setItem(PROFILE_KEY, JSON.stringify(stationProfiles)); } catch (error) { /* quota/private mode */ }
    }

    function injectStyles() {
        if ($('#rt-coverart-v2-styles').length) return;
        $('<style id="rt-coverart-v2-styles">').html(`
            .rt-coverart-box {
                position: relative; display: flex; flex: 0 0 auto; overflow: hidden;
                box-sizing: border-box; padding: 8px; border-radius: 15px;
                background:
                    radial-gradient(ellipse at 1% 1%, color-mix(in srgb, var(--color-4-transparent) 80%, white 20%), transparent 6%),
                    radial-gradient(ellipse at 12% 10%, rgba(255,255,255,.10), transparent 32%),
                    radial-gradient(ellipse at 88% 20%, rgba(255,255,255,.06), transparent 26%),
                    radial-gradient(ellipse at 82% 88%, rgba(255,255,255,.04), transparent 30%),
                    linear-gradient(135deg, rgba(255,255,255,.08), transparent 42%),
                    linear-gradient(to bottom, rgba(255,255,255,.07), rgba(0,0,0,.07)) border-box;
                box-shadow: inset -1px -1px 0 rgba(0,0,0,.44), inset 1px 1px 0 rgba(255,255,255,.17);
                backdrop-filter: blur(5px); -webkit-backdrop-filter: blur(5px);
                transition: width .25s ease, height .25s ease, box-shadow .25s ease;
            }
            .rt-coverart-box:hover {
                box-shadow: inset -1px -1px 0 rgba(0,0,0,.44), inset 1px 1px 0 rgba(255,255,255,.17),
                    0 0 0 1px rgba(255,255,255,.10), 0 0 12px rgba(255,255,255,.14),
                    0 0 20px var(--color-4-transparent);
            }
            .rt-coverart-box img { width: 100%; height: 100%; display: block; object-fit: cover; border-radius: 8px; }
            .rt-coverart-box.rtca-station-logo img {
                width: 100%; height: 100%; max-width: 100%; max-height: 100%;
                object-fit: contain;
            }
            .rt-coverart-caption {
                position: absolute; inset: 8px; display: flex; align-items: center; justify-content: center;
                padding: 7px; border-radius: 8px; text-align: center; color: #fff;
                background: rgba(0,0,0,var(--rtca-waiting-bg-opacity, .75)); font-size: 11px; line-height: 1.3;
                opacity: 0; pointer-events: none; transition: opacity .2s ease;
            }
            .rt-coverart-box.rtca-empty .rt-coverart-caption {
                opacity: 1; font-size: 12px;
            }
            .rt-coverart-box:hover .rt-coverart-caption { opacity: 1; }
            .rt-coverart-box.hide-caption .rt-coverart-caption { display: none; }
            .rt-coverart-box.rtca-empty .rt-coverart-caption { display: flex; }
            .rt-coverart-box.rtca-empty.rtca-hide-state-message .rt-coverart-caption { display: none; }
            .rt-coverart-status {
                position: absolute; left: 6px; right: 6px; bottom: 8px; z-index: 3;
                padding: 3px 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                border-radius: 8px; color: rgba(255,255,255,.88); background: rgba(0,0,0,.48);
                font-size: 9px; letter-spacing: -.1px; text-align: center;
                opacity: 0; transition: opacity .2s ease; pointer-events: none;
            }
            .rt-coverart-box.rtca-busy .rt-coverart-status { opacity: .88; }
            .rtca-cover-backdrop {
                position: relative !important; isolation: isolate; overflow: hidden;
            }
            .rtca-cover-backdrop::before {
                content: ""; position: absolute; z-index: 0; pointer-events: none;
                inset: -22px; background-image: linear-gradient(rgba(0,0,0,.16), rgba(0,0,0,.26)), var(--rtca-cover-image);
                background-size: cover; background-position: center; background-repeat: no-repeat;
                filter: blur(var(--rtca-backdrop-blur, 10px)) saturate(1.18); transform: scale(1.12); opacity: .68;
            }
            .rtca-cover-backdrop > * { position: relative; z-index: 1; }
            .rt-coverart-box.rtca-inside-panel {
                padding: 0; margin: 0; border: 0; box-shadow: none !important;
                background: none; backdrop-filter: none; -webkit-backdrop-filter: none;
                overflow: hidden; transition: width .25s ease;
            }
            .rt-coverart-box.rtca-inside-panel img { border-radius: inherit; }
            .rt-coverart-box.rtca-inside-panel .rt-coverart-caption { inset: 0; border-radius: inherit; }
            .rt-coverart-box.rtca-inside-panel.rtca-inside-flush.rtca-station-logo {
                background: rgba(0,0,0,.22);
                box-shadow: inset 0 0 0 1px rgba(0,0,0,.68) !important;
            }
            .rtca-panel-content {
                box-sizing: border-box; min-width: 0; min-height: 0; flex: 1 1 auto;
                display: flex; flex-direction: column; justify-content: center;
            }
            .rt-coverart-settings-button {
                position: absolute; top: 10px; right: 10px; z-index: 4; width: 25px; height: 25px;
                padding: 0; border: 1px solid rgba(255,255,255,.18); border-radius: 50%;
                color: var(--color-4); background: var(--color-1-transparent); opacity: 0;
                backdrop-filter: blur(5px); cursor: pointer; font-size: 16px; line-height: 23px;
                transition: opacity .2s ease, transform .22s ease, color .22s ease, background-color .22s ease;
            }
            .rt-coverart-box:hover .rt-coverart-settings-button,
            .rt-coverart-settings-button:focus { opacity: .94; }
            .rt-coverart-settings-button:hover {
                color: #fff; background: var(--color-4-transparent);
                transform: translateY(-2px) rotate(-10deg) scale(1.14);
            }
            .rt-coverart-pin {
                position: absolute; top: 10px; left: 10px; z-index: 4; width: 25px; height: 25px;
                padding: 0; border: 1px solid rgba(255,255,255,.18); border-radius: 50%;
                color: var(--color-text); background: var(--color-1-transparent); opacity: 0;
                backdrop-filter: blur(5px); cursor: pointer;
                transition: opacity .2s ease, transform .2s ease, color .2s ease;
            }
            .rt-coverart-box.rtca-overlay:hover .rt-coverart-pin,
            .rt-coverart-pin:focus { opacity: .92; }
            .rt-coverart-box.rtca-pinned .rt-coverart-pin {
                color: var(--color-4); transform: rotate(-28deg);
            }
            .rt-coverart-box.rtca-overlay {
                position: fixed !important; z-index: 80; margin: 0 !important;
                min-width: 72px; min-height: 72px; max-width: none; max-height: none;
                flex: none !important; touch-action: none; user-select: none;
                transition: box-shadow .25s ease, opacity .18s ease;
            }
            .rt-coverart-box.rtca-overlay.rtca-obscured { opacity: 0 !important; pointer-events: none !important; }
            .rt-coverart-box.rtca-overlay.rtca-moving { cursor: grabbing !important; }
            .rt-coverart-box.rtca-overlay::after {
                content: ""; position: absolute; inset: 0; z-index: 3;
                border: 1px solid transparent; border-radius: inherit; pointer-events: none;
                transition: border-color .2s ease;
            }
            .rt-coverart-box.rtca-overlay:hover::after { border-color: rgba(255,255,255,.16); }
            #rt-coverart-settings {
                position: fixed; inset: 0; z-index: 10000; display: none; align-items: center; justify-content: center;
                background: rgba(0,0,0,.22); backdrop-filter: none; -webkit-backdrop-filter: none;
            }
            #rt-coverart-settings.open { display: flex; }
            .rtca-settings-card {
                width: min(860px, calc(100vw - 24px)); max-height: calc(100vh - 24px); overflow: hidden;
                box-sizing: border-box; border-radius: 16px; color: var(--color-text);
                display: flex; flex-direction: column;
                background: linear-gradient(145deg, rgba(255,255,255,.06), rgba(255,255,255,.02)),
                    color-mix(in srgb, var(--color-1) 82%, transparent);
                border: 1px solid var(--color-4-transparent);
                backdrop-filter: blur(12px) saturate(1.10); -webkit-backdrop-filter: blur(12px) saturate(1.10);
                box-shadow: 0 22px 65px rgba(0,0,0,.52), 0 0 28px var(--color-4-transparent), inset 0 1px 0 rgba(255,255,255,.09);
            }
            .rtca-settings-card h3 { margin: 0; font-size: 17px; line-height: 1.2; }
            .rtca-settings-header {
                display: flex; align-items: center; justify-content: space-between; gap: 10px;
                padding: 14px 16px 10px; flex: none; border-bottom: 1px solid var(--color-4-transparent);
                background: linear-gradient(90deg, var(--color-1-transparent), transparent);
            }
            .rtca-settings-header h3 { margin: 0; }
            .rtca-settings-close {
                width: 30px !important; min-width: 30px !important; height: 30px !important; min-height: 30px !important;
                margin: 0 !important; padding: 0 !important; border-radius: 6px !important;
                font-size: 20px !important; line-height: 28px !important; cursor: pointer;
            }
            .rtca-config-scope { padding: 7px 16px 0; opacity: .65; font-size: 11px; flex: none; }
            .rtca-settings-body { padding: 10px 16px 14px; overflow-y: auto; overscroll-behavior: contain; min-height: 0; }
            .rtca-settings-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
            .rtca-settings-column { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
            .rtca-section {
                padding: 10px; border-radius: 11px; min-width: 0;
                background: linear-gradient(145deg, rgba(255,255,255,.055), rgba(255,255,255,.018)),
                    color-mix(in srgb, var(--color-1) 94%, var(--color-text) 6%);
                border: 1px solid color-mix(in srgb, var(--color-text) 13%, transparent);
            }
            .rtca-section-title {
                display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
                position: relative; padding-bottom: 6px; margin: 0 0 9px;
                font-size: 12.5px; font-weight: 800; letter-spacing: .07em;
                text-transform: uppercase; color: var(--color-text);
            }
            .rtca-section-title::after {
                content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 1px;
                background: linear-gradient(90deg, var(--color-4), var(--color-4-transparent), transparent);
                opacity: .78;
            }
            .rtca-section-title small { font-size: 12.5px; font-weight: 700; letter-spacing: 0; text-transform: none; opacity: .78; }
            .rtca-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; }
            .rtca-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; font-size: 12px; }
            .rtca-field.full { grid-column: 1 / -1; }
            .rtca-field > span { font-weight: 700; text-transform: none; }
            .rtca-field input, .rtca-field select {
                width: 100%; min-width: 0; height: 34px; min-height: 34px;
                box-sizing: border-box; border-radius: 6px !important;
            }
            .rtca-field select {
                height: 34px !important; min-height: 34px !important;
                padding: 0 34px 0 12px !important; line-height: 34px !important;
                border-radius: 6px !important; box-shadow: none !important;
                filter: none !important; transform: none !important;
                text-align: center !important; text-align-last: center !important;
            }
            .rtca-field select option { text-align: center; }
            .rtca-check-list { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 10px; font-size: 12px; }
            .rtca-check-list.single { grid-template-columns: 1fr; }
            .rtca-check-list label { min-width: 0; display: flex; align-items: center; gap: 6px; }
            .rtca-settings-card label, .rtca-settings-card label strong { text-transform: none !important; }
            .rtca-settings-card label strong { font-weight: 600 !important; }
            .rtca-source-note { margin: -2px 0 8px; font-size: 10px; line-height: 1.35; opacity: .62; }
            .rtca-source-list { display: grid; gap: 6px; font-size: 12px; }
            .rtca-source-list label { display: flex; align-items: center; gap: 7px; }
            .rtca-source-order {
                width: 18px; height: 18px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
                flex: 0 0 18px; font-size: 9px; font-weight: 700; color: var(--color-text); background: var(--color-4-transparent);
            }
            .rtca-default-image-row { display: grid; grid-template-columns: 1fr 58px; gap: 8px; align-items: end; }
            .rtca-default-image-row.full { grid-column: 1 / -1; }
            .rtca-default-preview {
                width: 58px; height: 58px; object-fit: cover; box-sizing: border-box; border-radius: 9px;
                border: 1px solid var(--color-4-transparent); background: var(--color-1-transparent);
            }
            .rtca-actions {
                display: flex; flex-wrap: wrap; align-items: stretch; gap: 6px; padding: 10px 16px 12px;
                flex: none; border-top: 1px solid var(--color-4-transparent);
                background: linear-gradient(90deg, var(--color-1-transparent), transparent);
            }
            .rtca-actions button {
                width: auto !important; min-width: 78px; height: 34px !important; min-height: 34px !important;
                margin: 0 !important; padding: 0 10px !important; line-height: 34px !important;
                flex: 1 1 calc(25% - 6px); box-sizing: border-box;
                border-radius: 6px !important;
            }
            .rtca-section button {
                width: auto !important; height: 30px !important; min-height: 30px !important;
                margin: 0 !important; padding: 0 10px !important; border-radius: 6px !important;
            }
            .rtca-lightbox {
                position: fixed; inset: 0; z-index: 10001; background: rgba(0,0,0,0);
                backdrop-filter: blur(0); transition: background .3s ease, backdrop-filter .3s ease;
            }
            .rtca-lightbox.open { background: rgba(0,0,0,.62); backdrop-filter: blur(6px); }
            .rtca-lightbox-cover {
                position: fixed; overflow: hidden; box-sizing: border-box; padding: 8px; border-radius: 15px;
                background: var(--color-1); box-shadow: 0 22px 70px rgba(0,0,0,.65), 0 0 30px var(--color-4-transparent);
                transition: left .34s cubic-bezier(.2,.75,.25,1), top .34s cubic-bezier(.2,.75,.25,1),
                    width .34s cubic-bezier(.2,.75,.25,1), height .34s cubic-bezier(.2,.75,.25,1);
            }
            .rtca-lightbox-cover img { width: 100%; height: 100%; display: block; object-fit: cover; border-radius: 9px; }
            .rtca-lightbox-title {
                position: absolute; left: 8px; right: 8px; bottom: 8px; z-index: 2;
                box-sizing: border-box; max-height: calc(100% - 16px); overflow: hidden;
                padding: 9px 11px; border-radius: 0 0 9px 9px;
                color: #fff; background: rgba(0,0,0,.66); font-size: 14px; line-height: 1.28;
                text-align: center; white-space: normal; overflow-wrap: anywhere;
                opacity: 0; transition: opacity .2s ease .12s;
            }
            .rtca-lightbox-meta { display: block; margin-top: 3px; font-size: 11px; opacity: .72; }
            .rtca-lightbox-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 5px; margin-top: 7px; }
            .rtca-lightbox-links a {
                padding: 4px 9px; border-radius: 999px; color: #fff; text-decoration: none;
                background: rgba(255,255,255,.17); font-size: 11px;
            }
            .rtca-history-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
            .rtca-history-head .rtca-section-title { flex: 1; margin: 0; }
            .rtca-history-head strong { font-size: 13px; }
            .rtca-history-head button { width: auto !important; min-height: 28px !important; height: 28px !important; padding: 0 9px !important; }
            .rtca-history-list { max-height: 230px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
            .rtca-history-item { display: flex; align-items: center; gap: 8px; padding: 5px; border-radius: 9px; cursor: pointer; }
            .rtca-history-item:hover { background: var(--color-4-transparent); }
            .rtca-history-item img { width: 42px; height: 42px; flex: 0 0 42px; object-fit: cover; border-radius: 6px; }
            .rtca-history-text { min-width: 0; flex: 1; font-size: 12px; }
            .rtca-history-text div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .rtca-history-sub { opacity: .58; font-size: 10px; }
            .rtca-lightbox.open .rtca-lightbox-title { opacity: 1; }
            .rtca-history-section { margin-top: 14px; }
            @media only screen and (max-width: 768px) {
                .rtca-settings-card { width: min(96vw, 520px); max-height: calc(100vh - 14px); }
                .rtca-settings-columns { grid-template-columns: 1fr; }
                .rtca-settings-body { padding: 9px 10px 12px; }
                .rtca-settings-header, .rtca-actions { padding-left: 11px; padding-right: 11px; }
                .rt-coverart-box.rtca-overlay { position: relative !important; left: auto !important; top: auto !important; }
                .rt-coverart-box { width: 90% !important; height: 86px !important; margin: 6px auto !important; }
                .rt-coverart-box.rtca-inside-panel {
                    padding: 8px; border-radius: 15px; box-shadow: inset -1px -1px 0 rgba(0,0,0,.44), inset 1px 1px 0 rgba(255,255,255,.17) !important;
                }
                .rt-coverart-box img { width: 70px; min-width: 70px; }
                .rt-coverart-caption { position: relative; inset: auto; flex: 1; opacity: .86; background: none; color: var(--color-text); }
                .rt-coverart-box.rtca-empty .rt-coverart-caption {
                    position: absolute; inset: 8px;
                    background: rgba(0,0,0,var(--rtca-waiting-bg-opacity, .75)); color: #fff;
                }
                .rt-coverart-settings-button { opacity: .8; }
            }
        `).appendTo('head');
    }

    function createBox() {
        if ($('#rt-coverart-container').length) return;
        $('body').append(`<div id="rt-coverart-container" class="rt-coverart-box rtca-empty" data-rtca-version="${BUILD_ID}">
            <img alt="Cover art"><div class="rt-coverart-caption">${WAITING_TOOLTIP}</div>
            <div class="rt-coverart-status"></div>
            <button class="rt-coverart-pin" title="Pin freeform position" aria-label="Pin freeform position"><i class="fa-solid fa-thumbtack"></i></button>
            <button class="rt-coverart-settings-button" title="Cover art settings" aria-label="Cover art settings">&#9835;</button>
        </div>`);
        $('#rt-coverart-container img').attr('src', idleImage().url);
        createSettingsPanel();
        $('.rt-coverart-settings-button').on('click', event => {
            event.stopPropagation(); openSettings(event.currentTarget);
        });
        $('.rt-coverart-pin').on('click', event => {
            event.stopPropagation();
            if (settings.placementMode !== 'overlay' || !canUseFreeformOverlay()) return;
            toggleOverlayPin();
        });
        $('#rt-coverart-container img').on('click', event => {
            if (suppressArtworkClick) { event.preventDefault(); suppressArtworkClick = false; return; }
            openCoverLightbox();
        });
        installOverlayInteraction();
        installOverlayVisibilityGuard();
        applyCaptionSetting();
    }

    function isMainUiAvailable() {
        return Boolean(document.getElementById('rt-container') && document.getElementById('data-ps'));
    }

    function canUseFreeformOverlay() {
        const desktopPointer = window.matchMedia?.('(hover: hover) and (pointer: fine)');
        return window.innerWidth > 768 && Boolean(desktopPointer?.matches);
    }

    function overlayPinElements() {
        const psSource = activePsAnchor();
        const afSource = document.getElementById('af-list');
        return {
            ps: psSource,
            station: document.getElementById('data-station-container')?.parentElement ||
                document.getElementById('data-station-container'),
            radiotext: document.getElementById('rt-container'),
            af: afSource?.closest('.panel-100') || afSource
        };
    }

    function overlayPinElement(key = settings.overlayPinAnchor) {
        return overlayPinElements()[key] || null;
    }

    function nearestOverlayPinAnchor(boxRect) {
        const cx = boxRect.left + boxRect.width / 2;
        const cy = boxRect.top + boxRect.height / 2;
        let nearest = null;
        Object.entries(overlayPinElements()).forEach(([key, element]) => {
            if (!element || !element.getClientRects().length) return;
            const rect = element.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) return;
            const dx = Math.max(rect.left - cx, 0, cx - rect.right);
            const dy = Math.max(rect.top - cy, 0, cy - rect.bottom);
            const distance = Math.hypot(dx, dy);
            if (!nearest || distance < nearest.distance) nearest = { key, element, rect, distance };
        });
        return nearest;
    }

    function updatePinAppearance() {
        const $box = $('#rt-coverart-container');
        $box.toggleClass('rtca-pinned', Boolean(settings.overlayPinned));
        if (settings.overlayPinned) $box.css('cursor', '');
        $box.find('.rt-coverart-pin').attr({
            title: settings.overlayPinned ? 'Unpin freeform position' : 'Pin freeform position',
            'aria-label': settings.overlayPinned ? 'Unpin freeform position' : 'Pin freeform position'
        });
    }

    function captureOverlayPin() {
        const box = document.getElementById('rt-coverart-container');
        if (!box) return false;
        const boxRect = box.getBoundingClientRect();
        const nearest = nearestOverlayPinAnchor(boxRect);
        settings.overlayViewportX = boxRect.left / Math.max(1, window.innerWidth - boxRect.width);
        settings.overlayViewportY = boxRect.top / Math.max(1, window.innerHeight - boxRect.height);
        if (nearest) {
            settings.overlayPinAnchor = nearest.key;
            settings.overlayPinOffsetX = (boxRect.left - nearest.rect.left) / Math.max(1, nearest.rect.width);
            settings.overlayPinOffsetY = (boxRect.top - nearest.rect.top) / Math.max(1, nearest.rect.height);
        }
        return true;
    }

    function applyPinnedOverlayPosition() {
        if (!settings.overlayPinned) return;
        const anchor = overlayPinElement();
        if (anchor?.getClientRects().length) {
            const rect = anchor.getBoundingClientRect();
            settings.overlayX = rect.left + (Number(settings.overlayPinOffsetX) || 0) * Math.max(1, rect.width);
            settings.overlayY = rect.top + (Number(settings.overlayPinOffsetY) || 0) * Math.max(1, rect.height);
        } else {
            settings.overlayX = (Number(settings.overlayViewportX) || 0) *
                Math.max(1, window.innerWidth - (Number(settings.overlayWidth) || 110));
            settings.overlayY = (Number(settings.overlayViewportY) || 0) *
                Math.max(1, window.innerHeight - (Number(settings.overlayHeight) || 110));
        }
    }

    function observePinnedOverlayAnchor() {
        if (resizeObserver) resizeObserver.disconnect();
        const anchor = settings.overlayPinned ? overlayPinElement() : null;
        if (!window.ResizeObserver || !anchor) return;
        resizeObserver = new ResizeObserver(() => applyOverlayGeometry());
        resizeObserver.observe(anchor);
        if (anchor.parentElement) resizeObserver.observe(anchor.parentElement);
    }

    function toggleOverlayPin() {
        if (settings.overlayPinned) {
            settings.overlayPinned = false;
        } else if (captureOverlayPin()) {
            settings.overlayPinned = true;
        }
        updatePinAppearance();
        placeBox();
        void persistOverlayGeometry();
    }

    function elementIsVisible(element) {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > .02 &&
            rect.width > 0 && rect.height > 0;
    }

    function hasActiveUiBackdrop() {
        const box = document.getElementById('rt-coverart-container');
        if (!box || settings.placementMode !== 'overlay' || !canUseFreeformOverlay()) return false;
        const boxRect = box.getBoundingClientRect();
        const cx = boxRect.left + boxRect.width / 2;
        const cy = boxRect.top + boxRect.height / 2;
        const selector = [
            '[role="dialog"]', '[aria-modal="true"]', '.modal', '.modal-backdrop',
            '[class*="modal"]', '[class*="backdrop"]', '[class*="menu-overlay"]',
            '[class*="sidebar"]', '[class*="drawer"]', '[class*="offcanvas"]',
            '#rt-coverart-settings.open', '.rtca-lightbox'
        ].join(',');
        const namedCandidates = [...document.querySelectorAll(selector)];
        const pointCandidates = document.elementsFromPoint?.(cx, cy) || [];
        const candidates = [...new Set([...namedCandidates, ...pointCandidates])];
        const ownArtworkPanels = new Set(Object.values(backdropPanels()).filter(Boolean));
        return candidates.some(element => {
            if (element === box || element.closest('#rt-coverart-container')) return false;
            // The plugin adds rtca-cover-backdrop to RT/PS only after artwork
            // is found. It is a decorative image layer, never a UI modal.
            if (ownArtworkPanels.has(element) || element.classList.contains('rtca-cover-backdrop') ||
                element.closest('.rtca-cover-backdrop')) return false;
            if (!elementIsVisible(element)) return false;
            const rect = element.getBoundingClientRect();
            const coversPanel = cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
            const style = getComputedStyle(element);
            const hasBackdrop = (style.backdropFilter && style.backdropFilter !== 'none') ||
                (style.webkitBackdropFilter && style.webkitBackdropFilter !== 'none');
            const coversLargeArea = rect.width * rect.height >= window.innerWidth * window.innerHeight * .2;
            const fixedBackdrop = style.position === 'fixed' && hasBackdrop && coversLargeArea;
            const namedLayer = element.matches(selector) && (hasBackdrop || coversLargeArea);
            return coversPanel && (fixedBackdrop || namedLayer);
        });
    }

    function syncOverlayVisibility() {
        $('#rt-coverart-container').toggleClass('rtca-obscured', hasActiveUiBackdrop());
    }

    function scheduleOverlayVisibilitySync() {
        clearTimeout(overlayVisibilityTimer);
        overlayVisibilityTimer = setTimeout(syncOverlayVisibility, 30);
    }

    function installOverlayVisibilityGuard() {
        if (overlayVisibilityObserver) return;
        overlayVisibilityObserver = new MutationObserver(scheduleOverlayVisibilitySync);
        overlayVisibilityObserver.observe(document.body, {
            childList: true, subtree: true, attributes: true,
            attributeFilter: ['class', 'style', 'aria-hidden', 'aria-modal', 'open']
        });
        document.addEventListener('transitionend', scheduleOverlayVisibilitySync, true);
        document.addEventListener('click', scheduleOverlayVisibilitySync, true);
    }

    function clampOverlayGeometry() {
        const margin = 4;
        const maxWidth = Math.max(72, window.innerWidth - margin * 2);
        const maxHeight = Math.max(72, window.innerHeight - margin * 2);
        settings.overlayWidth = Math.round(Math.min(maxWidth, Math.max(72, Number(settings.overlayWidth) || 110)));
        settings.overlayHeight = Math.round(Math.min(maxHeight, Math.max(72, Number(settings.overlayHeight) || 110)));
        settings.overlayX = Math.round(Math.min(window.innerWidth - settings.overlayWidth - margin,
            Math.max(margin, Number(settings.overlayX) || margin)));
        settings.overlayY = Math.round(Math.min(window.innerHeight - settings.overlayHeight - margin,
            Math.max(margin, Number(settings.overlayY) || margin)));
    }

    function applyOverlayGeometry() {
        if (settings.placementMode !== 'overlay' || !canUseFreeformOverlay()) return;
        applyPinnedOverlayPosition();
        clampOverlayGeometry();
        $('#rt-coverart-container').css({
            display: 'flex', left: `${settings.overlayX}px`, top: `${settings.overlayY}px`,
            width: `${settings.overlayWidth}px`, height: `${settings.overlayHeight}px`,
            minHeight: '72px', maxHeight: 'none', aspectRatio: 'auto', alignSelf: 'auto'
        });
        updatePinAppearance();
        scheduleOverlayVisibilitySync();
    }

    async function persistOverlayGeometry() {
        try {
            if (isAdminSession) adminDefaults = await saveSharedConfig(settings);
            else localStorage.setItem(STORAGE_KEY, JSON.stringify(userSettingOverrides(settings)));
        } catch (error) {
            debugLog('[RadioText Cover Art] Could not save overlay geometry:', error.message);
        }
    }

    function overlayEdges(event, rect) {
        const edge = 10;
        return {
            left: event.clientX - rect.left <= edge, right: rect.right - event.clientX <= edge,
            top: event.clientY - rect.top <= edge, bottom: rect.bottom - event.clientY <= edge
        };
    }

    function installOverlayInteraction() {
        const box = document.getElementById('rt-coverart-container');
        if (!box || box.dataset.overlayInteraction === '1') return;
        box.dataset.overlayInteraction = '1';
        box.addEventListener('pointermove', event => {
            if (overlayGesture || settings.overlayPinned || settings.placementMode !== 'overlay' || !canUseFreeformOverlay()) return;
            const edges = overlayEdges(event, box.getBoundingClientRect());
            box.style.cursor = edges.left && edges.top || edges.right && edges.bottom ? 'nwse-resize' :
                (edges.right && edges.top || edges.left && edges.bottom ? 'nesw-resize' :
                    (edges.left || edges.right ? 'ew-resize' : (edges.top || edges.bottom ? 'ns-resize' : 'grab')));
        });
        box.addEventListener('pointerleave', () => { if (!overlayGesture) box.style.cursor = ''; });
        box.addEventListener('pointerdown', event => {
            if (settings.overlayPinned || settings.placementMode !== 'overlay' || !canUseFreeformOverlay() || event.button !== 0 ||
                event.target.closest('.rt-coverart-settings-button, .rt-coverart-pin')) return;
            const rect = box.getBoundingClientRect();
            const edges = overlayEdges(event, rect);
            overlayGesture = {
                pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
                x: rect.left, y: rect.top, width: rect.width, height: rect.height,
                edges, resizing: edges.left || edges.right || edges.top || edges.bottom, moved: false
            };
            box.setPointerCapture?.(event.pointerId);
            box.classList.add('rtca-moving');
            event.preventDefault();
        });
        box.addEventListener('pointermove', event => {
            if (!overlayGesture || event.pointerId !== overlayGesture.pointerId) return;
            const dx = event.clientX - overlayGesture.startX;
            const dy = event.clientY - overlayGesture.startY;
            if (Math.abs(dx) + Math.abs(dy) > 3) overlayGesture.moved = true;
            let x = overlayGesture.x; let y = overlayGesture.y;
            let width = overlayGesture.width; let height = overlayGesture.height;
            if (overlayGesture.resizing) {
                if (overlayGesture.edges.right) width += dx;
                if (overlayGesture.edges.bottom) height += dy;
                if (overlayGesture.edges.left) { width -= dx; x += dx; }
                if (overlayGesture.edges.top) { height -= dy; y += dy; }
                if (width < 72) { if (overlayGesture.edges.left) x -= 72 - width; width = 72; }
                if (height < 72) { if (overlayGesture.edges.top) y -= 72 - height; height = 72; }
            } else { x += dx; y += dy; }
            settings.overlayX = x; settings.overlayY = y;
            settings.overlayWidth = width; settings.overlayHeight = height;
            applyOverlayGeometry();
        });
        const finish = event => {
            if (!overlayGesture || event.pointerId !== overlayGesture.pointerId) return;
            suppressArtworkClick = overlayGesture.moved;
            if (suppressArtworkClick) setTimeout(() => { suppressArtworkClick = false; }, 0);
            overlayGesture = null;
            box.classList.remove('rtca-moving');
            box.releasePointerCapture?.(event.pointerId);
            applyOverlayGeometry();
            void persistOverlayGeometry();
        };
        box.addEventListener('pointerup', finish);
        box.addEventListener('pointercancel', finish);
    }

    function activePsAnchor() {
        // VisualEQ hides the original #ps-container and renders a live clone
        // inside #flags-container-desktop. Prefer that visible host whenever
        // it exists; otherwise retain the stock FM-DX PS panel behaviour.
        const clone = document.getElementById('data-ps-desktop-clone');
        const visualEqHost = clone?.closest('#flags-container-desktop');
        if (visualEqHost && visualEqHost.getClientRects().length &&
            getComputedStyle(visualEqHost).display !== 'none') return visualEqHost;
        const source = document.getElementById('data-ps');
        return source?.closest('[class^="panel-"]') || source || null;
    }

    function anchorElement() {
        const selectors = {
            radiotext: '#rt-container', ps: '#data-ps', af: '#af-list'
        };
        const selector = selectors[settings.anchor];
        if (!selector) return $();
        if (settings.anchor === 'ps') {
            const psAnchor = activePsAnchor();
            return psAnchor ? $(psAnchor) : $();
        }
        let $anchor;
        try { $anchor = $(selector).first(); } catch (error) { return $(); }
        if (!$anchor.length) return $();
        if (settings.anchor === 'af') {
            const $panel = $anchor.closest('.panel-100');
            return $panel.length ? $panel : $anchor;
        }
        return $anchor;
    }

    function placeBox() {
        const $box = $('#rt-coverart-container');
        restoreLayout();
        if (!$box.length) return false;
        if (resizeObserver) resizeObserver.disconnect();
        const overlay = settings.placementMode === 'overlay' && canUseFreeformOverlay();
        const inside = settings.placementMode === 'inside' && window.innerWidth > 768;
        $box.removeClass('rtca-inside-panel rtca-inside-flush rtca-overlay').css({
            position: 'relative', left: '', top: '', zIndex: '', margin: 0,
            borderRadius: inside ? '' : '15px'
        });
        if (overlay) {
            $('body').append($box);
            $box.addClass('rtca-overlay').css({ position: 'fixed', zIndex: 80, borderRadius: '15px' });
            applyOverlayGeometry();
            observePinnedOverlayAnchor();
            return true;
        }
        const $anchor = anchorElement();
        if (!$anchor.length) { $box.css('display', 'none'); return false; }
        if (inside) {
            settings.side === 'before' ? $anchor.prepend($box) : $anchor.append($box);
        } else {
            settings.side === 'before' ? $anchor.before($box) : $anchor.after($box);
        }
        observeAnchor($anchor[0]);
        scheduleLayout();
        return true;
    }

    function restoreLayout() {
        if (!layoutRestore) return;
        layoutRestore();
        layoutRestore = null;
    }

    function scheduleLayout() {
        requestAnimationFrame(() => requestAnimationFrame(resizeToAnchor));
        setTimeout(resizeToAnchor, 120);
        setTimeout(resizeToAnchor, 500);
        setTimeout(resizeToAnchor, 1200);
    }

    function observeAnchor(element) {
        if (resizeObserver) resizeObserver.disconnect();
        if (window.ResizeObserver && element) {
            resizeObserver = new ResizeObserver(() => resizeToAnchor());
            // Observe the row/column, not the anchor whose width we deliberately
            // reduce to make room for the cover (avoids a resize feedback loop).
            const observed = settings.anchor === 'af'
                ? (element.parentElement?.parentElement || element.parentElement || element)
                : (element.parentElement || element);
            resizeObserver.observe(observed);
        }
    }

    function resizeToAnchor() {
        if (window.innerWidth <= 768) return;
        if (settings.placementMode === 'overlay' && canUseFreeformOverlay()) { applyOverlayGeometry(); return; }
        const $anchor = anchorElement();
        const $box = $('#rt-coverart-container');
        if (!$anchor.length || !$box.length) return;
        $box.css('display', 'none');
        if (layoutRestore) restoreLayout();
        const anchor = $anchor[0];
        const rect = anchor.getBoundingClientRect();
        const gap = Math.max(0, Number(settings.gap) || 0);

        if (settings.placementMode === 'inside') {
            resizeInsidePanel(anchor, $box, rect);
            return;
        }

        // AF is the narrow vertical column at the right of the main layout.
        // Its horizontal width, not its long content height, defines the square.
        if (settings.anchor === 'af') {
            const size = Math.max(60, Math.round(rect.width));
            const parent = anchor.parentElement;
            const oldDirection = parent ? parent.style.flexDirection : '';
            layoutRestore = () => { if (parent) parent.style.flexDirection = oldDirection; };
            if (parent) parent.style.flexDirection = 'column';
            $box.css({
                display: 'flex', width: `${size}px`, height: `${size}px`, minHeight: `${size}px`,
                maxHeight: `${size}px`, aspectRatio: '1 / 1', flex: `0 0 ${size}px`, alignSelf: 'flex-start',
                marginLeft: 0, marginRight: 0,
                marginTop: settings.side === 'after' ? `${gap}px` : '0px',
                marginBottom: settings.side === 'before' ? `${gap}px` : '0px'
            });
            return;
        }

        const size = Math.max(1, Math.round(rect.height));
        const parent = anchor.parentElement;
        if (!parent) { $box.css('display', 'flex'); return; }
        const parentRect = parent.getBoundingClientRect();
        const topOffset = Math.max(0, Math.round(rect.top - parentRect.top));
        const oldParentAlign = parent ? parent.style.alignItems : '';
        const oldParentHeight = parent ? parent.style.height : '';
        const oldAnchorWidth = anchor.style.width;
        const oldAnchorFlex = anchor.style.flex;
        const restoreItems = [];

        if (settings.anchor === 'radiotext') {
            const station = document.querySelector('#data-station-container')?.parentElement;
            if (station && station.parentElement === parent) {
                const stationRect = station.getBoundingClientRect();
                const oldStationWidth = station.style.width;
                const oldStationFlex = station.style.flex;
                const coverCost = size + (gap * 2);
                const minimumPanelWidth = 80;
                let rtTarget = rect.width - (coverCost / 2);
                let stationTarget = stationRect.width - (coverCost / 2);
                if (stationTarget < minimumPanelWidth) {
                    rtTarget -= minimumPanelWidth - stationTarget;
                    stationTarget = minimumPanelWidth;
                }
                rtTarget = Math.max(minimumPanelWidth, rtTarget);
                anchor.style.width = `${Math.round(rtTarget)}px`;
                station.style.width = `${Math.round(stationTarget)}px`;
                anchor.style.flex = `0 0 ${Math.round(rtTarget)}px`;
                station.style.flex = `0 0 ${Math.round(stationTarget)}px`;
                restoreItems.push(() => { station.style.width = oldStationWidth; station.style.flex = oldStationFlex; });
            }
        } else if (settings.anchor === 'ps') {
            // Preserve the play button as a fixed-width, full-height item. Every
            // other item keeps its original proportional share of this inner row.
            // The station-logo panel is managed by an outer row and must not be
            // treated as an equal sibling here.
            const siblings = [...parent.children].filter(item =>
                item !== $box[0] && item.getClientRects().length && item.getBoundingClientRect().width > 0
            );
            siblings.forEach(item => {
                const itemRect = item.getBoundingClientRect();
                const old = {
                    width: item.style.width, flex: item.style.flex, height: item.style.height,
                    minHeight: item.style.minHeight, maxHeight: item.style.maxHeight
                };
                const isPlay = item !== anchor && !!item.querySelector(
                    '.playbutton, #playbutton, [class*="playbutton"], .fa-play, [class*="play-"]'
                );
                const isEmptySpacer = item !== anchor && !item.textContent.trim() && item.children.length === 0;
                if (isEmptySpacer) {
                    // Some webserver/plugin combinations inject an empty flex div.
                    // Never let it acquire flex-grow and become a large visual gap.
                    item.style.width = '0px';
                    item.style.flex = '0 0 0px';
                } else if (isPlay) {
                    item.style.width = `${Math.round(itemRect.width)}px`;
                    item.style.flex = `0 0 ${Math.round(itemRect.width)}px`;
                } else {
                    item.style.width = '0px';
                    item.style.flex = `${Math.max(1, itemRect.width)} 1 0px`;
                }
                item.style.height = `${size}px`;
                item.style.minHeight = `${size}px`;
                item.style.maxHeight = `${size}px`;
                restoreItems.push(() => Object.assign(item.style, old));
            });
            parent.style.height = `${size}px`;
            parent.style.alignItems = 'stretch';
        }

        layoutRestore = () => {
            anchor.style.width = oldAnchorWidth;
            anchor.style.flex = oldAnchorFlex;
            if (parent) {
                parent.style.alignItems = oldParentAlign;
                parent.style.height = oldParentHeight;
            }
            restoreItems.forEach(restore => restore());
        };
        $box.css({
            display: 'flex', width: `${size}px`, height: `${size}px`, minHeight: `${size}px`,
            maxHeight: `${size}px`, aspectRatio: '1 / 1', flex: `0 0 ${size}px`, alignSelf: 'flex-start',
            marginTop: `${topOffset}px`, marginBottom: '0px',
            marginLeft: `${gap}px`, marginRight: `${gap}px`
        });
    }

    function resizeInsidePanel(anchor, $box, rect) {
        const computed = window.getComputedStyle(anchor);
        const isAf = settings.anchor === 'af';
        const inset = Math.min(8, Math.max(0, Number(settings.insideInset) || 0));
        const contentGap = Math.max(0, Number(settings.gap) || 0);
        const old = {
            display: anchor.style.display, flexDirection: anchor.style.flexDirection,
            alignItems: anchor.style.alignItems, overflow: anchor.style.overflow,
            padding: anchor.style.padding
        };
        const contentNodes = [...anchor.childNodes].filter(node => node !== $box[0]);
        const content = document.createElement('div');
        content.className = 'rtca-panel-content';
        content.style.padding = `${computed.paddingTop} ${computed.paddingRight} ${computed.paddingBottom} ${computed.paddingLeft}`;
        content.style.height = '100%';
        const originalUsesFlex = computed.display === 'flex' || computed.display === 'inline-flex';
        content.style.display = isAf || originalUsesFlex ? 'flex' : 'block';
        content.style.flexDirection = isAf ? 'column' : (originalUsesFlex ? computed.flexDirection : '');
        content.style.alignItems = isAf ? 'stretch' : (originalUsesFlex ? computed.alignItems : '');
        content.style.justifyContent = isAf ? 'center' : (originalUsesFlex ? computed.justifyContent : '');
        content.style.position = 'relative';
        content.style.flex = '1 1 0px';
        content.style.minWidth = '0px';
        content.style.width = '0px';
        content.style.overflow = 'hidden';
        content.style.boxSizing = 'border-box';
        if (inset > 0 && contentGap > 0) {
            if (isAf) content.style[settings.side === 'before' ? 'marginTop' : 'marginBottom'] = `${contentGap}px`;
            else content.style[settings.side === 'before' ? 'marginLeft' : 'marginRight'] = `${contentGap}px`;
        }
        contentNodes.forEach(node => content.appendChild(node));
        if (settings.side === 'before') {
            anchor.appendChild(content);
            anchor.insertBefore($box[0], content);
        } else {
            anchor.appendChild(content);
            anchor.appendChild($box[0]);
        }

        anchor.style.display = 'flex';
        anchor.style.flexDirection = isAf ? 'column' : 'row';
        anchor.style.alignItems = 'stretch';
        anchor.style.overflow = 'hidden';
        anchor.style.padding = '0px';

        const maxShare = Math.max(34, Math.round(rect.width * 0.46));
        const availableCrossSize = isAf ? rect.width - (inset * 2) : rect.height - (inset * 2);
        const coverSize = Math.max(34, Math.round(isAf
            ? availableCrossSize
            : Math.min(availableCrossSize, maxShare)));
        const edgeRadius = isAf
            ? (settings.side === 'before'
                ? `${computed.borderTopLeftRadius} ${computed.borderTopRightRadius} 0 0`
                : `0 0 ${computed.borderBottomRightRadius} ${computed.borderBottomLeftRadius}`)
            : (settings.side === 'before'
                ? `${computed.borderTopLeftRadius} 0 0 ${computed.borderBottomLeftRadius}`
                : `0 ${computed.borderTopRightRadius} ${computed.borderBottomRightRadius} 0`);
        const radius = inset > 0 ? '10px' : edgeRadius;
        const margin = inset > 0 ? `${inset}px` : '0px';
        $box.addClass('rtca-inside-panel').toggleClass('rtca-inside-flush', inset === 0).css({
            display: 'flex', width: inset > 0 ? `${coverSize}px` : (isAf ? '100%' : `${coverSize}px`),
            height: inset > 0 ? `${coverSize}px` : (isAf ? `${coverSize}px` : '100%'),
            minHeight: inset > 0 || isAf ? `${coverSize}px` : '0px',
            maxHeight: inset > 0 || isAf ? `${coverSize}px` : 'none', aspectRatio: '1 / 1',
            flex: `0 0 ${coverSize}px`, alignSelf: inset > 0 ? 'center' : 'stretch', borderRadius: radius,
            margin
        });

        layoutRestore = () => {
            if (anchor.isConnected && content.isConnected && content.parentNode === anchor) {
                contentNodes.forEach(node => anchor.insertBefore(node, content));
            }
            content.remove();
            anchor.style.display = old.display;
            anchor.style.flexDirection = old.flexDirection;
            anchor.style.alignItems = old.alignItems;
            anchor.style.overflow = old.overflow;
            anchor.style.padding = old.padding;
            $box.removeClass('rtca-inside-panel rtca-inside-flush').css('border-radius', '');
        };
    }

    function saveSongHistory() {
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(songHistory)); } catch (error) { /* private mode/quota */ }
    }

    function hydrateHistoryFromCache() {
        const combined = [...songHistory];
        Object.values(persistentCache).forEach(entry => {
            const result = entry?.result;
            if (!result?.found || !result.artwork || !result.trackName) return;
            combined.push({
                artist: result.artistName || '', title: result.trackName,
                album: result.collectionName || '', year: result.year || '',
                artwork: result.artwork, artworkBig: result.artworkBig || result.artwork,
                storeUrl: result.storeUrl || '', source: result.source || result.provider || '',
                provider: result.provider || result.source || '', freq: '', ts: Number(entry.at) || 0
            });
        });
        const seen = new Set();
        songHistory = combined.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0)).filter(item => {
            const key = `${item.artist || ''}\u0000${item.title || ''}\u0000${item.artwork || ''}`.toLocaleLowerCase();
            if (!item.artwork || !item.title || seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, cacheLimitValue());
        saveSongHistory();
    }

    function pruneSongHistory() {
        songHistory = songHistory.slice(0, cacheLimitValue());
        saveSongHistory();
        renderSongHistory();
    }

    function historyEntry(result, fallbackArtist = '', fallbackTitle = '') {
        return {
            artist: result.artistName || fallbackArtist,
            title: result.trackName || fallbackTitle,
            album: result.collectionName || '',
            year: result.year || '',
            artwork: result.artwork || '',
            artworkBig: result.artworkBig || result.artwork || '',
            storeUrl: result.storeUrl || '',
            source: result.source || result.provider || '',
            provider: result.provider || result.source || '',
            freq: lastFreq || '',
            ts: Date.now()
        };
    }

    function addSongHistory(result, artist, title) {
        const entry = historyEntry(result, artist, title);
        if (!entry.artwork || !entry.title) return;
        songHistory = songHistory.filter(item => !(item.artist === entry.artist && item.title === entry.title));
        songHistory.unshift(entry);
        songHistory = songHistory.slice(0, cacheLimitValue());
        saveSongHistory();
        renderSongHistory();
    }

    function formatHistoryTime(timestamp) {
        try { return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
        catch (error) { return ''; }
    }

    function renderSongHistory() {
        const $list = $('#rtca-history-list').empty();
        if (!$list.length) return;
        if (!songHistory.length) {
            $list.append('<div style="opacity:.55;font-size:12px;padding:5px">No detected songs yet.</div>');
            return;
        }
        songHistory.forEach(item => {
            const $row = $('<div class="rtca-history-item"></div>');
            $('<img alt="">').attr('src', item.artwork).appendTo($row);
            const subtitle = [formatHistoryTime(item.ts), item.freq ? `${item.freq} MHz` : ''].filter(Boolean).join(' · ');
            $('<div class="rtca-history-text"></div>')
                .append($('<div></div>').text(`${item.artist} — ${item.title}`))
                .append($('<div class="rtca-history-sub"></div>').text(subtitle))
                .appendTo($row);
            $row.on('click', event => { event.stopPropagation(); closeSettings(); openCoverLightbox(item); });
            $list.append($row);
        });
    }

    function createSettingsPanel() {
        if ($('#rt-coverart-settings').length) return;
        $('body').append(`<div id="rt-coverart-settings" role="dialog" aria-modal="true" aria-labelledby="rtca-settings-title" aria-hidden="true"><div class="rtca-settings-card">
            <div class="rtca-settings-header"><h3 id="rtca-settings-title">RadioText Cover Art <small style="opacity:.55">v${BUILD_ID}</small></h3>
            <button type="button" class="rtca-settings-close" title="Close" aria-label="Close settings">&times;</button></div>
            <div id="rtca-config-scope" class="rtca-config-scope"></div>
            <div class="rtca-settings-body">
                <div class="rtca-settings-columns">
                    <div class="rtca-settings-column">
                        <section class="rtca-section">
                            <div class="rtca-section-title">Placement</div>
                            <div class="rtca-grid">
                                <label class="rtca-field"><span>Place cover next to:</span><select id="rtca-anchor">
                                    <option value="radiotext">RadioText</option><option value="ps">PS</option><option value="af">AF list</option>
                                </select></label>
                                <label class="rtca-field"><span>Position:</span><select id="rtca-side"><option value="after">After</option><option value="before">Before</option></select></label>
                                <label class="rtca-field full"><span>Placement style:</span><select id="rtca-placement-mode">
                                    <option value="separate">Separate panel</option><option value="inside">Inside selected panel</option>
                                    <option value="overlay">Freeform overlay</option>
                                </select></label>
                                <label class="rtca-field" id="rtca-inside-inset-field"><span title="0 keeps the edge-to-edge appearance">Inside panel inset:</span>
                                    <input id="rtca-inside-inset" type="number" min="0" max="8" step="1"></label>
                                <label class="rtca-field"><span>Gap from content:</span><input id="rtca-gap" type="number" min="0" max="80"></label>
                                <div class="rtca-field full" id="rtca-overlay-help" style="display:none;opacity:.68;font-size:11px;line-height:1.35">
                                    Drag to move or resize. Use the pin to lock the cover relative to the nearest panel.
                                </div>
                            </div>
                            <div class="rtca-check-list single" style="margin-top:8px"><label><input id="rtca-enabled" type="checkbox"> <strong>Enable cover art</strong></label></div>
                        </section>

                        <section class="rtca-section">
                            <div class="rtca-section-title">Appearance</div>
                            <div class="rtca-grid">
                                <label class="rtca-field full"><span>Behaviour during jingles and ads:</span><select id="rtca-idle-behaviour">
                                    <option value="keep">Keep last cover</option><option value="default">Show default background</option>
                                </select></label>
                                <label class="rtca-field full"><span>Default background:</span><select id="rtca-default-mode">
                                    <option value="builtIn">Built-in placeholder</option><option value="stationLogo">Station logo</option>
                                    <option value="custom">Custom image</option>
                                </select></label>
                                <label class="rtca-field full"><span>Waiting message background:</span><select id="rtca-waiting-opacity">
                                    <option value="0">0% — Transparent</option><option value="25">25%</option>
                                    <option value="50">50%</option><option value="75">75% (default)</option>
                                    <option value="100">100% — Solid black</option>
                                </select></label>
                                <div class="rtca-default-image-row full" id="rtca-default-custom-row">
                                    <label class="rtca-field"><span>Image path or URL:</span><input id="rtca-default-image" type="text" placeholder="/images/default-cover.jpg"></label>
                                    <img id="rtca-default-preview" class="rtca-default-preview" alt="Default background preview">
                                </div>
                                <label class="rtca-field full"><span>Cover backdrop:</span><select id="rtca-backdrop">
                                    <option value="off">Off</option><option value="ps">PS panel</option>
                                    <option value="rt">RadioText panel</option><option value="both">PS + RadioText</option>
                                </select></label>
                                <label class="rtca-field"><span>Backdrop blur:</span><input id="rtca-backdrop-blur" type="number" min="0" max="30" step="1"></label>
                            </div>
                            <div class="rtca-check-list single" style="margin-top:8px">
                                <label><input id="rtca-caption" type="checkbox"> <strong>Show song caption on hover</strong></label>
                                <label><input id="rtca-message-no-rds" type="checkbox"> <strong>Show “No RDS detected”</strong></label>
                                <label><input id="rtca-message-no-metadata" type="checkbox"> <strong>Show “No PS/RadioText detected”</strong></label>
                                <label><input id="rtca-message-waiting" type="checkbox"> <strong>Show “Waiting for song info”</strong></label>
                            </div>
                        </section>

                        <section class="rtca-section">
                            <div class="rtca-section-title">Storage &amp; diagnostics</div>
                            <div class="rtca-grid" style="margin-bottom:8px">
                                <label class="rtca-field full"><span>Artwork cache size:</span><select id="rtca-cache-limit">
                                    <option value="25">25 covers</option><option value="50">50 covers</option>
                                    <option value="100">100 covers</option><option value="250">250 covers (default)</option>
                                    <option value="500">500 covers</option>
                                </select></label>
                            </div>
                            <div class="rtca-check-list single">
                                <label><input id="rtca-persistent-cache" type="checkbox"> <strong>Keep artwork cache</strong></label>
                                <label><input id="rtca-debug" type="checkbox"> <strong>Debug logging</strong></label>
                            </div>
                            <button id="rtca-clear-cache" style="margin-top:9px">Clear artwork cache</button>
                        </section>
                    </div>

                    <div class="rtca-settings-column">
                        <section class="rtca-section">
                            <div class="rtca-section-title">Song detection</div>
                            <div class="rtca-grid">
                                <label class="rtca-field full"><span>Song information source:</span><select id="rtca-song-source">
                                    <option value="both">RadioText + PS</option><option value="rt">RadioText only</option><option value="ps">PS only</option>
                                </select></label>
                                <label class="rtca-field"><span>Detection strictness:</span><select id="rtca-min-confidence">
                                    <option value="25">Flexible</option><option value="40">Balanced (recommended)</option>
                                    <option value="60">Strict</option><option value="75">Very strict</option>
                                </select></label>
                                <label class="rtca-field"><span>RadioText delay:</span><input id="rtca-delay" type="number" min="500" max="15000" step="100"></label>
                                <label class="rtca-field full"><span>Retry when no cover is found:</span><select id="rtca-no-artwork-retry">
                                    <option value="0">Off</option><option value="30">After 30 seconds</option>
                                    <option value="60">After 1 minute</option><option value="120">After 2 minutes</option><option value="300">After 5 minutes</option>
                                </select></label>
                            </div>
                            <div class="rtca-check-list single" style="margin-top:8px"><label><input id="rtca-parse-ps" type="checkbox"> <strong>Analyse dynamic PS</strong></label></div>
                        </section>

                        <section class="rtca-section">
                            <div class="rtca-section-title">Cover sources</div>
                            <div class="rtca-source-note">Sources are searched in this order until a verified cover is found.</div>
                            <div class="rtca-source-list">
                                <label><span class="rtca-source-order">1</span><input id="rtca-itunes" type="checkbox"> <strong>Apple Music</strong></label>
                                <label><span class="rtca-source-order">2</span><input id="rtca-deezer" type="checkbox"> <strong>Deezer</strong></label>
                                <label><span class="rtca-source-order">3</span><input id="rtca-audiodb" type="checkbox"> <strong>TheAudioDB</strong></label>
                                <label><span class="rtca-source-order">4</span><input id="rtca-mb" type="checkbox"> <strong>MusicBrainz / Cover Art Archive</strong></label>
                            </div>
                        </section>

                        <section class="rtca-section">
                            <div class="rtca-section-title"><span>Current station</span><small id="rtca-station-label"></small></div>
                            <div class="rtca-grid">
                                <label class="rtca-field"><span>RadioText order:</span><select id="rtca-profile-order">
                                    <option value="auto">Automatic</option><option value="artist-title">Artist — Title</option>
                                    <option value="title-artist">Title — Artist</option>
                                </select></label>
                                <label class="rtca-field"><span>Dynamic PS mode:</span><select id="rtca-profile-ps-mode">
                                    <option value="auto">Automatic</option><option value="structured">Structured labels</option>
                                    <option value="quoted">Quoted title</option><option value="disabled">Disabled</option>
                                </select></label>
                            </div>
                        </section>
                    </div>
                </div>

                <section class="rtca-section rtca-history-section">
                    <div class="rtca-history-head"><div class="rtca-section-title">Recent songs</div><button id="rtca-clear-history">Clear history</button></div>
                    <div id="rtca-history-list" class="rtca-history-list"></div>
                </section>
            </div>
            <div class="rtca-actions"><button id="rtca-reset">Reset</button><button id="rtca-cancel">Cancel</button><button id="rtca-save">Save personal settings</button></div>
        </div></div>`);
        populateSettingsForm();
        $('.rtca-settings-close').on('click', closeSettings);
        $('#rtca-cancel').on('click', closeSettings);
        $('#rtca-reset').on('click', () => {
            settings = isAdminSession ? { ...DEFAULTS } : { ...DEFAULTS, ...adminDefaults };
            populateSettingsForm();
        });
        $('#rtca-clear-cache').on('click', () => {
            persistentCache = {}; Object.keys(localCache).forEach(key => delete localCache[key]);
            localStorage.removeItem(CACHE_KEY);
        });
        $('#rtca-clear-history').on('click', () => { songHistory = []; saveSongHistory(); renderSongHistory(); });
        $('#rtca-save').on('click', saveSettings);
        $('#rtca-placement-mode').on('change', () => {
            const mode = $('#rtca-placement-mode').val();
            $('#rtca-overlay-help').toggle(mode === 'overlay');
            $('#rtca-inside-inset-field').toggle(mode === 'inside');
        });
        $('#rtca-anchor').on('change', updatePositionLabels);
        $('#rtca-song-source').on('change', function () {
            if (this.value !== 'rt') $('#rtca-parse-ps').prop('checked', true);
        });
        $('#rtca-default-mode').on('change', updateDefaultImageControls);
        $('#rtca-default-image').on('input change', updateDefaultImageControls);
        $('#rt-coverart-settings').on('click', event => { if (event.target.id === 'rt-coverart-settings') closeSettings(); });
        renderSongHistory();
    }

    function updateDefaultImageControls() {
        const mode = $('#rtca-default-mode').val();
        const custom = mode === 'custom';
        $('#rtca-default-custom-row').toggle(custom);
        const preview = document.getElementById('rtca-default-preview');
        if (!preview) return;
        const logo = stationLogoUrl();
        const source = custom ? normalizeImageLocation($('#rtca-default-image').val()) :
            (mode === 'stationLogo' ? (logo || DEFAULT_IMAGE_URL) : DEFAULT_IMAGE_URL);
        preview.onerror = () => {
            preview.onerror = null;
            preview.src = DEFAULT_IMAGE_URL;
            preview.title = 'Image could not be loaded; the built-in placeholder will be used.';
        };
        preview.title = custom ? 'Default background preview' :
            (mode === 'stationLogo' ? (logo ? 'Station logo' : 'Station logo unavailable; built-in placeholder will be used') : 'Built-in placeholder');
        preview.src = source || DEFAULT_IMAGE_URL;
    }

    function updatePositionLabels() {
        const vertical = $('#rtca-anchor').val() === 'af';
        $('#rtca-side option[value="before"]').text(vertical ? 'Above' : 'Before');
        $('#rtca-side option[value="after"]').text(vertical ? 'Below' : 'After');
    }

    function populateSettingsForm() {
        $('#rtca-config-scope').text(isAdminSession
            ? 'Administrator — saves shared defaults for all visitors'
            : 'Personal settings — overrides this server’s defaults');
        $('#rtca-anchor').val(settings.anchor); $('#rtca-side').val(settings.side);
        updatePositionLabels();
        $('#rtca-placement-mode').val(settings.placementMode || 'separate');
        $('#rtca-song-source').val(settings.songSource || 'both');
        $('#rtca-overlay-help').toggle((settings.placementMode || 'separate') === 'overlay');
        $('#rtca-inside-inset-field').toggle((settings.placementMode || 'separate') === 'inside');
        $('#rtca-inside-inset').val(settings.insideInset ?? DEFAULTS.insideInset);
        $('#rtca-gap').val(settings.gap); $('#rtca-delay').val(settings.stableDelay);
        const strictnessLevels = [25, 40, 60, 75];
        const storedConfidence = Number(settings.minConfidence ?? DEFAULTS.minConfidence);
        const nearestStrictness = strictnessLevels.reduce((best, level) =>
            Math.abs(level - storedConfidence) < Math.abs(best - storedConfidence) ? level : best,
        DEFAULTS.minConfidence);
        $('#rtca-min-confidence').val(String(nearestStrictness));
        $('#rtca-no-artwork-retry').val(String(settings.noArtworkRetrySeconds ?? DEFAULTS.noArtworkRetrySeconds));
        $('#rtca-backdrop').val(settings.panelBackdrop || 'off');
        $('#rtca-backdrop-blur').val(settings.backdropBlur ?? DEFAULTS.backdropBlur);
        $('#rtca-idle-behaviour').val(settings.idleBehaviour === 'default' ? 'default' : 'keep');
        $('#rtca-default-mode').val(settings.defaultBackgroundMode || (settings.defaultImage ? 'custom' : 'builtIn'));
        $('#rtca-waiting-opacity').val(String([0, 25, 50, 75, 100].includes(Number(settings.waitingBackgroundOpacity))
            ? Number(settings.waitingBackgroundOpacity) : DEFAULTS.waitingBackgroundOpacity));
        $('#rtca-default-image').val(settings.defaultImage || '');
        updateDefaultImageControls();
        $('#rtca-enabled').prop('checked', settings.enabled !== false);
        $('#rtca-itunes').prop('checked', settings.useITunes);
        $('#rtca-deezer').prop('checked', settings.useDeezer !== false);
        $('#rtca-mb').prop('checked', settings.useMusicBrainz);
        $('#rtca-audiodb').prop('checked', settings.useTheAudioDB !== false);
        $('#rtca-parse-ps').prop('checked', settings.parsePs);
        $('#rtca-caption').prop('checked', settings.showCaption);
        $('#rtca-message-no-rds').prop('checked', settings.showNoRdsMessage !== false);
        $('#rtca-message-no-metadata').prop('checked', settings.showNoMetadataMessage !== false);
        $('#rtca-message-waiting').prop('checked', settings.showWaitingMessage !== false);
        $('#rtca-debug').prop('checked', Boolean(settings.debugLogging));
        $('#rtca-persistent-cache').prop('checked', settings.persistentCache !== false);
        $('#rtca-cache-limit').val(String(cacheLimitValue()));
        const profile = stationProfile();
        $('#rtca-profile-order').val(profile.order || 'auto');
        $('#rtca-profile-ps-mode').val(profile.psMode || 'auto');
        $('#rtca-station-label').text([
            lastFreq ? `${lastFreq} MHz` : '', lastPi ? `PI ${lastPi}` : ''
        ].filter(Boolean).join(' · ') || 'No station data');
        $('#rtca-save').text(isAdminSession ? 'Save as server defaults' : 'Save personal settings');
        renderSongHistory();
    }

    async function saveSettings() {
        const nextAnchor = $('#rtca-anchor').val();
        const nextSide = $('#rtca-side').val();
        settings.anchor = nextAnchor; settings.side = nextSide;
        settings.placementMode = $('#rtca-placement-mode').val() || 'separate';
        settings.insideInset = Math.min(8, Math.max(0, Number($('#rtca-inside-inset').val()) || 0));
        settings.songSource = $('#rtca-song-source').val() || 'both';
        settings.gap = Math.max(0, Number($('#rtca-gap').val()) || 0);
        settings.stableDelay = Math.max(500, Number($('#rtca-delay').val()) || DEFAULTS.stableDelay);
        settings.minConfidence = Math.min(100, Math.max(0, Number($('#rtca-min-confidence').val()) || 0));
        settings.noArtworkRetrySeconds = Math.max(0, Number($('#rtca-no-artwork-retry').val()) || 0);
        settings.panelBackdrop = $('#rtca-backdrop').val() || 'off';
        settings.backdropBlur = Math.min(30, Math.max(0, Number($('#rtca-backdrop-blur').val()) || 0));
        settings.idleBehaviour = $('#rtca-idle-behaviour').val() || 'keep';
        settings.retainLastArt = settings.idleBehaviour === 'keep';
        settings.defaultBackgroundMode = $('#rtca-default-mode').val() || 'builtIn';
        settings.defaultImage = settings.defaultBackgroundMode === 'custom'
            ? normalizeImageLocation($('#rtca-default-image').val()) : null;
        settings.waitingBackgroundOpacity = Number($('#rtca-waiting-opacity').val()) || 0;
        settings.enabled = $('#rtca-enabled').prop('checked');
        settings.useITunes = $('#rtca-itunes').prop('checked'); settings.useDeezer = $('#rtca-deezer').prop('checked');
        settings.useMusicBrainz = $('#rtca-mb').prop('checked');
        settings.useTheAudioDB = $('#rtca-audiodb').prop('checked');
        settings.parsePs = $('#rtca-parse-ps').prop('checked');
        settings.showCaption = $('#rtca-caption').prop('checked');
        settings.showNoRdsMessage = $('#rtca-message-no-rds').prop('checked');
        settings.showNoMetadataMessage = $('#rtca-message-no-metadata').prop('checked');
        settings.showWaitingMessage = $('#rtca-message-waiting').prop('checked');
        settings.debugLogging = $('#rtca-debug').prop('checked');
        settings.persistentCache = $('#rtca-persistent-cache').prop('checked');
        settings.cacheLimit = Math.min(500, Math.max(25, Number($('#rtca-cache-limit').val()) || DEFAULT_CACHE_LIMIT));
        pruneArtworkCache();
        pruneSongHistory();
        const profile = stationProfile();
        profile.order = $('#rtca-profile-order').val() || 'auto';
        profile.psMode = $('#rtca-profile-ps-mode').val() || 'auto';
        saveProfiles();
        channels.ps.lastText = null;
        resetPsAssembly();
        try {
            if (isAdminSession) {
                adminDefaults = await saveSharedConfig(settings);
            } else {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(userSettingOverrides(settings)));
            }
            if (!settings.enabled) clearToDefault(true);
            else if (!currentArtworkUrl) applyIdleBehaviour(true);
            applyCaptionSetting(); applyPanelBackdrop(); placeBox(); applyEnabledSetting(); closeSettings();
            if (!currentArtworkUrl) {
                if (!rdsPresent) setPlaceholderMessage('No RDS detected', 'noRds');
                else if (!metadataPresent) setPlaceholderMessage('No PS/RadioText detected', 'noMetadata');
                else setPlaceholderMessage(WAITING_TOOLTIP, 'waiting');
            }
        } catch (error) {
            alert(`Could not save RadioText Cover Art settings.\n\n${error.message}`);
        }
    }

    function openSettings(trigger = null) {
        settingsTriggerElement = trigger || document.activeElement;
        populateSettingsForm();
        $('#rt-coverart-settings').addClass('open').attr('aria-hidden', 'false');
        $(document).off('keydown.rtcaSettings').on('keydown.rtcaSettings', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeSettings();
            }
        });
        requestAnimationFrame(() => $('.rtca-settings-close').trigger('focus'));
    }

    function closeSettings() {
        const wasOpen = $('#rt-coverart-settings').hasClass('open');
        $('#rt-coverart-settings').removeClass('open').attr('aria-hidden', 'true');
        $(document).off('keydown.rtcaSettings');
        if (wasOpen && settingsTriggerElement?.isConnected) settingsTriggerElement.focus();
        settingsTriggerElement = null;
    }
    function applyEnabledSetting() {
        $('#rt-coverart-container').toggle(settings.enabled !== false && mainUiActive);
    }
    function applyCaptionSetting() {
        const allowed = [0, 25, 50, 75, 100];
        const percentage = allowed.includes(Number(settings.waitingBackgroundOpacity))
            ? Number(settings.waitingBackgroundOpacity) : DEFAULTS.waitingBackgroundOpacity;
        $('#rt-coverart-container')
            .toggleClass('hide-caption', !settings.showCaption)
            .css('--rtca-waiting-bg-opacity', String(percentage / 100));
    }
    function backdropPanels() {
        const ps = activePsAnchor();
        return { ps, rt: document.getElementById('rt-container') };
    }
    function applyPanelBackdrop() {
        const panels = backdropPanels();
        Object.values(panels).filter(Boolean).forEach(panel => {
            panel.classList.remove('rtca-cover-backdrop');
            panel.style.removeProperty('--rtca-cover-image');
            panel.style.removeProperty('--rtca-backdrop-blur');
        });
        if (!currentArtworkUrl || settings.panelBackdrop === 'off') return;
        const selected = settings.panelBackdrop === 'both' ? ['ps', 'rt'] : [settings.panelBackdrop];
        selected.forEach(name => {
            const panel = panels[name];
            if (!panel) return;
            panel.style.setProperty('--rtca-cover-image', `url(${JSON.stringify(currentArtworkUrl)})`);
            panel.style.setProperty('--rtca-backdrop-blur', `${settings.backdropBlur}px`);
            panel.classList.add('rtca-cover-backdrop');
        });
    }
    function showArt(url, text, isArtwork = true, result = null, displayMode = '') {
        currentArtworkUrl = isArtwork ? url : null;
        currentArtworkLabel = isArtwork ? (text || '') : '';
        currentResult = isArtwork ? (result || currentResult) : null;
        $('#rt-coverart-container img').attr('src', url);
        $('#rt-coverart-container .rt-coverart-caption').text(text || WAITING_TOOLTIP);
        $('#rt-coverart-container')
            .toggleClass('rtca-empty', !isArtwork)
            .toggleClass('rtca-station-logo', displayMode === 'stationLogo')
            .attr('title', text || WAITING_TOOLTIP);
        if (isArtwork) $('#rt-coverart-container').removeClass('rtca-hide-state-message');
        applyPanelBackdrop();
    }

    function normalizeImageLocation(value) {
        const input = String(value || '').trim();
        if (!input) return null;
        if (/^https?:\/\//i.test(input) || input.startsWith('/')) return input;
        if (/^(?:javascript|vbscript|file):/i.test(input)) return null;
        return '/' + input.replace(/^\.\//, '').replace(/^\/+/, '');
    }

    function defaultImageUrl() {
        return normalizeImageLocation(settings.defaultImage) || DEFAULT_IMAGE_URL;
    }

    function stationLogoUrl() {
        const image = document.getElementById('station-logo');
        const source = image && (image.currentSrc || image.getAttribute('src') || image.src);
        if (!source || /^(?:javascript|vbscript|file):/i.test(source)) return null;
        return source;
    }

    function idleImage() {
        if (settings.defaultBackgroundMode === 'stationLogo') {
            const logo = stationLogoUrl();
            if (logo) return { url: logo, label: WAITING_TOOLTIP, mode: 'stationLogo' };
        }
        return { url: defaultImageUrl(), label: WAITING_TOOLTIP, mode: 'default' };
    }

    function sourceMayEnterIdle(source = null) {
        if (!source || settings.songSource !== 'both') return true;
        if (source === 'rt') {
            // Informational RT must not replace artwork selected from Dynamic
            // PS, nor flash the station logo while a PS lookup is in flight.
            if (currentSource === 'ps' || requestControllers.ps || channels.ps.lastText) return false;
        }
        if (source === 'ps') {
            // Preserve a valid RT match while it still owns the priority window.
            if (currentSource === 'rt' && Date.now() - lastValidRtAt < settings.rtPriorityMs) return false;
            if (requestControllers.rt) return false;
        }
        return !currentSource || currentSource === source;
    }

    function applyIdleBehaviour(force = false, source = null) {
        if (!force && !sourceMayEnterIdle(source)) return false;
        const behaviour = settings.idleBehaviour || (settings.retainLastArt === false ? 'default' : 'keep');
        if (!force && behaviour === 'keep' && currentArtworkUrl) return false;
        const idle = idleImage();
        // This changes only the visual placeholder. Candidate observers,
        // in-flight requests and retry timers continue running normally.
        showArt(idle.url, idle.label, false, null, idle.mode);
        setPlaceholderMessage(idle.label, 'waiting');
        return true;
    }
    function setStatus(text = '') {
        const $box = $('#rt-coverart-container');
        const visible = Boolean(text) && !currentArtworkUrl;
        $box.toggleClass('rtca-busy', visible);
        $box.find('.rt-coverart-status').text(text);
        if (visible) $box.attr('title', text);
    }

    function setPlaceholderMessage(text, type = 'waiting') {
        if (currentArtworkUrl) return;
        const label = text || WAITING_TOOLTIP;
        placeholderMessageType = type;
        const visible = type === 'noRds' ? settings.showNoRdsMessage !== false :
            (type === 'noMetadata' ? settings.showNoMetadataMessage !== false : settings.showWaitingMessage !== false);
        $('#rt-coverart-container .rt-coverart-caption').text(label);
        $('#rt-coverart-container').toggleClass('rtca-hide-state-message', !visible).attr('title', visible ? label : '');
    }

    function cancelAvailabilityMessage() {
        clearTimeout(availabilityTimer);
        availabilityTimer = null;
        availabilityMessageType = null;
    }

    function scheduleAvailabilityMessage(text, type, delay = 1600) {
        if (currentArtworkUrl || placeholderMessageType === type ||
            (availabilityTimer && availabilityMessageType === type)) return;
        cancelAvailabilityMessage();
        availabilityMessageType = type;
        availabilityTimer = setTimeout(() => {
            availabilityTimer = null;
            availabilityMessageType = null;
            if (currentArtworkUrl) return;
            if (type === 'noRds' && rdsPresent) return;
            if (type === 'noMetadata' && (!rdsPresent || metadataPresent)) return;
            setPlaceholderMessage(text, type);
        }, delay);
    }

    function closeCoverLightbox() {
        const $overlay = $('.rtca-lightbox');
        const $cover = $overlay.find('.rtca-lightbox-cover');
        if (!$overlay.length) return;
        const source = document.querySelector('#rt-coverart-container img')?.getBoundingClientRect();
        $overlay.removeClass('open');
        if (source) $cover.css({ left: source.left, top: source.top, width: source.width, height: source.height });
        $(document).off('keydown.rtcaLightbox');
        setTimeout(() => $overlay.remove(), 360);
    }

    function openCoverLightbox(info = null) {
        const displayInfo = info || currentResult || {};
        const artworkUrl = displayInfo.artworkBig || displayInfo.artwork || currentArtworkUrl;
        if (!artworkUrl || $('.rtca-lightbox').length) return;
        const freeformOverlay = settings.placementMode === 'overlay' && canUseFreeformOverlay();
        if (freeformOverlay && !settings.overlayPinned && !info) return;
        const source = document.querySelector('#rt-coverart-container img')?.getBoundingClientRect();
        if (!source) return;
        const viewportLimit = Math.min(window.innerWidth - 40, window.innerHeight - 40);
        const maximumSize = freeformOverlay
            ? Math.min(PINNED_OVERLAY_MAX_ZOOM_PX, viewportLimit)
            : viewportLimit;
        const size = Math.max(80, Math.min(
            Math.max(source.width, source.height) * 4,
            maximumSize
        ));
        const margin = 20;
        // Expand from the panel's outer corner towards the centre of the UI.
        // PS sits on the upper row, RT on the lower row, while AF is vertical;
        // their before/after meanings therefore require different directions.
        let growLeft;
        let growUp;
        if (settings.placementMode === 'overlay') {
            growLeft = source.left + source.width / 2 > window.innerWidth / 2;
            growUp = source.top + source.height / 2 > window.innerHeight / 2;
        } else if (settings.anchor === 'ps') {
            growLeft = settings.side === 'after';
            growUp = false;
        } else if (settings.anchor === 'af') {
            growLeft = true;
            growUp = settings.side === 'after';
        } else {
            growLeft = settings.side === 'after';
            growUp = true;
        }
        const intendedLeft = growLeft ? source.right - size : source.left;
        const intendedTop = growUp ? source.bottom - size : source.top;
        const left = Math.round(Math.max(margin, Math.min(intendedLeft, window.innerWidth - size - margin)));
        const top = Math.round(Math.max(margin, Math.min(intendedTop, window.innerHeight - size - margin)));
        const artist = displayInfo.artistName || displayInfo.artist || '';
        const title = displayInfo.trackName || displayInfo.title || '';
        const label = artist || title ? `${artist}${artist && title ? ' — ' : ''}${title}` : currentArtworkLabel;
        const meta = [displayInfo.collectionName || displayInfo.album || '', displayInfo.year || ''].filter(Boolean).join(' · ');
        const safeArtwork = $('<div>').text(artworkUrl).html();
        const safeLabel = $('<div>').text(label).html();
        const safeMeta = $('<div>').text(meta).html();
        const query = encodeURIComponent(`${artist} ${title}`.trim());
        const links = [];
        if (query) {
            links.push(`<a href="https://www.youtube.com/results?search_query=${query}" target="_blank" rel="noopener">YouTube</a>`);
            links.push(`<a href="https://open.spotify.com/search/${query}" target="_blank" rel="noopener">Spotify</a>`);
        }
        if (displayInfo.storeUrl) {
            const safeUrl = $('<div>').text(displayInfo.storeUrl).html();
            const safeSource = $('<div>').text(displayInfo.source || displayInfo.provider || 'Open').html();
            links.push(`<a href="${safeUrl}" target="_blank" rel="noopener">${safeSource}</a>`);
        }
        $('body').append(`<div class="rtca-lightbox"><div class="rtca-lightbox-cover" style="left:${source.left}px;top:${source.top}px;width:${source.width}px;height:${source.height}px">
            <img src="${safeArtwork}" alt="Enlarged cover art"><div class="rtca-lightbox-title">${safeLabel}
            ${safeMeta ? `<span class="rtca-lightbox-meta">${safeMeta}</span>` : ''}
            ${links.length ? `<span class="rtca-lightbox-links">${links.join('')}</span>` : ''}</div></div></div>`);
        const $overlay = $('.rtca-lightbox');
        $overlay.on('click', closeCoverLightbox);
        $overlay.find('.rtca-lightbox-cover').on('click', closeCoverLightbox);
        $overlay.find('.rtca-lightbox-links a').on('click', event => event.stopPropagation());
        $(document).on('keydown.rtcaLightbox', event => { if (event.key === 'Escape') closeCoverLightbox(); });
        requestAnimationFrame(() => requestAnimationFrame(() => {
            $overlay.addClass('open').find('.rtca-lightbox-cover').css({ left, top, width: size, height: size });
        }));
    }
    function clearToDefault(force = true) {
        closeCoverLightbox();
        clearRetryTimers();
        currentSongKey = null; currentSource = null; requestIds.rt += 1; requestIds.ps += 1;
        Object.values(requestControllers).forEach(controller => controller?.abort());
        requestControllers.rt = null; requestControllers.ps = null;
        applyIdleBehaviour(force);
        setStatus('');
    }
    function resetForNewStation() {
        Object.values(channels).forEach(channel => { clearTimeout(channel.timer); channel.lastText = null; });
        resetPsAssembly();
        lastObservedPsText = '';
        observedPsHistory = [];
        lastValidRtAt = 0;
        rdsPresent = false;
        metadataPresent = false;
        cancelAvailabilityMessage();
        clearToDefault(true);
        scheduleAvailabilityMessage('No RDS detected', 'noRds', 1800);
        if (settings.defaultBackgroundMode === 'stationLogo') {
            [250, 900].forEach(delay => setTimeout(() => {
                if (!currentArtworkUrl && !currentSource) applyIdleBehaviour(true);
            }, delay));
        }
    }

    function normalizedFrequency(value) {
        if (value === null || typeof value === 'undefined') return '';
        const raw = typeof value === 'object'
            ? (value.frequency ?? value.freq ?? value.value ?? '') : value;
        const numeric = Number(String(raw).replace(',', '.').replace(/[^0-9.-]/g, ''));
        if (!Number.isFinite(numeric) || numeric <= 0) return '';
        let mhz = numeric;
        if (mhz >= 1000000) mhz /= 1000000;
        else if (mhz >= 1000) mhz /= 1000;
        return mhz.toFixed(3);
    }

    function normalizedPi(value) {
        if (value === null || typeof value === 'undefined') return '';
        const pi = typeof value === 'number'
            ? Math.round(value).toString(16).toUpperCase().padStart(4, '0')
            : String(value).trim().toUpperCase().replace(/^0X/, '');
        return /^[0-9A-F]{4}$/.test(pi) && pi !== '0000' ? pi : '';
    }

    function cleanText(raw) {
        let text = (raw || '').replace(/[\x00-\x1F]+/g, ' ').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
        const nowPlaying = /\b(?:now\s*playing|now\s*on\s*air|currently\s*playing|on\s*air|jetzt\s*(?:läuft|laeuft)|aktuell|en\s*cours|à\s*l['’]écoute|ahora\s*suena|ora\s*in\s*onda)\s*[:：\-–—]?\s*/ig;
        let marker; let lastMarker = null;
        while ((marker = nowPlaying.exec(text)) !== null) lastMarker = marker;
        if (lastMarker) text = text.slice(lastMarker.index + lastMarker[0].length);
        return text
            .replace(/^(?:now\s*playing|now\s*on\s*air|now\s*on|currently\s*playing|playing|on\s*air|now|music|artist\s*\/\s*title|jetzt\s*(?:läuft|laeuft)|aktuell|en\s*cours|à\s*l['’]écoute|ahora\s*suena|ora\s*in\s*onda)\b\s*[:：\-–—]?\s*/i, '')
            .replace(/\s*(?:\[official(?: video| audio)?\]|\(official(?: video| audio)?\))\s*$/i, '')
            .replace(/["“”]+/g, '').trim();
    }

    function normalizedComparisonWords(value) {
        return cleanText(value).toLocaleUpperCase()
            .replace(/(\d)[,.](\d)/g, '$1.$2')
            .replace(/[^\p{L}\p{N}.]+/gu, ' ')
            .trim().split(/\s+/).filter(Boolean);
    }

    function hasStationIdentity(words) {
        const phrase = words.join(' ');
        if (words.some(word => /^(?:RADIO|FM|MHZ)$/i.test(word) || isFrequencyToken(word))) return true;
        return (stationProfile(false)?.stationTokens || []).some(token => {
            const stationWords = normalizedComparisonWords(token);
            return stationWords.length && phrase.includes(stationWords.join(' '));
        });
    }

    function stripLeadingStationBranding(value) {
        const text = cleanText(value);
        const signature = /\b(?:RADIO|FM)\s+(?:8[7-9]|9\d|10[0-8])(?:[.,]\d)?(?:\s*MHZ)?\b/iu.exec(text);
        // A station signature near the beginning is branding only when a later
        // delimiter leaves a complete second ARTIST/TITLE-style separator.
        if (!signature || signature.index > 55) return text;
        const delimiters = /\s+(?:-|–|—|\||•|»|>)\s+/gu;
        delimiters.lastIndex = signature.index + signature[0].length;
        let delimiter;
        while ((delimiter = delimiters.exec(text)) !== null) {
            const remainder = text.slice(delimiter.index + delimiter[0].length).trim();
            if (/^.{2,120}?\s+(?:-|–|—|~|\/|::|»|>)\s+.{2,120}$/u.test(remainder)) return remainder;
        }
        return text;
    }

    function stripCrossSourceStationTail(value) {
        const text = stripLeadingStationBranding(value);
        // A final RADIO/FM signature followed by a broadcast-band frequency is
        // intrinsically station branding. Include the adjacent uppercase name
        // (SHOOK RADIO 104.4), rather than leaving that name in the song title.
        // Requiring both the radio marker and a valid FM frequency prevents
        // ordinary title phrases containing the word "radio" from being cut.
        const stationSignature = text.match(/\s+(?:[\p{Lu}\p{N}][\p{Lu}\p{N}&'.-]{1,})\s+(?:RADIO|Radio|radio|FM|Fm|fm)\s+(?:8[7-9]|9\d|10[0-8])(?:[.,]\d)?(?:\s*(?:MHZ|MHz|mhz))?\b/u);
        if (stationSignature) {
            return stripLearnedStationTail(text.slice(0, stationSignature.index).trim());
        }
        const rtWords = normalizedComparisonWords(text);
        const psWords = normalizedComparisonWords(`${observedPsHistory.join(' ')} ${lastObservedPsText}`);
        if (rtWords.length < 3 || psWords.length < 1) return stripLearnedStationTail(text);

        // Remove only a suffix also present contiguously in the live PS and
        // carrying station evidence. This avoids treating an ordinary shared
        // song word as branding while handling "TITLE STATION RADIO 104.4".
        const maximum = Math.min(rtWords.length - 1, psWords.length, 12);
        for (let length = maximum; length >= 1; length -= 1) {
            const tail = rtWords.slice(-length);
            if (!hasStationIdentity(tail)) continue;
            const tailKey = tail.join(' ');
            let appearsInPs = false;
            for (let start = 0; start <= psWords.length - length; start += 1) {
                if (psWords.slice(start, start + length).join(' ') === tailKey) {
                    appearsInPs = true;
                    break;
                }
            }
            if (!appearsInPs) continue;
            const originalWords = text.split(/\s+/);
            return stripLearnedStationTail(originalWords.slice(0, -length).join(' '));
        }
        return stripLearnedStationTail(text);
    }

    function looksLikeNoise(text) {
        if (!text || text.length < 3 || text.length > 180) return true;
        if (/https?:\/\/|www\.|@|\b(?:tel|phone|sms|whatsapp|facebook|instagram|website)\b/i.test(text)) return true;
        if ((text.match(/\d/g) || []).length >= 6) return true;
        return false;
    }

    function stripTitleQualifier(value) {
        let title = cleanText(value);
        // Search the canonical title. Version labels can be useful on screen but
        // commonly reduce artwork lookup accuracy and are not part of the title.
        let previous;
        do {
            previous = title;
            title = title.replace(/\s*[\(\[][^[\]()]*[\)\]]\s*$/u, '').trim();
        } while (title !== previous);
        return title;
    }

    function normalizeGreeklishTitle(value) {
        return stripTitleQualifier(value)
            .replace(/8/g, 'TH')
            .replace(/\bPOLU\b/gi, match => match.slice(0, -1) + (match.endsWith('U') ? 'Y' : 'y'))
            .replace(/^I(?=\s+Mera\b)/i, 'H')
            .replace(/'\s+/g, "'");
    }

    function normalizeGreeklishArtist(value) {
        return cleanText(value).replace(/8/g, 'TH').split(/\s+/).map(word => word
            .replace(/OY$/i, match => match[0] === 'O' ? 'OU' : 'ou')
            .replace(/H$/i, match => match === 'H' ? 'I' : 'i')
        ).join(' ');
    }

    function greeklishOmegaTitleVariant(value) {
        const title = normalizeGreeklishTitle(value);
        // Final W is the common Greeklish spelling of omega (PSAXNW, VRW).
        // Require two such words or another strong Greeklish letter-pattern;
        // this keeps English HOW/NOW/SHOW and genuine internal W unchanged.
        const omegaWords = title.split(/\s+/).filter(word => /W\b/i.test(word));
        const strongGreeklishSignal = omegaWords.length >= 2 ||
            omegaWords.some(word => /(?:PS|TS|TZ|GK|MP|NT|[XV])/.test(word.toUpperCase()));
        if (!strongGreeklishSignal) return title;
        return title.replace(/W\b/gi, match => match === 'W' ? 'O' : 'o');
    }

    function greeklishOmegaArtistVariant(value) {
        // This broader OY -> OU form is emitted only when the accompanying
        // title has already supplied the strong final-W Greeklish signal.
        return cleanText(value).replace(/8/g, 'TH')
            .replace(/OY/gi, match => match === 'OY' ? 'OU' : 'ou')
            .replace(/H\b/gi, match => match === 'H' ? 'I' : 'i');
    }

    function metadataFields(raw) {
        const text = String(raw || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
        const labelPattern = /\b(NOW\s*PLAYING|NOW\s*ON\s*AIR|CURRENTLY\s*PLAYING|ON\s*AIR|ARTIST|PERFORMING|PERFORMER|KÜNSTLER|KUENSTLER|INTERPRET|INTERPRÈTE|ARTISTE|ARTISTA|CANTANTE|BY|VON|PAR|POR|SONG|TITLE|TRACK|TITEL|TITRE|TÍTULO|TITULO|TITOLO|CANCIÓN|CANCION|CANZONE|WITH|MIT|AVEC|CON|COM|FROM)\s*:\s*/igu;
        const labels = [...text.matchAll(labelPattern)];
        const fields = {};
        labels.forEach((match, index) => {
            const label = match[1].toUpperCase().replace(/\s+/g, ' ');
            const start = match.index + match[0].length;
            const end = index + 1 < labels.length ? labels[index + 1].index : text.length;
            const value = cleanText(text.slice(start, end));
            if (value) fields[label] = value;
        });
        const artist = fields.ARTIST || fields.PERFORMING || fields.PERFORMER || fields.KÜNSTLER || fields.KUENSTLER ||
            fields.INTERPRET || fields.INTERPRÈTE || fields.ARTISTE || fields.ARTISTA || fields.CANTANTE ||
            fields.BY || fields.VON || fields.PAR || fields.POR || '';
        const title = fields.TITLE || fields.SONG || fields.TRACK || fields.TITEL || fields.TITRE || fields.TÍTULO ||
            fields.TITULO || fields.TITOLO || fields.CANCIÓN || fields.CANCION || fields.CANZONE ||
            fields.WITH || fields.MIT || fields.AVEC || fields.CON || fields.COM || '';
        return { artist, title, fields };
    }

    function rankCandidates(list) {
        return list.map((item, index) => ({ ...item, _index: index }))
            .sort((a, b) => (b.confidence - a.confidence) || (a._index - b._index))
            .map(({ _index, ...item }) => item);
    }

    function addCandidate(list, artist, title, confidence = 50, evidence = 'generic') {
        artist = cleanText(artist); title = stripTitleQualifier(title);
        if (looksLikeNoise(title) || (artist && looksLikeNoise(artist))) return;
        // A trailing PS hyphen explicitly says that the word/title continues
        // on the next screen; never send that incomplete candidate upstream.
        if (/[-–—]\s*$/.test(title)) return;
        if (artist.length > 100 || title.length > 120) return;
        const normalizedTitle = normalizeGreeklishTitle(title);
        const omegaTitle = greeklishOmegaTitleVariant(title);
        const hasOmegaVariant = omegaTitle !== normalizedTitle;
        const variants = hasOmegaVariant
            ? [
                { artist: greeklishOmegaArtistVariant(artist), title: omegaTitle, penalty: 0, suffix: 'Greeklish W/OY normalization' },
                { artist, title: normalizedTitle, penalty: 1, suffix: 'original Greeklish fallback' },
                { artist, title, penalty: 2, suffix: 'raw fallback' }
            ]
            : [
                { artist, title: normalizedTitle, penalty: 0, suffix: '' },
                { artist, title, penalty: 1, suffix: '' }
            ];
        variants.forEach(variant => {
            const variantConfidence = confidence - variant.penalty;
            const key = `${variant.artist.toLowerCase()}|||${variant.title.toLowerCase()}`;
            const existing = list.find(item => item.key === key);
            if (existing) {
                if (variantConfidence > existing.confidence) {
                    existing.confidence = variantConfidence;
                    existing.evidence = variant.suffix ? `${evidence}; ${variant.suffix}` : evidence;
                }
                return;
            }
            list.push({
                artist: variant.artist, title: variant.title, key, confidence: variantConfidence,
                evidence: variant.suffix ? `${evidence}; ${variant.suffix}` : evidence
            });
        });
    }

    function addRtTitleFirstCandidate(list, title, artist, confidence = 72, evidence = 'title-first RT') {
        const receivedTitle = title.trim();
        const canonicalGreeklishTitle = normalizeGreeklishTitle(receivedTitle);
        addCandidate(list, artist, canonicalGreeklishTitle, confidence, evidence);
        if (canonicalGreeklishTitle !== receivedTitle) addCandidate(list, artist, receivedTitle, confidence - 4, `${evidence} fallback`);
    }

    function rtLeftLooksLikeTitle(left, right) {
        return /^(?:ta|to|ton|tin|tis|h|o|i|oi|ena|enas|mia|mias|de|den|ti|pou|san)\b/i.test(left.trim()) &&
            right.trim().split(/\s+/).length <= 6;
    }

    function parseCandidates(raw, source, skipStationCleanup = false) {
        let text = cleanText(raw);
        if (source === 'rt' && !skipStationCleanup) text = stripCrossSourceStationTail(text);
        const candidates = [];
        if (looksLikeNoise(text)) return candidates;
        const profileOrder = effectiveProfileOrder();
        const explicit = metadataFields(raw);
        if (explicit.artist && explicit.title) {
            addCandidate(candidates, explicit.artist, explicit.title, 98, 'labeled metadata');
            return rankCandidates(candidates).slice(0, 10);
        }

        // ERT's Deftero Programma uses Title-Artist. The bullet is not always
        // present in the final RT value, so also recognize a longer title on
        // the left and a comma-separated artist credit on the right.
        if (source === 'rt') {
            const deftero = text.match(/(?:^|\s)•\s*(.{2,}?)\s*[-–—]\s*(.{2,})$/u);
            const unmarkedDeftero = text.match(/^(.{2,}?)\s+[-–—]\s+(.{2,})$/u);
            const reverseMatch = deftero || (unmarkedDeftero && unmarkedDeftero[2].includes(',') &&
                unmarkedDeftero[1].split(/\s+/).length > unmarkedDeftero[2].split(/\s+/).length
                ? unmarkedDeftero : null);
            if (reverseMatch) {
                addRtTitleFirstCandidate(candidates, reverseMatch[1], reverseMatch[2], 92, 'recognized title-first RT');
            }
        }

        let match = text.match(/artist\s*[:=]\s*(.+?)\s+(?:title|track|song)\s*[:=]\s*(.+)/i);
        if (match) addCandidate(candidates, match[1], match[2], 96, 'ARTIST/TITLE labels');
        match = text.match(/(?:title|track|song)\s*[:=]\s*(.+?)\s+artist\s*[:=]\s*(.+)/i);
        if (match) addCandidate(candidates, match[2], match[1], 96, 'TITLE/ARTIST labels');
        match = text.match(/\bwith\s*:\s*(.+?)\s+by\s*:\s*(.+)$/i);
        if (match) addCandidate(candidates, match[2], match[1], 96, 'WITH/BY labels');

        const segments = [text];
        text.split(/\s*[|•]+\s*/).forEach(segment => { if (segment && !segments.includes(segment)) segments.push(segment); });
        segments.forEach(segment => {
            const prefix = segment.match(/^[^:]{1,20}:\s*(.+)$/);
            if (prefix) segment = prefix[1];
            const separators = /\s+(?:-|–|—|~|\/|::|»|>)\s+|\s+(?:by|von|par|por)\s+/ig;
            let separator;
            while ((separator = separators.exec(segment)) !== null) {
                const left = segment.slice(0, separator.index);
                const right = segment.slice(separator.index + separator[0].length);
                if (/\s+(?:by|von|par|por)\s+/i.test(separator[0])) {
                    addCandidate(candidates, right, left, 90, 'localized title-by-artist');
                } else if (source === 'rt') {
                    // RT conventions differ by station. Prefer Title-Artist for
                    // recognizable Greeklish title openings, but always retain
                    // both directions so an ambiguous format can still match.
                    const forceTitleFirst = profileOrder === 'title-artist';
                    const forceArtistFirst = profileOrder === 'artist-title';
                    if (forceTitleFirst || (!forceArtistFirst && rtLeftLooksLikeTitle(left, right))) {
                        addRtTitleFirstCandidate(candidates, left, right, forceTitleFirst ? 90 : 84, 'preferred title-first RT');
                        addCandidate(candidates, left, right, 45, 'opposite RT fallback');
                    } else {
                        addCandidate(candidates, left, right, forceArtistFirst ? 88 : 70, 'artist-title RT');
                        addRtTitleFirstCandidate(candidates, left, right, 42, 'opposite RT fallback');
                    }
                } else {
                    addCandidate(candidates, left, right, 70, 'separator');
                }
            }
            const compactDash = segment.match(/^(.{2,80}?)[-–—](.{2,100})$/);
            if (compactDash) {
                const forceTitleFirst = profileOrder === 'title-artist';
                const forceArtistFirst = profileOrder === 'artist-title';
                if (source === 'rt' && (forceTitleFirst || (!forceArtistFirst && rtLeftLooksLikeTitle(compactDash[1], compactDash[2])))) {
                    addRtTitleFirstCandidate(candidates, compactDash[1], compactDash[2], forceTitleFirst ? 88 : 82, 'preferred compact title-first RT');
                    addCandidate(candidates, compactDash[1], compactDash[2], 42, 'opposite compact fallback');
                } else {
                    addCandidate(candidates, compactDash[1], compactDash[2], forceArtistFirst ? 85 : 65, 'compact separator');
                    if (source === 'rt') addRtTitleFirstCandidate(candidates, compactDash[1], compactDash[2], 40, 'opposite compact fallback');
                }
            }
        });

        return rankCandidates(candidates).slice(0, 10);
    }

    function conservativeRtCleanup(raw) {
        const text = stripLeadingStationBranding(raw);
        // Keep the possible station-name word before RADIO/FM as a fallback,
        // but discard the unambiguous marker, frequency and trailing slogan.
        return text.replace(/\s+(?:RADIO|FM)\s+(?:8[7-9]|9\d|10[0-8])(?:[.,]\d)?(?:\s*MHZ)?\b.*$/iu, '').trim();
    }

    function automaticRtCandidates(raw) {
        const variants = [
            { text: cleanText(raw), cleanup: true, penalty: 0, label: 'fully cleaned RT' },
            { text: conservativeRtCleanup(raw), cleanup: false, penalty: 6, label: 'conservative RT fallback' },
            { text: cleanText(raw), cleanup: false, penalty: 22, label: 'raw RT fallback' }
        ];
        const combined = [];
        variants.forEach(variant => {
            if (!variant.text) return;
            parseCandidates(variant.text, 'rt', !variant.cleanup).forEach(candidate => {
                const strongCleanStructure = variant.penalty === 0 &&
                    !/opposite|fallback/i.test(candidate.evidence) &&
                    /artist-title|recognized title-first|preferred title-first|labels/i.test(candidate.evidence);
                const adjusted = {
                    ...candidate,
                    confidence: strongCleanStructure
                        ? Math.max(80, candidate.confidence)
                        : Math.max(1, candidate.confidence - variant.penalty),
                    evidence: `${candidate.evidence}; ${variant.label}`
                };
                const existing = combined.find(item => item.key === adjusted.key);
                if (!existing) combined.push(adjusted);
                else if (adjusted.confidence > existing.confidence) Object.assign(existing, adjusted);
            });
        });
        return rankCandidates(combined).slice(0, 18);
    }

    function providersValue() {
        const providers = [];
        if (settings.useITunes) providers.push('itunes');
        if (settings.useDeezer) providers.push('deezer');
        if (settings.useMusicBrainz) providers.push('musicbrainz');
        if (settings.useTheAudioDB) providers.push('theaudiodb');
        return providers.join(',');
    }

    function readArtworkCache(cacheKey) {
        if (Object.prototype.hasOwnProperty.call(localCache, cacheKey)) return localCache[cacheKey];
        if (!settings.persistentCache) return null;
        const entry = persistentCache[cacheKey];
        if (!entry) return null;
        const ttl = entry.result?.found ? CACHE_TTL : NEGATIVE_CACHE_TTL;
        if (Date.now() - entry.at > ttl) {
            delete persistentCache[cacheKey];
            return null;
        }
        localCache[cacheKey] = entry.result;
        pruneArtworkCache();
        return entry.result;
    }

    function cacheLimitValue() {
        const value = Number(settings.cacheLimit);
        return [25, 50, 100, 250, 500].includes(value) ? value : DEFAULT_CACHE_LIMIT;
    }

    function pruneArtworkCache() {
        const limit = cacheLimitValue();
        const persistentKeys = Object.keys(persistentCache)
            .sort((a, b) => Number(persistentCache[b]?.at || 0) - Number(persistentCache[a]?.at || 0));
        persistentKeys.slice(limit).forEach(key => delete persistentCache[key]);
        const localKeys = Object.keys(localCache);
        localKeys.slice(0, Math.max(0, localKeys.length - limit)).forEach(key => delete localCache[key]);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(persistentCache)); } catch (error) { /* quota/private mode */ }
    }

    function writeArtworkCache(cacheKey, result) {
        localCache[cacheKey] = result;
        if (settings.persistentCache) persistentCache[cacheKey] = { at: Date.now(), result };
        pruneArtworkCache();
    }

    async function requestCandidate(candidate, source, signal, forceRefresh = false) {
        const cacheKey = `${source}|${providersValue()}|${candidate.key}`;
        const cached = readArtworkCache(cacheKey);
        if (cached && (cached.found || !forceRefresh)) return cached;
        if (cached && forceRefresh) {
            delete localCache[cacheKey];
            delete persistentCache[cacheKey];
        }
        const params = new URLSearchParams({
            artist: candidate.artist, title: candidate.title, source,
            providers: providersValue(), debug: settings.debugLogging ? '1' : '0',
            force: forceRefresh ? '1' : '0'
        });
        try {
            const response = await fetch(`/radiotext-coverart/get?${params}`, { signal });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            writeArtworkCache(cacheKey, result);
            return result;
        } catch (error) {
            if (error.name === 'AbortError') return null;
            debugLog('[RadioText Cover Art] Artwork request failed:', error.message);
            return { found: false };
        }
    }

    function verificationSimilarity(left, right) {
        const normalize = value => cleanText(value).toLocaleLowerCase()
            .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
            .replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        const a = normalize(left); const b = normalize(right);
        if (!a || !b) return 0;
        if (a === b) return 1;
        if (a.includes(b) || b.includes(a)) return .82;
        const aTokens = new Set(a.split(' ').filter(word => word.length > 1));
        const bTokens = new Set(b.split(' ').filter(word => word.length > 1));
        let common = 0;
        bTokens.forEach(word => { if (aTokens.has(word)) common += 1; });
        return common / Math.max(aTokens.size, bTokens.size, 1);
    }

    async function verifyDisplayedRtMatch(candidate, initialResult, requestId) {
        const automaticOrder = (stationProfile(false)?.order || 'auto') === 'auto';
        if (!automaticOrder || !settings.useITunes || !settings.useMusicBrainz) return;
        const initialProvider = String(initialResult.provider || '').toLowerCase();
        const alternativeProvider = initialProvider.includes('itunes') ? 'musicbrainz' : 'itunes';
        const params = new URLSearchParams({
            artist: candidate.artist, title: candidate.title, source: 'rt',
            providers: alternativeProvider, debug: settings.debugLogging ? '1' : '0'
        });
        try {
            const response = await fetch(`/radiotext-coverart/get?${params}`);
            if (!response.ok || requestIds.rt !== requestId || currentSongKey !== candidate.key) return;
            const alternative = await response.json();
            if (!alternative?.found || requestIds.rt !== requestId || currentSongKey !== candidate.key) return;
            const initialArtistScore = verificationSimilarity(initialResult.artistName || candidate.artist, candidate.artist);
            const alternativeArtistScore = verificationSimilarity(alternative.artistName || candidate.artist, candidate.artist);
            const alternativeTitleScore = verificationSimilarity(alternative.trackName || candidate.title, candidate.title);
            const initialConfidence = Number(initialResult.confidence) || 0;
            const alternativeConfidence = Number(alternative.confidence) || 0;
            const clearlyBetterArtist = alternativeArtistScore >= initialArtistScore + .12 && alternativeTitleScore >= .70;
            const clearlyBetterOverall = alternativeConfidence >= initialConfidence + .10 &&
                alternativeArtistScore >= initialArtistScore && alternativeTitleScore >= .70;
            if (clearlyBetterArtist || clearlyBetterOverall) {
                const artist = alternative.artistName || candidate.artist;
                const title = alternative.trackName || candidate.title;
                showArt(alternative.artwork, `${artist} — ${title}`, true, alternative);
                addSongHistory(alternative, artist, title);
                debugLog('[RadioText Cover Art] Background verification replaced artwork:', {
                    initial: `${initialResult.artistName || candidate.artist} — ${initialResult.trackName || candidate.title}`,
                    verified: `${artist} — ${title}`,
                    provider: alternative.provider || alternativeProvider
                });
            } else {
                debugLog('[RadioText Cover Art] Background verification retained initial artwork:', {
                    initialProvider: initialResult.provider || 'unknown',
                    verifyingProvider: alternative.provider || alternativeProvider
                });
            }
        } catch (error) {
            debugLog('[RadioText Cover Art] Background verification failed:', error.message);
        }
    }

    async function lookupCandidates(candidates, source, forceRefresh = false) {
        candidates = rankCandidates(candidates).filter(candidate => candidate.confidence >= settings.minConfidence);
        if (!rdsPresent || !candidates.length || !providersValue()) return;
        clearTimeout(retryTimers[source]);
        retryTimers[source] = null;
        const requestId = ++requestIds[source];
        requestControllers[source]?.abort();
        const controller = new AbortController();
        requestControllers[source] = controller;
        setStatus(`Searching ${source.toUpperCase()} artwork…`);
        for (const candidate of candidates) {
            const result = await requestCandidate(candidate, source, controller.signal, forceRefresh);
            if (requestId !== requestIds[source]) return;
            if (!result && controller.signal.aborted) return;
            if (!result || !result.found) continue;
            if (source === 'ps' && currentSource === 'rt' && Date.now() - lastValidRtAt < settings.rtPriorityMs) return;
            currentSongKey = candidate.key; currentSource = source;
            if (source === 'rt') {
                lastValidRtAt = Date.now();
                requestControllers.ps?.abort();
                requestControllers.ps = null;
                requestIds.ps += 1;
                clearTimeout(retryTimers.ps);
                retryTimers.ps = null;
            }
            const artist = result.artistName || candidate.artist;
            const title = result.trackName || candidate.title;
            showArt(result.artwork, `${artist} — ${title}`, true, result);
            addSongHistory(result, artist, title);
            if (source === 'rt') void verifyDisplayedRtMatch(candidate, result, requestId);
            setStatus('');
            clearTimeout(retryTimers[source]);
            retryTimers[source] = null;
            learnProfileFromMatch(candidate, source);
            if (source === 'ps') learnStationIdentifiersFromMatch(candidate);
            if (source === 'rt') {
                debugLog('[RadioText Cover Art] RT artwork match:', {
                    requested: `${candidate.artist} — ${candidate.title}`,
                    matched: `${result.artistName || candidate.artist} — ${result.trackName || candidate.title}`,
                    provider: result.provider || 'unknown'
                });
            }
            requestControllers[source] = null;
            return;
        }
        if (source === 'rt') {
            debugLog('[RadioText Cover Art] RT lookup returned no artwork for:',
                candidates.map(item => `${item.artist} — ${item.title}`));
        }
        setStatus('No artwork found');
        setTimeout(() => {
            if ($('#rt-coverart-container .rt-coverart-status').text() === 'No artwork found') setStatus('');
        }, 3000);
        applyIdleBehaviour(false, source);
        requestControllers[source] = null;
        const retrySeconds = Number(settings.noArtworkRetrySeconds) || 0;
        if (retrySeconds > 0) {
            const failedRequestId = requestId;
            clearTimeout(retryTimers[source]);
            retryTimers[source] = setTimeout(() => {
                retryTimers[source] = null;
                if (requestIds[source] !== failedRequestId) return;
                lookupCandidates(candidates, source, true);
            }, retrySeconds * 1000);
        }
    }

    function processChannel(channelName, rawText) {
        if (settings.enabled === false || settings.songSource === 'ps') return;
        const channel = channels[channelName];
        const normalized = cleanText(rawText);
        if (normalized === channel.lastText) return;
        // Invalidate the previous lookup and its background verification as
        // soon as new RT arrives, not only after the stability delay expires.
        requestIds.rt += 1;
        requestControllers.rt?.abort();
        requestControllers.rt = null;
        clearTimeout(retryTimers.rt);
        retryTimers.rt = null;
        channel.lastText = normalized; clearTimeout(channel.timer);
        setStatus('Waiting RT…');
        debugLog(`[RadioText Cover Art] ${channelName.toUpperCase()} received:`, {
            raw: String(rawText ?? ''),
            rawEscaped: JSON.stringify(String(rawText ?? '')).replace(/\u00a0/gi, '\\u00A0'),
            normalized
        });
        channel.timer = setTimeout(() => {
            if (settings.enabled === false || settings.songSource === 'ps') return;
            const automaticOrder = (stationProfile(false)?.order || 'auto') === 'auto';
            const candidates = automaticOrder
                ? automaticRtCandidates(normalized)
                : parseCandidates(normalized, 'rt');
            debugLog(`[RadioText Cover Art] ${channelName.toUpperCase()} candidates:`,
                candidates.length
                    ? candidates.map(item => `${item.artist} — ${item.title}`)
                    : '[none]');
            if (candidates.length) lookupCandidates(candidates, 'rt');
            else if (channelName === activeRtChannel) {
                // Informational RT is not evidence that the song ended. Keep a
                // verified cover until a new plausible song has actually been
                // searched and found (or the station changes).
                if (!currentArtworkUrl) applyIdleBehaviour(false, 'rt');
                setStatus('');
            }
        }, settings.stableDelay);
    }

    function psNowPlayingPayload(buffer) {
        const marker = /\b(?:now\s*playing|now\s*on\s*air|currently\s*playing|on\s*air)\s*[:：\-–—]?\s*/ig;
        const matches = [...buffer.matchAll(marker)];
        if (!matches.length) return '';
        const last = matches[matches.length - 1];
        return buffer.slice(last.index + last[0].length).trim();
    }

    function joinPsWords(words) {
        let output = '';
        let previousWord = '';
        words.forEach(rawWord => {
            let word = cleanText(rawWord).replace(/^[-\s]+(?=\w)/, '').trim();
            if (!word) return;
            // Progressive/scrolling PS can overlap adjacent states:
            // GIORGOS | GOS - TI -> GIORGOS - TI.
            const previousTail = (previousWord.match(/([\p{L}\p{N}]+)$/u) || [])[1] || '';
            const currentHead = (word.match(/^([\p{L}\p{N}]+)/u) || [])[1] || '';
            let overlap = Math.min(previousTail.length, currentHead.length);
            while (overlap >= 3 &&
                previousTail.slice(-overlap).toLocaleLowerCase() !== currentHead.slice(0, overlap).toLocaleLowerCase()) {
                overlap -= 1;
            }
            if (overlap >= 3) word = word.slice(overlap).trimStart();
            if (!word) return;
            // A trailing hyphen at the exact end of an 8-character frame is a
            // split word (ALLEL- | UIA), not the artist/title separator.
            if (/[\p{L}\p{N}]-$/u.test(output)) output = output.slice(0, -1) + word;
            // A full 8-letter frame followed by a very short alphabetic frame is
            // also one split word (CALIFORN | IA -> CALIFORNIA).
            else if (/^[\p{L}]{8}$/u.test(previousWord) && /^[\p{L}]{1,3}$/u.test(word)) output += word;
            // A continuation can occupy the start of the next frame and share
            // it with following words: LL OF TH | E NIGHT -> LL OF THE NIGHT.
            else if ([...previousWord].length === 8 && /^[\p{L}]{1,3}\s+.+/u.test(word)) {
                const continuation = word.match(/^([\p{L}]{1,3})(\s+.*)$/u);
                output += continuation[1] + continuation[2];
            }
            // The continuation may share its frame with the separator:
            // WHITESNA | KE - STI -> WHITESNAKE - STI.
            else if (/^[\p{L}]{8}$/u.test(previousWord) && /^[\p{L}]{1,3}\s+[-–—]\s+/u.test(word)) {
                const continuation = word.match(/^([\p{L}]{1,3})(\s+[-–—]\s+.*)$/u);
                output += continuation[1] + continuation[2];
                word = continuation[1];
            }
            else output += `${output ? ' ' : ''}${word}`;
            previousWord = word;
        });
        return cleanText(output);
    }

    function escapeRegExp(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function hasBalancedTitleDelimiters(value) {
        const pairs = [['(', ')'], ['[', ']'], ['{', '}']];
        return pairs.every(([open, close]) => {
            let depth = 0;
            for (const character of value) {
                if (character === open) depth += 1;
                if (character === close) depth -= 1;
                if (depth < 0) return false;
            }
            return depth === 0;
        });
    }

    function extractQuotedPsTitle(rawJoined) {
        const pieces = [...rawJoined.matchAll(/["“]([^"“”]{2,})["”]/g)]
            .map(match => match[1]);
        if (!pieces.length) return '';
        // Some stations quote every 8-character screen separately. Joining the
        // pieces preserves the PS boundary rule: "O A-" | "LLOS MO-" |
        // "Y EAYTOS" -> "O ALLOS MOY EAYTOS".
        return joinPsWords(pieces)
            .replace(/([\p{L}\p{N}])-\s+([\p{L}\p{N}])/gu, '$1$2');
    }

    function cleanPsToken(frame) {
        return cleanText(frame)
            // Markers are frequently split as NOW ON | AIR: ARTIST.
            .replace(/\b(?:NOW\s+PLAYING|NOW\s+ON\s+AIR|CURRENTLY\s+PLAYING|ON\s+AIR|AIR)\s*:\s*/ig, ' ')
            .replace(/^(?:NOW\s+ON|ON\s+AIR|NOW\s+PLAYING|PLAYING)\s*:?\s*$/i, '')
            .replace(/\s+/g, ' ').trim();
    }

    function normalizedStationToken(value) {
        return cleanText(value).toLocaleUpperCase().replace(/[^\p{L}\p{N}.]+/gu, ' ').trim();
    }

    function isFrequencyToken(value) {
        return /^(?:8[7-9]|9\d|10[0-8])(?:[.,]\d)?(?:\s*(?:MHZ|FM))?$/i.test(cleanText(value));
    }

    function isLearnedStationToken(value) {
        const wanted = normalizedStationToken(value);
        return Boolean(wanted) && (stationProfile(false)?.stationTokens || [])
            .some(token => normalizedStationToken(token) === wanted);
    }

    function learnStationIdentifiers(frames) {
        const profile = stationProfile();
        const tokens = frames.map(cleanPsToken).filter(Boolean);
        const suggestions = new Map();
        tokens.forEach((token, index) => {
            const obvious = isFrequencyToken(token) || /\b(?:RADIO|FM)\s*\d*(?:[.,]\d+)?\b/i.test(token) ||
                /^[\p{L}]{2,12}\s*(?:8[7-9]|9\d|10[0-8])(?:[.,]\d+)?$/iu.test(token);
            if (!obvious) return;
            suggestions.set(normalizedStationToken(token), 1);
        });
        suggestions.forEach((threshold, token) => {
            if (!token || token.length < 2) return;
            profile.tokenCounts[token] = (profile.tokenCounts[token] || 0) + 1;
            if (profile.tokenCounts[token] >= threshold &&
                !profile.stationTokens.some(item => normalizedStationToken(item) === token)) {
                profile.stationTokens.push(token);
            }
        });
        if (suggestions.size) saveProfiles();
    }

    function learnStationIdentifiersFromMatch(candidate) {
        const profile = stationProfile();
        profile.tokenSongs = profile.tokenSongs || {};
        const metadataWords = new Set(normalizedStationToken(`${candidate.artist} ${candidate.title}`).split(' '));
        psAssembly.frames.map(cleanPsToken).filter(Boolean).forEach(frame => {
            const token = normalizedStationToken(frame);
            if (!token || /^[-–—]$/.test(token) || isFrequencyToken(token) ||
                /\b(?:ARTIST|TITLE|SONG|TRACK|WITH|BY|PERFORMING|FROM|NOW|AIR|PLAYING)\b/i.test(token)) return;
            const words = token.split(' ').filter(Boolean);
            if (words.some(word => metadataWords.has(word))) return;
            profile.tokenSongs[token] = profile.tokenSongs[token] || [];
            if (!profile.tokenSongs[token].includes(candidate.key)) profile.tokenSongs[token].push(candidate.key);
            profile.tokenSongs[token] = profile.tokenSongs[token].slice(-4);
            if (profile.tokenSongs[token].length >= 2 &&
                !profile.stationTokens.some(item => normalizedStationToken(item) === token)) {
                profile.stationTokens.push(token);
            }
        });
        saveProfiles();
    }

    function stripLearnedStationTail(value) {
        let result = cleanText(value);
        (stationProfile(false)?.stationTokens || []).forEach(token => {
            const cleanToken = cleanText(token);
            if (!cleanToken) return;
            result = result.replace(new RegExp(`\\s+${escapeRegExp(cleanToken)}(?:\\s|$).*`, 'i'), '').trim();
        });
        return result;
    }

    function psFrameCandidates(frames) {
        learnStationIdentifiers(frames);
        const rawJoined = frames.map(frame => (frame || '').replace(/_+/g, ' ')).join(' ');
        // Inside a quoted title, a hyphen at an 8-character PS boundary is a
        // split word, not punctuation: "LOGARI- | ASMOS" -> "LOGARIASMOS".
        const quotedTitle = extractQuotedPsTitle(rawJoined);
        const markerOnly = /^(?:now|playing|now\s*playing|now\s*on|now\s*on\s*air|air|on\s*air|currently\s*playing)\s*:?$/i;
        const tokens = frames.map(frame => cleanPsToken(frame)).filter(token =>
            token && !markerOnly.test(token) && (!isLearnedStationToken(token) || isFrequencyToken(token))
        );
        const candidates = [];

        // Joining with spaces supports metadata labels split across PS screens.
        const structuredText = joinPsWords(tokens);
        const labeled = metadataFields(structuredText);
        if (labeled.artist && labeled.title) {
            addCandidate(candidates, normalizeGreeklishArtist(labeled.artist), labeled.title, 100, 'structured PS labels');
            addCandidate(candidates, labeled.artist, labeled.title, 98, 'structured PS labels');
        }
        let separatorIndex = -1;
        let artistInSeparator = '';
        let titleInSeparator = '';
        tokens.some((token, index) => {
            const startsWithDash = token.match(/^[-–—]\s*(.*)$/);
            if (startsWithDash) {
                separatorIndex = index;
                titleInSeparator = startsWithDash[1].trim();
                return true;
            }
            const endsWithDash = token.match(/^(.*?)\s+[-–—]\s*(.*)$/);
            if (endsWithDash && endsWithDash[1].trim()) {
                separatorIndex = index;
                artistInSeparator = endsWithDash[1].trim();
                titleInSeparator = endsWithDash[2].trim();
                return true;
            }
            return false;
        });
        if (separatorIndex < 1) return candidates;

        const left = tokens.slice(0, separatorIndex);
        if (artistInSeparator) left.push(artistInSeparator);
        const right = [];
        if (quotedTitle) {
            right.push(quotedTitle);
        } else {
            if (titleInSeparator) right.push(titleInSeparator);
            right.push(...tokens.slice(separatorIndex + 1));
        }
        if (!right.length) return candidates;

        // A frequency marks the end of station identification. Without one, use
        // suffix variants so a station callsign never becomes mandatory.
        let frequencyIndex = -1;
        let frequencyCount = 0;
        left.forEach((token, index) => {
            if (/^(?:8[7-9]|9\d|10[0-8])(?:[.,]\d)?(?:\s*mhz)?$/i.test(token)) {
                frequencyIndex = index;
                frequencyCount += 1;
            }
        });
        const possibleArtist = left.slice(frequencyIndex + 1);
        const lengths = [];
        // The last part of the artist can share the separator frame:
        // WHITESNA | KE - ... and KATERINA | RINA - .... Prefer both frames;
        // a one-frame artist such as EAGLES - naturally remains one frame.
        const precedingLooksLikeStation = possibleArtist.length >= 2 &&
            /^(?:RADIO\s*\d+|[\p{L}]{2,12}\s*(?:8[7-9]|9\d|10[0-8])(?:[.,]\d+)?)$/iu
                .test(possibleArtist[possibleArtist.length - 2]);
        if (artistInSeparator && precedingLooksLikeStation) {
            lengths.push(1);
        } else if (artistInSeparator && possibleArtist.length) {
            lengths.push(Math.min(2, possibleArtist.length));
        } else if (frequencyCount > 1 && possibleArtist.length) {
            lengths.push(possibleArtist.length);
        }
        [2, 1, 3, 4].forEach(length => {
            if (possibleArtist.length >= length && !lengths.includes(length)) lengths.push(length);
        });
        if (frequencyIndex >= 0 && possibleArtist.length && !lengths.includes(possibleArtist.length)) {
            lengths.push(possibleArtist.length);
        }

        lengths.forEach(length => {
            const artistWords = possibleArtist.slice(-length);
            const artist = joinPsWords(artistWords);
            if (!artist) return;
            let title = joinPsWords(right);
            if (titleInSeparator && [...cleanText(tokens[separatorIndex])].length === 8 && right.length >= 2 &&
                /^[\p{L}\p{N}]{1,3}(?:\s|$)/u.test(right[1])) {
                title = joinPsWords([`${titleInSeparator}-`, right[1], ...right.slice(2)]);
            }
            // Numeric radio identifiers mark the next station-ID/cycle, not
            // part of the song title: TRACK RADIO 1 -> TRACK.
            // Requiring a number avoids damaging legitimate titles containing
            // the ordinary word "radio".
            title = title.replace(
                /\s+(?:RADIO\s*\d+(?:[.,]\d+)?|[A-Z]{2,12}\s*(?:8[7-9]|9\d|10[0-8])(?:[.,]\d+)?|(?:8[7-9]|9\d|10[0-8])(?:[.,]\d+)?\s*FM)\b.*$/i,
                ''
            ).trim();
            title = stripLearnedStationTail(title);
            // Dynamic PS often starts the next cycle inside the 96-char window.
            // Cut BABY JANE ROD STEWART back to BABY JANE.
            const repeatedArtist = new RegExp(`\\s+${escapeRegExp(artist)}(?:\\s|$)`, 'i');
            const repeat = repeatedArtist.exec(title);
            if (repeat) title = title.slice(0, repeat.index).trim();
            if (!hasBalancedTitleDelimiters(title)) return;
            const rawSpacedArtist = cleanText(artistWords.join(' '));
            const preferRawSpacing = artistWords.length === 2 &&
                /^[\p{L}\p{N}]{4,}$/u.test(artistWords[1]) && rawSpacedArtist !== artist;
            const artistVariants = preferRawSpacing ? [rawSpacedArtist, artist] : [artist];
            if (artistInSeparator && artistWords.length === 2 &&
                /^[\p{L}\p{N}]{3,8}$/u.test(artistWords[0]) && /^[\p{L}\p{N}]{1,3}$/u.test(artistWords[1])) {
                artistVariants.unshift(cleanText(artistWords.join('')));
            }
            // A standalone separator makes the preceding frame boundary
            // reliable. Try an 8-character name fragment joined to the next
            // fragment: OIKONOMO | POULOS | - -> OIKONOMOPOULOS.
            if (!artistInSeparator && artistWords.length === 2 &&
                /^[\p{L}]{8}$/u.test(artistWords[0]) && /^[\p{L}]{2,8}$/u.test(artistWords[1])) {
                artistVariants.unshift(cleanText(artistWords.join('')));
            }
            if (artistWords.length >= 2) {
                const reversedArtist = joinPsWords([...artistWords].reverse());
                // Several Greek stations transmit surname first. Prefer the
                // natural Spotify order for common Greeklish surname endings,
                // while retaining both orders as fallback candidates.
                if (artistWords.length === 2 && /(?:HS|IS|I|OU)$/i.test(artistWords[0])) {
                    artistVariants.unshift(reversedArtist);
                } else {
                    artistVariants.push(reversedArtist);
                }
                artistVariants.push(joinPsWords([artistWords[artistWords.length - 1], ...artistWords.slice(0, -1)]));
            }
            artistVariants.forEach(variant => {
                const normalizedGreeklish = normalizeGreeklishArtist(variant);
                const baseConfidence = quotedTitle ? 92 :
                    (artistInSeparator || /^[-–—]/.test(tokens[separatorIndex]) ? 82 : 72);
                const evidence = quotedTitle ? 'quoted PS title' : 'PS separator';
                if (normalizedGreeklish !== variant) addCandidate(candidates, normalizedGreeklish, title, baseConfidence + 1, evidence);
                addCandidate(candidates, variant, title, baseConfidence, evidence);
            });
        });
        return rankCandidates(candidates);
    }

    function processAssembledPs(reason = 'scheduled') {
        const psMode = effectivePsMode();
        if (settings.enabled === false || settings.songSource === 'rt' || !settings.parsePs || psMode === 'disabled') return;
        const payload = psNowPlayingPayload(psAssembly.buffer);
        let candidates = psFrameCandidates(psAssembly.frames);
        if (payload) {
            parseCandidates(payload, 'ps').forEach(candidate => {
                if (!candidates.some(item => item.key === candidate.key)) candidates.push(candidate);
            });
        }
        candidates = rankCandidates(candidates);
        if (psMode === 'structured') candidates = candidates.filter(item => /metadata|labels/i.test(item.evidence));
        if (psMode === 'quoted') candidates = candidates.filter(item => /quoted/i.test(item.evidence));
        if (!candidates.length) {
            debugLog('[RadioText Cover Art] PS check produced no candidates:', {
                reason,
                acceptedFrames: psAssembly.frameCount,
                frames: [...psAssembly.frames]
            });
            // A partial/informational Dynamic-PS cycle must not replace an
            // already verified match with the station logo.
            if (!currentArtworkUrl) applyIdleBehaviour(false, 'ps');
            setStatus('');
            return;
        }
        const candidateKey = candidates.map(candidate => candidate.key).join('||');
        if (candidateKey === channels.ps.lastText) return;
        channels.ps.lastText = candidateKey;
        debugLog('[RadioText Cover Art] PS candidates:', candidates.map(item =>
            `${item.artist} — ${item.title} [${item.confidence}, ${item.evidence}]`));
        lookupCandidates(candidates.slice(0, 10), 'ps');
    }

    function processPsFrame(rawFrame, source = 'socket') {
        if (settings.enabled === false || settings.songSource === 'rt' || !rdsPresent) return;
        const now = Date.now();
        const observedPs = cleanText(rawFrame);
        if (observedPs) {
            lastObservedPsText = observedPs;
            if (observedPsHistory[observedPsHistory.length - 1] !== observedPs) {
                observedPsHistory.push(observedPs);
                observedPsHistory = observedPsHistory.slice(-24);
            }
        }
        if (source === 'aria') {
            lastPsAriaAt = now;
            if (!usingAriaPs) {
                usingAriaPs = true;
                channels.ps.lastText = null;
                resetPsAssembly();
            }
        }
        if (source === 'socket' && usingAriaPs && now - lastPsAriaAt < 3000) return;
        if (source === 'socket') lastPsSocketAt = now;
        // The DOM may contain display-only underscores and is updated from the
        // same WebSocket data. Use it solely as a fallback when raw PS has not
        // arrived recently, otherwise every frame would be counted twice.
        if (source === 'dom' && now - lastPsSocketAt < 2000) return;
        if (!settings.parsePs || effectivePsMode() === 'disabled') return;
        const frame = (rawFrame || '').replace(/[\x00-\x1F]/g, '').replace(/_/g, ' ');
        const frameKey = frame.replace(/\s+/g, ' ').trim();
        if (!frameKey || frameKey === psAssembly.lastFrame || frameKey === psAssembly.pendingKey) return;

        // librdsparser progressive mode exposes intermediate character-by-
        // character states. Accept a screen only after it remains unchanged;
        // repeated WebSocket packets do not restart this timer.
        clearTimeout(psAssembly.timer);
        psAssembly.pendingFrame = frame;
        psAssembly.pendingKey = frameKey;
        const stabilizationDelay = source === 'aria' ? 120 : 450;
        psAssembly.timer = setTimeout(() => commitStablePsFrame(frame, frameKey), stabilizationDelay);
    }

    function commitStablePsFrame(frame, frameKey) {
        if (frameKey !== psAssembly.pendingKey) return;
        psAssembly.pendingFrame = '';
        psAssembly.pendingKey = '';
        psAssembly.timer = null;
        if (!settings.parsePs || frameKey === psAssembly.lastFrame) return;
        const now = Date.now();
        const markerText = frameKey.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
        const isMarker = /^(?:(?:now|playing|now\s*playing|now\s*on|now\s*on\s*air|air|on\s*air|currently\s*playing)\s*:?$|(?:now\s*playing|now\s*on\s*air|on\s*air|air)\s*:)/i.test(markerText);

        // A playing marker is a stronger boundary than an arbitrary global
        // frame count. First flush the completed preceding cycle: short Dynamic
        // PS loops can return to NOW ON/AIR before reaching the 6-frame check.
        if (isMarker) {
            if (psAssembly.frames.length >= 2) processAssembledPs('marker boundary');
            resetPsAssembly(true);
        }

        // A long pause denotes a new dynamic-PS cycle.
        if (psAssembly.updatedAt && now - psAssembly.updatedAt > 15000) {
            resetPsAssembly();
        }

        if (!psAssembly.firstFrame) psAssembly.firstFrame = frameKey;
        // Keep exactly the latest twelve Dynamic-PS frames. Padding preserves the
        // original 8-character boundaries when the DOM trims trailing spaces.
        psAssembly.frames.push(frame.slice(0, 8).padEnd(8, ' '));
        if (psAssembly.frames.length > 12) psAssembly.frames.shift();
        psAssembly.buffer = psAssembly.frames.join('').slice(-96);

        psAssembly.lastFrame = frameKey; psAssembly.updatedAt = now;
        psAssembly.frameCount += 1;
        // Marker-led records can be evaluated after the marker plus seven content
        // frames. Unmarked PS remains on the safer twelve-frame window.
        const hasRecentRtResult = Date.now() - lastValidRtAt < settings.rtPriorityMs;
        // When RT has not yielded artwork, start after eight accepted screens.
        // With a recent RT result, retain the safer twelve-screen PS window.
        const firstCheck = psAssembly.markerActive ? 6 : (hasRecentRtResult ? 12 : 8);
        setStatus('Collecting PS…');
        const assembledFrames = psAssembly.frames.join(' ');
        // A closing quote is an explicit end-of-title marker. It is safe to
        // search immediately instead of waiting for the full 8/12-frame window.
        const completedQuotedTitle = extractQuotedPsTitle(assembledFrames);
        const completeQuotedRecord = /[-–—]\s*["“]/u.test(assembledFrames) &&
            completedQuotedTitle && !/-\s*$/.test(completedQuotedTitle);
        const structuredRecord = metadataFields(joinPsWords(psAssembly.frames.map(cleanPsToken)));
        const completeStructuredRecord = Boolean(structuredRecord.artist && structuredRecord.title);
        const scheduledCheck = psAssembly.frameCount >= firstCheck &&
            (psAssembly.frameCount - firstCheck) % 4 === 0;
        if (completeQuotedRecord || completeStructuredRecord || scheduledCheck) {
            const reason = completeStructuredRecord ? 'complete structured metadata' :
                (completeQuotedRecord ? 'complete quoted title' : 'scheduled window');
            processAssembledPs(reason);
        }
    }

    function handleParsedData(data) {
        let stationChanged = false;
        if (typeof data.freq !== 'undefined') {
            const frequency = normalizedFrequency(data.freq);
            if (frequency && lastFreq !== null && frequency !== lastFreq) {
                stationChanged = true;
                lastPi = null;
            }
            if (frequency) lastFreq = frequency;
        }
        const hasPiField = typeof data.pi !== 'undefined' || typeof data.rds?.pi !== 'undefined' ||
            typeof data.rdsPi !== 'undefined';
        const receivedPi = normalizedPi(data.pi ?? data.rds?.pi ?? data.rdsPi);
        if (receivedPi) {
            if (lastPi !== null && receivedPi !== lastPi) stationChanged = true;
            lastPi = receivedPi;
            rdsPresent = true;
        } else if (hasPiField && !rdsPresent) {
            // A blank/invalid PI does not establish RDS presence. Once a valid
            // PI has been decoded, keep that confirmation until retuning: weak
            // reception can interleave valid PI packets with transient 0000s.
            lastPi = null;
        }
        if (stationChanged) resetForNewStation();
        // A valid PI in the same packet belongs to the newly tuned station.
        if (receivedPi) {
            lastPi = receivedPi;
            rdsPresent = true;
        }
        if (!rdsPresent) {
            clearTimeout(channels.rt0.timer);
            clearTimeout(channels.rt1.timer);
            clearTimeout(psAssembly.timer);
            requestControllers.rt?.abort();
            requestControllers.ps?.abort();
            requestControllers.rt = null;
            requestControllers.ps = null;
            clearRetryTimers();
            setStatus('');
            scheduleAvailabilityMessage('No RDS detected', 'noRds', 1800);
            return;
        }
        if (availabilityMessageType === 'noRds') cancelAvailabilityMessage();
        const packetHasRtText = [data.rt0, data.rt1].some(value => Boolean(cleanText(value)));
        const packetHasPsText = typeof data.ps !== 'undefined' && Boolean(cleanText(data.ps));
        if (packetHasRtText || packetHasPsText) metadataPresent = true;
        if (!metadataPresent) {
            setStatus('');
            if (placeholderMessageType === 'noRds') setPlaceholderMessage(WAITING_TOOLTIP, 'waiting');
            scheduleAvailabilityMessage('No PS/RadioText detected', 'noMetadata', 1400);
            return;
        }
        cancelAvailabilityMessage();
        setPlaceholderMessage(WAITING_TOOLTIP, 'waiting');
        const liveIsRt0 = data.rt_flag === 0;
        activeRtChannel = liveIsRt0 ? 'rt0' : 'rt1';
        (liveIsRt0 ? ['rt1', 'rt0'] : ['rt0', 'rt1']).forEach(name => {
            if (typeof data[name] !== 'undefined' && cleanText(data[name])) processChannel(name, data[name]);
        });
        if (typeof data.ps !== 'undefined' && packetHasPsText) {
            const ariaPs = document.getElementById('data-ps')?.getAttribute('aria-label')?.trim();
            if (ariaPs) processPsFrame(ariaPs, 'aria');
            else processPsFrame(data.ps, 'socket');
        }
    }

    function observePs() {
        const target = document.getElementById('data-ps');
        if (!target || psObserver) return;
        const processDisplayedPs = () => {
            const ariaPs = target.getAttribute('aria-label')?.trim();
            if (ariaPs) processPsFrame(ariaPs, 'aria');
            else processPsFrame(target.textContent, 'dom');
        };
        psObserver = new MutationObserver(processDisplayedPs);
        psObserver.observe(target, {
            childList: true, characterData: true, subtree: true,
            attributes: true, attributeFilter: ['aria-label']
        });
        processDisplayedPs();
    }

    function attachSocketListener() {
        if (!window.socket) { setTimeout(attachSocketListener, 250); return; }
        if (socketListenerAttached) return;
        socketListenerAttached = true;
        window.socket.addEventListener('message', event => {
            if (!mainUiActive) return;
            if (event.data === 'KICK') return;
            let data;
            try { data = JSON.parse(event.data); } catch (error) { return; }
            if (['rt0', 'rt1', 'freq', 'ps', 'pi', 'rdsPi'].some(key => typeof data[key] !== 'undefined') ||
                typeof data.rds?.pi !== 'undefined') handleParsedData(data);
        });
    }

    function activateMainUi() {
        if (mainUiActive || !isMainUiAvailable()) return;
        mainUiActive = true;
        injectStyles(); createBox();
        $('#rt-coverart-container').css('display', '');
        if (!placeBox()) { setTimeout(placeBox, 500); setTimeout(placeBox, 1500); }
        observePs(); setTimeout(observePs, 1000);
        applyPanelBackdrop();
        attachSocketListener();
        applyEnabledSetting();
    }

    function deactivateMainUi() {
        if (!mainUiActive) return;
        mainUiActive = false;
        restoreLayout();
        resizeObserver?.disconnect();
        psObserver?.disconnect();
        resizeObserver = null;
        psObserver = null;
        cancelAvailabilityMessage();
        $('#rt-coverart-settings').removeClass('open');
        closeCoverLightbox();
        clearToDefault();
        lastFreq = null;
        lastPi = null;
        $('#rt-coverart-container').css('display', 'none');
        Object.values(backdropPanels()).forEach(panel => panel?.classList.remove('rtca-cover-backdrop'));
    }

    function syncMainUiPresence() {
        if (isMainUiAvailable()) activateMainUi();
        else deactivateMainUi();
    }

    async function init() {
        await loadSharedConfig();
        syncMainUiPresence();
        let presenceTimer = null;
        uiPresenceObserver = new MutationObserver(() => {
            const mainUiAvailable = isMainUiAvailable();
            if (mainUiAvailable === mainUiActive) {
                // VisualEQ may rebuild the desktop PS row after this plugin has
                // already docked. Re-dock only when the active PS host actually
                // changed, avoiding a MutationObserver/layout feedback loop.
                if (mainUiActive && settings.anchor === 'ps' &&
                    settings.placementMode === 'inside' && window.innerWidth > 768) {
                    const activeAnchor = activePsAnchor();
                    const box = document.getElementById('rt-coverart-container');
                    if (activeAnchor && box && box.parentElement !== activeAnchor) {
                        clearTimeout(presenceTimer);
                        presenceTimer = setTimeout(() => { placeBox(); applyEnabledSetting(); }, 60);
                    }
                }
                return;
            }
            clearTimeout(presenceTimer);
            presenceTimer = setTimeout(syncMainUiPresence, 60);
        });
        uiPresenceObserver.observe(document.body, { childList: true, subtree: true });
        $(window).on('resize', () => {
            if (!mainUiActive) return;
            const mobile = window.innerWidth <= 768;
            if (mobile !== lastMobileState) {
                lastMobileState = mobile;
                placeBox();
            } else {
                scheduleLayout();
            }
        });
        $(window).one('load', () => { if (mainUiActive) { placeBox(); scheduleLayout(); } });
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => { if (mainUiActive) { placeBox(); scheduleLayout(); } });
        }
        // Other webserver plugins finish injecting their panels after DOM ready.
        // Re-dock after those late layout passes so a refresh matches a settings save.
        setTimeout(() => { if (mainUiActive) { placeBox(); scheduleLayout(); } }, 1200);
        setTimeout(() => { if (mainUiActive) { placeBox(); scheduleLayout(); } }, 2500);
    }

    $(document).ready(init);
})();
