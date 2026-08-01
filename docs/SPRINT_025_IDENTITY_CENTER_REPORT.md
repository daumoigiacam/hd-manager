# Sprint 025 - Identity Center & Smart Authentication

## Scope and boundaries

This sprint changes only the authentication and identity presentation/service layer. Order, warehouse, debt, payroll, evaluation, report, Firebase business data, roles, SePay, QR, and webhook flows are unchanged.

## Delivered capabilities

- One sign-in form accepts a normalized username or Vietnamese phone number while retaining the existing internal user identifier.
- Identity data and credential hashes are isolated in the private `identity_accounts` collection. Password and PIN hashes use scrypt; legacy PBKDF2 password hashes are verified once and safely migrated after a successful sign-in.
- First-time accounts accept the documented temporary password `12345678` and must finish password change, username creation, a six-digit PIN, biometric preference, and trusted-device registration before the application is activated.
- Firebase custom tokens preserve the current user/company/role claims and Firebase Auth persistence provides silent returning sessions. Custom claims are refreshed after initial setup or a username change.
- Trusted devices store only an opaque, server-verified device secret. Native Android/iOS uses Keychain/Keystore through Capacitor Native Biometric; the web fallback is clearly treated as lower assurance and never stores a password, PIN, Firebase refresh token, or reset token.
- Password recovery is available only on a server-verified trusted device. It requires biometric confirmation where enabled, otherwise the server verifies the six-digit PIN. The reset token is hashed, single use, and expires after ten minutes.
- The personal profile contains identity controls for password, username, PIN, biometric preference, trusted-device revocation, sign-out everywhere, and immutable audit activity.
- The server records login/logout, password/PIN/username changes, reset actions, biometric changes, trusted-device registration, and device revocation in append-only audit records. Client Firestore rules do not grant access to the private identity or audit collections.
- Login attempts are rate-limited. Five failed attempts lock the identifier for ten minutes.

## Data flow

```text
Username or phone + password
  -> identityLogin Cloud Function
  -> private identity account / existing employee or customer record lookup
  -> Firebase custom token + persisted Firebase Auth session
  -> mandatory setup only when required

Trusted device + biometric or PIN
  -> identityRequestRecovery Cloud Function
  -> one-use 10-minute reset token
  -> identityCompleteRecovery Cloud Function
  -> new Firebase custom token and authenticated session
```

## Files changed

- `functions/identityCenter.js`: credential, device, recovery, audit, rate-limit, and session service.
- `functions/index.js`: HTTPS Firebase Function entry points for Identity Center.
- `firebase.json`: Hosting rewrites for all Identity Center API routes.
- `src/services/identityCenter.js`: browser/Capacitor client, device metadata, secure opaque-secret storage, biometric bridge.
- `src/App.jsx`: identity sign-in, mandatory setup, recovery, session restoration, logout audit, and profile security center.
- `android/app/capacitor.build.gradle` and `android/capacitor.settings.gradle`: Capacitor biometric plugin synchronization.
- `package.json` and `package-lock.json`: Capacitor Native Biometric dependency and identity test scripts.
- `tests/identity-center.test.mjs`: local regression coverage for identifier normalization, PIN/password rules, legacy-hash migration, and Hosting routes.

## Verification

| Check | Result |
| --- | --- |
| `npm run test:identity` | PASS |
| `npm test` (existing regression suite plus identity test) | PASS |
| `node --check functions/identityCenter.js` | PASS |
| `node --check functions/index.js` | PASS |
| `npm run build` | PASS |
| `npx cap sync android` | PASS |

## Manual release checklist

The local automated checks validate all client contract paths and build artefacts. The following production-integrated checks require deployed Firebase Functions and a physical device, so they remain a release verification checklist rather than simulated claims:

1. Sign in once with an existing employee and an existing customer using phone and username.
2. Complete the mandatory first-time password, username, PIN, biometric, and trusted-device workflow.
3. Relaunch Android/iOS and confirm Firebase session restoration without a password prompt.
4. Verify recovery succeeds only with a trusted device plus biometric/PIN, and rejects an untrusted device and expired/reused reset token.
5. Verify device revocation and sign-out-all invalidate the targeted session(s).

No business records or historical Firestore data are migrated or removed by this sprint.

## Post-release connection correction

The first deployed client attempted to call `/api/identity/*` through a Hosting route that was not deployed on `app.hdconnect.net`; the old Firebase Hosting fallback returned the SPA HTML instead of JSON. This caused browsers to report `Failed to fetch` because of CORS. The client now uses the direct Firebase Gen 2 Functions origin by default, while retaining an explicit environment override for a future reverse proxy. All nine Identity endpoints were deployed and verified to return JSON with an allowed `https://app.hdconnect.net` origin. No authentication records or business data were changed during that verification.
