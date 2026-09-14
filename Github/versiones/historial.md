# Historial de Versiones - JamasADS

## v3.0 (2026-09-14) — Versión estable
- **UI nativa completa**: bottom nav de 5 pestañas (Inicio, Shorts, Buscar,
  Suscripciones, Biblioteca) con iconos Material vectoriales y **buscador nativo**
  (`AlertDialog` + `EditText` → `/results?search_query=...`)
- **Página de vídeo rediseñada**: barra de acciones 2×2 (Like/Dislike/Compartir/Más),
  fila de canal (avatar + nombre + suscriptores + Suscribirse), contador real de
  dislikes (Return YouTube Dislike) y comentarios como tarjetas
- **Shorts**: logo oculto y botón nativo "volver a inicio"
- **Audio siempre activo** (`forceAudio()`) y **reproducción en segundo plano** estables
- **Fix del giro**: YouTube elimina Compartir/Dislike del DOM en horizontal y no los
  repone; al volver a vertical se recarga la página en la misma posición (`&t=<s>`)
- **Fix del hueco negro** en la página de vídeo (player `fixed top:48` → `top:0`)
- CSS acotado por página (`html.jamas-page-*`) con detección de navegación SPA
- versionCode 32 / "3.0"
- APK: `apks/JamasADS-v3.0.apk`

## v3.0-beta.10 (2026-09-14)
- **Fix definitivo del giro**: causa raíz reproducida = al girar a **horizontal
  YouTube elimina Dislike/Más del DOM** (deja Like y Compartir) y al volver a
  vertical **no los repone** (bug de YouTube, no nuestro JS)
- **Solución**: al volver a vertical, si la barra perdió Dislike/Más, se
  **recarga la página en la misma posición del vídeo** (`&t=<segundos>`) para
  re-renderizar la barra completa (guardado: solo una vez por giro, solo en watch)
- Se mantiene de beta.9: ocultación segura (solo `<script>` y botón IA),
  observer de la barra y su padre, masthead `z-index:1`
- versionCode 31 / "3.0-beta.10"
- APK: `apks/JamasADS-v3.0-beta.10.apk`

## v3.0-beta.9 (2026-09-14)
- **Fix: compartir/dislike desaparecían al rotar** (vertical→horizontal→vertical).
  El JS ocultaba con `display:none !important` cualquier hijo de la barra sin
  `<button>`; durante el re-render de YouTube quedaban sin botón un instante y se
  ocultaban para siempre. Ahora solo se ocultan el `<script>` y el botón IA
- **Re-aplicación al rotar**: listeners `resize` (throttle 150 ms) y
  `orientationchange`, y `observeWatchBar()` también observa el **padre** de la
  barra (si YouTube la reemplaza entera, se re-aplica al instante)
- **Masthead renderizado** (`z-index:1`, ya no `display:none`): el player lo tapa
  igual (sin hueco) pero no se rompen componentes internos de YouTube
- **Buscador nativo**: la pestaña "Buscar" abre un diálogo `AlertDialog` con
  `EditText` y navega a `/results?search_query=...`. El click programático no
  servía: YouTube ignora los clics sintéticos (`isTrusted`) y en watch el botón
  queda tapado por el player
- versionCode 30 / "3.0-beta.9"
- APK: `apks/JamasADS-v3.0-beta.9.apk`

## v3.0-beta.8 (2026-09-14)
- **Auditoría del watch**: YouTube re-renderiza la barra y borra las clases →
  layout parcial por ~1,5 s. Solución: `MutationObserver` **acotado a la barra**
  (childList, throttle 120 ms, sin atributos → sin bucle)
- **Ocultación segura**: solo `<script>` y el botón IA "Preguntar"; nunca un
  botón no reconocido (dislike/compartir ya no desaparecen)
- **Player/masthead por CSS estable** (sin parpadeo del video)
- **Metadata con más aire**; **chips de relacionados estáticos** (no se
  superponen a las miniaturas)
- Se quitaron reglas CSS que rompían secciones
- versionCode 29 / "3.0-beta.8"
- APK: `apks/JamasADS-v3.0-beta.8.apk`

## v3.0-beta.7 (2026-09-14)
- **Like pegado a la izquierda**: el botón de like de YouTube trae
  `margin-left:auto` + ancho `fit-content` → `.jamas-ab-tile` fuerza
  `width:100%; margin:0; box-sizing:border-box; justify-self:stretch`
- **Más aire**: `row-gap` del grid a 14px (separa el bloque 2x2 del canal)
- versionCode 28 / "3.0-beta.7"
- APK: `apks/JamasADS-v3.0-beta.7.apk`

## v3.0-beta.6 (2026-09-14)
- **Layout estable con CSS puro**: grid de 6 columnas `minmax(0,1fr)` sin mover
  nodos de YouTube. Las 4 tarjetas quedan iguales y centradas, sin desborde
- **Fix**: mover nodos hacía que YouTube dejara de dibujar dislike y compartir
- **Fix**: tocar el contador `::after` no accionaba el botón → `bindTileClick()`
  reenvía el clic de la tarjeta al botón interno
- versionCode 27 / "3.0-beta.6"
- APK: `apks/JamasADS-v3.0-beta.6.apk`

## v3.0-beta.5 (2026-09-14)
- **Bloque de acciones 2x2**: fila 1 canal (avatar + nombre + suscriptores +
  Suscribirse); fila 2 [Like][Dislike]; fila 3 [Compartir][Más]. Radio 16 px
- **Contador de dislikes real** vía API pública de Return YouTube Dislike
  (`updateDislikeCount()`), una vez por video. Solo envía el ID del video
- **Bug fix**: el contador de dislike parpadeaba porque `enhanceWatchActions()`
  borraba el `data-count` cada 1,5 s
- Suscriptores: extracción robusta desde varias fuentes
- versionCode 26 / "3.0-beta.5"
- APK: `apks/JamasADS-v3.0-beta.5.apk`

## v3.0-beta.4 (2026-09-14)
- **Barra de acciones moderna**: 2 filas con CSS Grid (canal + 4 tarjetas
  compactas). Like **con contador** (del `aria-label`), Dislike, Compartir, Más.
  Extras (sparkle IA) ocultos para no desbordar
- **Icono de like (Lottie)** ya no se corta: flex centrado + `svg` estático
- **Audio siempre activo**: `forceAudio()` (`video.muted=false` cada 700 ms) y
  oculto el botón blanco `.ytp-unmute`
- Tarjetas más chicas (36 px, radio 11, iconos 22 px)
- Comentarios: teaser/carrusel con padding y radio, filas con avatar circular
- versionCode 25 / "3.0-beta.4"
- APK: `apks/JamasADS-v3.0-beta.4.apk`

## v3.0-beta.3 (2026-09-14)
- **UI nativa de la página de video (watch)**: `enhancements.css` usaba selectores
  de YouTube de escritorio (`ytd-watch-metadata`…) que no aplican en
  `m.youtube.com` (maqueta `ytm-*` / `slim-video-*`)
- Título a máximo 2 líneas (antes se cortaba en una)
- Barra de acciones "pill" glass; botón Suscribirse rojo pill
- Like/dislike/compartir redondeados; avatar circular
- Comentarios y videos relacionados como tarjetas redondeadas
- Todo acotado a `html.jamas-page-watch` (home/search/shorts intactos)
- versionCode 24 / "3.0-beta.3"
- APK: `apks/JamasADS-v3.0-beta.3.apk`

## v3.0-beta.2 (2026-09-14)
- **Buscador de la bottom nav funcional**: selector corregido
  (`button[aria-label*="Buscar"]`); abre el overlay de búsqueda de YouTube
- **Home**: se quitó el buscador de la barra superior (está en la bottom nav)
- **Shorts**: se quitó el logo de YouTube
- **Shorts**: botón nativo glass "volver a inicio" (casita + flecha) arriba a la
  izquierda, con `goBack()`
- Detector de fullscreen ya no marca Shorts como fullscreen
- versionCode 23 / "3.0-beta.2"
- APK: `apks/JamasADS-v3.0-beta.2.apk`

## v3.0-beta (2026-09-14)
- **Fix logo YouTube en home**: el CSS de ocultado del header ya no se aplica
  globalmente; queda acotado a `html.jamas-page-watch` en `#jamas-watch-css`
- **Fix hueco negro en watch**: el player (fixed top:48px) se sube a `top:0` y se
  oculta el header fijo de 48px; verificado `videoTop=0`
- **Fix SyntaxError cada 5s**: escapes del regex de videoId en MainActivity
- **Fix `enhancements.css`**: el watchdog ya no pisa `#jamas-css`
- **UI**: bottom nav con iconos vectoriales Material y boton de ajustes con icono
- **Buenas practicas**: streams con `use`, null-safety en NotificationManager,
  guard de `progressBar`, sin `System.gc()`, `isVideoFullscreen()` reparado,
  deep-links (`onNewIntent`), sin secretos en `AGENTS.md`
- versionCode 22 / "3.0-beta"
- APK: `apks/JamasADS-v3.0-beta.apk`

## v3.0-alpha (2026-09-14)
- **Background playback FIX**: loadUrl fallback en bgKeepAliveRunnable (1.5s)
- Force-play ultra-agresivo: watchdog setInterval 1s + __jamasBgForceInterval 500ms
- Fix Chromium suspension en MIUI/Xiaomi (evaluateJavascript no ejecuta en background)
- **Fullscreen FIX**: bottom nav se oculta en fullscreen/theater via detector JS + JamasBridge.onFullscreenChanged()
- **Hueco negro FIX**: negative margin dinámico calculado por JS que elimina el espacio arriba del video en watch pages (penetra Shadow DOM con tag names)
- **Bottom nav mejorada**: 5 tabs uniformes (Inicio, Shorts, Buscar, Suscripciones, Biblioteca) con diseño glass consistente
- Eliminado botón de retroceso custom (innecesario con la bottom nav)
- Fix watchdog guard, XSS, recreateWebView, logo YouTube en video (JS DOM traversal para Shadow DOM)
- APK: `apks/JamasADS-v3.0-alpha.apk`

## v3.0-alpha (2026-09-13)
- **Reescritura completa del watchdog.js** para background playback robusto
- Sistema anti-pause agresivo: override de prototipo + instancia + MutationObserver
- Fix de inconsistencia de variables (`__jamosBg` vs `__jamasBg`)
- bgKeepAliveRunnable sin dependencia de isPlaying
- Notificacion play con unmute
- Carpetas de logs/versiones/APKs creadas

## v2.9 (2026-09-13)
- Eliminado `onStop()` que mataba servicio al minimizar
- Eliminado `onConsoleMessage` que silenciaba errores
- Eliminados guards `isDestroyed/isFinishing` que bloqueaban acciones
- Canal de notificacion `IMPORTANCE_DEFAULT`
- Correccion de crash en unbindBackgroundService

## v2.8 (2026-09-07)
- Splash animado con logo Bubu
- Optimizacion de startup (watchdog cacheado en memoria)
- Handlers diferidos (urlWatcher 1s, playbackWatcher 5s)
- Mini-burbuja in-app con swipe

## v2.7 (2026-08-15)
- Renombrado completo UtubeOrigin -> JamasADS
- GitHub upload con documentacion
- Tags v2.7 y v2.8
