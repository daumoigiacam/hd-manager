# HD Manager VPS Staging Integration Gate (P4)

Date: 2026-08-29

## Scope and safety boundary

This gate audited and built the current frontend VPS-staging integration only.
No production release, Firebase change, database migration, database reset, DNS
change, SSH action, or business-data write was performed.

- Base `HEAD`: `8f128cd8ea8b6c1c84cfb016dde8b7f1f44a2ceb`.
- The repository was already dirty before P4. It was preserved. The P4 artifact
  contains the current dirty worktree and is not represented as a clean commit.
- No secret values, browser storage, credentials, or production configuration
  values were read or printed.
- P4 made only safe HTTPS `GET`/`HEAD` checks against the declared staging URLs.
- `test:g10-staging-contract` was skipped because its staging ingress/test
  credential environment variables were not configured. It reported
  `businessWritesExecuted=0`, `firestoreWritesExecuted=0`, and
  `productionWritesExecuted=0`.

## Runtime and artifact evidence

| Field | Evidence |
| --- | --- |
| Build mode | Vite production build with `VITE_DATA_MODE=vps-staging` |
| VPS API target | `https://staging-api.hdconnect.net/api/v1` |
| Build ID | `p4-vps-staging-20260829T072544Z` |
| Build timestamp | `2026-08-29T07:25:45.141Z` |
| Artifact | `release/p4-vps-staging-20260829T072544Z/hd-manager-p4-vps-staging-20260829T072544Z.zip` |
| Artifact SHA-256 | `08A6FB1849F0448AEA9B01A65480DEACBAD58FD81A3F8FEA03075C4AF582BB18` |
| `dist/index.html` SHA-256 | `080EAAC530DAD905F52FB0D9854C4E19B55EF155106F24FC51610BD51797B372` |
| Bundle verification | `npm run verify:g10-vps-bundle` PASS; 13 files scanned; no findings |
| Firebase in VPS staging bundle | Vite VPS-staging aliases Firebase/identity modules to staging mocks; bundle verifier found no Firebase/production fallback |

The locally generated `dist/version.json` identifies the P4 bundle above. It has
not been transferred anywhere.

## Live staging observation

Safe reads performed after the local build:

| URL | Result |
| --- | --- |
| `https://staging-app.hdconnect.net/version.json` | HTTP 200; live build is `p32-vps-staging-finance-refresh-20260829T090000Z`, built `2026-08-28T21:12:07.284Z` |
| `https://staging-api.hdconnect.net/api/v1/health` | HTTP 200 |

Therefore the HTTPS site is serving a prior P3.2 artifact, not the P4 artifact.
The historical P3.2 browser evidence cannot prove the new P4 bundle.

## Release-path audit

No reviewed, runnable staging frontend release mechanism is available in the
workspace or runtime environment.

- `.github/workflows/deploy.yml` is production-only: it targets production
  deployment guards and production host checks.
- `deploy/vps/publish-from-windows.ps1` and the generic VPS setup scripts can
  operate on generic VPS/Nginx state; they are not an isolated staging release
  procedure.
- The available platform image deploy script can run migrations. It is not a
  permitted P4 release path.
- No staging host deployment configuration, authenticated staging release
  credential arrangement, or verified target/container identity is available.

P4 deliberately did not guess a host, modify Nginx, run SSH, run a migration,
or reuse a production workflow for staging.

## Source and client-contract evidence

The locally built UI and VPS client contain these tenant-safe paths:

| Capability | UI/client path | VPS contract evidence |
| --- | --- | --- |
| Order lifecycle | explicit order confirmation/reservation/release controls | explicit sales order and reservation calls in `test:vps-api` |
| Delivery plan | create/list plan from a reserved order | `POST /sales/orders/{orderId}/delivery-plans`, `GET /sales/delivery-plans` |
| Physical fulfillment | only a plan line can create stock-out; confirmation does not deduct stock | `POST /warehouse-suite/stock-out` |
| Partial dispatch | UI calculates ordered, reserved, planned, dispatched, remaining using exact plan-line lineage | dispatch amount is rejected when it exceeds remaining planned quantity |
| Reversal/return | UI sends a separate reversal against the source dispatch and rejects over-return | `POST /warehouse-suite/stock-out/{dispatchId}/reversals` |
| Inventory lineage | stock-out includes `orderId`, `orderLineId`, `reservationId`, `deliveryPlanId`, `deliveryPlanLineId`, and `sourceDispatchId` | P3.8 client contract test PASS |
| Debt/finance | staging UI uses supported cash/debt/expense contracts with tenant-safe client mapping | `test:vps-api` and `test:vps-domain-consumption` PASS |
| Realtime | authenticated `/realtime/stream` client supports `afterEventId`, reconnect, dedupe, one refresh after 401, and fail-closed 403 | `test:vps-api` PASS |

`ORDER_CONFIRM`, `ORDER_COMPLETE`, and `ORDER_CLOSE` do not create stock-out
from the staging UI contract. Warehouse dispatch/stock-out remains the canonical
physical fulfillment event.

## Validation run

All local checks below passed unless explicitly marked skipped:

| Command | Result |
| --- | --- |
| `npm run test:identity` | PASS |
| `npm run test:vps-api` | PASS, 45 tests |
| `npm run test:hybrid-runtime` | PASS |
| `node --test tests/vps-domain-consumption.test.mjs` | PASS, 10 tests |
| `npm run test:order-request-ux` | PASS, 30 tests |
| `npm run test:warehouse-inventory` | PASS |
| `npm run test:warehouse-dispatch` | PASS |
| `npm run test:warehouse-dispatch-bulk-order-billing` | PASS, including 500-order stress |
| `npm run test:warehouse-product-scanner` | PASS, 1,000 logical concurrent scans |
| `npm run test:warehouse-quantity-units` | PASS |
| `npm run test:warehouse-supplier-picker` | PASS |
| `npm run test:customer-debt-payment` | PASS |
| `npm run test:smart-customer-ordering` | PASS, 42 tests |
| `npm run test:order-cross-account-sync` | PASS, 5 tests |
| `npm run test:realtime-tenant-sync` | PASS, 4 tests |
| `npm run test:realtime-listener-planner` | PASS, 4 tests |
| `npm run test:vps-browser-smoke` | PASS, 6 tests; rejects production/Firebase targets |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS, 2,394 modules |
| `npm run verify:g10-vps-bundle` | PASS |
| `git diff --check` | PASS; existing LF/CRLF warnings only |
| `npm run test:g10-staging-contract` | SKIPPED: no staging ingress/test credential environment configured; zero writes |

## P4 domain gate

`PASS` requires live P4 browser evidence through the deployed P4 artifact:
`UI -> VPS API -> JWT/RBAC -> PostgreSQL/Redis staging -> UI read-back`.

| Gate | Source/client evidence | Current P4 HTTPS browser/DB evidence | Status |
| --- | --- | --- | --- |
| STAGING_RELEASE | artifact built and verified locally | no reviewed safe release route; live site is prior P3.2 bundle | BLOCKED |
| UI_VPS_INTEGRATION | VPS-staging aliases and client contract PASS | P4 bundle is not live | PARTIAL |
| AUTH | VPS identity client and prior P3.2 staging evidence PASS | no login through P4 bundle | PARTIAL |
| SESSION | refresh/retry client contract PASS | no reload through P4 bundle | PARTIAL |
| MASTER_DATA | customer/product/warehouse/inventory client paths PASS | no P4 browser read-back | PARTIAL |
| ORDER | explicit order/reservation controls and API tests PASS | no P4 browser create/read-back | PARTIAL |
| FULFILMENT | delivery-plan, partial dispatch, reversal, stock-out lineage contracts PASS | no P4 browser/DB physical fulfillment evidence | PARTIAL |
| INVENTORY | fail-closed mapping and stock movement contract PASS | no P4 before/after browser/DB evidence | PARTIAL |
| DEBT | tenant-safe client contract and domain test PASS | no P4 browser/DB lifecycle evidence | PARTIAL |
| FINANCE | cash/debt/expense contract and domain test PASS | no P4 browser/DB lifecycle evidence | PARTIAL |
| REALTIME | after-event cursor/reconnect/dedupe client contract PASS | no P4 two-session browser proof | PARTIAL |

The existing P3.2 report identifies the prior isolated targets as PostgreSQL
`hd_connect_staging` and Redis `hdconnect-redis-staging`. P4 does not claim a
new database or Redis proof because the P4 artifact could not be released.

## P4.1 release-path result

The repository now contains a local, manual staging-only release contract:
`.github/workflows/release-staging.yml` and
`migration/release/HD-MANAGER-VPS-STAGING-RELEASE-CONTRACT.md`. It is not
connected to the production workflow, does not build a replacement artifact,
does not edit Nginx, does not run migrations, and was not executed.

| Gate | Result | Evidence |
| --- | --- | --- |
| `STAGING_RELEASE_PATH` | `PARTIAL` | A fail-closed `workflow_dispatch` contract exists locally; GitHub Environment `staging` and platform host inputs are not installed/verified. |
| `P4_ARTIFACT_VERIFIED` | `PASS` | Local artifact `hd-manager-p4-vps-staging-20260829T072544Z.zip`, 3,715,656 bytes, SHA-256 `08A6FB1849F0448AEA9B01A65480DEACBAD58FD81A3F8FEA03075C4AF582BB18`. |
| `P4_STAGING_DEPLOY` | `BLOCKED` | No verified staging host, pinned SSH host key, deployment key, remote release command, or GitHub Actions artifact run ID is available. |
| `SERVED_BUNDLE` | `P3.2` | Read-only `https://staging-app.hdconnect.net/version.json` returned build `p32-vps-staging-finance-refresh-20260829T090000Z`. |
| `ROLLBACK_PATH` | `BLOCKED` | The workflow contract allow-lists P3.2 rollback, but the platform-owned remote command is not installed or verified. |

Contract verification: YAML parse `PASS`; static staging-only, exact-hash,
no-migration and no-production-deploy guards `PASS`; live staging version
read `HTTP 200` and staging API health `HTTP 200`. `actionlint` and
`shellcheck` are not installed in this workspace, so those tool-specific
checks remain unavailable. No remote command was invoked.

### Exact release inputs still required

- `EXACT_SECRET_REQUIRED`: GitHub Environment `staging` secrets
  `STAGING_DEPLOY_HOST`, `STAGING_DEPLOY_USER`, `STAGING_DEPLOY_SSH_KEY`,
  `STAGING_DEPLOY_KNOWN_HOSTS`, and `STAGING_REMOTE_ARTIFACT_DIR`.
- `STAGING_TARGET_ATTESTATION` must be configured as a GitHub Environment
  variable with the exact value
  `staging-app.hdconnect.net|staging-api.hdconnect.net|/srv/hd-manager-staging/incoming`.
- `EXACT_PERMISSION_REQUIRED`: approved `staging` environment reviewer; GitHub
  Actions artifact read permission; and SSH permission restricted to the
  verified staging host plus executable
  `/usr/local/sbin/hd-manager-staging-release`.
- `EXACT_TARGET_REQUIRED`: host whose service identity is verified for
  `staging-app.hdconnect.net`, remote artifact directory
  `/srv/hd-manager-staging/incoming`, staging API
  `https://staging-api.hdconnect.net/api/v1`, and no production host/vhost.

No release was attempted because these inputs cannot be safely inferred from
the workspace. The next action belongs to the staging platform/infra owner:
provision and attest the exact staging inputs, upload the exact artifact to a
GitHub Actions run, then run the reviewed manual workflow.

## P4.2 approved staging release preflight

P4.2 was stopped before SSH/SCP/deploy because the required staging-only
attestations cannot be proven in the current runtime. This is a deployment
gate, not a business-logic failure.

| Required attestation | Result | Evidence |
| --- | --- | --- |
| `STAGING_DEPLOY_HOST` | `BLOCKED` | No local deployment environment variables or SSH host configuration are present. The host must be supplied through the reviewed GitHub Environment `staging`, not inferred from the public staging URL. |
| `STAGING_REMOTE_PATH` | `BLOCKED` | `/srv/hd-manager-staging/incoming` is specified by the local contract but has not been attested by a reachable staging host. |
| `STAGING_SERVICE` | `BLOCKED` | The required platform-owned executable `/usr/local/sbin/hd-manager-staging-release` has not been reachable or verified; no SSH connection was attempted. |
| `STAGING_DOMAIN` | `PASS` | Read-only HTTPS checks returned `200` from `https://staging-app.hdconnect.net/version.json` and `200` from `https://staging-api.hdconnect.net/api/v1/health`. |

Additional P4.2 evidence:

- The exact local artifact remains `PASS`: 3,715,656 bytes and SHA-256
  `08A6FB1849F0448AEA9B01A65480DEACBAD58FD81A3F8FEA03075C4AF582BB18`.
- The ZIP's `version.json` identifies build
  `p4-vps-staging-20260829T072544Z`.
- Read-only GitHub Actions artifact query returned `94` artifacts and `0`
  named `hd-manager-p4-vps-staging-20260829T072544Z.zip`; therefore there is
  no approved Actions artifact run ID to feed the immutable release contract.
- Read-only check of `main` returned `404` for
  `.github/workflows/release-staging.yml`; the local contract has not been
  committed or activated on GitHub.
- Current `SERVED_BUNDLE` remains
  `p32-vps-staging-finance-refresh-20260829T090000Z` (`P3.2`), not P4.
- The known-good rollback identity is P3.2, but its remote rollback command
  cannot be verified until the same staging host/service attestation exists.
- Browser E2E was intentionally not run: no P4 bundle is live, and a P3.2
  browser session is not evidence for P4.

P4.2 exact input required before a deployment attempt:

1. GitHub Environment `staging` with the secrets and target attestation
   specified in the release contract.
2. A completed GitHub Actions artifact run containing exactly
   `hd-manager-p4-vps-staging-20260829T072544Z.zip` with the verified SHA-256.
3. Platform-owner attestation that the fixed release command operates only on
   the HTTPS staging UI, staging API, and isolated staging release directory.
4. Environment approval for that specific staging release run.

No production, Firebase, database, payment, business-data, migration, or
service-restart operation occurred during this preflight.

## Blockers

### B1 - isolated staging release route is unavailable

- `BLOCKER`: No reviewed staging frontend release path is available from this
  workspace/runtime.
- `OWNER`: Staging platform/infra owner.
- `ROOT_CAUSE`: Only a production-only workflow and generic VPS scripts are
  available; those do not prove staging isolation and may change Nginx or run
  migrations.
- `EXACT_INPUT_REQUIRED`: An approved staging-only release command/workflow,
  target host/container identity, artifact destination, and a verification
  procedure that preserves production vhosts and does not migrate data.
- `NEXT_ACTION`: Platform owner supplies or executes that reviewed release
  path for the P4 artifact. Then re-check live `version.json`/hash and run the
  browser E2E matrix against the P4 bundle.

### B2 - automated staging E2E environment is not configured

- `BLOCKER`: The controlled contract runner has no staging ingress/test account
  environment variables.
- `OWNER`: Staging test/platform owner.
- `ROOT_CAUSE`: `G10_STAGING_API_BASE_URL`, `G10_STAGING_EMAIL`, and
  `G10_STAGING_PASSWORD` are absent from the controlled test environment.
- `EXACT_INPUT_REQUIRED`: A disposable staging account/tenant made available
  through the approved E2E secret injection mechanism, plus a permitted
  browser test procedure after P4 is live.
- `NEXT_ACTION`: Configure only the disposable staging test inputs; do not use
  a production account or Firebase production data.

## Required final status

```text
FIREBASE_PRODUCTION = ACTIVE / UNCHANGED
PRODUCTION_DATA_CHANGED = NO
PRODUCTION_WRITES = 0
PRODUCTION_MIGRATION = NONE
PRODUCTION_DEPLOY = NONE
FIREBASE_SHUTDOWN = NONE
DATA_LOSS = NONE OBSERVED

STAGING_RELEASE_PATH = BLOCKED
P4_ARTIFACT_VERIFIED = PASS
P4_STAGING_DEPLOY = BLOCKED
SERVED_BUNDLE = P3.2
ROLLBACK_PATH = BLOCKED
BROWSER_E2E = BLOCKED
STAGING_RELEASE = BLOCKED
STAGING_E2E = BLOCKED
HD_MANAGER_VPS_COMPATIBLE = NO
CANARY_READY = NO
CUTOVER_READY = NO
```

P4 cannot pass until B1 is resolved and the deployed P4 artifact is proven in
an HTTPS browser against the disposable staging tenant and isolated staging
PostgreSQL/Redis targets.
