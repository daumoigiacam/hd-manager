# Final 22-module performance audit - 2026-10-02

## Scope and outcome

Measured all 22 screens on mobile (390x844) and desktop (1366x900).
Acceptance run: 334 samples, zero failed actions, zero browser errors.
Fixture: 4,500 requests, 4,300 dispatches, 1,800 orders, 900 payments,
600 products and 360 customers. Preview storage is isolated from production.
This is not a certification that every CRUD action or every physical phone is fast.

## Evidence-backed changes

- Order requests: render 20 complete customer groups at a time. Load-more preserves
  complete groups, source order, full totals and full sharing data.
- Reuse Vietnamese date/time formatters and numeric collator. CPU profiles showed
  repeated formatter construction and locale comparisons dominated request rendering.
- Delivery reports: index request candidates by customer ID or effective customer
  name. Preserve original candidate order and existing product/date/branch rules.
- Remove the global floating synchronization overlay. Keep the queue, retry and
  errors; expose a collapsed status panel in Settings. Individual save feedback
  still distinguishes local persistence from server confirmation.
- Keep the restored warehouse write path. No new inventory API is activated.

## Screen open medians (milliseconds)

| Screen | Mobile | Desktop |
| --- | ---: | ---: |
| Home | 9.4 | 9.8 |
| Order requests | 199.3 | 215.7 |
| Orders | 30.1 | 33.4 |
| Warehouse dispatch | 118.9 | 133.8 |
| Warehouse import | 236.3 | 239.7 |
| Delivery reports | 277.7 | 274.9 |
| Products | 112.6 | 118.7 |
| Customers | 25.0 | 26.2 |
| Debt | 19.5 | 19.8 |
| Finance | 25.5 | 31.3 |
| Bank payments | 8.0 | 8.5 |
| Messages | 21.9 | 23.1 |
| Pricing | 54.5 | 55.6 |
| Company attendance | 10.4 | 12.1 |
| Employee reviews | 13.4 | 15.2 |
| Asset management | 8.9 | 9.8 |
| Payroll | 29.7 | 41.7 |
| Employees | 9.4 | 11.0 |
| Price quotes | 40.8 | 48.3 |
| Settings | 10.0 | 10.8 |
| Role permissions | 14.2 | 17.4 |
| Billing | 7.1 | 8.1 |

Worst accepted screen-open sample: 289.3 ms. Before the targeted fixes,
request opening took approximately 1-1.8 seconds and delivery exceeded the
7-second action timeout under the stress fixture.
Warehouse input: approximately 6-9 ms; customer search 14-17 ms; preview queue
save 330-417 ms. These are browser measurements, not production server latency.

## Verification

- `npm run test:all`, lint, typecheck and production build: PASS.
- Twelve targeted formatter/index/render-window/sync/restore-scope tests: PASS.
- Real local Firebase Emulator warehouse save/reload test: 10/10 PASS;
  confirmation approximately 195 ms, stock 100 - 12 = 88, persisted after reload.
- Production bundle verifier: PASS, Firebase project hd-manager-c5839,
  build ID final-audit-20261002, no platform runtime markers.
- Weak-CPU exploratory run: 90 samples, zero failed actions/browser errors.
- Existing paused Gap A/C source is retained but not activated in the restored app.

## Limits and remaining risks

- Simulated 6x CPU slowdown still opens large screens in approximately 1.2-3.7
  seconds. Input quantity remained 32-76 ms and search 125-154 ms. Early samples
  overlapped other local verification processes; this is a conservative exploratory
  run, not a clean hardware benchmark or a zero-lag claim.
- Preview order-price saves took approximately 758-936 ms. No production latency
  or physical-phone end-to-end performance was certified.
- Extended exploratory CRUD cases had stale employee/order selectors. The final
  accepted suite covers 22-screen navigation plus product edit, request-price edit
  and warehouse selection/input/save; it does not claim every CRUD workflow passed.
- Fixed an audit-only late callback that dereferenced a cleared measurement and
  corrected stress price expectations. Failed exploratory runs remain available.
- No production data writes, deployment, Phase 5 load test or phone biometrics test.

## Local evidence

- test-results/full-interaction/final-22-before
- test-results/full-interaction/final-22-after (exploratory failures)
- test-results/full-interaction/final-22-fixed (exploratory failures)
- test-results/full-interaction/final-hotspots
- test-results/full-interaction/final-22-acceptance
- test-results/full-interaction/final-slow-cpu
- test-results/export-restore/smoke.json

Generated raw evidence and installers are excluded from Git to avoid publishing
test credentials, local artifacts or large binaries.

## Packaging verification

- Android release 1.0.4, versionCode 26100201: assembleRelease and bundleRelease PASS.
- APK signature verification PASS (v2). Signing certificate SHA-256 matches the
  previous 1.0.3 APK: d5c0d0187e27d7909b9024e83287c7a2d3823252dd66a5617351a737261ccb35.
- AAB jarsigner verification: jar verified. Standard self-signed Android certificate
  and missing timestamp warnings remain; Java also warns about streaming ZIP entry
  order. Play Console upload acceptance has not been tested.
- All 32 web files embedded in APK, AAB and Windows app.asar match dist byte-for-byte.
- Windows installer is not Authenticode-signed; SmartScreen may warn. No physical
  phone installation or Windows installer wizard acceptance has been performed.
- Source is published to codex/final-22-module-audit-20261002, not main. Main has
  automatic production deployment; production remains unchanged without approval.
