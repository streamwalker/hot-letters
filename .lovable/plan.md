## Goal

Bring the Hot Letters login scene and the dashboard to life with cinematic motion: floating logo, twinkling cityscape, drifting ships, light pulses, and live-changing console data. Both screens get matched treatment, with `prefers-reduced-motion` honored (gentle pulses kept, large motion disabled).

---

## Login page (`src/routes/login.tsx` + `src/styles.css`)

Layered overlays sit above the static `login-bg.png` background image inside `.login-bg`, all `pointer-events: none`, behind the form (z‑index < 2).

1. **Hot Letters logo motion** (`.login-logo`)
   - Slow vertical float (≈6s ease-in-out) + faint glow pulse on the existing drop-shadow filter (≈4s).
   - Subtle 0.3° rotation sway so it feels suspended, not stiff.

2. **Cityscape window twinkle layer**
   - New absolutely-positioned `<div class="city-twinkle">` clipped to the window region of the bg image (approximate rect tuned for desktop; hidden on mobile where bg is cropped).
   - 30–40 procedurally placed tiny radial-gradient "windows" (deterministic positions/delays generated in JS so SSR matches CSR) animating opacity at slow random intervals (3–9s, staggered delays).
   - A handful of larger building beacons with a slower 2-step blink (red/amber accent).

3. **Flying ships layer** (`.ship-layer`)
   - Generate 2 detailed sprite assets via `imagegen--generate_image` with transparent backgrounds:
     - `src/assets/ship-large.png` — capital ship silhouette, side profile, sci‑fi, glowing engines.
     - `src/assets/ship-small.png` — small fighter/shuttle, side profile.
   - 1 large ship drifts L→R across the upper sky over ~45s; 3–4 small ships at varied sizes, speeds (20–35s), altitudes, and directions (some R→L mirrored via `scaleX(-1)`), with gentle vertical bob.
   - Each ship has a faint blur+glow trail using `box-shadow`/`filter`.

4. **Points of light**
   - 8–10 tiny glowing dots traversing curved paths (CSS keyframes with `translate` + `rotate` on a wrapper) across the sky, slow (15–25s), staggered. Distinct from the city twinkles — these move.

5. **Console screen data** (the consoles are part of the bg image — overlay live readouts on top)
   - Add 3 small absolutely-positioned `<div>`s aligned to the on-image screens (positions tuned in % for desktop only).
   - Each renders monospaced text (Bangers/Inter mono fallback) cycling every 250–800ms via `setInterval` — scrolling hex, a fake waveform built from unicode bars (`▁▂▃▄▅▆▇█`), and a counter/percentage. Use `requestAnimationFrame`-throttled state with cleanup on unmount.
   - Subtle CRT scanline overlay (`repeating-linear-gradient`) and green/cyan tint per screen.

6. **Reduced motion**
   - `@media (prefers-reduced-motion: reduce)`: disable ship translations, point-of-light orbits, logo float/sway, and console data interval (freeze on last frame). Keep city window twinkles and logo glow pulse at slow speed.

---

## Dashboard (`src/routes/_authenticated/index.tsx`)

The dashboard is the letterer editor — no cityscape exists there. Add a matching ambient layer that doesn't interfere with the editor:

1. **Reuse `HologramEmitter`** (already present, bottom-left) — keep as-is.
2. **New `AmbientShips` component** — fixed-position, full-viewport, `z-index: 1`, `pointer-events: none`, behind the editor chrome (which sits at z >= 100 in `letterer.css`). Reuses the same ship sprites: 1 large + 2 small ships drifting slowly across the top 25% of the viewport.
3. **New `ScreenDataTicker`** — small fixed widget bottom-right (mirrors the hologram bottom-left) showing the same scrolling hex/waveform/counter aesthetic so it ties to the login console screens. Toggleable later if it distracts; ships kept very faint (opacity ~0.25).
4. Reduced-motion: ships and ticker freeze; hologram already handles its own.

---

## Technical notes

- **No business logic touched.** Pure presentational additions.
- **SSR safety:** all randomized positions/delays computed from a deterministic seed (index-based math, same pattern as existing `HologramEmitter`). `setInterval` data tickers gated behind a `mounted` state to avoid hydration mismatch.
- **Performance:** animations use `transform` and `opacity` only (compositor-friendly). Ship sprites loaded once with `loading="eager"` on login, `loading="lazy"` on dashboard. Total new DOM nodes ≈ 60 on login, ≈ 12 on dashboard — well within budget.
- **New assets:** `src/assets/ship-large.png`, `src/assets/ship-small.png` (transparent PNGs, `imagegen` premium for clean edges).
- **CSS:** new keyframes added to `src/styles.css` under a `/* Login motion */` block; component-scoped styles inline where they reference deterministic data.
- **Files touched:**
  - `src/routes/login.tsx` (add motion layers + console tickers)
  - `src/routes/_authenticated/index.tsx` (add `AmbientShips` + `ScreenDataTicker`)
  - `src/styles.css` (new keyframes, reduced-motion rules, CRT overlay)
  - `src/assets/ship-large.png`, `src/assets/ship-small.png` (new)

---

## Tuning caveat

The cityscape, console screen positions, and "window region" rectangle are tuned to `login-bg.png` at desktop aspect. After implementation I'll screenshot the preview and nudge the percentages so the twinkles sit inside windows and the data overlays sit on the actual screens rather than floating in space. Mobile crops the bg differently, so the city/console layers are hidden under 720px (ships + points of light + logo motion still play).
