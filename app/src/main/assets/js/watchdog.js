// JamasADS v3 - watchdog anti-anuncios + reproduccion en segundo plano
// Se inyecta SIEMPRE en cada pagina completa (guard __jamasWatchdog).
(function () {
  'use strict';
  if (window.__jamasWatchdog) { return; }
  window.__jamasWatchdog = true;

  // ===================== ANTI-ANUNCIOS =====================

  var HIDE_SELECTOR = [
    'ytd-ad-slot-renderer', 'ytd-display-ad-renderer', 'ytd-in-feed-ad-layout-renderer',
    'ytd-promoted-sparkles-web-renderer', 'ytd-video-masthead-ad-v3-renderer',
    'ytd-banner-promo-renderer', 'ytd-companion-slot-renderer',
    'ytm-ad-slot-renderer', 'ytm-in-feed-ad-layout-renderer',
    'ytm-promoted-sparkles-web-renderer', 'ytm-video-masthead-ad-v3-renderer',
    'ytm-companion-slot-renderer', 'ytm-logo-ad-renderer', 'ytm-display-ad-renderer',
    '#masthead-ad', '#player-ads',
    '.ytp-ad-module', '.ytp-ad-player-overlay', '.ytp-ad-text-overlay',
    '.ytp-ad-image-overlay', '.ytp-ad-skip-button-container', '.ytp-paid-content-overlay',
    '.ytp-ad-badge', '.ytp-ad-overlay-slot', '.ytp-ad-survey-ui',
    '.ytp-ad-blocker-message', '.ytp-ce-element',
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
        // Silenciar SOLO durante el salto del anuncio y restaurar despues,
        // para no dejar el video real sin sonido.
        var wasMuted = v.muted;
        v.muted = true;
        if (!v.paused && v.duration > 0 && v.currentTime < v.duration - 0.1) {
          v.currentTime = v.duration;
        }
        if (v.paused) {
          v.play().catch(function () {});
        }
        if (!wasMuted) {
          setTimeout(function () { try { v.muted = false; } catch (e) {} }, 400);
        }
      } catch (err) {}
    }
    var skip = document.querySelector(
      '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, ' +
      '.ytp-ad-skip-button-container button, #movie_player button[aria-label*="Skip"], ' +
      'button[aria-label*="Skip"], button[aria-label*="Saltar"], button[aria-label*="Omitir"]'
    );
    if (skip) { try { skip.click(); } catch (err) {} }
  }

  // ---- json-prune ----
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

  // ---- isInlinePlaybackNoAd ----
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
      var inner = trimmed.slice(1, trimmed.length - 1).trim();
      var payload = '"contentPlaybackContext":{"isInlinePlaybackNoAd":true}';
      // Evita coma final si el objeto estaba vacio ({}).
      return inner.length === 0 ? '{' + payload + '}' : '{' + payload + ',' + inner + '}';
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

  var xhrOpen = XMLHttpRequest.prototype.open;
  var xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__jamasUrl = url;
    this.__jamasMethod = method;
    return xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    try {
      if (this.__jamasMethod === 'POST' && isPlaybackApiUrl(this.__jamasUrl) && typeof body === 'string') {
        body = injectNoAd(body);
      }
    } catch (err) {}
    return xhrSend.call(this, body);
  };

  // ---- Poda de globals ----
  var globalsPruned = false;
  function pruneGlobals() {
    if (globalsPruned) { return; }
    try {
      if (window.ytInitialPlayerResponse) { pruneAds(window.ytInitialPlayerResponse); }
      if (window.ytInitialData) { pruneAds(window.ytInitialData); }
      globalsPruned = true;
    } catch (e) {}
  }

  // ===================== REPRODUCCION EN SEGUNDO PLANO =====================
  // Sistema anti-pause agresivo:
  // 1. Override document.hidden / visibilityState / hasFocus
  // 2. Bloquear listeners visibilitychange
  // 3. Override HTMLVideoElement.prototype.pause (NUNCA permite pausa en bg)
  // 4. Override HTMLVideoElement.prototype.play (siempre funciona)
  // 5. Parchear CADA video nuevo que YouTube cree (MutationObserver)
  // 6. Forzar play cada 1 segundo via setInterval (backup)

  // ---- Propiedades del documento ----
  try {
    Object.defineProperty(document, 'hidden', {
      get: function () { return false; },
      configurable: true
    });
    Object.defineProperty(document, 'visibilityState', {
      get: function () { return 'visible'; },
      configurable: true
    });
  } catch (e) {}
  try {
    document.hasFocus = function () { return true; };
  } catch (e) {}

  // ---- Bloquear SOLO el listener de visibilitychange del document ----
  // NO bloquear EventTarget.prototype.addEventListener globalmente porque
  // YouTube usa visibilitychange internamente para controles del player (fullscreen, etc.)
  try {
    var origDocAddEvent = document.addEventListener.bind(document);
    document.addEventListener = function (type, fn, opt) {
      if (type === 'visibilitychange') { return; }
      return origDocAddEvent(type, fn, opt);
    };
  } catch (e) {}

  // ---- Flags de estado ----
  // __jamasBg: true cuando la app esta en background (Kotlin lo pone en onPause)
  // __jamasUserPaused: true cuando el usuario pauso manualmente
  if (typeof window.__jamasBg === 'undefined') { window.__jamasBg = false; }
  if (typeof window.__jamasUserPaused === 'undefined') { window.__jamasUserPaused = false; }

  // ---- Override de pause/play en el PROTOTYPE ----
  // Esto afecta a TODOS los video elements, incluyendo los que YouTube cree despues.
  var _origPause = HTMLVideoElement.prototype.pause;
  HTMLVideoElement.prototype.pause = function () {
    // Bloquear pause solo si:
    // 1. La app esta en background (__jamasBg === true)
    // 2. El usuario NO pauso manualmente (__jamasUserPaused === false)
    if (window.__jamasBg && !window.__jamasUserPaused) {
      return undefined;
    }
    return _origPause.apply(this, arguments);
  };

  var _origPlay = HTMLVideoElement.prototype.play;
  HTMLVideoElement.prototype.play = function () {
    return _origPlay.apply(this, arguments);
  };

  // ---- Parchear video elements individuales ----
  // YouTube a veces captura la referencia original de pause ANTES de nuestro
  // override del prototype. Parcheamos cada instancia directamente.
  function patchVideoInstance(v) {
    if (!v || v.__jamosPatched) return;
    try {
      Object.defineProperty(v, '__jamosPatched', { value: true, configurable: false });
      var instPause = v.pause;
      v.pause = function () {
        if (window.__jamasBg && !window.__jamasUserPaused) {
          return undefined;
        }
        return instPause.apply(this, arguments);
      };
    } catch (e) {}
  }

  // Parchear video elements existentes
  function patchAllVideos() {
    var vids = document.querySelectorAll('video');
    for (var i = 0; i < vids.length; i++) { patchVideoInstance(vids[i]); }
  }
  patchAllVideos();

  // MutationObserver: parchear video nuevos cuando YouTube los cree
  // Limpiar observer previo si existiera (re-inyeccion)
  if (window.__jamasVideoObserver) { window.__jamasVideoObserver.disconnect(); }
  try {
    var _videoObserver = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var nodes = mutations[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var node = nodes[j];
          if (node.nodeName === 'VIDEO') { patchVideoInstance(node); }
          if (node.querySelectorAll) {
            var vids = node.querySelectorAll('video');
            for (var k = 0; k < vids.length; k++) { patchVideoInstance(vids[k]); }
          }
        }
      }
    });
    _videoObserver.observe(document.documentElement || document.body || document, {
      childList: true, subtree: true
    });
    window.__jamasVideoObserver = _videoObserver;
  } catch (e) {}

  // ---- Metadata del video actual ----
  function getVideoInfo() {
    var info = { title: '', artist: '', thumbnail: '' };
    try {
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
        var dt = document.title || '';
        var sep = dt.indexOf(' - ');
        info.title = sep > 0 ? dt.substring(0, sep).trim() : dt.trim();
      }
      var artistEl =
        document.querySelector('#channel-name a') ||
        document.querySelector('#owner #channel-name a') ||
        document.querySelector('#channel-name yt-formatted-string a') ||
        document.querySelector('ytd-channel-name yt-formatted-string a') ||
        document.querySelector('.media-item-byline a');
      if (artistEl) info.artist = (artistEl.textContent || '').trim();
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

  // ---- Bridge: reportar estado al servicio cada 2 segundos ----
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

    // Forzar play si estamos en background y el video se pauso solo
    if (window.__jamasBg && !window.__jamasUserPaused &&
        v && v.paused && !v.ended) {
      try {
        v.muted = false;
        v.play().catch(function () {});
      } catch (e) {}
    }
  };

  if (window.__jamasNotifyInterval) { clearInterval(window.__jamasNotifyInterval); }
  window.__jamasNotifyInterval = setInterval(checkAndNotify, 1000);

  // ---- Force-play ultra-agresivo para background ----
  // Este intervalo corre cada 500ms y fuerza play SIN importar el estado
  // Solo activo cuando __jamasBg es true
  if (window.__jamasBgForceInterval) { clearInterval(window.__jamasBgForceInterval); }
  window.__jamasBgForceInterval = setInterval(function () {
    if (!window.__jamasBg || window.__jamasUserPaused) return;
    try {
      var v = document.querySelector('video');
      if (v && v.paused && !v.ended) {
        v.muted = false;
        v.play().catch(function () {});
      }
    } catch (e) {}
  }, 500);

  // ---- Anuncios ----
  if (window.__jamasAdsInterval) { clearInterval(window.__jamasAdsInterval); }
  window.__jamasAdsInterval = setInterval(function () { nuke(); skipAd(); pruneGlobals(); }, 2000);
  document.addEventListener('DOMContentLoaded', function () { nuke(); pruneGlobals(); });
  nuke();
  pruneGlobals();

  // ---- Detector de fullscreen (comunica a Kotlin via bridge) ----
  if (window.__jamasFsInterval) { clearInterval(window.__jamasFsInterval); }
  var _lastFs = false;
  window.__jamasFsInterval = setInterval(function () {
    try {
      var isFs = false;
      // 1. Fullscreen nativo del navegador (API fullscreen) - vale en cualquier pagina
      var el = document.fullscreenElement || document.webkitFullscreenElement;
      if (el && el.tagName) isFs = true;
      // En Shorts el video llena la pantalla por diseño: NO es fullscreen.
      // Solo se considera fullscreen si se uso la API nativa (arriba).
      if (!isFs && currentPageType() !== 'shorts') {
        // 2. YouTube theater mode / expanded player
        var mp = document.querySelector('#movie_player');
        if (mp) {
          var cls = mp.className || '';
          if (cls.indexOf('ytp-fullscreen') >= 0 || cls.indexOf('theater') >= 0) isFs = true;
        }
        // 3. Video occupies > 95% width AND > 75% height
        if (!isFs) {
          var v = document.querySelector('video');
          if (v && v.getBoundingClientRect) {
            var r = v.getBoundingClientRect();
            if (r.width >= window.innerWidth * 0.95 && r.height >= window.innerHeight * 0.75) isFs = true;
          }
        }
        // 4. YouTube pone la clase 'fullscreen' en el player container
        if (!isFs) {
          var pc = document.querySelector('[class*="fullscreen-mode"],[class*="player-fullscreen"]');
          if (pc) isFs = true;
        }
      }
      if (isFs !== _lastFs) {
        _lastFs = isFs;
        if (window.JamasBridge && window.JamasBridge.onFullscreenChanged) {
          window.JamasBridge.onFullscreenChanged(isFs);
        }
      }
    } catch (e) {}
  }, 1500);

  // ---- Bloquear intentos de YouTube de mostrar barras del sistema ----
  try {
    var _origFocus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function () {
      if (this === document.body || this === document.documentElement) { return; }
      return _origFocus.apply(this, arguments);
    };
  } catch (e) {}

  // ---- Detectar tipo de pagina y anadir clase al documento ----
  // Permite acotar el CSS a cada tipo de pagina (home, watch, shorts, search).
  function currentPageType() {
    var p = location.pathname || '';
    if (p.indexOf('/shorts') !== -1) return 'shorts';
    if (p.indexOf('/watch') !== -1 || p.indexOf('/embed') !== -1) return 'watch';
    if (p.indexOf('/results') !== -1 || p.indexOf('/search') !== -1) return 'search';
    return 'home';
  }

  function updatePageClass() {
    try {
      var type = 'jamas-page-' + currentPageType();
      var classes = ['jamas-page-home', 'jamas-page-watch', 'jamas-page-shorts', 'jamas-page-search'];
      var targets = [
        document.documentElement,
        document.body,
        document.querySelector('ytm-app'),
        document.querySelector('ytd-app')
      ];
      for (var i = 0; i < targets.length; i++) {
        var t = targets[i];
        if (!t || !t.classList) continue;
        for (var c = 0; c < classes.length; c++) { t.classList.remove(classes[c]); }
        t.classList.add(type);
      }
    } catch (e) {}
  }
  updatePageClass();

  // Re-detectar en navegacion SPA (YouTube usa pushState/replaceState).
  try {
    if (!window.__jamasHistoryPatched) {
      window.__jamasHistoryPatched = true;
      var _jamasPush = history.pushState, _jamasReplace = history.replaceState;
      history.pushState = function () { var r = _jamasPush.apply(this, arguments); updatePageClass(); return r; };
      history.replaceState = function () { var r = _jamasReplace.apply(this, arguments); updatePageClass(); return r; };
      window.addEventListener('popstate', updatePageClass);
    }
  } catch (e) {}

  // ---- OCULTAR HEADER EN WATCH: TRAVERSE DEL DOM COMPLETO ----
  // YouTube mobile usa Shadow DOM + Polymer. Los selectores CSS no funcionan.
  // Solucion: traversar TODOS los elementos y ocultar por tag/attribute/position.
  function hideWatchHeaderElements() {
    try {
      var p = location.pathname || '';
      var isWatch = (p.indexOf('/watch') !== -1 || p.indexOf('/embed') !== -1);
      if (!isWatch) {
        return;
      }

      // ESTRATEGIA 1: Ocultar TODOS los elementos ytm-masthead / ytd-masthead
      var mastTags = ['YTM-MASTHEAD', 'YTD-MASTHEAD', 'YTM-HEADER', 'YTM-HEADER-BAR', 'YTM-MOBILE-TOPBAR-RENDERER'];
      for (var t = 0; t < mastTags.length; t++) {
        var els = document.querySelectorAll(mastTags[t]);
        for (var i = 0; i < els.length; i++) {
          els[i].style.cssText = 'display:none!important;visibility:hidden!important;height:0!important;min-height:0!important;max-height:0!important;overflow:hidden!important;padding:0!important;margin:0!important';
        }
      }

      // ESTRATEGIA 2: Buscar por atributo href="/" (logo), aria-label, textContent
      var allEls = document.querySelectorAll('*');
      for (var i = 0; i < allEls.length; i++) {
        var el = allEls[i];
        var tag = el.tagName.toLowerCase();
        var id = (el.id || '').toLowerCase();
        var cls = (el.className || '').toString().toLowerCase();
        var href = (el.getAttribute('href') || '');
        var ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();

        // Ocultar logo: links con href="/" que contengan imagen de YouTube
        if (href === '/' && (tag === 'a' || tag === 'ytm-tab-bar-item-renderer')) {
          var hasImg = el.querySelector('img, svg, yt-img-shadow');
          if (hasImg || cls.indexOf('logo') !== -1 || id.indexOf('logo') !== -1) {
            el.style.cssText = 'display:none!important;visibility:hidden!important;width:0!important;height:0!important';
          }
        }

        // Ocultar buscador
        if (tag === 'ytm-search-box' || tag === 'ytd-searchbox' ||
            id.indexOf('search') !== -1 || cls.indexOf('search') !== -1 ||
            ariaLabel.indexOf('search') !== -1 || ariaLabel.indexOf('buscar') !== -1) {
          // No ocultar si es el boton de buscar dentro del video player
          if (!el.closest('.ytp-chrome-top')) {
            el.style.cssText = 'display:none!important;visibility:hidden!important;width:0!important;height:0!important';
          }
        }

        // Ocultar 3 puntitos / menu buttons (excepto guide-icon/back)
        if (id.indexOf('button') !== -1 && id.indexOf('guide') === -1) {
          if (cls.indexOf('topbar') !== -1 || cls.indexOf('menu') !== -1 ||
              tag === 'YTD-TOPBAR-MENU-BUTTON-RENDERER') {
            el.style.cssText = 'display:none!important;visibility:hidden!important;width:0!important;height:0!important';
          }
        }
      }

      // ESTRATEGIA 3: Ocultar por posicion (arriba de 60px desde el top = header)
      // Solo en watch pages, ocultar elementos fijos/sticky en la parte superior
      var fixedEls = document.querySelectorAll('[style*="position: fixed"], [style*="position:sticky"], [style*="position: fixed"]');
      for (var i = 0; i < fixedEls.length; i++) {
        var el = fixedEls[i];
        var rect = el.getBoundingClientRect();
        if (rect.top < 60 && rect.height > 0 && rect.height < 80) {
          // Es un header fijo/sticky en la parte superior
          el.style.cssText = 'display:none!important;visibility:hidden!important;height:0!important';
        }
      }

      // BOTON DE RETROCESO: eliminado - lo maneja Kotlin via urlWatcher
    } catch (e) {}
  }
  hideWatchHeaderElements();

  // Intervalo para re-ocultar (sin MutationObserver: observar todo el subtree
  // y correr querySelectorAll('*') en cada mutacion saturaba el hilo principal).
  if (window.__jamasHeaderInterval) { clearInterval(window.__jamasHeaderInterval); }
  window.__jamasHeaderInterval = setInterval(hideWatchHeaderElements, 2000);

  // MutationObserver para re-detectar pagina cuando YouTube cambia el DOM (SPA)
  try {
    if (window.__jamasPageObserver) { window.__jamasPageObserver.disconnect(); }
    window.__jamasPageObserver = new MutationObserver(function () {
      updatePageClass();
    });
    window.__jamasPageObserver.observe(document.documentElement, {
      childList: true, subtree: true
    });
  } catch (e) {}

  // Re-inyectar el CSS por pagina cada 5 segundos por si YouTube lo elimina.
  // IMPORTANTE: usa su PROPIO elemento (#jamas-watch-css) para NO pisar el
  // #jamas-css que Kotlin llena con enhancements.css. Todo va acotado con la
  // clase html.jamas-page-* (watch/home/shorts), asi cada pagina se ajusta sola.
  function reapplyWatchCss() {
    try {
      var css =
        // --- WATCH: ocultar masthead y pegar el player al tope ---
        'html.jamas-page-watch #masthead-container,' +
        'html.jamas-page-watch ytm-masthead,' +
        'html.jamas-page-watch ytd-masthead,' +
        'html.jamas-page-watch ytm-header-bar,' +
        'html.jamas-page-watch [role=banner]{display:none!important;visibility:hidden!important;height:0!important;min-height:0!important;max-height:0!important;overflow:hidden!important;padding:0!important;margin:0!important}' +
        'html.jamas-page-watch ytm-app,html.jamas-page-watch ytd-app,' +
        'html.jamas-page-watch ytm-page-manager,html.jamas-page-watch ytd-page-manager,' +
        'html.jamas-page-watch ytd-watch-flexy{padding-top:0!important;margin-top:0!important}' +
        'html.jamas-page-watch #player,html.jamas-page-watch #player-container-outer,' +
        'html.jamas-page-watch #player-container,html.jamas-page-watch ytd-player,' +
        'html.jamas-page-watch ytm-player{margin-top:0!important;padding-top:0!important}' +
        'html.jamas-page-watch ytd-video-primary-info-renderer,' +
        'html.jamas-page-watch ytd-video-secondary-info-renderer,' +
        'html.jamas-page-watch ytd-watch-metadata{padding-top:0!important;margin-top:0!important}' +
        // --- HOME: quitar el buscador de la barra superior (esta en la bottom nav) ---
        'html.jamas-page-home ytm-mobile-topbar-renderer button[aria-label*="Buscar"],' +
        'html.jamas-page-home ytm-mobile-topbar-renderer button[aria-label*="Search"],' +
        'html.jamas-page-home ytm-mobile-topbar-renderer ytm-search-box{display:none!important}' +
        // --- SHORTS: quitar el logo de YouTube (lo reemplaza el boton nativo de inicio) ---
        'html.jamas-page-shorts ytm-home-logo,' +
        'html.jamas-page-shorts ytm-mobile-topbar-renderer ytm-home-logo,' +
        'html.jamas-page-shorts ytm-mobile-topbar-renderer button[aria-label*="Página de inicio"],' +
        'html.jamas-page-shorts ytm-mobile-topbar-renderer button[aria-label*="home page"]{display:none!important}';
      var el = document.getElementById('jamas-watch-css');
      if (el) {
        if (el.textContent !== css) el.textContent = css;
      } else {
        var s = document.createElement('style');
        s.id = 'jamas-watch-css';
        s.textContent = css;
        (document.head || document.documentElement).appendChild(s);
      }
    } catch (e) {}
  }
  reapplyWatchCss();
  setInterval(reapplyWatchCss, 5000);

  // === BARRA DE ACCIONES MODERNA (solo watch) ===
  // La barra "slim" de m.youtube.com mete avatar + suscribirse + like +
  // dislike + compartir + mas en una sola fila: no cabe y se bugea.
  // La reestructuramos en 2 filas con grid (definido en enhancements.css):
  //   fila 1 = avatar + nombre/subs del canal + Suscribirse
  //   fila 2 = like (con contador) / dislike / compartir / mas  (tarjetas)
  // Solo AÑADIMOS clases al DOM de YouTube (no lo movemos), asi los botones
  // siguen funcionando. El bloque de canal es un nodo propio inyectado.
  function formatJamasCount(raw) {
    var digits = (raw || '').replace(/[^\d]/g, '');
    var n = parseInt(digits, 10);
    if (isNaN(n)) return '';
    if (n >= 1000000) return Math.round(n / 1000000) + ' M';
    if (n >= 1000) return Math.round(n / 1000) + ' mil';
    return String(n);
  }

  function enhanceWatchActions() {
    try {
      if (currentPageType() !== 'watch') return;
      var bar = document.querySelector('.slim-video-action-bar-actions');
      if (!bar) return;

      var owner = bar.querySelector('.slim-video-owner-icon');
      var sub = bar.querySelector('.slim-subscribe-button');
      var like = bar.querySelector('like-button-view-model');
      var dislike = bar.querySelector('dislike-button-view-model');

      var share = null, more = null;
      var bvs = bar.querySelectorAll('button-view-model');
      for (var i = 0; i < bvs.length; i++) {
        var bb = bvs[i].querySelector('button');
        var al = bb ? (bb.getAttribute('aria-label') || '') : '';
        if (/compartir|share/i.test(al)) share = bvs[i];
        else if (/^m[áa]s|more$/i.test(al.trim())) more = bvs[i];
      }

      if (owner) owner.classList.add('jamas-ab-owner');
      if (sub) sub.classList.add('jamas-ab-sub');
      if (like) like.classList.add('jamas-ab-like');
      if (dislike) dislike.classList.add('jamas-ab-dislike');
      if (share) share.classList.add('jamas-ab-share');
      if (more) more.classList.add('jamas-ab-more');

      // Contador de "Me gusta" (viene en el aria-label del boton).
      if (like) {
        var lb = like.querySelector('button');
        var lal = lb ? (lb.getAttribute('aria-label') || '') : '';
        var lm = lal.match(/([\d.,]+)\s*(?:personas|people|otras)/i) || lal.match(/(?:otras|other)\s+([\d.,]+)/i);
        var count = lm ? formatJamasCount(lm[1]) : '';
        if (count) like.setAttribute('data-count', count);
        else like.removeAttribute('data-count');
      }
      // Contador de "No me gusta": YouTube ya no lo publica, lo pone
      // updateDislikeCount() con Return YouTube Dislike. NO lo borramos aqui
      // (si no, parpadearia cada 1,5 s).
      if (dislike) {
        var db = dislike.querySelector('button');
        var dal = db ? (db.getAttribute('aria-label') || '') : '';
        var dm = dal.match(/([\d.,]+)\s*(?:personas|people|otras)/i) || dal.match(/(?:otras|other)\s+([\d.,]+)/i);
        if (dm) dislike.setAttribute('data-count', formatJamasCount(dm[1]));
      }

      // Bloque de canal: nombre + suscriptores.
      var info = document.querySelector('.slim-video-information-channel-name');
      var nameTxt = info ? info.textContent.trim().replace(/\s+/g, ' ') : '';

      // Suscriptores: buscamos en varias fuentes (aria-label del avatar y
      // cualquier span del metadata que contenga "suscriptor").
      var subsTxt = '';
      var srcs = [];
      if (owner) srcs.push(owner.getAttribute('aria-label') || '');
      var av = bar.querySelector('ytm-profile-icon, yt-avatar-shape');
      if (av) srcs.push(av.getAttribute('aria-label') || '');
      var mSpans = document.querySelectorAll('.slim-video-information-renderer span, .slim-video-metadata-header span, .slim-video-information-subtitle-container span');
      for (var si = 0; si < mSpans.length; si++) {
        var st = (mSpans[si].textContent || '').trim();
        if (/suscriptor/i.test(st) && st.length < 60) srcs.push(st);
      }
      for (var sj = 0; sj < srcs.length; sj++) {
        var sm = srcs[sj].match(/([\d.,]+\s*(?:mil|[KMB])?)\s*(?:de\s+)?suscriptores/i);
        if (sm) { subsTxt = sm[1] + ' suscriptores'; break; }
      }

      // Bloque de canal: nombre + suscriptores (nodo propio; NO movemos los
      // elementos de YouTube: al moverlos, su render deja de dibujar los
      // botones de dislike/compartir). Todo el layout se hace con CSS Grid.
      var block = bar.querySelector('.jamas-channel-block');
      if (!block && nameTxt) {
        block = document.createElement('div');
        block.className = 'jamas-channel-block';
        var n = document.createElement('span');
        n.className = 'jamas-channel-name';
        var s = document.createElement('span');
        s.className = 'jamas-channel-subs';
        block.appendChild(n);
        block.appendChild(s);
        bar.appendChild(block);
      }
      if (block) {
        var ne = block.querySelector('.jamas-channel-name');
        var se = block.querySelector('.jamas-channel-subs');
        if (ne && ne.textContent !== nameTxt) ne.textContent = nameTxt;
        if (se && se.textContent !== subsTxt) se.textContent = subsTxt;
      }

      // Marcar tarjetas y ocultar SOLO extras seguros (script JSON-LD y el
      // boton de IA "Preguntar"). Nunca ocultamos un boton que no
      // reconozcamos: asi dislike/compartir no desaparecen si todavia no
      // tienen aria-label.
      var tileList = [like, dislike, share, more];
      var kids = Array.prototype.slice.call(bar.children);
      for (var k = 0; k < kids.length; k++) {
        var c = kids[k];
        if (c === owner || c === sub || c === block) continue;
        if (tileList.indexOf(c) !== -1) {
          if (!c.classList.contains('jamas-ab-tile')) c.classList.add('jamas-ab-tile');
          c.style.removeProperty('display');
          continue;
        }
        var cb = c.querySelector ? c.querySelector('button') : null;
        var cal = cb ? (cb.getAttribute('aria-label') || '') : '';
        var isSparkle = /preguntar|^ask\b|smartimation|animated/i.test(c.tagName + ' ' + (c.className || '') + ' ' + cal);
        // OJO: no ocultar por "!cb". Durante un re-render (p. ej. al rotar)
        // dislike/compartir pueden quedarse un instante sin <button> y, si los
        // ocultamos con display:none !important, se quedan invisibles. Solo
        // ocultamos el <script> JSON-LD y el boton IA "Preguntar".
        if (c.tagName === 'SCRIPT' || isSparkle) {
          c.style.setProperty('display', 'none', 'important');
        }
      }

      // Un clic en la tarjeta (incluido el contador ::after) dispara el boton.
      for (var t = 0; t < tileList.length; t++) bindTileClick(tileList[t]);
    } catch (e) {}
  }

  function bindTileClick(tile) {
    if (!tile || tile.__jamasClickBound) return;
    tile.__jamasClickBound = true;
    tile.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('button')) return;
      var b = tile.querySelector('button');
      if (b) b.click();
    });
  }
  enhanceWatchActions();
  if (window.__jamasWatchActions) { clearInterval(window.__jamasWatchActions); }
  window.__jamasWatchActions = setInterval(enhanceWatchActions, 1000);

  // YouTube re-renderiza la barra y borra nuestras clases; para que el layout
  // no parpadee (botones sin tarjeta / sparkle visible durante ~1,5 s),
  // observamos SOLO la barra (childList) y re-aplicamos al instante, con
  // throttle de 120 ms. No observamos atributos, asi nuestras propias clases
  // y estilos no re-disparan el observer (sin bucle).
  function observeWatchBar() {
    try {
      if (currentPageType() !== 'watch') return;
      var bar = document.querySelector('.slim-video-action-bar-actions');
      if (!bar) return;
      // Observer sobre la barra (re-render interno).
      if (window.__jamasObsBar !== bar) {
        if (window.__jamasObs) { try { window.__jamasObs.disconnect(); } catch (e) {} }
        window.__jamasObsBar = bar;
        window.__jamasObs = new MutationObserver(function () {
          if (window.__jamasObsT) return;
          window.__jamasObsT = setTimeout(function () { window.__jamasObsT = null; enhanceWatchActions(); }, 120);
        });
        window.__jamasObs.observe(bar, { childList: true, subtree: true });
      }
      // Observer sobre el PADRE: si YouTube reemplaza la barra entera
      // (p. ej. al rotar), re-aplicamos al instante.
      var parent = bar.parentElement;
      if (parent && window.__jamasObsParent !== parent) {
        if (window.__jamasObs2) { try { window.__jamasObs2.disconnect(); } catch (e) {} }
        window.__jamasObsParent = parent;
        window.__jamasObs2 = new MutationObserver(function () {
          if (window.__jamasObsT2) return;
          window.__jamasObsT2 = setTimeout(function () { window.__jamasObsT2 = null; enhanceWatchActions(); }, 120);
        });
        window.__jamasObs2.observe(parent, { childList: true });
      }
    } catch (e) {}
  }
  observeWatchBar();
  if (window.__jamasObsBarTimer) { clearInterval(window.__jamasObsBarTimer); }
  window.__jamasObsBarTimer = setInterval(observeWatchBar, 2000);

  // Al rotar / cambiar tamano, YouTube re-renderiza: re-aplicamos enseguida.
  // Ademas, en HORIZONTAL YouTube elimina "Compartir" y "No me gusta" de la
  // barra y al volver a VERTICAL NO los repone (bug de la maquetacion de
  // YouTube). Detectamos ese caso y recargamos la pagina en la misma posicion
  // del video para restaurarlos.
  window.__jamasPortrait = (window.innerHeight >= window.innerWidth);
  function jamasOnOrientation() {
    var portrait = (window.innerHeight >= window.innerWidth);
    var was = window.__jamasPortrait;
    window.__jamasPortrait = portrait;
    enhanceWatchActions();
    observeWatchBar();
    if (!portrait || !was) return; // solo al VOLVER a vertical
    setTimeout(function () {
      try {
        if (currentPageType() !== 'watch') return;
        var bar = document.querySelector('.slim-video-action-bar-actions');
        if (!bar) return;
        if (bar.querySelector('dislike-button-view-model') && bar.querySelectorAll('button-view-model').length >= 2) return;
        var v = document.querySelector('video');
        var t = v ? Math.floor(v.currentTime) : 0;
        var u = new URL(location.href);
        if (t > 3) u.searchParams.set('t', String(t)); else u.searchParams.delete('t');
        location.replace(u.toString());
      } catch (e) {}
    }, 1800);
  }
  window.addEventListener('resize', function () {
    if (window.__jamasResizeT) clearTimeout(window.__jamasResizeT);
    window.__jamasResizeT = setTimeout(jamasOnOrientation, 400);
  });
  window.addEventListener('orientationchange', function () { setTimeout(jamasOnOrientation, 300); });

  // === CONTADOR DE "NO ME GUSTA" (Return YouTube Dislike) ===
  // YouTube dejo de publicar los dislikes. Para mostrarlos consultamos la API
  // publica de Return YouTube Dislike (returnyoutubedislikeapi.com), una sola
  // vez por video. Es un servicio externo: solo envia el ID del video.
  function updateDislikeCount() {
    try {
      if (currentPageType() !== 'watch') return;
      if (!document.querySelector('.jamas-ab-dislike')) return;
      var m = location.search.match(/[?&]v=([\w-]{6,})/);
      if (!m) return;
      var vid = m[1];
      if (window.__jamasRydVid === vid || window.__jamasRydPending === vid) return;
      // Video nuevo: limpiar el contador anterior.
      var de = document.querySelector('.jamas-ab-dislike');
      if (de) { de.removeAttribute('data-count'); de.removeAttribute('data-ryd'); }
      window.__jamasRydPending = vid;
      fetch('https://returnyoutubedislikeapi.com/votes?videoId=' + vid)
        .then(function (r) { return r.json(); })
        .then(function (d) {
          window.__jamasRydPending = null;
          if (d && typeof d.dislikes === 'number') {
            window.__jamasRydVid = vid;
            var e2 = document.querySelector('.jamas-ab-dislike');
            if (e2) {
              e2.setAttribute('data-count', formatJamasCount(String(d.dislikes)));
              e2.setAttribute('data-ryd', '1');
            }
          }
        })
        .catch(function () { window.__jamasRydPending = null; });
    } catch (e) {}
  }
  updateDislikeCount();
  if (window.__jamasRydTimer) { clearInterval(window.__jamasRydTimer); }
  window.__jamasRydTimer = setInterval(updateDislikeCount, 3000);

  // === AUDIO SIEMPRE ACTIVO (solo watch) ===
  // YouTube silencia el autoplay (video.muted=true) y muestra el boton
  // blanco .ytp-unmute. Forzamos muted=false para que suene y ocultamos
  // ese boton por CSS. mediaPlaybackRequiresUserGesture=false ya permite
  // el autoplay con sonido en el WebView.
  function forceAudio() {
    try {
      if (currentPageType() !== 'watch') return;
      var v = document.querySelector('video');
      if (v && v.muted) v.muted = false;
    } catch (e) {}
  }
  forceAudio();
  if (window.__jamasForceAudio) { clearInterval(window.__jamasForceAudio); }
  window.__jamasForceAudio = setInterval(forceAudio, 700);





  // === FIX HUECO NEGRO (solo watch) ===
  // La causa real: en m.youtube.com el contenedor del player es position:fixed
  // con top:48px (debajo del masthead). El masthead es el primer hijo fixed de
  // ytm-app. Solucion: subir el player a top:0 y ocultar ese header fijo.
  function fixWatchLayout() {
    try {
      if (currentPageType() !== 'watch') return;
      var v = document.querySelector('video');
      if (!v) return;

      // 1. Subir a top:0 el ancestro position:fixed del video (el player).
      var node = v;
      while (node && node !== document.body) {
        var cs = getComputedStyle(node);
        if (cs.position === 'fixed') {
          node.style.setProperty('top', '0px', 'important');
          break;
        }
        node = node.parentElement;
      }

      // 2. El masthead (~48px) NO se oculta: se deja renderizado con z-index
      //    bajo (ver CSS) para no romper el buscador; el player lo tapa.
    } catch(e) {}
  }
  fixWatchLayout();
  if (window.__jamasScrollTop) { clearInterval(window.__jamasScrollTop); }
  window.__jamasScrollTop = setInterval(fixWatchLayout, 1500);
})();
