## Problem

The new lens balancer is producing 4 very long lines instead of the desired ~8-line lens stack. The current scorer rewards lens-shape *proportions* but not the overall *aspect* of the rendered block, so a partition like N=4 with k=1.3 (very wide budget) scores well — its 4 lines do trace `[.66, .99, .99, .66]` correctly, just at a huge maxW. The "anti-oval" penalty (0.4 each) is too weak to overcome that.

The reference image is ~8 lines tall with widest line ≈ "OR THE GAIANS REACH THE LUMINATOR," — a block aspect (widest line ÷ total height) around **1.7–1.9**.

## Fix (single file: `src/letterer-app.js`, `balanceLinesLens` only)

1. **Add an aspect target to the score.** Compute `aspect = maxW / (N * fontSize * 1.18)` for each candidate and add `Math.pow(aspect - 1.75, 2) * 0.6` to the score. This pulls the optimizer toward tall lens stacks (target 1.75) instead of flat 4-liners (which hit aspect ~4+).

2. **Cap absolute line width.** Reject any candidate where `maxW > fullW * 0.55` (i.e. no single line may exceed ~55% of the all-words width). For the reference text (~30 words) this caps lines at ~16–18 words rendered width and forces N ≥ 6.

3. **Strengthen the anti-oval penalty.** Bump first/last-row-too-wide penalties from `0.4` to `0.9`, and only apply when first/last width is ≥ 90% of its neighbor (the current `0.98` threshold rarely fires).

4. **Expand the budget sweep.** Replace `[0.85, 1.0, 1.15, 1.3]` with `[0.75, 0.9, 1.0, 1.1, 1.25]`. Narrower budgets are needed to make N=7–8 fit cleanly without overflowing into the leftover-words append branch.

5. **Penalize leftover overflow.** When `fitToTargets` appends overflow into the last line (the `if (i < words.length)` branch), mark that candidate by returning a flag; in the scorer add `+1.0` so clean fits are strongly preferred.

## Out of scope

- No changes to `fitBalloonToText`, `segmentSentences`, `lensTargetWidths`, `balanceLinesRect`, typography normalization, or any UI.
- No new balloon fields.

## Expected result on the reference text

With these four changes, N=7 or N=8 with k≈0.9–1.0 wins the score, producing the `CAPTAIN RHEA!` forced top line followed by 7 progressively widening-then-narrowing lines, with `fitBalloonToText` then sizing the oval to match.
