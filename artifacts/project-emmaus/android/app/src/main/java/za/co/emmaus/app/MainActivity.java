package za.co.emmaus.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.Bundle;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "EmmausMainActivity";
    private static final String WIDGET_PROMPT_PREFS = "emmaus_widget_prompt";
    private static final String KEY_PROMPT_REQUESTED = "daily_rhythm_prompt_requested";
    private static final long WEBVIEW_RECOVERY_DELAY_MS = 700L;
    private static final int MAX_WEBVIEW_RECOVERY_ATTEMPTS = 2;

    interface EmmausPermissionCallback { void onResult(boolean granted); }
    private EmmausPermissionCallback pendingPermissionCallback;
    private String[] pendingPermissions;
    private final Handler webViewRecoveryHandler = new Handler(Looper.getMainLooper());
    private final Handler deepLinkHandler = new Handler(Looper.getMainLooper());
    private int deepLinkGeneration = 0;
    private String lastLoadedDeepLinkUrl = null;
    private final WebViewRecoveryState webViewRecoveryState =
        new WebViewRecoveryState(MAX_WEBVIEW_RECOVERY_ATTEMPTS);
    private final ActivityResultLauncher<String[]> emmausPermissionLauncher =
        registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), ignored -> {
            EmmausPermissionCallback callback = pendingPermissionCallback;
            String[] permissions = pendingPermissions;
            pendingPermissionCallback = null;
            pendingPermissions = null;
            if (callback == null || permissions == null) return;
            boolean granted = true;
            for (String permission : permissions) {
                if (ContextCompat.checkSelfPermission(this, permission) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    granted = false;
                    break;
                }
            }
            callback.onResult(granted);
        });

    boolean requestEmmausPermissions(String[] permissions, EmmausPermissionCallback callback) {
        if (permissions == null || permissions.length == 0 || callback == null
                || pendingPermissionCallback != null || isFinishing() || isDestroyed()) return false;
        pendingPermissionCallback = callback;
        pendingPermissions = permissions.clone();
        try {
            emmausPermissionLauncher.launch(pendingPermissions);
            return true;
        } catch (RuntimeException error) {
            pendingPermissionCallback = null;
            pendingPermissions = null;
            NativePermissionDiagnostics.exception(this, "permission-broker.launch", error);
            return false;
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GeofenceProofPlugin.class);
        registerPlugin(WelcomeAssistBluetoothPlugin.class);
        registerPlugin(DailyRhythmDeepLinkPlugin.class);
        registerPlugin(DailyReminderPlugin.class);
        registerPlugin(EmmausDiagnosticsPlugin.class);
        registerPlugin(EmmausSharePlugin.class);
        DailyRhythmDeepLinkPlugin.captureIntent(this, getIntent(), "activity_on_create");
        super.onCreate(savedInstanceState);
        configureWebViewCookies();
        installWebViewRecovery();
        scheduleDeepLinkDelivery(getIntent(), "activity_on_create");
    }

    @Override
    public void onNewIntent(Intent intent) {
        DailyRhythmDeepLinkPlugin.captureIntent(this, intent, "activity_on_new_intent");
        setIntent(intent);
        super.onNewIntent(intent);
        // Switching icon ↔ widget must cancel in-flight loads or the WebView
        // is left on a blank document (white screen after splash).
        scheduleDeepLinkDelivery(intent, "activity_on_new_intent");
    }

    private static boolean isLauncherIntent(Intent intent) {
        return intent != null && Intent.ACTION_MAIN.equals(intent.getAction());
    }

    private String routeFromAnyDeepLink(Intent intent) {
        if (intent == null) return null;
        String route = DailyRhythmDeepLinkPlugin.routeFromIntent(intent);
        if (route != null) return route;
        String notificationDestination = intent.getStringExtra("destination");
        if ("/personal".equals(notificationDestination)) {
            return "/personal?source=notification";
        }
        return null;
    }

    private void scheduleDeepLinkDelivery(Intent intent, String stage) {
        deepLinkHandler.removeCallbacksAndMessages(null);
        deepLinkGeneration++;
        final int generation = deepLinkGeneration;
        final Intent intentRef = intent;
        // Run soon, then once more after the bridge/WebView is guaranteed up.
        deepLinkHandler.post(() -> deliverDeepLinkToWebView(intentRef, generation, stage + "_t0"));
        deepLinkHandler.postDelayed(() -> deliverDeepLinkToWebView(intentRef, generation, stage + "_t400"), 400L);
    }

    /**
     * Handle icon ↔ widget transitions without blanking the WebView.
     * Widget: load the Daily Rhythm URL when needed.
     * Launcher: if a previous widget load left a blank document, restore the app shell.
     */
    private void deliverDeepLinkToWebView(Intent intent, int generation, String stage) {
        if (generation != deepLinkGeneration) return;
        if (intent == null || getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        String route = routeFromAnyDeepLink(intent);
        String currentUrl = webView.getUrl() == null ? "" : webView.getUrl();
        boolean blank = currentUrl.isEmpty()
            || "about:blank".equals(currentUrl)
            || currentUrl.startsWith("data:");
        boolean onEmmaus = currentUrl.startsWith("https://emmaus.co.za");

        if (route != null && !route.isEmpty()) {
            String targetUrl = "https://emmaus.co.za" + route;
            // If the SPA is already alive on emmaus.co.za, do NOT stopLoading/loadUrl.
            // Full reloads on icon↔widget switches were leaving a white blank document
            // on the second widget open. Soft-navigate via history instead.
            if (onEmmaus && !blank) {
                String escapedRoute = route.replace("\\", "\\\\").replace("'", "\\'");
                String js =
                    "(function(){try{"
                    + "var p='" + escapedRoute + "';"
                    + "var cur=(location.pathname||'')+(location.search||'');"
                    + "if(cur===p){return;}"
                    + "history.replaceState(Object.assign({},history.state||{},{emmausDeepLink:true}),'',p);"
                    + "window.dispatchEvent(new PopStateEvent('popstate',{state:history.state}));"
                    + "}catch(e){location.assign('" + targetUrl.replace("'", "\\'") + "');}})();";
                Log.i(TAG, "stage=webview_deeplink_soft route=" + route + " stage=" + stage);
                lastLoadedDeepLinkUrl = targetUrl;
                webView.evaluateJavascript(js, null);
                return;
            }

            Log.i(TAG, "stage=webview_deeplink_loadurl route=" + route + " stage=" + stage);
            lastLoadedDeepLinkUrl = targetUrl;
            webView.loadUrl(targetUrl);
            return;
        }

        // Launcher: only recover a truly blank document — never reload a healthy session.
        if (isLauncherIntent(intent) && blank) {
            String appUrl = getBridge().getAppUrl();
            if (appUrl == null || appUrl.trim().isEmpty()) {
                appUrl = "https://emmaus.co.za/";
            }
            Log.w(TAG, "stage=webview_launcher_recover_blank stage=" + stage);
            webView.loadUrl(appUrl);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        Log.i(TAG, "stage=activity_resumed");
        DailyRhythmWidgetProvider.refresh(this);
        new Handler(Looper.getMainLooper()).postDelayed(this::offerDailyRhythmWidget, 1200);
    }

    @Override
    public void onPause() {
        flushWebViewCookies();
        super.onPause();
    }

    @Override
    public void onStop() {
        flushWebViewCookies();
        super.onStop();
    }

    private void configureWebViewCookies() {
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);

        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            // Keep the setting explicit for the live HTTPS origin used by
            // release builds. The app still uses the server's secure,
            // HttpOnly sid cookie as its only authentication authority.
            cookieManager.setAcceptThirdPartyCookies(webView, true);
        }
    }

    private void flushWebViewCookies() {
        CookieManager.getInstance().flush();
    }

    private void installWebViewRecovery() {
        if (getBridge() == null) return;
        getBridge().getWebView().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public void onPageStarted(WebView webView, String url, Bitmap favicon) {
                super.onPageStarted(webView, url, favicon);
                webViewRecoveryState.onPageStarted();
            }

            @Override
            public void onPageCommitVisible(WebView webView, String url) {
                super.onPageCommitVisible(webView, url);
                webViewRecoveryHandler.removeCallbacksAndMessages(null);
                webViewRecoveryState.onVisibleCommit();
            }

            @Override
            public void onReceivedError(
                WebView webView,
                WebResourceRequest request,
                WebResourceError error
            ) {
                super.onReceivedError(webView, request, error);
                if (request.isForMainFrame()) {
                    recoverWebViewIfBlank(webView, "main_document_error");
                }
            }

            @Override
            public void onReceivedHttpError(
                WebView webView,
                WebResourceRequest request,
                WebResourceResponse errorResponse
            ) {
                super.onReceivedHttpError(webView, request, errorResponse);
                if (request.isForMainFrame()) {
                    recoverWebViewIfBlank(webView, "main_document_http_error");
                }
            }
        });
    }

    private void recoverWebViewIfBlank(WebView webView, String reason) {
        if (!webViewRecoveryState.shouldHandleFailure(true)) {
            return;
        }

        if (!webViewRecoveryState.scheduleRecovery(true)) {
            showWebViewRecoveryPage(webView);
            return;
        }

        webViewRecoveryHandler.postDelayed(() -> {
            if (isFinishing() || isDestroyed()) return;

            int attempt = webViewRecoveryState.beginRecoveryLoad();
            if (attempt < 0) {
                if (webViewRecoveryState.shouldShowFallback()) {
                    showWebViewRecoveryPage(webView);
                }
                return;
            }

            Log.w(TAG, "stage=webview_recovery attempt=" + attempt + " reason=" + reason);
            String appUrl = getBridge() == null ? null : getBridge().getAppUrl();
            if (appUrl == null || appUrl.trim().isEmpty()) {
                showWebViewRecoveryPage(webView);
                return;
            }
            webView.stopLoading();
            webView.loadUrl(appUrl);
        }, WEBVIEW_RECOVERY_DELAY_MS);
    }

    private void showWebViewRecoveryPage(WebView webView) {
        if (webViewRecoveryState.isPageCommitted() || webViewRecoveryState.isFallbackShown()) return;
        webViewRecoveryState.markFallbackShown();
        String appUrl = getBridge() == null ? "https://emmaus.co.za/" : getBridge().getAppUrl();
        String retryUrl = appUrl == null || appUrl.trim().isEmpty()
            ? "https://emmaus.co.za/"
            : appUrl;
        String escapedRetryUrl = retryUrl.replace("\\", "\\\\").replace("'", "\\'");
        String html =
            "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            + "<style>body{font-family: sans-serif;display:grid;place-items:center;min-height:100vh;"
            + "margin:0;padding:24px;box-sizing:border-box;color:#17352b;background:#fff;text-align:center}"
            + "main{max-width:340px}h1{font-size:24px;margin:0 0 12px}p{line-height:1.5;color:#5d6b65}"
            + "button{border:0;border-radius:999px;padding:13px 22px;background:#0a5738;color:#fff;"
            + "font-size:16px;font-weight:600}</style></head><body><main>"
            + "<h1>Emmaus is reconnecting</h1><p>The app could not load this time. Your account and progress are safe.</p>"
            + "<button onclick=\"location.href='" + escapedRetryUrl + "'\">Try again</button>"
            + "</main></body></html>";
        webView.loadDataWithBaseURL(retryUrl, html, "text/html", "UTF-8", retryUrl);
    }

    private void offerDailyRhythmWidget() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        AppWidgetManager manager = AppWidgetManager.getInstance(this);
        ComponentName provider = new ComponentName(this, DailyRhythmWidgetProvider.class);
        if (!manager.isRequestPinAppWidgetSupported()) return;
        if (manager.getAppWidgetIds(provider).length > 0) return;

        boolean alreadyRequested = getSharedPreferences(WIDGET_PROMPT_PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_PROMPT_REQUESTED, false);
        if (alreadyRequested) return;

        boolean requestOpened = manager.requestPinAppWidget(provider, null, null);
        if (requestOpened) {
            getSharedPreferences(WIDGET_PROMPT_PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_PROMPT_REQUESTED, true)
                .apply();
        }
    }
}
