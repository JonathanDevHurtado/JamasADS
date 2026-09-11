// UtubeOrigin - watchdog contra anuncios
// Se inyecta en cada pagina completa y vigila el DOM para eliminar anuncios
// y saltar automaticamente los anuncios de video dentro del reproductor.
(function () {
  'use strict';
  if (window.__uoWatchdog) { return; }
  window.__uoWatchdog = true;

  var HIDE_SELECTOR = [
    // Contenedores de anuncios en la interfaz (web + PWA movil)
    'ytd-ad-slot-renderer', 'ytd-display-ad-renderer', 'ytd-in-feed-ad-layout-renderer',
    'ytd-promoted-sparkles-web-renderer', 'ytd-video-masthead-ad-v3-renderer',
    'ytd-banner-promo-renderer', 'ytd-companion-slot-renderer',
    'ytm-ad-slot-renderer', 'ytm-in-feed-ad-layout-renderer',
    'ytm-promoted-sparkles-web-renderer', 'ytm-video-masthead-ad-v3-renderer',
    'ytm-companion-slot-renderer', 'ytm-logo-ad-renderer', 'ytm-display-ad-renderer',
    '#masthead-ad', '#player-ads',
    // Overlays de anuncio dentro del reproductor
    '.ytp-ad-module', '.ytp-ad-player-overlay', '.ytp-ad-text-overlay',
    '.ytp-ad-image-overlay', '.ytp-ad-skip-button-container', '.ytp-paid-content-overlay',
    '.ytp-ad-badge', '.ytp-ad-overlay-slot', '.ytp-ad-survey-ui',
    // Avisos de bloqueador de anuncios / consentimiento
    '.ytp-ad-blocker-message', '.ytp-ad-text-overlay', '.ytp-ce-element',
    'ytm-consent-bump-v2-renderer', 'ytd-consent-bump-v2-renderer',
    '#consent-bump', '#cookie-notice'
  ].join(',');

  function nuke() {
    var els = document.querySelectorAll(HIDE_SELECTOR);
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      if (e && e.parentNode) {
        try { e.parentNode.removeChild(e); } catch (err) {}
      }
    }
  }

  function skipAd() {
    var player = document.querySelector('.html5-video-player, ytd-player');
    if (!player) { return; }
    var adActive = player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting');
    if (!adActive && !document.querySelector('.ytp-ad-player-overlay')) { return; }
    var v = document.querySelector('video');
    if (v) {
      try {
        if (!v.paused && v.duration > 0 && v.currentTime < v.duration - 0.1) {
          v.currentTime = v.duration;
        }
        if (v.paused) {
          v.muted = true;
          v.play().catch(function () {});
        }
      } catch (err) {}
    }
    var skip = document.querySelector(
      '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, ' +
      '.ytp-ad-skip-button-container button, #movie_player button[aria-label*="Skip"], ' +
      'button[aria-label*="Skip"], button[aria-label*="Saltar"], button[aria-label*="Omitir"]'
    );
    if (skip) { try { skip.click(); } catch (err) {} }
    var overlay = document.querySelector('.ytp-ad-text-overlay, .ytp-ad-player-overlay');
    if (overlay && overlay.parentNode) { try { overlay.parentNode.removeChild(overlay); } catch (err) {} }
  }

  // ---- json-prune: podar datos de anuncios de las respuestas JSON ----
  // YouTube 2026: bloquear las peticiones de anuncios (player/ad_break,
  // ad_status.js, get_midroll_) hace que el reproductor falle y el video no
  // cargue (por eso esas URLs estan excepcionadas). Ademas de no bloquearlas,
  // se ELIMINAN los datos de anuncio de las respuestas /player, /next y
  // /browse para que el reproductor nunca llegue a programar publicidad
  // (misma estrategia que el json-prune de uBlock Origin).
  var AD_KEYS = {
    adPlacements: 1, adSlots: 1, playerAds: 1,
    adBreakHeartbeatParams: 1, adBreakEndpoint: 1
  };

  function pruneAds(obj, depth) {
    if (depth === undefined) { depth = 0; }
    if (depth > 12) { return; }
    if (obj === null || typeof obj !== 'object') { return; }
    if (Object.prototype.toString.call(obj) === '[object Array]') {
      for (var i = 0; i < obj.length; i++) { pruneAds(obj[i], depth + 1); }
      return;
    }
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) { continue; }
      if (AD_KEYS[k]) { delete obj[k]; }
      else { pruneAds(obj[k], depth + 1); }
    }
  }

  var origParse = JSON.parse;
  JSON.parse = function (text, reviver) {
    var data = origParse.call(JSON, text, reviver);
    try { pruneAds(data); } catch (err) {}
    return data;
  };

  // ---- isInlinePlaybackNoAd: pedir el video SIN anuncios ----
  // Ademas de podar la respuesta, hay que PEDIR la reproduccion sin anuncios
  // (igual que uBlock Origin): si /player trae anuncios y no se llegan a
  // reproducir, YouTube anade un "backoff" (~80% de la duracion del anuncio)
  // a los streams del video y este se queda congelado/colgado hasta recargar.
  // Inyectando "isInlinePlaybackNoAd":true en contentPlaybackContext del
  // CUERPO de la peticion, InnerTube no programa anuncios ni aplica backoff.
  function isPlaybackApiUrl(u) {
    if (!u || u.indexOf('youtubei/v1/') === -1) { return false; }
    if (u.indexOf('ad_break') !== -1 || u.indexOf('log_event') !== -1 ||
        u.indexOf('/config') !== -1 || u.indexOf('att/get') !== -1) { return false; }
    return u.indexOf('/player') !== -1 || u.indexOf('/get_watch') !== -1 ||
           u.indexOf('/reel_watch_sequence') !== -1;
  }

  function injectNoAd(bodyText) {
    var marker = '"contentPlaybackContext":{';
    var idx = bodyText.indexOf(marker);
    if (idx >= 0) {
      return bodyText.slice(0, idx + marker.length) +
        '"isInlinePlaybackNoAd":true,' + bodyText.slice(idx + marker.length);
    }
    var trimmed = bodyText.trim();
    if (trimmed.charAt(0) === '{' && trimmed.charAt(trimmed.length - 1) === '}') {
      var first = trimmed.indexOf('{');
      return trimmed.slice(0, first + 1) +
        '"contentPlaybackContext":{"isInlinePlaybackNoAd":true},' + trimmed.slice(first + 1);
    }
    return bodyText;
  }

  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url);
        var method = (init && init.method) || (input && input.method) || 'GET';
        if (method === 'POST' && isPlaybackApiUrl(url) && init && typeof init.body === 'string') {
          init = Object.assign({}, init, { body: injectNoAd(init.body) });
        }
      } catch (err) {}
      return origFetch.call(this, input, init).then(function (resp) {
        try {
          var ct = (resp.headers.get('content-type') || '');
          if (ct.indexOf('json') === -1) { return resp; }
          return resp.clone().text().then(function (text) {
            try {
              var data = origParse.call(JSON, text);
              pruneAds(data);
              var h = new Headers();
              resp.headers.forEach(function (v, k) {
                if (k === 'content-length' || k === 'content-encoding' || k === 'transfer-encoding') { return; }
                h.append(k, v);
              });
              return new Response(JSON.stringify(data), {
                status: resp.status, statusText: resp.statusText, headers: h
              });
            } catch (err) { return resp; }
          });
        } catch (err) { return resp; }
      });
    };
  }

  // La API InnerTube tambien puede ir por XMLHttpRequest (otras vistas).
  var xhrOpen = XMLHttpRequest.prototype.open;
  var xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__uoUrl = url;
    this.__uoMethod = method;
    return xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    try {
      if (this.__uoMethod === 'POST' && isPlaybackApiUrl(this.__uoUrl) && typeof body === 'string') {
        body = injectNoAd(body);
      }
    } catch (err) {}
    return xhrSend.call(this, body);
  };

  // ---- Poda de datos incrustados en la pagina (carga fria) ----
  // Al abrir un video directamente, YouTube incrusta la respuesta del player
  // en la pagina como ytInitialPlayerResponse/ytInitialData (literal JS, no
  // pasa por JSON.parse). Se podan los datos de anuncio de esos objetos.
  var globalsPruned = false;
  function pruneGlobals() {
    if (globalsPruned) { return; }
    try {
      if (window.ytInitialPlayerResponse) { pruneAds(window.ytInitialPlayerResponse); }
      if (window.ytInitialData) { pruneAds(window.ytInitialData); }
      globalsPruned = true;
    } catch (e) {}
  }

  // ---- Reproduccion en segundo plano ----
  // YouTube pausa el video cuando la pestana se oculta (listener de
  // visibilitychange + checks directos de document.hidden/visibilityState/
  // document.hasFocus). Para escuchar musica en segundo plano:
  // 1. Neutralizamos listeners visibilitychange de la pagina
  // 2. Sobreescribimos document.hidden, visibilityState y hasFocus
  // 3. Forzamos play cada 2 segundos si el video se pauso
  // 4. Reportamos titulo/artista/foto al servicio via JamasBridge
  (function () {
    // Propiedades que YouTube revisa para detectar si la pestana esta oculta
    try {
      Object.defineProperty(document, 'hidden', {
        get: function () { return false; },
        configurable: false
      });
      Object.defineProperty(document, 'visibilityState', {
        get: function () { return 'visible'; },
        configurable: false
      });
    } catch (e) {}
    // hasFocus tambien se usa en algunos parsers de YouTube
    try {
      var origHasFocus = document.hasFocus;
      document.hasFocus = function () { return true; };
    } catch (e) {}

    // Obtener metadata del video actual (titulo, canal, foto)
    // Selectores optimizados para m.youtube.com (mobile PWA) + youtube.com desktop
    function getVideoInfo() {
      var info = { title: '', artist: '', thumbnail: '' };
      try {
        // Titulo: intentar DOM primero, fallback a document.title
        var titleEl =
          document.querySelector('h1.title') ||
          document.querySelector('#title h1') ||
          document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
          document.querySelector('.title.ytd-watch-metadata yt-formatted-string') ||
          document.querySelector('ytd-watch-metadata h1 yt-formatted-string') ||
          document.querySelector('#info-contents h1');
        if (titleEl && titleEl.textContent.trim()) {
          info.title = titleEl.textContent.trim();
        } else {
          // document.title = "Video Title - YouTube" o "Video Title - JamasADS"
          var dt = document.title || '';
          var sep = dt.indexOf(' - ');
          info.title = sep > 0 ? dt.substring(0, sep).trim() : dt.trim();
        }

        // Canal / artista
        var artistEl =
          document.querySelector('#channel-name a') ||
          document.querySelector('#owner #channel-name a') ||
          document.querySelector('#channel-name yt-formatted-string a') ||
          document.querySelector('ytd-channel-name yt-formatted-string a') ||
          document.querySelector('.media-item-byline a');
        if (artistEl) info.artist = (artistEl.textContent || '').trim();

        // Thumbnail: extraer video ID de la URL y construir URL directa
        // Mas confiable que meta[property="og:image"] en mobile
        var vid = null;
        var urlMatch = location.pathname.match(/\/(?:shorts\/|watch\?v=|v\/)([\w-]{11})/);
        if (urlMatch) { vid = urlMatch[1]; }
        if (!vid) {
          var q = new URLSearchParams(location.search).get('v');
          if (q && q.length === 11) { vid = q; }
        }
        if (vid) {
          info.thumbnail = 'https://i.ytimg.com/vi/' + vid + '/hqdefault.jpg';
        }
      } catch (e) {}
      return info;
    }

    var forcePlay = function () {
      var v = document.querySelector('video');
      if (v && v.paused && v.currentTime > 0 && !v.ended) {
        try { v.muted = false; v.play().catch(function () {}); } catch (e) {}
      }
    };

    // __jamasBg: Kotlin lo pone en true al salir de la app, false al volver.
    // __jamasUserPaused: se pone en true cuando el usuario pausa manualmente
    //   desde la notificacion. El watchdog NO fuerza play si este flag es true.
    if (typeof window.__jamasBg === 'undefined') { window.__jamasBg = false; }
    if (typeof window.__jamasUserPaused === 'undefined') { window.__jamasUserPaused = false; }

    var checkAndNotify = function () {
      var v = document.querySelector('video');
      var playing = v && !v.paused && v.currentTime > 0 && !v.ended;
      try {
        var vi = getVideoInfo();
        var payload = JSON.stringify({
          playing: playing,
          title: vi.title,
          artist: vi.artist,
          thumbnail: vi.thumbnail,
          position: v ? Math.floor(v.currentTime * 1000) : 0,
          duration: v && v.duration > 0 ? Math.floor(v.duration * 1000) : 0
        });
        if (window.JamasBridge) {
          window.JamasBridge.onPlaybackStateChanged(payload);
        }
      } catch (e) {}
      // Forzar play SOLO si:
      // 1. La app esta en background (__jamasBg===true)
      // 2. El usuario NO pauso manualmente (__jamasUserPaused===false)
      // 3. El video se pauso solo (YouTube oculto, etc.)
      if (window.__jamasBg && !window.__jamasUserPaused &&
          !playing && v && v.currentTime > 0 && !v.ended) {
        forcePlay();
      }
    };

    // Neutralizar listeners visibilitychange que YouTube registre
    var hook = function (obj) {
      if (!obj || obj.__uoVisPatched) { return; }
      try { Object.defineProperty(obj, '__uoVisPatched', { value: true }); } catch (e) { return; }
      var orig = obj.addEventListener;
      obj.addEventListener = function (type, fn, opt) {
        if (type === 'visibilitychange') { return; }
        return orig.call(this, type, fn, opt);
      };
    };
    hook(document);
    hook(window);

    // Chequeo cada 2 segundos: notificar estado y forzar play si se pauso
    setInterval(checkAndNotify, 2000);
  })();

  // Los anuncios dinamicos se detectan con un intervalo corto. NO se usa
  // MutationObserver: disparaba un querySelectorAll sobre todo el DOM en cada
  // mutacion de YouTube (las listas virtuales mutan constantemente) y saturada
  // el hilo principal impidiendo que se renderizaran las filas horizontales.
  setInterval(function () { nuke(); skipAd(); pruneGlobals(); }, 2000);

  document.addEventListener('DOMContentLoaded', function () { nuke(); pruneGlobals(); });
  nuke();
  pruneGlobals();
})();