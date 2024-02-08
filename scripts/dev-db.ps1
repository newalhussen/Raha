<#
  Portable Postgres 16 + PostGIS for local development (no Docker, no admin rights).

  The binaries live in <repo>/.dev/pgsql (git-ignored). If you have Docker, prefer
  `docker compose up -d db` instead - see README.md.

  Usage:
    ./scripts/dev-db.ps1 start     # init cluster on first run, then start it on port 5433
    ./scripts/dev-db.ps1 stop
    ./scripts/dev-db.ps1 status
    ./scripts/dev-db.ps1 psql      # open psql against the raha database

  Connection string:  postgres://raha:raha_dev@localhost:5433/raha
#>
param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'stop', 'status', 'psql', 'init')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Pg = Join-Path $Root '.dev\pgsql'
$Bin = Join-Path $Pg 'bin'
$Data = Join-Path $Root '.dev\pgdata'
$Log = Join-Path $Root '.dev\postgres.log'
$Port = 5433
$DbUser = 'raha'
$DbPass = 'raha_dev'
$DbName = 'raha'

if (-not (Test-Path (Join-Path $Bin 'pg_ctl.exe'))) {
  throw "Portable Postgres not found at $Pg. See README.md ('Database') to install it, or use Docker."
}

# PostGIS needs these to find its projection / GDAL data.
$env:GDAL_DATA = Join-Path $Pg 'gdal-data'
$env:PROJ_LIB = Join-Path $Pg 'share\contrib\postgis-3.6\proj'
$env:PGPASSWORD = $DbPass

function Initialize-Cluster {
  if (Test-Path (Join-Path $Data 'PG_VERSION')) { return }
  Write-Host 'Initialising cluster...'
  $pw = New-TemporaryFile
  Set-Content -Path $pw -Value $DbPass -NoNewline -Encoding ascii
  & (Join-Path $Bin 'initdb.exe') -D $Data -U $DbUser --auth=scram-sha-256 --pwfile=$pw -E UTF8 --locale=C | Out-Null
  Remove-Item $pw -Force
  if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
}

function Test-Running {
  & (Join-Path $Bin 'pg_ctl.exe') -D $Data status *> $null
  return ($LASTEXITCODE -eq 0)
}

switch ($Action) {
  'init' { Initialize-Cluster }
  'start' {
    Initialize-Cluster
    if (-not (Test-Running)) {
      # Start-Process detaches the server from this console; a plain call keeps the
      # inherited stdout pipe open and the script (and any caller) never returns.
      $p = Start-Process -FilePath (Join-Path $Bin 'pg_ctl.exe') -WindowStyle Hidden -PassThru -Wait `
        -ArgumentList @('-D', "`"$Data`"", '-l', "`"$Log`"", '-o', "`"-p $Port`"", '-w', 'start')
      if ($p.ExitCode -ne 0) { throw "pg_ctl start failed - see $Log" }
    }
    $exists = & (Join-Path $Bin 'psql.exe') -h localhost -p $Port -U $DbUser -d postgres -tAc "select 1 from pg_database where datname='$DbName'"
    if (-not $exists) {
      & (Join-Path $Bin 'createdb.exe') -h localhost -p $Port -U $DbUser $DbName
    }
    & (Join-Path $Bin 'psql.exe') -h localhost -p $Port -U $DbUser -d $DbName -qc 'CREATE EXTENSION IF NOT EXISTS postgis;'
    Write-Host "Postgres+PostGIS ready: postgres://${DbUser}:${DbPass}@localhost:${Port}/${DbName}"
  }
  'stop' {
    if (Test-Running) { & (Join-Path $Bin 'pg_ctl.exe') -D $Data -m fast -w stop | Out-Null }
    Write-Host 'stopped'
  }
  'status' {
    if (Test-Running) { Write-Host "running on port $Port" } else { Write-Host 'stopped' }
  }
  'psql' {
    & (Join-Path $Bin 'psql.exe') -h localhost -p $Port -U $DbUser -d $DbName
  }
}
