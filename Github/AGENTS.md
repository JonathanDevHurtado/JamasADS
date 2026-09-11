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
cd /home/linius/Descargas/UtubeOrigins
export JAVA_HOME=/home/linius/android-dev/jdk17
export ANDROID_HOME=/home/linius/android-dev/sdk

# tests + lint + APK release firmado (comando completo y obligatorio al terminar)
./gradlew :app:testReleaseUnitTest :app:lintRelease assembleRelease

# validar sintaxis del watchdog JS
node --check app/src/main/assets/js/watchdog.js
```

Al terminar una versión: copiar `app/build/outputs/apk/release/app-release.apk`
a `UtubeOrigin-vX.Y.apk` (en la raíz), borrar el APK anterior y verificar firma
con `apksigner` de build-tools 35.0.0. Sin dispositivo ni emulador: **el usuario
instala y prueba cada APK**.

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
- El compilador de filtros debe **descartar** las reglas con opciones `replace=`,
  `csp=`, `removeparam`, `badfilter` (no son bloqueos; compilarlas como bloqueo
  rompe la reproducción) y los scriptlets `+js(...)` (no son CSS). Esto está
  cubierto por `FilterCompilerTest` (12 tests).
- Versionado: `versionCode`/`versionName` en `app/build.gradle.kts`
  (actual: 17 / "2.6"). Firma con `signing.properties` + `keystore/utubeorigin.jks`
  (alias `utubeorigin`, pass `utubeorigin2026`).
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
│   ├── MainActivity.kt        # UI, WebView, insets, mini-burbuja in-app, ajustes, crash dialog, servicio segundo plano
│   ├── CrashCatcher.kt        # guarda logs de crash y muestra diálogo
│   ├── media/BackgroundMediaService.kt  # servicio en 2° plano con MediaSession y notificación
│   ├── adblock/{Filter,FilterCompiler,AdBlocker}.kt
│   └── web/YtWebViewClient.kt # shouldInterceptRequest, inyección watchdog, renderer crash
├── app/src/main/assets/filters/{easylist,easyprivacy,ublock-filters,quick-fixes,youtube}.txt
├── app/src/main/assets/js/watchdog.js
├── app/src/test/java/.../adblock/FilterCompilerTest.kt   # 12 tests
├── DOCUMENTACION.md          # doc completa del usuario
└── REPORTE.md                # sistema de incidencias
```

## Estado actual

v2.8 (code 19) - Fix de jank y optimización de rendimiento: watchdog.js nuke()
intervalo 350ms→2000ms, pruneAds() con límite de profundidad (12 niveles),
pruneGlobals() con flag, playbackWatcher 2s→5s, memoryMonitor 10s→30s,
urlWatcher 500ms→1s, bgKeepAliveRunnable 3s→5s. Heap 95%→86%, frames
skipped 86→0, cero errores.