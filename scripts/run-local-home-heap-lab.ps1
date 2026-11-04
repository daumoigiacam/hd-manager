param([ValidateSet('small','large')][string]$Mode,[Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
$workspacePath=(Get-Location).Path
$outputPath=[IO.Path]::GetFullPath((Join-Path $workspacePath $Output))
$resultsRoot=[IO.Path]::GetFullPath((Join-Path $workspacePath 'test-results'))+[IO.Path]::DirectorySeparatorChar
if (-not $outputPath.StartsWith($resultsRoot,[StringComparison]::OrdinalIgnoreCase)) { throw 'Local lab output must stay in workspace test-results.' }
if (Test-Path -LiteralPath (Join-Path $outputPath 'result.json')) { throw 'Refusing to overwrite an existing experiment.' }
$null=New-Item -ItemType Directory -Path $outputPath -Force
$nodePath='D:\HD-DEV\npm\_npx\866cbdc2e815146d\node_modules\node\bin\node.exe'
$env:HD_LOCAL_HOME_CPU_OUTPUT=$Output.Replace('\','/')
$env:HD_LOCAL_HOME_ADMISSION_FILE=Join-Path $outputPath 'admission.json'
$env:HD_LOCAL_HOME_ASYNC_TRACE='true'
$env:HD_LOCAL_HOME_EMBEDDED_CPU='false'
$env:HD_LOCAL_HOME_DISABLE_CPU='true'
$runtimeArgs=if ($Mode -eq 'small') { @('--max-old-space-size=409','--max-semi-space-size=1') } else { @('--max-old-space-size=364','--max-semi-space-size=16') }
$runtimeArgs+= 'scripts/profile-local-home-native-stream.mjs'
$benchProcess=Start-Process -FilePath $nodePath -ArgumentList $runtimeArgs -WorkingDirectory $workspacePath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $outputPath 'stdout.log') -RedirectStandardError (Join-Path $outputPath 'stderr.log')
try {
 $benchProcess.ProcessorAffinity=[IntPtr]1
 $readyDeadline=[DateTime]::UtcNow.AddSeconds(15)
 while (-not (Test-Path -LiteralPath $env:HD_LOCAL_HOME_ADMISSION_FILE)) {
  if ($benchProcess.HasExited -or [DateTime]::UtcNow -gt $readyDeadline) { throw 'Local lab did not reach admission.' }
  Start-Sleep -Milliseconds 50
 }
 $admission=Get-Content -LiteralPath $env:HD_LOCAL_HOME_ADMISSION_FILE -Raw | ConvertFrom-Json
 if ($admission.clientPid -ne $benchProcess.Id) { throw 'Local client PID mismatch.' }
 $serverInfo=Get-CimInstance Win32_Process -Filter "ProcessId = $($admission.serverPid)"
 if ($serverInfo.ParentProcessId -ne $benchProcess.Id) { throw 'Refusing affinity change for an unrelated process.' }
 $serverProcess=Get-Process -Id $admission.serverPid
 if ($serverProcess.Path -ne $nodePath) { throw 'Local synthetic server runtime mismatch.' }
 $serverProcess.ProcessorAffinity=[IntPtr]2
 $cpuScope=@{clientMask=$benchProcess.ProcessorAffinity.ToInt64();serverMask=$serverProcess.ProcessorAffinity.ToInt64();clientHeap=$Mode;scope='Synthetic localhost only. Fixed CPU affinity is not Cloud cgroup quota, network or Android acceptance.'}
 $cpuScope | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $outputPath 'cpu-affinity.json')
 Set-Content -LiteralPath ($env:HD_LOCAL_HOME_ADMISSION_FILE+'.go') -Value 'admitted'
 if (-not $benchProcess.WaitForExit(20000)) { throw 'Local lab exceeded its bounded execution window.' }
 $benchProcess.Refresh()
 if ($benchProcess.ExitCode -ne 0) { throw 'Local lab failed; inspect its retained stderr.' }
 $r=Get-Content -LiteralPath (Join-Path $outputPath 'result.json') -Raw | ConvertFrom-Json
 @{mode=$Mode;status=$r.status;wallMs=$r.wallMs;cpuMs=$r.processCpuMs;gcEvents=$r.gc.events;gcDurationMs=$r.gc.totalDurationMs;heapLimitMiB=$r.heapSizeLimitMiB} | ConvertTo-Json -Compress
} finally {
 if (-not $benchProcess.HasExited) { Stop-Process -Id $benchProcess.Id }
}
