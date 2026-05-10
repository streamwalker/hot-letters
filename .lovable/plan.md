## Goal

Make the hologram emitter pick its color palette automatically from the active dashboard theme (the `.dark` class on `<html>`, falling back to `prefers-color-scheme`). It should switch live when the theme flips — no reload needed.

## Approach

Drive every hologram color through CSS custom properties set on the emitter root, then expose two palettes via a small `useTheme` hook. All colors flow through variables so the existing structure (keyframes, gradients, sliders) keeps working untouched.

### Palette

| Token              | Dark (today)             | Light (new)               |
|--------------------|--------------------------|---------------------------|
| `--holo-core`      | `180,230,255` (icy blue) | `255,235,200` (warm core) |
| `--holo-glow-rgb`  | `120,200,255`            | `120,90,210` (indigo)     |
| `--holo-base-1`    | `#9ad6ff`                | `#fff4d6`                 |
| `--holo-base-2`    | `#3a8fd1`                | `#a07ad8`                 |
| `--holo-base-3`    | `#0a2540`                | `#3b1f6b`                 |
| `--holo-border`    | `150,220,255,0.6`        | `120,90,210,0.55`         |

The light palette uses indigo/violet so the hologram still reads as a glowing object against a bright background instead of vanishing into pale blue.

### Code changes

**`src/routes/_authenticated/index.tsx`**

1. Add a small `useTheme()` hook in the same file (no new files):
   - State `"dark" | "light"`, initialized from `document.documentElement.classList.contains("dark")` then `prefers-color-scheme`, defaulting to dark to match today.
   - `MutationObserver` on `<html>` for `class` attribute changes → updates state when login or any future toggle flips the class.
   - `matchMedia("(prefers-color-scheme: dark)")` listener for OS-level changes (only used when the explicit class isn't present).
   - SSR-safe (returns `"dark"` on server).

2. `HologramEmitter` accepts no new prop; calls `useTheme()` internally.
   - Builds a `palette` object based on theme.
   - Sets CSS variables on the root wrapper `<div>` via `style={{ ["--holo-core"]: palette.core, ... }}`.
   - Replaces hardcoded `rgba(120,200,255,...)`, `rgba(180,230,255,...)` literals in the inline `<style>` block, beam `conic-gradient`, base `radial-gradient`, dot `background`/`boxShadow`, and border with `rgb(var(--holo-glow-rgb) / <alpha>)` / `var(--holo-base-1)` etc.
   - The existing `glow` and `speed` props keep working — alpha multipliers wrap the same variables.

3. `HologramControls` panel: also theme-adaptive surface. Replace the hardcoded deep-navy `background`/`color`/`border` with theme-derived values (dark: today's deep navy; light: white-glass `rgba(255,255,255,0.85)` with indigo border + dark text). Reuses the same `useTheme()` hook.

### Edge cases

- No theme toggle on the dashboard yet — the hook still works because login sets the class and it persists across navigation. If the user later adds a dashboard toggle, this code automatically reacts.
- Reduced-motion: unchanged; only colors are theme-driven, not animations.
- Slider keyframes: the `<style>` template is regenerated whenever `glow` changes, so it picks up theme variables on every render — no stale color issue.

### Files touched

- `src/routes/_authenticated/index.tsx` (only)

### Out of scope

- Login-page hologram styling (none exists; the login uses a different scene).
- Adding a dashboard theme toggle UI.
- Tuning the color tokens in `src/styles.css` — palette lives inline with the component since it's specific to the hologram.
