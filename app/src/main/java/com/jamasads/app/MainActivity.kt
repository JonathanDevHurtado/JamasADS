package com.jamasads.app

import android.annotation.SuppressLint
import android.app.Activity
import android.app.Dialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import android.window.OnBackInvokedDispatcher
import com.jamasads.app.adblock.AdBlocker
import com.jamasads.app.media.BackgroundMediaService
import com.jamasads.app.web.YtWebViewClient
import org.json.JSONObject

class MainActivity : Activity() {

    /** WebView personalizado: fuerza visibility=VISIBLE para que Chromium
     *  NO pause la ejecucion de JavaScript cuando la pantalla se bloquea
     *  o la app pasa a segundo plano. Clave para que el watchdog siga
     *  ejecutando forcePlay() durante la reproduccion en background. */
    private inner class MediaWebView(context: android.content.Context) : WebView(context) {
        override fun onWindowVisibilityChanged(visibility: Int) {
            if (visibility != View.GONE) {
                super.onWindowVisibilityChanged(View.VISIBLE)
            } else {
                super.onWindowVisibilityChanged(visibility)
            }
        }
    }

    private lateinit var root: FrameLayout
    private lateinit var webView: WebView
    private lateinit var adBlocker: AdBlocker
    private lateinit var progressBar: ProgressBar
    private lateinit var settingsButton: TextView

    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var fatalOverlay: View? = null
    private var pipDownX = 0f
    private var pipDownY = 0f
    private var pipDownTime = 0L

    private var lastInsetLeft = 0
    private var lastInsetTop = 0
    private var lastInsetRight = 0
    private var lastInsetBottom = 0

    /** Handler que mantiene el video reproduciendo mientras la app esta en background.
     *  Ejecuta forcePlay() desde Kotlin (no afectado por la suspension de JS de Chromium)
     *  cada 5 segundos para contrarrestar el pause automatico de YouTube.
     *  Nota: el watchdog ya fuerza play cada 2s, este es un fallback Kotlin-side. */
    private val bgKeepAliveRunnable = object : Runnable {
        override fun run() {
            if (serviceBound && backgroundService?.isPlaying == true && ::webView.isInitialized) {
                webView.evaluateJavascript(
                    "(function(){var v=document.querySelector('video');" +
                        "if(v&&v.paused&&v.currentTime>0&&!v.ended&&!window.__jamasUserPaused){" +
                        "v.muted=false;v.play().catch(function(){});return 'bg_resume';}" +
                        "return 'ok';})()"
                ) { }
            }
            mainHandler.postDelayed(this, 5000)
        }
    }

    private lateinit var miniPlayer: FrameLayout
    private var miniWebView: WebView? = null
    private var miniVideoId: String? = null

    private val mainHandler = Handler(Looper.getMainLooper())
    private var lastShortsState = false

    /** Monitor de memoria: ejecuta GC proactivo si el heap supera el 85%.
     *  Previene OOM durante operaciones pesadas (recreateWebView, compilacion de filtros).
     *  Intervalo: 30 segundos para no saturar el main thread con GC calls. */
    private val memoryMonitorRunnable = object : Runnable {
        override fun run() {
            val rt = Runtime.getRuntime()
            val used = rt.totalMemory() - rt.freeMemory()
            val max = rt.maxMemory()
            val pct = used * 100 / max
            if (pct > 85) {
                Log.w(Config.TAG, "Memoria alta: ${pct}% (${used/1048576}/${max/1048576} MB), GC forzado")
                System.gc()
            }
            mainHandler.postDelayed(this, 30000)
        }
    }

    private var backgroundService: BackgroundMediaService? = null
    private var serviceBound = false

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val binder = service as BackgroundMediaService.LocalBinder
            backgroundService = binder.getService()
            serviceBound = true
            backgroundService?.onMediaAction = { action -> handleMediaActionFromService(action) }
            Log.d(Config.TAG, "Servicio de segundo plano conectado")
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            backgroundService = null
            serviceBound = false
            Log.d(Config.TAG, "Servicio de segundo plano desconectado")
        }
    }

    /** Vigila la URL aunque la navegacion sea SPA (pushState, sin recargar la
     *  pagina): al entrar/salir de Shorts re-aplica el padding de insets.
     *  Intervalo: 1 segundo para no saturar el main thread. */
    private val urlWatcher = object : Runnable {
        override fun run() {
            val shorts = isShortsPage()
            if (shorts != lastShortsState) {
                lastShortsState = shorts
                applyInsetsPadding()
            }
            mainHandler.postDelayed(this, 1000)
        }
    }

    /** Checker periodico del estado de reproduccion: actualiza la notificacion
     *  cada 5 segundos para que el servicio sepa si el video esta reproduciendose.
     *  Nota: el watchdog ya reporta via JamasBridge cada 2s, este checker es
     *  un fallback por si el bridge no responde (ej: pagina cargando). */
    private val playbackWatcher = object : Runnable {
        override fun run() {
            detectAndReportPlaybackState()
            mainHandler.postDelayed(this, 5000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        CrashCatcher.install(this)

        setupSystemBars()
        setupBackHandling()
        requestNotificationPermission()

        root = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
        }

        setContentView(root)

        adBlocker = AdBlocker(this)
        adBlocker.init()

        webView = createWebView()

        mainHandler.post { swapToWebView() }
    }

    private fun swapToWebView() {
        window.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(Color.BLACK))
        root.removeAllViews()

        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            isIndeterminate = false
            progressTintList = ColorStateList.valueOf(0xFFFF0000.toInt())
            progressBackgroundTintList = ColorStateList.valueOf(0x33000000.toInt())
        }
        root.addView(progressBar, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(3)
        ).apply { gravity = Gravity.TOP })

        root.addView(webView, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ))

        settingsButton = TextView(this).apply {
            text = "\u2699\uFE0E"
            textSize = 20f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(0x99000000.toInt())
                setStroke(dp(1), 0x44FFFFFF.toInt())
            }
            setOnClickListener { showSettings() }
        }
        root.addView(settingsButton, FrameLayout.LayoutParams(dp(44), dp(44)).apply {
            gravity = Gravity.BOTTOM or Gravity.END
            setMargins(0, 0, dp(10), dp(58))
        })

        setupMiniPlayer()
        setupInsets()
        lastShortsState = isShortsPage()

        YtWebViewClient.preloadAssets(this)

        if (intent?.data != null) {
            webView.loadUrl(intent!!.data.toString())
        } else {
            webView.loadUrl(Config.HOME_URL)
        }
        showCrashWarningIfAny()

        mainHandler.postDelayed({ mainHandler.post(urlWatcher) }, 3000)
        mainHandler.postDelayed({ mainHandler.post(playbackWatcher) }, 5000)
        mainHandler.postDelayed({ bindBackgroundService() }, 2000)
        mainHandler.postDelayed(memoryMonitorRunnable, 10000)
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 100)
            }
        }
    }

    private fun bindBackgroundService() {
        val intent = Intent(this, BackgroundMediaService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
        bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
    }

    private fun handleMediaActionFromService(action: String) {
        if (!::webView.isInitialized) return
        try {
            when (action) {
                "play" -> {
                    webView.evaluateJavascript(
                        "(function(){window.__jamasUserPaused=false;var v=document.querySelector('video');" +
                            "if(v){v.play().catch(function(){});return 'ok';}return 'no';})()"
                    ) { result ->
                        Log.d(Config.TAG, "Play desde notificacion: $result")
                    }
                }
                "pause" -> {
                    webView.evaluateJavascript(
                        "(function(){window.__jamasUserPaused=true;var v=document.querySelector('video');" +
                            "if(v){v.pause();return 'ok';}return 'no';})()"
                    ) { result ->
                        Log.d(Config.TAG, "Pausar desde notificacion: $result")
                    }
                }
                "next" -> {
                    // Usar la API del player de YouTube o el boton del DOM
                    webView.evaluateJavascript(
                        "(function(){" +
                            "var p=document.querySelector('#movie_player')||document.querySelector('ytd-player');" +
                            "if(p&&p.nextVideo){p.nextVideo();return 'api';}" +
                            "var b=document.querySelector('.ytp-next-button')||document.querySelector('button.ytp-next-button')||document.querySelector('[aria-label=\"Next\"]');" +
                            "if(b){b.click();return 'btn';}" +
                            "return 'no';" +
                            "})()"
                    ) { result ->
                        Log.d(Config.TAG, "Siguiente desde notificacion: $result")
                    }
                }
                "prev" -> {
                    webView.evaluateJavascript(
                        "(function(){" +
                            "var p=document.querySelector('#movie_player')||document.querySelector('ytd-player');" +
                            "if(p&&p.previousVideo){p.previousVideo();return 'api';}" +
                            "var b=document.querySelector('.ytp-prev-button')||document.querySelector('button.ytp-prev-button')||document.querySelector('[aria-label=\"Previous\"]');" +
                            "if(b){b.click();return 'btn';}" +
                            "return 'no';" +
                            "})()"
                    ) { result ->
                        Log.d(Config.TAG, "Anterior desde notificacion: $result")
                    }
                }
                else -> {
                    if (action.startsWith("seek:")) {
                        val pos = action.substringAfter("seek:").toLongOrNull() ?: 0
                        webView.evaluateJavascript(
                            "(function(){var v=document.querySelector('video');" +
                                "if(v){v.currentTime=${pos}/1000;return 'ok';}return 'no';})()"
                        ) { result ->
                            Log.d(Config.TAG, "Seek desde notificacion: $result")
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(Config.TAG, "Error al ejecutar accion media", e)
        }
    }

    fun updateBackgroundService(title: String?, artist: String?, isPlaying: Boolean) {
        if (serviceBound) {
            backgroundService?.updatePlaybackState(isPlaying, title, artist, 0, 0)
        }
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun createWebView(): WebView {
        val wv = MediaWebView(this)
        wv.setBackgroundColor(Color.TRANSPARENT)
        wv.webViewClient = YtWebViewClient(
            adBlocker,
            onMainFrameError = { msg -> showErrorPage(msg) },
            onRenderProcessGone = { old -> recreateWebView(old) },
            onRendererGiveUp = { showFatalOverlay() },
            onMainFrameUrlChanged = { applyInsetsPadding() }
        )
        wv.webChromeClient = ChromeClient()
        wv.addJavascriptInterface(JamasBridge(), "JamasBridge")
        // Deslizar el video hacia abajo -> mini-burbuja DENTRO de la app (como la
        // del player de YouTube): sigue sonando mientras se navega por la web.
        // Se detecta un fling vertical rapido hacia abajo y el listener devuelve
        // false para que la WebView siga haciendo scroll.
        wv.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    pipDownX = event.x
                    pipDownY = event.y
                    pipDownTime = System.currentTimeMillis()
                }
                MotionEvent.ACTION_UP -> {
                    val dt = System.currentTimeMillis() - pipDownTime
                    val dy = event.y - pipDownY
                    val dx = event.x - pipDownX
                    if (dt in 1..500 && dy > dp(120).toFloat() &&
                        Math.abs(dy) > Math.abs(dx) * 1.5f && dy / dt * 1000f > 800f
                    ) {
                        openMiniPlayerFromSwipe()
                    }
                }
            }
            false
        }
        wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            allowFileAccess = false
            userAgentString = Config.CHROME_UA
            textZoom = 100
        }
        return wv
    }

    /** Si muere el renderizador de WebView, recreamos la vista en vez de que Android mate la app. */
    private fun recreateWebView(old: WebView) {
        try {
            val lastUrl = old.url ?: Config.HOME_URL
            // Liberar referencias antes de destruir para ayudar al GC
            old.webViewClient = WebViewClient()
            old.webChromeClient = WebChromeClient()
            (old.parent as? ViewGroup)?.removeView(old)
            try {
                old.destroy()
            } catch (e: Exception) {
                // Log basico sin stack trace
            }
            // GC explicito antes de crear la nueva WebView
            System.gc()
            Thread.sleep(100)
            System.gc()
            val fresh = createWebView()
            root.addView(
                fresh, 0,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            )
            webView = fresh
            fresh.loadUrl(lastUrl)
        } catch (e: Exception) {
            // Log basico sin stack trace para evitar OOM
            Log.w(Config.TAG, "fallo recreate: ${e.message}")
        }
    }

    private inner class ChromeClient : WebChromeClient() {

        override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
            if (customView != null) {
                callback?.onCustomViewHidden()
                return
            }
            view ?: return
            customView = view
            customViewCallback = callback
            (findViewById<ViewGroup>(android.R.id.content))?.addView(
                view,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            )
            settingsButton.visibility = View.GONE
            hideSystemBars()
        }

        override fun onHideCustomView() {
            hideCustomView()
        }

        override fun onPermissionRequest(request: PermissionRequest?) {
            request?.grant(request.resources)
        }

        @Suppress("DEPRECATION")
        override fun onShowFileChooser(
            view: WebView?,
            filePathCallback: ValueCallback<Array<Uri>>?,
            fileChooserParams: FileChooserParams?
        ): Boolean {
            fileChooserCallback?.onReceiveValue(null)
            fileChooserCallback = filePathCallback
            val accept = fileChooserParams?.acceptTypes?.firstOrNull { it.isNotBlank() } ?: "*/*"
            val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = accept
            }
            return try {
                startActivityForResult(Intent.createChooser(intent, "Seleccionar archivo"), Config.FILE_CHOOSER_REQ)
                true
            } catch (e: Exception) {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = null
                false
            }
        }

        override fun onProgressChanged(view: WebView?, newProgress: Int) {
            progressBar.progress = newProgress
            progressBar.visibility = if (newProgress < 100) View.VISIBLE else View.GONE
            if (newProgress == 100) {
                detectAndReportPlaybackState()
            }
        }
    }

    private fun detectAndReportPlaybackState() {
        if (!::webView.isInitialized) return
        try {
            webView.evaluateJavascript(
                "(function(){var v=document.querySelector('video');" +
                    "if(!v)return JSON.stringify({playing:false,title:'',artist:'',thumbnail:''});" +
                    "var t=document.querySelector('h1.title')||" +
                    "document.querySelector('#title h1')||" +
                    "document.querySelector('h1.ytd-watch-metadata yt-formatted-string');" +
                    "var ch=document.querySelector('#channel-name a')||" +
                    "document.querySelector('#owner #channel-name a')||" +
                    "document.querySelector('#channel-name yt-formatted-string a');" +
                    "var title='';" +
                    "if(t&&t.textContent.trim()){title=t.textContent.trim();}" +
                    "else{var dt=document.title||'';var si=dt.indexOf(' - ');title=si>0?dt.substring(0,si).trim():dt.trim();}" +
                    "var th='';try{" +
                    "var um=location.pathname.match(/\\\\/(?:shorts\\\\/|watch\\\\?v=|v\\\\/)([\\\\w-]{11})/);" +
                    "var vid=um?um[1]:null;" +
                    "if(!vid){var q=new URLSearchParams(location.search).get('v');if(q&&q.length===11)vid=q;}" +
                    "if(vid)th='https://i.ytimg.com/vi/'+vid+'/hqdefault.jpg';" +
                    "}catch(e){}" +
                    "return JSON.stringify({playing:!v.paused,title:title,artist:ch?ch.textContent.trim():'',thumbnail:th,position:Math.floor(v.currentTime*1000),duration:v.duration>0?Math.floor(v.duration*1000):0});})()"
            ) { result ->
                try {
                    if (result == null || result == "null") return@evaluateJavascript
                    val clean = result.removeSurrounding("\"").replace("\\\"", "\"")
                    if (clean.isEmpty()) return@evaluateJavascript
                    val obj = JSONObject(clean)
                    val playing = obj.optBoolean("playing", false)
                    val title = obj.optString("title", "")
                    val artist = obj.optString("artist", "")
                    val thumbnail = obj.optString("thumbnail", "")
                    runOnUiThread {
                        setKeepScreenOn(playing)
                        if (serviceBound) {
                            backgroundService?.let { svc ->
                                svc.updatePlaybackState(
                                    playing,
                                    title.ifEmpty { null },
                                    artist.ifEmpty { null }
                                )
                                if (thumbnail.isNotEmpty()) {
                                    svc.loadThumbnail(thumbnail)
                                }
                            }
                        }
                    }
                } catch (e: Exception) {
                    Log.w(Config.TAG, "Error al detectar estado de reproduccion", e)
                }
            }
        } catch (e: Exception) {
            Log.w(Config.TAG, "Error al evaluar estado de video", e)
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == Config.FILE_CHOOSER_REQ) {
            val cb = fileChooserCallback
            fileChooserCallback = null
            cb?.onReceiveValue(if (resultCode == RESULT_OK && data?.data != null) arrayOf(data.data!!) else null)
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onPause() {
        super.onPause()
        if (::webView.isInitialized) {
            webView.evaluateJavascript("window.__jamasBg=true", null)
            // Iniciar keepalive desde Kotlin (no depende de JS de Chromium)
            mainHandler.postDelayed(bgKeepAliveRunnable, 5000)
        }
    }

    override fun onResume() {
        super.onResume()
        mainHandler.removeCallbacks(bgKeepAliveRunnable)
        if (::webView.isInitialized) {
            webView.evaluateJavascript("window.__jamasBg=false;window.__jamasUserPaused=false", null)
            webView.onResume()
            // Si el servicio dice que esta reproduciendo, reanudar el video
            if (serviceBound && backgroundService?.isPlaying == true) {
                webView.evaluateJavascript(
                    "(function(){var v=document.querySelector('video');" +
                        "if(v&&v.paused&&v.currentTime>0&&!v.ended){" +
                        "v.muted=false;v.play().catch(function(){});return 'resumed';}return 'ok';})()"
                ) { result ->
                    Log.d(Config.TAG, "Resume tras desbloqueo: $result")
                }
            }
        }
    }

    /** Deslizar el video hacia abajo -> mini-burbuja (si hay video reproduciendose). */
    private fun openMiniPlayerFromSwipe() {
        if (!::webView.isInitialized) return
        try {
            webView.evaluateJavascript(
                "(function(){var v=document.querySelector('video');" +
                    "var m=location.pathname.match(/^\\/(?:shorts\\/|watch\\?v=|v\\/)([\\w-]{11})/);" +
                    "if(!v||!m||v.paused||!v.currentTime)return 'no';" +
                    "return JSON.stringify({id:m[1],t:Math.floor(v.currentTime)});})()"
            ) { r ->
                if (r == null || r == "\"no\"") return@evaluateJavascript
                try {
                    val obj = JSONObject(r)
                    openMiniPlayer(obj.getString("id"), obj.optLong("t"))
                } catch (e: Exception) {
                    Log.w(Config.TAG, "no se pudo abrir la mini-burbuja", e)
                }
            }
        } catch (e: Exception) {
            Log.w(Config.TAG, "no se pudo evaluar el estado del video", e)
        }
    }

    /** Crea el contenedor de la mini-burbuja (sin WebView; se crea al abrirse). */
    private fun setupMiniPlayer() {
        miniPlayer = FrameLayout(this).apply {
            layoutParams = FrameLayout.LayoutParams(dp(150), dp(84)).apply {
                gravity = Gravity.BOTTOM or Gravity.START
                setMargins(dp(8), 0, 0, dp(64))
            }
            setBackgroundColor(0xFF111111.toInt())
            background = GradientDrawable().apply { cornerRadius = dp(8).toFloat() }
            elevation = dp(6).toFloat()
            visibility = View.GONE
            // Arrastrar la burbuja por la pantalla (margenes relativos al borde
            // inferior-izquierdo, que es donde esta anclada por la gravedad).
            setOnTouchListener { _, event ->
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN -> {
                        pipDownX = event.x
                        pipDownY = event.y
                        pipDownTime = System.currentTimeMillis()
                    }
                    MotionEvent.ACTION_MOVE -> {
                        val dx = (event.x - pipDownX).toInt()
                        val dy = (event.y - pipDownY).toInt()
                        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
                            val lp = miniPlayer.layoutParams as FrameLayout.LayoutParams
                            lp.leftMargin = Math.max(0, lp.leftMargin + dx)
                            lp.bottomMargin = Math.max(0, lp.bottomMargin - dy)
                            miniPlayer.layoutParams = lp
                            pipDownX = event.x
                            pipDownY = event.y
                        }
                    }
                }
                true
            }
        }
        val controls = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END
        }
        fun circleBtn(sym: String, onClick: () -> Unit): TextView {
            return TextView(this).apply {
                text = sym
                textSize = 14f
                setTextColor(Color.WHITE)
                gravity = Gravity.CENTER
                background = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(0x99000000.toInt())
                }
                setOnClickListener { onClick() }
            }
        }
        val close = circleBtn("\u2715") { closeMiniPlayer() }
        val expand = circleBtn("\u2924") { expandMiniPlayer() }
        controls.addView(expand, LinearLayout.LayoutParams(dp(28), dp(28)).apply { marginEnd = dp(4) })
        controls.addView(close, LinearLayout.LayoutParams(dp(28), dp(28)))
        miniPlayer.addView(controls, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.TOP or Gravity.END; topMargin = dp(4); marginEnd = dp(4) })
        root.addView(miniPlayer)
    }

    /** Abre (o reutiliza) la mini-burbuja con el video indicado y navega al inicio. */
    private fun openMiniPlayer(videoId: String, startSec: Long) {
        miniVideoId = videoId
        if (miniWebView == null) {
            val mw = WebView(this)
            mw.setBackgroundColor(Color.BLACK)
            mw.webViewClient = MiniPlayerClient()
            mw.webChromeClient = ChromeClient()
            mw.settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                allowFileAccess = false
                cacheMode = WebSettings.LOAD_DEFAULT
                userAgentString = Config.CHROME_UA
            }
            miniWebView = mw
            // Se inserta en el indice 0 para que la WebView quede DEBAJO de los
            // botones de control (✕/⤢), que se anadieron en setupMiniPlayer.
            miniPlayer.addView(mw, 0, FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
            ))
        }
        miniPlayer.visibility = View.VISIBLE
        miniWebView!!.loadUrl("https://www.youtube.com/embed/$videoId?autoplay=1&start=$startSec&rel=0")
        if (::webView.isInitialized) webView.loadUrl(Config.HOME_URL)
    }

    private fun closeMiniPlayer() {
        if (!::miniPlayer.isInitialized) return
        miniPlayer.visibility = View.GONE
        val mw = miniWebView
        miniWebView = null
        miniVideoId = null
        if (mw != null) {
            (mw.parent as? ViewGroup)?.removeView(mw)
            try {
                mw.destroy()
            } catch (e: Exception) {
                Log.w(Config.TAG, "destroy de la mini-webview fallo", e)
            }
        }
    }

    /** Abre el video a pantalla completa en la WebView principal y cierra la burbuja. */
    private fun expandMiniPlayer() {
        val mw = miniWebView ?: return
        val id = miniVideoId
        try {
            mw.evaluateJavascript(
                "(function(){var v=document.querySelector('video');return v?Math.floor(v.currentTime):0;})()"
            ) { t ->
                val sec = t?.trim()?.removeSurrounding("\"")?.toIntOrNull() ?: 0
                closeMiniPlayer()
                if (id != null && ::webView.isInitialized) {
                    webView.loadUrl("https://m.youtube.com/watch?v=$id&t=$sec")
                }
            }
        } catch (e: Exception) {
            Log.w(Config.TAG, "no se pudo expandir la mini-burbuja", e)
            closeMiniPlayer()
        }
    }

    /** Cliente de la mini-burbuja: inyecta el watchdog y abre enlaces en la WebView principal. */
    private inner class MiniPlayerClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url?.toString() ?: return false
            if (!url.startsWith("https://www.youtube.com/embed")) {
                if (::webView.isInitialized) webView.loadUrl(url)
                closeMiniPlayer()
                return true
            }
            return false
        }

        override fun onPageCommitVisible(view: WebView, url: String?) {
            super.onPageCommitVisible(view, url)
            try {
                val js = view.context.assets.open("js/watchdog.js").bufferedReader().use { it.readText() }
                if (js.isNotEmpty()) view.evaluateJavascript(js, null)
            } catch (e: Exception) {
                Log.w(Config.TAG, "no se pudo inyectar el watchdog en la burbuja", e)
            }
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            closeMiniPlayer()
            return true
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        if (::webView.isInitialized) webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    /** Pantalla de recuperacion: evita quedarse en negro tras un bucle de renderer caido. */
    private fun showFatalOverlay() {
        if (fatalOverlay != null) return
        val overlay = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
        }
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(32), 0, dp(32), 0)
        }
        col.addView(TextView(this).apply {
            text = "La pagina se detuvo"
            textSize = 20f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
        }, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ))
        col.addView(TextView(this).apply {
            text = "El proceso de renderizado fallo varias veces seguidas.\nPulsa Reintentar o revisa tu conexion."
            textSize = 14f
            setTextColor(0xFFB9B9C0.toInt())
            gravity = Gravity.CENTER
        }, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(10) })
        col.addView(Button(this).apply {
            text = "Reintentar"
            setOnClickListener {
                (overlay.parent as? ViewGroup)?.removeView(overlay)
                fatalOverlay = null
                recreateWebView(webView)
            }
        }, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(18) })
        overlay.addView(col, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.CENTER })
        root.addView(overlay, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        ))
        fatalOverlay = overlay
    }

    /** Pantalla completa de reproduccion: volver desde la WebView en pantalla completa. */
    private fun hideCustomView() {
        val v = customView ?: return
        (findViewById<ViewGroup>(android.R.id.content))?.removeView(v)
        customView = null
        customViewCallback?.onCustomViewHidden()
        customViewCallback = null
        settingsButton.visibility = View.VISIBLE
        showSystemBars()
    }

    /** Navegacion hacia atras unificada (back predictivo en 13+ y clasico en el resto). */
    private fun handleBack() {
        if (customView != null) {
            hideCustomView()
            return
        }
        if (::miniPlayer.isInitialized && miniPlayer.visibility == View.VISIBLE) {
            closeMiniPlayer()
            return
        }
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            finish()
        }
    }

    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onBackPressed() {
        handleBack()
    }

    @Suppress("DEPRECATION")
    private fun setupBackHandling() {
        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT
            ) {
                handleBack()
            }
        }
    }

    override fun onDestroy() {
        mainHandler.removeCallbacks(urlWatcher)
        mainHandler.removeCallbacks(playbackWatcher)
        mainHandler.removeCallbacks(memoryMonitorRunnable)
        mainHandler.removeCallbacks(bgKeepAliveRunnable)
        unbindBackgroundService()
        try {
            if (::webView.isInitialized) {
                (webView.parent as? ViewGroup)?.removeView(webView)
                webView.destroy()
            }
        } catch (e: Exception) {
            // Log basico para evitar OOM durante destroy
        }
        super.onDestroy()
    }

    private fun unbindBackgroundService() {
        if (serviceBound) {
            try {
                unbindService(serviceConnection)
                serviceBound = false
            } catch (e: Exception) {
                Log.w(Config.TAG, "Error al desvincular servicio", e)
            }
        }
    }

    private fun setupSystemBars() {
        window.addFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED)
        window.statusBarColor = Color.BLACK
        window.navigationBarColor = Color.BLACK
        window.decorView.systemUiVisibility = 0
    }

    /** Activa/desactiva FLAG_KEEP_SCREEN_ON segun si hay video reproduciendose. */
    private fun setKeepScreenOn(keepOn: Boolean) {
        if (keepOn) {
            window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    /**
     * En Android 15+ el modo edge-to-edge es obligatorio y el contenido se
     * dibuja DEBAJO de la barra de notificaciones y de la barra de navegacion:
     * el logotipo/buscador de YouTube quedaba bajo la barra superior y en los
     * Shorts el tiempo/descripcion quedaban bajo los botones de navegacion.
     * Con este listener el root se "acolcha" con los insets del sistema:
     * en pantalla completa (bars ocultas) los insets son 0 y no molesta.
     */
    @Suppress("DEPRECATION")
    private fun setupInsets() {
        if (Build.VERSION.SDK_INT < 20) return
        root.setOnApplyWindowInsetsListener { v, insets ->
            lastInsetLeft = insets.systemWindowInsetLeft
            lastInsetTop = insets.systemWindowInsetTop
            lastInsetRight = insets.systemWindowInsetRight
            lastInsetBottom = insets.systemWindowInsetBottom
            applyInsetsPadding()
            insets
        }
    }

    /** Aplica el padding de insets segun la pagina actual. Se llama al recibir
     *  los insets y tambien cuando cambia la URL (al entrar/salir de Shorts el
     *  padding inferior debe actualizarse; si no, el reproductor de Shorts queda
     *  bajo la barra de navegacion del sistema y no se puede tocar su barra de
     *  progreso ni la descripcion). */
    private fun applyInsetsPadding() {
        if (!::root.isInitialized) return
        val b = if (isShortsPage()) lastInsetBottom else 0
        root.setPadding(lastInsetLeft, lastInsetTop, lastInsetRight, b)
    }

    private fun isShortsPage(): Boolean {
        if (!::webView.isInitialized) return false
        return try {
            webView.url?.contains("/shorts") == true
        } catch (e: Exception) {
            false
        }
    }

    @Suppress("DEPRECATION")
    private fun hideSystemBars() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            )
    }

    private fun showSystemBars() {
        window.decorView.systemUiVisibility = 0
        window.statusBarColor = Color.BLACK
        window.navigationBarColor = Color.BLACK
    }

    private fun showErrorPage(msg: String?) {
        if (!::webView.isInitialized || !webView.isAttachedToWindow) return
        try {
            val clean = msg?.replace("'", "")?.replace("\"", "") ?: "Sin conexion a Internet"
            val html = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>" +
                "</head><body style='background:#000;color:#fff;font-family:sans-serif;text-align:center;padding-top:90px;'>" +
                "<h2 style='font-weight:normal'>Sin conexion</h2><p style='color:#999'>$clean</p><br><br>" +
                "<a href='${Config.HOME_URL}' style='color:#ff0000;font-size:18px;text-decoration:none'>Reintentar</a>" +
                "</body></html>"
            webView.loadData(html, "text/html; charset=utf-8", "utf-8")
        } catch (e: Exception) {
            Log.w(Config.TAG, "no se pudo mostrar pagina de error", e)
        }
    }

    /** Muestra en un dialogo el log completo de cualquier fallo anterior y lo borra despues. */
    private fun showCrashWarningIfAny() {
        try {
            val logs = CrashCatcher.readCrashLogs(this)
            if (logs.isEmpty()) return
            val text = logs.joinToString("\n\n==============\n\n") { (path, content) ->
                "$path\n\n$content"
            }
            CrashCatcher.clearCrashLogs(this)
            showCrashDialog(text)
        } catch (e: Exception) {
            Log.w(Config.TAG, "no se pudo leer el log de crash", e)
        }
    }

    private fun showCrashDialog(content: String) {
        val dialog = Dialog(this)
        val pad = dp(18)
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, dp(16), pad, dp(14))
            background = GradientDrawable().apply {
                setColor(0xFF16161A.toInt())
                cornerRadius = dp(16).toFloat()
            }
        }

        val title = TextView(this).apply {
            text = "Se detecto un fallo anterior"
            textSize = 17f
            setTextColor(Color.WHITE)
            typeface = Typeface.DEFAULT_BOLD
        }
        val hint = TextView(this).apply {
            text = "Este log nos ayuda a arreglarlo. Puedes copiarlo y enviarselo al desarrollador."
            textSize = 13f
            setTextColor(0xFFB9B9C0.toInt())
        }

        val body = TextView(this).apply {
            text = content
            textSize = 10f
            typeface = Typeface.MONOSPACE
            setTextColor(0xFFDDDDDD.toInt())
            setTextIsSelectable(true)
            maxLines = 12
        }

        val copyBtn = Button(this).apply {
            text = "Copiar"
            textSize = 12f
            setOnClickListener {
                val cm = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText("log", content))
                Toast.makeText(this@MainActivity, "Log copiado", Toast.LENGTH_SHORT).show()
            }
        }
        val shareBtn = Button(this).apply {
            text = "Compartir"
            textSize = 12f
            setOnClickListener {
                try {
                    val share = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_SUBJECT, "JamasADS - Log de crash")
                        putExtra(Intent.EXTRA_TEXT, content)
                    }
                    startActivity(Intent.createChooser(share, "Enviar log via..."))
                } catch (e: Exception) {
                    Toast.makeText(this@MainActivity, "No hay app para compartir", Toast.LENGTH_SHORT).show()
                }
            }
        }
        val okBtn = Button(this).apply {
            text = "Entendido"
            textSize = 12f
            setOnClickListener { dialog.dismiss() }
        }

        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        btnRow.addView(copyBtn, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
            marginEnd = dp(4)
        })
        btnRow.addView(shareBtn, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
            marginEnd = dp(4)
        })
        btnRow.addView(okBtn, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))

        fun addView(v: View, topMargin: Int) {
            col.addView(v, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { this.topMargin = dp(topMargin) })
        }

        addView(title, 0)
        addView(hint, 4)
        addView(body, 10)
        addView(btnRow, 12)

        val width = (resources.displayMetrics.widthPixels * 0.9).toInt()
        dialog.setContentView(col, ViewGroup.LayoutParams(width, ViewGroup.LayoutParams.WRAP_CONTENT))
        dialog.window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        dialog.show()
    }

    private fun showSettings() {
        val dialog = Dialog(this)
        val pad = dp(20)
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, dp(18), pad, dp(14))
            background = GradientDrawable().apply {
                setColor(0xFF16161A.toInt())
                cornerRadius = dp(18).toFloat()
            }
        }

        val title = TextView(this).apply {
            text = "JamasADS"
            textSize = 22f
            setTextColor(Color.WHITE)
            typeface = Typeface.DEFAULT_BOLD
        }
        val subtitle = TextView(this).apply {
            text = "YouTube sin anuncios"
            textSize = 13f
            setTextColor(0xFFB9B9C0.toInt())
        }

        val sw = Switch(this).apply {
            text = "Bloqueador de anuncios"
            isChecked = adBlocker.enabled
            setTextColor(Color.WHITE)
            setOnCheckedChangeListener { _, on -> adBlocker.enabled = on }
        }

        val status = TextView(this).apply {
            text = statusText()
            textSize = 13f
            setTextColor(0xFFB9B9C0.toInt())
        }

        val updateBtn = Button(this).apply {
            text = "Actualizar listas de filtros"
            setOnClickListener {
                isEnabled = false
                text = "Descargando..."
                adBlocker.updateLists {
                    runOnUiThread {
                        isEnabled = true
                        text = "Actualizar listas de filtros"
                        status.text = statusText()
                        Toast.makeText(this@MainActivity, "Listas actualizadas", Toast.LENGTH_LONG).show()
                    }
                }
            }
        }

        val homeBtn = Button(this).apply {
            text = "Volver al inicio"
            setOnClickListener {
                webView.loadUrl(Config.HOME_URL)
                dialog.dismiss()
            }
        }

        val reloadBtn = Button(this).apply {
            text = "Recargar pagina"
            setOnClickListener {
                webView.reload()
                dialog.dismiss()
            }
        }

        fun addView(v: View, topMargin: Int) {
            col.addView(v, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { this.topMargin = dp(topMargin) })
        }

        addView(title, 0)
        addView(subtitle, 4)
        addView(sw, 16)
        addView(status, 8)
        addView(updateBtn, 16)
        addView(homeBtn, 8)
        addView(reloadBtn, 8)

        val width = (resources.displayMetrics.widthPixels * 0.9).toInt()
        dialog.setContentView(col, ViewGroup.LayoutParams(width, ViewGroup.LayoutParams.WRAP_CONTENT))
        dialog.window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        dialog.show()
    }

    private fun statusText(): String {
        val (net, cos) = adBlocker.stats()
        val base = if (adBlocker.isReady) {
            "Listas: $net reglas de red \u00b7 $cos cosmeticas"
        } else {
            "Compilando listas de filtros..."
        }
        val upd = if (adBlocker.lastUpdate > 0) {
            val d = java.util.Date(adBlocker.lastUpdate)
            val f = java.text.SimpleDateFormat("dd/MM/yyyy HH:mm", java.util.Locale.US)
            "\nUltima actualizacion: ${f.format(d)}"
        } else ""
        return base + upd
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    /** Puente JS→Kotlin: el watchdog llama a window.JamasBridge.onPlaybackStateChanged(info)
     *  para comunicar cambios de estado de reproduccion al servicio. */
    inner class JamasBridge {
        @android.webkit.JavascriptInterface
        fun onPlaybackStateChanged(json: String) {
            try {
                val obj = JSONObject(json)
                val playing = obj.optBoolean("playing", false)
                val title = obj.optString("title", "")
                val artist = obj.optString("artist", "")
                val thumbnail = obj.optString("thumbnail", "")
                val position = obj.optLong("position", 0)
                val duration = obj.optLong("duration", 0)
                runOnUiThread {
                    setKeepScreenOn(playing)
                    if (serviceBound) {
                        backgroundService?.let { svc ->
                            svc.updatePlaybackState(
                                playing,
                                title.ifEmpty { null },
                                artist.ifEmpty { null },
                                position,
                                duration
                            )
                            if (thumbnail.isNotEmpty()) {
                                svc.loadThumbnail(thumbnail)
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w(Config.TAG, "Error en JamasBridge", e)
            }
        }
    }
}