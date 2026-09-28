# HD Manager Android Closed Testing audit - 2026-09-28

## Release decision

**BLOCKED: no new uploadable AAB exists.** `D:\secure\hd-manager-release.jks` exists (2,768 bytes), but none of the four required `HD_RELEASE_*` values are set in the process environment, project/user Gradle properties, or CI workflows. Gradle stops before compilation with the signing guard. Following the release gate, the keystore was not opened with a guessed or empty password, so alias, certificate fingerprints, subject, validity and key type remain unverified. Do not upload the older `android/app/build/outputs/bundle/release/app-release.aab` (dated 2026-08-16), and do not upload the debug APK. The Closed Testing Alpha track on Play Console remains a draft; no upload or submission was made during this audit.

Play Console's **All app bundles** page lists exactly one uploaded bundle: `versionCode 26080101`, `versionName 1.0.0`. The new project values are `26092801` and `1.0.1`, with application ID `com.hdmanager.app`, so the planned code is higher than every bundle currently listed. [Play Console app bundles](https://play.google.com/console/u/0/developers/8211151452021583585/app/4975225476191192404/bundle-explorer-selector).

| Deliverable | Value |
| --- | --- |
| New signed AAB path / size / SHA-256 | **N/A - not built** |
| QA-only debug APK | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Debug APK size | 20,711,834 bytes (rebuilt 2026-09-28) |
| Debug APK SHA-256 | `469DF45115183A1646D2C0A6A34139FF728EE69F72129F6FD079EB42DA13203D` |
| Android identity | `com.hdmanager.app`, `1.0.1` (`26092801`) in debug APK |

## Performance

The principal slow path was debt reconciliation: the Home dashboard repeatedly scanned all orders, payments and supplier imports for each customer. `src/App.jsx` now builds one indexed reconciled ledger map, shares it with Home and Orders, caches dashboard calculations by input identity, and keeps the Home component mounted while navigating. An unused salary calculation on every tab render was removed. This leaves business data and its Firebase architecture intact.

The Chrome 390x844 navigation test with **3,000 customers and 15,000 orders** measured 12 footer transitions at **22-585 ms** after the selected screen was painted. The equivalent Android 16 emulator test, repeated six times against the installed app, produced 72 warm-transition samples: **71/72 under 1,000 ms**, minimum 45 ms, median 316 ms, p90 609 ms, p95 749 ms, p99 1,211 ms, maximum 1,211 ms. Percentiles use nearest-rank. The single Orders outlier took 1,211 ms. Earlier emulator runs also had intermittent >1s samples. Therefore the requested **strict sub-second response on Android is not yet a reliable PASS**, even though typical navigation is substantially faster. These are warm-session measurements, not cold start or low-end physical-device guarantees.

## Android and permissions

Android configuration: `minSdk 24`, `targetSdk 36`, `compileSdk 36`, Android Gradle Plugin `8.13.0`, Gradle `8.14.3`, Java 21, Capacitor Android `8.4.1`; the Capacitor Filesystem plugin applies Kotlin `2.2.20`. The native build remains Firebase/cloud based. No backend, database schema or major dependency was migrated for this task.

The previous main manifest directly declared `READ_MEDIA_IMAGES`, `READ_MEDIA_VISUAL_USER_SELECTED`, and `READ_EXTERNAL_STORAGE`; no current plugin was found adding those. The main manifest no longer grants them and now explicitly removes those three plus `READ_MEDIA_VIDEO` and `MANAGE_EXTERNAL_STORAGE` if introduced transitively. The **merged debug manifest and packaged APK** have none of these five broad-read rights. The release-variant manifest cannot be audited until release signing is configured, so its final permission verdict remains pending.

| Permission in installed debug APK | Present | Origin / reason |
| --- | --- | --- |
| `READ_MEDIA_IMAGES` | No | System Photo Picker is used; removed from app manifest. |
| `READ_MEDIA_VIDEO` | No | Not declared; guarded against transitive addition. |
| `READ_MEDIA_VISUAL_USER_SELECTED` | No | Removed; system picker grants selected-media access. |
| `READ_EXTERNAL_STORAGE` | No | Removed; unnecessary for system picker. |
| `MANAGE_EXTERNAL_STORAGE` | No | Not declared; guarded against transitive addition. |
| `WRITE_EXTERNAL_STORAGE` | Yes, max SDK 28 | Legacy document export on Android 9 and older; unavailable above API 28. |
| `CAMERA` | Yes | Camera/image capture feature; capture flow not yet exercised. |
| `INTERNET` | Yes | Firebase/cloud networking. |
| `POST_NOTIFICATIONS` | Yes | Notifications; also declared by Local Notifications plugin. |
| `ACCESS_NETWORK_STATE` | Yes | Connectivity awareness. |
| `NEARBY_WIFI_DEVICES`, `ACCESS_WIFI_STATE` | Yes | Wi-Fi attendance/network detection. |
| `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` | Yes | Geolocation/attendance. |
| `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` | Yes | Existing messaging/audio flows; not exercised here. |
| `READ_CONTACTS` | Yes | Existing contact sharing; permission necessity should be checked in its own feature audit. |
| `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK` | Yes | Added by Capacitor Local Notifications for scheduled notifications. |
| `USE_BIOMETRIC`, `USE_FINGERPRINT` | Yes | Added by AndroidX Biometric / native biometric plugin. |
| `com.hdmanager.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | Yes | AndroidX generated app-private receiver permission. |

Capacitor native plugins reviewed: App, Filesystem, Geolocation, Local Notifications, Share, and native Biometric. The Android `WebChromeClient` file input launches the system picker without a broad media-library grant. On the Android 16 emulator, tapping Profile > Select image opened `PhotopickerGetContentActivity`; selecting a test PNG returned to an in-app preview. This verifies **picker, selection and preview only**. No Firebase upload or video upload was claimed; the current video action is disabled in the web UI.

## Production-bundle and security observations

`npm run build` and the Firebase production-bundle verification passed with `VITE_DATA_MODE=cloud`, `VITE_HD_APP_ID=hd-manager-production`, `VITE_FIREBASE_PROJECT_ID=hd-manager-c5839`. The bundle contains the intended Firebase vendor code, not a VPS production migration. A heuristic scan found no obvious private key, SMTP password, JWT secret, database password or configured localhost backend in the generated assets. Two `localhost` references are explanatory UI copy and two are Firebase Auth SDK redirect constants, not app API endpoints. Static scanning cannot prove the absence of every credential; the **signed AAB itself has not been inspected**.

Google Play's current target API requirement is met by `targetSdk 36`; see [Google Play target API policy](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en). Removing broad photo/video permissions follows the [Play media-permission policy](https://support.google.com/googleplay/android-developer/answer/16558241?hl=en) and the [Android Photo Picker guidance](https://developer.android.com/training/data-storage/shared/photo-picker). Acceptance still depends on Play's review of the actual uploaded signed AAB.

## Verification matrix

| Gate | Result | Evidence / limit |
| --- | --- | --- |
| Play Console maximum versionCode checked | PASS | One listed bundle, `26080101`; new code `26092801`. |
| Debug identity, SDK and merged permissions | PASS | `aapt2` on installed debug APK; five broad media rights absent. |
| Production web build and Firebase bundle verification | PASS | Vite build and production verifier. |
| Full automated regression, lint and typecheck | PASS | `npm run test:all`, `npm run lint`, `npm run typecheck`. |
| Chrome navigation at 3k customers / 15k orders | PASS | 12/12 samples <1s, maximum 585ms. |
| Android launch/dashboard/core footer navigation | PASS | Android 16 emulator, no fatal Java exception in observed log. |
| Android system photo selection and preview | PASS | `PhotopickerGetContentActivity`, selected image preview. |
| Android navigation consistently <1s | FAIL | 71/72 samples <1s; one Orders sample 1,211ms. |
| New signed release AAB and AAB-specific certificate/security audit | BLOCKED | Signing values absent; `:app:bundleRelease` fails at build.gradle line 15. |
| Upload eligibility and Closed Testing Alpha submission | BLOCKED | No new signed AAB; no Play upload attempted. |
| Login, registration, OTP, password recovery, logout/relogin | BLOCKED | Existing emulator session was preserved; no authorized test credentials supplied. |
| Firebase media upload, camera, video, notification delivery | BLOCKED | Would require dedicated test account/data and relevant enabled flow; picker preview alone does not establish upload. |
| Low-end physical Android device | BLOCKED | `adb devices` lists only `emulator-5554`. |

**Totals for the 13 gates above: 7 PASS, 1 FAIL, 5 BLOCKED.** The user-requested complete Android release acceptance is therefore **not achieved**.

## To unblock the release

1. Configure `HD_RELEASE_STORE_FILE`, `HD_RELEASE_STORE_PASSWORD`, `HD_RELEASE_KEY_ALIAS` and `HD_RELEASE_KEY_PASSWORD` on this machine outside version control using the existing HD Manager upload key. Do not send passwords or a private key in chat.
2. Rebuild and inspect the signed release AAB: package/version, final merged permissions, certificate fingerprint against Play Console, size/SHA-256, absence of debug flags and obvious secrets.
3. Install the matching signed release build on a physical low-end device and a modern device. Use a dedicated Firebase test account to exercise authentication, real upload, camera, notifications and logout/relogin. Re-run navigation tests until the 1-second target is stable, or agree on a percentile-based service level for device variability.
4. Only then upload the verified AAB to Google Play Console > Closed Testing > Alpha and check Play's validation/review result.
