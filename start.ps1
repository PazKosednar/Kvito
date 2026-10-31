<#
.SYNOPSIS
  Starts Kvita for local development (API on :4180, web client on :5180).

.DESCRIPTION
  1. Checks Node.js and server/.env
  2. Installs dependencies when node_modules is missing
  3. Checks that PostgreSQL is reachable
  4. Applies pending migrations (prisma migrate deploy – never resets data)
  5. Runs server + client together (Ctrl+C stops both)

.PARAMETER Seed
  Also runs the (idempotent) development seed.

.EXAMPLE
  .\start.ps1
  .\start.ps1 -Seed
#>
param(
  [switch]$Seed
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Write-Step([string]$Text) { Write-Host "→ $Text" -ForegroundColor Cyan }
function Fail([string]$Text) { Write-Host "✗ $Text" -ForegroundColor Red; exit 1 }

# 1. Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js ni nameščen (potrebna je različica 22 ali novejša).' }
$nodeMajor = [int]((node -v).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) { Fail "Potreben je Node.js 22+, nameščen je $(node -v)." }

# 2. server/.env
if (-not (Test-Path 'server/.env')) {
  Fail 'Manjka server/.env. Kopiraj server/.env.example v server/.env in izpolni vrednosti (glej README).'
}

# 3. Dependencies
if (-not (Test-Path 'node_modules')) {
  Write-Step 'Nameščam odvisnosti (npm install) …'
  npm install
  if ($LASTEXITCODE -ne 0) { Fail 'npm install ni uspel.' }
}

# 4. Database reachable?
$dbLine = Select-String -Path 'server/.env' -Pattern '^\s*DATABASE_URL\s*=' | Select-Object -First 1
if ($dbLine -and $dbLine.Line -match '@([^:/]+):(\d+)/') {
  $dbHost = $Matches[1]; $dbPort = [int]$Matches[2]
  $tcp = New-Object System.Net.Sockets.TcpClient
  try {
    $ok = $tcp.ConnectAsync($dbHost, $dbPort).Wait(2000)
  } catch { $ok = $false } finally { $tcp.Dispose() }
  if (-not $ok) {
    Fail "PostgreSQL ni dosegljiv na ${dbHost}:${dbPort}. Zaženi storitev: Start-Service postgresql-x64-17 (glej README)."
  }
}

# 5. Migrations (non-destructive)
Write-Step 'Uveljavljam migracije baze …'
npm run db:deploy -w server
if ($LASTEXITCODE -ne 0) { Fail 'Migracije niso uspele.' }

if ($Seed) {
  Write-Step 'Polnim razvojne podatke (seed) …'
  npm run db:seed -w server
  if ($LASTEXITCODE -ne 0) { Fail 'Seed ni uspel.' }
}

# 6. Run
Write-Host ''
Write-Host 'Kvita teče:' -ForegroundColor Green
Write-Host '  Aplikacija: http://localhost:5180'
Write-Host '  API:        http://localhost:4180/api/health'
Write-Host '  Prijavna koda se izpiše v tej konzoli (vrstica [server]). Ctrl+C ustavi oboje.'
Write-Host ''
npm run dev
