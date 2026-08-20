# HD CONNECT Website Release Checklist

Release scope: static public website only. This checklist does not authorize a backend, database, Firebase, Android, iOS, SePay, bank or production commerce deployment.

## Release gates

- [x] Website source is isolated in `hdconnect-website`.
- [x] Static MPA structure is used; hosting runtime does not require Node.js or a database.
- [x] Public navigation includes Home, Apps, Pricing, Support, Contact, Account and Login.
- [x] `/apps` catalog exists with HD Manager fallback and backend-driven extension point.
- [x] `/apps/hd-manager` detail route exists with backend-driven plan extension point.
- [x] `/pricing` and `bang-gia.html` do not hardcode production prices.
- [x] Checkout supports individual, household business and organization customer types.
- [x] Checkout includes VAT, tax ID, referral code and backend source-of-truth messaging.
- [x] Payment page is visibly `MOCK_DISABLED` and does not call payment intent while disabled.
- [x] Account foundation exists for orders, invoices, subscriptions and profile without fake account data.
- [x] Terms, privacy, payment policy, refund policy, support and data deletion pages are present.
- [x] `robots.txt`, `sitemap.xml`, favicon, canonical, Open Graph and JSON-LD are present for public pages.
- [x] `.htaccess` includes HTTPS redirect, security headers, caching and clean public route rewrites.
- [x] Every HTML page declares `<base href="/">` so nested clean routes resolve assets from the domain root.
- [x] Build validator checks required files, broken local references, loopback endpoints and secret patterns.
- [x] `PAYMENTS_ENABLED=false` and `PAYMENT_MODE=MOCK_DISABLED` are recorded in the release config.
- [x] No payment activation or backend source change was made for this website release.

## Release status

- WEBSITE: READY TO DEPLOY
- PAYMENT: DISABLED
- SEPAY: NOT ACTIVE
- REAL BANK: NOT CONNECTED
- AUTO SUBSCRIPTION: DISABLED
- AFFILIATE: FOUNDATION ONLY
- HD MANAGER: UNCHANGED

## Current production follow-up

- [x] Production sitemap URLs and security headers were audited on 2026-08-21.
- [x] Production payment page remains `MOCK_DISABLED`.
- [ ] Upload refreshed `hdconnect-website-dist` to cPanel; the live nested app detail page still has the pre-fix asset resolution.
- [ ] Recheck `/apps/hd-manager` assets after upload and confirm no `/apps/assets/...` 404s.

## Before production payment activation

- [ ] Approve payment policy and refund policy content.
- [ ] Configure production backend/API origin through a reviewed server-side release process.
- [ ] Complete staging E2E with real deployment credentials and webhook verification.
- [ ] Confirm bank account ownership, QR template, callback authentication and reconciliation controls.
- [ ] Enable payment only after an explicit release approval changes `PAYMENTS_ENABLED`.
- [ ] Run a separate production smoke test and rollback rehearsal.
