<p align="center">
  <img src="app/src/main/res/mipmap-xxxhdpi/ic_launcher.png" width="120" alt="JamasADS Logo"/>
</p>

<h1 align="center">JamasADS</h1>

<p align="center">
  <strong>YouTube sin anuncios en Android</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Version-2.8-blue" alt="Version 2.8"/>
  <img src="https://img.shields.io/badge/Android-7.0%2B-green" alt="Android 7.0+"/>
  <img src="https://img.shields.io/badge/License-MIT-orange" alt="License"/>
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome"/>
  <img src="https://img.shields.io/badge/Build-Passing-brightgreen" alt="Build Passing"/>
</p>

---

## Que es

**JamasADS** es una aplicación Android que envuelve YouTube móvil (`m.youtube.com`) en un WebView con un **bloqueador de anuncios en 3 capas** basado en las listas reales de **uBlock Origin**.

- Sin servicios de Google innecesarios
- Sin root
- Sin suscripciones
- Código abierto

---

## Características

| Caracteristica | Descripcion |
|----------------|-------------|
| Bloqueo de anuncios | 3 capas: red, CSS cosmético, watchdog JS |
| Segundo plano | Reproduccion continua con notificacion interactiva |
| Mini-burbuja | Deslizar hacia abajo para continuar escuchando |
| Pantalla completa | Video a pantalla completa con controles |
| Splash screen | Logo al iniciar la aplicacion |
| Crash dialog | Reporte automatico de fallos con copia/compartir |
| Compatible | Android 7.0+ (SDK 24) |

---

## Como funciona

### Capa 1 — Bloqueo de red
Cada peticion HTTP se comprueba contra las reglas compiladas de EasyList, EasyPrivacy, uBlock Filters y quick-fixes. Si coincide, se devuelve una respuesta vacia.

### Capa 2 — Cosmetico (CSS)
Selectores CSS eliminan elementos de anuncios del DOM de YouTube (banners, overlays, etc.).

### Capa 3 — Watchdog (JavaScript)
Un script se inyecta en cada pagina para:
- Eliminar nodos de anuncios (`nuke()`)
- Saltar anuncios de video (`skipAd()`)
- Poda de respuestas JSON (`pruneAds()`)
- Solicitar reproduccion sin anuncios (`isInlinePlaybackNoAd`)
- Mantener reproduccion en background

---

## Arquitectura

```
JamasADS/
├── app/src/main/java/com/jamasads/app/
│   ├── Config.kt                    # URLs, User-Agent, constantes
│   ├── MainActivity.kt              # UI, WebView, splash, ajustes
│   ├── CrashCatcher.kt              # Captura de crashes
│   ├── media/
│   │   └── BackgroundMediaService.kt # Servicio en 2do plano + MediaSession
│   ├── adblock/
│   │   ├── Filter.kt                # Reglas de red compiladas
│   │   ├── FilterCompiler.kt        # Compilador de listas
│   │   └── AdBlocker.kt             # Gestor principal
│   └── web/
│       └── YtWebViewClient.kt       # Intercepta requests, inyecta scripts
├── app/src/main/assets/
│   ├── filters/                     # Listas de uBlock Origin
│   └── js/watchdog.js               # Anti-anuncios + background play
└── app/src/test/                    # Tests unitarios (12 tests)
```

---

## Instalacion

### Opcion 1 — Descargar APK

Ve a la seccion [Releases](https://github.com/JonathanDevHurtado/JamasADS/releases) y descarga la ultima version.

### Opcion 2 — Compilar desde codigo fuente

**Requisitos:**
- JDK 17
- Android SDK (compileSdk 35)
- Gradle

```bash
# Clonar el repositorio
git clone https://github.com/JonathanDevHurtado/JamasADS.git
cd JamasADS

# Compilar
./gradlew :app:assembleRelease

# El APK estara en:
# app/build/outputs/apk/release/app-release.apk
```

### Instalar en el telefono

```bash
adb install app/build/outputs/apk/release/app-release.apk
```

---

## Desarrollo

### Comandos utiles

```bash
# Tests + lint + build release (comando completo obligatorio)
./gradlew :app:testReleaseUnitTest :app:lintRelease assembleRelease

# Validar watchdog.js
node --check app/src/main/assets/js/watchdog.js

# Ver reporte de lint
open app/build/reports/lint-results-release.html
```

### Estructura de carpetas

| Carpeta | Descripcion |
|---------|-------------|
| `Github/` | Archivos para GitHub |
| `Github/Versiones a publicar/` | APKs firmados listos para instalar |
| `app/src/main/` | Codigo fuente principal |
| `app/src/test/` | Tests unitarios |

---

## Lista de filtros

JamasADS usa las siguientes listas de uBlock Origin:

| Lista | Tamano | Funcion |
|-------|--------|---------|
| EasyList | ~2MB | Filtros generales de anuncios |
| EasyPrivacy | ~1.5MB | Proteccion de privacidad |
| uBlock Filters | ~470KB | Filtros adicionales de uBlock |
| quick-fixes | ~76KB | Correcciones rapidas |
| YouTube (custom) | ~3KB | Reglas especificas para YouTube |

---

## Historial de versiones

### v2.8 — Fix de jank y optimizacion de rendimiento
- **watchdog.js**: `nuke()` intervalo subido de 350ms a 2000ms (5.7x menos carga DOM)
- **playbackWatcher**: subido de 2s a 5s (evita duplicacion con watchdog)
- **memoryMonitor**: subido de 10s a 30s (reduce GC forzado)
- **urlWatcher**: subido de 500ms a 1000ms
- **bgKeepAliveRunnable**: subido de 3s a 5s
- **pruneAds()**: limite de profundidad (12 niveles) para evitar recursion
- **pruneGlobals()**: flag para evitar re-podar en cada llamada
- **Resultado**: Heap 95% → 86%, frames skipped 86 → 0, cero errores

### v2.7 — Optimizacion de startup
- watchdog.js y CSS cacheados en memoria
- Handlers diferidos (urlWatcher 3s, playbackWatcher 5s, servicio 2s)
- Splash screen via theme
- Boton "Compartir" en crash dialog

### v2.6 — Fix OOM en cascada
- OOM-safe en compilacion de filtros
- Memory monitor proactivo

### v2.5 — Fixes multiples
- Fix crash OOM en FilterCompiler
- Fix screen lock pause
- Fix logo antiguo

### v2.4 — Notificacion mejorada
- Barra de progreso en notificacion
- Fix pantalla bloqueada

### v2.3 — Logo y pause
- Logo nuevo
- Fix pause en foreground

### v2.2 — Reproduccion en segundo plano
- Fix completo de reproduccion en segundo plano

### v2.1 — Visibilitychange
- Fix reproduccion en segundo plano (visibilitychange)

### v2.0 — JamasADS
- Renombrado a JamasADS
- Servicio en segundo plano con notificacion

---

## Tecnologias

| Componente | Tecnologia |
|------------|------------|
| Lenguaje | Kotlin |
| IDE | Android Studio |
| Target SDK | 35 (Android 15) |
| Min SDK | 24 (Android 7.0) |
| WebView | Chromium (del sistema) |
| Filtros | uBlock Origin lists |
| Build | Gradle + JDK 17 |

---

## Contribuir

Las contribuciones son bienvenidas! Por favor:

1. Abre un issue primero para discutir el cambio
2. Crea un branch para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Haz commit de tus cambios (`git commit -m 'Agregar nueva funcionalidad'`)
4. Push a tu branch (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

---

## License

Este proyecto esta bajo la licencia MIT. Ver [LICENSE](LICENSE) para mas detalles.

---

## Contacto

- **Autor:** [Jonathan Hurtado](https://github.com/JonathanDevHurtado)
- **Email:** JonathanHurtadoDev@proton.me
- **GitHub:** [@JonathanDevHurtado](https://github.com/JonathanDevHurtado)

---

<p align="center">
  Hecho con Kotlin y pasion por YouTube sin anuncios
</p>
