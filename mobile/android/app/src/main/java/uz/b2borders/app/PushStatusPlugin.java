package uz.b2borders.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Есть ли в сборке Firebase (google-services.json). Без него регистрация push на Android
// падает, поэтому приложение спрашивает это до PushNotifications.register().
@CapacitorPlugin(name = "PushStatus")
public class PushStatusPlugin extends Plugin {
    @PluginMethod
    public void status(PluginCall call) {
        // Строку google_app_id создаёт плагин com.google.gms.google-services из google-services.json
        int id = getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName());
        JSObject result = new JSObject();
        result.put("firebase", id != 0);
        call.resolve(result);
    }
}
