package uz.b2borders.app;

import android.net.Uri;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Кнопка «Повторить» на странице «Нет связи» (mobile/www/offline.html).
// Capacitor показывает эту страницу с адреса https://localhost/offline.html, где app-config.js
// не отдаётся, поэтому адрес для повтора берётся отсюда: страница, которая не открылась,
// а если её нет — сервер из сборки. Переход на localhost увёл бы в системный браузер.
@CapacitorPlugin(name = "OfflineRetry")
public class OfflineRetryPlugin extends Plugin {

    private static volatile String lastFailedUrl;

    // Запоминает адрес страницы, на которой случилась ошибка, и дальше работает как обычно
    static class Client extends BridgeWebViewClient {
        private final Bridge bridge;

        Client(Bridge bridge) {
            super(bridge);
            this.bridge = bridge;
        }

        private void remember(WebResourceRequest request) {
            if (request == null || !request.isForMainFrame()) return;
            Uri url = request.getUrl();
            if (url == null) return;
            String scheme = url.getScheme();
            if (!"https".equals(scheme) && !"http".equals(scheme)) return;
            // Сама страница ошибки и прочие адреса приложения (https://localhost/...) — не то, что надо повторять
            if (url.getHost() == null || url.getHost().equalsIgnoreCase(bridge.getHost())) return;
            lastFailedUrl = url.toString();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            remember(request);
            super.onReceivedError(view, request, error);
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
            remember(request);
            super.onReceivedHttpError(view, request, errorResponse);
        }
    }

    // Адрес только своего сервера: чужой хост открылся бы во внешнем браузере
    private String sameServer(String candidate, String server) {
        if (candidate == null || server == null) return null;
        Uri a = Uri.parse(candidate);
        Uri b = Uri.parse(server);
        if (a.getHost() == null || b.getHost() == null) return null;
        boolean same = a.getHost().equalsIgnoreCase(b.getHost()) && a.getScheme() != null && a.getScheme().equals(b.getScheme()) && a.getPort() == b.getPort();
        return same ? candidate : null;
    }

    @PluginMethod
    public void target(PluginCall call) {
        String server = getBridge().getServerUrl();
        String url = sameServer(lastFailedUrl, server);
        if (url == null) url = server;
        JSObject result = new JSObject();
        result.put("url", url);
        call.resolve(result);
    }
}
