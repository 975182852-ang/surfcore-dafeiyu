param([string]$DshHome = '')
$ErrorActionPreference = 'Stop'
if (-not $DshHome) { $DshHome = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' } }
$secret = Read-Host 'DeepSeek OFFICIAL API key for optional balance queries (never sent to the model)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  if (-not $value) { throw 'Key is empty.' }
  $folder = Join-Path $DshHome 'surfcore/state'
  New-Item -ItemType Directory -Force -Path $folder | Out-Null
  $file = Join-Path $folder 'deepseek-api-key'
  if (Test-Path -LiteralPath $file) { Copy-Item -LiteralPath $file -Destination ($file + '.bak-' + [DateTimeOffset]::Now.ToUnixTimeSeconds()) }
  [IO.File]::WriteAllText($file, $value.Trim(), (New-Object Text.UTF8Encoding($false)))
  Write-Host 'Saved privately in DSH user data. No API query was made. Never add this file to Git.'
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  $value = $null
  $secret.Dispose()
}
