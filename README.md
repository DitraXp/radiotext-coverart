# RadioText Cover Art — Plugin for FM-DX-Webserver

Adds its own small container between the RADIOTEXT panel and the TX info
panel and shows cover art there when it spots a song announcement in the
RDS RadioText. A default picture is shown whenever no
song is currently identified.

Artwork comes from the free, keyless iTunes Search API and is cached on
the server for an hour.

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
   `Plugin RadioText Cover Art 1.2 initialized successfully.`
5. Make sure it's enabled under admin **Settings → Plugins**.
6. Restart the webserver once more (server-side scripts load at startup)
   and reload the page in your browser.

## Configuring

Open `plugins/radiotext-coverart/radiotext-coverart.js` and edit the
`CONFIG` object near the top:

| Setting | Default | What it does |
|---|---|---|
| `stableDelay` | `2500` | Milliseconds a given RT buffer must stay unchanged before it's looked up |
| `swapArtistTitle` | `false` | Set to `true` if your station publishes "Title - Artist" instead of "Artist - Title" |
| `boxSize` | `100` | Container size in pixels (desktop). Phones automatically get a full-width stacked panel |
| `defaultImage` | `null` | Picture shown when no song is identified. `null` = built-in placeholder icon, or set a path to your own image (see below) |

No restart is needed after editing this file — just reload the page.

### Using your own default picture

Drop an image file anywhere under the webserver's `web` folder — for
example `web/images/my-default-cover.png` — then set:

```js
defaultImage: '/images/my-default-cover.png'
```

## Uninstall

Disable it in **Settings → Plugins**, stop the server, then delete
`radiotext-coverart.js` and the `radiotext-coverart/` folder from
`plugins/`.
