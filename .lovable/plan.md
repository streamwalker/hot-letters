## Update site metadata, favicon, and social previews

**Branding chosen**
- Title: "Hot Letters - powered by Celsius"
- Description: "Professional comic book lettering — balloons, captions, and script parsing in your browser."
- Favicon: NDF hexagon badge
- Social/OG image: Tri-Planetary Coalition shield

### Steps

1. **Add image assets**
   - Copy `user-uploads://Image_5-4-26_at_12.28_AM.png` → `public/favicon.png` (NDF badge, used as favicon + apple-touch-icon).
   - Copy `user-uploads://Image_5-4-26_at_12.27_AM.png` → `public/og-image.png` (TPC shield, used as og:image + twitter:image).

2. **Update `src/routes/__root.tsx` head()**
   - `title`: `Hot Letters - powered by Celsius`
   - `description`: `Professional comic book lettering — balloons, captions, and script parsing in your browser.`
   - `og:title`, `og:description`: same as above
   - Add `og:image` and `twitter:image` → `/og-image.png` (with `og:image:width` 1200 / `height` 630 hints — actual file is the TPC shield as-is)
   - Switch `twitter:card` from `summary` to `summary_large_image`
   - Remove `twitter:site` `@Lovable`
   - Add `links` entries: `{ rel: "icon", href: "/favicon.png", type: "image/png" }` and `{ rel: "apple-touch-icon", href: "/favicon.png" }`

3. **Verify** the preview tab shows the new title + NDF favicon, and that `/og-image.png` and `/favicon.png` load.

### Out of scope
- Generating a separate, optimized 1200×630 OG composition (uses TPC shield as uploaded).
- Per-route metadata for sub-pages.
- Manifest / PWA icons.