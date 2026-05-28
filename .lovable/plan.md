## Goal

Make **Auto Format Balloon** produce text stacked in a lens/oval silhouette like the reference: short top line, lines progressively widen toward the middle, then narrow again to a short bottom line. The current output is a roughly rectangular block (all lines ~equal width) because the scorer targets aspect 1.7 and picks the partition that *minimizes max line width* — that inherently flattens lines toward equal length.

## What changes

All work happens in `src/letterer-app.js`, in `autoFormatBalloon` and its helpers (`balanceLines`, `partition`, `fitBalloonToText`). No UI, no new fields, no schema changes.

### 1. Sentence-aware pre-segmentation

Before line balancing, split the text into **sentence fragments** at `! ? .` (keeping the punctuation with the preceding fragment). Two rules:

- A short opening fragment (≤ ~14 chars, e.g. `CAPTAIN RHEA!`) becomes its own forced first line.
- Otherwise, fragments are treated as soft break preferences — the partitioner gets a bonus for breaking at a fragment boundary.

This is what produces the iconic `CAPTAIN RHEA!` standalone top line in the reference.

### 2. Lens-shaped width target instead of min-max

Replace the current "minimize the widest line" DP with a partitioner that fits words to a **target width per line** drawn from an ellipse profile:

```text
targetW(i, N, W) = W * sqrt(1 - ((2i+1)/N - 1)^2)
```

where `W` is the widest allowable line (the chord of the ellipse at its middle row). For N=8 this produces a normalized width sequence roughly `[0.33, 0.66, 0.87, 0.99, 0.99, 0.87, 0.66, 0.33]` — exactly the silhouette in the reference.

The greedy fitter walks words left-to-right and closes a line when the next word would exceed that line's target width by more than a small slack (~6%). Sentence-boundary breaks get a slack bonus so they're preferred.

### 3. Pick N (line count) for a taller stack

Current code caps at 6 and prefers fewer lines. Update to:

- Range: `N = 2..min(10, ceil(words/2))`.
- Score = sum of squared deviations between each line's actual width and its lens target width, plus a small penalty for very uneven first/last lines, plus a bonus when a sentence boundary lands on a line break.
- Drop the "prefer fewer lines" term and the aspect-1.7 heuristic. The lens profile itself encodes the desired shape.

For the reference text (~30 words), this naturally selects N=7 or 8.

### 4. Fit the balloon to the new text block

`fitBalloonToText` already sizes `rx/ry` from the rendered text bbox. Two tweaks:

- Use the **widest line** for `rx` (already does this) but add a small extra horizontal pad (~6px) so the longest middle lines don't kiss the outline.
- Compute `ry` from `lines.length * lineH` with the existing 18px vertical pad — unchanged, but it will now produce a taller, more oval balloon because N is higher.

### 5. Keep the existing typography normalizations

Em-dash, ellipsis, whitespace, ALL CAPS — unchanged. Those are already correct.

## Out of scope

- Manual line-break overrides per balloon.
- Different lens profiles for non-oval shapes (rect/burst/cloud) — they keep the current rectangular balancer; only ellipse-family shapes use the lens fitter. Detect via `b.shape`.
- Per-word kerning / tracking adjustments.

## Files touched

- `src/letterer-app.js` — replace `balanceLines` and `partition`, add `segmentSentences` and `lensTargetWidths` helpers, small tweak to `fitBalloonToText`.
