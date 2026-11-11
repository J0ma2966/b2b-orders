package uz.b2borders.app;

import android.os.Bundle;
import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;

public class MainActivity extends BridgeActivity {
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
        bridge.setWebViewClient(new OfflineRetryPlugin.Client(bridge));
    }

    @Override
    public void onPause() {
        super.onPause();
        // Cookie входа сразу на диск (иначе WebView пишет их раз в ~30 с): вход переживает закрытие приложения
        CookieManager.getInstance().flush();
    }
}
