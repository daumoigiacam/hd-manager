param(
  [switch]$KeepPortable
)

$ErrorActionPreference = 'Stop'

$workspace = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $workspace 'release'
$finalInstaller = Join-Path $releaseDir 'HD-Manager-Setup.exe'
$legacyInstaller = Join-Path $releaseDir 'HD Manager Setup 0.0.0.exe'
$portableInstaller = Join-Path $releaseDir 'HD Manager 0.0.0.exe'

if (-not (Test-Path -LiteralPath $releaseDir)) {
  throw "Release folder was not created: $releaseDir"
}

$workspacePath = (Resolve-Path -LiteralPath $workspace).Path
$releasePath = (Resolve-Path -LiteralPath $releaseDir).Path
if (-not $releasePath.StartsWith($workspacePath, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to clean outside workspace: $releasePath"
}

if (-not (Test-Path -LiteralPath $finalInstaller) -and (Test-Path -LiteralPath $legacyInstaller)) {
  Copy-Item -LiteralPath $legacyInstaller -Destination $finalInstaller -Force
}

if (-not (Test-Path -LiteralPath $finalInstaller)) {
  throw "Installer was not found after build: $finalInstaller"
}

Get-ChildItem -LiteralPath $releaseDir -Force |
  Where-Object {
    $_.FullName -ne $finalInstaller -and
    (-not $KeepPortable -or $_.FullName -ne $portableInstaller)
  } |
  ForEach-Object {
    $item = $_
    try {
      Remove-Item -LiteralPath $item.FullName -Recurse -Force -ErrorAction Stop
    } catch {
      $longPath = if ($item.FullName.StartsWith('\\')) {
        '\\?\UNC\' + $item.FullName.Substring(2)
      } else {
        '\\?\' + $item.FullName
      }

      if ($item.PSIsContainer) {
        [System.IO.Directory]::Delete($longPath, $true)
      } else {
        [System.IO.File]::Delete($longPath)
      }
    }
  }

Write-Host "Ready: $finalInstaller"
