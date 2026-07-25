/* global $, initTooltips */
// RadioText Cover Art — front-end (v1.6)
//
// Adds its own small container between the RADIOTEXT panel and the TX
// info panel and shows cover art there once it spots an "Artist - Title"
// pattern in the RDS RadioText. A default picture is shown until a song
// is found, or after the picture on screen has gone stale (see below).
//
// Why RT0 *and* RT1: RDS RadioText has an A/B flag the station toggles
// whenever it starts a new message. rt0 is whatever was last decoded
// while that flag was 0, rt1 is whatever was last decoded while it was
// 1 - so at any moment one of them is "live" and the other is simply
// whatever played before it. Both are watched independently, and
// whichever one most recently produced a confirmed match "owns" the
// picture on screen.
//
// Staleness handling: once a buffer's text stops changing for a full
// stableDelay (i.e. it's settled, not mid-scroll), the picture is reset
// back to the default if the buffer that currently owns the picture has
// settled on something else - empty, a station tagline, anything - since
// whatever justified the current picture no longer holds. Waiting for a
// settled value (rather than reacting to every intermediate change)
// matters because some stations retransmit the exact same RadioText
// while still toggling the A/B flag, which can make the receiver rebuild
// that buffer from scratch even though the song hasn't changed at all -
// reacting immediately would flicker the picture off and back on for no
// reason. Retuning to a different frequency still clears immediately,
// since that's an unambiguous "different station" signal with nothing to
// wait and settle for.
//
// Phone layout: instead of stretching the picture across a wide, short
// box (which crops square album art badly) and relying on a tap-to-reveal
// tooltip (which can run off the edge of a narrow screen), phones get a
// fixed square thumbnail with the artist/title shown as normal text right
// next to it. It's also explicitly ordered to render right after the
// RADIOTEXT panel and before the AF list, since the core CSS reorders
// RADIOTEXT to render after the TX info panel on phones (via a flexbox
// `order`), which would otherwise place this container ahead of both.
//
// Core CSS also strips the background/blur off every panel on phones as
// a site-wide style choice (not specific to RADIOTEXT). This plugin
// restores that blurred backdrop for the RADIOTEXT panel specifically
// and matches it on its own container, so both have a proper panel look
// on phones instead of sitting directly on the background photo.

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
    // Built-in default picture (a simple vinyl-record icon) so the plugin
    // works out of the box with zero setup.
    const DEFAULT_IMAGE_SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>" +
        "<rect width='100' height='100' rx='14' fill='#2b2b2e'/>" +
        "<circle cx='50' cy='50' r='34' fill='none' stroke='#55555a' stroke-width='2'/>" +
        "<circle cx='50' cy='50' r='26' fill='none' stroke='#45454a' stroke-width='1.5'/>" +
        "<circle cx='50' cy='50' r='9' fill='#55555a'/>" +
        "<circle cx='50' cy='50' r='3' fill='#2b2b2e'/>" +
        "</svg>";
    const DEFAULT_IMAGE_URL = 'data:image/svg+xml,' + encodeURIComponent(DEFAULT_IMAGE_SVG);
    const WAITING_TOOLTIP = 'Waiting for song info…';

    // Independent state per RDS RadioText buffer
    const channels = {
        rt0: { lastText: null, timer: null },
        rt1: { lastText: null, timer: null }
    };

    let requestCounter = 0;
    let latestRequestId = 0;
    let currentSongKey = null;      // "artist|||title" currently on screen
    let currentSongChannel = null;  // 'rt0' or 'rt1' - whichever buffer produced it
    let lastFreq = null;
    const localCache = {}; // "artist|||title" -> server response

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
                    align-items: center;
                    justify-content: center;
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
                }
                #rt-coverart-caption {
                    display: none;
                }
                /* Desktop: a square-ish box, info shown via hover tooltip */
                @media only screen and (min-width: 769px) {
                    #rt-coverart-container {
                        width: ${boxSize}px;
                        min-width: ${boxSize}px;
                        height: 100px;
                        backdrop-filter: blur(5px);
                        padding: 8px;
                        box-sizing: border-box;
                    }
                    #rt-coverart-container img {
                        width: 100%;
                        height: 100%;
                    }
                }
                /* Phone: a fixed square thumbnail with the artist/title shown
                   right next to it, instead of stretching the picture across
                   a wide, short box (which crops it badly) and relying on a
                   tap-to-reveal tooltip (which can run off the screen edge). */
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
                        justify-content: flex-start;
                        /* Core CSS gives #rt-container an explicit order (2) on
                           phones so it renders after the TX info panel despite
                           coming first in the DOM. Without an order of our own
                           we'd default to 0 and land ahead of everything: give
                           this a higher order so it lands right after RADIOTEXT
                           instead, just before the AF list that follows it. */
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
                        margin-left: 12px;
                        text-align: left;
                        font-size: 13px;
                        line-height: 1.35;
                        opacity: 0.85;
                    }
                    /* Core CSS deliberately strips the background/blur off every
                       panel on phones (a site-wide mobile style choice, not
                       something specific to RADIOTEXT). Restore it here so the
                       RADIOTEXT panel gets a proper backdrop again, matching
                       this container right below it. !important is needed since
                       the core rules that remove it don't use it themselves, but
                       our ID selector still needs to outrank their class rule. */
                    #rt-container {
                        background-color: var(--color-1-transparent) !important;
                        backdrop-filter: blur(5px) !important;
                    }
                }
            `)
            .appendTo('head');
    }

    // Creates the container as its own panel directly after #rt-container,
    // i.e. between the RADIOTEXT panel and the TX info panel.
    function createContainer() {
        if ($('#rt-coverart-container').length) return true;

        const $rtContainer = $('#rt-container');
        if (!$rtContainer.length) return false;

        const defaultUrl = CONFIG.defaultImage || DEFAULT_IMAGE_URL;

        const html =
            '<div id="rt-coverart-container" class="tooltip" data-tooltip-placement="bottom" data-tooltip="' + WAITING_TOOLTIP + '">' +
                '<img src="' + defaultUrl + '" alt="Cover art">' +
                '<div id="rt-coverart-caption">' + WAITING_TOOLTIP + '</div>' +
            '</div>';

        $rtContainer.after(html);

        const $box = $('#rt-coverart-container');
        if (typeof initTooltips === 'function') {
            initTooltips($box);
        }
        return true;
    }

    function showArt(url, tooltipText) {
        const $box = $('#rt-coverart-container');
        if (!$box.length) return;
        const text = tooltipText || WAITING_TOOLTIP;
        $box.find('img').attr('src', url);
        $box.data('tooltip', text);
        $box.find('#rt-coverart-caption').text(text);
    }

    // Drops the picture back to the default and forgets what was showing.
    // Also invalidates any lookup already in flight, so a late response
    // for the song we just moved away from can't override this.
    function clearToDefault() {
        currentSongKey = null;
        currentSongChannel = null;
        latestRequestId = ++requestCounter;
        showArt(CONFIG.defaultImage || DEFAULT_IMAGE_URL, WAITING_TOOLTIP);
    }

    // Full reset for when the tuned frequency changes - a different
    // station entirely, so nothing about the previous one still applies.
    function resetForNewStation() {
        clearTimeout(channels.rt0.timer);
        clearTimeout(channels.rt1.timer);
        channels.rt0.lastText = null;
        channels.rt1.lastText = null;
        clearToDefault();
    }

    // Try to pull an "Artist - Title" pair out of a RadioText string. This
    // is a best-effort heuristic — RDS RadioText has no fixed format, so
    // plenty of stations won't match (jingles, ads, traffic info,
    // scrolling news, station taglines, etc.) and that's expected.
    function parseArtistTitle(text) {
        if (!text || text.length < 4) return null;

        // Drop trailing station promo/ad text often appended after a pipe
        const cleaned = text.split('|')[0].trim();
        if (!cleaned) return null;

        // Common separators used between artist and title
        const separatorPattern = /\s[-–—]\s/;
        if (!separatorPattern.test(cleaned)) return null;

        const parts = cleaned.split(separatorPattern);
        if (parts.length !== 2) return null; // ambiguous if there's more than one separator

        const left = parts[0].trim();
        const right = parts[1].trim();
        if (!left || !right) return null;
        if (left.length < 2 || right.length < 2) return null;
        if (left.length > 60 || right.length > 60) return null;

        return CONFIG.swapArtistTitle
            ? { artist: right, title: left }
            : { artist: left, title: right };
    }

    function applyResult(requestId, channelName, key, result) {
        // A newer lookup or a reset has happened since this was dispatched
        if (requestId !== latestRequestId) return;
        // Don't clear a perfectly good picture just because this particular
        // guess didn't turn up a match. Only ever *replace* on a confirmed find.
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
        if (key === currentSongKey) return; // already showing this one

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

    // rt0 and rt1 are debounced and parsed completely independently, so
    // whichever buffer settles on a new, real-looking song is the one
    // that gets looked up - regardless of which buffer currently owns
    // the picture on screen.
    function processChannel(channelName, rawText) {
        const ch = channels[channelName];
        const normalized = (rawText || '').replace(/\s+/g, ' ').trim();
        if (normalized === ch.lastText) return; // nothing changed in this buffer
        ch.lastText = normalized;

        clearTimeout(ch.timer);
        ch.timer = setTimeout(function () {
            settleChannel(channelName, normalized);
        }, CONFIG.stableDelay);
    }

    // Called once a buffer's text has stopped changing for a full
    // stableDelay - i.e. it's a settled, final value, not a mid-scroll or
    // mid-rebuild partial. Some stations retransmit the exact same
    // RadioText while still toggling the RDS A/B flag (which can make the
    // receiver rebuild that buffer from scratch), so raw text can flicker
    // through partial states even though nothing about the song actually
    // changed - waiting for a settled value avoids reacting to those.
    function settleChannel(channelName, normalized) {
        const pair = parseArtistTitle(normalized);
        const newKey = pair ? `${pair.artist.toLowerCase()}|||${pair.title.toLowerCase()}` : null;

        if (newKey && newKey === currentSongKey) {
            // Settled right back on the song that's already showing - e.g.
            // the retransmit case above. Nothing to do, no flicker.
            return;
        }

        if (channelName === currentSongChannel) {
            // This buffer is the one currently on screen, and it just
            // settled on something genuinely different - whatever
            // justified the current picture no longer holds.
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

        if (typeof parsedData.rt0 !== 'undefined') processChannel('rt0', parsedData.rt0);
        if (typeof parsedData.rt1 !== 'undefined') processChannel('rt1', parsedData.rt1);
    }

    function attachSocketListener() {
        if (!window.socket) {
            // websocket.js hasn't finished setting up window.socket yet — retry shortly
            setTimeout(attachSocketListener, 250);
            return;
        }

        window.socket.addEventListener('message', function (event) {
            if (event.data === 'KICK') return;

            let parsedData;
            try {
                parsedData = JSON.parse(event.data);
            } catch (e) {
                return; // not a JSON state update, ignore
            }

            if (typeof parsedData.rt0 === 'undefined' && typeof parsedData.rt1 === 'undefined' && typeof parsedData.freq === 'undefined') return;
            handleParsedData(parsedData);
        });
    }

    function init() {
        injectStyles();
        if (!createContainer()) {
            // #rt-container wasn't there yet somehow — try again shortly
            setTimeout(init, 250);
            return;
        }
        attachSocketListener();
    }

    $(document).ready(init);

})();
