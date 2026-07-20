param(
  [Parameter(Mandatory = $true)]
  [string]$HostName,

  [Parameter(Mandatory = $false)]
  [string]$SshUser = "root",

  [Parameter(Mandatory = $false)]
  [string]$Domain = "180.93.0.87"
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$packageDir = Join-Path $root "release\vps"
$zipPath = Join-Path $packageDir "hd-manager-dist-$timestamp.zip"

Set-Location $root

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  throw "Khong tim thay npm.cmd. Hay cai Node.js truoc khi build."
}

npm.cmd run build

New-Item -ItemType Directory -Force -Path $packageDir | Out-Null
if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $root "dist\*") -DestinationPath $zipPath -Force

$target = "$SshUser@$HostName"
scp $zipPath "${target}:/tmp/hd-manager-dist.zip"
scp (Join-Path $PSScriptRoot "setup-hd-manager.sh") "${target}:/tmp/setup-hd-manager.sh"
scp (Join-Path $PSScriptRoot "nginx\hd-manager.conf.template") "${target}:/tmp/hd-manager.conf.template"
ssh $target "chmod +x /tmp/setup-hd-manager.sh && sudo /tmp/setup-hd-manager.sh $Domain"

Write-Host "Da publish HD Manager len VPS: http://$Domain"
Write-Host "Neu co domain that, hay SSH vao VPS va chay: sudo certbot --nginx -d $Domain"
