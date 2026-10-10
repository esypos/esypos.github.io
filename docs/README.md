# EsyPOS — Simple POS for Every Business

**EsyPOS** is a free, offline-first Point of Sale (POS) web app for small and medium shops. It runs in any modern browser, installs on a phone or computer like a native app (PWA), keeps working without internet, and automatically backs up your shop data to **your own Google Drive**. No server, no monthly fee, no database to manage.

> Current version: **v10.2** · Provider: MH IT Limited · Languages: English UI (Bengali product/customer names and the `৳` currency are fully supported)

---

## বাংলায় সংক্ষিপ্ত পরিচিতি

EsyPOS একটি ফ্রি, অফলাইনে চলা POS সফটওয়্যার। দোকানের বিক্রি, স্টক, বাকি (due), সরবরাহকারী, খরচ, রিটার্ন ও লাভ-ক্ষতির রিপোর্ট সব একই অ্যাপে। মোবাইল ও ডেস্কটপ দুই জায়গাতেই চলে, ইন্টারনেট না থাকলেও বিক্রি করা যায়, আর ডেটা আপনার নিজের Google Drive-এ নিজে থেকেই ব্যাকআপ হয়। কোনো সার্ভার বা মাসিক খরচ নেই।

---

## Highlights

| | |
|---|---|
| **Works offline** | All data lives on the device; the app shell is cached so the shop opens without internet. |
| **Automatic cloud backup** | Google sign-in + private Drive folder (`drive.appdata` scope only). Lost or changed phone? Sign in and everything returns. |
| **Mobile and desktop** | Touch-first POS on phones, a docked cart and sidebar on desktop, USB/Bluetooth barcode scanners supported. |
| **Fast billing** | Search, barcode scan, quick-cash buttons, hold/resume bills, keyboard shortcuts. |
| **Complete shop accounting** | Stock, customer dues, suppliers, purchases, expenses, returns, profit reports. |
| **Private and secure** | Optional 4-digit PIN lock, data is only in your device and your own Drive. |

---

## Features

### Sales Counter (POS)
- Product grid with photo, price, live stock and **Low stock / Out of stock / Expired** tags.
- Search by name, barcode or category; category chips.
- **Barcode scanning** three ways: phone camera, USB scanner, Bluetooth scanner (keyboard-wedge scanners work anywhere in the POS screen).
- Cart with quantity +/−, per-line price/quantity edit, discount (% or ৳), tax %.
- **Hold bills** and resume later; customer selection; walk-in or named customer.
- Checkout with **Cash, Card, Mobile banking or Due**; quick-cash chips, automatic change, partial payment.
- Credit limit warning, expired-product warning, out-of-stock protection.
- Animated add-to-cart feedback, optional click sounds.

### Receipts and printing
- On-screen receipt with shop name, address, phone, invoice number, customer, items, totals, paid/change/due, notes and footer.
- **Print** (browser print, 58 mm or 80 mm paper), **Bluetooth thermal printer** (image mode supports Bengali; text mode is faster), share via **WhatsApp** or **SMS**.

### Customers and dues
- Customer list with phone, address, opening due and credit limit.
- Automatic **due balance** per customer, advance balance if overpaid, full **ledger** (sales, collections, returns).
- **Due collection** with Cash / Mobile / Card and WhatsApp confirmation message.
- One-tap **reminder** by WhatsApp or SMS. CSV export.

### Products and stock
- Name, photo, barcode, category, unit, cost price, sell price, stock, low-stock limit, expiry date, "track stock" switch (for services).
- Filters: all, low stock, out of stock, expiry issue. Stock value at cost.
- **CSV import / export** and an empty template.

### Purchases and suppliers
- Multi-item stock-in with supplier, payment now and remaining due.
- Supplier ledger and payments. Cancelling a purchase reverses stock.

### Returns
- Return any items from a past receipt; stock is restored; refund as cash or deducted from the customer's due. Profit reports stay correct (revenue and cost are both reversed).

### Expenses
- Categories (rent, utilities, salary, transport, …), date range filter, totals per category.

### Reports and dashboard
- Today / Yesterday / 7 days / This month / All / Custom ranges.
- Net sales, gross profit, **net profit after expenses**, discount, tax, COGS, collections by Cash/Card/Mobile, supplier payments, top-selling products, sales by category.
- Dashboard: today and month figures, 7-day sales chart, highest dues, low stock, expiring items, recent sales. CSV export and print.

### Security and backup
- **PIN lock** (auto-locks after 1 minute in background, wrong-attempt lockout that survives reloads).
- **Forgot PIN?** Sign out, sign in with Google again, and your data returns from Drive with the PIN removed.
- **Google Drive backup**: auto-sync a few seconds after every change, a daily snapshot (last 14 kept), conflict dialog when two devices differ, restore old copies from Settings.
- Sign-out syncs pending changes first and clears the device.

### Look and feel
- Modern violet design, **light, dark or automatic** theme, responsive layout for phones, tablets and desktops, safe-area support for notched phones.
- Installable PWA with update banner and offline badge.

---

## What makes EsyPOS different
1. **No server, no subscription**: static files you can host free on GitHub Pages, Netlify or any shared hosting.
2. **Your data stays yours**: only you and your Drive hold it; the app can see nothing else in your Drive.
3. **Built for small shops**: dues, partial payments, mobile banking and Bengali names are first-class.
4. **Truly offline** and fast even on low-end Android phones.
5. **One codebase** for phone, tablet and desktop.

---

## Quick start
1. Upload the folder contents to any static host (HTTPS is required for camera, install and Google sign-in).
2. Open the site, sign in with Google, and start adding products.
3. On a phone choose **Install app** / **Add to Home screen**.

### Google Drive setup (one time, free)
1. <https://console.cloud.google.com> → create a project.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **OAuth consent screen** → External → app name → scopes `drive.appdata`, `email`, `profile`, `openid` → **Publish app**.
4. **Credentials → OAuth client ID → Web application**; add your site as an **Authorized JavaScript origin** (no path, no trailing slash), e.g. `https://username.github.io`.
5. Put the Client ID in `js/core/config.js`:
   ```js
   window.PROPOS_CONFIG = { googleClientId: 'xxxx.apps.googleusercontent.com' };
   ```
   (Never put the Client *Secret* anywhere in this project.)

---

## Keyboard shortcuts (desktop)
| Key | Action |
|---|---|
| `F2` | Jump to product search |
| `F4` | Checkout |
| `Enter` in search | Add the matching product / scanned barcode |
| `Esc` | Close confirm → scanner → top dialog → menu |

---

## Project structure
```
index.html, privacy.html, terms.html, manifest.webmanifest, sw.js, favicon.ico
css/style.css          design system (tokens, components, responsive rules)
js/core/               core.js (data & calculations) · ui.js (modals, theme, sound) · config.js (Google Client ID)
js/modules/            app.js (router, POS, products) · people.js (customers, suppliers, purchases)
                       misc.js (receipt, returns, history, expenses, reports, dashboard) · settings.js (settings, scanner, PIN, printer)
js/services/           cloud.js (Google sign-in + Drive sync) · pwa.js (install/update/offline)
assets/                icons/ (PWA, favicon) · logo/ (PNG/WebP/JPG/SVG)
docs/README.md         this file
```
Plain HTML, CSS and JavaScript: no build step, no dependencies except Font Awesome and Google Fonts from CDNs (cached for offline use).

---

## Changes in v10.2 (this build)
**Bug fixes**
- Offline cache was being deleted on every page load/focus, breaking offline start; now only old versions are removed. Service worker no longer answers script requests with `index.html`, and CDN icon/font files are cached for offline use.
- "Forgot PIN" could never work with cloud backup (the PIN came back with the restored data). It now resets the PIN through a Google sign-in.
- Sign-out silently did nothing when a sync failed while the cloud panel was open.
- Sign-out / "different account" confirmation was hidden behind the sign-in screen; toasts were hidden behind the PIN screen (stacking order fixed).
- Brand-new empty shops were asked to "Restore from cloud" on every launch.
- The "Which data to keep?" dialog promised a device backup download that never happened; it now downloads one.
- PIN lockout reset on page reload; it now persists.
- Escape closed every dialog at once and ignored the confirm box; fixed.
- Hover/press effects on product and stat cards never worked because of a CSS animation fill mode.
- Page could scroll sideways on phones because of an overflowing grid.
- CSV import accepted negative price/stock; CSV exports could carry spreadsheet formulas (now neutralised).
- Held bills lost their note; deleting one held bill closed the list; "Low stock (default)" could not be 0.

**Wording fixes** (leftovers from machine translation): "Total supplier payable" shown for customer dues, "Due reduced", "Cash Change", "Returns Confirm", "Purchases Save", "Qty (৳)", "Receipt # #0001", "your balance is … is due", wrong setup-guide paths, Bengali weekday names in an English UI, and more.

**Design**
- Rebuilt, de-duplicated stylesheet: consistent spacing, tabular figures for money, Inter + Noto Sans Bengali fonts, better tables, two-column Reports/Settings on desktop, centred receipt dialog on desktop, 44 px touch targets on mobile.
- Lakh/crore number grouping (12,34,567) as used in Bangladesh.
- Accessibility: pinch-zoom allowed, labelled icon buttons, dialog roles.

---

## Privacy and legal
- Privacy Policy: `privacy.html` · Terms of Service: `terms.html`
- Provider: **MH IT Limited**

## License / usage
Free to use for your shop. See Terms of Service for details.
