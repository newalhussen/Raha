<#
  Development helper: rebuild the API and restart it in the background (logs to .dev/api.log).
  Usage: ./scripts/api-restart.ps1 [-NoBuild]
#>
param([switch]$NoBuild)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Api = Join-Path $Root 'apps\api'
$Log = Join-Path $Root '.dev\api.log'

Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -match 'dist[\\/]main\.js' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

if (-not $NoBuild) {
  Push-Location $Api
  try { & npx nest build; if ($LASTEXITCODE -ne 0) { throw 'API build failed' } } finally { Pop-Location }
}

Start-Process -FilePath 'node' -ArgumentList 'dist/main.js' -WorkingDirectory $Api -WindowStyle Hidden `
  -RedirectStandardOutput $Log -RedirectStandardError (Join-Path $Root '.dev\api.err.log')

for ($i = 0; $i -lt 90; $i++) {
  Start-Sleep -Milliseconds 500
  try { $r = Invoke-RestMethod -Uri 'http://localhost:4000/api/v1/health' -TimeoutSec 2; Write-Host "API up: $($r.status), PostGIS $($r.postgis)"; exit 0 } catch { }
}
throw 'API did not become healthy - see .dev/api.log'
