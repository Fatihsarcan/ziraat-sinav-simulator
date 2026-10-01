$launcher = $PSScriptRoot
$desktop  = [Environment]::GetFolderPath('Desktop')
$icon     = Join-Path $launcher 'ziraat.ico'
$sh = New-Object -ComObject WScript.Shell

function New-Sc($name, $vbs, $desc, $iconIndex) {
  $lnk = $sh.CreateShortcut((Join-Path $desktop "$name.lnk"))
  $lnk.TargetPath       = "$env:SystemRoot\System32\wscript.exe"
  $lnk.Arguments        = """$(Join-Path $launcher $vbs)"""
  $lnk.WorkingDirectory = $launcher
  $lnk.IconLocation     = "$icon,0"
  $lnk.Description      = $desc
  $lnk.Save()
  Write-Output "-> $name.lnk"
}

New-Sc 'Ziraat Sinav Simulatoru' 'baslat.vbs' 'Sinav simulatorunu baslat ve tarayicida ac' 0
New-Sc 'Ziraat Simulatoru - Kapat' 'kapat.vbs' 'Arka planda calisan simulator sunucusunu durdur' 0
