## Problem

The "Log out" button in `src/routes/_authenticated/index.tsx` is `position: fixed` at `top: 8, right: 8` with `z-index: 2000`. It floats over the letterer app's top toolbar (`src/letterer-body.html`), covering the rightmost buttons (Undo ↶, Redo ↷, Mobile).

## Fix

Reserve space at the right edge of the letterer header so the floating Log out button no longer overlaps it.

1. In `src/letterer.css`, add right-side padding to the `header` rule (e.g. `padding: 0 140px 0 12px`) so toolbar buttons stop before the Log out region. Use a slightly smaller reserved gutter in `body.mobile-mode header` (e.g. `padding-right: 110px`) to match the smaller button.
2. Keep the Log out button's existing fixed position and z-index — no behavior change, just no overlap.

### Alternative considered

Move the Log out button into the letterer header DOM instead of floating it. Rejected because the auth/logout flow lives in a React route and the letterer header is static HTML mounted by `letterer-bridge.js`; injecting React into it adds complexity for a purely visual issue.

## Files touched

- `src/letterer.css` — add right padding to `header` and `body.mobile-mode header`.
