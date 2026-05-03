# Build the Chrome extension package for upload to the Chrome Web Store.
#
# Usage (PowerShell):
#   cd extensions
#   .\build-chrome.ps1
#
# Output: extensions/qualmly-chrome-extension.zip
#
# Excludes README.md (developer-only doc) and any .DS_Store/Thumbs.db.

$ErrorActionPreference = "Stop"
$src = Join-Path $PSScriptRoot "chrome"
$dst = Join-Path $PSScriptRoot "qualmly-chrome-extension.zip"

if (-not (Test-Path $src)) {
    throw "Extension source not found at $src"
}

# Stage to a temp dir so we control exactly what's zipped
$temp = Join-Path $env:TEMP "qualmly-chrome-pack"
if (Test-Path $temp) { Remove-Item -Recurse -Force $temp }
New-Item -ItemType Directory -Path $temp | Out-Null

Copy-Item (Join-Path $src "manifest.json") -Destination $temp
Copy-Item (Join-Path $src "popup")         -Destination $temp -Recurse
Copy-Item (Join-Path $src "background")    -Destination $temp -Recurse
Copy-Item (Join-Path $src "icons")         -Destination $temp -Recurse

if (Test-Path $dst) { Remove-Item $dst }
Compress-Archive -Path (Join-Path $temp "*") -DestinationPath $dst -Force

Write-Output ("Built: " + $dst)
Write-Output ("Size:  " + ((Get-Item $dst).Length) + " bytes")

# Verify zip contents
$z = [System.IO.Compression.ZipFile]::OpenRead($dst)
$z.Entries | ForEach-Object { Write-Output ("  " + $_.FullName + "  (" + $_.Length + " bytes)") }
$z.Dispose()

Remove-Item -Recurse -Force $temp
