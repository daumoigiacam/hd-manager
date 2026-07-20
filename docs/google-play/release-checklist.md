# Google Play Release Checklist - HD Manager

Cập nhật: 13/07/2026

## Source/app status

- Package name: `com.hdmanager.app`
- minSdk: 24
- compileSdk: 36
- targetSdk: 36
- Version code: `2026071302`
- Version name: `2026.07.13.2`
- Backup disabled: `allowBackup=false`, `dataExtractionRules` excludes backup/transfer.
- Cleartext traffic disabled: `usesCleartextTraffic=false`.
- Tablet/large screen support declared.

## Required Play Console setup

These items must be completed inside Google Play Console and cannot be fully completed from source code alone:

- App Signing by Google Play: enroll app signing, upload AAB signed with upload key.
- Play Integrity API: enable in Play Console and verify integrity tokens on trusted server before relying on decisions.
- Data Safety Form: fill using `docs/google-play/data-safety-form.md`.
- App content declarations: privacy policy URL, ads declaration, target audience, content rating.
- Sensitive permission declarations: location, camera, contacts, notifications, microphone if retained.
- Android Vitals: monitor crash/ANR after internal testing and production rollout.

## Crash reporting and ANR

- Play Android Vitals will collect crash/ANR data after publishing through Google Play.
- Firebase Crashlytics requires a valid `android/app/google-services.json`, Gradle Crashlytics plugin, and Firebase project setup. Do not add Crashlytics secrets to source.

## Play Integrity

Recommended production flow:

1. Android app requests an integrity token using Google Play services.
2. App sends token to Firebase Function/server.
3. Server verifies token with Google Play Integrity API.
4. Server allows sensitive actions only when verdict is valid.

This cannot be safely completed without Play Console/API credentials and backend verification policy.

## Pre-release validation commands

Run before uploading:

```powershell
npm run build
npm run android:sync
cd android
.\gradlew.bat lintVitalRelease
.\gradlew.bat assembleRelease
.\gradlew.bat bundleRelease
```

Expected artifacts:

- `android/app/build/outputs/apk/release/app-release.apk`
- `android/app/build/outputs/bundle/release/app-release.aab`

## Official references

- Android target SDK requirements: https://developer.android.com/google/play/requirements/target-sdk
- Google Play Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Background location policy: https://support.google.com/googleplay/android-developer/answer/9799150
