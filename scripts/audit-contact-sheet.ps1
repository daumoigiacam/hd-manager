param([string[]]$Names, [string]$Output = 'contact')
Add-Type -AssemblyName System.Drawing
$root = Join-Path $PSScriptRoot '../test-results/firebase-device-readonly'
$canvas = [System.Drawing.Bitmap]::new(480 * $Names.Count, 1040)
$g = [System.Drawing.Graphics]::FromImage($canvas)
try {
  for ($i = 0; $i -lt $Names.Count; $i++) {
    $img = [System.Drawing.Image]::FromFile((Join-Path $root ($Names[$i] + '.png')))
    try { $g.DrawImage($img, $i * 480, 0, 480, 1040) } finally { $img.Dispose() }
  }
  $canvas.Save((Join-Path $root ($Output + '.png')), [System.Drawing.Imaging.ImageFormat]::Png)
} finally { $g.Dispose(); $canvas.Dispose() }
