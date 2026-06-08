## Clean Up — AI inpainting for page art

Bring an Apple iOS 26 Clean Up–style tool to Hot Letters. The user paints over something on the loaded comic page (stray line, old lettering, a balloon they want gone, a wire, a watermark). AI fills the painted area with what should plausibly be underneath, matching the surrounding art.

This extends the existing white-out feature (which just paints solid white rectangles) with real generative fill.

### What the user gets

1. New toolbar button **Clean Up** next to "Trace Existing Balloon".
2. Clicking it enters Clean Up mode. The canvas cursor becomes a round brush.
3. The user paints (drag) over anything they want removed. Multiple strokes allowed. Brush size slider appears in a small floating panel, plus Undo Stroke / Clear / Cancel / **Apply Clean Up** buttons.
4. On Apply: the painted mask + current page image are sent to a server function that calls an AI image-editing model to inpaint the masked area. A spinner overlays the canvas while it runs (typically a few seconds).
5. The cleaned image replaces the page image on the canvas. The original is kept in an undo stack so the user can revert (existing ⌘Z / toolbar Undo works, plus a dedicated "Revert Clean Up" entry in the floating panel until the next action).
6. Saved/exported PNG uses the cleaned image. Project save/load persists the cleaned version (it just becomes the new `imageDataUrl`).
7. Escape exits Clean Up mode without applying.

### Safety / scope

- Clean Up only edits the page art layer. Balloons, tails, connectors, white-out rects, and reading-order overlays are untouched — they sit above the image in the SVG and are excluded from both the input sent to the model and the output composite.
- A confirmation toast shows estimated cost note ("Uses Lovable AI credits") before the first run per session.
- Failures (429 rate limit, 402 credits, network) surface as a clear toast and leave the original image intact.

### Technical details

**Frontend (`src/letterer-app.js`, `src/letterer-body.html`, `src/letterer.css`)**
- New state: `state.cleanupMode`, `state.cleanupStrokes` (array of `{points:[{x,y}], brush}` in image coords), `state.cleanupHistory` (stack of prior `imageDataUrl` for revert).
- New SVG overlay layer `#cleanup-mask` rendered above the image but below balloons while in Clean Up mode; strokes are drawn as thick white-on-black paths into an offscreen canvas to build the binary mask sent to the server.
- Toolbar button + floating control panel (brush size 8–120 px in image coords, Undo Stroke, Clear, Cancel, Apply).
- Pointer handlers gated by `state.cleanupMode` so they don't conflict with balloon drag/trace mode.
- On Apply: build mask PNG (same dimensions as image, white = erase), call new server function with `{ imageDataUrl, maskDataUrl }`, replace `state.imageDataUrl` with returned data URL, push prior image onto `cleanupHistory`, re-render.

**Backend (TanStack server function, `src/lib/cleanup.functions.ts`)**
- `createServerFn({ method: "POST" })` with Zod validation: both inputs are data URLs, max ~8 MB each, image must be PNG/JPEG.
- Calls Lovable AI Gateway image-edit model `google/gemini-3.1-flash-image-preview` (Nano Banana 2) with a prompt like *"Remove the areas indicated by the white regions of the mask. Reconstruct the underlying comic art so the result is seamless — match line weight, ink style, color, and texture. Output the full page at the original resolution."* The mask is passed as a second input image.
- Reads `process.env.LOVABLE_API_KEY` inside `.handler()`.
- Returns `{ imageDataUrl }`. Maps gateway 402/429 to clear error messages.
- Public-facing copy says "Lovable AI" / "AI-powered", not the model name.

**Files touched**
- `src/letterer-body.html` — toolbar button, floating Clean Up panel markup.
- `src/letterer.css` — brush cursor, panel styling, mask overlay.
- `src/letterer-app.js` — mode, stroke capture, mask compositing, apply/revert wiring.
- `src/lib/cleanup.functions.ts` *(new)* — server function.
- `src/lib/ai-gateway.server.ts` *(new if absent)* — shared Lovable AI provider helper.

### Out of scope (for now)

- Object detection / "tap to clean up a whole object" auto-selection. v1 is brush-based; we can add a "Smart Select" follow-up later.
- Editing balloons or lettering with this tool — it only edits the underlying page art.
- Region-only re-renders (we send the whole page so the model has full context; cleaned image is returned at full resolution).