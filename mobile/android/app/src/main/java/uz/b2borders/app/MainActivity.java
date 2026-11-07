package uz.b2borders.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Свои плагины регистрируются до запуска моста
        registerPlugin(PrintPlugin.class);
        registerPlugin(DevServerPlugin.class);
        // Отладочная сборка: адрес сервера, выбранный на телефоне (локальная сеть)
        CapConfig devConfig = DevServerPlugin.savedConfig(this);
        if (devConfig != null) config = devConfig;
        super.onCreate(savedInstanceState);
    }
}
