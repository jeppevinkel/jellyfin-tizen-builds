(function () {
    if (window.__YT_FIX_V17__) return;
    window.__YT_FIX_V17__ = true;

    var SERVICE_BASE = 'http://localhost:8123';
    var currentPlayerInstance = null;

    function sLog(msg, data) {
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', SERVICE_BASE + '/log', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            var cleanData = (data && typeof data === 'object') ? JSON.stringify(data) : (data || '');
            xhr.send(JSON.stringify({args: ['[V17]', msg, cleanData]}));
        } catch (e) {
        }
    }

    sLog('LOADED', {href: window.location.href});

    try {
        var appId = tizen.application.getCurrentApplication().appInfo.id;
        var pkgId = appId.split('.')[0];
        tizen.application.launch(pkgId + '.ytresolver', function () {
            sLog('SVC_LAUNCH_OK');
        }, function (e) {
            sLog('SVC_LAUNCH_ERR', e.message);
        });
    } catch (e) {
        sLog('SVC_LAUNCH_FAIL', e.message);
    }

    // ========================================================================
    // CUSTOM PLAYER CLASS - Mirrors Jellyfin's YoutubePlayer interface
    // ========================================================================
    function CustomPlayer(idOrEl, cfg) {
        var self = this;
        currentPlayerInstance = this;

        var videoId = '';
        if (typeof cfg === 'string') videoId = cfg;
        else if (cfg && typeof cfg === 'object') videoId = cfg.videoId || cfg.id || '';

        this._state = -1;
        this._currentTime = 0;
        this._duration = 0;
        this._volume = 100;
        this._ready = false;
        this._queue = [];
        this._destroyed = false;
        this._container = null;
        this._iframe = null;
        this._observer = null;
        this._messageHandler = null;

        var container = (typeof idOrEl === 'string') ? document.getElementById(idOrEl) : idOrEl;
        this._container = container;

        var iframe = document.createElement('iframe');
        this._iframe = iframe;

        // Message handler for iframe communication
        this._messageHandler = function (ev) {
            if (self._destroyed) return;
            var m = ev.data;
            if (!m || !m.__ytbridge) return;

            if (m.type === 'ready') {
                self._ready = true;
                sLog('IFRAME_READY');

                // HIDE SPINNER AGAIN (in case it reappeared)
                try {
                    if (window.Loading && window.Loading.hide) {
                        window.Loading.hide();
                    }
                    var spinners = document.querySelectorAll('.docspinner');
                    for (var i = 0; i < spinners.length; i++) {
                        spinners[i].classList.remove('mdlSpinnerActive');
                    }
                } catch (e) {
                }

                if (cfg.events && cfg.events.onReady) cfg.events.onReady({target: self});

                // Process queued commands
                while (self._queue.length) {
                    var q = self._queue.shift();
                    self._send(q.cmd, q.val);
                }

                // ENSURE AUTOPLAY: Jellyfin expects video to start playing immediately
                // The YouTube iframe should auto-play, but we'll trigger it again to be sure
                setTimeout(function () {
                    sLog('AUTOPLAY_TRIGGER');
                    self._send('play');
                }, 200);
            } else if (m.type === 'state') {
                self._state = m.data;
                if (cfg.events && cfg.events.onStateChange) {
                    cfg.events.onStateChange({target: self, data: m.data});
                }
            } else if (m.type === 'time') {
                self._currentTime = m.t / 1000;
                self._duration = m.d / 1000;
                self._state = m.s;
            } else if (m.type === 'error') {
                if (cfg.events && cfg.events.onError) {
                    cfg.events.onError(m.data);
                }
            }
        };

        window.addEventListener('message', this._messageHandler);

        function mount() {
            if (!container || self._destroyed) return;
            sLog('MOUNTING', {extractedId: videoId});

            if (!videoId) {
                sLog('ERR_MISSING_ID', 'Missing videoId');
                return;
            }

            // HIDE JELLYFIN LOADING SPINNER
            try {
                if (window.Loading && window.Loading.hide) {
                    window.Loading.hide();
                    sLog('SPINNER_HIDDEN_VIA_API');
                }
                // Fallback: directly remove spinner classes
                var spinners = document.querySelectorAll('.docspinner');
                for (var i = 0; i < spinners.length; i++) {
                    spinners[i].classList.remove('mdlSpinnerActive');
                }
            } catch (e) {
                sLog('SPINNER_HIDE_ERR', e.message);
            }

            // Use fixed positioning with max z-index to stay on top
            iframe.style.cssText = 'width:100vw; height:100vh; border:0; background:#000; position:fixed; top:0; left:0; z-index:2147483647;';
            iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen');
            iframe.src = SERVICE_BASE + '/player.html?videoId=' + encodeURIComponent(videoId);

            container.innerHTML = '';
            container.appendChild(iframe);

            // Watch for React wiping the container
            self._observer = new MutationObserver(function (mutations) {
                if (self._destroyed) return;
                if (container && !container.contains(iframe)) {
                    sLog('REACT_WIPE_RESTORE');
                    container.appendChild(iframe);
                }
            });
            self._observer.observe(container, {childList: true});
        }

        this._send = function (cmd, val) {
            if (this._destroyed) return;
            if (!this._ready) {
                this._queue.push({cmd: cmd, val: val});
                return;
            }
            if (this._iframe && this._iframe.contentWindow) {
                this._iframe.contentWindow.postMessage({__ytbridge_cmd: true, cmd: cmd, val: val}, '*');
            }
        };

        // API Methods matching YT.Player interface
        this.playVideo = function () {
            sLog('CMD_PLAY');
            this._send('play');
        };

        this.pauseVideo = function () {
            sLog('CMD_PAUSE');
            this._send('pause');
        };

        this.stopVideo = function () {
            sLog('CMD_STOP');
            this._send('stop');
        };

        this.seekTo = function (s, allowSeekAhead) {
            sLog('CMD_SEEK', s);
            this._send('seek', s * 1000);
        };

        this.setVolume = function (v) {
            this._volume = v;
            this._send('volume', v);
        };

        this.getVolume = function () {
            return this._volume;
        };

        this.getCurrentTime = function () {
            return this._currentTime;
        };

        this.getDuration = function () {
            return this._duration;
        };

        this.getPlayerState = function () {
            return this._state;
        };

        this.mute = function () {
            this._send('mute', true);
        };

        this.unMute = function () {
            this._send('mute', false);
        };

        this.isMuted = function () {
            return this._muted || false;
        };

        this.setSize = function (width, height) {
            // Size is already 100vw/100vh, no action needed
            sLog('SET_SIZE', {w: width, h: height});
        };

        // CRITICAL: Proper cleanup to prevent background playback
        this.destroy = function () {
            sLog('DESTROY_CALLED');

            if (this._destroyed) return;
            this._destroyed = true;

            // Stop playback first
            if (this._iframe && this._iframe.contentWindow) {
                try {
                    this._iframe.contentWindow.postMessage({__ytbridge_cmd: true, cmd: 'stop'}, '*');
                } catch (e) {
                    sLog('DESTROY_STOP_ERR', e.message);
                }
            }

            // Clean up event listeners
            if (this._messageHandler) {
                window.removeEventListener('message', this._messageHandler);
                this._messageHandler = null;
            }

            // Disconnect observer
            if (this._observer) {
                this._observer.disconnect();
                this._observer = null;
            }

            // Remove iframe from DOM
            if (this._iframe) {
                if (this._iframe.parentNode) {
                    this._iframe.parentNode.removeChild(this._iframe);
                }
                this._iframe = null;
            }

            // Clear container
            if (this._container) {
                this._container.innerHTML = '';
                this._container = null;
            }

            // Clear queue
            this._queue = [];

            if (currentPlayerInstance === this) {
                currentPlayerInstance = null;
            }

            sLog('DESTROYED');
        };

        mount();
    }

    // ========================================================================
    // YT NAMESPACE - Make it immutable to prevent overwriting
    // ========================================================================
    var customYT = {
        Player: CustomPlayer,
        PlayerState: {
            UNSTARTED: -1,
            ENDED: 0,
            PLAYING: 1,
            PAUSED: 2,
            BUFFERING: 3,
            CUED: 5
        },
        loaded: 1,
        __CUSTOM__: true
    };

    // Make YT property non-writable so it can't be overwritten
    Object.defineProperty(window, 'YT', {
        value: customYT,
        writable: false,
        configurable: false,
        enumerable: true
    });

    sLog('YT_PROTECTED');

    // Trigger ready callback if it exists
    if (window.onYouTubeIframeAPIReady) {
        setTimeout(function () {
            sLog('TRIGGER_READY_CALLBACK');
            window.onYouTubeIframeAPIReady();
        }, 100);
    }

    // ========================================================================
    // NAVIGATION CLEANUP - Hook into Jellyfin's router (FIXED)
    // ========================================================================

    var lastPath = window.location.pathname;

    // Listen for Jellyfin page changes
    document.addEventListener('viewshow', function () {
        var currentPath = window.location.pathname;
        sLog('VIEW_SHOW_EVENT', {lastPath: lastPath, currentPath: currentPath});

        // Only cleanup if we actually navigated away (path changed)
        if (currentPath !== lastPath) {
            lastPath = currentPath;

            // If we're navigating away from video page, ensure cleanup
            if (currentPath !== '/video' && currentPlayerInstance) {
                sLog('NAV_CLEANUP_TRIGGER');
                try {
                    currentPlayerInstance.destroy();
                } catch (e) {
                    sLog('NAV_CLEANUP_ERR', e.message);
                }
            }
        } else {
            sLog('VIEW_SHOW_SAME_PATH');
        }
    });

    // Also listen for back button via popstate
    window.addEventListener('popstate', function () {
        sLog('POPSTATE_EVENT');
        setTimeout(function () {
            var currentPath = window.location.pathname;
            if (currentPath !== '/video' && currentPlayerInstance) {
                sLog('POPSTATE_CLEANUP_TRIGGER');
                try {
                    currentPlayerInstance.destroy();
                } catch (e) {
                    sLog('POPSTATE_CLEANUP_ERR', e.message);
                }
            }
        }, 100);
    });

    // ========================================================================
    // TRAILER FALLBACK - Find trailers for non-English metadata languages
    // ========================================================================

    var _tfTimer = null;
    var _tfTmdbKey = '';
    var _tfKeyFetched = false;

    // Fetch TMDB API key from Jellyfin server (works for admin users, silent fail for others)
    function _tfFetchTmdbKey(api, cb) {
        if (_tfKeyFetched) return cb();
        _tfKeyFetched = true;
        var xhr = new XMLHttpRequest();
        xhr.open('GET', api.serverAddress() + '/Plugins', true);
        xhr.setRequestHeader('Authorization', 'MediaBrowser Token="' + api.accessToken() + '"');
        xhr.onload = function () {
            if (xhr.status !== 200) {
                sLog('TF_KEY_NO_PLUGINS');
                return cb();
            }
            try {
                var plugins = JSON.parse(xhr.responseText);
                var tmdbPlugin = null;
                for (var i = 0; i < plugins.length; i++) {
                    if (plugins[i].Name && plugins[i].Name.indexOf('TMDb') !== -1) {
                        tmdbPlugin = plugins[i];
                        break;
                    }
                }
                if (!tmdbPlugin) {
                    sLog('TF_KEY_NO_TMDB_PLUGIN');
                    return cb();
                }
                var xhr2 = new XMLHttpRequest();
                xhr2.open('GET', api.serverAddress() + '/Plugins/' + tmdbPlugin.Id + '/Configuration', true);
                xhr2.setRequestHeader('Authorization', 'MediaBrowser Token="' + api.accessToken() + '"');
                xhr2.onload = function () {
                    if (xhr2.status === 200) {
                        try {
                            var cfg = JSON.parse(xhr2.responseText);
                            if (cfg.TmdbApiKey) {
                                _tfTmdbKey = cfg.TmdbApiKey;
                                sLog('TF_KEY_CUSTOM', _tfTmdbKey.substring(0, 8) + '...');
                            } else {
                                sLog('TF_KEY_DEFAULT');
                            }
                        } catch (e) {
                        }
                    }
                    cb();
                };
                xhr2.onerror = function () {
                    cb();
                };
                xhr2.send();
            } catch (e) {
                cb();
            }
        };
        xhr.onerror = function () {
            cb();
        };
        xhr.send();
    }

    function _tfCheck() {
        if (_tfTimer) clearTimeout(_tfTimer);
        _tfTimer = setTimeout(_tfDoCheck, 2000);
    }

    function _tfDoCheck() {
        var hash = window.location.hash || window.location.href;
        if (hash.indexOf('details') === -1 && hash.indexOf('item') === -1) return;

        var existing = document.querySelector('.btnPlayTrailer, [data-action="playtrailer"]');
        if (existing) {
            sLog('TF_HAS_TRAILER');
            return;
        }

        var match = hash.match(/[?&]id=([^&]+)/);
        if (!match) return;
        var itemId = match[1];

        var api = window.ApiClient;
        if (!api) {
            sLog('TF_NO_API');
            return;
        }

        // Fetch TMDB key first (cached after first call), then proceed
        _tfFetchTmdbKey(api, function () {
            sLog('TF_CHECK', {itemId: itemId});

            var xhr = new XMLHttpRequest();
            var url = api.serverAddress() + '/Users/' + api.getCurrentUserId() + '/Items/' + itemId + '?Fields=ProviderIds,RemoteTrailers';
            xhr.open('GET', url, true);
            xhr.setRequestHeader('Authorization', 'MediaBrowser Token="' + api.accessToken() + '"');
            xhr.onload = function () {
                if (xhr.status !== 200) return;
                try {
                    var item = JSON.parse(xhr.responseText);
                    if (item.Type !== 'Movie' && item.Type !== 'Series') return;
                    if (item.RemoteTrailers && item.RemoteTrailers.length > 0) {
                        sLog('TF_HAS_REMOTE');
                        return;
                    }
                    if (item.LocalTrailerCount && item.LocalTrailerCount > 0) {
                        sLog('TF_HAS_LOCAL');
                        return;
                    }

                    var tmdbId = (item.ProviderIds && item.ProviderIds.Tmdb) || '';
                    var title = item.Name || '';
                    var year = item.ProductionYear || '';
                    var lang = (document.documentElement.lang || navigator.language || 'en').split('-')[0];

                    if (!tmdbId && !title) return;
                    sLog('TF_SEARCH', {tmdbId: tmdbId, title: title, lang: lang});

                    var svcUrl = SERVICE_BASE + '/trailer?tmdbId=' + encodeURIComponent(tmdbId) + '&title=' + encodeURIComponent(title) + '&year=' + encodeURIComponent(year) + '&lang=' + encodeURIComponent(lang);
                    if (_tfTmdbKey) svcUrl += '&tmdbKey=' + encodeURIComponent(_tfTmdbKey);

                    var xhr2 = new XMLHttpRequest();
                    xhr2.open('GET', svcUrl, true);
                    xhr2.onload = function () {
                        if (xhr2.status !== 200) return;
                        try {
                            var r = JSON.parse(xhr2.responseText);
                            if (r.videoKey) {
                                sLog('TF_FOUND', {key: r.videoKey, source: r.source});
                                _tfInjectBtn(r.videoKey);
                            } else {
                                sLog('TF_NOT_FOUND');
                            }
                        } catch (e) {
                            sLog('TF_ERR', e.message);
                        }
                    };
                    xhr2.send();
                } catch (e) {
                    sLog('TF_ITEM_ERR', e.message);
                }
            };
            xhr.send();
        });
    }

    function _tfInjectBtn(videoKey) {
        var container = document.querySelector('.mainDetailButtons, .detailButtons');
        if (!container || document.querySelector('.btnTrailerInjected')) return;

        var btn = document.createElement('button');
        btn.setAttribute('is', 'emby-button');
        btn.setAttribute('type', 'button');
        btn.className = 'button-flat btnPlayTrailer btnTrailerInjected detailButton emby-button';

        var icon = document.createElement('span');
        icon.className = 'material-icons detailButton-icon';
        icon.textContent = 'theaters';

        var wrap = document.createElement('span');
        wrap.className = 'detailButton-content';
        var txt = document.createElement('span');
        txt.className = 'button-text';
        txt.textContent = 'Trailer';
        wrap.appendChild(txt);

        btn.appendChild(icon);
        btn.appendChild(wrap);

        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            sLog('TF_PLAY', {key: videoKey});
            _tfPlayOverlay(videoKey);
        });

        var first = container.querySelector('button, .detailButton');
        if (first && first.nextSibling) container.insertBefore(btn, first.nextSibling);
        else container.appendChild(btn);

        sLog('TF_BTN_INJECTED');
    }

    function _tfPlayOverlay(videoKey) {
        var overlay = document.createElement('div');
        overlay.id = 'trailerOverlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;background:#000;';

        var iframe = document.createElement('iframe');
        iframe.style.cssText = 'width:100%;height:100%;border:0;';
        iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen');
        iframe.src = SERVICE_BASE + '/player.html?videoId=' + encodeURIComponent(videoKey);
        overlay.appendChild(iframe);
        document.body.appendChild(overlay);

        var msgH = function (ev) {
            if (!ev.data || !ev.data.__ytbridge) return;
            if (ev.data.type === 'state' && ev.data.data === 0) _tfClose();
        };
        window.addEventListener('message', msgH);

        var keyH = function (ev) {
            if (ev.keyCode === 10009 || ev.keyCode === 27 || ev.keyCode === 8) {
                ev.preventDefault();
                ev.stopPropagation();
                _tfClose();
            }
        };
        document.addEventListener('keydown', keyH, true);

        function _tfClose() {
            window.removeEventListener('message', msgH);
            document.removeEventListener('keydown', keyH, true);
            try {
                if (iframe.contentWindow) iframe.contentWindow.postMessage({__ytbridge_cmd: true, cmd: 'stop'}, '*');
            } catch (e) {
            }
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            sLog('TF_CLOSED');
        }
    }

    document.addEventListener('viewshow', _tfCheck);

    sLog('INIT_COMPLETE');
})();