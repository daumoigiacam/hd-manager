# Android Release Signing

Google Play can only accept a release AAB/APK signed with a production key.

## 1. Create a keystore once

Use Android Studio or this command:

```powershell
keytool -genkeypair -v -keystore hd-manager-release.jks -alias hd-manager -keyalg RSA -keysize 2048 -validity 10000
```

Keep this file private. Do not commit it to source control.

## 2. Set signing variables before building

```powershell
$env:HD_RELEASE_STORE_FILE="D:\secure\hd-manager-release.jks"
$env:HD_RELEASE_STORE_PASSWORD="your-store-password"
$env:HD_RELEASE_KEY_ALIAS="hd-manager"
$env:HD_RELEASE_KEY_PASSWORD="your-key-password"
npm run android:aab:release
```

The output AAB is usually under:

`android\app\build\outputs\bundle\release\app-release.aab`

If these variables are not set, Gradle can still build for local checks, but the artifact is not ready for Google Play upload.
