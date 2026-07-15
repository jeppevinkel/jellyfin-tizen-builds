var http = require('http');
var https = require('https');
var urlMod = require('url');

var PORT = 8123;
var LISTEN_HOST = '0.0.0.0';
var LOGS = [];
var TMDB_KEY = '4219e299c89411838049ab0dab19ebd5'; // fallback key from Jellyfin TmdbUtils.cs, used when runtime key extraction fails

function log(msg, data) {
    var line = new Date().toISOString() + ' ' + msg + ' ' + (data ? JSON.stringify(data) : '');
    LOGS.push(line);
    if (LOGS.length > 2000) LOGS.shift();
    console.log(line);
}

function write(res, code, contentType, body, additionalHeaders) {
    var headers = {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Private-Network': 'true',
        'Cache-Control': 'no-store'
    };
    if (additionalHeaders) Object.assign(headers, additionalHeaders);
    res.writeHead(code, headers);
    res.end(body);
}

// ========================================================================
// TRAILER FALLBACK HELPERS - TMDB + DuckDuckGo Lite
// ========================================================================

function httpsGet(reqUrl, cb) {
    var done = false;

    function finish(err, status, body) {
        if (done) return;
        done = true;
        cb(err, status, body);
    }

    var parsed = urlMod.parse(reqUrl);
    var opts = {
        hostname: parsed.hostname,
        path: parsed.path,
        port: 443,
        method: 'GET',
        rejectUnauthorized: false,
        headers: {'User-Agent': 'JellyfinSamsungTV/1.0'}
    };
    var req = https.request(opts, function (resp) {
        var body = '';
        resp.on('data', function (c) {
            body += c;
        });
        resp.on('end', function () {
            finish(null, resp.statusCode, body);
        });
    });
    req.on('error', function (e) {
        finish(e);
    });
    req.setTimeout(8000, function () {
        req.abort();
    });
    req.end();
}

function fetchTmdbTrailers(tmdbId, lang, apiKey, cb) {
    if (!tmdbId) return cb(null, {langKey: null, enKey: null});
    var key = apiKey || TMDB_KEY;
    var u = 'https://api.themoviedb.org/3/movie/' + tmdbId +
        '?api_key=' + key +
        '&language=' + lang +
        '&append_to_response=videos' +
        '&include_video_language=' + lang + ',en,null';
    log('TMDB_FETCH ' + u);
    httpsGet(u, function (err, status, body) {
        if (err || status !== 200) {
            log('TMDB_ERR ' + (err ? err.message : status));
            return cb(null, {langKey: null, enKey: null});
        }
        try {
            var data = JSON.parse(body);
            var vids = (data.videos && data.videos.results) || [];
            var trailers = [];
            for (var i = 0; i < vids.length; i++) {
                if (vids[i].site === 'YouTube' && (vids[i].type === 'Trailer' || vids[i].type === 'Teaser')) trailers.push(vids[i]);
            }
            var langPick = null, enPick = null;
            for (var j = 0; j < trailers.length; j++) {
                if (!langPick && trailers[j].iso_639_1 === lang) langPick = trailers[j];
                if (!enPick && trailers[j].iso_639_1 === 'en') enPick = trailers[j];
            }
            log('TMDB_RESULT langKey=' + (langPick ? langPick.key : 'null') + ' enKey=' + (enPick ? enPick.key : 'null'));
            cb(null, {
                langKey: langPick ? langPick.key : null,
                enKey: enPick ? enPick.key : null
            });
        } catch (e) {
            log('TMDB_PARSE_ERR ' + e.message);
            cb(null, {langKey: null, enKey: null});
        }
    });
}

function searchDdg(title, year, lang, cb) {
    var langMap = __LANG_MAP__;
    var langName = langMap[lang] || '';
    var langKeywords = langName.toLowerCase().split(' ');
    var q = title + (year ? ' ' + year : '') + ' Trailer ' + langName + ' site:youtube.com';
    var encoded = encodeURIComponent(q).replace(/%20/g, '+');
    var u = 'https://lite.duckduckgo.com/lite/?q=' + encoded;
    log('DDG_FETCH q=' + q);
    httpsGet(u, function (err, status, body) {
        if (err || status !== 200) {
            log('DDG_ERR ' + (err ? err.message : status));
            return cb(null, {langKey: null, fallbackKey: null});
        }
        var decoded = body.replace(/%2F/gi, '/').replace(/%3F/gi, '?').replace(/%3D/gi, '=').replace(/%26/gi, '&');

        // Extract results with titles: find <a> tags followed by youtube URLs
        var linkRe = /<a[^>]+href="([^"]*youtube\.com\/watch\?v=([a-zA-Z0-9_\-]{11})[^"]*)"[^>]*>([^<]*)<\/a>/gi;
        var m, seen = {}, results = [];
        while ((m = linkRe.exec(decoded)) !== null) {
            if (!seen[m[2]]) {
                seen[m[2]] = true;
                results.push({key: m[2], title: m[3]});
            }
        }

        // Also catch URL-encoded links
        var encRe = /href="[^"]*youtube\.com%2Fwatch%3Fv%3D([a-zA-Z0-9_\-]{11})[^"]*"[^>]*>([^<]*)<\/a>/gi;
        while ((m = encRe.exec(body)) !== null) {
            if (!seen[m[1]]) {
                seen[m[1]] = true;
                results.push({key: m[1], title: m[2]});
            }
        }

        if (!results.length) {
            log('DDG_NO_RESULTS');
            return cb(null, {langKey: null, fallbackKey: null});
        }

        // Split: language-matched vs non-matched results
        var langMatch = null;
        var fallback = null;
        for (var i = 0; i < results.length; i++) {
            var t = results[i].title.toLowerCase();
            var isLangMatch = false;
            for (var j = 0; j < langKeywords.length; j++) {
                if (langKeywords[j] && t.indexOf(langKeywords[j]) !== -1) {
                    isLangMatch = true;
                    break;
                }
            }
            if (isLangMatch && !langMatch) langMatch = results[i];
            if (!isLangMatch && !fallback) fallback = results[i];
            if (langMatch && fallback) break;
        }

        log('DDG_FOUND langKey=' + (langMatch ? langMatch.key : 'null') + ' fallbackKey=' + (fallback ? fallback.key : 'null') + ' total=' + results.length);
        cb(null, {langKey: langMatch ? langMatch.key : null, fallbackKey: fallback ? fallback.key : null});
    });
}

// ========================================================================

var PLAYER_HTML = `
<!doctype html>
<html>
<head>
<style>html,body{margin:0;padding:0;background:#000;width:100%;height:100%;overflow:hidden;}</style>
</head>
<body>
<div id="player" style="width:100%;height:100%;"></div>
<script>
    var VID = new URLSearchParams(window.location.search).get('videoId');
    function post(type, data, t, d, s) {
        window.parent.postMessage({ __ytbridge: true, type: type, data: data, t: t||0, d: d||0, s: s||-1 }, '*');
    }
    var tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);

    var player;
    var autoplayAttempted = false;

    window.onYouTubeIframeAPIReady = function() {
        player = new YT.Player('player', {
            height: '100%', width: '100%', videoId: VID,
            playerVars: {
                'autoplay': 1,
                'controls': 0,
                'enablejsapi': 1,
                'origin': 'http://localhost:8123',
                'playsinline': 1,
                'mute': 0
            },
            events: {
                'onReady': function(ev) {
                    post('ready');

                    // Ensure autoplay starts
                    if (!autoplayAttempted) {
                        autoplayAttempted = true;
                        setTimeout(function() {
                            if (player && player.playVideo) {
                                player.playVideo();
                            }
                        }, 100);
                    }

                    setInterval(function(){
                        if(player && player.getCurrentTime)
                            post('time', null, player.getCurrentTime()*1000, player.getDuration()*1000, player.getPlayerState());
                    }, 500);
                },
                'onStateChange': function(ev) { post('state', ev.data); },
                'onError': function(ev) { post('error', ev.data); }
            }
        });
    };

    window.addEventListener('message', function(ev) {
        if (!ev.data || !ev.data.__ytbridge_cmd || !player) return;
        var m = ev.data;
        if (m.cmd === 'play') player.playVideo();
        else if (m.cmd === 'pause') player.pauseVideo();
        else if (m.cmd === 'stop') player.stopVideo();
        else if (m.cmd === 'seek') player.seekTo(m.val / 1000, true);
        else if (m.cmd === 'volume') player.setVolume(m.val);
        else if (m.cmd === 'mute') {
            if (m.val) player.mute();
            else player.unMute();
        }
    });
</script>
</body>
</html>
`;

function handler(req, res) {
    var u = urlMod.parse(req.url, true);
    if (req.method === 'OPTIONS') return write(res, 204, 'text/plain', '');

    if (u.pathname === '/log') {
        var body = '';
        req.on('data', function (c) {
            body += c;
        });
        req.on('end', function () {
            try {
                var j = JSON.parse(body);
                log(j.args ? j.args.join(' ') : 'LOG');
            } catch (e) {
            }
            write(res, 200, 'application/json', '{}');
        });
        return;
    }

    if (u.pathname === '/debug/logs') return write(res, 200, 'application/json', JSON.stringify({logs: LOGS}));

    if (u.pathname === '/player.html') {
        return write(res, 200, 'text/html', PLAYER_HTML, {'Referrer-Policy': 'no-referrer-when-downgrade'});
    }

    // ====================================================================
    // TRAILER FALLBACK ENDPOINT
    // 1 TMDB call fetches both lang + en, then: lang(TMDB) -> lang(DDG) -> en(CACHED) -> en(CACHED)
    // ====================================================================
    if (u.pathname === '/trailer') {
        var tId = u.query.tmdbId || '';
        var tTitle = u.query.title || '';
        var tYear = u.query.year || '';
        var tLang = u.query.lang || 'en';
        var tKey = u.query.tmdbKey || '';
        log('TRAILER_REQ tmdbId=' + tId + ' title=' + tTitle + ' lang=' + tLang + ' customKey=' + (tKey ? 'yes' : 'no'));

        // Single TMDB call: fetches both user-language and English trailers
        fetchTmdbTrailers(tId, tLang, tKey, function (e1, tmdb) {

            // Step 1: TMDB user-language trailer (cached)
            if (tmdb.langKey) return write(res, 200, 'application/json', JSON.stringify({
                videoKey: tmdb.langKey,
                source: 'tmdb_' + tLang
            }));

            // Single DDG call: returns both language-matched and fallback keys
            searchDdg(tTitle, tYear, tLang, function (e2, ddg) {

                // Step 2: DDG language-matched trailer (cached)
                if (ddg.langKey) return write(res, 200, 'application/json', JSON.stringify({
                    videoKey: ddg.langKey,
                    source: 'ddg_' + tLang
                }));

                if (tLang !== 'en') {
                    // Step 3: TMDB English fallback (cached from step 1, no extra call)
                    if (tmdb.enKey) return write(res, 200, 'application/json', JSON.stringify({
                        videoKey: tmdb.enKey,
                        source: 'tmdb_en_fallback'
                    }));

                    // Step 4: DDG non-language result as English fallback (cached from step 2, no extra call)
                    if (ddg.fallbackKey) return write(res, 200, 'application/json', JSON.stringify({
                        videoKey: ddg.fallbackKey,
                        source: 'ddg_en_fallback'
                    }));
                }

                write(res, 200, 'application/json', JSON.stringify({videoKey: null, source: null}));
            });
        });
        return;
    }

    return write(res, 404, 'text/plain', 'Not Found');
}

var server = http.createServer(handler);
server.listen(PORT, LISTEN_HOST, function () {
    log('SERVER LISTENING ' + LISTEN_HOST + ':' + PORT);
});