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
    Write-Host "Updates:  $($newCommits)`n"

    $commit.latest = $response.sha

    if ($newCommits) {
        $updates += "New commit to $($commit.ref) https://github.com/$($commit.owner)/$($commit.repo)/commit/$($commit.latest)\n>$($response.commit.message.replace("`n", "\n"))"
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
    Write-Host "Updates:  $($newRelease)`n"

    $release.latest = $response.tag_name

    if ($newRelease) {
        $updates += "New $($release.repo) release"
    }

    $responsePre = (Invoke-RestMethod -Uri "https://api.github.com/repos/$($release.owner)/$($release.repo)/releases" -Headers $headers | Sort-Object { $_.created_at } | Where-Object { $_.prerelease -eq $true })[0]

    $newPreRelease = $release.latestPre -ne $responsePre.tag_name

    Write-Host "Checking: $($release.owner)/$($release.repo)@prerelease"
    Write-Host "Updates:  $($newPreRelease)`n"

    $release.latestPre = $responsePre.tag_name

    if ($newPreRelease) {
        $updates += "New $($release.repo) prerelease"
    }
}

if ($updates.Length -gt 0) {
    $causeOfUpdateLabel += $updates | Join-String -Separator "\n"
    Add-Content -Path $Env:GITHUB_OUTPUT -Value "triggerBuild=true"
    Add-Content -Path $Env:GITHUB_OUTPUT -Value "causeOfUpdateLabel=$causeOfUpdateLabel"
}
else {
    Add-Content -Path $Env:GITHUB_OUTPUT -Value "triggerBuild=false"
}

$versions | ConvertTo-Json -Depth 10 | Out-File -Force -FilePath .\versions.json

$matrixDefinition = Get-Content -Path ./matrix-definition.json | ConvertFrom-Json
$matrix = @{
    include = @()
}

$versions.commits | Where-Object { $_.matrix -eq $true } | ForEach-Object {
    $commit = $_

    $matrixTask = [pscustomobject]@{
        tag           = $commit.ref
        repository    = "jellyfin/jellyfin-web"
        artifact_name = "Jellyfin-$($commit.name)"
    }

    if ($commit.modern -eq $true) {
        $matrixTask | Add-Member -NotePropertyName "modern" -NotePropertyValue $true
    }

    if ($commit.legacy -eq $true) {
        $matrixTask | Add-Member -NotePropertyName "legacy" -NotePropertyValue $true
    }

    $matrix.include += $matrixTask
}

$versions.releases | Where-Object { $_.matrix -eq $true } | ForEach-Object {
    $release = $_

    if ($release.default -eq $true) {
        $matrixTask = [pscustomobject]@{
            tag           = $release.latest
            repository    = "jellyfin/jellyfin-web"
            artifact_name = "Jellyfin"
        }
        $matrixTaskPrerelease = [pscustomobject]@{
            tag           = $release.latestPre
            repository    = "jellyfin/jellyfin-web"
            artifact_name = "Jellyfin-prerelease"
        }
        Add-Content -Path $Env:GITHUB_OUTPUT -Value "webReleaseTagName=$($release.latest)"
        Add-Content -Path $Env:GITHUB_OUTPUT -Value "webPrereleaseTagName=$($release.latestPre)"
    } else {
        $matrixTask = [pscustomobject]@{
            tag           = $release.latest
            repository    = "jellyfin/jellyfin-web"
            artifact_name = "Jellyfin-$($release.latest)"
        }
        $matrixTaskPrerelease = [pscustomobject]@{
            tag           = $release.latestPre
            repository    = "jellyfin/jellyfin-web"
            artifact_name = "Jellyfin-$($release.latestPre)"
        }
    }

    $matrix.include += $matrixTask
    $matrix.include += $matrixTaskPrerelease
}

$matrixDefinition.variations | ForEach-Object {
    $variation = $_

    $versions.commits | Where-Object { $_.matrix -eq $true } | ForEach-Object {
        $commit = $_

        $matrixTask = [pscustomobject]@{
            tag           = $commit.ref
            repository    = "jellyfin/jellyfin-web"
            artifact_name = "Jellyfin-$($commit.name)-$($variation.name)"
        }

        if ($commit.modern -eq $true) {
            $matrixTask | Add-Member -NotePropertyName "modern" -NotePropertyValue $true
        }

        if ($commit.legacy -eq $true) {
            $matrixTask | Add-Member -NotePropertyName "legacy" -NotePropertyValue $true
        }

        $variation.extra_values | ForEach-Object {
            $matrixTask | Add-Member -NotePropertyName $_.key -NotePropertyValue $_.value
        }

        $matrix.include += $matrixTask
    }

    $versions.releases | Where-Object { $_.matrix -eq $true } | ForEach-Object {
        $release = $_

        if ($release.default -eq $true) {
            $matrixTask = [pscustomobject]@{
                tag           = $release.latest
                repository    = "jellyfin/jellyfin-web"
                artifact_name = "Jellyfin-$($variation.name)"
            }
            $matrixTaskPrerelease = [pscustomobject]@{
                tag           = $release.latestPre
                repository    = "jellyfin/jellyfin-web"
                artifact_name = "Jellyfin-prerelease-$($variation.name)"
            }
        } else {
            $matrixTask = [pscustomobject]@{
                tag           = $release.latest
                repository    = "jellyfin/jellyfin-web"
                artifact_name = "Jellyfin-$($release.latest)-$($variation.name)"
            }
            $matrixTaskPrerelease = [pscustomobject]@{
                tag           = $release.latestPre
                repository    = "jellyfin/jellyfin-web"
                artifact_name = "Jellyfin-$($release.latestPre)-$($variation.name)"
            }
        }

        $variation.extra_values | ForEach-Object {
            $matrixTask | Add-Member -NotePropertyName $_.key -NotePropertyValue $_.value
            $matrixTaskPrerelease | Add-Member -NotePropertyName $_.key -NotePropertyValue $_.value
        }

        $matrix.include += $matrixTask
        $matrix.include += $matrixTaskPrerelease
    }
}

$matrixJson = ($matrix | ConvertTo-Json -Depth 10)
Write-Host $matrixJson
$matrixJson | Out-File -Force -FilePath .\matrix.json
