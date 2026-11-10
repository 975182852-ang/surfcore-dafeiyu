param([string]$Dir = '', [string]$Ref = 'main', [switch]$Check)
$ErrorActionPreference = 'Stop'
$repo = '975182852-ang/surfcore-dafeiyu'
if ($Ref -notmatch '^[A-Za-z0-9][A-Za-z0-9._/-]*$' -or $Ref.Contains('..')) { throw 'Invalid branch or tag.' }
if (-not $Dir) { $Dir = if ($env:SURFCORE_DIR) { $env:SURFCORE_DIR } else { Join-Path $env:USERPROFILE 'surfcore-dafeiyu' } }
$installDir = [IO.Path]::GetFullPath($Dir)
if ($installDir.TrimEnd('\') -eq [IO.Path]::GetPathRoot($installDir).TrimEnd('\')) { throw 'Do not install to a filesystem root.' }
if ($Check) {
  Write-Host ('Node: ' + [bool](Get-Command node.exe -ErrorAction SilentlyContinue))
  Write-Host ('Git: ' + [bool](Get-Command git.exe -ErrorAction SilentlyContinue))
  Write-Host ('DSH home: ' + [bool](Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.dsh')))
  Write-Host ('Target: ' + $installDir)
  return
}
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22.13+ from https://nodejs.org/ first.' }
$git = Get-Command git.exe -ErrorAction SilentlyContinue
if (Test-Path -LiteralPath $installDir) {
  if (-not (Test-Path -LiteralPath (Join-Path $installDir 'scripts/install-local.ps1'))) { throw 'Target already exists and is not this project. Choose another -Dir.' }
  Write-Host 'Existing project kept. Run git pull --ff-only yourself if an update is wanted.'
} elseif ($git) {
  & $git.Source clone --depth 1 --branch $Ref "https://github.com/$repo.git" $installDir
  if ($LASTEXITCODE -ne 0) { throw 'git clone failed. Check the network or download the source ZIP from GitHub.' }
} else {
  $scratch = Join-Path $env:TEMP ('surfcore-download-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $scratch | Out-Null
  $zip = Join-Path $scratch 'source.zip'
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri "https://github.com/$repo/archive/$Ref.zip" -OutFile $zip -UseBasicParsing
  Expand-Archive -LiteralPath $zip -DestinationPath $scratch
  $folder = @(Get-ChildItem -LiteralPath $scratch -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'package.json') })
  if ($folder.Count -ne 1) { throw 'Archive layout is invalid. No existing directory was replaced.' }
  $sourceDir = [IO.Path]::GetFullPath($folder[0].FullName)
  $allowedRoot = [IO.Path]::GetFullPath($scratch).TrimEnd('\') + '\'
  if (-not $sourceDir.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive source escaped the temporary directory.' }
  if (Test-Path -LiteralPath $installDir) { throw 'Target appeared while downloading. It was not replaced.' }
  Move-Item -LiteralPath $sourceDir -Destination $installDir
}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $installDir 'scripts/install-local.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Project installer failed. Keep its output and backups.' }
