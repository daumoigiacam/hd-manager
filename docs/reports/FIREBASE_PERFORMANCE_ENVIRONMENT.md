# Firebase Performance Environment

Date: 2026-10-03

**FIREBASE PERFORMANCE ENVIRONMENT: BLOCKED**

All four accessible projects were inspected through authenticated, read-only cloud
metadata APIs. No project currently qualifies as a verified HD Manager cloud test
environment. Unknown lifecycle is not evidence of an unused/disposable project.

## Projects

| Project | Environment | Protected? | Writable? |
| --- | --- | --- | --- |
| hd-manager-c5839 | Confirmed HD Manager production | YES, explicitly | Benchmark writes prohibited; not tested |
| cangiacam | Existing separate application resources; production/staging/legacy lifecycle UNVERIFIED | Treat as protected until owner confirms isolation | Not authorized or tested for HD Manager benchmark |
| daumoigiacam-e7c2b | ACTIVE project; application lifecycle UNVERIFIED, not proven unused | Treat as protected | Not authorized/tested; required services unavailable |
| quanlysaas | Existing application resources; lifecycle UNVERIFIED | Treat as protected | Not authorized/tested; parity not established |

### Service Evidence

| Project | Firestore | Auth metadata | Functions | Hosting |
| --- | --- | --- | --- | --- |
| cangiacam | Native `(default)`, asia-southeast1 | Config readable; email/phone/anonymous enabled; domains include cangiacam-hd.netlify.app | V1 empty; V2 matchMarketPost in asia-southeast1, state UNKNOWN | cangiacam.web.app |
| daumoigiacam-e7c2b | HTTP 403, API disabled/not previously used | HTTP 404 CONFIGURATION_NOT_FOUND | V1/V2 HTTP 403, API disabled/not previously used | daumoigiacam-e7c2b.web.app |
| hd-manager-c5839 | Native `(default)`, asia-southeast1 | Config readable; authorized domains include app.hdconnect.net | V1 empty; V2 24 ACTIVE functions, including identityLogin/identityRegisterCompany and payments | hd-manager-c5839.web.app |
| quanlysaas | Native `(default)`, nam5 | Config readable; anonymous enabled | V1/V2 HTTP 403, API disabled/not previously used | quanlysaas.web.app |

All returned project lifecycle states are ACTIVE. No returned project labels
identify an HD Manager staging/test environment. A hosting site does not prove a
currently deployed application or a disposable environment. API errors are recorded
as unavailable, not as proof that the project contains no business data.

## Selected Benchmark Environment

- Project ID: none selected.
- Firestore database: none selected.
- Tenant: no authorized real-Firebase test tenant established.
- Auth identity type: no benchmark application identity established. Existing
  Firebase CLI administrative authentication was used only for metadata discovery.
- Dataset size: not verified in any cloud test tenant.
- Write permission: NOT VERIFIED. Administrative metadata access does not prove
  application tenant permissions or authorize benchmark writes.

Create order request, create/edit order, create dispatch, read delivery report,
and persistence acceptance remain NOT RUN against cloud staging. No production
account was used for application login or business operations.

## Production Protection

`hd-manager-c5839` NOT USED FOR BENCHMARK.

Only project/service configuration metadata was read. No business documents or
Auth user exports were read. No order, dispatch, payment, customer, product,
tenant, identity, rule, index, configuration, or deployment was created, edited,
or deleted. No Firebase project was created and no service API was enabled.
No benchmark ran in this task, and no production account credentials were printed.

## Repository and CLI Configuration Evidence

- `.firebaserc`: only default alias hd-manager-c5839; no cloud staging alias.
- `.env.local`: cloud mode, hd-manager-production namespace, hd-manager-c5839.
- `.env.example`: cloud template with production namespace; blank project ID.
- `.env.emulator`: demo-hd-manager-local, hd-manager-local namespace, emulators
  enabled. It is not a remotely hosted Firebase staging project.
- `firebase.json`: local rules/indexes/storage rules, Node 22 Functions source,
  Hosting rewrites for identity/customer/payment APIs. No separate staging target.
- `.github/workflows/deploy.yml`: explicitly builds cloud production against
  hd-manager-c5839 and hd-manager-production.
- `.github/workflows/release-staging.yml` and publish-p4-staging-artifact.yml:
  existing staging release is a VPS/Platform artifact using
  staging-api.hdconnect.net/api/v1, not evidence of Firebase datastore parity.
- `package.json`: local emulator/rules tests and production deploy commands;
  these do not establish a cloud test tenant.
- CLI: existing authenticated global account loaded in memory through installed
  firebase-tools; project metadata for all four projects was read successfully.
  No credential values were included in saved evidence.
- `docs/reports/phase4c-staging-evidence.json`: historical 2026-10-02 attempt
  to create hd-manager-staging-4c failed with provider code 8 / QuotaFailure.
  This task did NOT retry project creation; historical quota is not claimed as a
  freshly measured quota failure.
- Prior LOCAL_FIREBASE_RUNTIME_VERIFICATION_2026_10_02 and GAP_A_C_FINAL_STATUS
  also identify production and lack of a verified isolated staging target.

## Dataset

Repository fixture source: `scripts/audit-interactions.mjs`, with assertions in
`tests/visual/interaction-action-cases.mjs`. These are mock/preview fixtures,
NOT existing cloud records or proof of cloud tenant validity.

| Collection | Large fixture core | Inherited critical-path preview including extras | Verified cloud test count |
| --- | ---: | ---: | --- |
| products | 600 | 600 | Unknown |
| customers | 360 | 364 | Unknown |
| orders | 1800 | 1800 | Unknown |
| payments | 900 | 900 | Unknown |
| orderRequests | 4500 | 4503 | Unknown |
| warehouseDispatches | 4300 | 4303 | Unknown |

Core fixture total: 12,460 records in these six collections. References use
companyId comp_preview and synthetic employee/customer/product IDs. This ID is
not a verified real Firebase tenant. Do not upload the fixture unchanged: real
tenant claims, identity membership, product units/pricing, stock prerequisites,
and all linked IDs must be validated first.

`scripts/master-emulator-session-regression.mjs` contains a safe LOCAL account
creation mechanism: calls identityRegisterCompany, signs into Auth using its
custom token, verifies company/role/identity claims, and registers two distinct
synthetic tenants. It targets demo-hd-manager-local with explicit localhost
allowlists. Its small probe/customer fixtures prove neither cloud permission nor
baseline-scale cloud performance. Its safety gates must not be bypassed to turn
it into a production seeder.

No approved cloud test account/bootstrap configuration was found in the inspected
repository sources. No existing cloud dataset was duplicated or seeded.

## Evidence Artifacts and Bounded Execution

- `firebase-performance-environment-evidence.json`: sanitized live project,
  Firestore, Auth configuration, V1/V2 Functions and Hosting metadata; timestamps
  and API failures retained. Returned function/site lists had no next-page token.
- `scripts/firebase-performance-environment-evidence.cjs`: evidence-only GET
  collector, four explicit project IDs, no business document/user operations,
  10-second per-request timeout and 180-second process deadline, no configured
  request retries. It completed normally without timeout.
- Inspected source/config/docs via bounded-output searches; no optimization or
  application file was changed. No full benchmark or app build was needed.

## Remaining Requirements / Safe Setup Gate

Need owner designation of an existing isolated non-production Firebase project
with access, or separately authorized creation/provisioning of a dedicated project.
Current instructions prohibit project creation and deployment, so neither is
attempted. Provisioning missing Auth/Functions/rules/indexes would require a
subsequent expressly authorized setup task, not silently enabling services here.

Before any future seed, record exact project/database/app namespace/tenant and
confirm rules, indexes, Functions revision, regions, Auth claims and external
side-effect isolation. Protect production explicitly and fail closed on mismatch.
Check existing tenant counts first to avoid duplicate data. Record a manifest of
new document IDs and fixture version; cleanup must target only manifest-owned
records in that verified test tenant, never broad collection deletion. Account
secrets belong in protected local/CI secret storage, not source or this report.

Then establish test login and verify create/edit/read/persistence with server ACK
using the normal tenant-scoped application path. Only after parity and writable
identity evidence should a reviewed fixture import cover the six collections and
required inventory/pricing/unit dependencies. Benchmarking belongs to the next task.

No safe selected environment means environment acceptance remains BLOCKED, not PASS.
