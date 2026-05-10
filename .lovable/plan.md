## Goal
Make the small and large ships drift across the cityscape on the login screen along **gentle curved paths** instead of nearly-straight horizontal lines, while keeping the slow, peaceful pace.

## Changes (all in `src/styles.css`, plus a small tweak in `src/components/scene-motion.tsx`)

### 1. New curved keyframes (`src/styles.css`)
Replace the current 3-stop `ship-drift-ltr` / `ship-drift-rtl` keyframes with smoother multi-stop curves that gently rise then dip (or vice versa). Two variants per direction so neighboring ships don't fly in lockstep:

- `ship-curve-ltr-a`: 0% → off-screen left, baseline; 25% → +25vw, −18px; 50% → +50vw, −34px; 75% → +75vw, −12px; 100% → off-screen right, +6px.
- `ship-curve-ltr-b`: similar but inverted arc (dips down then rises) and slightly different vertical amplitudes (24/40/20px).
- `ship-curve-rtl-a` / `ship-curve-rtl-b`: mirror versions including `scaleX(-1)` on every stop (current rtl already does this).
- All keyframes use `cubic-bezier(.45,.05,.55,.95)` style easing applied via the animation declaration (`ease-in-out`) for a gentle, natural arc — no linear timing.

Vertical movement stays subtle (max ~40px) so ships still feel like they're drifting horizontally across the skyline, just on a curve.

### 2. Use eased timing (`src/components/scene-motion.tsx`)
In `Ships`, change the inline `animation` from `linear` to `ease-in-out`, and pick one of the four curve variants per ship:

```
const variant = rnd(i * 13.7) > 0.5 ? "a" : "b";
const name = `ship-curve-${dir}-${variant}`;
animation: `${name} ${s.dur}s ease-in-out ${s.delay}s infinite`,
```

Slow the pace slightly so the curves read as graceful (large ship: 75s; small ships: 30–55s instead of 22–40s).

### 3. Reduced motion
Existing `.ship { animation: none !important; }` block under `prefers-reduced-motion` already covers the new keyframes — no change needed.

## Out of scope
- Cityscape windows/beacons, console screens, points-of-light, hologram emitter — untouched.
- No changes to ship art, count, sizes, opacity, or z-index.
- No new assets or dependencies.

## Files touched
- `src/styles.css` — replace the two ship keyframes with four curved variants.
- `src/components/scene-motion.tsx` — pick variant per ship and switch to `ease-in-out`.
