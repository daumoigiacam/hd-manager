# Firebase CI/CD and Runtime IAM Audit

Date: 2026-08-09

## Scope and non-actions

This is a read-only audit of Firebase deployment, runtime IAM, and the current
GitHub Actions workflow. No Firebase resource, IAM policy, secret, function,
rule, VPS file, source business logic, commit, push, or deployment was changed.

## Executive status

**FINAL STATUS: BLOCKED - NOT READY FOR DEPLOY**

The project has a split production architecture. The public application is
served by the VPS, while Firebase Functions and Firebase Hosting API rewrites
remain required. The workflow currently requires a long-lived service-account
JSON secret that does not exist. In addition, the five source-only Functions
have not reached production and the production configuration source for
sensitive Function environment variables is not proven.

## Deployment architecture

```text
GitHub Actions
  |- quality gates: npm ci, lint, typecheck, tests, build, artifact
  |- Firebase deploy: Functions + Firestore Rules + Indexes + Storage + Hosting
  `- VPS deploy: dist -> /var/www/hd-manager -> Nginx -> app.hdconnect.net

Browser application
  |- app.hdconnect.net -> VPS Nginx frontend (primary UI)
  |- Firebase Auth / Firestore / Storage -> project hd-manager-c5839
  |- Identity API -> direct Cloud Functions endpoint
  `- PayOS API base -> hd-manager-c5839.web.app Firebase Hosting rewrites
```

Evidence collected during the audit:

* `.firebaserc` selects project `hd-manager-c5839`.
* `https://app.hdconnect.net` returned `Server: nginx/1.24.0 (Ubuntu)`.
* `https://hd-manager-c5839.web.app` returned an older frontend build dated
  2026-07-20.
* The application uses direct Cloud Functions for Identity requests and uses
  Firebase Hosting rewrites for PayOS requests.
* A CORS preflight from `https://app.hdconnect.net` to the deployed
  `identityLogin` Function returned HTTP 204.

Conclusion: Firebase Hosting is not the primary public frontend, but it is
still a production API gateway. A VPS-only deploy would leave the Firebase
backend/rewrite release incomplete. A Firebase-only Hosting deploy would not
update `app.hdconnect.net`.

## GitHub Actions root cause

Current workflow file: `.github/workflows/deploy.yml`.

The current failure is exact and deterministic:

* Step: `Require Firebase deployment credential` (lines 94-102).
* Command: checks whether `secrets.FIREBASE_SERVICE_ACCOUNT` is empty.
* Result: it emits `Missing FIREBASE_SERVICE_ACCOUNT` and exits with code 1.
* Consequence: Firebase deploy and VPS deploy do not run.

The earlier run at commit `92c73c2` failed in `Install dependencies` while
running `npm ci`. The historic detailed runner log was not accessible from this
environment, so the exact inner npm cause cannot be asserted. A local clean
reproduction of that revision completed `npm ci`; therefore it is not a proven
current blocker. The current hard blocker is the explicit credential gate.

The existing workflow also has a user-local, uncommitted action version update
for checkout/setup actions. This audit did not edit or stage that change.

## Function inventory

Source exports: 22. Production Functions listed by Firebase CLI: 17.

### Both source and production

`createPayosPaymentLink`, `createSepayPaymentRequest`, `identityAudit`,
`identityCompleteRecovery`, `identityCompleteSetup`, `identityDevices`,
`identityLogin`, `identityLogout`, `identityRequestRecovery`,
`identityRevokeDevices`, `identityVerifyPin`, `payosWebhook`,
`processPaymentJob`, `sepayQrImageProxy`, `sepayWebhook`,
`syncPayosPaymentStatus`, `syncSepayPaymentStatus`.

### Source only - not deployed

| Function | Type / trigger | Purpose and caller | Production impact | Why absent |
| --- | --- | --- | --- | --- |
| `identityRegisterCompany` | HTTPS | Firebase Hosting rewrite `/api/identity/register-company`; frontend onboarding calls it | High: new company registration fails through current Hosting rewrite | Added in `92c73c2`; no successful Firebase deploy since |
| `customerPortalBootstrap` | HTTPS, protected customer request | Rewrite `/api/customer/bootstrap`; customer portal calls it | High: customer portal bootstrap fails through rewrite | Added in `92c73c2`; no successful Firebase deploy since |
| `customerRedeemPoints` | HTTPS, protected customer request | Rewrite `/api/customer/redeem-points`; customer portal calls it | High: customer reward redemption cannot run | Added in `92c73c2`; no successful Firebase deploy since |
| `geminiGenerateContent` | HTTPS, 60 s / 1 GB | Rewrite `/api/ai/generate-content`; AI gateway calls it | Medium/High if AI generation is enabled; not order/payment core | Added in `92c73c2`; no successful Firebase deploy since |
| `autoLockPayrollPeriods` | Gen2 scheduled job, every minute, Asia/Ho_Chi_Minh | No frontend caller; locks and snapshots payroll periods | High: payroll auto-lock/carry-forward is not executing in production | Added in `e368272`; the successful workflow then was VPS-only |

There are no deployed-only Functions. No Function was classified obsolete, and
none may be deleted without a separate evidence-based change review.

## Runtime IAM and the signBlob failure

The Identity flow is:

```text
identityLogin -> issueSession -> Firebase Admin createCustomToken()
                                     -> IAM Credentials signBlob
```

Evidence:

* `functions/index.js` initializes Firebase Admin with application-default
  credentials.
* `functions/identityCenter.js:333` calls
  `admin.auth().createCustomToken(firebaseUid, claims)`.
* Runtime inspection identified the active `identityLogin` Gen2 runtime service
  account as `644131886856-compute@developer.gserviceaccount.com`.
* The reported `iam.serviceAccounts.signBlob` denial maps to the custom-token
  generation call above.
* Source does not set `serviceAccountId` or a custom Admin credential.

The likely signer and caller are therefore the default Compute service account
above. The actual target service-account IAM policy could **not** be read in
this environment: Google Cloud CLI is not installed and the browser IAM policy
view was not available to this audit. Consequently, the binding is **NOT
VERIFIED** and must not be assumed present.

Least-privilege remediation to validate before any change:

1. Confirm the signer returned by the runtime/Admin SDK and the effective
   caller from Cloud Audit Logs.
2. If both are the default Compute service account, grant only
   `roles/iam.serviceAccountTokenCreator` to that runtime principal on that
   specific service-account resource, not project-wide.
3. Retest a non-production or controlled `identityLogin` custom-token flow.
4. Do not use Owner, Editor, or a broad project-wide IAM grant as a workaround.

No role binding was added by this audit.

## Function configuration and secrets

`functions/.env` exists locally and is ignored by Git. Source reads raw
`process.env` variables and has no `defineSecret`, Secret Manager binding, or
per-function `serviceAccountId` configuration.

Known variable names only (values were never read or recorded):

* PayOS: `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`,
  `PAYOS_RETURN_URL`, `PAYOS_CANCEL_URL`.
* SePay: `SEPAY_WEBHOOK_API_KEY`, `SEPAY_WEBHOOK_SECRET`.
* Application: `HD_MANAGER_APP_ID`, `HD_MANAGER_PUBLIC_URL`,
  `HD_MANAGER_ALLOWED_ORIGINS`.
* AI: `GEMINI_API_KEY`, `GEMINI_MODEL`.
* Payroll: `HD_MANAGER_PAYROLL_RULES_VERSION` is read by code and must be
  explicitly confirmed for production.

The CI runner currently has neither a checked-in production env file nor a
proven Secret Manager/CI injection mapping for these values. It is therefore
unsafe to deploy Functions from CI: the audit cannot prove that all required
runtime configuration will be supplied or preserved. Sensitive values must not
be placed in GitHub source, workflow YAML, or chat.

## Recommended GitHub Actions authentication

Do not create `FIREBASE_SERVICE_ACCOUNT` JSON key. Use GitHub OIDC with Google
Cloud Workload Identity Federation (WIF) and a dedicated deployment service
account instead.

Required workflow design, after approval:

* GitHub job permissions: `contents: read` and `id-token: write`.
* `google-github-actions/auth@v2` with `workload_identity_provider` and
  `service_account`, not `credentials_json`.
* WIF attribute condition restricted to
  `repo:daumoigiacam/hd-manager:ref:refs/heads/main`.
* A dedicated CI deployment service account, separate from the Function
  runtime service account.
* A deliberately tested, resource-scoped permission set for Firebase Hosting,
  Functions, Firestore Rules/Indexes, Storage rules, Cloud Build/Artifact
  Registry, and impersonation of only the runtime accounts required to deploy.
* Secret Manager access only to the exact Function secrets that deployment
  needs to reference, after a separate secret-migration plan.

Firebase CLI can deploy using the short-lived Application Default Credentials
provided by the Google auth action. It does not require a long-lived Firebase
service-account JSON key.

## Secret classification

### Required now

* `VPS_HOST`, `VPS_USER`, and `VPS_SSH_KEY` remain required for the existing
  VPS release step.

### Not required / do not create

* `FIREBASE_SERVICE_ACCOUNT` JSON key: do not create. Replace with WIF.
* Any service-account private key in source, Git, or chat: never required.

### Identifiers needed after approved WIF setup

These are non-secret configuration identifiers, suitable for repository
variables after creation:

* `GCP_WIF_PROVIDER`: full Workload Identity Provider resource name.
* `GCP_DEPLOY_SERVICE_ACCOUNT`: dedicated deployer service-account email.

### Function runtime secrets

PayOS, SePay, banking, and Gemini values must remain runtime secrets. Their
production source and least-privilege access policy must be documented before
the first CI Firebase deployment.

## Firestore payroll rules review

Static review found protections for locked periods, immutable snapshots,
immutable payroll audit records, carry-forward validation, and limited
adjustments. The rule validators require a complete snapshot and locked source
period for payroll carry-over writes.

The Firestore emulator test was not completed. Java is installed, but the
emulator failed to load `firestore.rules` from this non-ASCII workspace path.
This is an environment/path-encoding failure, not evidence that Rules pass.
Firestore runtime rule enforcement therefore remains **NOT VERIFIED** until
the same tests run from an ASCII-only path or Linux CI environment.

## Quality evidence collected

| Check | Result |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS |
| `npm run build` | PASS |
| `npm run test:payroll-auto-lock` | PASS, 21/21 |
| Firebase Functions source syntax | PASS through test suite |
| Firestore emulator payroll rules | NOT VERIFIED: emulator path failure |
| Runtime `createCustomToken` / signBlob | NOT VERIFIED: IAM policy and controlled test unavailable |
| Firebase deploy | NOT RUN (blocked intentionally) |
| VPS deploy | NOT RUN (blocked intentionally) |
| Production smoke / multi-user sync | NOT RUN after deploy |

## Preconditions before a deploy is considered

1. Approve WIF setup and create a dedicated deployment service account; do not
   create a JSON key.
2. Confirm the exact runtime `signBlob` caller/signer in Cloud Audit Logs and
   apply only the narrowly scoped Token Creator binding if it is truly needed.
3. Define the production source for every Function environment value, migrate
   sensitive values to Secret Manager where appropriate, and prove deploy-time
   access without exposing values.
4. Execute Firestore Rule tests from a compatible path/environment.
5. Change the workflow from key authentication to WIF and add a pre-deploy
   inventory/configuration validation. Do not weaken the deployment gate.
6. Deploy Firebase backend/rules/Hosting first only after all checks pass;
   then deploy the VPS frontend and perform Identity, payment webhook,
   order-create, and cross-account realtime smoke tests.

## Audit result

Deployment architecture: identified.

Source Functions: 22. Production Functions: 17. Missing Functions: 5.

CI root cause: verified missing long-lived credential gate. Runtime signBlob
root cause: custom-token signing path identified; exact IAM binding is pending
verification. No changes were made and no production system was deployed.
