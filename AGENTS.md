# JamasADS — Contexto para agentes de código

Guía rápida para trabajar en este proyecto. La documentación completa del
usuario está en `DOCUMENTACION.md`; aquí está lo esencial que un agente necesita
para no romper nada ni perder el contexto.

## Qué es

App Android (Kotlin) que envuelve YouTube móvil (`m.youtube.com`) en un WebView
con bloqueador de anuncios en 3 capas (red, CSS cosmético, watchdog JS), basado
en las listas reales de uBlock Origin. Sin servicios de Google, sin root.
Reproducción en segundo plano con notificación interactiva (MediaSession).

## Comandos

```bash
cd /home/linius/Programador/Programas\ Personales\ Mios/JamasADS
source "$HOME/.sdkman/bin/sdkman-init.sh" && sdk use java 17.0.13-tem
export ANDROID_HOME="$HOME/android-sdk"

# tests + lint + APK release firmado (comando completo y obligatorio al terminar)
./gradlew :app:testReleaseUnitTest :app:lintRelease assembleRelease

# build rapido (sin tests)
./gradlew :app:assembleRelease

# validar sintaxis del watchdog JS
node --check app/src/main/assets/js/watchdog.js
```

Al terminar una versión: copiar `app/build/outputs/apk/release/app-release.apk`
a `Github/apks/JamasADS-vX.Y.apk`, borrar el APK anterior y verificar firma
con `apksigner` de build-tools 35.0.0. Firma:

Las credenciales de firma estan en `signing.properties` (no versionado). El
build de release firma automaticamente si ese archivo existe. Para firmar a mano
desde la linea de comandos, lee las claves de ahi en vez de escribirlas aqui:

```bash
"$ANDROID_HOME/build-tools/35.0.0/apksigner" sign \
  --ks keystore/utubeorigin.jks \
  --ks-pass "pass:$(grep storePassword signing.properties | cut -d= -f2)" \
  --key-pass "pass:$(grep keyPassword signing.properties | cut -d= -f2)" \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  app/build/outputs/apk/release/app-release.apk
```

Dispositivo de pruebas: `qc5lnnwwyhy5tcm7` (Xiaomi/MIUI Android 13+).
**Sin emulador**: el usuario instala y prueba cada APK.
**adb input commands**: bloqueados por SecurityException en este dispositivo.

## Arquitectura (3 capas de bloqueo)

1. **Capa 1 — Red** (`adblock/AdBlocker.kt` + `FilterCompiler.kt` + `Filter.kt`):
   `shouldInterceptRequest` (en `web/YtWebViewClient.kt`) comprueba cada petición
   contra las reglas compiladas de las listas. **NO bloquear los endpoints que el
   player espera de forma síncrona** (`youtubei/v1/player/ad_break`, `get_midroll_`,
   `ad_status.js`, `pagead/ads`, `pagead/id`) → YouTube niega la reproducción; están
   excepcionados con `@@` en `assets/filters/youtube.txt`. Los anuncios de
   TV/embebidos (`initplayback?c=TVHTML5&oad`) SÍ se bloquean.
2. **Capa 2 — Cosmético**: `<style>` con los selectores CSS compilados (solo
   acotados a youtube.com; ~3,5 KB).
3. **Capa 3 — Watchdog** (`assets/js/watchdog.js`): se inyecta SIEMPRE
   (independiente del switch de ajustes), en `onPageStarted` + `onPageCommitVisible`.
   - `nuke()`: elimina nodos de anuncios (setInterval 350 ms; **NO usar
     MutationObserver**, satura el hilo principal de YouTube).
   - `skipAd()`: salta anuncios de vídeo (lleva el vídeo al final, pulsa "Saltar").
   - `pruneAds()`/json-prune: parchea `JSON.parse` y respuestas `fetch` podando
     `adPlacements`, `adSlots`, `playerAds`, `adBreakHeartbeatParams`,
     `adBreakEndpoint`.
   - **`isInlinePlaybackNoAd` (v1.8, crítico)**: parchea `fetch` y `XMLHttpRequest`
     e inyecta `"isInlinePlaybackNoAd":true` en `contentPlaybackContext` del CUERPO
     de las peticiones `youtubei/v1/player`, `get_watch`, `reel_watch_sequence`.
     Sin esto YouTube aplica un "backoff" (~80 % de la duración del anuncio) al
     vídeo cuando el anuncio no se reproduce y el vídeo se queda "cargando" para
     siempre. Igual que uBlock Origin.
   - Fondo: neutraliza los listeners `visibilitychange` de la página y fuerza play.
   - `pruneGlobals()`: poda `ytInitialPlayerResponse`/`ytInitialData` (cargas frías).
   - Está acotado en URL (`isPlaybackApiUrl`): solo youtubei/v1/player|get_watch|reel,
     excluyendo ad_break/log_event/config/att/get.

## Reglas críticas (duras)

- **`shouldInterceptRequest` corre en un hilo de red**: NUNCA llamar a métodos de
  WebView (`getUrl`, `evaluateJavascript`...) ahí. Usar `currentPageUrl` cacheada
  (`@Volatile`, actualizada en `onPageStarted`/`onPageCommitVisible`) y try/catch
  con `super.shouldInterceptRequest` como fallback.
- **`WebResourceRequest` NO expone el cuerpo del POST**: la reescritura de la API
  (isInlinePlaybackNoAd) se hace en JS dentro del watchdog, no en Kotlin.
- No reintroducir `GestureDetector`/`SimpleOnGestureListener`: el override
  `onFling` falla con "overrides nothing" (Kotlin 2.0.21) sin explicación; el
  swipe-down se detecta con seguimiento manual de `ACTION_DOWN`/`ACTION_UP`
  (vars `pipDownX`/`pipDownY`/`pipDownTime` en MainActivity).
- El switch del panel ⚙ solo activa/desactiva la Capa 1 (red). CSS y watchdog
  actúan siempre (por eso no se ven anuncios con el bloqueador OFF).
- **CSS del watchdog acotado por página**: `enhancements.css` va en `#jamas-css`
  (lo inyecta Kotlin). Los fixes SOLO de watch (ocultar header, subir el player)
  van en `#jamas-watch-css` y **siempre** prefijados con `html.jamas-page-watch`.
  El watchdog añade esa clase a `<html>`/`<body>`/`ytm-app`/`ytd-app` según la
  ruta (con detección de `pushState`/`popstate`). Nunca ocultar el logo/header
  globalmente: en home/search debe verse.
- **Hueco negro en watch**: en `m.youtube.com` el contenedor del player es
  `position:fixed` con `top:48px`. El fix es subir ese ancestro a `top:0`
  (recorriendo los padres del `<video>`) y ocultar el header fijo de ~48px de
  `ytm-app`. No usar negative margins sobre `body`/`html` (tapaba la descripción).
- El compilador de filtros debe **descartar** las reglas con opciones `replace=`,
  `csp=`, `removeparam`, `badfilter` (no son bloqueos; compilarlas como bloqueo
  rompe la reproducción) y los scriptlets `+js(...)` (no son CSS). Esto está
  cubierto por `FilterCompilerTest` (12 tests).
- Versionado: `versionCode`/`versionName` en `app/build.gradle.kts`
  (actual: 32 / "3.0"). Firma con `signing.properties` + `keystore/utubeorigin.jks`
- **La barra de acciones del watch se re-renderiza**: YouTube borra las clases
  `jamas-ab-*`. Se re-aplica al instante con `observeWatchBar()` (MutationObserver
  **solo childList**, throttle 120 ms, sin observar atributos → sin bucle), que
  además observa el **padre** de la barra (si YouTube la reemplaza entera). Al
  ocultar extras, **nunca** ocultar un elemento que contenga un `<button>` salvo
  el botón IA "Preguntar" (si no, dislike/compartir desaparecen). **Tampoco
  ocultar elementos por "no tener `<button>`" (`!cb`)**: durante un re-render
  (p. ej. al rotar) dislike/compartir se quedan un instante sin botón y quedarían
  ocultos con `display:none !important` inline para siempre (bug de beta.8,
  arreglado en beta.9). Ante `resize` y `orientationchange` también se re-aplica.
- **Giro del móvil (bug real de YouTube)**: al girar a **horizontal** YouTube
  **elimina Dislike, IA y Más del DOM** de la barra (deja Like y Compartir) y al
  volver a **vertical NO los repone**; el JS no puede recuperar nodos borrados.
  Solución (`jamasOnOrientation()` en el watchdog): al detectar horizontal→
  vertical, si falta el botón de "No me gusta" (o hay <2 `button-view-model`), se
  **recarga la página en la misma posición del vídeo** (`URL` +
  `searchParams.set('t', currentTime)`). Guardado: solo una vez por giro y solo en
  `watch`. Se reproduce con `adb shell wm user-rotation lock 1` / `lock 0`.
- **Player/masthead por CSS, no por JS repetido**: `.player-container{top:0}` y
  `ytm-masthead{z-index:1}` (renderizado, no `display:none`) con `!important`. El
  player (`z=2`) tapa el masthead igual (sin hueco) pero no se rompen componentes
  internos de YouTube. El JS `fixWatchLayout` queda solo como respaldo.
- **El buscador no se puede abrir por código**: YouTube ignora los clics
  sintéticos (`.click()` y toda la secuencia de punteros exigen `isTrusted`) y el
  botón vive en el topbar (`ytm-mobile-topbar-renderer`), tapado por el player en
  watch. La pestaña "Buscar" usa un **diálogo nativo** (`AlertDialog` + `EditText`,
  `showSearchDialog()`) y navega a `https://m.youtube.com/results?search_query=<q>`.
- **No mover nodos del DOM de YouTube**: al mover los botones de la barra de
  acciones a contenedores propios, su render deja de dibujar dislike/compartir.
  El layout se hace SOLO con CSS Grid (`repeat(6, minmax(0,1fr))` + `grid-column`
  por clase en `enhancements.css`); el JS solo añade clases, contadores y
  `bindTileClick()` (reenvía el clic de la tarjeta al `<button>`).
  (alias y passwords en `signing.properties`, no versionado).
- **Los ajustes de UI dependientes de la página (padding de insets de Shorts,
  etc.) deben detectar también la navegación SPA de YouTube** (`history.pushState`):
  ni `onPageCommitVisible` ni los insets se disparan ahí. MainActivity tiene un
  **vigilador de URL** (Handler 500 ms leyendo `webView.url`) que re-aplica
  `applyInsetsPadding()` al cambiar el estado "es Shorts" (INC-012).

## Flujo típico de una iteración

1. El usuario prueba el APK y reporta un problema.
2. Investigar (websearch: filtros actuales de uBlock en uAssets `filters.min.txt`
   e issues) para entender el comportamiento 2026 de YouTube.
3. Implementar, validar con `node --check`, `./gradlew :app:testReleaseUnitTest
   :app:lintRelease assembleRelease`.
4. Copiar/renombrar APK, verificar con aapt2/apksigner, actualizar
   `DOCUMENTACION.md` (sección 8.x de causa raíz + tabla del historial +
   limitaciones) y `REPORTE.md`.
5. Entregar al usuario en español explicando la causa raíz.

## Estructura

```
JamasADS/
├── app/src/main/java/com/jamasads/app/
│   ├── Config.kt              # HOME_URL, CHROME_UA, TAG, FILE_CHOOSER_REQ
│   ├── SplashActivity.kt      # Splash animado con logo Bubu
│   ├── MainActivity.kt        # UI, WebView, bottom nav nativa, insets, mini-burbuja, ajustes, crash dialog, servicio 2° plano
│   ├── CrashCatcher.kt        # guarda logs de crash y muestra diálogo
│   ├── media/BackgroundMediaService.kt  # servicio en 2° plano con MediaSession y notificación
│   ├── adblock/{Filter,FilterCompiler,AdBlocker}.kt
│   └── web/YtWebViewClient.kt # shouldInterceptRequest, inyección watchdog+CSS, renderer crash
├── app/src/main/assets/
│   ├── filters/{easylist,easyprivacy,ublock-filters,quick-fixes,youtube}.txt
│   ├── js/watchdog.js         # watchdog anti-anuncios + background + glass UI
│   └── css/enhancements.css   # glassmorphism + tema nativo YouTube
├── app/src/test/java/.../adblock/FilterCompilerTest.kt   # 12 tests
├── Github/
│   ├── apks/                  # APKs firmados por versión (versionados)
│   ├── logs/                  # changelogs por versión
│   └── versiones/             # historial de versiones
├── .github/workflows/build.yml  # CI: tests + lint + build en tags v*
├── README.md                  # portada del repo (GitHub)
├── CHANGELOG.md               # changelog Keep a Changelog
├── LICENSE                    # MIT
├── SECURITY.md / CONTRIBUTING.md / CODE_OF_CONDUCT.md
├── DOCUMENTACION.md           # doc completa del usuario
├── REPORTE.md                 # sistema de incidencias
└── AGENTS.md                  # este archivo
```

## Estado actual

v3.0 (code 32) - versión estable (UI nativa + fixes del watch):
- **Estructura del repo**: README, LICENSE, CHANGELOG, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT y `.github/workflows/build.yml` en la raíz; `Github/` queda para `apks/`, `logs/` y `versiones/`
- **Giro del móvil**: al girar a horizontal YouTube **borra Dislike/Más del DOM** y no los repone al volver a vertical → al volver a vertical se **recarga la página en la misma posición del vídeo** (`&t=<s>`) para re-renderizar la barra completa
- **Masthead** `z-index:1` (renderizado, ya no `display:none`): el player lo tapa sin hueco y no se rompen componentes de YouTube
- **Buscador nativo**: pestaña "Buscar" → `AlertDialog` con `EditText` → `/results?search_query=<q>` (el click JS no sirve: YouTube exige gesto real)
- **Ocultación segura**: solo `<script>` y botón IA; observer de la barra y su padre
- Version anterior (v3.0-beta.9, code 30) - fix rotación (parcial) + buscador nativo:
- Se quitó la ocultación de hijos sin `<button>` (`!cb`); listeners `resize`/`orientationchange` + observer del padre de la barra
- Version anterior (v3.0-beta.8, code 29) - auditoría del watch (estabilidad):
- **Barra de acciones**: grid de 6 columnas; `observeWatchBar()` (MutationObserver acotado, throttle 120 ms) re-aplica las clases al instante tras los re-render de YouTube. Ocultación segura (solo `<script>` y botón IA "Preguntar")
- **Player**: `top:0`; **Metadata** con más aire (`padding:16px 14px 8px`); **chips de relacionados** `position:static` (no se superponen)
- **Contador de dislikes**: Return YouTube Dislike; like desde el `aria-label`
- **Audio siempre activo**: `forceAudio()` + CSS oculta `.ytp-unmute`
- Version anterior (v3.0-beta.7, code 28) - like pegado a la izquierda + más aire en el 2x2:
- **Watch, barra de acciones**: grid de **6 columnas** `repeat(6, minmax(0,1fr))`; fila 1 avatar(1) | nombre+subs(2-4) | Suscribirse(5-6); fila 2 `[Like 1-3][Dislike 4-6]`; fila 3 `[Compartir 1-3][Más 4-6]`. **No se mueve ningún nodo de YouTube**
- **`.jamas-ab-tile`**: `width:100%; margin:0; box-sizing:border-box; justify-self:stretch` (el like de YouTube trae `margin-left:auto` + `fit-content` y se pegaba a la derecha). `row-gap:14px` separa el 2x2 del canal
- **Clic en toda la tarjeta**: `bindTileClick()` reenvía el clic (incluido el contador `::after`) al `<button>` interno
- **Contador de dislikes**: `updateDislikeCount()` (Return YouTube Dislike). Like desde el `aria-label`
- **Audio siempre activo**: `forceAudio()` (`video.muted=false` cada 700 ms) + CSS oculta `.ytp-unmute`
- Version anterior (v3.0-beta.6, code 27) - layout de la barra de acciones estable (CSS puro):
- **Watch, barra de acciones**: grid de **6 columnas** `repeat(6, minmax(0,1fr))` (CSS en `enhancements.css`): fila 1 avatar(1) | nombre+subs(2-4) | Suscribirse(5-6); fila 2 `[Like 1-3][Dislike 4-6]`; fila 3 `[Compartir 1-3][Más 4-6]`. **No se mueve ningún nodo de YouTube** (moverlos hacía que su render dejara de dibujar dislike/compartir)
- **Clic en toda la tarjeta**: `bindTileClick()` reenvía el clic (incluido el contador `::after`) al `<button>` interno
- **Contador de dislikes**: `updateDislikeCount()` (Return YouTube Dislike). Like desde el `aria-label`
- **Audio siempre activo**: `forceAudio()` (`video.muted=false` cada 700 ms) + CSS oculta `.ytp-unmute`
- Version anterior (v3.0-beta.5, code 26) - bloque de acciones 2x2 + dislike real:
- **Watch, bloque 2x2**: `enhanceWatchActions()` rehace la barra como grid de 4 columnas: fila 1 canal (avatar + nombre + suscriptores + Suscribirse), fila 2 `[Like][Dislike]`, fila 3 `[Compartir][Más]` (cada tarjeta `span 2`). Radio 16 px
- **Contador de dislikes**: YouTube ya no los publica → `updateDislikeCount()` consulta la API pública de **Return YouTube Dislike** una vez por video (`data-count` + `data-ryd`). **No** borrar ese `data-count` desde `enhanceWatchActions()` (parpadeaba)
- **Audio siempre activo**: `forceAudio()` (`video.muted=false` cada 700 ms) + CSS oculta `.ytp-unmute`
- **Icono de like Lottie**: flex centrado + `svg{position:static;transform:none}` para que no se corte
- Version anterior (v3.0-beta.4, code 25) - barra de acciones moderna + audio siempre activo:
- **Watch, barra de acciones**: `enhanceWatchActions()` (watchdog) rehace `.slim-video-action-bar-actions` con CSS Grid en 2 filas: canal (avatar + nombre + suscriptores + Suscribirse) y 4 tarjetas compactas (Like con contador del `aria-label`, Dislike, Compartir, Más). Oculta extras (sparkle IA). No mueve el DOM de YouTube (solo añade clases + `grid-column`), así los botones siguen funcionando
- **Icono de like Lottie**: se cortaba por `transform: translate(-50%,-50%)` al colapsar el botón → se fuerza flex centrado en la cadena y `svg{position:static;transform:none}`
- **Audio siempre activo**: `forceAudio()` pone `video.muted=false` cada 700 ms; se oculta el botón blanco `.ytp-unmute`. `mediaPlaybackRequiresUserGesture=false` en el WebView
- Tarjetas compactas (36 px, radio 11, iconos 22 px); comentarios (teaser/carrusel) con padding, radio y avatar circular
- Version anterior (v3.0-beta.3, code 24) - UI nativa de la página de video (watch):
- **Watch mobile**: `enhancements.css` usaba selectores de escritorio (`ytd-*`) que no aplican en `m.youtube.com` (maqueta `ytm-*` / `slim-video-*`). Nueva sección acotada a `html.jamas-page-watch`: título a 2 líneas, barra de acciones "pill" glass, Suscribirse rojo pill, like/dislike/compartir redondeados, avatar circular, comentarios y relacionados como tarjetas
- Version anterior (v3.0-beta.2, code 23) - reparación + UI + auditoría + UX:
- Bottom nav con 5 iconos vectoriales Material (Inicio, Shorts, Buscar, Suscripciones, Biblioteca)
- **Buscador de la bottom nav funcional**: `button[aria-label*="Buscar"]` abre el overlay de búsqueda de YouTube
- **Home**: buscador de la barra superior oculto (duplicaba la bottom nav)
- **Shorts**: logo de YouTube oculto + botón nativo glass "volver a inicio" (casita + flecha, `ic_shorts_home`)
- **Watch**: fix hueco negro (player `fixed top:48` → `top:0`, header de 48px oculto). Verificado `videoTop=0`
- CSS del watchdog acotado por página en `#jamas-watch-css` (`html.jamas-page-*`), con detección de SPA
- Fix `SyntaxError` del regex de videoId; fix conflicto `enhancements.css` (`#jamas-css`)
- `isVideoFullscreen()` usa `@Volatile isFullscreenReported` del bridge
- Buenas prácticas: streams con `use`, null-safety NotificationManager, guard `progressBar`, sin `System.gc()`, typo XHR, `skipAd` restaura mute, `injectNoAd` sin JSON inválido, sin MutationObserver costoso, deep-links (`onNewIntent`), logging de consola JS, sin secretos en `AGENTS.md`
- Modo inmersivo permanente; CSS glassmorphism; background playback (loadUrl fallback + force-play 500ms)