$ErrorActionPreference='Stop'
Set-Location -LiteralPath 'D:\quản lý bán hàng 1'
$root='test-results/performance-upgrade-20261103'
$deadline=(Get-Date).AddHours(3)
do {
 if(Test-Path "$root/soak-final-rich/sdk-soak-status.json"){
  try{$state=Get-Content -Raw "$root/soak-final-rich/sdk-soak-status.json" | ConvertFrom-Json;if($state.endedAt){break}}catch{}
 }
 if((Get-Date) -gt $deadline){throw 'Current observation has not ended; leave the APK untouched'}
 Start-Sleep -Seconds 10
}while($true)
if($state.elapsedMs -lt 7200000){throw 'Incomplete observation; preserve failure and inspect before another APK'}
node scripts/upgrade-summarize-soak.mjs soak-final-rich *> "$root/soak-final-rich/analysis-console.json"
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
$env:HD_VERIFICATION_OUTPUT="$root/after-search-phase-diagnostic"
$env:HD_VERIFICATION_SEARCH_DIAGNOSTICS='true'
$env:VITE_ADAPTIVE_PERFORMANCE='true'
node scripts/verification-build-capacitor.mjs *> "$root/build-web-search-phase-diagnostic.log"
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:GRADLE_USER_HOME='D:\HD-DEV\gradle'
& 'D:\HD-DEV\gradle\wrapper\dists\gradle-8.14.3-bin\cv11ve7ro1n3o1j4so8xd9n66\gradle-8.14.3\bin\gradle.bat' -p "$root/after-search-phase-diagnostic/capacitor-project" :app:assembleDiagnostic --offline --no-daemon *> "$root/build-android-search-phase-diagnostic.log"
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
node scripts/upgrade-run-android-ab.mjs after-search-phase-diagnostic --search-only --first-search-only --fixture-rich --phase-diagnostic --run-label=cold-phase *> "$root/android-cold-search-phase.log"
exit $LASTEXITCODE
