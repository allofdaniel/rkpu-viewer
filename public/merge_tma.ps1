# PowerShell script to merge corrected TMA section into atc_sectors.json

$originalFile = "c:\Users\danielkim\Desktop\gis\atc_sectors.json"
$tmaFile = "c:\Users\danielkim\Desktop\gis\tma_corrected.json"
$outputFile = "c:\Users\danielkim\Desktop\gis\atc_sectors_fixed.json"

# Read both files
$original = Get-Content $originalFile -Raw | ConvertFrom-Json
$tmaCorrect = Get-Content $tmaFile -Raw | ConvertFrom-Json

# Replace TMA section
$original.TMA = $tmaCorrect.TMA

# Save to new file
$original | ConvertTo-Json -Depth 10 | Set-Content $outputFile -Encoding UTF8

Write-Host "TMA section replaced successfully!"
Write-Host "Output saved to: $outputFile"
