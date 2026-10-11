# RadioText Cover Art — Plugin for FM-DX-Webserver

Shows cover art for the song that's currently playing, detected from the
station's RDS data. A default picture is shown whenever no song is
identified.

- **Phones:** a full-width panel right after the RADIOTEXT panel.
- **Desktop:** its own square box below the AF (alternate frequencies) card,
  sized to line up with the TX info panel.

## Features

- **Song detection from RadioText (RT)** — understands `Artist - Title` and
  `Title - Artist`, ignores prefixes like `Now: `, and copes with RT that
  repeats the song several times.
- **Multiple artists** — `A/B/C`, `A & B`, `A feat. B` etc. are searched by
  the lead artist plus the title.
- **PS fallback** — if a station sends no usable RT but scrolls the song in
  its 8-character PS ("dynamic PS"), the plugin assembles the PS chunks and
  searches for the song. Only used when RT gives nothing.
- **Two artwork sources** — Apple Music (iTunes Search API) first, Deezer as
  a fallback when nothing is found. Both are free and need no API key.
- **Info card** — tap the cover for a larger picture with title, artist,
  album and year (year when available), plus YouTube and Spotify search
  buttons.
- **History** — the last 10 detected songs with cover, time and frequency.
  Tap one to open its info card. Saved in your browser.
- **Settings panel** — the small ♫ button on the cover (on desktop it
  appears when you hover over the cover) opens a panel with:
  - **Enable cover art** on/off switch
  - **Song info source:** *RT + PS fallback*, *RadioText only* or *PS only*
  - the history list (only the list scrolls) and a *Clear history* button

  Settings and history are stored per browser, so each device has its own.
- **Layout fixes** — rotating a phone from landscape back to portrait no
  longer leaves a big gap, and the AF list keeps a bottom gap so the last
  frequency isn't clipped by the rounded corners.

Results are cached on the server for an hour.

## Install / update

1. Stop your fm-dx-webserver.
2. Delete the existing `radiotext-coverart.js` file and `radiotext-coverart/`
   folder from your `plugins/` folder.
3. Copy these into `plugins/`, keeping the structure:
   ```
   plugins/
     radiotext-coverart.js
     radiotext-coverart/
       radiotext-coverart.js
       radiotext-coverart_server.js
   ```
   (`README.md` doesn't need to be copied — it's just documentation.)
4. Start the webserver. You should see a console line like:
   `Plugin RadioText Cover Art 2.5 initialized successfully.`
5. Make sure it's enabled under admin **Settings → Plugins**.
6. Restart the webserver once more (server-side scripts load at startup)
   and reload the page in your browser.

## Configuring

Open `plugins/radiotext-coverart/radiotext-coverart.js` and edit the
`CONFIG` object near the top:

| Setting | Default | What it does |
|---|---|---|
| `stableDelay` | `2500` | Milliseconds a given RT buffer must stay unchanged before it's looked up |
| `boxSize` | `100` | Minimum size of the cover box in pixels (desktop). Phones automatically get a full-width stacked panel |
| `afBottomGap` | `16` | Empty space in pixels kept below the AF list so the last frequency isn't cut off by the rounded corners |
| `defaultImage` | `null` | Picture shown when no song is identified. `null` = built-in placeholder icon, or set a path to your own image (see below) |

No restart is needed after editing this file — just reload the page.

The on/off switch and the RT/PS source choice are not in `CONFIG`; they are
set from the ♫ panel on the page itself.

### Using your own default picture

Drop an image file anywhere under the webserver's `web` folder — for
example `web/images/my-default-cover.png` — then set:

```js
defaultImage: '/images/my-default-cover.png'
```

## Notes

- Detection depends on what the station broadcasts. Jingles, news and ads
  that don't look like `Artist - Title` are ignored; a song that neither
  Apple Music nor Deezer knows shows the default picture.
- The PS fallback needs the PS to cycle through at least two different
  frames and the cycle to repeat once, so it takes a few seconds longer than
  RT detection. A static station name is never searched.
- The server needs outbound internet access to `itunes.apple.com` and
  `api.deezer.com`.

## Uninstall

Disable it in **Settings → Plugins**, stop the server, then delete
`radiotext-coverart.js` and the `radiotext-coverart/` folder from
`plugins/`.
