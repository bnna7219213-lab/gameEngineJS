param([string]$Path = "c:\Users\bnna7\workspace\gameEngineJS\build\t_range.pptx")
$app = New-Object -ComObject PowerPoint.Application
try {
    $pres = $app.Presentations.Open($Path, $true, $false, $false)
    Write-Output ("OK slides=" + $pres.Slides.Count)
    $pres.Close()
} catch {
    Write-Output ("BAD : " + $_.Exception.Message)
}
$app.Quit()
