# Biometric Login / Passkey Release Report

## Implementation

- Web: platform WebAuthn passkeys, enrolled after authenticated password verification.
- Native Android: existing hardware-protected biometric credentials, with an explicit retry button and biometric permission.
- Account security: register, list and revoke web passkeys; retain password login as fallback.
- Firebase remains the identity provider. Successful passkey verification issues the existing Firebase custom-token session.
- No face images, fingerprint templates or plaintext passwords are stored by this feature.
- The operating system chooses the available verification method (face, fingerprint or device unlock). Silent biometric verification cannot be guaranteed.

## Security

Pinned HTTPS origins and relying-party IDs, required user verification, single-use five-minute challenges, transactional replay protection, signature-counter verification, request throttling and password-change invalidation. Locked, disabled and archived linked accounts are rejected. Private credential collections remain inaccessible to client Firestore requests.

## Verification

- Identity Center unit checks: passed.
- Passkey security tests: 9 passed.
- Chromium virtual authenticator: real registration and signed authentication passed; forged signatures, missing user verification and replay rejected.
- Lint and production web build: passed.
- No production requests were made by the virtual-authenticator tests.
- Physical fingerprint / Face ID testing is NOT completed: no Android device was connected and this repository has no native iOS project.

## Release Gates

This feature is implemented locally, NOT deployed to app.hdconnect.net.

1. Release the new Firebase `identityPasskey` function and updated identity functions from the reviewed source. The current web deployment workflow does not deploy Firebase Functions.
2. Release the matching web bundle. Production passkeys must be enrolled on the actual production domain; localhost development cannot enroll against production Functions.
3. Rebuild and sign the Android app, then test enrollment, cancellation, retry, account switching and revoked access on a physical enrolled device.
4. Configure Firestore TTL cleanup for `expiresAt` on `identity_passkey_challenges` and `identity_passkey_rate_limits` as an explicitly reviewed operational change. Expired challenges are already rejected regardless of cleanup.

## User Flow

Sign in with password first, open account security and register quick login on the device. On subsequent sign-ins, use the Face ID / fingerprint button and approve the operating-system prompt. Password login remains available if verification is cancelled or unsupported.
