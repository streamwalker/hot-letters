## Replace login screen background

The first screenshot is the login page's hero/background, imported from `src/assets/login-bg.png` in `src/routes/login.tsx`.

### Steps
1. Copy the uploaded `COA Issue 1 CGI Page 13.png` to `src/assets/login-bg.png` (overwrite), so every existing reference (`loginBg`) picks up the new art with no code changes.
2. Leave `src/routes/login.tsx` untouched — the import, sizing (`background-size: cover`), and mobile positioning all continue to work.

### Notes
- No layout/code changes required; the form card, logo, and motion layers stay in place over the new background.
- If the new art looks too busy behind the form, a follow-up can darken the overlay — not part of this change.