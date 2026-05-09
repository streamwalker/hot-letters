## Goal
Make script photos in **Script View** searchable and selectable by running OCR on each uploaded photo, so the user can highlight passages and copy them into the **Parse Script** field or any selected balloon.

## Approach
1. **OCR on upload** — When script photos are added (existing `Choose Photo(s)` flow), call Lovable AI (`google/gemini-2.5-flash`, multimodal) once per photo to transcribe the page to plain text. Cache the result on the photo entry so re-opening Script View is instant.
   - Move the AI call server-side to a TanStack server route (`src/routes/api/ocr-script.ts`) so `LOVABLE_API_KEY` stays off the client. Replaces the existing browser-side Anthropic call for photo parsing.
2. **Selectable text overlay in Script View** — Update `script-viewer` to render the photo with the transcribed text shown beneath it (or toggled via a new "Text" / "Image" switch in the script-viewer toolbar). The text pane uses normal `user-select: text` so the user can highlight any passage with the mouse.
3. **Quick-action buttons on selection** — When the user highlights text inside the script-viewer text pane, show a small floating toolbar with two buttons:
   - **→ Parse Script** — appends the selection to the `#script-input` textarea (and scrolls it into view).
   - **→ Selected Balloon** — replaces the text of the currently-selected balloon with the selection (disabled when no balloon is selected). Uses the existing inspector update path so autosave fires.
   Standard Cmd/Ctrl-C still works for any other paste target.
4. **Persistence** — Store the OCR text alongside each script photo in the existing project payload (already saved to Lovable Cloud via the autosave bridge), so reopening the project keeps selectable text without re-running OCR.

## Technical details
- New server route: `src/routes/api/ocr-script.ts` (POST, accepts `{ imageBase64, mimeType }`, returns `{ text }`). Uses the AI Gateway provider helper per the TanStack AI guidance, model `google/gemini-2.5-flash`, system prompt: "Transcribe this comic-book script page exactly, preserving panel headings, character cues, and dialogue order." No tools, no streaming.
- `src/letterer-app.js`:
  - In the existing `file-script-img` change handler, after thumbnail creation, POST each image to `/api/ocr-script` and store the returned text on the photo entry (`photo.ocrText`).
  - Extend `script-viewer` markup with a `<div id="script-viewer-text">` pane and a toolbar toggle button (Image / Text). Render `photo.ocrText` into the pane when active. Show a spinner placeholder while OCR is in flight.
  - Add a `selectionchange` listener scoped to `#script-viewer-text` that positions a floating toolbar (`#script-selection-actions`) with the two buttons described above.
  - Wire button 1 to append to `#script-input`. Wire button 2 to call the existing balloon-text update path used by the inspector textarea (so it fires the same `letterer:change` event the autosave already listens for).
- `src/letterer-bridge.js`: include `photos` (with `ocrText`) in `serialize()` / `load()` if not already covered, so OCR text persists per project.
- `src/letterer.css`: minimal styles for the new text pane, toggle button, and floating selection toolbar — using existing tokens (`--panel`, `--panel-2`, `--accent`, `--text`, `--text-dim`, `--border`).
- No database schema changes; the existing `projects.data` JSONB already holds the full project payload.

## Out of scope
- Re-positioning text to overlay precisely on the photo (no bounding-box layout) — text appears in a separate selectable pane.
- Editing the OCR text in place (it's read-only; user copies what they need).
- Bulk re-OCR of previously uploaded photos that lack `ocrText` is handled lazily on first open of Script View.
