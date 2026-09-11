# JamasADS — Sistema de reportes de incidencias

Cada incidencia tiene: **ID**, versión donde se detectó, síntoma, causa raíz,
solución aplicada, estado y posible solución futura. Sirve de memoria para el
desarrollador (o agente) y de historial para el usuario.

| Estado | Significado |
|---|---|
| ✅ Resuelta | Arreglada en la versión indicada |
| 🔄 Pendiente | Detectada, solución en curso |
| ⚠️ Vigilar | No bloquea, pero hay que seguirla |

---

## ✅ INC-001 — La app se cerraba de golpe (crash)

- **Versión:** 1.0 → resuelta en 1.1
- **Síntoma:** la app moría sin aviso, sobre todo en páginas pesadas de YouTube.
- **Causa raíz (4):** muerte del renderer de WebView; callbacks sobre WebView
  destruida; hilos que capturaban solo `Exception` (no `Error`); back predictivo
  de Android 13+ no gestionado.
- **Solución:** `onRenderProcessGone` recrea la WebView; guardas
  `isAttachedToWindow`; captura de `Throwable`; `OnBackInvokedCallback`.
- **Solución futura:** ninguna.

## ✅ INC-002 — El bloqueador no paraba la publicidad real (3 bugs del motor)

- **Versión:** 1.1 → resuelta en 1.2
- **Síntoma:** seguían apareciendo anuncios a pesar de las listas.
- **Causa raíz:** separador host/ruta usaba `.` en vez de `/`; comodines `*`
  escapados de más; `$third-party` mal calculado (no por dominio registrable).
- **Solución:** reescritura del compilador + matcher 4× más rápido
  (Aho-Corasick + índice por ancla). 9 tests que guardan contra regresiones.
- **Solución futura:** ninguna.

## ✅ INC-003 — Crash en `WebView.getUrl()` desde hilo de red

- **Versión:** 1.2 → resuelta en 1.3
- **Síntoma:** el log de crash mostraba `getUrl` en `ThreadPoolForeg`.
- **Causa raíz:** `shouldInterceptRequest()` corre en un hilo de red; llamar a
  métodos de WebView desde ahí lanza excepción y cae la app.
- **Solución:** URL cacheada en `currentPageUrl` (`@Volatile`); callback blindado
  con try/catch que deja pasar la petición si algo falla.
- **Solución futura:** ninguna. **Regla dura para futuros cambios.**

## ✅ INC-004 — Filas horizontales que no cargaban (watchdog saturado)

- **Versión:** 1.3 → resuelta en 1.4
- **Síntoma:** las filas horizontales de contenido no se renderizaban.
- **Causa raíz:** `MutationObserver` ejecutaba `querySelectorAll` sobre todo el
  DOM en cada mutación de YouTube (las listas virtuales mutan sin parar).
- **Solución:** retirado el observer; los anuncios dinámicos los cubre un
  `setInterval` (350 ms). CSS cosmético recortado de 1,17 MB a ~10 KB.
- **Solución futura:** ninguna. **No reintroducir MutationObserver.**

## ✅ INC-005 — Pantalla negra (scriptlets `+js()` colados como CSS)

- **Versión:** 1.4 → resuelta en 1.5
- **Síntoma:** la página no renderizaba (negro total).
- **Causa raíz:** las reglas procedurales `+js(...)` de uBlock se compilaban
  como selectores CSS; una función gigante con llaves `{}` rompía el parseo.
- **Solución:** descartar `+js(...)`; filtro de dominio solo `youtube.com`
  (se eliminó un falso positivo `nsfwyoutube.com`). CSS final ~3,5 KB.
  También: pantalla de recuperación si el renderer cae 3 veces seguidas.
- **Solución futura:** si YouTube volviera a romperse, revisar selectores.

## ✅ INC-006 — Vídeos largos en carga infinita (reglas `$replace=`)

- **Versión:** 1.5 → resuelta en 1.6
- **Síntoma:** algunos vídeos (los largos) no reproducían, carga infinita.
- **Causa raíz:** las reglas `$replace=`/`csp=`/`removeparam`/`badfilter` de uBlock
  MODIFICAN la respuesta (no la bloquean); se compilaban como bloqueos y
  dejaban sin respuesta a `youtubei/v1/get_watch` y `player`.
- **Solución:** descartar esas opciones + excepciones `@@` para los endpoints
  esenciales de la API (`player?`, `next?`, `browse?`, `get_watch?`, `search?`,
  `reel_watch_sequence?` — patrón con `?` para no desproteger los de anuncios).
  Añadido `setupInsets()` (edge-to-edge Android 15).
- **Solución futura:** ninguna. **Regla dura: esas opciones NUNCA se compilan
  como bloqueos.**

## ✅ INC-007 — Vídeos no cargaban con el bloqueador ON (anti-adblock 2026)

- **Versión:** 1.6 → resuelta en 1.7
- **Síntoma:** con el bloqueador ON los vídeos no cargaban; con OFF no había
  anuncios visibles (el CSS + watchdog actúan siempre).
- **Causa raíz:** el player espera de forma SÍNCRONA los endpoints de anuncios
  (`player/ad_break`, `get_midroll_`, `ad_status.js`, `pagead/ads`, `pagead/id`);
  si responden vacíos, YouTube niega la reproducción.
- **Solución:** excepciones `@@` para esos endpoints; **json-prune** en el
  watchdog (parchea `JSON.parse`/`fetch` y elimina `adPlacements`, `adSlots`,
  `playerAds`, `adBreakHeartbeatParams`, `adBreakEndpoint` de las respuestas).
- **Solución futura:** la INC-008 (isInlinePlaybackNoAd) la hace más robusta.

## ✅ INC-008 — El vídeo se quedaba "cargando" tras un anuncio (backoff)

- **Versión:** 1.7 → resuelta en 1.8
- **Síntoma:** con OFF los vídeos reproducían, pero al aparecer un anuncio este
  se ocultaba y el vídeo no seguía hasta recargar la página; con ON no cargaba.
- **Causa raíz:** cuando `/player` trae anuncios y no se reproducen, InnerTube
  añade un **backoff** (~80 % de la duración del anuncio) a los streams del
  vídeo principal → colgado. Confirmado contra el comportamiento de
  Firefox+uBlock (que usa la misma técnica).
- **Solución (v1.8):** el watchdog parchea `fetch`/`XHR` e inyecta
  `"isInlinePlaybackNoAd":true` en `contentPlaybackContext` del cuerpo de
  `youtubei/v1/player`/`get_watch`/`reel_watch_sequence` → el player llega sin
  anuncios y sin backoff desde el servidor.
- **Nota técnica:** no se pudo hacer en Kotlin: `WebResourceRequest` no expone
  el cuerpo del POST. La inyección vive en `watchdog.js`.
- **Solución futura:** ⚠️ Vigilar: si YouTube ignorara el campo, el json-prune
  + salto automático quedan de respaldo.

## ✅ INC-009 — El PiP del sistema sacaba de la app y se bugeaba

- **Versión:** 1.7 → resuelta en 1.8
- **Síntoma:** al deslizar hacia abajo, el PiP nativo de Android sacaba de la
  app; el globo se bugeaba y no dejaba reanudar/pausar.
- **Causa raíz:** PiP nativo del sistema mal soportado con WebView (la WebView
  no se mantiene bien en el globo del sistema).
- **Solución (v1.8):** mini-burbuja PROPIA dentro de la app (WebView embebida
  flotante, arrastrable, con ✕ cerrar y ⤢ expandir, back cierra la burbuja).
  El vídeo principal navega al inicio mientras la burbuja sigue sonando.
  Se eliminó el PiP nativo (`supportsPictureInPicture`, `enterPictureInPictureMode`).
- **Solución futura:** ⚠️ Vigilar: el sonido en segundo plano (app cerrada)
  sigue funcionando porque la WebView ya no se pausa; la burbuja cubre el
  "mini" dentro de la app.

## ✅ INC-010 — La barra inferior (Inicio/Shorts/Cuenta) quedaba alta

- **Versión:** 1.7 → resuelta en 1.8
- **Síntoma:** la barra inferior de YouTube quedaba elevada (separada del borde).
- **Causa raíz:** el padding de insets inferior se aplicaba a TODAS las páginas,
  elevando la barra de navegación de YouTube que ya gestiona su propio margen.
- **Solución (v1.8):** padding inferior solo en páginas `/shorts/`; el botón ⚙
  se elevó para no tapar la barra.
- **Solución futura:** ninguna.

## ✅ INC-012 — La barra de progreso/descripción de Shorts chocaba con los botones del sistema

- **Versión:** 1.8 → resuelta en 1.9.5
- **Síntoma:** en Shorts la barra de progreso (adelantar/atrasar) y la
  descripción quedaban tan abajo que se superponían a los botones del sistema
  y eran imposibles de tocar. El resto de la app perfecto.
- **Causa raíz (dos capas):**
  1. (v1.8) El padding inferior de Shorts solo se aplicaba en el despacho
     inicial de insets (al arrancar, URL = inicio); el listener de insets no
     se re-dispara al navegar.
  2. (v1.9) Re-aplicar en `onMainFrameUrlChanged` (`onPageCommitVisible`) NO
     bastó: **entrar en Shorts desde el feed es una navegación SPA**
     (`history.pushState`, sin recargar la página), que no dispara ningún
     callback del WebViewClient ni de insets.
- **Solución (v1.9.5):** **vigilador de URL** — un `Handler` en el hilo
  principal lee `webView.url` cada 500 ms y, cuando el estado "es Shorts"
  cambia (aunque sea por SPA), re-aplica `applyInsetsPadding()`. Detección
  más permisiva (`/shorts`). El vigilador se detiene en `onDestroy`.
- **Solución futura:** si aun así fallara (WebView que no refleje la URL SPA),
  usar un puente JS→Kotlin (addJavascriptInterface) que avise en cada SPA
  navigation. **Regla dura: cualquier ajuste de UI dependiente de la página
  (insets, barra de Shorts...) debe re-aplicarse al cambiar la URL, incluida la
  navegación SPA (pushState), no solo al recibir insets ni en cargas reales.**

## ⚠️ INC-011 — Pendiente de validación real (sin dispositivo)

- **Versión:** 1.8
- **Síntoma:** sin probar en hardware.
- **Causa/solución:** la mini-burbuja in-app y el `isInlinePlaybackNoAd` están
  implementados y compilados (12/12 tests, lint OK), pero no hay dispositivo ni
  emulador: el usuario debe instalar `UtubeOrigin-v1.8.apk` y confirmar:
  1) el gesto de deslizar abre la burbuja y sigue el sonido;
  2) con bloqueador ON y OFF los vídeos reproducen sin colgarse tras un anuncio;
  3) la barra inferior ya no queda elevada.
- **Estado:** 🔄 Pendiente de prueba del usuario.

## ✅ INC-013 — Servicio en segundo plano con notificación interactiva (v2.0)

- **Versión:** 2.0
- **Síntoma:** la reproducción se detenía al salir de la app o bloquear la pantalla.
- **Causa raíz:** no había servicio en primer plano ni MediaSession; la reproducción
  en segundo plano solo funcionaba por el watchdog que neutraliza `visibilitychange`,
  pero sin controles en la notificación ni WakeLock para mantener la CPU activa.
- **Solución:** nuevo `BackgroundMediaService` (foreground service con
  `FOREGROUND_SERVICE_MEDIA_PLAYBACK`) que:
  1) Crea un canal de notificación de baja prioridad.
  2) Mantiene una `MediaSessionCompat` con callbacks para play/pause/next/prev/stop.
  3) Muestra notificación con controles de transporte (pausar, siguiente, anterior, cerrar).
  4) Adquiere un `WakeLock` parcial para evitar que la CPU se suspenda.
  5) Recibe comandos de la notificación y los ejecuta en el WebView via `evaluateJavascript`.
  6) Reporta el estado de reproducción (título, artista, playing/paused) desde el WebView
     al servicio usando los selectores de YouTube.
  Permisos añadidos: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`,
  `POST_NOTIFICATIONS`, `WAKE_LOCK`. Solicitud de permiso de notificaciones en Android 13+.
  Dependencias añadidas: `androidx.media:media:1.7.0`, `androidx.core:core:1.12.0`.
- **Solución futura:** ⚠️ Vigilar: en Android 15+ el sistema puede restringir los
  servicios en primerizo más agresivamente; si la app es matada, `START_STICKY`
  intentará recrearla. Si se reportan problemas con el WakeLock, ajustar el timeout
  o usar WorkManager para tareas periódicas.

## ✅ INC-014 — Renombrado de UtubeOrigin a JamasADS

- **Versión:** 2.0
- **Síntoma:** cambio de marca solicitado por el usuario.
- **Causa raíz:** el usuario quiere un nombre más identificativo.
- **Solución:** renombrado completo:
  - `applicationId`: `com.utubeorigin.app` → `com.jamasads.app`
  - `namespace`: `com.utubeorigin.app` → `com.jamasads.app`
  - Package Kotlin: `com.utubeorigin.app` → `com.jamasads.app`
  - `app_name` (strings.xml): "UtubeOrigin" → "JamasADS"
  - Theme: `Theme.UtubeOrigin` → `Theme.JamasADS`
  - TAG Config: "UtubeOrigin" → "JamasADS"
  - `rootProject.name`: "UtubeOrigin" → "JamasADS"
  - Settings dialog título: "UtubeOrigin" → "JamasADS"
- **Solución futura:** ninguna. El keystore de firma es el mismo; el `applicationId`
  nuevo implica que se instala como app nueva (no actualiza la anterior).

## ✅ INC-015 — Reproducción en segundo plano no funcionaba (video se pausaba)

- **Versión:** 2.0 → resuelta en 2.1
- **Síntoma:** el video se pausaba al salir de la app; la notificación aparecía
  pero gris/sin contenido, sin título del video, sin controles útiles.
- **Causa raíz (3):**
  1. El watchdog neutralizaba `visibilitychange` pero YouTube revisa
     `document.hidden` y `document.visibilityState` directamente en su código
     interno para pausar el video. Android actualiza esas propiedades cuando
     la app va a background.
  2. El watchdog solo llamaba a `JamasBridge.onPlaybackStateChanged` cuando el
     estado de reproducción *cambiaba* (de playing→paused o viceversa). Si el
     video ya estaba reproduciéndose al salir, la notificación nunca se
     actualizaba con el título/artisan real.
  3. La notificación no tenía subtítulo ni contenido descriptivo ("Reproduciendo
     en segundo plano"), solo mostraba "JamasADS" / "YouTube" por defecto.
- **Solución:**
  1. `watchdog.js`: sobreescribir `document.hidden` (→ `false`) y
     `document.visibilityState` (→ `"visible"`) con `Object.defineProperty`
     al inicio del bloque de segundo plano. YouTube ya no detecta que la
     pestaña está oculta.
  2. `watchdog.js`: `checkAndNotify` ahora llama a `JamasBridge` en CADA
     chequeo (cada 2s), no solo en cambios de estado. La notificación siempre
     refleja el estado real.
  3. `BackgroundMediaService`: `buildNotification` ahora usa `contentText =
     "Reproduciendo en segundo plano"` cuando `isPlaying=true`, y añade
     `setSubText("JamasADS")`.
  4. `MainActivity`: `detectAndReportPlaybackState` ignora `null` y strings
     vacíos antes de parsear el JSON.
- **Solución futura:** ninguna. Si YouTube cambiara a mecanismos de pausa
  diferentes (Web Audio API, Service Workers), habría que revisar.

## ✅ INC-016 — Reproducción en segundo plano: notificación sin datos, next/prev no funcionan

- **Versión:** 2.1 → resuelta en 2.2
- **Síntoma:** la notificación no mostraba el nombre del video, los botones
  siguiente/anterior no hacían nada, la reproducción se cortaba al salir.
- **Causa raíz (4):**
  1. Selectores CSS para título/canal incorrectos: `.title.ytd-watch-metadata
     yt-formatted-string` y `#channel-name yt-formatted-string a` no existen
     en YouTube mobile 2026 (la estructura DOM cambió).
  2. `document.hasFocus()` no estaba neutralizado: YouTube lo revisa además
     de `hidden` para pausar el video.
  3. Botones next/prev usaban `.ytp-next-button`/`.ytp-prev-button` que solo
     existen en el player desktop; en mobile no hay tales selectores.
  4. No se cargaba thumbnail del video en la notificación.
- **Solución:**
  1. `watchdog.js`: múltiples selectores alternativos para título (h1,
     yt-formatted-string, etc.), canal (a, yt-formatted-string, channel-name)
     y thumbnail (`meta[property="og:image"]`). Se agrega `document.hasFocus`
     override que retorna `true`.
  2. `MainActivity`: next/prev ahora usan la API del player de YouTube
     (`movie_player.nextVideo()`/`previousVideo()`) con fallback a selectores
     DOM más amplios (`button[aria-label="Next"]`).
  3. `BackgroundMediaService`: nuevo método `loadThumbnail(url)` que descarga
     la imagen del video en un hilo secundario y la muestra como `largeIcon`
     en la notificación. Se cachéa por URL para no re-descargar.
  4. `detectAndReportPlaybackState`: ahora extrae `thumbnail` del DOM y lo
     pasa al servicio junto con título/artista.
- **Solución futura:** ninguna.

## ✅ INC-017 — Video imposible de pausar al volver de segundo plano

- **Versión:** 2.2 → resuelta en 2.3
- **Síntoma:** al volver de la app en background, el video se pausaba y el
  watchdog lo forzaba a reproducir cada 2 segundos, haciendo imposible pausar.
- **Causa raíz:** `forcePlay()` en el watchdog se ejecutaba cada 2s sin
  distinción: si el video estaba pausado (por el usuario o por YouTube),
  siempre lo reanudaba.
- **Solución:** flag `window.__jamasBg` controlado desde Kotlin:
  - `onPause()` → `__jamasBg=true`
  - `onResume()` → `__jamasBg=false`
  - Watchdog solo fuerza play cuando `__jamasBg===true && __jamasUserPaused===false`.
- **Solución futura:** ninguna.

## ✅ INC-018 — Thumbnail no aparece en notificación

- **Versión:** 2.3
- **Síntoma:** la notificación no muestra la miniatura del video.
- **Causa raíz:** `meta[property="og:image"]` no existe en m.youtube.com.
- **Solución:** thumbnail se construye desde el video ID de la URL:
  `https://i.ytimg.com/vi/{VIDEO_ID}/hqdefault.jpg`. Más confiable.
- **Solución futura:** ninguna.
  - `onPause()` → `window.__jamasBg=true` (app en background)
  - `onResume()` → `window.__jamasBg=false` (app en foreground)
  - El watchdog solo ejecuta `forcePlay()` cuando `__jamasBg===true`. En
    foreground, el pause del usuario se respeta.
- **Solución futura:** ninguna.

## ✅ INC-019 — Barra de progreso no aparece en la notificación

- **Versión:** 2.4
- **Síntoma:** la notificación muestra `00:00 ─── 00:00` sin progreso; no se
  puede adelantar/retroceder desde la barra.
- **Causa raíz:** `PlaybackStateCompat` se construía con
  `PLAYBACK_POSITION_UNKNOWN` y sin duración. Android no tiene datos para
  dibujar la barra ni aceptar seeks.
- **Solución:**
  1. `watchdog.js` extrae `v.currentTime` y `v.duration` (en ms) y los envía
     junto con el payload `onPlaybackStateChanged`.
  2. `BackgroundMediaService` almacena `currentPosition` y `currentDuration`.
  3. `PlaybackStateCompat.Builder.setState()` usa esos valores reales.
  4. Se agrega `ACTION_SEEK_TO` al MediaSession; `onSeekTo` llama a
     `handleMediaAction("seek:$pos")`, que ejecuta `v.currentTime = pos/1000`
     en el WebView.
- **Solución futura:** ninguna.

## ✅ INC-020 — Al bloquear el celular el video se pausa y no se puede reanudar

- **Versión:** 2.4
- **Síntoma:** al bloquear la pantalla, el video se detiene. Al desbloquear,
  el video queda en pausa y no responde a controles.
- **Causa raíz:** al bloquear, Android pausa el Activity → `onPause()` setea
  `__jamasBg=true`. Al desbloquear, `onResume()` setea `__jamasBg=false` y
  llama `webView.onResume()`, pero el `<video>` queda en estado paused. El
  watchdog NO fuerza play porque `__jamasBg=false` (app en foreground).
- **Solución:** en `onResume()`, si el servicio indica que la reproducción
  debería estar activa (`backgroundService.isPlaying == true`), se ejecuta
  `v.play().catch(...)` directamente para reanudar el video.
- **Solución futura:** ninguna.

## ✅ INC-021 — OOM crash en compilación de filtros del bloqueador

- **Versión:** 2.5
- **Síntoma:** `java.lang.OutOfMemoryError` durante `FilterCompiler.parseRule`.
  La app crashea al iniciar o al actualizar listas de anuncios.
- **Causa raíz:** `opts?.split(',')` se llamaba 5 veces por cada regla (líneas
  81, 91, 96, 102, 107) creando listas intermedias temporales. Con ~500K reglas,
  se generaban millones de objetos String temporales que agotaban el heap de 256 MB.
- **Solución:** reescritura completa de la sección de parsing de opciones:
  se parsea `opts` UNA sola vez con un bucle while sobre los separadores `,`
  y se extraen todos los flags en una pasada. Se eliminan todas las llamadas
  a `split()` redundantes.
- **Solución futura:** ninguna.

## ✅ INC-022 — Video se pausa al bloquear la pantalla y no reanuda

- **Versión:** 2.5
- **Síntoma:** al bloquear el celular, el video se detiene. Al desbloquear,
  el video queda en pausa.
- **Causa raíz:** cuando Android bloquea la pantalla, el Activity ejecuta
  `onPause()` → `__jamasBg=true`. Aunque el watchdog fuerza play, Chromium
  suspende la ejecución de JavaScript cuando la ventana no es visible.
  El watchdog deja de correr y el video se queda en pausa.
- **Solución (3 capas):**
  1. `MediaWebView`: WebView customizado que sobreescribe
     `onWindowVisibilityChanged` forzando `VISIBLE`. Esto le dice a Chromium
     que la vista sigue activa y NO suspender JS. (Algunas versiones de Android
     ignoran esto, por eso se necesitan las siguientes capas).
  2. `bgKeepAliveRunnable`: un Runnable en el hilo principal de Kotlin que
     ejecuta `v.play()` cada 3 segundos mientras `isPlaying==true` y
     `__jamasUserPaused==false`. Corre desde Kotlin, NO depende de JS de
     Chromium.
  3. `onResume()`: al desbloquear, si el servicio indica que debería estar
     reproduciendo, fuerza `v.play()` inmediatamente.
- **Solución futura:** ninguna.

## ✅ INC-023 — Logo viejo aparece después de actualizar

- **Versión:** 2.5
- **Síntoma:** después de instalar una actualización, el launcher muestra
  el icono viejo (escudo rojo/azul) en vez del nuevo (chica con radio).
- **Causa raíz:** (1) No existía `ic_launcher_round` → los launchers de
  Android usaban una versión cacheada del icono anterior. (2) No existía
  atributo `android:roundIcon` en el manifest. (3) El archivo
  `ic_launcher_backup.xml` (vector del logo viejo) seguía en drawable/.
- **Solución:**
  1. Generados `ic_launcher_round.png` circulares (misma imagen, 50% radius)
     para todas las densidades.
  2. Agregado `android:roundIcon="@mipmap/ic_launcher_round"` al manifest.
  3. Eliminado `drawable/ic_launcher_backup.xml` (logo viejo).
- **Solución futura:** ninguna.

## ✅ INC-024 — OOM en cascada al morir el renderer + OOM en compilación de filtros

- **Versión:** 2.6
- **Síntoma:** (1) Renderer de Chromium muere → Activity se destruye → OOM en
  `Log.printlns`. (2) Al filtrar `PathRule`, `UrlRegexRule` y `AnchoredRegexRule`,
  `Pattern.compile()` agota memoria y crashea la compilación completa.
- **Causa raíz:** 2 problemas encadenados:
  1. **Crash en cascada:** cuando el renderer muere, `CrashCatcher` y `Log.e`
     intentan construir strings enormes con stack traces. El heap ya está al
     límite → OOM secundario que impide el recovery.
  2. **Compilación de regex sin OOM-safe:** `PathRule`, `UrlRegexRule` y
     `AnchoredRegexRule` ejecutan `Pattern.compile()` sin catch de
     `OutOfMemoryError`. Si el heap está bajo, una sola regex falla y crashea
     toda la compilación del bloqueador.
- **Solución:**
  1. `YtWebViewClient.onRenderProcessGone`: log mínimo, sin stack trace.
  2. `recreateWebView`: doble `System.gc()` con sleep entre ellos.
  3. `CrashCatcher.saveCrash`: fallback OOM-safe si `getStackTraceString` falla.
  4. `memoryMonitorRunnable`: GC proactivo si heap > 85%.
  5. **PathRule, UrlRegexRule, AnchoredRegexRule:** `Pattern.compile` envuelto
     en `try/catch(OutOfMemoryError)` que devuelve un pattern inofensivo en vez
     de crashear.
  6. `FilterCompiler.parseHostRule`: `Pattern.compile` también con OOM catch.
   7. `FilterCompiler.parseRule`: regex inline (`/…/`) con OOM catch.
- **Solución futura:** ninguna.

---

## ✅ INC-025 — Startup lento: pantalla negra 10 segundos + optimización de carga

- **Versión:** 2.7
- **Síntoma:** Al abrir la app, pantalla negra durante ~10 segundos antes de
  ver YouTube. El usuario no sabe si la app colgó o está cargando.
- **Causa raíz:** Múltiples factores:
  1. `watchdog.js` (~14KB) se leía desde assets en CADA carga de página
     (2 veces: `onPageStarted` + `onPageCommitVisible`).
  2. CSS escape se recalculaba en cada navegación.
  3. Handlers (`urlWatcher`, `playbackWatcher`) y servicio se iniciaban
     inmediatamente, compitiendo por CPU con la carga de YouTube.
  4. No había indicación visual de carga (solo pantalla negra).
- **Solución:**
  1. **watchdog.js cacheado** en `companion object` de `YtWebViewClient`
     (se lee 1 vez, se reutiliza).
  2. **CSS escape cacheado** (`cachedEscapedCss`).
  3. **Handlers diferidos**: `urlWatcher` a los 3s, `playbackWatcher` a los
     5s, servicio a los 2s.
  4. **Splash screen**: logo de JamasADS centrado en fondo negro via
     `drawable/splash_background.xml` + theme `windowBackground`. Se muestra
     desde el instante 0 (antes de `onCreate`).
  5. **Botón "Compartir"** agregado al diálogo de crash (share intent).
- **Solución futura:** considerar AndroidX SplashScreen API para control
  más fino del splash (icono animado, duration, etc.).

---

## ✅ INC-026 — El app se trababa/frenaba al ver videos/shorts (jank)

- **Versión:** 2.7 → resuelta en 2.8
- **Síntoma:** el app se sentía lenta o se congelaba momentáneamente al ver
  videos o shorts. Choreographer reportaba "Skipped 86 frames!" (~1.4s de
  congelamiento). El GC tardaba 1.4 segundos y el heap estaba al 95%.
- **Causa raíz:** Múltiples operaciones pesadas en el main thread simultáneamente:
  1. `watchdog.js` ejecutaba `nuke()` (querySelectorAll con 30+ selectores sobre
     todo el DOM de YouTube) cada **350ms** — ~3 veces por segundo.
  2. `playbackWatcher` (Kotlin) ejecutaba `detectAndReportPlaybackState()` cada
     **2s**, haciendo la misma query que el watchdog ya reportaba vía JamasBridge
     (duplicación de trabajo).
  3. `memoryMonitorRunnable` forzaba `System.gc()` cada **10s** cuando el heap
     superaba el 85% — el GC tardaba 1.4s y bloqueaba el main thread.
  4. `pruneAds()` era recursivo sin límite de profundidad — en JSONs grandes de
     YouTube podía recorrer miles de nodos.
  5. `pruneGlobals()` se ejecutaba cada 2s re-podando los mismos objetos.
  6. `urlWatcher` (500ms) y `bgKeepAliveRunnable` (3s) contribuían a la carga.
- **Solución:**
  1. **`nuke()` intervalo**: 350ms → 2000ms (5.7x menos carga DOM).
  2. **`pruneAds()` profundidad**: límite de 12 niveles (evita recursión profunda).
  3. **`pruneGlobals()` flag**: `globalsPruned` evita re-podar en cada llamada.
  4. **`playbackWatcher`**: 2s → 5s (el watchdog ya reporta vía bridge cada 2s).
  5. **`memoryMonitorRunnable`**: 10s → 30s (reduce GC forzado).
  6. **`urlWatcher`**: 500ms → 1000ms.
  7. **`bgKeepAliveRunnable`**: 3s → 5s.
- **Resultado en dispositivo real:**
  - Dalvik Heap: 95% (248MB/256MB) → 86% (129MB/150MB)
  - Frames skipped: 86 (~1.4s) → 0
  - GC forzado: cada 10s con pausa 1.4s → natural, sin forzar
  - Errores: warnings OOM → 0
- **Solución futura:** considerar un watchdog rotativo (dividir los selectores
  de nuke en batches que se alternen cada N segundos para reducir aún más la
  carga por ciclo).

---

## Dudas abiertas / ideas futuras

- ¿Interceptar también el `player/ad_break` y devolver respuestas "vacías" reales
  (en vez de dejarlas pasar)? Hoy están excepcionados y el json-prune hace el
  trabajo; solo se tocaría si YouTube vuelve a negar reproducción.
- La mini-burbuja no soporta gestos de la app nativa (pausar/adelantar a
  pantalla completa solo por botones). Si el usuario lo pide, se pueden añadir
  controles en la burbuja (▶/⏸, barra de progreso).
- El watchdog se podría dividir en módulos probables con node (hoy se valida
  solo con `node --check`). Si el proyecto crece, montar un runner de tests JS.