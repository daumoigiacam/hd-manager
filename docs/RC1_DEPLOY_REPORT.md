# HD CONNECT RC1 Deployment Report

Generated: 2026-08-01 (Asia/Ho_Chi_Minh)

## Release identity

- Application version: `2026.8.1-rc1`
- Android version: `2026.08.01-rc1` (`versionCode 26080101`)
- Primary source commit: `91af4e2196faedd004f191fe898b4570ae9655c1`
- Commit message: `HD CONNECT RC1 Premium UI + Performance + UX`
- GitHub workflow: [Deploy HD Manager #22](https://github.com/daumoigiacam/hd-manager/actions/runs/30661633478)
- Production: https://app.hdconnect.net

## Scope shipped

The RC1 source commit contains the completed Premium UI, performance and UX work, including:

- Premium dashboard, navigation, data-display and visual-polish work covered by the existing QA and acceptance reports.
- Safer shared-phone login resolution: an active employee profile takes precedence over a customer profile with the same phone number. No Firestore records were removed.
- Order/request and order-detail layout fixes so fixed headers and navigation do not cover actions or content.
- Executive dashboard product metrics correction so product profit is derived from revenue and cost instead of displaying an incorrect aggregate as profit.
- RC1 application and Android version metadata.

Files in the RC1 source commit:

- `android/app/build.gradle`
- `docs/PREMIUM_ACCEPTANCE.md`
- `docs/PREMIUM_QA_REPORT.md`
- `package.json`
- `package-lock.json`
- `src/App.jsx`
- `src/index.css`
- `src/services/executiveDashboardService.js`

No Firebase project/configuration, Firestore data/rules, API contract, authentication data, payment integration, role data, QR schema, or business data was migrated or changed by this release process.

## Validation

| Check | Result | Notes |
| --- | --- | --- |
| `npm install` | PASS | Dependencies already matched the lockfile. |
| `npm audit --omit=dev` | PASS | 0 production dependency vulnerabilities reported. |
| `npm audit` | WARNING | 38 development/tooling findings remain, mostly EAS/Electron tooling. No forced upgrade was applied because it would change the release toolchain. |
| `npm run lint` | NOT CONFIGURED | The repository has no `lint` script. |
| `node --check functions/index.js` | PASS | Functions syntax check passed. |
| `npm run test:all` | PASS | AI/Zalo and functional tests passed. |
| `npm run test:performance` | PASS WITH RISKS | Static audit flags scalability work for future phases. |
| `npm run test:stress:big` | PASS | 11,309 operations; no crash, ANR, or memory-leak signal in the Node harness. |
| `npm run test:kpi` | PASS | API 85 ms, screen-open 11.09 ms, no leak/crash signal. Physical-device KPI log was not supplied and remains warning-only. |
| `npm run test:design-system` | PASS | Design-system checks passed. |
| `npm run build` | PASS | Vite production build completed. |
| GitHub Actions | PASS | All deploy job steps passed, including VPS deploy and production hash verification. |
| Production HTTP verification | PASS | `https://app.hdconnect.net/index.html?release=91af4e2` returned HTTP 200 after deployment. |

### Known performance risks retained for a later, isolated performance sprint

- Some screens still have full-collection realtime listeners.
- Legacy webhook fallback can scan up to 2,000 orders.
- `src/App.jsx` remains large and should be split only in a separately tested refactor.

These were not changed in RC1 to avoid altering business behavior during release validation.

## Build artifacts

Artifacts are stored outside the repository to keep Git clean:

`D:\HD CONNECT Releases\2026.08.01-RC1`

| Artifact | Status | Size | SHA-256 |
| --- | --- | ---: | --- |
| `HD-Manager-RC1-2026.08.01-debug.apk` | PASS, Android debug-signed | 6,810,869 bytes | `10BC49073E4B4A9421DE11F2D508E5D72455CBBB26BA1CB390BE2BB3E52ADBFF` |
| `HD-Manager-RC1-2026.08.01-release-UNSIGNED.apk` | Build PASS, unsigned | 5,459,228 bytes | `82C42494A1BFBB589E3CC7A3093B265DE522CBB96F0DAC8C3B580A8C9B55DE9F` |
| `HD-Manager-RC1-2026.08.01-Setup.exe` | Build PASS, Authenticode unsigned | 155,699,727 bytes | `DDE60289F9BCE1EF01DCB5947F5FD5A40DE2BD615CC212254BDD25484C59ECBF` |

### Android and Windows signing status

- The Debug APK verifies with Android APK Signature Scheme v2 using the Android Debug certificate. It is suitable for device testing only.
- The Release APK compiles successfully but is intentionally named `UNSIGNED`: no `HD_RELEASE_*` signing configuration, Android keystore, or `android/key.properties` was available on this machine.
- An AAB was not generated because the project does not currently have a production Android signing configuration.
- The Windows NSIS installer builds successfully, but `Get-AuthenticodeSignature` reports `NotSigned`; no Windows code-signing certificate is configured.

Do not publish the unsigned Release APK or the unsigned Windows installer as a trusted production download. Provide the existing production Android keystore and Windows code-signing certificate configuration before the next release to produce installable/update-safe signed artifacts.

## Deployment conclusion

Web production deployment is PASS at the RC1 source commit. Automated regression, build, stress and KPI checks are PASS. Native production distribution is not fully release-ready until Android and Windows signing credentials are configured. Device installation/login smoke tests also require a connected Android device and Windows test machine/session; they were not simulated or claimed as passed.
