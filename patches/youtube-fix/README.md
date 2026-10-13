# YouTube Fix (error 153)

Fixes YouTube trailer playback on newer Tizen OS versions by replacing the YT iframe
API with a bridge through a local Tizen service, plus a trailer-fallback search
(TMDB → DuckDuckGo) for items without remote trailers.

Direct adaptation of the **V17** patch by [@PatrickSt1991](https://github.com/PatrickSt1991)
from [Apps2Samsung — FixYouTube.cs](https://github.com/Apps2Samsung/Apps2Samsung/blob/beta/Jellyfin2Samsung-CrossOS/Helpers/Jellyfin/Patches/FixYouTube.cs). Applied by `apply.mjs <jellyfin-tizen-dir> <port>` (port 8124
for the "secondary" package `JepZAARz4r`, 8123 otherwise).

> This patch runs a small background service on the TV (port 8123/8124) to bridge YouTube playback and look up missing trailers via TMDB.