$versions = Get-Content -Path ./versions.json | ConvertFrom-Json

$updates = @()
$causeOfUpdateLabel = "### Cause of the update\n"

$versions.commits | ForEach-Object {
    $commit = $_

    $headers = @{
        "Accept"               = "application/vnd.github+json"
        "Authorization"        = "Bearer $Env:GITHUB_TOKEN"
        "X-GitHub-Api-Version" = "2022-11-28"
    }
    $response = Invoke-RestMethod -Uri "https://api.github.com/repos/$($commit.owner)/$($commit.repo)/commits/$($commit.ref)" -Headers $headers
    $newCommits = $commit.latest -ne $response.sha

    Write-Host "Checking: $($commit.owner)/$($commit.repo)@$($commit.ref)"
    Write-Host "Updates:  $($commit.latest -eq $response.sha)\n"

    if ($newCommits) {
        $updates += "New commit to $($commit.ref) https://github.com/$($commit.owner)/$($commit.repo)/commit/$($response.sha)"
    }
}

if ($updates.Length -gt 0) {
    $causeOfUpdateLabel += $updates | Join-String -Separator '\n'
    Add-Content -Path $Env:GITHUB_OUTPUT -Value "triggerBuild=true"
    Add-Content -Path $Env:GITHUB_OUTPUT -Value "causeOfUpdateLabel=$causeOfUpdateLabel"
}
else {
    Add-Content -Path $Env:GITHUB_OUTPUT -Value "triggerBuild=false"
}

# $versions.PSObject.Properties | ForEach-Object {
#     Add-Content -Path $Env:GITHUB_OUTPUT -Value "$($_.Name)=$($_.Value)"
# }