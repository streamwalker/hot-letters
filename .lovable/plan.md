## Goal

Add a small control panel to the dashboard that lets the user adjust the hologram emitter's **glow intensity** and **beam rotation speed** in real time, with the choice persisted across reloads.

## Changes

**`src/routes/_authenticated/index.tsx`**

1. Lift two pieces of state into `Letterer`:
   - `glow` — number `0–2` (multiplier on box-shadow spread/opacity), default `1`.
   - `speed` — number `0.2–4` (multiplier on rotation; rotation duration = `6s / speed`), default `1`.
   Both initialized from `localStorage` (`holo-glow`, `holo-speed`) with safe parse + fallback. Persist on change via `useEffect`.

2. Pass `glow` and `speed` as props into `<HologramEmitter />`. Remove the `aria-hidden="true"` on the emitter root (the controls inside need to be focusable) — keep `aria-hidden` on the purely decorative beam/dots/base children, and add `pointerEvents: "auto"` only on the controls panel container.

3. Inside `HologramEmitter`:
   - Compute `beamDuration = 6 / speed` (seconds), apply via inline `animationDuration` on the beam (replaces the hardcoded `6s` in the existing `animation` shorthand). Keep flicker keyframe duration fixed.
   - Drive the base pulse glow + dot shadow via a CSS variable `--holo-glow` set on the root (e.g. `style={{ "--holo-glow": glow }}`) and update the `<style>` block keyframes / inline `boxShadow` rules to multiply alpha and spread by `var(--holo-glow)`. Simplest impl: inline `boxShadow` on `.holo-base` using template strings derived from `glow` (e.g. `0 0 ${14*glow}px ${2*glow}px rgba(120,200,255,${0.55*glow})`), and remove the keyframe pulse OR keep pulse keyframe but multiply its values via JS-built `<style>` text.
   - Reduced-motion: continue to pause animations; speed slider has no effect when motion is reduced (note in label tooltip).

4. Add a new `<HologramControls />` panel:
   - Position: `fixed`, just above the emitter (e.g. `left: 16, bottom: 190`), small frosted glass card matching the existing sign-out / dialog visual style (deep navy, blue border, subtle shadow), `zIndex: 1500`, `pointerEvents: "auto"`.
   - Two `<input type="range">` rows with text labels and live numeric value display:
     - "Glow" — min `0`, max `2`, step `0.05`.
     - "Speed" — min `0.2`, max `4`, step `0.1`.
   - A small "Reset" text button that restores defaults (`1`, `1`).
   - A collapse/expand toggle (chevron) so the panel can be hidden to a tiny pill if it gets in the way; collapsed state also persisted in localStorage (`holo-controls-open`).
   - Accessibility: each slider has an associated `<label htmlFor>`, `aria-valuetext` showing the friendly value (e.g. "1.5×"), and the panel has `role="group"` with `aria-label="Hologram controls"`. Keyboard arrow keys work natively on range inputs.

## Files touched

- `src/routes/_authenticated/index.tsx` (only file changed)

## Out of scope

- No styling token changes, no new dependencies, no other components affected.
- The login page hologram references aren't in scope — only the dashboard emitter has these controls.
