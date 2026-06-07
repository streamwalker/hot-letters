# Edit balloons on an existing lettered page

Add a workflow for pages that already have word balloons drawn on them: trace each existing balloon, pull the text out with OCR, get an editable balloon in its place, and optionally white-out the original underneath.

## User flow

1. Load Page Image as usual.
2. Click a new toolbar button **Trace Existing Balloon** (next to `+ Add Balloon`). Cursor switches to crosshair; a hint banner appears: "Drag a rectangle around an existing balloon. Esc to cancel."
3. User drags a rectangle around one balloon on the canvas.
4. On release:
   - A new editable balloon is created sized to that rectangle (default Speech preset, ellipse shape, sensible padding).
   - The cropped rectangle is sent to the existing `/api/ocr-script` route (already used for script photos) to extract the text inside; the returned text fills the new balloon.
   - A small inline prompt appears on the new balloon: **Erase original underneath?** with Yes / No buttons.
     - **Yes** → record a "white-out mask" for that balloon (the traced rect, slightly inset to match the balloon outline) so the page renders with a white fill over that area beneath the new balloon. Stored per balloon so it's undoable and exported correctly.
     - **No** → just leave the original art showing through.
5. Trace mode stays active so the user can trace the next balloon; Esc or clicking the toolbar button again exits.
6. From here, every balloon behaves like any other balloon — edit text, restyle, connect, auto-format, smart-place, delete, etc.

## Rendering & export

- White-out masks render as white rects on the canvas SVG overlay underneath all balloon shapes, above the page image.
- PNG export composites the same masks so the exported page matches what's on screen.
- Save / Load Project serialize the mask list alongside balloons.

## Edge cases

- OCR failure or empty result → balloon is created with empty text and a toast: "Couldn't read text — type it in."
- Trace rectangle smaller than ~20px is ignored (prevents accidental clicks).
- Undo / Redo cover both the new balloon and its white-out mask as a single step.
- Works at any zoom level — rectangle is captured in image-space coordinates, not screen-space.

## Technical notes

Files touched:

- `src/letterer-body.html` — add `#btn-trace-balloon` toolbar button and a `#trace-hint` banner element.
- `src/letterer.css` — crosshair cursor + selection rectangle styles, trace-hint banner, inline "Erase original?" prompt styles.
- `src/letterer-app.js` —
  - new `state.traceMode` flag and pointer handlers on `#canvas-stage` to draw the marquee in image coordinates.
  - `state.whiteoutMasks: [{ id, balloonId, x, y, w, h }]` array; rendered as `<rect fill="white">` in the SVG overlay; included in PNG export and project save/load.
  - on trace release: create balloon (reuse existing add-balloon helper), crop the page image to a canvas, post the data URL to `/api/ocr-script`, fill `balloon.text` with the response, show inline Yes/No prompt anchored to the new balloon.
  - undo/redo: push a single history entry containing both the new balloon and (if chosen) the mask.
- No backend changes — `/api/ocr-script` already accepts an image and returns text.

Out of scope: automatic detection of balloon outlines, perfect outline-shaped masking (we white-out the traced rect, not a pixel-perfect balloon silhouette), and removing tails from the original art.
