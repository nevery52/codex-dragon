param([switch]$Stop)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$data = Join-Path $root 'data'
$supervisor = Join-Path $root 'desktop\supervisor.ps1'
if ($Stop) { & $supervisor -DataDir $data -Stop; return }
$electron = Join-Path $root 'desktop-runtime\windows\electron\dist\electron.exe'
if (!(Test-Path -LiteralPath $electron)) { throw 'Bundled Electron runtime is missing.' }
New-Item -ItemType Directory -Path $data -Force | Out-Null
$file = Join-Path $data 'follow-config.json'
$config = @{}
if (Test-Path -LiteralPath $file) { try { $prior = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json; foreach ($p in $prior.PSObject.Properties) { $config[$p.Name] = $p.Value } } catch {} }
$config.enabled = $true
$config.dragonFollow = $true
if ($config.mode -notin @('follow-codex','standalone')) { $config.mode = 'follow-codex' }
$config.pluginRoot = $root
$config.electronPath = $electron
$config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $file -Encoding utf8
$pause = Join-Path $data 'pause-until-host-exit.json'
if (Test-Path -LiteralPath $pause) { Remove-Item -LiteralPath $pause }
$launcher = & (Join-Path $PSScriptRoot 'build-launcher.ps1') -DataDir $data
Start-Process -FilePath $launcher -ArgumentList @('--script', ('"' + $supervisor + '"'), '--data', ('"' + $data + '"')) -WindowStyle Hidden | Out-Null
