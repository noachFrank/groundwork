# Downloads a private copy of Node.js into this folder (.runtime\node), so the app
# needs nothing pre-installed and no admin permission. It uses only tools built into
# Windows, and skips everything if the right version is already here, so it never
# touches the internet on a normal start.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
$config = Get-Content -Raw (Join-Path $root 'groundwork.config.json') | ConvertFrom-Json
$version = $config.nodeVersion
$runtime = Join-Path $root '.runtime'
$nodeDir = Join-Path $runtime 'node'
$nodeExe = Join-Path $nodeDir 'node.exe'

function Test-NodeReady {
    if (-not (Test-Path $nodeExe)) { return $false }
    try { return ((& $nodeExe --version) -eq "v$version") } catch { return $false }
}

if (Test-NodeReady) { exit 0 }

$haveOlderNode = Test-Path $nodeExe

$arch = $env:PROCESSOR_ARCHITEW6432
if (-not $arch) { $arch = $env:PROCESSOR_ARCHITECTURE }
switch ($arch) {
    'AMD64' { $nodeArch = 'x64' }
    'ARM64' { $nodeArch = 'arm64' }
    default {
        Write-Host ''
        Write-Host "  Sorry, this computer's processor type ($arch) isn't supported." -ForegroundColor Red
        Write-Host '  Groundwork needs 64-bit Windows.'
        exit 1
    }
}

$folderName = "node-v$version-win-$nodeArch"
$zipName = "$folderName.zip"
$base = "https://nodejs.org/dist/v$version"
$zipPath = Join-Path $runtime $zipName
$sumsPath = Join-Path $runtime 'SHASUMS256.txt'

# curl.exe resumes broken downloads, which matters on poor Wi-Fi. The revocation flag
# matters too: on some networks Windows can't reach the certificate checker and curl
# would otherwise refuse to connect at all.
function Get-File($url, $out, [switch]$Quiet) {
    $curl = Join-Path $env:SystemRoot 'System32\curl.exe'
    if (Test-Path $curl) {
        $curlArgs = @('-L', '--fail', '--ssl-revoke-best-effort', '--retry', '5', '--retry-delay', '3', '--connect-timeout', '20', '-C', '-', '-o', $out, $url)
        if ($Quiet) { $curlArgs = @('-s') + $curlArgs } else { $curlArgs = @('--progress-bar') + $curlArgs }
        & $curl @curlArgs
        if ($LASTEXITCODE -eq 0) { return }
        # 33 means "can't resume": the file was already complete or the server won't resume.
        if (Test-Path $out) { Remove-Item $out -Force }
        & $curl @($curlArgs | Where-Object { $_ -ne '-C' -and $_ -ne '-' })
        if ($LASTEXITCODE -eq 0) { return }
    }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
}

try {
    New-Item -ItemType Directory -Force -Path $runtime | Out-Null

    Write-Host ''
    Write-Host '  ====================================================' -ForegroundColor Cyan
    Write-Host '   Welcome to Groundwork! First-time setup is starting.' -ForegroundColor Cyan
    Write-Host '  ====================================================' -ForegroundColor Cyan
    Write-Host ''
    Write-Host '  Step 1 of 3: downloading Node.js, which runs the app (about 35 MB)...'

    Get-File "$base/SHASUMS256.txt" $sumsPath -Quiet

    $expected = (Select-String -Path $sumsPath -SimpleMatch $zipName | Select-Object -First 1).Line.Split(' ')[0]
    $needDownload = $true
    if ((Test-Path $zipPath) -and ((Get-FileHash $zipPath -Algorithm SHA256).Hash -ieq $expected)) { $needDownload = $false }
    if ($needDownload) { Get-File "$base/$zipName" $zipPath }

    # Confirm the download is the genuine, complete file before using it.
    $actual = (Get-FileHash $zipPath -Algorithm SHA256).Hash
    if ($actual -ine $expected) {
        Remove-Item $zipPath -Force
        throw 'The downloaded file was incomplete or damaged.'
    }

    Write-Host '  Unpacking Node.js...'
    $staging = Join-Path $runtime 'staging'
    if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
    New-Item -ItemType Directory -Path $staging | Out-Null
    $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
    $unpacked = $false
    if (Test-Path $tar) {
        & $tar -xf $zipPath -C $staging
        $unpacked = ($LASTEXITCODE -eq 0)
    }
    if (-not $unpacked) { Expand-Archive -Path $zipPath -DestinationPath $staging -Force }

    if (Test-Path $nodeDir) { Remove-Item $nodeDir -Recurse -Force }
    Move-Item (Join-Path $staging $folderName) $nodeDir
    Remove-Item $staging -Recurse -Force
    Remove-Item $zipPath, $sumsPath -Force -ErrorAction SilentlyContinue

    if (-not (Test-NodeReady)) { throw 'Node.js did not unpack correctly.' }
    exit 0
}
catch {
    if ($haveOlderNode -and (Test-Path $nodeExe)) {
        Write-Host '  Could not download the newer Node.js. Continuing with the one already here.' -ForegroundColor Yellow
        exit 0
    }
    Write-Host ''
    Write-Host '  Could not download Node.js.' -ForegroundColor Red
    Write-Host "  ($($_.Exception.Message))"
    Write-Host ''
    Write-Host '  Check that you are connected to the internet, then double-click start.bat again.'
    Write-Host '  Your download will pick up where it stopped.'
    exit 1
}
