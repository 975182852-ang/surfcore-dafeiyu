param(
  [switch]$Check,
  [string]$OwnerQQ = '',
  [string]$Groups = '',
  [string]$Profile = '',
  [string]$DshHome = '',
  [double]$DailyBudget = 3,
  [switch]$EnableDiary
)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js 22.13+ is required. Install it from https://nodejs.org/ and reopen the terminal.' }
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
$deploy = Join-Path $repoRoot 'scripts/deploy.mjs'
$deployArgs = @($deploy)
if ($Check) {
  $deployArgs += '--check'
  if ($DshHome) { $deployArgs += @('--dsh-home', $DshHome) }
  & $node.Source @deployArgs
  if ($LASTEXITCODE -ne 0) { throw 'Environment check failed.' }
  exit 0
}
if (-not $npm) { throw 'npm.cmd was not found. Repair the Node.js installation and reopen the terminal.' }
$groupsProvided = $PSBoundParameters.ContainsKey('Groups')
$existingConfig = Join-Path $repoRoot 'config.json'
  if (Test-Path -LiteralPath $existingConfig) {
    try {
      $existing = Get-Content -LiteralPath $existingConfig -Raw -Encoding UTF8 | ConvertFrom-Json
      if (-not $OwnerQQ) { $OwnerQQ = [string]$existing.ownerQQ }
      if (-not $groupsProvided) { $Groups = @($existing.allow.groups) -join ',' }
    } catch { throw 'Existing config.json is invalid. It was not overwritten.' }
  }
if (-not $OwnerQQ) { $OwnerQQ = Read-Host 'Owner QQ number (your own account)' }
if (-not $Groups) { $Groups = Read-Host 'Authorized group numbers, comma separated (empty = private chat only)' }
Push-Location $repoRoot
try {
  Write-Host 'Installing the exact locked dependencies...'
  & $npm.Source ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. Check your network/registry settings and retry; existing data was kept.' }
  $deployArgs += @('--owner-qq', $OwnerQQ, ('--groups=' + $Groups), '--daily-budget', [string]$DailyBudget)
  if ($Profile) { $deployArgs += @('--profile', $Profile) }
  if ($DshHome) { $deployArgs += @('--dsh-home', $DshHome) }
  if ($EnableDiary) { $deployArgs += '--enable-diary' }
  & $node.Source @deployArgs
  if ($LASTEXITCODE -ne 0) { throw 'Configuration/registration failed. Keep the backups and follow the error hint.' }
  Write-Host ''
  Write-Host 'Project installation finished. Restart DSH, configure the model and QQ gateway in SurfCore settings.'
  Write-Host 'SnowLuma/QQ login must be completed by you. This script does not install that runtime or log in for you.'
} finally { Pop-Location }
