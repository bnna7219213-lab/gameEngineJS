param(
    [Parameter(Mandatory=$true)][string]$Pptx,
    [Parameter(Mandatory=$true)][string]$OutDir
)
$ErrorActionPreference = "Stop"
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
$pptxPath = (Resolve-Path $Pptx).Path
$outPath = (Resolve-Path $OutDir).Path
try {
    $app = New-Object -ComObject PowerPoint.Application
} catch {
    Write-Output "NO-PPT-COM"
    exit 2
}
$pres = $app.Presentations.Open($pptxPath, $true, $false, $false)  # ReadOnly, no window
$pres.Export($outPath, "PNG", 1920, 1080)
$pres.Close()
$app.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($app) | Out-Null
Write-Output "EXPORTED"
