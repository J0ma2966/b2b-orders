package uz.b2borders.app;

import android.net.Uri;
import android.util.Log;
import android.webkit.WebBackForwardList;
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
import org.json.JSONObject;

// Возврат в приложение со страницы «Нет связи» (mobile/www/offline.html).
//
// Важно: при зашитом адресе сервера Capacitor подключает свой JS-мост (window.Capacitor) только на
// страницах сервера, а страницу «Нет связи» отдаёт как есть, без моста. Поэтому со страницы «Нет связи»
// плагины недоступны, и вызвать OfflineRetry.open() из неё нельзя: раньше «Повторить» из-за этого уходил
// на https://localhost/index.html и снова попадал на «Нет связи», даже когда интернет уже вернулся.
// Теперь возврат целиком нативный и от моста не зависит (см. Client):
//  • «Повторить» — страница переходит на служебный адрес https://localhost/__offline_retry, приложение
//    перехватывает его, проверяет связь и само открывает страницу, которая не загрузилась;
//  • интернет вернулся или приложение снова открыли — то же самое делается без нажатия.
// Плагин OfflineRetry оставлен для сборок, где мост на странице есть (выбор адреса сервера).
//
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
        // Служебный адрес кнопки «Повторить» (см. offline.html)
        static final String RETRY_PATH = "/__offline_retry";

        private final Bridge bridge;
        // Идёт проверка связи: второй раз не запускаем
        private volatile boolean probing;
        // Пока шла проверка, попросили ещё одну (например, сеть появилась в момент нажатия «Повторить»)
        private boolean again;
        // Сколько ещё раз проверить связь самим, если проверка не удалась
        private int autoLeft;
        // Запасной путь возврата (loadUrl): страница «Нет связи» убирается из истории целиком
        private boolean clearHistoryOnLoad;
        // Возврат начат и страница сервера пошла грузиться
        private boolean leaving;

        Client(Bridge bridge) {
            super(bridge);
            this.bridge = bridge;
        }

        // Сейчас на экране страница «Нет связи». Вызывать из главного потока.
        boolean onErrorPage(WebView view) {
            String current = view.getUrl();
            String error = bridge.getErrorUrl();
            return current != null && error != null && current.startsWith(error);
        }

        // Интернет вернулся или приложение снова открыли: пробуем вернуться сами, с несколькими попытками —
        // сеть уже «есть», а соединение с сервером может подняться на пару секунд позже.
        void recover(WebView view) {
            autoLeft = 4;
            retry(view, false);
        }

        // Проверить связь и, если сервер отвечает, открыть страницу, которая не загрузилась.
        // notify — сообщить странице «Нет связи», что связи всё ещё нет (после нажатия «Повторить»).
        void retry(final WebView view, final boolean notify) {
            final String url = targetUrl(bridge);
            if (url == null) return;
            if (probing) {
                again = true;
                return;
            }
            // Нажали «Повторить» ровно когда сеть возвращается: одна неудачная проверка не должна оставить на «Нет связи»
            if (notify) autoLeft = Math.max(autoLeft, 3);
            probing = true;
            new Thread(() -> {
                final boolean ok = reachable(url);
                view.post(() -> {
                    probing = false;
                    // Пока проверяли связь, страницу могли сменить — дальше только поверх «Нет связи»
                    if (!onErrorPage(view)) {
                        again = false;
                        autoLeft = 0;
                        return;
                    }
                    if (ok) {
                        again = false;
                        autoLeft = 0;
                        leave(view, url);
                        return;
                    }
                    if (notify) view.evaluateJavascript("window.offlineRetryFailed && window.offlineRetryFailed()", null);
                    if (again || autoLeft > 0) {
                        again = false;
                        if (autoLeft > 0) autoLeft--;
                        view.postDelayed(() -> {
                            if (onErrorPage(view)) retry(view, false);
                        }, 3000);
                    }
                });
            }).start();
        }

        // Уйти со страницы «Нет связи» на страницу сервера так, чтобы «Назад» потом работал как обычно:
        // страница «Нет связи» не должна остаться в истории, а остальная история должна сохраниться.
        private void leave(final WebView view, final String url) {
            leaving = false;
            WebBackForwardList list = view.copyBackForwardList();
            int current = list.getCurrentIndex();
            String previous = current > 0 ? list.getItemAtIndex(current - 1).getUrl() : null;
            Log.d("OfflineRetry", "leave: entries=" + list.getSize() + " current=" + current + " previous=" + previous + " target=" + url);
            if (url.equals(previous)) {
                // Перед «Нет связи» в истории стоит сама незагрузившаяся страница — возвращаемся на неё, она загрузится заново
                view.goBack();
            } else {
                // Иначе страница «Нет связи» заменяется нужной страницей на своём месте в истории
                view.evaluateJavascript("location.replace(" + JSONObject.quote(url) + ")", null);
            }
            // Запасной путь: если за 2,5 с ничего не началось, открываем страницу напрямую
            view.postDelayed(() -> {
                if (leaving || !onErrorPage(view)) return;
                Log.d("OfflineRetry", "leave: fallback loadUrl");
                clearHistoryOnLoad = true;
                view.loadUrl(url);
            }, 2500);
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            String error = bridge.getErrorUrl();
            if (url != null && (error == null || !url.startsWith(error))) leaving = true;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            if (clearHistoryOnLoad && !onErrorPage(view)) {
                clearHistoryOnLoad = false;
                view.clearHistory();
            }
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
            if (url != null && url.getHost() != null && url.getHost().equalsIgnoreCase(bridge.getHost())) {
                // «Повторить»: переход отменяется, возврат делает само приложение
                if (RETRY_PATH.equals(url.getPath()) && bridge.getServerUrl() != null) {
                    retry(view, true);
                    return true;
                }
                return false;
            }
            return super.shouldOverrideUrlLoading(view, request);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            remember(request);
            super.onReceivedError(view, request, error);
        }

        // Ответ сервера с ошибкой — не «нет связи». Страницы «не найдено» (404), «нет доступа» (403) и
        // другие сервер рисует сам, и их надо показать. Capacitor же на любой такой ответ открывает
        // страницу «Нет связи». Её оставляем только для 502/503/504: сервер перезапускается или недоступен.
        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
            int status = errorResponse == null ? 0 : errorResponse.getStatusCode();
            if (status != 502 && status != 503 && status != 504) return;
            remember(request);
            super.onReceivedHttpError(view, request, errorResponse);
        }
    }

    // Адрес только своего сервера: чужой хост открылся бы во внешнем браузере
    private static String sameServer(String candidate, String server) {
        if (candidate == null || server == null) return null;
        Uri a = Uri.parse(candidate);
        Uri b = Uri.parse(server);
        if (a.getHost() == null || b.getHost() == null) return null;
        boolean same = a.getHost().equalsIgnoreCase(b.getHost()) && a.getScheme() != null && a.getScheme().equals(b.getScheme()) && a.getPort() == b.getPort();
        return same ? candidate : null;
    }

    // Что открыть после возврата связи: страницу, которая не загрузилась, иначе начало сервера
    static String targetUrl(Bridge bridge) {
        String server = bridge.getServerUrl();
        String url = sameServer(lastFailedUrl, server);
        return url != null ? url : server;
    }

    private String targetUrl() {
        return targetUrl(getBridge());
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
