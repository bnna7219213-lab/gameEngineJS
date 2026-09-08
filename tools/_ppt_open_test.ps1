$ErrorActionPreference = "Stop"
$app = New-Object -ComObject PowerPoint.Application
try {
    $pres = $app.Presentations.Open("c:\Users\bnna7\workspace\gameEngineJS\build\qa.pptx", $true, $false, $false)
    Write-Output ("OPENED slides=" + $pres.Slides.Count)
    $pres.Close()
} catch {
    Write-Output ("FAIL1: " + $_.Exception.Message)
    try {
        $pres = $app.Presentations.Open("c:\Users\bnna7\workspace\gameEngineJS\build\qa.pptx")
        Write-Output ("OPENED-window slides=" + $pres.Slides.Count)
        $pres.Close()
    } catch {
        Write-Output ("FAIL2: " + $_.Exception.Message)
    }
}
$app.Quit()
