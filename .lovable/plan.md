## Goal
Replace the existing login background image with the newly uploaded `Comic_Letterer_Dashboard.png`, keeping the current overlay layout (Hot Letters logo top-left, glass login card aligned over the baked-in Astralnaut Studios card on the right, and the mobile-responsive stacked variant).

## Steps

1. **Copy the upload** into project assets, overwriting the current background:
   - `user-uploads://Comic_Letterer_Dashboard.png` → `src/assets/login-bg.png` (overwrite)
   - Keep the same filename so no import changes are needed in `src/routes/login.tsx`.

2. **Verify alignment is still correct.** The new image has the same composition as the previous one (same Astralnaut Studios card position on the right, same logo placement on the left). The existing form positioning (`top: 52%`, `right: 4.5%`, `width: min(360px, 30vw)`) and desktop logo position (`top: 3vh`, `left: 3vw`) should still line up. If after swapping the form drifts off the baked-in card area, nudge `top` / `right` / `width` values in `src/routes/login.tsx` only.

3. **No other code changes.** Mobile layout, autofill styles, tap targets, and accessibility labels all stay as-is.

## Out of scope
- Redesigning the login form
- Changing colors, typography, or the Hot Letters logo
- Touching anything outside the `/login` route