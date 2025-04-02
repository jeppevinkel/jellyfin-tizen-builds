$versions = Get-Content -Path ./versions.json | ConvertFrom-Json

$versions.PSObject.Properties | ForEach-Object {
    Add-Content -Path $Env:GITHUB_OUTPUT -Value "$($_.Name)=$($_.Value)"
}