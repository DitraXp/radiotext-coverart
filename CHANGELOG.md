# Changelog

## 2.1

### Added

- Musical-note settings button with theme color and hover animation.
- Responsive, category-based settings panel with theme-aware mica styling.
- Accessible settings dialog semantics, Escape-to-close, initial close-button focus and focus restoration.
- Optional four-sided `Inside panel inset` from 0–8 px, retaining the edge-to-edge layout at 0.
- Freeform overlay placement with dragging, resizing and optional panel-relative pinning.
- TheAudioDB as a keyless cover source, including album-art lookup.
- Configurable behaviour during jingles and advertisements: keep the last cover, show the station logo or show the default background.
- Custom default backgrounds through a local web path or an HTTP(S) URL, with preview and built-in-image recovery.
- Shared waiting-message background opacity choices: 0%, 25%, 50%, 75% and 100%.
- Multilingual title/artist, metadata and collaboration markers for English, German, French, Spanish, Italian and Portuguese text.
- Per-station learned and manual RT/Dynamic PS parsing profiles.
- Persistent artwork cache, negative cache, configurable retry interval and recent-song history.

### Improved

- Candidate scoring, transliteration-aware parsing and Latin-character language recognition, including Greeklish-style metadata.
- Source-aware RT/PS arbitration so informational RadioText cannot replace active or pending Dynamic PS artwork.
- Station-logo presentation now behaves like the other placeholders, preserves its aspect ratio and keeps searches running.
- Cover lightbox interaction, provider links and click-to-collapse behaviour.
- Settings readability, sentence-case labels, section hierarchy and theme-derived dividers.
- Administrator defaults under `plugins_configs`, with browser-specific listener overrides.

### Fixed

- Inside-panel inset now applies to all four sides in every placement direction.
- Settings mica blur is confined to the dialog instead of blurring the whole webserver.
- Vertical alignment of PS content when a cover is docked inside the panel.
- VisualEQ PS-container compatibility and content displacement.
- RT/PS request cancellation, stale-result suppression and station-change cleanup.

### Compatibility

- Existing edge-to-edge inside-panel behaviour remains the default.
- Existing browser preferences and server defaults are migrated automatically.
- VisualEQ-aware docking and responsive mobile behaviour are preserved.
