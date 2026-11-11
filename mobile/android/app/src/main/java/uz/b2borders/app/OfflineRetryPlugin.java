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
import java.net.HttpURLConnection;
import java.net.URL;

// Кнопка «Повторить» на странице «Нет связи» (mobile/www/offline.html).
// Capacitor показывает эту страницу с адреса https://localhost/offline.html. При зашитом адресе сервера
// localhost для него чужой сайт: любой переход туда (в том числе возврат на саму страницу «Нет связи»
// после неудачного повтора) уходил в системный браузер. Поэтому повтор делает само приложение:
// проверяет связь и открывает страницу, которая не загрузилась (если её нет — сервер из сборки).
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

        // Адреса самого приложения (https://localhost/…, в том числе страница «Нет связи») всегда остаются
        // в WebView. Иначе при зашитом адресе сервера Capacitor считает localhost чужим сайтом
        // и открывает его в системном браузере.
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request == null ? null : request.getUrl();
            if (url != null && url.getHost() != null && url.getHost().equalsIgnoreCase(bridge.getHost())) return false;
            return super.shouldOverrideUrlLoading(view, request);
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

    private String targetUrl() {
        String server = getBridge().getServerUrl();
        String url = sameServer(lastFailedUrl, server);
        return url != null ? url : server;
    }

    @PluginMethod
    public void target(PluginCall call) {
        JSObject result = new JSObject();
        result.put("url", targetUrl());
        call.resolve(result);
    }

    // Отвечает ли сервер: любой ответ HTTP значит, что связь есть
    private static boolean reachable(String url) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setRequestMethod("HEAD");
            connection.setConnectTimeout(6000);
            connection.setReadTimeout(6000);
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.getResponseCode();
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    // «Повторить»: сначала проверяем связь, и только если сервер отвечает, открываем страницу — из
    // самого приложения (WebView.loadUrl), а не переходом со страницы. Пока связи нет, страница
    // «Нет связи» остаётся на месте и ничего никуда не уходит.
    @PluginMethod
    public void open(PluginCall call) {
        final String url = targetUrl();
        if (url == null) {
            call.reject("Адрес сервера не задан");
            return;
        }
        new Thread(() -> {
            boolean ok = reachable(url);
            JSObject result = new JSObject();
            result.put("ok", ok);
            result.put("url", url);
            if (ok) getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(url));
            call.resolve(result);
        }).start();
    }
}
