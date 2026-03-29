/**
 * routes/player.ts — Embedded music player pages served by the daemon
 *
 * Serves lightweight HTML player UIs that connect to the daemon's SSE
 * stream and provider APIs. Currently supports YouTube Music via the
 * IFrame Player API.
 *
 * @module routes/player
 */

import type { Application, Request, Response } from 'express';
import type { DaemonContext } from '../daemon-context.js';

/**
 * Register `/player/*` routes on the given Express app.
 *
 * These routes are registered BEFORE the `/v1` auth middleware so the
 * browser-facing player pages are accessible without a Bearer token.
 */
export function registerPlayerRoutes(app: Application, ctx: DaemonContext): void {

  /**
   * GET /player/youtube — YouTube Music mini player
   *
   * Self-contained HTML page with embedded YouTube IFrame Player.
   * Connects to daemon SSE for track changes and plays tracks
   * as the session engine queues them.
   */
  app.get('/player/youtube', (req: Request, res: Response) => {
    // Only embed the API token for loopback requests (same-host security model).
    // Non-loopback clients must enter the token via the UI prompt.
    const isLoopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip || '');
    const embeddedToken = isLoopback ? (ctx.apiToken || '') : '';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(getYouTubePlayerHTML(embeddedToken, ctx.enableSSE));
  });
}

// ---------------------------------------------------------------------------
// HTML generator
// ---------------------------------------------------------------------------

function getYouTubePlayerHTML(apiToken: string, sseEnabled: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Harmon — YouTube Music Player</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f0f;
      color: #e1e1e1;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .player-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      max-width: 480px;
      margin: 0 auto;
      width: 100%;
      padding: 16px;
    }

    .video-wrapper {
      position: relative;
      width: 100%;
      padding-bottom: 56.25%; /* 16:9 */
      background: #1a1a1a;
      border-radius: 12px;
      overflow: hidden;
    }

    .video-wrapper iframe {
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      border: none;
    }

    .track-info {
      padding: 16px 0;
      text-align: center;
    }

    .track-info h2 {
      font-size: 18px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .track-info p {
      font-size: 14px;
      color: #aaa;
    }

    .controls {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 24px;
      padding: 12px 0;
    }

    .controls button {
      background: none;
      border: none;
      color: #e1e1e1;
      font-size: 24px;
      cursor: pointer;
      padding: 8px;
      border-radius: 50%;
      transition: background 0.2s;
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .controls button:hover { background: rgba(255,255,255,0.1); }
    .controls button.play-btn { font-size: 32px; background: #fff; color: #0f0f0f; }
    .controls button.play-btn:hover { background: #ddd; }

    .status-bar {
      font-size: 12px;
      color: #666;
      text-align: center;
      padding: 8px;
    }

    .status-bar.connected { color: #4caf50; }
    .status-bar.disconnected { color: #f44336; }

    .queue-hint {
      font-size: 13px;
      color: #888;
      text-align: center;
      padding: 8px;
    }

    .auth-prompt {
      display: flex;
      gap: 8px;
      justify-content: center;
      align-items: center;
      padding: 8px 0;
    }

    .auth-prompt input {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 6px;
      color: #e1e1e1;
      padding: 6px 10px;
      font-size: 13px;
      width: 200px;
    }

    .auth-prompt button {
      background: #333;
      border: none;
      border-radius: 6px;
      color: #e1e1e1;
      padding: 6px 12px;
      font-size: 13px;
      cursor: pointer;
    }

    .auth-prompt button:hover { background: #444; }
  </style>
</head>
<body>
  <div class="player-container">
    <div class="video-wrapper">
      <div id="yt-player"></div>
    </div>

    <div class="track-info">
      <h2 id="track-title">No track playing</h2>
      <p id="track-artist"></p>
    </div>

    <div class="controls">
      <button id="btn-prev" title="Previous">&#x23EE;</button>
      <button id="btn-play" class="play-btn" title="Play/Pause">&#x25B6;</button>
      <button id="btn-next" title="Next">&#x23ED;</button>
    </div>

    <p class="queue-hint" id="queue-hint">Start a session or play a track to begin</p>
    <div class="auth-prompt" id="auth-prompt" style="display:none;">
      <input id="token-input" type="password" placeholder="API token" />
      <button id="token-save">Save</button>
    </div>
    <div class="status-bar" id="status">Connecting...</div>
  </div>

  <script>
    var EMBEDDED_TOKEN = ${JSON.stringify(apiToken)};
    var SSE_ENABLED = ${sseEnabled};
    var DAEMON_BASE = window.location.origin;

    // Use embedded token if available (loopback), otherwise fall back to sessionStorage
    var API_TOKEN = EMBEDDED_TOKEN || sessionStorage.getItem('harmon_api_token') || '';

    // Show auth prompt when no token is available
    if (!API_TOKEN) {
      document.getElementById('auth-prompt').style.display = 'flex';
    }
    document.getElementById('token-save').addEventListener('click', function() {
      var val = document.getElementById('token-input').value.trim();
      if (val) {
        sessionStorage.setItem('harmon_api_token', val);
        API_TOKEN = val;
        document.getElementById('auth-prompt').style.display = 'none';
        // Re-poll now-playing with the new token
        fetchDaemon('/v1/youtube/now-playing')
          .then(function(r) { return r.json(); })
          .then(function(track) {
            if (track && track.id) {
              document.getElementById('track-title').textContent = track.name || 'Unknown';
              document.getElementById('track-artist').textContent = track.artist || '';
              var videoId = extractVideoId(track.uri) || extractVideoId(track.id);
              if (videoId) playVideo(videoId);
            }
          })
          .catch(function() {});
      }
    });

    var player = null;
    var isPlaying = false;
    var currentVideoId = null;

    // YouTube IFrame API loader
    var tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = function() {
      player = new YT.Player('yt-player', {
        height: '100%',
        width: '100%',
        playerVars: {
          autoplay: 0,
          controls: 1,
          modestbranding: 1,
          rel: 0
        },
        events: {
          onReady: function() { updateStatus('Player ready'); },
          onStateChange: function(event) {
            isPlaying = event.data === YT.PlayerState.PLAYING;
            document.getElementById('btn-play').innerHTML = isPlaying ? '&#x23F8;' : '&#x25B6;';
            if (event.data === YT.PlayerState.ENDED) {
              fetchDaemon('/v1/youtube/next', { method: 'POST' }).catch(function() {});
            }
          }
        }
      });
    };

    function updateStatus(text, cls) {
      var el = document.getElementById('status');
      el.textContent = text;
      el.className = 'status-bar' + (cls ? ' ' + cls : '');
    }

    function playVideo(videoId) {
      if (!player || !player.loadVideoById) return;
      currentVideoId = videoId;
      player.loadVideoById(videoId);
      isPlaying = true;
      document.getElementById('btn-play').innerHTML = '&#x23F8;';
    }

    function extractVideoId(uri) {
      if (!uri) return null;
      try {
        var url = new URL(uri);
        var v = url.searchParams.get('v');
        if (v) return v;
        if (url.hostname === 'youtu.be') return url.pathname.slice(1);
      } catch(e) {}
      if (/^[a-zA-Z0-9_-]{11}$/.test(uri)) return uri;
      return null;
    }

    // SSE connection
    if (SSE_ENABLED) {
      var evtSource = new EventSource(DAEMON_BASE + '/v1/events');

      evtSource.onmessage = function(event) {
        try {
          var data = JSON.parse(event.data);
          handleDaemonEvent(data);
        } catch(e) {}
      };
      evtSource.onopen = function() {
        updateStatus('Connected to daemon', 'connected');
      };
      evtSource.onerror = function() {
        updateStatus('Disconnected \\u2014 retrying...', 'disconnected');
      };
    }

    function handleDaemonEvent(event) {
      if (event.type === 'track.started' && event.payload && event.payload.track) {
        var track = event.payload.track;
        document.getElementById('track-title').textContent = track.name || 'Unknown';
        document.getElementById('track-artist').textContent = track.artist || '';
        document.getElementById('queue-hint').textContent = '';

        var videoId = extractVideoId(track.uri) || extractVideoId(track.id);
        if (videoId && videoId !== currentVideoId) {
          playVideo(videoId);
        }
      }
      if (event.type === 'session.started') {
        document.getElementById('queue-hint').textContent = 'Session active \\u2014 tracks will play automatically';
      }
      if (event.type === 'session.stopped') {
        document.getElementById('queue-hint').textContent = 'Session ended';
      }
    }

    // Controls
    document.getElementById('btn-play').addEventListener('click', function() {
      if (!player) return;
      if (isPlaying) { player.pauseVideo(); }
      else { player.playVideo(); }
    });
    document.getElementById('btn-prev').addEventListener('click', function() {
      fetchDaemon('/v1/youtube/prev', { method: 'POST' }).catch(function() {});
    });
    document.getElementById('btn-next').addEventListener('click', function() {
      fetchDaemon('/v1/youtube/next', { method: 'POST' }).catch(function() {});
    });

    function fetchDaemon(path, options) {
      options = options || {};
      var headers = { 'Content-Type': 'application/json' };
      if (API_TOKEN) headers['Authorization'] = 'Bearer ' + API_TOKEN;
      options.headers = headers;
      return fetch(DAEMON_BASE + path, options);
    }

    // Poll now-playing on load
    fetchDaemon('/v1/youtube/now-playing')
      .then(function(r) { return r.json(); })
      .then(function(track) {
        if (track && track.id) {
          document.getElementById('track-title').textContent = track.name || 'Unknown';
          document.getElementById('track-artist').textContent = track.artist || '';
          var videoId = extractVideoId(track.uri) || extractVideoId(track.id);
          if (videoId) playVideo(videoId);
        }
      })
      .catch(function() {});
  </script>
</body>
</html>`;
}
