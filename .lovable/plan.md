
# Pro Lettering Tools

Goal: bring the rules from the attached Blambot / "Anatomy of Balloons" pages into the editor as actual tools, not just reference. The headline addition is the **Balloon Connector** (the thin tube between two balloons, distinct from a direct Join), plus several supporting tools.

## 1. Balloon Connector (headline feature)

Today balloons can be **linked** so their bodies merge into a single joined silhouette (the "Join" in Fig. 5.1). Add a second relationship type — **Connector** — for the "Balloon Connector" case: two separate balloons tied together by a narrow tube.

- New balloon field `connectedTo: <id>` (mirrors the existing `linkedTo` model — set on exactly one side of the pair).
- New field `connectorW` per balloon (defaults to `tailW`) so the tube width matches the speaker's tail by default, satisfying the "Consistent Tails" rule.
- Renderer: in a new pre-pass before bodies, draw a quadratic-curve tube between the two balloons' nearest edge points. Tube = fill matching balloon fill + stroke matching balloon stroke, with both endpoints masked by the balloon bodies so the seam is invisible (same masking technique already used for linked pairs).
- Toolbar / inspector:
  - "Connect to…" button on a selected balloon → cursor turns into a target, click a second balloon to connect.
  - "Disconnect" button when a connector exists.
  - Slider for `connectorW`.
- Selection of either balloon highlights the connector. Deleting either balloon clears `connectedTo` on its partner.

## 2. Off-Panel Tail

For the "speaker we can hear but not see" case. New `tailStyle: "offpanel"`:

- A long, gently curving tail (cubic bezier with one control point) instead of a straight triangle, terminating at `tailX/tailY` (which the user drags off the panel).
- A small arrowhead at the tip so it reads as "continues off-panel."
- Default `tailW` is the normal tail width at the balloon but tapers smoothly to a non-zero minimum (see Needle-Tail guard below).

## 3. Needle-Tail guard

Enforce the "no needlepoint tails" rule from #006:

- `makeTailPath` clamps the tip half-width to `max(0.6, strokeW * 0.6)` so the two sides of the tail never collapse into a single line.
- Apply to point, bubbles, and off-panel tails.

## 4. Whisper (dashed) and Radio (jagged) balloon styles

Two new shape modifiers on top of the existing `shape` field:

- `outline: "dashed"` → stroke-dasharray on the body path. Default in the existing `whisper` preset.
- `shape: "jagged"` → new path generator that draws a jagged-rectangle / lightning-bolt outline, used for radio / transmission dialogue. New preset `radio` in the presets table.

## 5. Organic balloon edges (subtle)

Per "Symmetrical vs Organic Balloons" (#019). New per-balloon toggle `organic: boolean` (default off, can be turned on globally in settings):

- When on, the ellipse body path is replaced with a closed cubic-bezier ring whose control points are perturbed by a deterministic per-balloon seed (`hash(b.id)`), amplitude ≈ 3% of `rx`. Stable across re-renders, never jittery in edit.
- Cloud and rect shapes ignore the flag.

## 6. Consistent tail width defaults

Per #006. Add a project-level default `defaultTailW` in `state`:

- New balloons inherit `defaultTailW` instead of the preset's `tailW`.
- Toolbar: "Match tail width to letter O" button — measures the rendered width of "O" in the current dialogue font/size on a hidden canvas and writes the result into `defaultTailW`, then offers "Apply to all balloons on page".

## 7. Tips panel updates

`src/components/lettering-tips.tsx` already runs a linter and shows the Blambot infographics. Extend it:

- Linter additions:
  - Flag balloons that have a `point` tail with `tailW < 4` (needlepoint risk) — info.
  - Flag a page where balloon `tailW` values vary by more than 30% — warn ("Inconsistent tail widths").
  - Flag thought / whisper balloons whose text is not italic (per #004 italics rules) — info.
- New "Tools" tab listing the new actions (Connect balloons, Off-panel tail, Match tail width to "O", Organic edges) with one-line descriptions, so users discover them without reading docs.

## 8. Persistence & export

- Add the new fields (`connectedTo`, `connectorW`, `outline`, `organic`, `defaultTailW`, plus `offpanel` tail style) to `serialize()` / `load()` so projects round-trip.
- Export pipeline (`foreignObjectsToSvgText` and the SVG clone path) already iterates all balloons; the connector pre-pass renders into the same SVG, so PNG export picks it up automatically. Verify no z-order regressions for joined + connected combinations.

---

## Technical notes (for the implementer)

- Files touched: `src/letterer-app.js` (render passes, presets, toolbar handlers, serialize), `src/letterer.css` (button styling for the new toolbar buttons), `src/components/lettering-tips.tsx` (linter + new Tools tab), `src/letterer-body.html` (toolbar markup for Connect / Disconnect / Off-panel / Organic / Match-O).
- Connector geometry: compute the line between the two balloon centers, find the intersection with each ellipse (or bounding box for rect/cloud), and use those two points as the tube endpoints. Control point = midpoint nudged perpendicular by `min(40, distance * 0.15)` for a slight arc.
- Mask strategy mirrors the existing `mask-tailcut-*` setup for joined balloons — generate `mask-connector-${aId}-${bId}` with the two body shapes painted black so the connector stroke vanishes inside the balloons.
- Organic edge bezier ring: 8 anchor points around the ellipse, control points offset by `seedRand(b.id, i) * 0.03 * rx`. Use a stable hash so the shape doesn't change between renders.
- Off-panel tail arrowhead: append a small `<marker>` to the SVG `<defs>` once and reference it from the off-panel tail's `<path>`.
- No backend changes; everything is client-side editor state.

## Out of scope

- Rich-text per-word italic/bold inside a balloon (would require a major text-model rewrite). Italics stays per-balloon for now; the linter just nudges users.
- New fonts beyond what's already loaded.
- Multi-balloon connectors (>2 balloons in a chain) — can be modeled by chaining pairs, but no dedicated UI yet.
