# EsyPOS v8 — Free Offline Point of Sale (PWA)

Runs without a server, installable on mobile. Data stays on the device and can auto-backup to your Google Drive.

**Features:** Sales, due/credit, customer ledger, suppliers & purchases, expenses, returns, hold bills, reports & profit, dark mode, PIN lock, barcode scan, Bluetooth print, CSV export, Google Drive cloud backup.

## Changes in this build
- **Local file backup removed.** Backup is cloud-only via Google Drive (optional sign-in).
- **Full UI in English** (previously Bengali).

## Google Drive setup (one-time, free)
1. https://console.cloud.google.com → new project.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **OAuth consent screen** → External → app name → Scopes: `drive.appdata`, `email`, `profile`, `openid` → **Publish app**.
4. **Credentials → OAuth client ID → Web application**.
5. Add **Authorized JavaScript origins** (no path, no trailing slash), e.g. `https://username.github.io`.
6. Put Client ID in `js/core/config.js`:
   ```js
   window.PROPOS_CONFIG = { googleClientId: 'xxxx.apps.googleusercontent.com' };
   ```

## Cloud backup
- Data is stored in your Drive **private app data folder** as `esypos-data.json` (scope `drive.appdata` only).
- Auto-sync ~12 seconds after changes.
- Daily snapshots (last 14) can be restored from Settings / account card.
- Conflict between devices prompts which data to keep.

## Legal
- Privacy: `privacy.html`
- Terms: `terms.html`
- Provider: MH IT Limited


## v10 — Brand, theme & sign-in
- New simple logo (white "E" monogram on violet). Assets in `assets/icons/` (app/PWA icons) and `assets/logo/` (all logo formats) (PNG sizes, maskable, Apple touch, WebP, JPG, SVG, wordmark, OG image) and `favicon.ico`.
- Violet theme (light + dark), refined navigation, cards, modals and product grid.
- **Google sign-in is mandatory.** The app shows a full-screen sign-in gate until the user signs in; no offline/skip mode.
- **Sign out** (sidebar/drawer footer or Cloud panel) syncs pending changes, clears all data stored on the device, and returns to the sign-in screen. Data stays in the user's Google Drive and is restored on the next sign-in.
- Set `googleClientId` in `js/core/config.js` (Authorized JavaScript origin = your site URL).

## Folder structure
```
index.html, privacy.html, terms.html, manifest.webmanifest, sw.js, favicon.ico
css/        style.css
js/core/    core.js (data), ui.js (modals/theme), config.js (Google Client ID)
js/modules/ app.js (POS/products), people.js, misc.js, settings.js
js/services/ cloud.js (Google sign-in gate + Drive sync), pwa.js
assets/icons/ PWA & favicon icons      assets/logo/ logo in PNG/WebP/JPG/SVG
docs/       README.md
```
Sign-in: required on first open and again whenever the Google session is not active (new browser session / after ~1 hour). Offline with a previous sign-in still opens the cached shop.
