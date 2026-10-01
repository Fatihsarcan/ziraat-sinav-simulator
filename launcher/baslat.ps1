# Ziraat Sinav Simulatoru - tek tikla baslatici
# VBS uzerinden gizli calisir; sunucu ayakta degilse kaldirir, sonra tarayiciyi acar.
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$port = 3210
$url  = "http://localhost:$port"
$log  = Join-Path $PSScriptRoot 'server.log'
$next = Join-Path $root 'node_modules\next\dist\bin\next'

function Test-Up {
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 3 | Out-Null
    return $true
  } catch {
    # Sunucu ayakta ama sayfa hata donuyorsa da "ayakta" sayilir.
    if ($_.Exception.Response) { return $true }
    return $false
  }
}

function Show-Error($msg) {
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($msg, 'Ziraat Sinav Simulatoru', 'OK', 'Error') | Out-Null
}

if (-not (Test-Up)) {
  # node var mi?
  $node = (Get-Command node -ErrorAction SilentlyContinue)
  if ($null -eq $node) {
    Show-Error "Node.js bulunamadi. https://nodejs.org adresinden kurup tekrar deneyin."
    exit 1
  }

  # Uretim derlemesi yoksa once derle (ilk calistirmada 1-2 dakika surebilir).
  if (-not (Test-Path (Join-Path $root '.next\BUILD_ID'))) {
    Start-Process -FilePath 'cmd.exe' `
      -ArgumentList '/c', "npm run build > ""$log"" 2>&1" `
      -WorkingDirectory $root -WindowStyle Hidden -Wait
    if (-not (Test-Path (Join-Path $root '.next\BUILD_ID'))) {
      Show-Error "Derleme basarisiz oldu. Ayrinti: $log"
      Start-Process notepad.exe $log
      exit 1
    }
  }

  Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c', "node ""$next"" start -p $port > ""$log"" 2>&1" `
    -WorkingDirectory $root -WindowStyle Hidden

  $deadline = (Get-Date).AddSeconds(90)
  while (-not (Test-Up) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 400 }
}

if (Test-Up) {
  Start-Process $url
} else {
  Show-Error "Sunucu 90 saniyede ayaga kalkmadi. Log dosyasi aciliyor."
  if (Test-Path $log) { Start-Process notepad.exe $log }
  exit 1
}
