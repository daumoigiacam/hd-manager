$ErrorActionPreference='Stop'
$taskRoot='D:\quản lý bán hàng 1'
Set-Location -LiteralPath $taskRoot
$evidence='test-results/performance-upgrade-20261103'
$deadline=(Get-Date).AddMinutes(25)
do {
 if(Test-Path "$evidence/android-after-native-probe-broad-trace.json"){
  try{$stage=Get-Content -Raw "$evidence/android-after-native-probe-broad-trace.json" | ConvertFrom-Json;if($stage.endedAt){break}}catch{}
 }
 if((Get-Date) -gt $deadline){throw 'Diagnostic search still active; do not alter device/service'}
 Start-Sleep -Seconds 2
}while($true)
$cleanSearch=Get-Content -Raw "$evidence/android-after-native-probe-broad.json" | ConvertFrom-Json
if($cleanSearch.status -eq 'FAILED' -or $stage.status -eq 'FAILED'){throw 'Broad search failed; inspect before replacing fixture workload'}
node scripts/upgrade-android-share-compat.mjs *> "$evidence/android-share-compat.log"
if($LASTEXITCODE -ne 0){throw 'Native share compatibility failed; inspect before final soak'}
$adb='D:\HD-DEV\android\sdk\platform-tools\adb.exe'
& $adb -s emulator-5554 shell am force-stop com.hdmanager.caplab
& $adb -s emulator-5554 shell am force-stop com.hdmanager.caplab.diag
$oldService=Get-Content -Raw test-results/phase2-verification-20261102/emulator-service-status.json | ConvertFrom-Json
if($oldService.project -ne 'demo-hdm-perf-verification' -or $oldService.appId -ne 'verification-fixture'){throw 'Unexpected service ownership'}
$ownedProcess=Get-CimInstance Win32_Process -Filter "ProcessId = $($oldService.pid)"
if(-not $ownedProcess -or $ownedProcess.CommandLine -notmatch '(run-service\.mjs|verification-emulator-service\.mjs)'){throw 'Service PID not verified as owned fixture; do not stop it'}
$ownedProcess | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine | ConvertTo-Json | Set-Content "$evidence/emulator-service-restart-ownership.json"
Stop-Process -Id $ownedProcess.ProcessId
$closeDeadline=(Get-Date).AddSeconds(45)
do {
 $open=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {$_.LocalPort -in @(8185,9199,5002)})
 if(-not $open.Count){break}
 if((Get-Date) -gt $closeDeadline){throw 'Fixture ports still owned; leave processes untouched and inspect'}
 Start-Sleep -Seconds 1
}while($true)
$env:HD_VERIFICATION_WORKLOAD='rich-linked-v1'
$env:HD_VERIFICATION_REPORT_ROOT="$evidence/rich-service"
$node22='D:\HD-DEV\npm\_npx\866cbdc2e815146d\node_modules\node\bin\node.exe'
$service=Start-Process -FilePath $node22 -ArgumentList 'scripts/verification-start-emulators.mjs' -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput "$taskRoot/$evidence/rich-service-stdout.log" -RedirectStandardError "$taskRoot/$evidence/rich-service-stderr.log"
@{at=(Get-Date).ToUniversalTime().ToString('o');pid=$service.Id;project='demo-hdm-perf-verification'} | ConvertTo-Json | Set-Content "$evidence/rich-service-launch.json"
$seedDeadline=(Get-Date).AddMinutes(4)
do {
 if(Test-Path "$evidence/rich-service/emulator-service-status.json"){
  $ready=Get-Content -Raw "$evidence/rich-service/emulator-service-status.json" | ConvertFrom-Json
  if($ready.status -eq 'READY' -and $ready.pid -ne $oldService.pid){break}
 }
 if($service.HasExited){throw 'Rich fixture Emulator launcher exited'}
 if((Get-Date) -gt $seedDeadline){throw 'Rich fixture did not seed; do not count waiting as soak time'}
 Start-Sleep -Seconds 2
}while($true)
node scripts/upgrade-web-role-smoke.mjs after-native-probe --rich *> "$evidence/web-roles-rich.log"
if($LASTEXITCODE -ne 0){throw 'Rich fixture role smoke failed; inspect before final soak'}
node scripts/upgrade-android-final-soak.mjs *> "$evidence/soak-final-rich.log"
exit $LASTEXITCODE
