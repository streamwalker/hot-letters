## Problem
The remaining export overflow is coming from the export-only conversion from HTML text (`foreignObject`) to native SVG `<text>`. The live editor clips and centers text inside a rectangular text box, but the exported SVG text is being laid out with a simpler width-only wrapper and no safety fit. Two things can push it outside the balloon:

- The export wrapper allows lines up to the full text-box width, even though an oval is narrower near the top and bottom.
- Native SVG text metrics differ from the live HTML/flexbox rendering, so a line that appears acceptable in the editor can export a few pixels wider/taller.

## Plan
1. Add shared export text layout helpers in `src/letterer-app.js`:
   - normalize balloon text while preserving intentional line breaks
   - measure text with font weight, italic, tracking, and actual font family
   - wrap long words/phrases safely instead of letting any line exceed the available width
   - compute an oval-safe line width so top and bottom lines do not run into the balloon edge

2. Update `foreignObjectsToSvgText()` so export uses a stricter fitting pass:
   - start from the live balloon text in `state.balloons`
   - fit within a reduced safe area inside the balloon, not the full foreignObject rectangle
   - if text is still too wide or tall, reduce the export font size slightly until it fits
   - keep the text centered and preserve style, color, weight, italic, and tracking

3. Improve the normal balloon sizing helper so future placed/auto-formatted balloons get a little more breathing room:
   - include tracking in width measurements
   - use the same line-height assumptions as export
   - add extra padding so exported text has a margin from the balloon stroke

4. Leave the on-screen editor behavior unchanged except for newly auto-sized balloons being slightly safer. The export will still avoid `foreignObject`, so the prior Safari/Firefox export security fix remains intact.

## Validation
After implementation, I’ll inspect the modified code paths and use the existing build checks run by the harness. The expected result is that exported PNG text wraps and/or slightly scales down rather than crossing the balloon outline.