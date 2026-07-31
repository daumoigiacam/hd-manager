# HD CONNECT Premium Experience - Phase 1 Audit

Date: 2026-07-31
Branch: `codex/premium-phase-1-performance`

## Scope and safety boundary

This phase audits performance and reliability only. It does not change Firestore data, Firebase project configuration, API contracts, SePay/webhook behavior, permissions, formulas, or business workflows.

## Baseline

- Production build: PASS, 2,342 modules, about 47.5 seconds.
- Main application JavaScript: 2,093.62 kB, gzip 539.64 kB.
- Main CSS: 1,251.88 kB, gzip 117.74 kB.
- Big synthetic stress test: no crash and no retained heap leak after GC.
- Peak Node RSS in synthetic stress test: 226.9 MB.
- Maximum synthetic event-loop delay: 31.2 ms.
- Synthetic notification filter/sort for 100,000 records: 58.6 ms.
- Device FPS, Android ANR, GPU and WebView memory require physical-device evidence and are not inferred from Node tests.

## Findings

### Critical

No reproducible critical crash was found in the local build or synthetic stress suite.

### High

1. Root-level realtime data pressure
   - Area: `src/App.jsx`, Firestore subscription setup.
   - Cause: multiple company collections are kept in root state, so updates may propagate through a very large component tree.
   - Impact: CPU, memory, Firestore read pressure and broad rerender risk at scale.
   - Safe action in this phase: document only. Changing query scope or subscription semantics could change realtime behavior and is outside the allowed boundary.

2. Monolithic application component
   - Area: `src/App.jsx`.
   - Cause: routes, state, derived data and presentation are concentrated in one very large module.
   - Impact: large parse/compile cost, broad invalidation surface and difficult profiling.
   - Safe action in this phase: optimize hot derived/render paths without moving business logic. A full split requires dedicated regression coverage.

### Medium

1. Message list derivation repeats on rerenders
   - Area: message center in `src/App.jsx`.
   - Cause: conversation flattening, filtering, sorting and message filtering are calculated eagerly.
   - Impact: typing and opening the message screen can block the main thread for large datasets.
   - Planned action: defer search input, memoize safe derived values and render conversations progressively.

2. Notification unread count scans repeatedly
   - Area: notification center in `src/App.jsx`.
   - Cause: unread filtering runs during every parent render.
   - Impact: avoidable CPU cost because the root component rerenders frequently.
   - Planned action: memoize the count and progressively render the notification dialog.

3. Progressive lists eventually mount every row
   - Area: `src/services/renderOptimization.js` consumers.
   - Cause: chunking protects the first frame but idle work eventually mounts the full list.
   - Impact: large DOM and memory usage for long-lived screens.
   - Planned action: add browser-native render containment to off-screen rows without hiding data or changing list semantics.

4. Font entry points include unused language subsets
   - Area: `src/main.jsx` font imports.
   - Cause: package root CSS references all available scripts.
   - Impact: extra CSS processing and asset graph entries.
   - Planned action: load only Latin and Vietnamese variable font subsets required by the product.

### Low

1. Existing performance monitor is opt-in
   - Area: `src/services/performanceMonitor.js`.
   - Assessment: correct production behavior; no change required.

2. Existing timers, GPS watches and dispatcher listeners have cleanup
   - Area: background effects in `src/App.jsx`.
   - Assessment: no repeated unmount leak found in the reviewed paths.

## Existing safeguards confirmed

- Root and section error boundaries are present.
- Vite minification, CSS splitting and manual vendor chunks are enabled.
- Heavy QR, OCR, spreadsheet, PDF and image export libraries are dynamically imported.
- REST fallback is gated and does not poll continuously while hidden/offline.
- Native non-core data loading is delayed and core listeners are prioritized.
- GPS watch, scanner timer, dispatcher interval and clipboard listeners have cleanup paths.

## Phase 1 implementation plan

1. Keep database and realtime subscription behavior unchanged.
2. Optimize only presentation-layer hot paths.
3. Run build, regression, performance, stress and KPI suites.
4. Record measured before/after evidence and unresolved device-only risks.

