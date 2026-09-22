$ErrorActionPreference = "Continue"
$app = New-Object -ComObject PowerPoint.Application
Get-ChildItem "c:\Users\bnna7\workspace\gameEngineJS\build\t_*.pptx" | ForEach-Object {
    try {
        $pres = $app.Presentations.Open($_.FullName, $true, $false, $false)
        Write-Output ("OK   " + $_.Name + " slides=" + $pres.Slides.Count)
        $pres.Close()
    } catch {
        Write-Output ("BAD  " + $_.Name + " : " + $_.Exception.Message)
    }
}
$app.Quit()
