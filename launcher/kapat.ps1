# Ziraat Sinav Simulatoru - sunucuyu durdur
$ErrorActionPreference = 'SilentlyContinue'
$port = 3210
$killed = $false

$conns = Get-NetTCPConnection -LocalPort $port -State Listen
foreach ($c in $conns) {
  $procId = $c.OwningProcess
  if ($procId -and $procId -gt 4) {
    # Once cocuklari, sonra kendisi
    Get-CimInstance Win32_Process -Filter "ParentProcessId=$procId" | ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force
    }
    Stop-Process -Id $procId -Force
    $killed = $true
  }
}

Add-Type -AssemblyName System.Windows.Forms
if ($killed) {
  [System.Windows.Forms.MessageBox]::Show('Simulator kapatildi.', 'Ziraat Sinav Simulatoru', 'OK', 'Information') | Out-Null
} else {
  [System.Windows.Forms.MessageBox]::Show('Zaten calismiyordu.', 'Ziraat Sinav Simulatoru', 'OK', 'Information') | Out-Null
}
