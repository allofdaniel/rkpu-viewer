# Merge verified TMA into main JSON
$original = Get-Content 'atc_sectors.json' -Raw | ConvertFrom-Json
$tma = Get-Content 'tma_verified.json' -Raw | ConvertFrom-Json
$original.TMA = $tma.TMA
$original | ConvertTo-Json -Depth 10 | Set-Content 'atc_sectors.json' -Encoding UTF8
Write-Host "TMA section updated with verified coordinates!"
