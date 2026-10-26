<#
  Deploy the demo to Zoho Catalyst AppSail (custom runtime, Docker image).

    pnpm deploy:catalyst              # build the image and deploy it
    pnpm deploy:catalyst -SkipBuild   # deploy the last built image again

  One-time setup first (see DEPLOY.md, "Option C"):
    npm i -g zcatalyst-cli
    catalyst login            # opens a browser; choose your Zoho account (India DC: zoho.in)
    catalyst init             # in this folder: link or create the Catalyst project

  The app listens on the port in X_ZOHO_CATALYST_LISTEN_PORT (set by AppSail), falling back to 3000,
  and the service is deployed with --port 3000, so both agree.
#>
param(
  [string]$Name = 'mobile360-hydro',
  [string]$Image = 'hydro-one-demo:latest',
  [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Fail($msg) { Write-Host "`n$msg`n" -ForegroundColor Red; exit 1 }

if (-not (Get-Command catalyst -ErrorAction SilentlyContinue)) {
  Fail "The Catalyst CLI isn't installed. Run: npm i -g zcatalyst-cli, then catalyst login and catalyst init."
}
if (-not (Test-Path (Join-Path $root '.catalystrc')) -and -not (Test-Path (Join-Path $root 'catalyst.json'))) {
  Fail "This folder isn't linked to a Catalyst project yet. Run: catalyst login, then catalyst init (pick or create the project)."
}
docker version --format '{{.Server.Version}}' *> $null
if ($LASTEXITCODE -ne 0) { Fail "Docker isn't running. Start Docker Desktop and try again." }

$out = Join-Path $root '.catalyst-build'
New-Item -ItemType Directory -Force $out | Out-Null
$tar = Join-Path $out 'hydro-one-demo.tar'

if (-not $SkipBuild) {
  Write-Host "Building $Image for linux/amd64 (the platform AppSail runs)..." -ForegroundColor Cyan
  docker build --platform linux/amd64 -t $Image .
  if ($LASTEXITCODE -ne 0) { Fail 'docker build failed.' }
}

Write-Host "Saving the image to $tar ..." -ForegroundColor Cyan
if (Test-Path $tar) { Remove-Item $tar -Force }
docker save $Image -o $tar
if ($LASTEXITCODE -ne 0) { Fail 'docker save failed.' }
$size = [math]::Round((Get-Item $tar).Length / 1MB)
Write-Host "Image archive: $size MB"

Write-Host "Deploying AppSail service '$Name' ..." -ForegroundColor Cyan
catalyst deploy appsail --name $Name --source "docker-archive://.catalyst-build/hydro-one-demo.tar" --port 3000
if ($LASTEXITCODE -ne 0) { Fail 'catalyst deploy failed (see the output above).' }

Write-Host @"

Deployed to the development environment.
Next, in the Catalyst console (AppSail > $Name):
  1. Configuration: memory 1024 MB, disk 1024 MB; environment variable JWT_SECRET (any long random value).
  2. Open the development URL and check /, /staff and /app.
  3. When it looks right: Deploy to production.
"@ -ForegroundColor Green
