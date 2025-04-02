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

    $commit.latest = $response.sha

    if ($newCommits) {
        $updates += "New commit to $($commit.ref) https://github.com/$($commit.owner)/$($commit.repo)/commit/$($commit.latest)"
    }
}

$versions.releases | ForEach-Object {
    $release = $_

    $headers = @{
        "Accept"               = "application/vnd.github+json"
        "Authorization"        = "Bearer $Env:GITHUB_TOKEN"
        "X-GitHub-Api-Version" = "2022-11-28"
    }
    $response = Invoke-RestMethod -Uri "https://api.github.com/repos/$($release.owner)/$($release.repo)/releases/latest" -Headers $headers
    $newRelease = $release.latest -ne $response.tag_name

    Write-Host "Checking: $($release.owner)/$($release.repo)@latest"
    Write-Host "Updates:  $($release.latest -eq $response.tag_name)\n"

    $release.latest = $response.tag_name

    if ($newRelease) {
        $updates += "New $($release.repo) release\n"
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

$matrixDefinition = Get-Content -Path ./matrix.json | ConvertFrom-Json
$matrix = @{
    include = @()
}

$matrixDefinition.variations | ForEach-Object {
    $variation = $_

    $versions.commits | ForEach-Object {
        $commit = $_

        $matrixTask = @{
            tag = $commit.ref
            repository = "jellyfin/jellyfin-web"
            artifact_name = "Jellyfin-$($commit.ref)-$($variation.name)"
        }

        Write-Host $matrixTask | ConvertTo-Json -Depth 10

        $variation.extra_values | ForEach-Object {
            $matrixTask | Add-Member -NotePropertyName $_.key -NotePropertyValue $_.value
        }

        Write-Host $matrixTask | ConvertTo-Json -Depth 10

        $matrix.include += $matrixTask
    }
}

Write-Host $matrix | ConvertTo-Json -Depth 10