## Goal

When the user performs a meaningful dashboard action (Save, Export, Parse, Add Balloon, autosave commit), the hologram briefly surges: brighter glow, faster spin, an expanding shockwave ring, and a short color tint keyed to the action category.

## Event contract

A single `window` custom event drives everything:

```ts
window.dispatchEvent(new CustomEvent("holo:pulse", {
  detail: { kind: "save" | "export" | "parse" | "balloon" | "autosave", strength?: 0..1 }
}));
```

Anything in the app — including future server jobs — can fire this and the hologram reacts. Strength defaults per kind (autosave 0.4, balloon 0.5, parse 0.8, save 1.0, export 1.0).

Action → kind mapping (capture-phase click listeners attached on `#letterer-root`):

| Selector              | Kind     | Tint           |
|-----------------------|----------|----------------|
| `#btn-save`           | save     | amber          |
| `#btn-export-png`     | export   | green          |
| `#btn-parse`, `#btn-parse-ai`, `#btn-parse-photo` | parse | magenta |
| `#btn-add-balloon`    | balloon  | cyan (default) |
| `letterer:change` event (autosave) | autosave | amber, low strength |

A short cooldown (~250ms) per kind prevents a flood from rapid clicks or autosave bursts.

## Code changes (only `src/routes/_authenticated/index.tsx`)

### 1. Action wiring (inside the existing `useEffect` that injects the letterer scripts)

After the scripts append, add a delegated capture-phase `click` listener on `document` that maps the matched button id to a `kind` and dispatches `holo:pulse`. Also add a `letterer:change` listener that dispatches `{ kind: "autosave", strength: 0.35 }` (debounced to once per 600ms so it doesn't strobe). Both cleaned up in the existing return.

### 2. `HologramEmitter` reactive pulse state

- New state `pulse: { kind, strength, id } | null`. On `holo:pulse`, set state and start a `setTimeout` (~1100ms) to clear it. New events override the timer (last-write-wins).
- Compute `effectiveGlow = glow + (pulse?.strength ?? 0) * 1.5` and `effectiveSpeed = speed * (1 + (pulse?.strength ?? 0) * 2.5)`. Both feed the existing `glow`/`speed` math — no other changes to the beam/dots/base rendering.
- Tint: small `tintMap` from kind → rgb triplet (overrides `palette.glow` for the duration of the pulse via the existing `p.glow` token computation). Falls back to theme palette when no pulse.
- The CSS keyframe templates already re-render on every `glow` change, so updated colors land instantly.

### 3. Shockwave ring

A new `<span class="holo-shockwave" />` rendered conditionally inside the emitter when `pulse` is truthy:
- Absolute, centered on the emitter base (left:50%, bottom:6px).
- 14px square, `border: 2px solid rgba(<tint>, 0.85)`, `border-radius: 50%`.
- New keyframe `holo-shockwave-expand`: scales from 0.4 → 4 and fades opacity 0.95 → 0 over ~1000ms ease-out.
- Keyed by `pulse.id` so each pulse remounts and replays the animation cleanly.
- Hidden under `prefers-reduced-motion` (added to existing reduced-motion media block).

### 4. Pulse log (optional micro-affordance)

Tiny floating chip that appears for ~1.2s above the emitter with the kind label ("SAVED", "EXPORTED", "PARSED", "AUTOSAVED", "BALLOON"). Same fade-in/out timing as the shockwave. Useful feedback when the dashboard is busy and the user might miss the visual surge. Reuses theme tokens from `useTheme()`.

## Behavior tuning

- Cooldown per kind (250ms) and autosave debounce (600ms) keep things from strobing.
- Pulse strength is additive to the user's slider settings — sliders remain the baseline, pulses transiently overshoot.
- If user has slider glow at 0, pulses still show (so the feature is never invisible).
- Reduced motion: only the color tint + chip label fire; no shockwave, no spin-up.

## Files touched

- `src/routes/_authenticated/index.tsx` (only)

## Out of scope

- Editing `letterer-app.js` or `letterer-bridge.js` — we listen for events they already emit and delegate clicks instead.
- New audio/haptics.
- Persisting pulse history.
