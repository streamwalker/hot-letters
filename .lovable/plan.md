## Goal
Fix "Tainted canvases may not be exported" when clicking **Export PNG** so a finished page exports cleanly with whatever balloon font the user chose (including Google Fonts).

## Root cause
In `src/letterer-app.js` the export handler (lines ~1880–1921) serializes the SVG overlay, loads it into an `<Image>`, and draws it onto a canvas. The overlay contains `<foreignObject>` divs that use fonts loaded from `fonts.googleapis.com` / `fonts.gstatic.com`. When the SVG image references external font resources, Chrome/Safari mark the destination canvas as tainted, blocking `toBlob`. The `crossOrigin = "anonymous"` on the blob image doesn't help — the taint comes from the external font fetch made while rasterizing the SVG.

## Fix
Make the exported SVG fully self-contained by inlining every font that is actually used by the balloons as a base64 `@font-face` rule inside a `<defs><style>` block of the cloned SVG. Once the SVG has no external network dependencies, it rasterizes without tainting the canvas.

Steps inside `src/letterer-app.js` only:

1. **Collect required font families** — When export starts, walk `state.balloons`, parse each `b.font` (CSS font stack like `"'Bangers', Impact, sans-serif"`) and pull out the first quoted family name. Build a unique set, e.g. `["Bangers", "Comic Neue", ...]`. Filter to the families that match Google Fonts already linked in `<head>` (Bangers, Bungee, Comic Neue 400/700, Kalam 400/700, Luckiest Guy, Permanent Marker). System fonts (Arial, Impact, Helvetica, Georgia, Courier New, Comic Sans MS) need no inlining.
2. **Build a base64 @font-face stylesheet** — For each Google family in use:
   - Fetch the Google Fonts CSS2 URL (e.g. `https://fonts.googleapis.com/css2?family=Bangers&display=swap`) with a `User-Agent`-style override unnecessary in browsers (the browser's UA already gets woff2). The response is CSS containing one or more `@font-face` rules whose `src: url(https://fonts.gstatic.com/...woff2)`.
   - Parse out each `woff2` URL, `fetch()` it as `arrayBuffer`, base64-encode, and rewrite the `src` to `url(data:font/woff2;base64,...) format('woff2')`.
   - Concatenate all rewritten `@font-face` rules into one CSS string. Cache the result in a module-level `Map<family, css>` so subsequent exports skip the network entirely.
3. **Inject into the cloned SVG** — Before serializing, prepend a `<defs><style type="text/css">…</style></defs>` to `svgClone` containing the cached CSS. Also strip `contentEditable` attributes on the cloned foreignObject divs (cosmetic, not required for the fix).
4. **Wait for fonts to be ready** — Call `await document.fonts.ready` before drawing so the rasterizer uses the loaded faces. Keep `crossOrigin` off the blob `Image` (data URLs / same-origin blobs need no CORS).
5. **Graceful fallback** — Wrap the font-fetch step in try/catch. If a font fetch fails (offline, blocked), surface a clear toast: "Could not embed font X for export — using fallback" and continue with whatever inlining succeeded. The export will still succeed visually using the next font in the user's CSS stack.
6. **Update the existing error toast** — On any remaining export failure, keep the existing modal but drop the misleading "Try a system font" tip in favor of a more accurate message ("Could not embed all fonts — try Save Project and reload, or pick a system font").

## Out of scope
- Rewriting balloon rendering to use native SVG `<text>` instead of `<foreignObject>`.
- Switching to a third-party library (`html-to-image`, `dom-to-image`, etc.).
- Server-side PNG generation.

## Verification
- Load a page image, place a balloon using **Bangers**, click Export PNG → file downloads, opens cleanly with the right font.
- Repeat with **Comic Neue Bold**, **Permanent Marker**, **Arial** (system) → all succeed.
- Disable the network after the first export, change a balloon, click Export PNG again → cached font still embeds; no error.
