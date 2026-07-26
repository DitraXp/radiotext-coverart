/* global $ */
// RadioText Cover Art — front-end (v1.1)

(function () {

    // ---------------------------------------------------------------
    // Settings — feel free to tweak these
    // ---------------------------------------------------------------
    const CONFIG = {
        // How long (ms) a given RT buffer has to stay unchanged before we
        // try to look it up. Keeps us from reacting to every half-scrolled
        // character on stations that reveal RT one character at a time,
        // and keeps external API calls to a minimum.
        stableDelay: 2500,

        // Most stations format RadioText as "ARTIST - TITLE". Some do the
        // reverse ("TITLE - ARTIST"). Flip this if your station does that.
        swapArtistTitle: false,

        // Container size in pixels (desktop only). On phones it becomes a
        // full-width stacked panel automatically, like the other panels.
        boxSize: 100,

        // Picture shown when there's no song currently identified. Leave
        // as null to use the built-in placeholder, or point it at your
        // own image, e.g. '/images/my-default-cover.png' (drop the file
        // anywhere under the webserver's "web" folder first, then
        // reference it here with the path relative to "web").
        defaultImage: null
    };

    // ---------------------------------------------------------------
    const DEFAULT_IMAGE_SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>" +
        "<rect width='100' height='100' rx='14' fill='#2b2b2e'/>" +
        "<circle cx='50' cy='50' r='34' fill='none' stroke='#55555a' stroke-width='2'/>" +
        "<circle cx='50' cy='50' r='26' fill='none' stroke='#45454a' stroke-width='1.5'/>" +
        "<circle cx='50' cy='50' r='9' fill='#55555a'/>" +
        "<circle cx='50' cy='50' r='3' fill='#2b2b2e'/>" +
        "</svg>";
    const DEFAULT_IMAGE_URL = 'data:image/svg+xml,' + encodeURIComponent(DEFAULT_IMAGE_SVG);
    const WAITING_TOOLTIP = 'Waiting for song info…';

    const channels = {
        rt0: { lastText: null, timer: null },
        rt1: { lastText: null, timer: null }
    };

    let requestCounter = 0;
    let latestRequestId = 0;
    let currentSongKey = null;
    let currentSongChannel = null;
    let lastFreq = null;
    const localCache = {};

    function injectStyles() {
        const boxSize = CONFIG.boxSize;
        $('<style>')
            .prop('type', 'text/css')
            .html(`
                #rt-coverart-container {
                    background-color: var(--color-1-transparent);
                    border-radius: 15px;
                    margin-top: 20px;
                    margin-left: 10px;
                    margin-right: 10px;
                    display: flex;
                    overflow: hidden;
                    flex-shrink: 0;
                    transition: 0.3s ease background-color;
                }
                #rt-coverart-container:hover {
                    background-color: var(--color-2-transparent);
                }
                #rt-coverart-container img {
                    display: block;
                    object-fit: cover;
                    border-radius: 8px;
                    flex-shrink: 0;
                }
                @media only screen and (min-width: 769px) {
                    #rt-coverart-container {
                        width: ${boxSize}px;
                        min-width: ${boxSize}px;
                        height: 100px;
                        position: relative;
                        backdrop-filter: blur(5px);
                        padding: 8px;
                        box-sizing: border-box;
                    }
                    #rt-coverart-container img {
                        width: 100%;
                        height: 100%;
                    }
                    #rt-coverart-caption {
                        position: absolute;
                        inset: 8px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        text-align: center;
                        background-color: rgba(0, 0, 0, 0.72);
                        color: #fff;
                        border-radius: 8px;
                        padding: 6px;
                        font-size: 11px;
                        line-height: 1.3;
                        overflow: hidden;
                        opacity: 0;
                        pointer-events: none;
                        transition: 0.2s ease opacity;
                    }
                    #rt-coverart-container:hover #rt-coverart-caption {
                        opacity: 1;
                    }
                }
                @media only screen and (max-width: 768px) {
                    #rt-coverart-container {
                        width: 90%;
                        margin: auto;
                        margin-bottom: 20px;
                        min-height: 70px;
                        background-color: var(--color-1-transparent);
                        backdrop-filter: blur(5px);
                        padding: 8px;
                        box-sizing: border-box;
                        flex-direction: row;
                        align-items: center;
                        justify-content: flex-start;
                        order: 10;
                    }
                    #rt-coverart-container img {
                        width: 62px;
                        height: 62px;
                        min-width: 62px;
                    }
                    #rt-coverart-caption {
                        display: -webkit-box;
                        -webkit-box-orient: vertical;
                        -webkit-line-clamp: 3;
                        overflow: hidden;
                        opacity: 0.85;
                        margin-left: 12px;
                        text-align: left;
                        font-size: 13px;
                        line-height: 1.35;
                    }
                    #rt-container {
                        background-color: var(--color-1-transparent) !important;
                        backdrop-filter: blur(5px) !important;
                    }
                }
            `)
            .appendTo('head');
    }

    function createContainer() {
        if ($('#rt-coverart-container').length) return true;

        const $rtContainer = $('#rt-container');
        if (!$rtContainer.length) return false;

        const defaultUrl = CONFIG.defaultImage || DEFAULT_IMAGE_URL;

        const html =
            '<div id="rt-coverart-container">' +
                '<img src="' + defaultUrl + '" alt="Cover art">' +
                '<div id="rt-coverart-caption">' + WAITING_TOOLTIP + '</div>' +
            '</div>';

        $rtContainer.after(html);
        return true;
    }

    function showArt(url, tooltipText) {
        const $box = $('#rt-coverart-container');
        if (!$box.length) return;
        const text = tooltipText || WAITING_TOOLTIP;
        $box.find('img').attr('src', url);
        $box.find('#rt-coverart-caption').text(text);
    }

    function clearToDefault() {
        currentSongKey = null;
        currentSongChannel = null;
        latestRequestId = ++requestCounter;
        showArt(CONFIG.defaultImage || DEFAULT_IMAGE_URL, WAITING_TOOLTIP);
    }

    function resetForNewStation() {
        clearTimeout(channels.rt0.timer);
        clearTimeout(channels.rt1.timer);
        channels.rt0.lastText = null;
        channels.rt1.lastText = null;
        clearToDefault();
    }

    function stripKnownPrefix(text) {
        const match = text.match(/^([^:]{1,15}):\s*(.+)$/);
        if (!match) return text;
        const remainder = match[2];
        if (/\s[-–—]\s/.test(remainder)) {
            return remainder.trim();
        }
        return text;
    }

    function collapseRepeat(text) {
        const match = text.match(/^(.+?)\s*(?:[-–—,;]\s*)?\1$/i);
        return match ? match[1].trim() : text;
    }

    function parseArtistTitle(rawText) {
        if (!rawText) return null;

        let text = rawText.replace(/\s+/g, ' ').trim();
        text = text.split('|')[0].trim();
        text = stripKnownPrefix(text);
        text = collapseRepeat(text);

        if (!text || text.length < 4) return null;

        const separatorPattern = /\s[-–—]\s/;
        if (!separatorPattern.test(text)) return null;

        const match = separatorPattern.exec(text);
        const left = text.slice(0, match.index).trim();
        const right = text.slice(match.index + match[0].length).trim();

        if (!left || !right) return null;
        if (left.length < 2 || right.length < 2) return null;
        if (left.length > 60 || right.length > 60) return null;

        return CONFIG.swapArtistTitle
            ? { artist: right, title: left }
            : { artist: left, title: right };
    }

    function applyResult(requestId, channelName, key, result) {
        if (requestId !== latestRequestId) return;
        if (!result || !result.found) return;

        currentSongKey = key;
        currentSongChannel = channelName;
        const tooltip = (result.artistName && result.trackName)
            ? `${result.artistName} — ${result.trackName}`
            : '';
        showArt(result.artwork, tooltip);
    }

    function lookupArt(channelName, artist, title) {
        const key = `${artist.toLowerCase()}|||${title.toLowerCase()}`;
        if (key === currentSongKey) return;

        const requestId = ++requestCounter;
        latestRequestId = requestId;

        if (localCache[key]) {
            applyResult(requestId, channelName, key, localCache[key]);
            return;
        }

        $.getJSON('/radiotext-coverart/get', { artist, title })
            .done(function (result) {
                localCache[key] = result;
                applyResult(requestId, channelName, key, result);
            })
            .fail(function () {
                console.warn('RadioText Cover Art: lookup failed for', artist, '-', title);
            });
    }

    function processChannel(channelName, rawText) {
        const ch = channels[channelName];
        const normalized = (rawText || '').replace(/\s+/g, ' ').trim();
        if (normalized === ch.lastText) return;
        ch.lastText = normalized;

        clearTimeout(ch.timer);
        ch.timer = setTimeout(function () {
            settleChannel(channelName, normalized);
        }, CONFIG.stableDelay);
    }

    function settleChannel(channelName, normalized) {
        const pair = parseArtistTitle(normalized);
        const newKey = pair ? `${pair.artist.toLowerCase()}|||${pair.title.toLowerCase()}` : null;

        if (newKey && newKey === currentSongKey) {
            return;
        }

        if (channelName === currentSongChannel) {
            clearToDefault();
        }

        if (pair) {
            lookupArt(channelName, pair.artist, pair.title);
        }
    }

    function handleParsedData(parsedData) {
        if (typeof parsedData.freq !== 'undefined') {
            if (lastFreq !== null && parsedData.freq !== lastFreq) {
                resetForNewStation();
            }
            lastFreq = parsedData.freq;
        }

        const liveIsRt0 = parsedData.rt_flag === 0;
        const order = liveIsRt0 ? ['rt1', 'rt0'] : ['rt0', 'rt1'];

        order.forEach(function (channelName) {
            if (typeof parsedData[channelName] !== 'undefined') {
                processChannel(channelName, parsedData[channelName]);
            }
        });
    }

    function attachSocketListener() {
        if (!window.socket) {
            setTimeout(attachSocketListener, 250);
            return;
        }

        window.socket.addEventListener('message', function (event) {
            if (event.data === 'KICK') return;

            let parsedData;
            try {
                parsedData = JSON.parse(event.data);
            } catch (e) {
                return;
            }

            if (typeof parsedData.rt0 === 'undefined' && typeof parsedData.rt1 === 'undefined' && typeof parsedData.freq === 'undefined') return;
            handleParsedData(parsedData);
        });
    }

    function init() {
        injectStyles();
        if (!createContainer()) {
            setTimeout(init, 250);
            return;
        }
        attachSocketListener();
    }

    $(document).ready(init);

})();
