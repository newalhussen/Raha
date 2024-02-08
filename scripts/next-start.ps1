<#
  Development helper: run a built Next.js app (web on 3000, ops on 3001) in the background.
  Usage: ./scripts/next-start.ps1 web|ops [-Build]
#>
param([Parameter(Mandatory)][ValidateSet('web', 'ops')][string]$App, [switch]$Build)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Dir = Join-Path $Root "apps\$App"
$Port = if ($App -eq 'web') { 3000 } else { 3001 }

Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -match "next[\\/]dist[\\/]bin[\\/]next.*start.*-p $Port" -or $_.CommandLine -match "apps[\\/]$App.*next" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

if ($Build) {
  Push-Location $Dir
  try { & npx next build; if ($LASTEXITCODE -ne 0) { throw "$App build failed" } } finally { Pop-Location }
}

Start-Process -FilePath 'node' -ArgumentList @('..\..\node_modules\next\dist\bin\next', 'start', '-p', $Port) -WorkingDirectory $Dir -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $Root ".dev\$App.log") -RedirectStandardError (Join-Path $Root ".dev\$App.err.log")

for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 500
  try { $r = Invoke-WebRequest -Uri "http://localhost:$Port/" -UseBasicParsing -TimeoutSec 3; Write-Host "$App up on :$Port ($($r.StatusCode))"; exit 0 } catch { }
}
throw "$App did not start - see .dev/$App.err.log"
