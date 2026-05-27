## What happened

The exported PNG shows text mashed together ("STILLA", "ANDMISSING", "DESPERATELYNEED") and overflowing the balloon shapes. The cause is in the `foreignObjectsToSvgText()` helper added in the previous fix (`src/letterer-app.js` ~line 1929).

That helper runs on a **cloned, detached** copy of the overlay SVG:

```js
const svgClone = overlay.cloneNode(true);
...
foreignObjectsToSvgText(svgClone);
```

Inside the helper it reads the balloon text with:

```js
const text = (div.innerText || div.textContent || "").replace(/\s+\n/g, "\n");
```

`Element.innerText` requires the node to be attached to a rendered document — on a detached clone it returns an empty string, so the code falls through to `textContent`. `textContent` concatenates child `<div>` / `<br>` lines with no whitespace, so a balloon whose live DOM is:

```html
<div>STILL</div><div>A LOT OF INJURED AND</div><div>MISSING...</div>
```

becomes the single string `"STILLA LOT OF INJURED ANDMISSING..."`. The word-wrap loop then re-wraps that and produces "STILLA", "ANDMISSING", etc. The same loss-of-line-breaks also makes the text longer than the helper expected, which is why several balloons overflow their shapes.

## Fix

Stop relying on `innerText` of a detached clone. The raw, authoritative text for every balloon already exists in `state.balloons[i].text`. Use that.

1. In `src/letterer-app.js`, change `foreignObjectsToSvgText(root)` to accept the balloon list (or read from `state.balloons`) and look up each `<foreignObject>`'s balloon by walking up to the nearest `[data-id]` ancestor.
2. Use `state.balloons[id].text` as the source string instead of `div.innerText`. This preserves real newlines from the editor and keeps every space between words.
3. Keep reading font-family / size / weight / style / color / letter-spacing from `div.style` exactly as today so the visual styling is unchanged.
4. Keep the existing word-wrap + centered-tspan layout. With the correct source text the wrapped lines will once again fit the balloon width the editor used.
5. Update the call site to pass the balloon list: `foreignObjectsToSvgText(svgClone, state.balloons)`.

No other export logic changes; the `foreignObject`→`<text>` conversion is still required to avoid the canvas-taint `SecurityError` in Safari/Firefox.

## Files touched

- `src/letterer-app.js` — rewrite the text-source line inside `foreignObjectsToSvgText` and its single call site.
