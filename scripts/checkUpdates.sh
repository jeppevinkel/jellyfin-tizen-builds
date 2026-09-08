#!/usr/bin/env bash
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

set -euo pipefail

versions=$(cat ./versions.json)
matrix_definition=$(cat ./matrix-definition.json)

# Build matrix JSON
matrix_json=$(jq -n \
  --argjson versions       "$versions" \
  --argjson matrixDef      "$matrix_definition" '

  # Convert [{key,value}] -> {key: value}; tolerates null/missing
  def extra_vals_obj:
    if . == null then {}
    else reduce .[] as $kv ({}; . + {($kv.key): $kv.value})
    end;

  # Conditionally present flags shared by all commit entries
  def commit_flags:
    (if .modern == true then {modern: true} else {} end)
    + (if .legacy == true then {legacy: true} else {} end)
    + (if .node24  == true then {node24:  true} else {} end);

  # ── Base commit entries ───────────────────────────────────────────────────
  [ $versions.commits[] | select(.matrix == true) |
    { tag:           .ref,
      repository:    "jellyfin/jellyfin-web",
      artifact_name: ("Jellyfin-" + .name) }
    + commit_flags ]

  # ── Base release entries ──────────────────────────────────────────────────
  + [ $versions.releases[] | select(.matrix == true) |
      if .default == true then
        ( { tag: .latest,    repository: "jellyfin/jellyfin-web", artifact_name: "Jellyfin", node24: true },
          { tag: .latestPre, repository: "jellyfin/jellyfin-web", artifact_name: "Jellyfin-prerelease", node24: true } )
      else
        ( { tag: .latest,    repository: "jellyfin/jellyfin-web", artifact_name: ("Jellyfin-" + .latest), node24: true },
          { tag: .latestPre, repository: "jellyfin/jellyfin-web", artifact_name: ("Jellyfin-" + .latestPre), node24: true } )
      end ]

  # ── Variation × commit entries ────────────────────────────────────────────
  + [ $matrixDef.variations[] as $v |
      $versions.commits[] | select(.matrix == true) |
      { tag:           .ref,
        repository:    "jellyfin/jellyfin-web",
        artifact_name: ("Jellyfin-" + .name + "-" + $v.name) }
      + commit_flags
      + ($v.extra_values | extra_vals_obj) ]

  # ── Variation × release entries ───────────────────────────────────────────
  + [ $matrixDef.variations[] as $v |
      $versions.releases[] | select(.matrix == true) |
      if .default == true then
        ( { tag: .latest,    repository: "jellyfin/jellyfin-web", artifact_name: ("Jellyfin-" + $v.name) }
          + ($v.extra_values | extra_vals_obj),
          { tag: .latestPre, repository: "jellyfin/jellyfin-web", artifact_name: ("Jellyfin-prerelease-" + $v.name), node24: true }
          + ($v.extra_values | extra_vals_obj) )
      else
        ( { tag: .latest,    repository: "jellyfin/jellyfin-web", artifact_name: ("Jellyfin-" + .latest    + "-" + $v.name) }
          + ($v.extra_values | extra_vals_obj),
          { tag: .latestPre, repository: "jellyfin/jellyfin-web", artifact_name: ("Jellyfin-" + .latestPre + "-" + $v.name), node24: true }
          + ($v.extra_values | extra_vals_obj) )
      end ]

  | { include: . }
')

echo "$matrix_json"
echo "$matrix_json" > ./matrix.json