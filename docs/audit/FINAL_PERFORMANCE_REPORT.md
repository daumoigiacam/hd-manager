# HD Manager performance evidence

Date: 2026-09-27 (Asia/Saigon)
Acceptance: **BLOCKED**. Numbers below are explicitly separated by environment and measurement method.

## Baseline and after

No authenticated, production-like **before** trace was available before the Home layout change. The change moves existing UI without optimizing performance. Therefore improvement percentages cannot be calculated honestly.

| Flow | Before | After | Improvement | Status |
| --- | --- | --- | --- | --- |
| Cold start / first usable UI | NOT MEASURED (no pre-change device trace) | Android activity launch 1,211-2,216 ms; first usable UI NOT MEASURED | NOT CALCULABLE | BLOCKED |
| Warm start | NOT MEASURED | Android activity/task return 187 ms; WebView readiness NOT MEASURED | NOT CALCULABLE | BLOCKED |
| Login | NOT MEASURED | Login shell rendered; login transaction NOT TESTED | NOT CALCULABLE | BLOCKED |
| Dashboard/Home | NOT MEASURED | Preview fixture visual check only; authenticated production latency NOT MEASURED | NOT CALCULABLE | BLOCKED |
| Orders / Products / Inventory | NOT MEASURED | NOT MEASURED (no authenticated trace) | NOT CALCULABLE | BLOCKED |
| Customers / Debt / Delivery | NOT MEASURED | NOT MEASURED (no authenticated trace) | NOT CALCULABLE | BLOCKED |
| Payroll / Reports | NOT MEASURED | NOT MEASURED (no authenticated trace) | NOT CALCULABLE | BLOCKED |

## Measured local observations

- **Production Vite preview, unauthenticated only:** at 390 px, HTTP 200, `DOMContentLoaded`/`load` 159 ms, 8 resources, 2,059,268 transferred bytes, JS heap sample 10,821,965 bytes. At 1280 px, 118 ms, 8 resources, the same transfer bytes, JS heap sample 10,806,861 bytes. These are single local Chrome samples on a fast desktop and do **not** measure first usable authenticated UI, production network, or Android performance.
- **Android 36 emulator, debug APK:** `am start -W` cold activity launches 2,216 / 1,318 / 1,211 / 1,229 ms; one task return 187 ms. `am start -W` ends at Activity launch, not Dashboard Ready or WebView interactivity. The login screenshot exists at `test-results/business-report/android-login-emulator.png`. One process memory sample: PSS 147,628 kB, RSS 286,200 kB. There is no 10/30/50-navigation leak curve.
- **Visual behavior:** 320-768 px and desktop 1280 px Home layout checks pass with preview data; this is UI verification, not a production benchmark.

## Bundle and rendering

| Artifact | Uncompressed | Gzip from Vite build |
| --- | ---: | ---: |
| Main JS | 2,603,331 bytes | 690.57 kB |
| General vendor JS | 849,337 bytes | 256.94 kB |
| Tools vendor JS | 490,913 bytes | 125.89 kB |
| Firebase vendor JS | 422,933 bytes | 125.85 kB |
| Export vendor JS | 351,661 bytes | 115.26 kB |
| Main CSS | 336,392 bytes | 55.45 kB |
| Attendance image | 1,996,366 bytes | Not applicable |

The main JS and attendance image are investigation candidates, not proven bottlenecks. No React Profiler, dropped-frame, route render-count or authenticated Long Task trace was captured. `vite.config.js` sets `sourcemap: false`, creates vendor chunks and only explicitly lazy-loads the Identity Security Center in the inspected root. No production duplicate-dependency analysis or Nginx compression/cache-header probe was completed.

## API, database, cache, network and mobile

- Deployed `cloud` frontend: Firebase/Auth/Firestore is the relevant production data path. Request count, latency, failed/duplicate requests, payload size, Firestore reads and listener memory: **NOT MEASURED** in an authenticated session.
- HD Platform/PostgreSQL/Redis: separate staging track. Jest/build/schema pass, but live API latency, `EXPLAIN ANALYZE`, slow queries, Redis hit rate and queues: **NOT MEASURED**. No indexes or cache policies were changed without evidence.
- Search, list scrolling, modal lifecycle, offline/4G/high-latency recovery, retries and lower-end Android FPS: **NOT MEASURED**.
- `npm run test:performance` reports static/synthetic architecture observations; `npm run test:stress:big` is an in-memory Node simulation (316.6 ms run, peak RSS 242.1 MB, event-loop max 31.7 ms). The script's estimated FPS is **not an Android frame-rate measurement**. `npm run test:kpi` itself warns that device measurements are missing. None of these is production acceptance evidence.

## Next measurement pass

Capture at least three cold/warm authenticated runs on high-, mid- and low-end Android; Chrome/Android trace for route transitions, Long Tasks and frames; Firebase Performance/Firestore read and payload telemetry by tenant size; 10/30/50-navigation memory curves; network throttling/disconnect/reconnect; and real API/DB traces for any Platform staging path. Only then choose high-impact fixes and populate a genuine before/after table.
