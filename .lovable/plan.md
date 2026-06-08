## Goal
Stop the raw "internal server error" when Lovable AI credits are exhausted (HTTP 402) or rate-limited (429). Show a friendly message and disable the AI buttons until the user retries.

## Scope
Affects the three AI-powered features:
- Trace Existing Balloon → `/api/ocr-balloon`
- OCR Script → `/api/ocr-script`
- Clean Up → `/api/cleanup-image`

## Changes

### 1. Server routes — return structured error JSON
In `src/routes/api/ocr-balloon.ts`, `src/routes/api/ocr-script.ts`, and `src/routes/api/cleanup-image.ts`:
- When the AI gateway returns 402 or 429, forward that status code and respond with `{ error: "credits_exhausted" | "rate_limited", message: "..." }` instead of letting it bubble as a generic 500.

### 2. Client — graceful toast + state flag (`src/letterer-app.js`)
- Wrap the three `fetch` call sites so they parse the JSON error body.
- On 402: toast "Lovable AI credits exhausted — please top up in workspace billing settings to keep using AI features." Set a module-level flag `aiDisabled = true`.
- On 429: toast "AI is rate-limited — please wait a moment and try again." (Does not set the flag.)
- On success: clear `aiDisabled`.

### 3. Client — pre-flight guard on the buttons
- For the Trace Balloon, OCR Script, and Clean Up toolbar buttons (in `src/letterer-body.html` / handlers in `src/letterer-app.js`):
  - When `aiDisabled` is true, add a `disabled` attribute + a tooltip ("AI credits exhausted — top up to re-enable") and short-circuit the handler with the same toast.
  - Re-enable automatically on the next successful AI response or on page reload.

### 4. No backend/business-logic changes
- No database, auth, or schema work. Whiteout/cleanup geometry, balloon tracing logic, and project save flow are untouched.

## Out of scope
- Persisting `aiDisabled` across reloads (it resets on refresh so the user can retry after topping up).
- Adding a separate "check credits" endpoint.
