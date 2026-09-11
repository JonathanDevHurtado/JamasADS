# Contribuir a JamasADS

Gracias por tu interes en contribuir a JamasADS! Este documento explica como participar.

## Tipos de contribuciones

- **Bug reports:** Abre un issue describiendo el problema con detalles (dispositivo, version de Android, pasos para reproducir)
- **Feature requests:** Abre un issue discutiendo la nueva funcionalidad antes de implementarla
- **Pull requests:** Envian los cambios directamente

## Como contributear

### 1. Fork el repositorio

```bash
git clone https://github.com/JonathanDevHurtado/JamasADS.git
cd JamasADS
```

### 2. Crea un branch para tu cambios

```bash
git checkout -b feature/nueva-funcionalidad
```

### 3. Haz tus cambios

- Sigue el estilo de codigo existente
- Agrega tests si es posible
- Actualiza la documentacion si es necesario

### 4. Compila y verifica

```bash
./gradlew :app:testReleaseUnitTest :app:lintRelease assembleRelease
```

### 5. Haz commit

```bash
git add .
git commit -m "Agregar nueva funcionalidad: descripcion corta"
```

### 6. Push a tu branch

```bash
git push origin feature/nueva-funcionalidad
```

### 7. Abre un Pull Request

- Describe tus cambios
- Menciona si resuelve algun issue
- Incluye screenshots si es relevante

## Reglas de codigo

- **Kotlin:** Sigue el estilo de codigo Kotlin existente
- **No comments:** No agregar comments a menos que el usuario lo pida
- **Tests:** Ejecutar `./gradlew :app:testReleaseUnitTest` antes de commitear
- **Lint:** Ejecutar `./gradlew :app:lintRelease` para verificar calidad

## Estructura del proyecto

```
JamasADS/
├── app/src/main/java/com/jamasads/app/
│   ├── Config.kt              # Constantes
│   ├── MainActivity.kt        # UI principal
│   ├── CrashCatcher.kt        # Manejo de crashes
│   ├── media/                 # Servicio en 2° plano
│   ├── adblock/               # Motor de bloqueo
│   └── web/                   # Cliente WebView
├── app/src/main/assets/
│   ├── filters/               # Listas de uBlock
│   └── js/watchdog.js         # Script anti-anuncios
└── app/src/test/              # Tests unitarios
```

## Issues abiertos

Revisa los issues abiertos para ver que se puede contribuir:

- Bugs conocidos
- Features solicitadas
- Mejoras de rendimiento

## Preguntas?

Si tienes preguntas, abre un issue con el tag "question".

---

Gracias por contribuir! Tu ayuda hace que JamasADS sea mejor para todos.
