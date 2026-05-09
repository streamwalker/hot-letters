# Plan: Recreate Comic Book Letterer (v002)

The upload is a 2,769-line standalone HTML app: dark 3-column UI (script tools / canvas / inspector), SVG-based speech balloon editor with drag/resize/tail handles, script parsing (regex + Anthropic AI + photo OCR), zoom, undo/redo, save/load JSON project, PNG export, and a mobile layout toggle. ~70 imperative DOM/SVG functions wired with `addEventListener`.

## Approach

Rewriting 2.7k lines of imperative SVG/pointer code into idiomatic React would risk behavior drift. To recreate it **exactly**, port the original HTML/CSS/JS verbatim into a single TanStack route, executed inside a `useEffect` after the markup mounts. This keeps pixel- and behavior-parity with the source while still living inside the app.

## Steps

1. **Home route (`src/routes/index.tsx`)**
   - Replace the placeholder with a `Letterer` component.
   - Render the exact markup from the `<body>` of the upload (header toolbar, left aside, center `#canvas-wrap` with `#overlay` SVG, right inspector, mobile bottom-sheet handle).
   - In `useEffect`, inject the original `<script>` block once via a `<script>` tag append (so `$()` lookups, global `state`, drag handlers, and `window`/`document` listeners run unchanged).
   - Set `<head>` via TanStack `head()`: title `Comic Book Letterer — v002`, viewport with `viewport-fit=cover, user-scalable=no`, theme-color, Apple mobile meta tags, Google Fonts preconnect + Bangers/Bungee/Comic Neue/Kalam/Luckiest Guy/Permanent Marker stylesheet link.

2. **Styles**
   - Copy the original `<style>` block verbatim into `src/letterer.css` and import it from the route. Keep the dark token palette (`--bg #1a1d23`, `--accent #f5a623`, etc.) scoped to this page; do not touch global `src/styles.css`.

3. **Script behavior preserved as-is**
   - Balloon model, undo/redo snapshots, zoom in/out/fit, drag-from-chip placement, pointer-based move/resize/tail editing, SVG path generators (ellipse / cloud / burst / tail / unified), reading-order overlay, selection chrome, inspector two-way binding, font/color controls.
   - Script parsing: regex (`Parse Script`), Anthropic AI parse (`AI Parse`), and photo OCR (`Choose Photo(s)` → AI). API key stored in `localStorage` via the original `Set Anthropic API key…` link, exactly as in the source.
   - Save/Load Project (JSON file), Export PNG (rasterize current view), Mobile toggle.

4. **Asset/runtime notes**
   - Fonts loaded from Google Fonts (same `<link>` as source).
   - No backend needed; Anthropic calls go directly from the browser using the user-supplied key, matching original behavior.
   - Pure client component — no SSR data, no server functions.

## Technical details

- File layout:
  - `src/routes/index.tsx` — TanStack route, mounts markup + injects script in `useEffect`, sets `head()` meta/links.
  - `src/letterer.css` — verbatim copy of the source `<style>` contents.
  - `src/letterer-app.ts?raw` — verbatim copy of the source `<script>` contents, imported as a raw string and appended as a `<script>` element on mount (cleaned up on unmount to avoid duplicate listeners during HMR).
- `useEffect` guards against double-execution in dev (ref flag) so the global `state` object isn't re-initialized twice.
- Remove the placeholder `<img data-lovable-blank-page-placeholder>` from `index.tsx`.
- No changes to `__root.tsx`, router, or design tokens.

## Out of scope
- No refactor into idiomatic React components.
- No backend proxy for the Anthropic API (user-provided key in browser, same as source).
- No new features, theming, or responsive changes beyond what the source already implements.
