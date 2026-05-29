## Problem

Today the connector tube auto-draws a single shape between two balloon centers using a fixed arch (`Math.min(40, len*0.12)`) and a width derived from `tailW`. The result is the bulging, top-heavy lobe in the first screenshot. The Blambot reference shows a narrow, mostly straight tube with a gentle curve and clean joins — and a letterer manipulates each connector by hand.

## Goal

Give every connector on-canvas handles so the user can resize, reshape, and re-aim it — and mirror those controls in the inspector.

## Changes

### 1. Connector data model (`src/letterer-app.js`)

Per-connector overrides stored on the "owner" balloon (the one whose `connectedTo` is set, sorted by id to keep one source of truth):

- `connectorW` (already exists) — tube width in px. Default lowered to `~10` (was effectively `tailW`, often 20+).
- `connectorCurve` — signed perpendicular offset of the midpoint in px. Default `0` (straight tube) instead of the current auto-arch.
- `connectorAttachA` / `connectorAttachC` — angle in radians around each balloon's center for the attachment point. Default `undefined` → falls back to current "ray toward other center". Lets the user drag the join up/down the balloon edge.

### 2. Tube geometry

Rewrite `makeConnectorTubePath`:
- Resolve each endpoint via `ellipsePoint(b, angle)` when an override angle is set, otherwise current `balloonEdgePoint`.
- Use a single quadratic curve per side through one shared mid control point offset by `connectorCurve` along the perpendicular. `connectorCurve === 0` ⇒ effectively straight tube (matches the right-hand connector in Fig. 5.1).
- Width tapers linearly between `widthA` and `widthC`; default both to `connectorW`.

### 3. On-canvas handles

In the existing connector render pass, when either connected balloon is `state.selectedId`, also append three handles to the overlay (same visual language as the existing tail-tip handle):

- **Width handle** — small square at the midpoint, perpendicular to the tube. Dragging perpendicular to the tube axis adjusts `connectorW` (4–60 px).
- **Curve handle** — circle at the midpoint along the tube centerline. Dragging perpendicular adjusts `connectorCurve` (−120…120). Snap to 0 within ±4 px.
- **Two attachment handles** — small dots on each balloon edge. Dragging slides the join around that balloon (updates `connectorAttachA` / `connectorAttachC`).

Wire `pointerdown/move/up` like the existing tail-tip drag (search for `tailX` drag handler). Each drag pushes a single undo entry on `pointerup`.

### 4. Inspector (`src/letterer-body.html` + sync in `src/letterer-app.js`)

Inside the existing **Connect / Split** section, when the selected balloon is connected, reveal:

- Width slider (4–60).
- Curve slider (−120…120) with a "Straighten" button that resets to 0.
- "Swap attachment side" button that flips the join to the other side of each balloon (rotates each attach angle by π).

The existing "Remove Connector" button stays.

### 5. Defaults that fix the screenshot

- New connectors are created with `connectorW = round(min(a.rx, c.rx) * 0.18)` clamped to 8–16, and `connectorCurve = 0`. That alone produces the narrow, near-straight tube from the reference instead of the current bulging arch.

### 6. Persistence

Add the new fields to the project save/load (`btn-save` / `file-load` handlers already serialize the full balloons array, so this is automatic) and to the smart-place / autoformat paths so they don't strip the overrides.

## Out of scope

No changes to tails, joined-pair (Split), or balloon shapes. Export PNG already renders from the same path, so it picks the new geometry up for free.
