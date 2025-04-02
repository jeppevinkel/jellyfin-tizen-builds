$versions = Get-Content -Path ./versions.json | ConvertFrom-Json

$versions.commits | ForEach-Object {
    $commit = $_

    

    $headers = @{
        "Accept"               = "application/vnd.github+json"
        "Authorization"        = "Bearer $Env:GITHUB_TOKEN"
        "X-GitHub-Api-Version" = "2022-11-28"
    }
    $response = Invoke-WebRequest -Uri "https://api.github.com/repos/$($commit.owner)/$($commit.repo)/commits/$($commit.ref)" -Headers $headers

    Write-Host "Checking: $($commit.owner)/$($commit.repo)@$($commit.ref)"
    Write-Host "Stored sha: $($commit.latest)"
    Write-Host "Current sha: $($response.sha)"
}

# $versions.PSObject.Properties | ForEach-Object {
#     Add-Content -Path $Env:GITHUB_OUTPUT -Value "$($_.Name)=$($_.Value)"
# }