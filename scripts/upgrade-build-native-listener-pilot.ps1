$ErrorActionPreference='Stop'
Set-Location -LiteralPath 'D:\quản lý bán hàng 1'
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:GRADLE_USER_HOME='D:\HD-DEV\gradle'
$env:HD_VERIFICATION_OUTPUT='test-results/performance-upgrade-20261103/after-native-listener-release'
$env:HD_VERIFICATION_NATIVE_LISTENER_RELEASE_PATCH='true'
$env:VITE_ADAPTIVE_PERFORMANCE='true'
$env:VITE_WORKER_TRANSFER_PROFILE='conservative-16k'
$env:VITE_WORKER_INITIAL_CONCURRENCY='2'
& 'C:\Program Files\nodejs\node.exe' scripts/verification-build-capacitor.mjs
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
& 'D:\HD-DEV\gradle\wrapper\dists\gradle-8.14.3-bin\cv11ve7ro1n3o1j4so8xd9n66\gradle-8.14.3\bin\gradle.bat' -p 'test-results/performance-upgrade-20261103/after-native-listener-release/capacitor-project' :app:assembleRelease :app:assembleDiagnostic --offline --no-daemon
exit $LASTEXITCODE
