## Goal

Add a per-connector toggle that removes the seam line where the connector tube meets each balloon, so a connected pair reads as one continuous shape (like the reference image).

## UI

In `src/letterer-body.html`, inside the existing **Connector shape controls** block (already shown when a connected balloon is selected), add a checkbox:

- `☐ Seamless join (merge tube with balloons)` — default ON for new connectors, OFF preserves today's look.

Wired the same way as the existing "Organic" / "Dashed" checkboxes in the Balloon Edges section.

## Data

In `src/letterer-app.js`, store `connectorSeamless: true` on the connector **owner** balloon (the same balloon that already holds `connectorW`, `connectorCurve`, `connectorAngleOwner/Partner`). Initialize it to `true` in the "Connect to Another Balloon" handler alongside the other connector defaults, and include it in project save/load and smart-place paths next to the existing connector fields.

## Rendering

In the connector render pass (around lines 952–974) and the per-balloon body pass that follows:

When `owner.connectorSeamless` is true for the pair:

1. Build an SVG `<mask>` per pair (white = visible, black = hidden), using the same `SVG_NS` + `<defs>` pattern already used for the linked-pair masks higher up in the same file.
2. **Tube**: draw fill with no stroke, then draw the tube stroke through a mask that punches out each balloon's interior shape — so the tube's chord/closing stroke that sits inside either balloon disappears.
3. **Balloons**: when rendering each connected balloon's body stroke, apply a mask that punches out the tube polygon — so the balloon outline does not cross the tube opening.

For shapes other than `ellipse` / `rect`, fall back to today's behavior (no masking) since cloud/burst outlines are irregular; the toggle still works visually because the tube fill already matches the balloon fill.

When `connectorSeamless` is false, render exactly as today (visible seam).

## Files touched

- `src/letterer-body.html` — add checkbox inside `#conn-shape-controls`.
- `src/letterer-app.js` — default value, save/load, inspector sync + change handler, masked render branch in the connector + body passes.

## Out of scope

- No change to tail rendering, joined-pair "Split" rendering, or balloon shapes.
- No change to PNG export pipeline beyond what it picks up for free from the shared render path.