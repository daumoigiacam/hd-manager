# Sprint 6 - Production Build

Date: 2026-07-22

## Verification

- `npm install --no-audit --no-fund`: PASS, dependencies up to date.
- `npm run build`: PASS.
- Vite: 7.3.6.
- Modules transformed: 2,081.
- Production build uses minification, manual vendor chunks, CSS code splitting, and no source maps.
- `node --check functions/index.js`: PASS.

## Bundle snapshot

- Main JavaScript: approximately 2.05 MB raw / 526 kB gzip.
- CSS: approximately 1.22 MB raw / 111 kB gzip.

This is a build snapshot, not an APK/AAB size measurement.
