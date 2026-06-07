# Make exiting mobile view obvious

There is already a "🖥 Desktop" tab in the bottom mobile tabbar that switches back, but it's not discoverable. Make the exit one tap and impossible to miss.

## Changes

- **Top-right floating "Exit Mobile" pill** that is only visible when `body.mobile-mode` is on. Sits above the canvas, fixed to the top-right with safe-area inset padding so it clears the iOS notch. Tapping it calls the existing `setMobileMode(false)` and shows the "Switched to desktop view" toast.
- **Rename the bottom-tabbar tab** from "Desktop" to "Exit Mobile" so the secondary exit point is equally clear. Icon stays 🖥.

## Files touched

- `src/letterer-body.html` — add `<button id="btn-exit-mobile">Exit Mobile View</button>` near the existing `#mobile-tabbar`; update the tabbar button label.
- `src/letterer.css` — style `#btn-exit-mobile`: hidden by default, `display: flex` only under `body.mobile-mode`, fixed top-right, accent background, rounded pill, safe-area top inset, high z-index above sheets.
- `src/letterer-app.js` — wire `#btn-exit-mobile` click to `setMobileMode(false)`.

Out of scope: changing how mobile mode is entered, redesigning the tabbar, or auto-exiting on viewport resize.
