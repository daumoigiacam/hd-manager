$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:GRADLE_USER_HOME='D:\HD-DEV\gradle'
$env:VITE_ADAPTIVE_PERFORMANCE='true'
$env:VITE_WORKER_TRANSFER_PROFILE='conservative-16k'
$env:VITE_WORKER_INITIAL_CONCURRENCY='2'
$env:HD_VERIFICATION_NATIVE_LISTENER_RELEASE_PATCH='false'
$env:VITE_HOME_WORKER_CRITICAL_READS='false'
$env:VITE_NATIVE_AUTH_JSON_TRANSPORT='false'
$env:VITE_WORKER_TRANSFER_WINDOW='1'
foreach($variant in @('v6-two')){
 $env:VITE_WORKER_INITIAL_CONCURRENCY=if($variant -eq 'v5-four'){'4'}else{'2'}
 $env:HD_VERIFICATION_OUTPUT='test-results/performance-upgrade-20261103/after-home-priority-'+$variant
 $env:VITE_HOME_PRIORITY_DATA='true'
 & 'C:\Program Files\nodejs\node.exe' scripts/verification-build-capacitor.mjs
 if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
 & 'D:\HD-DEV\gradle\wrapper\dists\gradle-8.14.3-bin\cv11ve7ro1n3o1j4so8xd9n66\gradle-8.14.3\bin\gradle.bat' -p ($env:HD_VERIFICATION_OUTPUT+'/capacitor-project') :app:assembleRelease :app:assembleDiagnostic --offline --no-daemon
 if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
}


