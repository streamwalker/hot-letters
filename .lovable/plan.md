## Level 10 Diagnostic Plan

A full sweep across auth, data, AI endpoints, letterer features, build health, and security. I'll report findings and only fix issues you approve.

### 1. Static / build health
- Re-read `src/letterer-app.js`, `src/letterer-bridge.js`, `src/letterer-body.html`, `src/letterer.css` for stray references, broken IDs, or orphan handlers from recent OCR + export changes.
- Grep for `TODO`, `FIXME`, `console.error`, and unreachable code paths.
- Check Vite dev-server logs and runtime-errors for the most recent errors.
- `lsp--code_intelligence` pass on `src/letterer-app.js`, `__root.tsx`, `_authenticated/index.tsx`, `login.tsx`, `api/ocr-script.ts`.

### 2. Auth + cloud persistence
- Re-read `src/routes/login.tsx`, `_authenticated.tsx`, `_authenticated/index.tsx` to confirm: signup → email verification → login → project loads from `projects` table; logout clears in-memory state.
- Verify `projects` table RLS (already shown owner-scoped) and that the client uses the authed Supabase client only.
- `supabase--linter` for any new database warnings.

### 3. Server function / API health
- Re-read `src/routes/api/ocr-script.ts` for: input validation, LOVABLE_API_KEY usage, error surface, and response shape that `letterer-app.js` consumes (`text` field).
- Grep for any other server functions / fetch targets and confirm their handlers exist.

### 4. Letterer feature smoke (browser)
- Open the preview in the browser tool, sign in if needed (with your approval), and walk through:
  a. Create a new project, upload a script photo → confirm OCR runs and "Text" view shows selectable text.
  b. Highlight script text → "→ Parse Script" appends to parse field; "→ Selected Balloon" updates a placed balloon.
  c. Place a Bangers balloon, click Export PNG → confirm download succeeds (font-embed fix).
  d. Save Project → reload page → project reappears with OCR text intact.
  e. Logout → confirm projects list clears.
- Capture console + network during each step.

### 5. Security pass
- `security--run_security_scan` and `supabase--linter`.
- Triage findings: report, propose fixes, do not auto-ignore.

### 6. Report
- A consolidated diagnostic report listing: what passed, what failed, severity, and a proposed fix list. No code changes are made in this plan-mode pass; once you approve, I'll fix the failures in build mode in priority order.

### Out of scope
- Performance profiling, refactors unrelated to bugs found, redesigns, or new features.
- Destructive actions in the live app (deleting other users' data, rotating keys).