package uz.b2borders.app;

import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;

public class MainActivity extends BridgeActivity {
    private OfflineRetryPlugin.Client webClient;
    private ConnectivityManager connectivity;
    private ConnectivityManager.NetworkCallback networkCallback;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Свои плагины регистрируются до запуска моста
        registerPlugin(PrintPlugin.class);
        registerPlugin(DevServerPlugin.class);
        registerPlugin(PushStatusPlugin.class);
        registerPlugin(OfflineRetryPlugin.class);
        // Отладочная сборка: адрес сервера, выбранный на телефоне (локальная сеть)
        CapConfig devConfig = DevServerPlugin.savedConfig(this);
        if (devConfig != null) config = devConfig;
        super.onCreate(savedInstanceState);
        // «Нет связи» → «Повторить» открывает ту же страницу, а не начало (OfflineRetryPlugin)
        webClient = new OfflineRetryPlugin.Client(bridge);
        bridge.setWebViewClient(webClient);
        watchNetwork();
    }

    // Интернет вернулся, а на экране страница «Нет связи» — возвращаемся в приложение сами, без нажатия
    private void watchNetwork() {
        try {
            connectivity = getSystemService(ConnectivityManager.class);
            if (connectivity == null) return;
            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    // Небольшая пауза: сеть появилась, но соединение ещё поднимается
                    WebView view = bridge == null ? null : bridge.getWebView();
                    if (view != null) view.postDelayed(MainActivity.this::recoverIfOffline, 1500);
                }
            };
            connectivity.registerDefaultNetworkCallback(networkCallback);
        } catch (Exception e) {
            // Без слежения за сетью остаются кнопка «Повторить» и проверка при возврате в приложение
            networkCallback = null;
        }
    }

    private void recoverIfOffline() {
        if (bridge == null || webClient == null) return;
        WebView view = bridge.getWebView();
        if (view != null && webClient.onErrorPage(view)) webClient.retry(view, false);
    }

    @Override
    public void onResume() {
        super.onResume();
        // Приложение снова открыли, пока оно показывало «Нет связи» — пробуем вернуться
        recoverIfOffline();
    }

    @Override
    public void onPause() {
        super.onPause();
        // Cookie входа сразу на диск (иначе WebView пишет их раз в ~30 с): вход переживает закрытие приложения
        CookieManager.getInstance().flush();
    }

    @Override
    public void onDestroy() {
        if (connectivity != null && networkCallback != null) {
            try {
                connectivity.unregisterNetworkCallback(networkCallback);
            } catch (Exception ignored) {
                // уже снят
            }
        }
        super.onDestroy();
    }
}
