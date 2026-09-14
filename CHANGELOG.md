# Changelog

Todas los cambios notables en JamasADS estan documentados en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/spec/v2.0.0.html).

## [3.1] - 2026-09-14

### Added
- **Reproducción en segundo plano robusta**: la app ahora mantiene la música
  con la pantalla apagada o mientras usas otra app (juegos).
- **Sección "Segundo plano"** en los ajustes:
  - *Permitir sin restricciones*: solicita la exención de optimización de batería
    (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`), imprescindible en MIUI/Doze.
  - *Autostart / inicio automático*: abre los ajustes de autostart del fabricante
    (MIUI, ColorOS, EMUI, etc.).

### Changed
- **WakeLock indefinido mientras suena** (`PARTIAL_WAKE_LOCK`, sin timeout): se
  adquiere al reproducir y se libera al pausar o cerrar, en lugar de un lock de
  1 hora adquirido al crear el servicio.
- El servicio usa `android:stopWithTask="false"` y `onTaskRemoved`, para no
  cortarse al cerrar la tarea (swipe).

### Verified
- Con la app en segundo plano, la posición del vídeo sigue avanzando
  (`10196 → 14196`); el WakeLock `JamasADS::PlaybackWakeLock` está activo y el
  servicio en primer plano (`isForeground=true`, tipo `mediaPlayback`).

## [3.0] - 2026-09-14

### Added
- **Bottom nav nativa** con 5 iconos vectoriales Material (Inicio, Shorts, Buscar, Suscripciones, Biblioteca)
- **Buscador nativo**: diálogo con `EditText` que navega a la página de resultados de YouTube
- **Página de vídeo rediseñada**: barra de acciones 2×2 (Like / Dislike / Compartir / Más), fila de canal (avatar + nombre + suscriptores + Suscribirse) y comentarios como tarjetas
- **Contador real de dislikes** vía la API pública de Return YouTube Dislike
- **Shorts**: botón nativo "volver a inicio" y detección de pantalla completa
- **SplashActivity** animado y modo inmersivo permanente
- Detección de navegación SPA de YouTube (`pushState`/`popstate`)

### Changed
- CSS acotado por página (`html.jamas-page-*`) en lugar de selectores de escritorio (`ytd-*`)
- Selectores móviles de `m.youtube.com` (`ytm-*` / `slim-video-*`)

### Fixed
- **Hueco negro** en la página de vídeo (player `fixed top:48` → `top:0`)
- **Botones Compartir/Dislike que desaparecían al girar el móvil**: YouTube los elimina del DOM en horizontal y no los repone; al volver a vertical se recarga la página en la misma posición del vídeo
- Botones que se perdían en los re-render de YouTube (observer acotado + re-aplicación)
- **Audio que se silenciaba**: `forceAudio()` fuerza `video.muted=false`; se oculta el botón `.ytp-unmute`
- Logo de YouTube en la pantalla principal
- Crash por OOM / renderer caído

### Security
- Contador de dislikes: solo se envía el ID del vídeo a Return YouTube Dislike (una vez por vídeo)

## [2.9] - 2026-09-13

### Fixed
- `onStop()` mataba el servicio en segundo plano al minimizar
- `onConsoleMessage` silenciaba errores de consola
- Guards `isDestroyed/isFinishing` que bloqueaban acciones
- Crash en `unbindBackgroundService`

### Changed
- Canal de notificación con `IMPORTANCE_DEFAULT`

## [2.8] - 2026-09-11

### Changed
- watchdog.js `nuke()` intervalo: 350ms → 2000ms (5.7x menos carga DOM)
- `pruneAds()` con limite de profundidad (12 niveles)
- `pruneGlobals()` con flag `globalsPruned` (evita re-podar)
- `playbackWatcher`: 2s → 5s (evita duplicacion con watchdog)
- `memoryMonitorRunnable`: 10s → 30s (reduce GC forzado)
- `urlWatcher`: 500ms → 1000ms
- `bgKeepAliveRunnable`: 3s → 5s

### Fixed
- Jank/freeze al ver videos/shorts (86 frames skipped → 0)
- Heap al 95% (248MB/256MB) → 86% (129MB/150MB)
- GC forzado cada 10s con pausa 1.4s → natural, sin forzar

## [2.7] - 2026-09-11

### Added
- Splash screen con logo de JamasADS via theme (visible desde el instante 0)
- Boton "Compartir" en el dialogo de crash (share intent)

### Changed
- watchdog.js se cachea en memoria (se lee 1 vez, no en cada carga)
- CSS escape se cachea (se calcula 1 vez)
- Handlers diferidos: urlWatcher 3s, playbackWatcher 5s, servicio 2s

### Fixed
- Pantalla negra al inicio reemplazada por splash con logo

## [2.6] - 2026-09-11

### Fixed
- OOM en cascada al morir el renderer de WebView
- OOM en compilacion de filtros (PathRule, UrlRegexRule, AnchoredRegexRule)
- CrashCatcher con fallback OOM-safe
- Monitor de memoria proactivo al 85%

## [2.5] - 2026-09-11

### Fixed
- Crash OOM en FilterCompiler.parseRule (5 split por regla)
- Pantalla bloqueada pausa el video (3 capas de defensa)
- Logo viejo aparecia despues de actualizar

### Added
- ic_launcher_round para todas las densidades
- MediaWebView (fuerza visibility VISIBLE para Chromium)
- bgKeepAliveRunnable (Kotlin Handler fuerza play cada 3s)

## [2.4] - 2026-09-11

### Added
- Barra de progreso real en notificacion
- Seek desde la barra de notificacion

### Fixed
- Pantalla bloqueada reanuda video correctamente

## [2.3] - 2026-09-11

### Added
- Nuevo logo: chica con radio vintage (Gemini)
- Icono redondeado (round) para todas las densidades

### Fixed
- Pause manual se respeta en foreground

## [2.2] - 2026-09-11

### Fixed
- Selectores CSS para YouTube mobile 2026
- document.hasFocus() retorna true
- Botones siguiente/anterior usan API de YouTube
- Thumbnail en notificacion

### Added
- WakeLock de 1 hora (antes 10 min)

## [2.1] - 2026-09-11

### Fixed
- YouTube pausaba video al salir de la app
- document.hidden y document.visibilityState sobrescritos

## [2.0] - 2026-09-11

### Added
- Renombrado a JamasADS
- BackgroundMediaService (foreground service)
- Notificacion interactiva (pausar, siguiente, anterior)
- Comunicacion bidireccional servicio-WebView

### Changed
- applicationId: com.jamasads.app
- namespace: com.jamasads.app

## [1.9.5] - 2026-09-10

### Fixed
- Padding de Shorts en navegacion SPA (pushState)
- Vigilador de URL cada 500ms

## [1.9] - 2026-09-10

### Fixed
- Padding de Shorts solo se aplicaba al arrancar
- Re-aplicacion de insets al cambiar URL

## [1.8] - 2026-09-10

### Added
- isInlinePlaybackNoAd (parchea fetch/XHR)
- Mini-burbuja propia (no PiP del sistema)

### Fixed
- Video "cargando" para siempre tras anuncio

## [1.7] - 2026-09-10

### Added
- json-prune (parchea JSON.parse/fetch)
- Mini-burbuja via PiP nativo
- Reproduccion en segundo plano

### Fixed
- Videos no cargaban con bloqueador ON

## [1.6] - 2026-09-10

### Added
- UI bajo barras del sistema (insets)

### Fixed
- Videos largos no reproducian (carga infinita)
- Reglas $replace= se descartan correctamente

## [1.5] - 2026-09-10

### Added
- Proteccion contra bucle de renderer caido (3 crashes)

### Fixed
- Pantalla negra por scriptlets +js(...) en CSS
- Falso positivo nsfwyoutube.com

## [1.4] - 2026-09-10

### Fixed
- Filas horizontales no cargaban (MutationObserver)
- CSS reducido de 1.17MB a ~10KB

## [1.3] - 2026-09-10

### Fixed
- shouldInterceptRequest ya no llama a metodos de WebView desde hilo de red

## [1.2] - 2026-09-10

### Added
- Refactor profesional (Filter, FilterCompiler, AdBlocker, Config)
- Dialogo de crash con log completo
- Tests unitarios (9 tests)
- Matcher Aho-Corasick (4x mas rapido)

### Fixed
- Separador host/ruta
- Comodines * en rutas
- $third-party por dominio registrable

## [1.1] - 2026-09-10

### Added
- Manejo de onRenderProcessGone
- CrashCatcher para diagnosticar fallos
- Back predictivo (Android 13+)
- Escritura atomica de cache

## [1.0] - 2026-09-10

### Added
- Primera version funcional
- WebView de YouTube + bloqueador en 3 capas
- Pantalla completa
- Ajustes con actualizacion de listas
