<p align="center">
  <img src="app/src/main/res/mipmap-xxxhdpi/ic_launcher.png" width="120" alt="JamasADS Logo"/>
</p>

<h1 align="center">JamasADS</h1>

<p align="center">
  <strong>YouTube sin anuncios en Android</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Versi%C3%B3n-3.1-blue" alt="Versión 3.1"/>
  <img src="https://img.shields.io/badge/Android-7.0%2B-green" alt="Android 7.0+"/>
  <img src="https://img.shields.io/badge/Kotlin-2.0-purple" alt="Kotlin"/>
  <img src="https://img.shields.io/badge/License-MIT-orange" alt="License"/>
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome"/>
</p>

---

## Qué es

**JamasADS** es una aplicación Android (Kotlin) que envuelve YouTube móvil
(`m.youtube.com`) en un `WebView` con un **bloqueador de anuncios en 3 capas**
basado en las listas reales de **uBlock Origin**, además de reproducción en
segundo plano y una interfaz nativa.

- Sin root · Sin suscripciones · Sin servicios de Google innecesarios · Código abierto

---

## Características

| Característica | Descripción |
|----------------|-------------|
| **Bloqueo en 3 capas** | Red (`shouldInterceptRequest`), cosmético (CSS) y watchdog (JS) |
| **Reproducción en 2º plano** | Música con la pantalla apagada o jugando: `MediaSession` + WakeLock + exención de batería |
| **Mini-burbuja** | Desliza hacia abajo para seguir escuchando con la pantalla apagada |
| **Bottom nav nativa** | 5 pestañas Material: Inicio, Shorts, Buscar, Suscripciones, Biblioteca |
| **Buscador nativo** | Diálogo con `EditText` que navega a los resultados de YouTube |
| **Página de vídeo rediseñada** | Barra 2×2 (Like / Dislike / Compartir / Más), contador real de dislikes y suscriptores |
| **Shorts** | Botón nativo "volver a inicio" y detección de pantalla completa |
| **Pantalla completa** | Vídeo a pantalla completa con modo inmersivo |
| **Anti-jank** | Intervalos ajustados y poda del DOM acotada |
| **Compatible** | Android 7.0+ (minSdk 24, targetSdk 35) |

---

## Cómo funciona

### Capa 1 — Red
Cada petición HTTP se comprueba contra las reglas compiladas de EasyList,
EasyPrivacy, uBlock Filters, quick-fixes y reglas propias de YouTube. Si coincide,
se devuelve una respuesta vacía. Los endpoints que el reproductor necesita de
forma síncrona están excepcionados (`@@`) para no romper la reproducción.

### Capa 2 — Cosmético (CSS)
Un `<style>` con los selectores compilados (acotados a `youtube.com`) elimina del
DOM los elementos de anuncios: banners, overlays, etc.

### Capa 3 — Watchdog (JavaScript)
Un script inyectado en cada página:
- elimina nodos de anuncios (`nuke()`),
- salta anuncios de vídeo (`skipAd()`),
- poda respuestas JSON (`pruneAds()` / `json-prune`),
- pide reproducción sin anuncios (`isInlinePlaybackNoAd`),
- mantiene la reproducción en segundo plano.

---

## Arquitectura

```
JamasADS/
├── app/src/main/java/com/jamasads/app/
│   ├── Config.kt                     # URLs, User-Agent, constantes
│   ├── SplashActivity.kt             # Splash animado con logo
│   ├── MainActivity.kt               # UI, WebView, bottom nav, insets, ajustes
│   ├── CrashCatcher.kt               # Captura y reporte de crashes
│   ├── media/
│   │   └── BackgroundMediaService.kt # Servicio en 2º plano + MediaSession
│   ├── adblock/
│   │   ├── Filter.kt                 # Regla de red compilada
│   │   ├── FilterCompiler.kt         # Compilador de listas
│   │   └── AdBlocker.kt              # Gestor principal
│   └── web/
│       └── YtWebViewClient.kt        # Intercepta requests e inyecta watchdog + CSS
├── app/src/main/assets/
│   ├── filters/                      # Listas de uBlock Origin + reglas YouTube
│   ├── js/watchdog.js                # Anti-anuncios + background + UI de watch
│   └── css/enhancements.css          # Tema nativo de YouTube
└── app/src/test/                     # Tests unitarios (FilterCompiler)
```

---

## Instalación

### Opción 1 — Descargar el APK

Ve a la sección [Releases](https://github.com/JonathanDevHurtado/JamasADS/releases)
y descarga la última versión. También tienes APKs firmados en
[`Github/apks/`](Github/apks/).

### Opción 2 — Compilar desde el código fuente

**Requisitos:** JDK 17, Android SDK (compileSdk 35) y Gradle (wrapper incluido).

```bash
git clone https://github.com/JonathanDevHurtado/JamasADS.git
cd JamasADS
./gradlew :app:assembleRelease
# APK en: app/build/outputs/apk/release/app-release.apk
```

### Instalar en el teléfono

```bash
adb install app/build/outputs/apk/release/app-release.apk
```

---

## Desarrollo

```bash
# Tests + lint + APK release (comando completo)
./gradlew :app:testReleaseUnitTest :app:lintRelease assembleRelease

# Validar la sintaxis del watchdog
node --check app/src/main/assets/js/watchdog.js
```

La firma del release se lee de `signing.properties` (no versionado) y
`keystore/utubeorigin.jks`. El workflow de GitHub Actions
([`.github/workflows/build.yml`](.github/workflows/build.yml)) ejecuta tests,
lint y build en cada tag `v*`, y publica la release automáticamente.

---

## Estructura del repositorio

| Ruta | Descripción |
|------|-------------|
| `app/` | Código fuente Android |
| `Github/apks/` | APKs firmados por versión |
| `Github/logs/` | Changelog detallado por versión |
| `Github/versiones/` | Historial de versiones |
| `DOCUMENTACION.md` | Documentación técnica completa |
| `REPORTE.md` | Sistema de incidencias y auditorías |
| `AGENTS.md` | Contexto para agentes/colaboradores |

---

## Listas de filtros

| Lista | Función |
|-------|---------|
| EasyList | Filtros generales de anuncios |
| EasyPrivacy | Protección de privacidad |
| uBlock Filters | Filtros adicionales de uBlock Origin |
| quick-fixes | Correcciones rápidas |
| YouTube (custom) | Reglas específicas para YouTube |

---

## Privacidad

- No se envían datos a servidores propios.
- El contador de **dislikes** usa la API pública de
  [Return YouTube Dislike](https://returnyoutubedislikeapi.com); solo se envía el
  **ID del vídeo**, una vez por vídeo.

---

## Historial de versiones

Resumen; el detalle está en [`CHANGELOG.md`](CHANGELOG.md) y
[`Github/logs/`](Github/logs/).

### v3.1 — Audio en segundo plano
- **Música con la pantalla apagada o jugando**: WakeLock indefinido mientras
  suena y servicio en primer plano que no se corta al cerrar la tarea.
- **Ajustes "Segundo plano"**: exención de batería y autostart del fabricante.

### v3.0 — UI nativa + auditoría del watch
- **Bottom nav nativa** con 5 iconos Material y **buscador nativo**.
- **Página de vídeo rediseñada**: barra 2×2 (Like/Dislike/Compartir/Más),
  contador real de dislikes y fila de canal.
- **Shorts**: logo oculto y botón nativo "volver a inicio".
- **Audio siempre activo** y **reproducción en segundo plano** estables.
- **Fix del giro**: al volver a vertical se recarga la página en la misma
  posición para restaurar los botones que YouTube elimina en horizontal.
- **Fix del hueco negro** en la página de vídeo.

### v2.x — Base del bloqueador
- Bloqueador en 3 capas, reproducción en segundo plano, mini-burbuja,
  splash screen, crash dialog y optimizaciones anti-jank.

---

## Tecnologías

| Componente | Tecnología |
|------------|------------|
| Lenguaje | Kotlin 2.0 |
| Target / Min SDK | 35 (Android 15) / 24 (Android 7.0) |
| WebView | Chromium (del sistema) |
| Filtros | uBlock Origin lists |
| Build | Gradle + JDK 17 |
| CI | GitHub Actions |

---

## Contribuir

Las contribuciones son bienvenidas:

1. Abre un issue para discutir el cambio.
2. Crea una rama (`git checkout -b feature/nueva-funcionalidad`).
3. Haz commit (`git commit -m 'Agregar nueva funcionalidad'`).
4. Push (`git push origin feature/nueva-funcionalidad`).
5. Abre un Pull Request.

Lee [`CONTRIBUTING.md`](CONTRIBUTING.md) para más detalle.

---

## Licencia

Este proyecto está bajo la licencia **MIT**. Ver [`LICENSE`](LICENSE).

---

## Contacto

- **Autor:** [Jonathan Hurtado](https://github.com/JonathanDevHurtado)
- **Email:** JonathanHurtadoDev@proton.me
- **GitHub:** [@JonathanDevHurtado](https://github.com/JonathanDevHurtado)

---

<p align="center">
  Hecho con Kotlin y pasión por YouTube sin anuncios
</p>
