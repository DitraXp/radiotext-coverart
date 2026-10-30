# RadioText Cover Art 2.1 — Plugin for FM-DX Webserver

RadioText Cover Art detects the song broadcast through RDS RadioText or dynamic PS and displays verified artwork inside the FM-DX Webserver interface. It keeps the original zero-key setup while adding multi-provider lookup, station-aware parsing, flexible placement and administrator defaults.

## Highlights

- RadioText and dynamic-PS reconstruction with RT priority.
- Candidate scoring for `Artist — Title`, `Title — Artist`, labeled metadata and common separator variants.
- Transliteration-aware parsing for Latin-character metadata, including Greeklish-style transliterations.
- Multilingual metadata and collaboration markers, including `by`, `von`, `par`, `por`, `with`, `mit`, `avec`, `con` and `com`.
- Per-station learned and manual parsing profiles.
- Apple Music, Deezer, TheAudioDB and MusicBrainz/Cover Art Archive sources.
- Persistent artwork cache, negative cache, retry control and in-flight request deduplication.
- Recent-song history and an expandable information card with provider and YouTube links.
- Administrator defaults stored under `plugins_configs`, with browser-specific overrides for listeners.

## Layouts

- **Separate panel** next to RadioText, PS or the AF list.
- **Inside selected panel — edge-to-edge**, preserving the established 2.0 appearance.
- **Inside selected panel — inset**, enabled by setting **Inside panel inset** above `0`; the cover remains square, gains rounded corners and pushes the remaining panel content in the selected direction.
- **Freeform overlay** with dragging, resizing and optional pinning relative to the nearest interface panel.
- VisualEQ-aware PS docking and responsive mobile behavior.

## Cover sources

Sources are tried in the following fixed order and can be enabled independently:

1. Apple Music / iTunes Search
2. Deezer
3. TheAudioDB
4. MusicBrainz / Cover Art Archive

TheAudioDB participates in the ordered search and benefits from the plugin's server cache and duplicate-request suppression.

## Jingles, ads and default background

The settings panel offers three behaviours when the current metadata is not recognised as a song:

- keep the last cover;
- show the current station logo;
- show the configured default background.

The default background can be the built-in placeholder, a static path under the webserver's `web` directory, or an `http://` / `https://` image URL. If a station logo is unavailable, the configured default background is used automatically.

## Settings interface

Version 2.1 includes a responsive, category-based settings panel with a theme-aware mica background. Placement, appearance, detection, cover sources, station behaviour, storage and history are presented in separate sections using the active FM-DX theme colors.

| Area | Main controls |
|---|---|
| Placement | Host panel, before/after position, separate/inside/overlay mode, inset and content gap |
| Appearance | Jingle/ad behaviour, default image, waiting-message opacity, cover backdrop and blur |
| Song detection | RT/PS source, confidence, stability delay, retry interval and Dynamic PS analysis |
| Cover sources | Apple Music, Deezer, TheAudioDB and MusicBrainz / Cover Art Archive |
| Current station | Manual RT order and Dynamic PS parsing mode |
| Storage | Persistent artwork cache, diagnostics and recent-song history |

The **Waiting message background** control offers 0%, 25%, 50%, 75% and 100% opacity and applies consistently to the built-in placeholder, a custom image and the station logo.

## Install or update

1. Stop FM-DX Webserver.
2. Replace the existing `radiotext-coverart.js` file and `radiotext-coverart/` folder in `plugins/`.
3. Keep this structure:

   ```text
   plugins/
     radiotext-coverart.js
     radiotext-coverart/
       radiotext-coverart.js
       radiotext-coverart_server.js
   ```

4. Start the webserver and enable the plugin under **Settings → Plugins**.
5. Restart the webserver once after installing or replacing the server-side file, then reload the browser page.

Existing browser preferences and server defaults are migrated automatically. Settings introduced in 2.1 use safe defaults until explicitly changed.

## Network access

The server may contact the following domains, depending on the enabled sources:

- `itunes.apple.com`
- `api.deezer.com`
- `www.theaudiodb.com`
- `musicbrainz.org`
- `coverartarchive.org`

When a custom background is configured with an external HTTP(S) URL, visitors' browsers request that image directly from its host. Use a local path under the webserver's `web` directory if this external request is not desirable.

## Troubleshooting

- **Settings appear unchanged:** reload the page without cache after replacing the front-end file.
- **Server defaults cannot be saved:** restart FM-DX Webserver after replacing `radiotext-coverart_server.js`, then sign in as administrator.
- **No station logo appears:** confirm that the active webserver layout exposes the current logo through the standard `station-logo` image element. The configured default background is used when no logo is available.
- **Dynamic PS is slow to identify a song:** PS must provide enough stable frames to reconstruct artist and title; RT matches continue to receive priority when both sources are enabled.
- **A provider returns no cover:** enable another cover source or configure a retry interval. Negative results are cached briefly to avoid repeated provider requests.

## Credits

- Original plugin and the v1.x RT/PS foundation: **DitraXp / istvn**.
- Version 2.1 architecture, detection pipeline, layouts, provider integration and compatibility work: **MCelliotG**.

## Uninstall

Disable the plugin, stop the webserver, then remove `radiotext-coverart.js` and the `radiotext-coverart/` directory from `plugins/`.
