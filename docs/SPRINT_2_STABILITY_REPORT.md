# Sprint 2 - Crash And Stability

Date: 2026-07-22
Scope: crash prevention, listener cleanup, timer cleanup, and safe runtime shutdown.

## Changes

- Performance Monitor now restores patched History API methods when stopped.
- Error, unhandled rejection, page lifecycle, visibility, and history listeners are removed during shutdown.
- Memory sampling is skipped while the document is hidden.
- Google delivery marker clicks use a ref for the latest callback, so marker objects are not rebuilt only because a callback identity changed.

## Verification

- `node --check src/services/performanceMonitor.js`: PASS.
- `node --check functions/index.js`: PASS.
- `npm run build`: PASS.
- `npm run test:kpi`: PASS on the local simulation.
- `npm run test:all`: PASS.

## Limitations

This does not prove zero Android crashes. A real-device crash log, ANR trace, and WebView version are still required for that claim.
