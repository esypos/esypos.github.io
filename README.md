<div align="center">

<img src="assets/logo/logo-256.png" alt="EsyPOS" width="96">

# EsyPOS

**Simple POS for Every Business**

Free · Open Source · Offline · Installable · Backup to your own Google Drive

[**Website**](https://esypos.github.io/) · [Privacy Policy](https://esypos.github.io/privacy.html) · [Terms](https://esypos.github.io/terms.html)

<br>

<img src="screenshots/slideshow.gif" alt="EsyPOS screenshots" width="360">

<sub>Sign in · Dashboard · Products · Customers · Purchases · Expenses · Sales · Reports · Backup · Menu</sub>

</div>

---

## v10.15.0 — Drive-first backup, cleaner wording
- Backup never downloads a file; everything goes straight to Google Drive about a second after each change. "Replace with latest backup" first sends any unsent changes, then loads the newest backup.
- Branding: EsyPOS everywhere. Shorter, cleaner on-screen text.

## v10.14.5 — Section lock, security, calmer UI
- **Section lock** (Settings → *Section lock*): pick which sections (Reports, Dashboard, Purchases, Expenses, Settings…) need the owner PIN. Salesmen can sell but cannot open locked sections. Locks re-engage after 1–15 minutes or when the app goes to the background.
- **Security:** PIN is stored as PBKDF2-SHA256 (old PINs upgrade automatically); wrong-PIN lock-out grows 30 s → 1 → 5 → 15 → 30 min; configurable idle auto-lock; Content-Security-Policy added.
- **Cloud backup:** every backup carries a checksum, is read back from Drive and verified; a restore of a damaged file is refused; automatic backups never replace a much larger cloud copy with an almost empty one.
- **UI:** fewer and shorter animations, larger touch targets, no iOS input zoom, better 320 px / landscape / tablet layouts.
- **Two devices, one Google Drive:** backups are now merged, never overwritten. Sales, payments, purchases and expenses from every device are combined; stock = the other device's stock + what this device sold since the last sync; edits and deletions are kept. No "cloud or device data?" question any more. New changes upload 1.5 s after a sale, other devices pick them up within 5 s.
- **Security log** (last 40 unlocks / wrong PINs / lock-outs) and **Backup health** card (verified status, last backup, one-tap local copy download) in Settings.
- **User counter:** set `userCounterUrl` in `js/core/config.js` to your Firebase Realtime Database URL. Each install registers one random anonymous ID; the total shows in the sidebar/menu. Database rules:
```json
{"rules":{"users":{".read":true,"$uid":{".write":"$uid.matches(/^[a-f0-9]{40}$/) && !data.exists()","t":{".validate":"newData.isNumber()"},"$other":{".validate":false}}}}}
```

## v10.13.0 — Accessibility labels, metadata refresh
- Icon-only delete/remove buttons now have accessible labels; images have empty alt text where decorative.
- Backup: single visible file `EsyPOS-Backup.json` in Google Drive, automatic retry, clearer errors.
- Blue professional palette, home page removed (app opens on the Sales Counter).

## v10.12.0 — UI/UX polish
- Cart bar, toast and install/update bars now sit clear of the bottom navigation (no more overlap with the Scan button); the cart icon keeps a fixed round shape.
- Home: one consistent outline icon set, tiles aligned on one icon line (labels may wrap to 2 lines without shifting icons), equal-size popular-product cards with the whole picture visible.
- Sales counter: product pictures are no longer cropped, names clamp to 2 lines, price and stock never collide, stock/low-stock tags stay inside the card.
- Layout tuned for small phones (320px), phones in landscape, tablets and desktop; bottom nav stays centred and compact on tablets.

## v10.9.0 — New Home screen
- **Home** (`js/modules/home.js`): greeting, Today's Sales card, 8 quick actions, auto-playing **banner slider** (swipe or tap the dots; edit `Home.SLIDES` to change slides), Popular Products, alert bell, and a mobile **bottom navigation** with a centre Scan button. The app now opens on Home.
- **Google Drive stays connected**: the connection remains on until you Sign out. When Google's short-lived access token expires, the first tap after that renews it silently (browsers only allow this inside a tap), so the "Reconnect" step is no longer needed in normal use.

## v10.8.0 — Barcode scanning upgrade
- **USB / Bluetooth scanners** (`js/core/wedge.js`): works on POS, product form, product list search, Barcode Labels and Purchase; reads the physical key so any keyboard language (e.g. Bangla) is fine. Safe matching: `]C1` prefix, leading zeros, never guesses when two products share a barcode.
- **Camera scanner**: native `BarcodeDetector` where available, otherwise an offline built-in reader (`js/core/linear.js`: EAN-13/UPC-A, Code 128) for iPhone, Firefox and desktop. Torch, zoom, *Type code*, *Keep scanning*. (QR needs Chrome.)
- Unknown barcode → **Add product** bar opens a new-product form with the code filled in. Duplicate warning while typing/scanning a barcode.
- **Purchase**: scan, camera or name search to add stock-in rows.
- CSV import: an empty barcode cell no longer erases the saved barcode; Excel-damaged codes (`8.9E+12`) are skipped with a warning.

## About

EsyPOS is a free, open-source point-of-sale (POS) web app for small shops and growing businesses. It works in any browser, installs like a native app, runs offline, and backs up your data to **your own Google Drive**. No server, no subscription.


## Open Source

EsyPOS is an open-source project released under the **[MIT License](LICENSE)**. Anyone can run their own business with their own Google account. No third-party company or middleman is involved. You are free to use, modify and distribute it, including commercially.


## Features

- **Sales Counter:** search, barcode scan, discount, tax, hold bills
- **Payments:** Cash, Card, Mobile banking, Due
- **Receipts:** print, Bluetooth printer, WhatsApp / SMS share
- **Customers & Due:** ledger, collection, reminders
- **Products & Stock:** low-stock alerts, expiry, CSV import / export
- **Purchases, Returns & Expenses**
- **Reports:** sales, profit, collections, dashboard
- **Security:** PIN lock, automatic Google Drive backup
- **Feels like a native app:** haptic feedback, back-button handling, app-icon shortcuts (long-press the icon), instant launch from an offline cache
- **Smooth on low-end phones:** coalesced saves, cached product photos, paged lists, no heavy blur effects
- **Barcode & scanner hardening (v10.8.0):** (1) Offline-cache bug fixed — `pwa.js` still said v10.7.1, so it deleted the live v10.7.5 cache; both files now say v10.8.0. (2) Direct TSPL printing: stray black bits at the right edge when the label width in dots was not a multiple of 8 (e.g. 300 dpi, 58×40 mm) — padding is now white and the bitmap width is whole bytes. (3) Scanner: products are added automatically on scan — with an Enter or Tab suffix, or with NO suffix (finishes after a short pause), whether the cursor is on the page, in the search box, or even in another POS field; normal typing is never mistaken for a scan; scanner prefixes like `]C1` are ignored; the desktop *Scanner* badge flashes green/red. (4) Bluetooth label printing falls back to 20-byte chunks if the printer rejects larger writes. (5) A4-sheet mode is no longer hijacked by direct printing. (6) Printer setup has a *Scan check* box: Test print → scan the sticker → ✓/✗.
- **Printer profile + direct printing (v10.7.5):** Settings → Label & receipt printer: connect a USB/Bluetooth printer once, the model is recognised, you confirm the loaded paper, and labels/receipts follow that size automatically. Direct TSPL/ZPL printing draws whole-dot bars at the printer's own dpi; falls back to browser print (sized from the profile) when the OS driver owns the printer.
- **Barcode scan fix (v10.7.4):** Stickers now scan reliably. Code 128 uses compact subset C for digits; bars are drawn on a whole-dot grid in real millimetres (203/300/600 dpi selectable); one label per page at the exact label size (or A4 sheet mode); EAN-13 is only drawn for valid numbers (others use Code 128 so the scan equals the stored code); POS scan matching is case-insensitive and tolerant of slow Bluetooth scanners.
- **Barcode generator (v10.7):** Generate unique Code 128 / EAN-13 / QR codes (works offline), duplicate check, label preview + print with copies; prefix, default format and sequence counter in Settings
- **Business types (v10.7):** Retail, Restaurant, Pharmacy, Grocery, Electronics, Clothing, Wholesale — the product form shows the matching extra fields
- **Sizes & add-ons (v10.7):** Variants (e.g. 6″/9″/12″) and add-on groups (required / optional) with a Configure sheet at the counter; every combination is its own cart line, stock is deducted from the base product
- **Camera scanning:** barcode scan with built-in permission help (Chrome on Android); USB and Bluetooth scanners work everywhere

## Quick Start

1. Open **[esypos.github.io](https://esypos.github.io/)**
2. Sign in with Google once and add products (the app then opens instantly, and reconnects to Drive in the background)
3. On phone: **Add to Home screen**

## Privacy

- Data stays on **your device**. No backend server, no analytics, no ads.
- Google sign-in is optional and saves one backup file (EsyPOS-Backup.json) in **your** Drive and cannot see other files.
- Camera (barcode) and Bluetooth (printer) are used only when needed.

[Full Privacy Policy](https://esypos.github.io/privacy.html)

## Terms

- Free and provided **"as is"**, without warranty.
- You are responsible for backups and the accuracy of your records.
- Tax / VAT figures are a guide only.

[Full Terms of Service](https://esypos.github.io/terms.html)

## Owner

**Mehedi Hasan** · [Facebook](https://www.facebook.com/mehedi.exx)

## License

MIT © 2026 Mehedi Hasan. See [LICENSE](LICENSE). Bundled fonts and icons: see [fonts/LICENSES.txt](fonts/LICENSES.txt).
