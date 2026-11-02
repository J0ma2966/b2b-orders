package uz.b2borders.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Свои плагины регистрируются до запуска моста
        registerPlugin(PrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
