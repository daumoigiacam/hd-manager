# HD Manager Email Auth Migration

## Scope and safety

- HD Manager and HD Connect Platform source were changed only in isolated
  `codex/email-auth-migration` worktrees.
- No production deployment, migration, data read/write, Firebase change, or
  credential change was performed.
- No SMS provider, phone OTP endpoint, or Firebase fallback was introduced for
  the new VPS email-auth flow.

## Platform baseline

| Capability | Existing Platform baseline | This change | Gate |
| --- | --- | --- | --- |
| Email/password login, refresh, logout, `me` | Present | Reused by HD Manager | Code PASS; staging E2E not run |
| Session/JWT/RBAC/company context | Present | Reused; no client tenant override | Code PASS; staging E2E not run |
| Public registration | Missing | Verified email registration creates a Company and its OWNER atomically | PARTIAL |
| Email OTP | Missing | Hashed, expiring, attempt-limited, resend-invalidating challenge | PARTIAL |
| Email verification | Missing | Registration proof is single-use and short-lived | PARTIAL |
| Password reset | Partial legacy identity flow | Neutral email-OTP reset revokes active refresh tokens and sessions | PARTIAL |
| Password change | Present | Reused; emits security notifications through the shared mail provider | PARTIAL |
| Email change | Missing | Authenticated, actor-bound email OTP flow; revokes sessions | PARTIAL |
| Organization/OWNER | Present | New verified registration creates Company, OWNER role and canonical permissions in one transaction | PARTIAL |
| Email templates | Missing for this flow | Shared SMTP templates: `ACCOUNT_VERIFY`, `PASSWORD_RESET`, `PASSWORD_CHANGED`, `EMAIL_CHANGED`, `SECURITY_ALERT` | PARTIAL |
| Email provider | Not configured for this feature | SMTP adapter is fail-closed and does not expose configuration values | BLOCKED |
| Phone/SMS authentication | Not used by the VPS API client | No new phone/SMS flow | DISABLED |

`PARTIAL` means the code and focused tests are complete, but no staging deployment
or real disposable Gmail delivery has been performed. It is not an E2E PASS.

## Platform additions

The HD Connect Platform worktree adds:

- `EmailOtpChallenge` and `emailVerifiedAt` schema support with a migration
  that refuses non-lowercase or duplicate normalized emails before making
  email globally unique; it does not modify existing identities.
- `POST /auth/email-registration/start|verify|complete`.
- `POST /auth/email-password-reset/start|verify|complete`.
- `POST /auth/email-change/start|verify|complete`; start and complete require
  the authenticated Platform session.
- SMTP-only provider registration, fail-closed readiness checks, shared
  authentication email templates, and audit records for notification failures.
- `AUTH_PUBLIC_REGISTRATION_ENABLED`, default `false`, so public registration
  cannot be enabled accidentally.

The new public registration flow asks for the Company name before completion.
This is intentional: the current Platform `User` model requires a `companyId`,
so no user is created outside a tenant and the verified creator becomes OWNER
in the same transaction.

## HD Manager integration

When `VITE_DATA_MODE=vps-staging`, HD Manager now renders an email-only auth
view and calls only the Platform endpoints above. It includes email autofill,
six OTP cells with `one-time-code` autofill, paste, automatic focus movement,
resend countdown, loading/error states, neutral reset wording, and memory-only
password/OTP form state that is cleared after use.

The Identity Security Center adds Platform-backed email change. Existing
Firebase screens remain on the legacy path and are not used as a fallback by
the VPS email flow.

## API contract

| Operation | Endpoint | Authentication |
| --- | --- | --- |
| Start registration | `POST /auth/email-registration/start` | No |
| Verify registration OTP | `POST /auth/email-registration/verify` | No |
| Complete registration | `POST /auth/email-registration/complete` | No; single-use proof |
| Start reset | `POST /auth/email-password-reset/start` | No; neutral response |
| Verify reset OTP | `POST /auth/email-password-reset/verify` | No |
| Complete reset | `POST /auth/email-password-reset/complete` | No; single-use proof |
| Start email change | `POST /auth/email-change/start` | Platform JWT |
| Verify email change OTP | `POST /auth/email-change/verify` | No; proof is actor-bound |
| Complete email change | `POST /auth/email-change/complete` | Platform JWT |

All OTPs are six digits, HMAC-hashed using the Platform refresh-secret, expire,
have a maximum attempt count, and become invalid when resent or consumed. The
app never generates OTPs, accesses SMTP settings, or updates an email directly.

## Validation evidence

### Passed

- Platform: `prisma validate`.
- Platform: focused email/auth tests: 11 tests passed.
  - invalid OTP rejection
  - OTP hash persistence
  - resend invalidates the old code
  - neutral unknown-email reset
  - reset revokes sessions
  - actor-bound email change
  - provider fail-closed and template dispatch
- Platform: focused Identity password-reset/controller tests: 10 tests passed.
- Platform: changed-source ESLint passed.
- HD Manager: `tests/email-auth-vps-contract.test.mjs`: 4 passed.
- HD Manager: `npm run test:identity`: passed.
- HD Manager: `npm run test:vps-api`: 28 passed.
- HD Manager: `npm run typecheck`: passed.
- HD Manager: `npm run lint`: passed.
- HD Manager: VPS staging bundle verification passed with
  `VITE_DATA_MODE=vps-staging`; 13 bundle files scanned, no forbidden
  Firebase-runtime findings.
- Browser visual smoke at `http://127.0.0.1:5175/`: email login, registration,
  and reset screens render; the registration email input has
  `autocomplete="email"`; browser console has no errors. No credentials or
  form submission were used.
- `git diff --check`: passed in both worktrees.

### Current blockers

1. **No real Gmail E2E evidence.** The deployed staging API is still release
   `phase6-30e9009` (`gitSha` `30e90096cf8376021ec2de434bf7ef6ede404b40`),
   and staging web is still `phase6-0bc09fb-723c765`. Neither contains these
   un-deployed Platform or HD Manager changes.
2. **Staging SMTP is not attested.** The protected staging values must be
   configured by the owner: `MAIL_ENABLED=true`, `MAIL_HOST`, `MAIL_PORT`,
   `MAIL_USER` when required, `MAIL_PASSWORD`, `MAIL_FROM`, and
   `EMAIL_OTP_PROVIDER=smtp`. No secret values were read or printed.
3. **Public staging registration remains deliberately off** until the owner
   sets `AUTH_PUBLIC_REGISTRATION_ENABLED=true` for staging only.
4. **Disposable test mailbox missing.** A staging-only Gmail/test inbox and
   its explicit use authorization are required to prove receipt of OTPs and
   security notifications.
5. **Platform baseline typecheck/build blocker.** `src/identity/staging-e2e-provisioning.ts`
   still imports the removed `../auth/utils/phone-identifier` and references
   `phoneNormalized`; this is pre-existing and outside this email flow. New
   email-auth files compile without reported type errors, but the full Platform
   `npm run typecheck` and `npm run build` cannot pass until that stale staging
   provisioner is repaired in its owning work item.
6. **Session-storage contract.** The existing Platform browser client returns
   JWTs and keeps access/refresh tokens in `sessionStorage` only (not
   `localStorage`, logs, or the app session record). This improves scope and
   clears on logout, but does not satisfy a literal “never store token in the
   app” requirement. A Platform-owned HttpOnly/Secure cookie session contract
   is required before this item can be marked fully compliant; the app must not
   invent one.

## Gmail E2E gate

`REGISTER -> GMAIL OTP -> VERIFY -> PASSWORD -> LOGIN`: **BLOCKED**.

`FORGOT PASSWORD -> GMAIL OTP -> RESET PASSWORD -> LOGIN`: **BLOCKED**.

The blocker is configuration/deployment/test-mailbox availability, not a
synthetic success claim. No SMS request and no Firebase Auth request were made
by the local VPS email-auth UI tests.

## Staging and production result

| Item | Result |
| --- | --- |
| Staging API health | PASS (HTTP 200; existing release only) |
| New email-auth endpoints on staging | BLOCKED: not deployed |
| Gmail delivery | BLOCKED: protected SMTP/test inbox not configured for this work |
| Production deployment | NONE |
| Production migration | NONE |
| Production data writes | 0 |
| Firebase production change | NONE |
| Firebase Auth fallback in new VPS flow | NONE |

## Required next gate

Release the reviewed Platform and HD Manager changes to an isolated staging
environment, apply `20260920070000_email_auth_otp` only to the staging
database, configure the staging-only values above, and run the two disposable
Gmail/browser flows. Do not promote to production based on the code-level
checks in this report.

## Final status

`EMAIL_AUTH_MIGRATION = PARTIAL`

The implementation and focused regression suite are ready for a staging-only
release. The Definition of Done is not yet met because real Gmail OTP delivery,
staging browser E2E, the Platform baseline typecheck/build, and the HttpOnly
session contract remain unresolved.
