# Old POS v12.1.3 — Audit Report (pass 1: v12.1.2, pass 2: v12.1.3)

## Fixed
| # | Area | Problem (root cause) | Fix |
|---|------|----------------------|-----|
| 1 | Total users (undercount) | Device id was a hash of screen/CPU/GPU traits → identical phone models shared one id | Random 128-bit id (existing stored ids kept) — guard.js / safety.js |
| 2 | Total users (undercount) | Device counter created, total increment failed → device never counted | Pending flag `esypos_uc_pend`, retried until the total goes up |
| 3 | Total users (overcount) | Fallback service (counterapi) counted a device again | Single registration source (Abacus); fallback is read-only |
| 4 | Total users (display) | Number could drop when a fallback returned a smaller value | Number only grows |
| 5 | Security | Stored XSS: record ids went unvalidated into inline onclick (backup file / Drive / local copy restore) | `sanitizeIds()` in `Core.migrate()` for all collections and restore paths |
| 6 | Offline / performance | pwa.js CACHE_VERSION v12.1.0 ≠ sw.js v12.1.1 → live cache deleted on each start | Both v12.1.2 |
| 7 | UI/UX | Tap targets 27–30px, clipped captions, no reduced-motion | polish.css additions |

## Tested (headless Chromium)
11 views × 9 viewports (320–1920px): no horizontal overflow, no JS errors. Tampered-id test: payload not executed, references intact. Counter test (mocked service): exactly +1, no double count, retry works. 3 identical devices → 3 distinct ids.

## Not verified
Real Google sign-in/Drive backup, live Abacus service, camera/barcode scanner, label printers, Safari/Firefox, real phones. Old inflated total: use `userCountOffset` in js/core/config.js. Free public counters can be reset or removed by their owner; a Firebase `userCounterUrl` is the reliable option. Devices that cleared all site data before this version may still be counted twice.

## Pass 2 (v12.1.3)
Fixed: privacy/terms/license/features pages overflowed sideways at 320px; product image field accepted any URL from a tampered backup (now data:image only); an error inside sale completion could leave the POS stuck on "busy" (now recovers with a message).
Tested: 8 pages × 4 widths; ~160 controls clicked across 10 views at 360px and 1280px with seeded data (no errors, no modal overflow); sale test (totals, stock deduction, overselling blocked); load 289 ms locally, 29 requests, ~711 KB.
Open risks (not changed, need a larger refactor): CSP still allows 'unsafe-inline' scripts because the UI uses inline onclick handlers; the Google access token (1 hour) is kept in localStorage; PIN lock is client-side only, so anyone with browser access to the device data can bypass it.
