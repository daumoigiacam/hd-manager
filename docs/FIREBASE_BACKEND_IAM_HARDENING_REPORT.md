# Firebase Backend and IAM Hardening Report

Date: 2026-08-09

## Scope and non-actions

This report extends `FIREBASE_CICD_RUNTIME_IAM_AUDIT.md`. It is an audit and
deployment-hardening plan only. No Firebase Function, Firebase Hosting site,
Firestore Rule, database document, secret, service account, IAM policy, VPS
file, source business logic, commit, push, or production deployment was
changed.

## Final status

**BLOCKED - NOT READY FOR DEPLOY**

The source/prod Function delta is understood and the local security quality
gates now pass. Deployment remains blocked because the runtime signBlob IAM
binding and the source of production Function configuration/secrets are not
verified. This report deliberately does not replace those facts with guesses.

## Function inventory and release decision

Source exports: 22. Firebase CLI production inventory: 17. No deployed-only
Functions were found.

| Function | Source | Production | Trigger | Called by | Business purpose | Required in production | Risk | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `sepayQrImageProxy` | Yes | Yes | HTTPS GET/POST | Frontend via `/api/sepay/qr-image` | Safely proxies payment QR images | Yes | Payment display outage | Keep; regression-test with SePay release |
| `identityLogin` | Yes | Yes | HTTPS POST | `identityCenter.js` login | Authenticates identity and creates Firebase custom token | Yes | Login outage / signBlob | Keep; runtime IAM test required |
| `identityRegisterCompany` | Yes | No | HTTPS POST | Frontend onboarding and `/api/identity/register-company` | Creates company identity/session | Yes for new-company onboarding | Calls identity/custom-token path | Deploy candidate after signBlob/config gates |
| `identityCompleteSetup` | Yes | Yes | HTTPS POST | Identity Center setup flow | Password, username, PIN, trusted-device setup | Yes | Account setup outage | Keep |
| `identityRequestRecovery` | Yes | Yes | HTTPS POST | Identity Center recovery flow | Trusted-device password-recovery request | Yes | Recovery outage | Keep |
| `identityCompleteRecovery` | Yes | Yes | HTTPS POST | Identity Center recovery flow | Completes verified password recovery | Yes | Recovery outage | Keep |
| `identityVerifyPin` | Yes | Yes | HTTPS POST | Sensitive UI actions | Verifies user PIN | Yes | Sensitive action controls | Keep |
| `identityDevices` | Yes | Yes | HTTPS POST | Identity Center device list | Lists trusted devices | Yes | Account security UI degraded | Keep |
| `identityRevokeDevices` | Yes | Yes | HTTPS POST | Identity Center device revoke | Revokes one/all trusted devices | Yes | Security control outage | Keep |
| `identityLogout` | Yes | Yes | HTTPS POST | App logout | Revokes/records the identity session | Yes | Session security outage | Keep |
| `identityAudit` | Yes | Yes | HTTPS POST | Identity Center audit UI | Lists immutable identity audit events | Yes | Audit visibility degraded | Keep |
| `customerPortalBootstrap` | Yes | No | HTTPS protected customer request | Customer portal via `/api/customer/bootstrap` | Returns sanitized customer portal bootstrap data | Yes for customer portal | Customer portal cannot load | Deploy candidate after integration test |
| `geminiGenerateContent` | Yes | No | HTTPS, 60 s, 1 GB | AI gateway route `/api/ai/generate-content` | Generates AI content with Gemini | Optional; only when AI is enabled | Needs `GEMINI_API_KEY`, cost and model validation | HOLD |
| `customerRedeemPoints` | Yes | No | HTTPS protected customer request | Customer portal via `/api/customer/redeem-points` | Redeems customer loyalty points transactionally | Yes if reward redemption is enabled | Financial/loyalty mutation | Deploy candidate only after dedicated integration test |
| `autoLockPayrollPeriods` | Yes | No | Gen2 Scheduler every minute, `asia-southeast1` | Cloud Scheduler only; no frontend route | Locks/snapshots payroll and carries debt forward | Yes for automatic payroll close | Can lock/carry data on a bad configuration | HOLD until payroll production readiness is approved |
| `processPaymentJob` | Yes | Yes | Firestore `payment_jobs` document create | Payment workflow writes job document | Processes queued payment notification work | Yes | Payment notification delay | Keep; test existing job idempotency |
| `createPayosPaymentLink` | Yes | Yes | HTTPS POST | PayOS frontend route | Creates PayOS payment link | Yes | Payment creation outage | Keep; requires PayOS config |
| `payosWebhook` | Yes | Yes | HTTPS POST | PayOS provider webhook | Receives and validates PayOS payment event | Yes | Payment reconciliation outage | Keep; webhook idempotency test before release |
| `syncPayosPaymentStatus` | Yes | Yes | HTTPS POST | PayOS frontend route | Reconciles payment status | Yes | Stale payment status | Keep; requires PayOS config |
| `createSepayPaymentRequest` | Yes | Yes | HTTPS POST | Frontend through Firebase Hosting `/api/sepay/create-payment-request` | Creates SePay request/QR metadata | Yes | Payment request outage | Keep; requires SePay config |
| `sepayWebhook` | Yes | Yes | HTTPS POST | SePay webhook and Hosting `/webhooks/sepay` | Validates and records SePay payment event | Yes | Payment reconciliation outage | Keep; webhook idempotency test before release |
| `syncSepayPaymentStatus` | Yes | Yes | HTTPS POST | Frontend through Firebase Hosting `/api/sepay/sync-payment` | Reconciles SePay status | Yes | Stale payment status | Keep; requires SePay config |

### Functions to deploy after all gates pass

1. `identityRegisterCompany`
2. `customerPortalBootstrap`
3. `customerRedeemPoints`

They are source-backed, frontend-referenced, and have no evidence of being
obsolete. Their release must be explicitly filtered with Firebase CLI rather
than redeploying all Functions by default.

### Functions to hold

1. `geminiGenerateContent`: hold until a production Gemini secret, model,
   cost policy, and AI smoke test are confirmed.
2. `autoLockPayrollPeriods`: hold until the complete payroll snapshot/policy
   readiness review, `HD_MANAGER_PAYROLL_RULES_VERSION`, scheduler behavior,
   and first controlled period test are approved.

### Functions to remove after review

None. There is no evidence that any source Function is obsolete. No deletion
or `firebase deploy --force` may be used.

## IdentityLogin and signBlob

Observed source flow:

```text
identityLogin HTTPS request
  -> identityCenter.login()
  -> issueSession()
  -> admin.auth().createCustomToken(firebaseUid, claims)
  -> IAM Credentials signBlob
```

Facts:

* `functions/identityCenter.js:333` calls `createCustomToken`.
* `functions/index.js:45` uses `admin.initializeApp()` with application-default
  credentials.
* No source `serviceAccountId` or custom Admin credential is configured.
* The Cloud Console showed the active default Compute service account page for
  `644131886856-compute@developer.gserviceaccount.com` in project
  `hd-manager-c5839`.
* IAM Service Account Credentials API is enabled; the Console API dashboard
  showed recent requests with no API-level errors. This is not proof of an IAM
  policy binding or successful custom-token generation.

| Item | Status |
| --- | --- |
| Runtime service account | `644131886856-compute@developer.gserviceaccount.com` observed |
| Signing service account | Likely the same default Compute service account; NOT VERIFIED |
| Calling principal | Likely the Gen2 runtime identity; NOT VERIFIED by Cloud Audit Log |
| Missing permission | `iam.serviceAccounts.signBlob` reported by production error |
| Least-privilege candidate | `roles/iam.serviceAccountTokenCreator` on the exact signing service-account resource |
| IAM policy evidence | NOT VERIFIED: Console policy view timed out and Google Cloud CLI is unavailable |
| Safe runtime custom-token test | NOT RUN: no non-production identity/runtime target and no verified IAM binding |

Required verification before any IAM mutation:

1. Open Cloud Audit Logs for the failed `signBlob` request.
2. Record the caller principal and the target service account from that event.
3. Inspect the target service account IAM policy.
4. Only if the evidence confirms the inferred path, grant
   `roles/iam.serviceAccountTokenCreator` to the runtime service account on
   that one service account resource.
5. Run a controlled test identity through `identityLogin`, then verify token
   creation, token validation, logout, and no `signBlob` denial.

Do not grant Owner, Editor, or a project-wide Token Creator role. No IAM change
was made during this audit.

## Secrets and runtime configuration strategy

`functions/.env` exists locally and is ignored by Git. No
`functions/.env.production`, `.secret.local`, source `defineSecret`, or
declarative Secret Manager binding was found. No sensitive value was read or
printed by this audit. The production source of every value below is therefore
unverified.

| Configuration | Used by | Local/source evidence | Production configuration | CI/CD requires value | Recommended storage |
| --- | --- | --- | --- | --- | --- |
| `PAYOS_CLIENT_ID` | PayOS link/status/webhook | Local `.env` and `.env.example` name | NOT VERIFIED | No GitHub value; runtime requires it | Runtime configuration / Secret Manager if treated sensitive |
| `PAYOS_API_KEY` | PayOS API calls | Local `.env` and `.env.example` name | NOT VERIFIED | No | Secret Manager |
| `PAYOS_CHECKSUM_KEY` | PayOS request/webhook verification | Local `.env` and `.env.example` name | NOT VERIFIED | No | Secret Manager |
| `PAYOS_RETURN_URL`, `PAYOS_CANCEL_URL` | PayOS redirects | Local `.env` and `.env.example` name | NOT VERIFIED | No | Non-secret runtime config |
| `SEPAY_WEBHOOK_API_KEY`, `SEPAY_WEBHOOK_SECRET` | SePay webhook validation | Local `.env` and `.env.example` name | NOT VERIFIED | No | Secret Manager |
| `SEPAY_BANK_*`, `SEPAY_VIRTUAL_ACCOUNT` | SePay receiving profile | Read by source | NOT VERIFIED | No | Protected runtime configuration / Secret Manager as appropriate |
| `GEMINI_API_KEY` | `geminiGenerateContent` only | `.env.example` name and source read | NOT VERIFIED | Only if AI Function is released | Secret Manager |
| `GEMINI_MODEL` | `geminiGenerateContent` | `.env.example` name and source read | NOT VERIFIED | No | Non-secret runtime config |
| `HD_MANAGER_APP_ID`, `HD_MANAGER_PUBLIC_URL`, `HD_MANAGER_ALLOWED_ORIGINS` | App/tenant/CORS behavior | Source reads; local env names | NOT VERIFIED | No | Non-secret runtime config |
| `HD_MANAGER_PAYROLL_RULES_VERSION`, `HD_MANAGER_PAYROLL_APP_IDS` | Payroll auto-lock | Source reads | NOT VERIFIED | Only if auto-lock is released | Non-secret runtime config with change control |

Static scanning found no API-key format, private-key PEM, or token-like secret
committed in `src`, `functions`, or `.github` (local `.env` was excluded from
the scan). References to PayOS/SePay in source are configuration names/routes,
not exposed values.

## GitHub Actions authentication and deployment identity

The current workflow uses an absent `FIREBASE_SERVICE_ACCOUNT` JSON secret.
That is the verified immediate CI failure. Do not create that key.

Target design:

```text
GitHub Actions on daumoigiacam/hd-manager main
  -> GitHub OIDC token
  -> Google Workload Identity Federation provider
  -> hd-manager-ci-deployer service account
  -> filtered Firebase deployment + VPS SSH deployment

Firebase Functions runtime service account
  != hd-manager-ci-deployer
```

The GitHub workflow should eventually contain only these additional job
permissions and non-secret identifiers:

```yaml
permissions:
  contents: read
  id-token: write

# google-github-actions/auth@v2
# workload_identity_provider: ${{ vars.GCP_WIF_PROVIDER }}
# service_account: ${{ vars.GCP_DEPLOY_SERVICE_ACCOUNT }}
```

WIF must restrict the provider attribute condition to exactly:

`repo:daumoigiacam/hd-manager:ref:refs/heads/main`

The WIF principal receives `roles/iam.workloadIdentityUser` on only the
dedicated deployment service account. The deployment account then receives a
separately reviewed component-specific deployment permission set. It must not
reuse the Function runtime account and must not receive Owner or Editor.

Expected deployment capabilities to prove with a dry run after WIF setup:

* Firebase Hosting deployment.
* Cloud Functions Gen2 deployment, including Cloud Run, Eventarc, Cloud Build,
  Artifact Registry, and scoped `serviceAccountUser` where required.
* Firestore Rules/Indexes and Storage Rules deployment.
* Exact Secret Manager read/reference access only for Function secrets that
  deployment is allowed to bind.

Do not grant this set blindly. Start with the smallest component-specific
roles, run a filtered dry run, and add only the permission shown as missing.

## Hosting and VPS roles

* `app.hdconnect.net` remains a VPS/Nginx frontend at
  `/var/www/hd-manager`.
* Firebase Hosting must remain because the frontend sends PayOS/SePay API
  routes to `https://hd-manager-c5839.web.app` and relies on its rewrites.
* Identity API currently uses direct Cloud Functions URLs, so identity does not
  depend on Hosting for its HTTP path.
* Do not move the frontend to Firebase Hosting without a separate architecture
  decision.

The eventual order remains:

```text
quality gates -> WIF auth -> filtered Firebase release -> Firebase API smoke
-> VPS staged release -> Nginx/HTTPS health check -> application smoke
```

If Firebase release fails, the VPS release must not run. The existing VPS
script stages a release before swapping its managed current link; preserve that
rollback behavior.

## Workflow and action review

* `actions/checkout@v5`, `actions/setup-node@v5`, and
  `actions/setup-java@v5` are currently present as an uncommitted user change;
  this audit did not modify them.
* Java 21 is required in this workflow because it runs both Firestore Emulator
  integration test stages. It must not be removed.
* `google-github-actions/auth@v2` can be retained when switched from
  `credentials_json` to WIF parameters.
* Firebase CLI supports `firebase deploy --dry-run`, but its own help warns
  that a dry run can still enable APIs. It was not executed without explicit
  authorization.

## Executed verification

| Check | Result |
| --- | --- |
| Firestore payroll Rule integration suite | PASS: 19/19, executed from ASCII worktree |
| Firestore tenant-isolation Rule suite | PASS: 13/13, executed from ASCII worktree |
| Identity Center source test | PASS |
| Functions syntax test | PASS |
| Cross-account order sync test | PASS: 4/4 code-level cases |
| Realtime tenant sync test | PASS: 4/4 code-level cases |
| Root production dependency audit | PASS: 0 vulnerabilities |
| Functions production dependency audit | PASS: 0 vulnerabilities |
| Runtime `identityLogin -> createCustomToken` | NOT TESTED against deployed IAM |
| PayOS/SePay end-to-end webhook smoke | NOT TESTED; no deployment made |
| Production ACCOUNTANT -> OWNER realtime smoke | NOT TESTED; no deployment made |

The Rule test logs contain expected `PERMISSION_DENIED` records for cases the
test suite intentionally rejects. Both commands exited successfully.

## Release gate

Before a production release can be proposed, all of the following are required:

1. Cloud Audit Log proof and resource-level remediation for `signBlob`.
2. Documented production configuration and secret source for every released
   Function.
3. WIF provider plus dedicated deployment service account, created only after
   explicit permission, with repository/branch restriction.
4. Workflow migration to WIF with no JSON key and a reviewed permission map.
5. Filtered Firebase dry run, if explicitly approved, then filtered Function
   release of only the three candidates.
6. PayOS/SePay API, webhook idempotency, Identity, order creation, and
   cross-account realtime production smoke tests.
7. Separate approval before releasing `geminiGenerateContent` or
   `autoLockPayrollPeriods`.

## Final matrix

| Area | Status |
| --- | --- |
| Functions source | 22 audited |
| Functions production | 17 verified by Firebase CLI |
| Functions to deploy now | None - deployment intentionally blocked |
| Functions to deploy after gates | `identityRegisterCompany`, `customerPortalBootstrap`, `customerRedeemPoints` |
| Functions to hold | `geminiGenerateContent`, `autoLockPayrollPeriods` |
| Functions to remove | None |
| CI/CD identity | Proposed dedicated WIF deployment account; not created |
| Runtime identity | Default Compute service account observed |
| signBlob | BLOCKED pending IAM policy/Audit Log evidence |
| Secrets | BLOCKED pending production source/mapping verification |
| Firebase Hosting | Required API gateway; retain |
| VPS | Required primary frontend; retain |
| Build/test quality | PASS for executed local suites |
| Production sync | NOT TESTED after deploy |
| Production | BLOCKED |
