RadioText Cover Art — plugin for fm-dx-webserver
Adds its own small container between the RADIOTEXT panel and the TX info
panel and shows cover art there when it spots a song announcement in the
RDS RadioText ("Artist - Title"). A default picture is shown whenever no
song is currently identified.
Artwork comes from the free, keyless iTunes Search API and is cached on
the server for an hour.
What's new in v1.6
Restored the blurred panel background around RADIOTEXT on phones.
Turns out the core webserver's CSS deliberately strips the background
and blur off every panel on phones (a site-wide mobile style choice,
not something specific to RADIOTEXT or this plugin). This plugin now
restores that blurred backdrop for the RADIOTEXT panel and matches it
on its own container, so both look like proper panels again instead of
sitting directly on the background photo.
What's new in v1.5
Fixed the position on phones. The core webserver's mobile CSS
explicitly reorders the RADIOTEXT panel to render after the TX info
panel (via a flexbox `order`), even though it comes first in the page's
actual markup. Without an order of its own, this container defaulted to
the front of the line and ended up appearing before both the TX info
panel and RADIOTEXT instead of after them. It now has an explicit order
so it renders right after RADIOTEXT and right before the AF (alternate
frequencies) list, as intended.
What's new in v1.4
Fixed the phone layout. The picture used to stretch across a wide,
short box, which crops square album art down to a thin "flat"-looking
strip. Phones now get a fixed 62×62 square thumbnail instead, so the
art actually looks like album art.
Fixed the tap-to-see-the-song-name popup running off the screen.
On narrow screens, tapping the picture could pop up the artist/title
tooltip positioned to the right of an element that's already ~90% of
the screen width, pushing the text half off-screen. Phones now just
show the artist/title as normal text next to the thumbnail instead of
needing a tap at all (up to 3 lines, then truncates with an ellipsis).
Desktop still shows it as a hover tooltip.
What's new in v1.3
Fixed a flicker on stations that retransmit the same song repeatedly.
Some stations keep toggling the RDS A/B flag even when the RadioText
content hasn't changed, which can make the receiver rebuild that
buffer from scratch (briefly passing through partial text) even though
it settles back on the exact same song. v1.2 reacted to every one of
those intermediate changes and cleared the picture each time. v1.3
waits for a buffer to fully settle before deciding anything, and does
nothing if it settled right back on the song already showing. Genuine
changes (a real new song, silence, a switch to non-song text) still
clear/update the picture as before — just decided once, on the settled
value, instead of on every raw change.
What's new in v1.2
Fixed title collisions (e.g. Maggie Reilly's 1992 "Everytime We
Touch" showing Cascada's 2006 song of the same name instead). The
server now searches by artist first, and looks for the requested title
within that artist's own catalogue, instead of one blended search
that tends to favour whichever version is more popular regardless of
who was asked for. It only falls back to a general search if that
doesn't turn up a confident match. Weak/no matches now correctly
report "not found" instead of confidently showing the best-of-a-bad-
bunch guess.
The picture now clears itself when it goes stale. Previously it
never got cleared automatically, so it could keep showing an old
song's art after the song ended, or after retuning to a completely
different station. Now:
If the RT buffer that's currently "on screen" changes to anything
else — silence, a station tagline, whatever — the picture drops back
to the default immediately, before even trying to figure out what
(if anything) replaces it.
Retuning to a different frequency resets everything straight away,
rather than waiting for the new station's RDS to arrive and
overwrite the old text (which can take several seconds, or might
coincidentally never produce a clean change).
A non-matching other buffer (e.g. a permanent station tagline
that was never actually driving the picture) still won't clear a
correct picture — that part of the v1.1 fix is unchanged.
Install / upgrade
Stop your fm-dx-webserver.
Delete the existing `radiotext-coverart.js` file and `radiotext-coverart/`
folder from your `plugins/` folder.
Copy these into `plugins/`, keeping the structure:
```
   plugins/
     radiotext-coverart.js
     radiotext-coverart/
       radiotext-coverart.js
       radiotext-coverart_server.js
   ```
(`README.md` doesn't need to be copied — it's just documentation.)
Start the webserver. You should see a console line like:
`Plugin RadioText Cover Art 1.6 initialized successfully.`
Make sure it's enabled under admin Settings → Plugins.
Restart the webserver once more (server-side scripts load at startup)
and reload the page in your browser.
Configuring
Open `plugins/radiotext-coverart/radiotext-coverart.js` and edit the
`CONFIG` object near the top:
Setting	Default	What it does
`stableDelay`	`2500`	Milliseconds a given RT buffer must stay unchanged before it's looked up
`swapArtistTitle`	`false`	Set to `true` if your station publishes "Title - Artist" instead of "Artist - Title"
`boxSize`	`100`	Container size in pixels (desktop). Phones automatically get a full-width stacked panel
`defaultImage`	`null`	Picture shown when no song is identified. `null` = built-in placeholder icon, or set a path to your own image (see below)
No restart is needed after editing this file — just reload the page.
Using your own default picture
Drop an image file anywhere under the webserver's `web` folder — for
example `web/images/my-default-cover.png` — then set:
```js
defaultImage: '/images/my-default-cover.png'
```
Known limitations
RDS RadioText has no fixed format, so plenty of stations won't match
at all (jingles, ads, traffic info, scrolling news, station taglines
containing a stray dash, etc.). That's expected and by design — a
non-match just leaves whatever picture is already showing untouched
(unless it's the buffer that's currently on screen changing, per
above, in which case it clears).
Match accuracy depends on the iTunes Search API's catalogue and a
best-effort text match. The artist-first search in v1.2 fixes the
common case of title collisions, but it isn't a guarantee — very
obscure tracks, or ones missing from iTunes entirely, may still show
no picture, or rarely, a wrong one.
Uninstall
Disable it in Settings → Plugins, stop the server, then delete
`radiotext-coverart.js` and the `radiotext-coverart/` folder from
`plugins/`.
