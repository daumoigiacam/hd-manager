# HD Manager Firebase Restore Report

## Architecture

```text
HD Manager -> Firebase
Can Gia Cam -> HD Platform
New Apps -> HD Platform
```

The HD Manager production business runtime uses Firebase Authentication,
Firestore, Firestore realtime listeners and the existing Firebase Functions
contract for project `hd-manager-c5839`. HD Platform was read-only throughout
this restore and remains independent.

## Production Result

- Restore commit: `9dd04a7a6325084299c5acc481c9d93e5455418c`
- GitHub Actions run: `35558109853` (`Deploy HD Manager`)
- Deployment result: `PASS`
- URL: `https://app.hdconnect.net`
- HTTP status: `200`
- Served `version.json.buildId`: `9dd04a7a6325084299c5acc481c9d93e5455418c`
- Browser session persistence: `PASS`
- Existing Firebase user recognized: `PASS`
- Existing company bootstrap (`HD CO.LTD`): `PASS`
- Browser console warnings/errors after deployment: `0`
- Production JavaScript files inspected: `4`
- Firebase project marker: `PASS` (`hd-manager-c5839`)
- Firebase Functions marker: `PASS` (`cloudfunctions.net`)
- Platform business runtime markers: `0`

Read-only browser verification after deployment confirmed existing customer,
employee, product, order, debt and payment data. The observed production UI
included 3,594 orders, 37 products and 154 reconciled bank transactions. No
form was submitted and no production business record was created, changed or
deleted.

## Files Changed

- `.github/workflows/deploy.yml`
- `firebase.json`
- `package.json`
- `scripts/verify-firebase-production-bundle.mjs`
- `src/App.jsx`
- `src/config/firebase-only-runtime.js`
- `src/main.jsx`
- `tests/hybrid-runtime-safety.test.mjs`
- `tests/production-deploy-workflow.test.mjs`
- `vite.config.js`
- `HD_MANAGER_FIREBASE_RESTORE_REPORT.md`

## Configuration

Production now builds with:

```text
VITE_DATA_MODE=cloud
VITE_FIREBASE_PROJECT_ID=hd-manager-c5839
VITE_HD_APP_ID=hd-manager-production
```

Removed from the production workflow:

```text
VITE_DATA_MODE=vps-production
VITE_API_BASE_URL=https://app.hdconnect.net/api/v1
VITE_INVENTORY_VPS_ENABLED=true
```

The existing Firebase project, collection paths, document IDs, rules, indexes,
Auth users and Functions were not changed. The Firestore emulator was assigned
local port `8180` only so tenant isolation and realtime could be exercised
without production writes.

## Platform Dependency Audit

### Removed From Production Runtime

- Direct `App.jsx` import of the HD Platform adapter.
- `/platform-admin` route and eager admin-console import.
- Production Platform API URL and inventory flags.
- Production Platform health check.

### Replaced With Firebase

- The production runtime alias resolves to `firebase-only-runtime.js`.
- VPS calls fail closed with `HD_MANAGER_FIREBASE_ONLY`.
- Inventory remains on the existing Firestore implementation.
- Production deployment verifies the Firebase hosting endpoint and scans the
  built application for forbidden Platform runtime markers.

### Retained As Staging-Only Source

- `src/api/hdConnectStaging.js`
- Platform admin source and Platform SDK tests.
- VPS staging release, compatibility and bundle-audit tooling.

These files remain available for isolated staging work but are not imported by
the production application flow. The deployed JavaScript contained none of:
`/api/v1`, `/platform-admin`, `hd-connect-platform`, `vps-production`, or the
production/staging Platform API base URLs.

## Tests

| Command / check | Result |
| --- | --- |
| `npm run test:all` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run test:identity` | PASS |
| `npm run test:hybrid-runtime` | PASS |
| `npm run test:production-deploy-workflow` | PASS |
| `npm run test:realtime-listener-planner` | PASS |
| `npm run test:realtime-tenant-sync` | PASS |
| `npm run test:warehouse-inventory` | PASS |
| `npm run test:firestore-tenant-rules` | PASS, 14 tests on Firestore Emulator |
| Two-client tenant-scoped `onSnapshot` integration | PASS on Firestore Emulator |
| Production Firebase-only `npm run build` | PASS |
| `npm run verify:firebase-production-bundle` | PASS, 0 Platform markers |
| VPS staging build and `npm run verify:g10-vps-bundle` | PASS regression check |
| Workflow YAML parse | PASS |
| `git diff --check` | PASS |

GitHub Actions run `35558109853` also passed lint, typecheck, the functional
suite, Firestore payroll rules, Firestore tenant isolation, password-recovery
transaction, stress/KPI gates, the Firebase-only bundle audit, deployment and
served-release verification.

## Runtime Verification

- Firebase Auth state persisted across a production browser reload.
- The existing Firebase UID resolved to the existing company and Firestore
  data; no replacement account or UID was created.
- Customers, employees, products, orders, debts and bank/payment records were
  readable after deployment.
- Firestore realtime was verified with two isolated emulator clients and the
  production realtime listener planner/tenant-sync tests. A production
  mutation was intentionally not performed.
- Firebase Functions source and identity contracts passed syntax and identity
  tests. No Function deployment was required or performed; no production
  mutation Function was invoked during this read-only restore.
- Production bundle audit and served-asset inspection both found zero HD
  Platform business API markers.

## Data Safety

```text
FIREBASE_PRODUCTION_DATA_DELETED = 0
FIREBASE_AUTH_USERS_DELETED = 0
FIRESTORE_DOCUMENTS_DELETED = 0
FIREBASE_UID_CHANGED = 0
FIRESTORE_DOCUMENT_IDS_CHANGED = 0
FIREBASE_SCHEMA_CHANGED = 0
PRODUCTION_WRITES = 0
PLATFORM_DATA_MODIFIED = 0
PLATFORM_DEPLOYED = NO
MIGRATION_APPLIED = NO
```

## Final Status

```text
HD_MANAGER_FIREBASE_RESTORE = PASS
```

- [x] Firebase project `hd-manager-c5839`
- [x] Firebase Auth and session persistence
- [x] Firestore existing-data reads
- [x] Firestore tenant isolation and realtime
- [x] Firebase Functions contract retained when needed
- [x] Firebase-only production configuration
- [x] Production does not load or call the HD Platform business API
- [x] Existing Firebase login verified
- [x] Existing customer, employee, product, order, debt and payment data readable
- [x] Production build and bundle audit
- [x] Deployment and served-build verification
- [x] Platform data modified: 0
- [x] Firebase production deletion: 0
