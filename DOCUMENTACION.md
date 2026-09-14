# JamasADS — Documentación completa

> YouTube sin anuncios, tan fluido y cómodo como la app nativa.
> Motor de bloqueo basado en listas reales de **uBlock Origin** (EasyList, EasyPrivacy, uBlock Filters, quick-fixes).

---

## Índice

1. [Qué es UtubeOrigin](#1-qué-es-utubeorigin)
2. [Cómo funciona](#2-cómo-funciona)
3. [Requisitos del entorno de desarrollo](#3-requisitos-del-entorno-de-desarrollo)
4. [Estructura del proyecto](#4-estructura-del-proyecto)
5. [Cómo compilar el APK](#5-cómo-compilar-el-apk)
6. [Cómo instalar en tu teléfono](#6-cómo-instalar-en-tu-teléfono)
7. [Cómo se actualizan las listas de filtros](#7-cómo-se-actualizan-las-listas-de-filtros)
8. [Solución de problemas (crashes)](#8-solución-de-problemas-crashes)
9. [Pruebas automatizadas](#9-pruebas-automatizadas)
10. [Historial de versiones](#10-historial-de-versiones)
11. [Limitaciones conocidas](#11-limitaciones-conocidas)

---

## 1. Qué es JamasADS

**JamasADS** es una aplicación Android que ofrece YouTube (la versión web móvil, `m.youtube.com`, que es una PWA con navegación nativa) dentro de un **WebView**, con un bloqueador de anuncios integrado inspirado en **uBlock Origin**.

Características:

- ✅ YouTube completo: inicio, Shorts, suscripciones, búsqueda, reproducción, comentarios, subir vídeos (selector de archivos).
- ✅ Bloqueo de anuncios en **3 capas** (ver [Cómo funciona](#2-cómo-funciona)).
- ✅ Pantalla completa real de vídeo (sin barra de estado/navegación).
- ✅ Tema oscuro, fondo negro, reproducción sin gesto previo.
- ✅ Botón flotante **⚙** con panel de ajustes.
- ✅ Actualización de las listas de filtros **desde internet** en un toque.
- ✅ No requiere `root`, ni servicios de Google, ni cuentas (puedes iniciar sesión en YouTube si quieres).
- ✅ **Reproducción en segundo plano** con notificación interactiva (pausar, siguiente, anterior).
- ✅ **Controles de medios** en la barra de notificaciones con MediaSession.

---

## 2. Cómo funciona

La app carga YouTube en un `WebView` y aplica el bloqueo en tres capas:

### Capa 1 — Bloqueo de red (como uBlock)

En `shouldInterceptRequest`, cada petición de red (imágenes, scripts, media…) se comprueba contra las **reglas de red** compiladas:

- Hosts bloqueados: `||googleads.g.doubleclick.net^`, `||pagead2.googlesyndication.com^`, etc.
- Reglas host + ruta: `||example.com/ads/*`.
- Reglas regex: `/\.googlevideo\.com\/videoplayback\?expire=…/`.
- Excepciones `@@…` se comprueban **antes** que los bloqueos.
- Opciones compatibles: `$domain=`, `$from=`, `$third-party`/`3p`, `$important`, `$document`, `$denyallow`.

Si coincide, se devuelve una respuesta vacía (`text/plain`) y el anuncio nunca se descarga. La petición al vídeo real (`*.googlevideo.com`) **no se bloquea**, para no romper la reproducción.

**Anti-adblock de YouTube (2026):** el reproductor espera de forma **síncrona** ciertos endpoints de anuncios (`youtubei/v1/player/ad_break`, `get_midroll_`, `static.doubleclick.net/instream/ad_status.js`). Si se devuelven vacíos (bloqueados), YouTube **niega la reproducción** y los vídeos no cargan (esto es lo que pasaba con el bloqueador activado). Por eso esos endpoints están **excepcionados** en `youtube.txt`: se dejan responder normal para que el player no falle, y la publicidad se elimina en la Capa 3 (json-prune + CSS + salto automático). Los anuncios de TV/embebidos (`initplayback?c=TVHTML5&oad=`) sí se siguen bloqueando (no afectan a `m.youtube.com`). Además (v1.8), la petición al player se **pide sin anuncios** (ver Capa 3), de modo que YouTube ni siquiera los programa y no aplica su "backoff".

Código: `app/src/main/java/com/utubeorigin/app/adblock/AdBlocker.kt`.

### Capa 2 — Filtros cosméticos (CSS)

Se inyecta un `<style>` con las reglas cosméticas compiladas (ej. `ytd-ad-slot-renderer{display:none!important}`, `.ytp-ad-module{display:none!important}`), que ocultan todos los contenedores de anuncios de la interfaz de YouTube (feed, recomendados, masthead, overlays del reproductor…).

### Capa 3 — Watchdog JavaScript

`app/src/main/assets/js/watchdog.js` se inyecta en cada página (se intenta inyectar ya en `onPageStarted` para que el json-prune esté activo antes de las llamadas a la API) y:

- **json-prune**: parchea `JSON.parse`, `fetch` y respuestas JSON para **eliminar los datos de anuncios** de las respuestas de la API (`adPlacements`, `adSlots`, `playerAds`, `adBreakHeartbeatParams`, `adBreakEndpoint`). Así el reproductor nunca programa publicidad, sin bloquear ninguna petición (misma estrategia que el json-prune de uBlock Origin).
- **`isInlinePlaybackNoAd` (v1.8)**: parchea también `fetch` y `XMLHttpRequest` para que las peticiones **salientes** a `youtubei/v1/player` (y `get_watch`, `reel_watch_sequence`) lleven `"isInlinePlaybackNoAd":true` dentro de `contentPlaybackContext` del cuerpo. Así InnerTube sirve la reproducción **sin anuncios y sin "backoff"** (el retraso que añade al vídeo cuando no se reproduce el anuncio programado y que congelaba la reproducción). Es exactamente la estrategia de uBlock Origin. `WebResourceRequest` no expone el cuerpo del POST, por eso esto se hace en JS y no en `shouldInterceptRequest`.
- Elimina de forma proactiva los nodos de anuncios (incluidos los que aparecen tras una navegación SPA).
- **Salta automáticamente los anuncios de vídeo** dentro del reproductor: si detecta `ad-showing`, lleva el vídeo al final, pulsa el botón "Saltar" y elimina los overlays.
- **Reproducción en segundo plano**: neutraliza los listeners `visibilitychange` que registre la página y fuerza el `play` si el vídeo se pausa, para seguir oyendo música con la app en segundo plano o en la mini-burbuja.

El bloqueo del **anuncio de vídeo en el reproductor** se hace aquí (y con la regla de `expire=` de uBlock), no bloqueando `googlevideo.com`, lo que evita el aviso de "bloqueador detectado" de YouTube.

### Formato de listas

Las listas se compilan al primer arranque (o al pulsar "Actualizar") con el compilador de `AdBlocker.kt`, que soporta la sintaxis Adblock Plus / uBlock Origin. El resultado se **cachea** en `filesDir/adblock/` para arranques instantáneos.

---

## 3. Requisitos del entorno de desarrollo

| Componente | Versión |
|---|---|
| JDK | 17 (Temurin/Adoptium) |
| Android SDK | compileSdk 35, build-tools 35.0.0, minSdk 24 |
| Gradle | 8.13 |
| Android Gradle Plugin | 8.7.3 |
| Kotlin | 2.0.21 |
| Sistema operativo usado | Fedora 44 (KDE) |

En esta máquina el entorno quedó instalado en:

- JDK 17: `/home/linius/android-dev/jdk17`
- SDK Android: `/home/linius/android-dev/sdk`
- Gradle: `/home/linius/android-dev/gradle-8.13`

Variables necesarias para compilar:

```bash
export JAVA_HOME=/home/linius/android-dev/jdk17
export ANDROID_HOME=/home/linius/android-dev/sdk
```

---

## 4. Estructura del proyecto

```
UtubeOrigins/
├── settings.gradle.kts          # config de Gradle + módulos
├── build.gradle.kts             # plugins (AGP 8.7.3, Kotlin 2.0.21)
├── gradle.properties            # memoria de Gradle, AndroidX
├── local.properties             # sdk.dir (no subir a git)
├── signing.properties           # credenciales de firma (no subir a git)
├── keystore/utubeorigin.jks     # keystore de firma del APK
├── UtubeOrigin-v1.9.apk         # APK final firmado y listo para instalar
├── app/
│   ├── build.gradle.kts         # config de la app (compilación, firma, tests)
│   ├── proguard-rules.pro
│   └── src/
│       ├── main/
│       │   ├── AndroidManifest.xml
│       │   ├── assets/
│       │   │   ├── filters/     # listas de filtros (EasyList, EasyPrivacy, uBlock, quick-fixes, youtube.txt)
│       │   │   └── js/watchdog.js
│       │   ├── java/com/utubeorigin/app/
│       │   │   ├── Config.kt               # constantes globales (UA, URLs)
│       │   │   ├── MainActivity.kt         # UI, WebView, pantalla completa, ajustes, diálogo de crash, mini-burbuja in-app, fondo
│       │   │   ├── CrashCatcher.kt         # captura crashes y muestra el log en un diálogo
│       │   │   ├── adblock/Filter.kt       # modelo + matcher + autómatas Aho-Corasick + caché
│       │   │   ├── adblock/FilterCompiler.kt  # parser ABP/uBlock (red + cosmético)
│       │   │   ├── adblock/AdBlocker.kt    # gestor: init, actualización online, stats
│       │   │   └── web/YtWebViewClient.kt  # intercepción de red, inyección JS, renderer crash
│       │   └── res/             # temas, strings, icono
│       └── test/java/.../FilterCompilerTest.kt  # 12 tests del motor de bloqueo
└── tools/                       # utilidades (vacío por ahora)
```

---

## 5. Cómo compilar el APK

```bash
cd /home/linius/Programador/Programas Personales Mios/UtubeOrigins
export JAVA_HOME=/home/linius/android-dev/jdk17
export ANDROID_HOME=/home/linius/android-dev/sdk

# Tests + lint + APK release firmado
./gradlew :app:testReleaseUnitTest :app:lintRelease assembleRelease
```

Salidas:

- APK firmado: `app/build/outputs/apk/release/app-release.apk`
- Copia cómoda: `JamasADS-v2.0.apk` (en la raíz)

Verificar la firma:

```bash
/home/linius/android-dev/sdk/build-tools/35.0.0/apksigner verify --print-certs app/build/outputs/apk/release/app-release.apk
```

> Si creas el proyecto en otra máquina, genera un keystore nuevo:
> ```bash
> keytool -genkeypair -v -keystore keystore/utubeorigin.jks -alias utubeorigin \
>   -keyalg RSA -keysize 2048 -validity 10000
> ```
> y rellena `signing.properties`.

---

## 6. Cómo instalar en tu teléfono

1. Copia `JamasADS-v2.0.apk` al móvil (USB, nube, etc.).
2. Abre el archivo con el gestor de archivos.
3. Si Android lo pide, permite "instalar apps desconocidas" para el gestor.
4. Instala y abre **JamasADS**.

Opcional: inicia sesión en YouTube desde la app (icono de perfil) para sincronizar suscripciones, historial y la biblioteca. Es una sesión normal de youtube.com.

---

## 7. Cómo se actualizan las listas de filtros

Las listas **viajan dentro del APK** (carpeta `assets/filters/`), así que funcionan sin conexión desde el primer arranque.

Para actualizarlas sin recompilar:

1. Abre el panel **⚙**.
2. Pulsa **"Actualizar listas de filtros"**.
3. La app descarga las últimas versiones de:
   - EasyList: `https://easylist.to/easylist/easylist.txt`
   - EasyPrivacy: `https://easylist.to/easylist/easyprivacy.txt`
   - uBlock Filters: `https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt`
   - quick-fixes: `https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/quick-fixes.txt`
4. Recompila las reglas en el dispositivo y las cachea.

Para actualizar las listas **empaquetadas** en el APK (en desarrollo):

```bash
curl -sL -o app/src/main/assets/filters/easylist.txt https://easylist.to/easylist/easylist.txt
curl -sL -o app/src/main/assets/filters/easyprivacy.txt https://easylist.to/easylist/easyprivacy.txt
curl -sL -o app/src/main/assets/filters/ublock-filters.txt https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt
curl -sL -o app/src/main/assets/filters/quick-fixes.txt https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/quick-fixes.txt
```

El archivo `youtube.txt` contiene filtros **curados específicos de YouTube** y no se descarga (siempre se usa el empaquetado).

---

## 8. Solución de problemas (crashes)

### 8.1 Qué se arregló en la v1.1 (causas del crash)

La v1.0 podía cerrarse de golpe por estas causas, todas corregidas:

1. **Muerte del renderizador de WebView** (`onRenderProcessGone`): si el renderer de WebView moría (pesado con YouTube + inyección de JS), Android **mataba la app completa**. Ahora se intercepta y se **recrea la WebView automáticamente** recargando la página. → `YtWebViewClient.kt` + `MainActivity.recreateWebView()`.
2. **Callbacks sobre WebView destruida**: `injectScripts` / `showErrorPage` podían ejecutarse después de `onDestroy`, lanzando `IllegalStateException`. Ahora se comprueba `isAttachedToWindow` y se captura cualquier excepción. → `YtWebViewClient.kt`.
3. **Hilos que capturaban solo `Exception`**: si la compilación de filtros lanzaba un `Error` (p. ej. OOM), el hilo en segundo plano hacía caer la app. Ahora se captura `Throwable`. → `AdBlocker.kt`.
4. **Back predictivo (Android 13+)**: con `targetSdk 35`, `onBackPressed()` ya no se invoca. Se registra un `OnBackInvokedCallback` y se activa `android:enableOnBackInvokedCallback="true"`. → `MainActivity.setupBackHandling()`.
5. **Atributo de tema de API 27+** en el tema base (`windowLayoutInDisplayCutoutMode`), retirado del tema para compatibilidad total.

### 8.2 Cómo diagnosticar un crash futuro

La app guarda automáticamente la traza de cualquier crash en:

```
Android/data/com.utubeorigin.app/files/crashes/crash_YYYYMMDD_HHMMSS.txt
```

En el siguiente arranque se muestra un **diálogo con el log completo** (se puede **copiar** con un botón) y el log se borra después de mostrarse, para no avisar dos veces del mismo fallo. Si vuelves a ver un crash, usa el botón "Copiar log" y envía el texto al desarrollador.

### 8.4 Qué se corrigió en la v1.2

Además de los arreglos de la v1.1, la v1.2 encontró y corrigió **tres bugs reales del motor de bloqueo** (detectados por los nuevos tests):

1. **Separador host/ruta**: el compilador de reglas `||host/path` usaba `.` en vez de `/`, por lo que las reglas de host+ruta **nunca matcheaban** (p. ej. el bloqueo de `googlevideo.com/initplayback?...` que usan los anuncios de vídeo de uBlock).
2. **Comodines `*` en la ruta**: con `Regex.escape` de Kotlin moderno, `*` se escapaba como `\Q…\E` y el reemplazo por `.*` no funcionaba. Se implementó un escapado propio y las rutas ahora convierten `*` → `.*`. Resultado: los anuncios de vídeo (`initplayback?c=TVHTML5&oad`) se bloquean y **la reproducción normal nunca**.
3. **`$third-party` mal calculado**: `analytics.youtube.com` dentro de `m.youtube.com` se consideraba terceros (se bloqueaba). Ahora se compara por **dominio registrable** (`youtube.com`), como hace uBlock.

También se **optimizó el matcher** con autómatas **Aho-Corasick** para las ~31.000 subcadenas y un índice por ancla literal para las ~2.800 reglas regex: **4× más rápido** (0,84 ms → 0,18 ms por petición), verificado con un test de benchmark.

### 8.5 La causa raíz del crash (encontrada con el log real)

El diálogo de crash permitió ver el log real de la v1.2:

```
java.lang.Throwable: A WebView method was called on thread 'ThreadPoolForeg'.
All WebView methods must be called on the same thread.
at android.webkit.WebView.checkThread(WebView.java:2672)
at android.webkit.WebView.getUrl(WebView.java:1275)
```

**Por qué ocurría:** `WebViewClient.shouldInterceptRequest()` se ejecuta en un **hilo de red en segundo plano** (no el principal). El código llamaba `view.url` dentro de ese método, y `WebView.getUrl()` **solo puede invocarse desde el hilo principal**; en Android moderno lanza una excepción y la app cae.

**Solución (v1.3):** en `YtWebViewClient` ya **no se toca la WebView desde el hilo de red**. La URL de la página se cachea en `currentPageUrl` (variable `@Volatile`) desde `onPageStarted`/`onPageCommitVisible` (hilo principal) y `shouldInterceptRequest` la lee de ahí. Además, el callback queda **blindado con try/catch**: si algo falla, la petición se deja pasar y la app nunca cae.

### 8.6 Los vídeos largos no se reproducían (carga infinita) — v1.6

Dos problemas que dejaban la reproducción colgada y la UI mal colocada:

1. **Reglas `$replace=` compiladas como bloqueos.** En las listas de uBlock, reglas como `||youtube.com/youtubei/v1/get_watch?$xhr,1p,replace=/"adPlacements"/"no_ads"/` NO bloquean la petición: la **reescriben** en el aire (quitan `adPlacements`/`adSlots` del JSON para no mostrar anuncios). El compilador las trataba como bloqueos normales, así que `youtubei/v1/get_watch` (y `player` en www.youtube.com) quedaban bloqueados → la página de reproducción esperaba esa respuesta y se quedaba en **carga infinita sin vídeo**. **Solución:** se descartan las reglas con opciones `replace=`, `csp=`, `removeparam` y `badfilter` (no son bloqueos) y se añadieron excepciones `@@` en `youtube.txt` que garantizan que los endpoints esenciales de la API (`player?`, `next?`, `browse?`, `get_watch?`, `search?`, `reel/reel_watch_sequence?`) nunca se bloqueen. Los patrones terminan en `?` a propósito para **no** desproteger los endpoints de anuncios (`/player/ad_break`, `/get_midroll_`), que siguen bloqueándose.

2. **Contenido bajo las barras del sistema (edge-to-edge).** En Android 15+ el modo edge-to-edge es obligatorio para apps con `targetSdk 35`, y el contenido de la WebView se dibujaba **debajo** de la barra de notificaciones (el logotipo y el buscador de YouTube chocaban con la barra superior) y debajo de la barra de navegación (en los Shorts, el tiempo/descripción quedaban tras los botones del menú del móvil). **Solución:** un `OnApplyWindowInsetsListener` en la raíz aplica como padding la altura real de las barras del sistema (`systemWindowInsetTop/Bottom/Left/Right`), con API del framework (sin dependencias). Al entrar en pantalla completa de vídeo (`onShowCustomView`) las barras se ocultan, los insets pasan a 0 y la WebView vuelve a ser 100% pantalla. → `MainActivity.setupInsets()`.

### 8.7 Los vídeos no cargaban con el bloqueador activado — v1.7

Aunque el bloqueador estuviera **desactivado** no se veían anuncios (la capa cosmética + watchdog actúan siempre), pero al **activarlo** los vídeos normales dejaban de cargar. Causa: el **anti-adblock de YouTube (2026)**.

1. **El reproductor espera los endpoints de anuncios de forma síncrona.** Cuando toca publicidad, el player llama a `youtubei/v1/player/ad_break`, `get_midroll_*` y `static.doubleclick.net/instream/ad_status.js` y **necesita que respondan**. Las listas de EasyList/uBlock los bloqueaban (respuesta vacía) → el reproductor fallaba y YouTube negaba la reproducción del vídeo principal. **Solución:** se añadieron excepciones `@@` en `youtube.txt` para esos endpoints (y para `pagead/ads`, `pagead/id` y el legacy `get_video`), de modo que el player nunca recibe una respuesta vacía. Siguen bloqueándose los anuncios de TV/embebidos (`initplayback?c=TVHTML5&oad=`), `adsbygoogle.js` y la analítica.

2. **La publicidad ya no se bloquea en red, se elimina de la respuesta.** Se añadió un **json-prune** al watchdog (parchea `JSON.parse`, `fetch` y respuestas JSON): al llegar la respuesta de la API (`/player`, `/next`, `/browse`) se eliminan `adPlacements`, `adSlots`, `playerAds`, `adBreakHeartbeatParams` y `adBreakEndpoint` **antes** de que el reproductor los procese, así nunca programa anuncios. Es la misma estrategia que el `json-prune` de uBlock Origin (por eso ya no hace falta bloquear esas URLs). El watchdog se inyecta lo antes posible (`onPageStarted`) para que el parche esté activo antes de las llamadas a la API.

Resultado: con el bloqueador **ON** los vídeos cargan igual que con OFF y **sin anuncios visibles** (la publicidad se elimina de la respuesta o, si llega a aparecer, se oculta y salta automáticamente).

### 8.8 El vídeo se quedaba "cargando" tras un anuncio (o con el bloqueador ON) — v1.8

Reporte del usuario: con el bloqueador **ON** los vídeos no reproducían; con **OFF** reproducían, pero cuando aparecía un anuncio este se ocultaba y el vídeo **se quedaba colgado sin cargar hasta recargar la página**. Investigación (formato Firefox + uBlock Origin, que sí funcionan):

1. **Causa raíz: el "backoff" de YouTube (2026).** Cuando la petición `/player` trae anuncios y estos **no llegan a reproducirse** (bloqueados u ocultados), InnerTube añade al vídeo principal un retraso equivalente a ~80 % de la duración del anuncio. El reproductor espera ese stream con retraso → el vídeo aparece "cargando" para siempre. Con el bloqueador ON además se bloqueaban endpoints (v1.7 ya lo arregló), pero el backoff seguía ocurriendo cuando se ocultaba un anuncio con OFF.
2. **Solución: pedir la reproducción SIN anuncios (`isInlinePlaybackNoAd`).** El watchdog ahora parchea `fetch` y `XMLHttpRequest` y añade `"isInlinePlaybackNoAd":true` al `contentPlaybackContext` del **cuerpo** de toda petición a `youtubei/v1/player` (y `get_watch`, `reel_watch_sequence`). Así el player llega **sin anuncios** desde el servidor: no hay que bloquear nada, no hay nada que ocultar y no hay backoff. Es la misma técnica que usa uBlock Origin (se confirmó revisando sus filtros `filters.min.txt` y los issues #24808/#7542 de uAssets).
3. **Por qué en JS y no en `shouldInterceptRequest`.** `WebResourceRequest` **no expone el cuerpo** de las peticiones POST, así que no se puede re-enviar un `/player` con el cuerpo modificado desde Kotlin. La inyección se hace en el watchdog (que ya ve el `body` de `fetch`/`XHR`).

Junto con esto se sustituyó el **PiP nativo del sistema** por una **mini-burbuja dentro de la app** (ver abajo): el PiP del sistema sacaba de la aplicación, el globo se bugeaba y no permitía reanudar; la burbuja propia (WebView embebida flotante con botones ✕ cerrar / ⤢ expandir, arrastrable) mantiene el sonido mientras navegas por la web y se controla desde la propia app.

También se corrigió la **barra inferior elevada**: el padding de insets inferior se aplica ahora **solo en Shorts** (donde el tiempo/descripción quedaban bajo la barra de navegación). En el resto de páginas la barra Inicio/Shorts/Cuenta de YouTube gestiona su propio margen y ya no queda levantada; el botón ⚙ se elevó para no taparla.

### 8.9 La barra de progreso/descripción de Shorts chocaba con los botones del sistema — v1.9 y 1.9.5

Reporte del usuario: en los Shorts la barra de progreso y la descripción quedaban **tan abajo que se superponían a los botones del sistema** (atrás/inicio/recientes) y no se podía adelantar/atrasar.

- **v1.9 (insuficiente):** el padding inferior de Shorts se re-aplicaba en `onMainFrameUrlChanged` (invocado en `onPageCommitVisible`) además de al recibir insets. Pero **entrar en Shorts desde el feed es una navegación SPA** (`history.pushState`, sin recargar la página): `onPageCommitVisible` y el listener de insets NO se disparan, así que el padding seguía a 0 y la barra de progreso quedaba bajo la barra de navegación.
- **v1.9.5 (definitiva):** se añade un **vigilador de URL** (un `Handler` que comprueba `webView.url` cada 500 ms en el hilo principal). Cuando el estado "es Shorts" cambia (aunque sea por navegación SPA) se re-aplica `applyInsetsPadding()`. Detección más permisiva (`/shorts` sin barra final) y el vigilador se detiene en `onDestroy`.

**Solución:** el padding se calcula en `applyInsetsPadding()`, que se llama: al recibir insets, en `onMainFrameUrlChanged` (cargas reales) y desde el vigilador de URL (navegación SPA). Al entrar en `/shorts/` la UI del reproductor sube; al salir vuelve a 0 (la barra Inicio/Shorts/Cuenta sigue sin quedar elevada).

### 8.3 La app no carga YouTube

- Comprueba conexión a internet.
- Si aparece "Sin conexión", pulsa **Reintentar**.
- En el panel **⚙** puedes recargar la página o volver al inicio.
- Si nada funciona, borra los datos de la app en Ajustes del sistema.

---

## 9. Pruebas automatizadas

El motor de bloqueo tiene 12 tests en `app/src/test/java/com/utubeorigin/app/adblock/FilterCompilerTest.kt`:

- Compila las listas reales sin fallar y rápido (< 5 s).
- No genera reglas degeneradas (hosts vacíos, regex `.*`) — guarda contra el bug crítico.
- Bloquea dominios de anuncios de Google (DoubleClick, AdSense).
- Bloquea los **anuncios de vídeo** (`googlevideo.com/initplayback?c=TVHTML5&oad`) pero **no** la reproducción normal (`videoplayback`, initplayback sin `oad`).
- **No** bloquea contenido legítimo: `youtube.com`, `googlevideo.com` (vídeo real), `i.ytimg.com`, y `analytics.youtube.com` dentro de `m.youtube.com` (mismo dominio registrable).
- **No bloquea los endpoints esenciales de la API** (`player`, `next`, `browse`, `get_watch`, `search`, `reel/reel_watch_sequence`), ni los **endpoints de anuncios que el player espera de forma síncrona** (`player/ad_break`, `get_midroll_`, `ad_status.js` — excepcionados para no romper la reproducción); pero **sí** sigue bloqueando los anuncios de TV/embebidos (`initplayback?c=TVHTML5&oad`) — guarda contra los bugs `$replace` (v1.6) y anti-adblock (v1.7).
- Genera el CSS cosmético correcto y **deduplica** selectores repetidos; **solo incluye reglas acotadas a youtube.com** y descarta los scriptlets `+js(...)` de uBlock (no son CSS) y dominios falsos positivos.
- Benchmark: 5.000 peticiones matcheadas en menos de 3,5 s (Aho-Corasick + índice por ancla).
- La caché de reglas sobrevive a un ciclo guardar→cargar (round-trip), incluidas las reglas TVHTML5.

Ejecutar:

```bash
./gradlew :app:testReleaseUnitTest
```

---

## 10. Historial de versiones

| Versión | Cambios |
|---|---|
| **1.0** | Primera versión funcional: WebView de YouTube + bloqueador en 3 capas, pantalla completa, ajustes ⚙, actualización de listas. |
| **1.1** | **Arreglos de estabilidad**: manejo de `onRenderProcessGone` (la app ya no muere si cae el renderer), guardas contra WebView destruida, captura de `Throwable` en hilos, back predictivo (Android 13+), escritura atómica de la caché, `CrashCatcher` para diagnosticar fallos futuros. |
| **1.2** | **Refactor profesional** del motor en 3 archivos (`Filter`, `FilterCompiler`, `AdBlocker`) + `Config`; corregidos 3 bugs reales (separador host/ruta, comodines `*` en rutas, `$third-party` por dominio registrable); bloqueo real de anuncios de vídeo (`initplayback` TVHTML5); matcher **4× más rápido** (Aho-Corasick + índice por ancla); 9 tests; **diálogo de crash** con log completo y botón "Copiar log"; pausa/reanudación de WebView y restauración de estado. |
| **1.3** | **Corrección del crash definitivo**: `shouldInterceptRequest` ya no llama a métodos de WebView desde el hilo de red (la causa raíz del log `getUrl` en `ThreadPoolForeg`); URL de página cacheada (`@Volatile`) y callback blindado con try/catch. |
| **1.4** | **Filas horizontales que no cargaban**: el `MutationObserver` del watchdog ejecutaba un `querySelectorAll` sobre todo el DOM en cada mutación de YouTube y saturaba el hilo principal (las listas virtuales mutan constantemente) → se retiró (el `setInterval` cubre los anuncios dinámicos). Además el CSS cosmético se redujo de 1,17 MB a ~10 KB (solo reglas acotadas a YouTube + reproductor; la app es solo-YouTube) → cargas mucho más rápidas. |
| **1.5** | **Pantalla negra**: las reglas procedurales `+js(...)` de uBlock (scriptlets de JavaScript, no CSS) se colaban como selectores CSS; una de ellas incrusta una función gigante con llaves `{}` que rompía el parseo del CSS y dejaba la página sin renderizar. Ahora se descartan y el filtro de dominio solo acepta `youtube.com` real (se eliminó un falso positivo tipo `nsfwyoutube.com##img[src*="data"]`). CSS final: ~3,5 KB. Además, protección contra el bucle de renderer caído: tras 3 crashes consecutivos se muestra una pantalla de recuperación con "Reintentar" (sin recarga automática en negro) y cada caída del renderer queda registrada en los logs de crash. |
| **1.6** | **Vídeos largos no reproducían (carga infinita)**: las reglas `$replace=` de uBlock (que MODIFICAN la respuesta, no la bloquean: quitan `adPlacements`/`adSlots` del JSON) se compilaban como BLOQUEOS. Así quedaba bloqueado `youtubei/v1/get_watch` (y `player` en www.youtube.com), justo lo que necesita la página de reproducción → carga infinita sin vídeo. Ahora se descartan (`replace=`, `csp=`, `removeparam`, `badfilter`) y se añadieron excepciones `@@` que protegen los endpoints esenciales de la API (`player`, `next`, `browse`, `get_watch`, `search`, `reel/reel_watch_sequence`), sin desproteger los de anuncios (`player/ad_break`, `get_midroll_`). **UI bajo las barras del sistema**: en Android 15+ (edge-to-edge obligatorio) el contenido se dibujaba debajo de la barra de notificaciones (logotipo/buscador chocando arriba) y de la barra de navegación (en Shorts, el tiempo/descripción bajo los botones del menú). Un listener de insets ahora "acolcha" la raíz con la altura real de las barras; al pasar a pantalla completa (vídeo) los insets se anulan y nada molesta. |
| **1.7** | **Los vídeos no cargaban con el bloqueador ON** (anti-adblock de YouTube 2026): el player espera de forma síncrona los endpoints de anuncios (`player/ad_break`, `get_midroll_`, `ad_status.js`); bloquearlos hacía que YouTube negase la reproducción. Se excepcionan en `youtube.txt` y se añade un **json-prune** al watchdog (parchea `JSON.parse`/`fetch` y elimina `adPlacements`, `adSlots`, `playerAds`… de las respuestas de la API) para que el player nunca programe anuncios. **Mini-burbuja (PiP)**: deslizar el vídeo hacia abajo abre el PiP nativo del sistema (`supportsPictureInPicture`, ratio 16:9) y sigue sonando; al salir del PiP el botón ⚙ se restaura. **Reproducción en segundo plano**: ya no se pausa la WebView al salir de la app. |
| **1.8** | **Vídeo "cargando" para siempre tras un anuncio** (y con el bloqueador ON): YouTube añade un **backoff** al vídeo principal cuando el anuncio programado no llega a reproducirse. El watchdog ahora **pide la reproducción sin anuncios** inyectando `isInlinePlaybackNoAd:true` en el `contentPlaybackContext` de las peticiones `youtubei/v1/player`/`get_watch`/`reel_watch_sequence` (parcheando `fetch` y `XHR`; mismo truco que uBlock Origin) y sigue podando la respuesta. **Mini-burbuja propia en vez del PiP del sistema** (el PiP nativo sacaba de la app y se bugeaba): deslizar el vídeo abajo abre una burbuja flotante dentro de la app (WebView embebida, arrastrable, con ✕ cerrar y ⤢ expandir, back cierra la burbuja). **Barra inferior**: el padding de insets inferior solo se aplica en Shorts; la barra Inicio/Shorts/Cuenta ya no queda elevada y el botón ⚙ subió para no taparla. |
| **1.9** | **La barra de progreso/descripción de Shorts quedaba bajo los botones del sistema** y no se podía adelantar/atrasar: el padding inferior de Shorts solo se aplicaba al arrancar (URL = inicio); al navegar a un Short el listener de insets no se re-disparaba y el padding quedaba a 0. Ahora el padding se re-aplica **cuando cambia la URL** (callback `onMainFrameUrlChanged` en `onPageCommitVisible`): al entrar en Shorts sube la UI del reproductor y al salir vuelve a 0. |
| **1.9.5** | **Fix definitivo del fix**: la v1.9 no bastó porque entrar en Shorts desde el feed es una **navegación SPA** (`pushState`, sin recargar), que no dispara ni `onPageCommitVisible` ni los insets. Se añade un **vigilador de URL** (Handler que lee `webView.url` cada 500 ms y re-aplica `applyInsetsPadding()` al cambiar el estado "es Shorts"). Detección más permisiva (`/shorts`) y el vigilador se detiene en `onDestroy`. |
| **2.0** | **Renombrado a JamasADS** + **Servicio en segundo plano con notificación interactiva**: nuevo `BackgroundMediaService` (foreground service con `mediaPlayback`) que mantiene la reproducción de audio/video aunque la app esté en background o la pantalla bloqueada. Notificación con controles de MediaSession (pausar/reproducir, siguiente, anterior, cerrar). Permisos: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `POST_NOTIFICATIONS`, `WAKE_LOCK`. Solicitud de permiso de notificaciones en Android 13+. WakeLock parcial para evitar que el sistema suspenda la CPU. Comunicación bidireccional: la notificación envía comandos al WebView (`play`/`pause`/`next`/`prev`) y el WebView reporta estado de reproducción al servicio. |
| **2.1** | **Fix reproducción en segundo plano**: YouTube pausaba el video al salir de la app a pesar de neutralizar `visibilitychange` (YouTube revisa `document.hidden` y `document.visibilityState` directamente). Ahora el watchdog **sobreescribe** esas propiedades para que siempre retornen `false`/`"visible"`. Además, la notificación ahora muestra "Reproduciendo en segundo plano" como subtítulo y se actualiza con el título/artisan real del video en cada chequeo (antes solo se actualizaba en cambios de estado). Mejor manejo de `detectAndReportPlaybackState` (ignora `null`, strings vacíos). |
| **2.2** | **Fix completo de reproducción en segundo plano**: (1) Selectores CSS corregidos para YouTube mobile 2026 — múltiples selectores alternativos para título, canal y thumbnail. (2) `document.hasFocus()` ahora retorna `true` (YouTube revisa esto además de `hidden`). (3) Botones siguiente/anterior ahora usan la API del player de YouTube (`movie_player.nextVideo()`/`previousVideo()`) en vez de selectores DOM que no existen en mobile. (4) **Thumbnail en la notificación**: descarga la imagen del video desde `og:image` y la muestra como `largeIcon` en la notificación + `METADATA_KEY_ALBUM_ART` en MediaSession. (5) WakeLock ahora dura 1 hora (antes 10 min). (6) Servicio limpiado: eliminados extras de `onStartCommand` redundantes. |
| **2.3** | **Logo animé + fix pause en foreground**: (1) Nuevo logo: ilustración de chica con radio vintage (Gemini), esquinas redondeadas 25% en todos los mipmap. (2) **Fix bug de pause**: el watchdog forzaba play cada 2s incluso cuando el usuario pausaba manualmente en la app. Ahora solo fuerza play cuando la app está en background (`window.__jamasBg` flag controlado por `onPause`/`onResume`). En foreground, el pause manual se respeta. |
| **2.4** | **Barra de progreso + fix pantalla bloqueada**: (1) La notificación ahora muestra barra de progreso real (`v.currentTime`/`v.duration` en ms) y permite seek desde la barra (`ACTION_SEEK_TO`). (2) Al bloquear/desbloquear la pantalla, el video se reanuda automáticamente si el servicio indica que debería estar reproduciendo. |
| **2.5** | **Crash OOM + fix screen lock real + fix logo**: (1) **FIX CRASH CRÍTICO**: `FilterCompiler.parseRule` hacía 5 llamadas a `split(',')` por regla (~500K reglas = ~2.5M listas temporales → OOM). Reescrito con parsing en una sola pasada. (2) **FIX SCREEN LOCK DEFINITIVO**: 3 capas de defensa — `MediaWebView` (fuerza visibility VISIBLE para Chromium), `bgKeepAliveRunnable` (Kotlin Handler ejecuta `v.play()` cada 3s), y `onResume()` con play inmediato. (3) **FIX LOGO**: generado `ic_launcher_round` para todas las densidades + `roundIcon` en manifest + eliminado vector viejo. |
| **2.6** | **Fix OOM en cascada + OOM-safe en compilación de filtros**: (1) Renderer crash: GC antes de recrear, logs sin stack trace. (2) `recreateWebView`: limpia callbacks, doble GC. (3) `CrashCatcher`: fallback OOM-safe. (4) Monitor de memoria al 85%. (5) `PathRule`, `UrlRegexRule`, `AnchoredRegexRule`: `Pattern.compile` con `catch(OutOfMemoryError)`. (6) `FilterCompiler.parseHostRule` y regex inline: OOM catch. |
| **2.7** | **Optimización de startup + splash screen + compartir crash log**: (1) **Splash screen**: logo de JamasADS centrado en fondo negro via theme `splash_background.xml` (se muestra desde el instante 0, antes de onCreate). (2) **watchdog.js cacheado** en memoria (se lee 1 vez de assets, no en cada carga). (3) **CSS escape cacheado** (se calcula 1 vez). (4) **Handlers diferidos**: `urlWatcher` a los 3s, `playbackWatcher` a los 5s, servicio a los 2s. (5) **Botón "Compartir"** en el diálogo de crash (share intent para WhatsApp/email/etc). |
| **3.0-alpha** | **UI nativa completa + fixes críticos**: (1) **Barra de navegación inferior nativa** con 4 tabs (Inicio, Shorts, Suscripciones, Biblioteca) estilo YouTube real. Se oculta en Shorts y fullscreen. (2) **Modo inmersivo permanente**: barras del sistema siempre ocultas, se re-ocultan cada 2 segundos. (3) **CSS glassmorphism completo**: header glass, controles del player con gradiente + backdrop-blur, barra de acciones (like/dislike/share) como glass pill, thumbnails redondeados, comentarios con hover sutil, scrollbar personalizada. (4) **Watchdog mejorado**: guard corregido (`__jamasWatchdog`), MutationObserver con cleanup, setInterval con cleanup, bloqueo de `focus()` en body. (5) **Fix XSS** en `showErrorPage()` (escape de HTML). (6) **Fix recreateWebView**: eliminado `Thread.sleep(100)` y doble `System.gc()`. (7) **Fix logo YouTube en video**: ocultado header/buscador/3-puntitos en páginas de watch via JS DOM traversal (Shadow DOM + `ytm-*`). (8) **Fix Shorts**: CSS selectores exclusivos, bottom nav se oculta, logo de YouTube ocultado. (9) **Re-inyección CSS cada 5 segundos** para resistir eliminación por YouTube SPA. (10) **Background playback fix**: loadUrl fallback en bgKeepAliveRunnable, force-play cada 500ms. (11) **Fullscreen fix**: bottom nav y settings se ocultan en fullscreen/theater via detector JS + bridge `JamasBridge.onFullscreenChanged()`. |
| **3.0-beta** | **Release de reparación + UI + auditoría**: (1) **Fix logo YouTube en home**: el CSS que oculta el header ya no se aplica globalmente; se acota a `html.jamas-page-watch` en un elemento propio (`#jamas-watch-css`), con detección de navegación SPA. (2) **Fix hueco negro en watch**: causa real = el player es `position:fixed` con `top:48px` debajo del masthead; ahora se sube a `top:0` y se oculta el header fijo de 48px (verificado `videoTop=0`), sin tapar la descripción. (3) **Fix `SyntaxError` cada 5 s**: escapes del regex de videoId en `detectAndReportPlaybackState`. (4) **Fix `enhancements.css`**: el watchdog ya no sobreescribe `#jamas-css`. (5) **UI**: bottom nav con 5 iconos vectoriales Material y botón de ajustes con icono (antes emoji). (6) **Buenas prácticas**: streams cerrados con `use`, null-safety en `NotificationManager`, guard de `progressBar`, eliminado `System.gc()`, `isVideoFullscreen()` reparado (estado por bridge), typo XHR, `skipAd` restaura mute, `injectNoAd` sin JSON inválido, sin `MutationObserver` costoso, deep-links (`onNewIntent`), logging de consola JS, sin secretos en `AGENTS.md`. |
| **3.0-beta.2** | **Ajustes de UX**: (1) **Buscador de la bottom nav funcional**: el selector era `#button[aria-label*=Buscar]` (exigía `id="button"`, nunca coincidía); ahora `button[aria-label*="Buscar"]` abre el overlay de búsqueda de YouTube. (2) **Home**: se quitó el buscador de la barra superior (duplicaba la bottom nav). (3) **Shorts**: se quitó el logo de YouTube; bug encontrado = selector con valor sin comillas (`Página de inicio`) invalidaba toda la regla CSS. (4) **Shorts**: botón nativo glass "volver a inicio" (casita + flecha izquierda, `ic_shorts_home`) arriba a la izquierda, con `goBack()`. (5) El detector de fullscreen ya no marca Shorts como fullscreen. |
| **3.0-beta.3** | **UI nativa de la página de video (watch)**: causa raíz = `enhancements.css` usaba selectores de YouTube de **escritorio** (`ytd-watch-metadata`, `#actions.ytd-watch-metadata`…) pero la app carga `m.youtube.com`, cuya maqueta móvil usa `ytm-*` y clases `slim-video-*`; ninguna regla aplicaba. Se inspeccionó el DOM real y se añadió una sección acotada a `html.jamas-page-watch`: (1) título a máximo 2 líneas (17 px, peso 600, `-webkit-line-clamp:2`); (2) barra de acciones "pill" glass (`slim-video-action-bar-actions`); (3) botón Suscribirse rojo pill; (4) like/dislike/compartir redondeados con hover; (5) avatar circular; (6) comentarios y relacionados como tarjetas redondeadas; (7) separadores sutiles. Verificado con 0 errores JS; home/search/shorts no se afectan. |
| **3.0-beta.4** | **Barra de acciones moderna + audio siempre activo**: (1) la barra "slim" metía 7 hijos en una fila (no cabían y compartir se bugueaba) → `enhanceWatchActions()` la rehace con CSS Grid en 2 filas: canal (avatar 44 px + nombre + suscriptores + Suscribirse rojo) y 4 tarjetas compactas (Like **con contador** extraído del `aria-label`, Dislike, Compartir, Más); oculta extras (sparkle IA); (2) el icono de like es una animación Lottie con `transform: translate(-50%,-50%)` que se cortaba → se fuerza flex centrado y `svg{position:static;transform:none}`; (3) **audio siempre activo**: `forceAudio()` pone `video.muted=false` cada 700 ms y se oculta el botón blanco `.ytp-unmute` (verificado `muted=false`); (4) tarjetas más chicas (36 px, radio 11, iconos 22); (5) comentarios: carrusel/teaser con padding y radio, filas con separador y avatar circular. |
| **3.0-beta.5** | **Bloque de acciones 2x2 + dislike real**: (1) la fila única se reemplaza por un **bloque 2x2** debajo del canal: fila 1 canal (avatar + nombre + suscriptores + Suscribirse), fila 2 `[Like][Dislike]`, fila 3 `[Compartir][Más]` (grid de 4 columnas, cada tarjeta `span 2`); radio 16 px y etiquetas de texto; (2) **contador de dislikes real**: YouTube ya no los publica → `updateDislikeCount()` consulta la API pública de **Return YouTube Dislike** una vez por video y muestra el número (p. ej. "519 mil"); *nota de privacidad: servicio externo, solo envía el ID del video*; (3) **bug fix**: `enhanceWatchActions()` (cada 1,5 s) borraba el `data-count` del dislike y el número parpadeaba → ahora no lo toca y lo gestiona `updateDislikeCount()`; (4) extracción de suscriptores más robusta (varias fuentes + regex tolerante). |
| **3.0-beta.6** | **Layout de la barra de acciones estable (CSS puro)**: causas raíz: (a) el grid de 4 columnas `1fr` dejaba que **Suscribirse** estirara su columna a 110 px → like quedaba más chico que dislike y desbordaba a la derecha; (b) **mover nodos de YouTube** a contenedores propios hacía que su render dejara de dibujar **dislike y compartir** (además `bar.children` es una colección viva: al mover nodos se saltaban elementos y el orden salía invertido); (c) el contador `::after` estaba fuera del `<button>`, así que tocar el número no accionaba el botón. Solución: grid de **6 columnas** `repeat(6, minmax(0,1fr))` **sin mover ningún nodo** (fila 1 avatar/nombre+subs/Suscribirse; fila 2 `[Like][Dislike]`; fila 3 `[Compartir][Más]`, cada tarjeta `span 3`); `bindTileClick()` reenvía el clic de la tarjeta (incluido el contador) al botón. Verificado: 4 tarjetas iguales, centradas, sin desborde; dislike "519 mil"; 0 errores JS. |
| **3.0-beta.7** | **Like pegado a la izquierda + más aire en el 2x2**: causa raíz = el botón de like de YouTube (`like-button-view-model.slim_video_action_bar_renderer_button`) trae **`margin-left: auto`** y ancho `fit-content`, así que dentro de su celda quedaba empujado a la derecha (`x=108`, ancho 91) mientras dislike/compartir/más ocupaban los 173 px (`x=26`/`200`). Solución: `.jamas-ab-tile` con `width:100%`, `margin:0`, `box-sizing:border-box` y `justify-self:stretch` → las 4 tarjetas iguales y el like pegado a la izquierda (alineado con compartir). Además el grid pasó a `row-gap:14px` para separar el bloque 2x2 de la fila del canal. |
| **3.0-beta.8** | **Auditoría del watch (estabilidad)**: causas raíz: (a) YouTube **re-renderiza la barra** y borra nuestras clases → layout parcial (botones sin tarjeta/sparkle visible) hasta el siguiente tick de 1,5 s; (b) el player es `position:fixed` y subirlo a `top:0` por JS cada 1,5 s provocaba parpadeo si YouTube recreaba el masthead; (c) los chips de filtro de relacionados son `sticky` y se superponían a las miniaturas; (d) el player fijo tapa la descripción/título al bajar. Solución: `MutationObserver` **acotado a la barra** (`childList`, throttle 120 ms, sin observar atributos → sin bucle) que re-aplica al instante; ocultación segura (solo `<script>` y el botón IA "Preguntar", **nunca** un botón no reconocido → dislike/compartir no desaparecen); player/masthead por **CSS estable** (`.player-container{top:0}`, `ytm-masthead{display:none}`); metadata con más aire (`padding:16px 14px 8px`); chips `position:static`; se quitaron reglas que rompían secciones (`ytm-item-section-renderer` con border-radius/separadores, márgenes del carrusel). |
| **3.0-beta.9** | **Fix rotación + buscador nativo**: causas raíz: (a) al rotar (vertical→horizontal→vertical) **compartir y dislike desaparecían**; en beta.9 se atribuyó a que `enhanceWatchActions()` ocultaba con `display:none !important` cualquier hijo de la barra **sin `<button>`** (`!cb`); se eliminó esa condición (mejora que se mantiene, aunque **no era la causa real**, ver beta.10); (b) el buscador de la bottom nav no abría nada: el botón de búsqueda vive en `ytm-mobile-topbar-renderer` (topbar `fixed`, `z=4`) y YouTube **ignora los clics sintéticos** (`.click()` y toda la secuencia de punteros exigen `isTrusted`); en watch además queda tapado por el player. Solución: (a) ocultación segura (solo `<script>` y botón IA), listeners `resize`/`orientationchange`, `observeWatchBar()` sobre la barra y su **padre**, masthead `z-index:1` (el player lo tapa igual, sin hueco); (b) la pestaña "Buscar" abre un **diálogo nativo** (`AlertDialog` + `EditText`) que navega a `/results?search_query=<consulta>` (fiable en todas las páginas). |
| **3.0-beta.10** | **Fix definitivo del giro**: causa raíz reproducida con `wm user-rotation` + logcat: al girar a **horizontal YouTube elimina Dislike, IA y Más del DOM** (deja solo Like y Compartir) y al volver a **vertical no los repone** (bug de la maquetación responsiva de YouTube; los nodos ya no existen, así que el JS no puede recuperarlos). Solución: al detectar horizontal→vertical (`resize`/`orientationchange`), si la barra perdió el botón de "No me gusta" (o tiene menos de 2 `button-view-model`), se **recarga la página en la misma posición del vídeo** (`URL` + `searchParams.set('t', currentTime)`) para que YouTube re-renderice la barra completa. Guardado para no recargar en bucle (una vez por giro) ni fuera de `watch`. Verificado con `wm user-rotation lock 1`/`lock 0` + `screencap`. |
| **3.0 (estable)** | **Versión estable**: consolida la UI nativa (bottom nav de 5 pestañas + buscador nativo), la página de vídeo rediseñada (barra 2×2, contador real de dislikes vía Return YouTube Dislike, fila de canal), el botón "volver a inicio" de Shorts, el audio siempre activo y la reproducción en segundo plano. Incluye los fixes de la página de vídeo: hueco negro (player `top:0`), botones que se perdían en los re-render (observer acotado) y el **giro del móvil** (recarga en la misma posición al volver a vertical). Repositorio reorganizado con README, LICENSE, CHANGELOG y CI (`.github/workflows/build.yml`) en la raíz. versionCode 32 / "3.0". |
| **3.1** | **Audio en segundo plano robusto**: música con la **pantalla apagada** o mientras **juegas** (otra app en primer plano). Causa raíz de los cortes: MIUI/Doze mata o congela el proceso en segundo plano y el WakeLock era de solo 1 hora. Solución: (a) **WakeLock `PARTIAL_WAKE_LOCK` indefinido** mientras suena (se adquiere al reproducir y se libera al pausar/cerrar) en `BackgroundMediaService`; (b) servicio con `android:stopWithTask="false"` + `onTaskRemoved` para no cortarse al cerrar la tarea; (c) nueva sección **"Segundo plano"** en los ajustes con *Permitir sin restricciones* (`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`) y *Autostart* (abre los ajustes del fabricante: MIUI, ColorOS, EMUI…). Verificado: con la app en segundo plano la posición sigue avanzando (`10196 → 14196`), WakeLock activo y servicio en primer plano. versionCode 33 / "3.1". |

---

## 11. Limitaciones conocidas

- La reproducción usa el reproductor web de YouTube (HTML5). No hay descarga de vídeos.
- **Mini-burbuja**: desliza el vídeo hacia abajo mientras se reproduce y se abre la burbuja flotante (WebView embebida) para seguir viendo/oyendo mientras navegas; ✕ cierra, ⤢ expande a pantalla completa.
- **Reproducción en segundo plano (v2.0+)**: la notificación de MediaSession permite pausar, reproducir, saltar al siguiente/anterior vídeo. En Android 13+ se solicita el permiso de notificaciones la primera vez. El WakeLock parcial mantiene la CPU activa durante la reproducción.
- La **reproducción sin anuncios** (`isInlinePlaybackNoAd`) depende del servidor: si YouTube lo ignorara en el futuro, quedaría el json-prune + salto automático como respaldo.
- El bloqueo de anuncios puede fallar si YouTube rediseña su DOM; basta con actualizar las listas (⚙ → Actualizar).
- En algunos dispositivos/vídeos el "salto automático" puede mostrar un instante del anuncio antes de saltarlo.
- YouTube puede mostrar su aviso de "bloqueador de anuncios" en casos extremos; la app lo elimina del DOM y sigue reproduciendo.
- Para un correcto rendimiento se recomienda un dispositivo con Android 8+ y WebView actualizado.
- **adb commands** (`adb shell input`): bloqueados por SecurityException en el dispositivo de pruebas (Xiaomi/MIUI). No se pueden inyectar eventos de teclado/virtual vía adb.
- **`isMinifyEnabled = false`**: el APK no está minificado/obfuscado. Para producción habría que activar ProGuard/R8.
- **UA hardcodeado**: el User-Agent apunta a Android 14 / Chrome 124. En el futuro podría necesitar actualización.