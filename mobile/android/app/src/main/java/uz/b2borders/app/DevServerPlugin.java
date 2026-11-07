package uz.b2borders.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import com.getcapacitor.CapConfig;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

// Адрес сервера, выбранный в самом приложении (проверка в локальной сети по Wi-Fi).
// Работает только в отладочной сборке: в рабочей адрес зашит при сборке (capacitor.config.ts).
@CapacitorPlugin(name = "DevServer")
public class DevServerPlugin extends Plugin {

    private static final String PREFS = "dev_server";
    private static final String KEY_URL = "url";

    static boolean isDebuggable(Context context) {
        return (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String savedUrl(Context context) {
        if (!isDebuggable(context)) return null;
        return prefs(context).getString(KEY_URL, null);
    }

    // http(s)://хост[:порт] без пути; null — адрес не подходит
    static String normalize(String raw) {
        if (raw == null) return null;
        String value = raw.trim();
        if (value.isEmpty()) return null;
        if (!value.contains("://")) value = "http://" + value;
        Uri uri = Uri.parse(value);
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (host == null || host.isEmpty() || !("http".equals(scheme) || "https".equals(scheme))) return null;
        int port = uri.getPort();
        return scheme + "://" + host + (port > 0 ? ":" + port : "");
    }

    // Настройки Capacitor из сборки, но с выбранным адресом сервера; null — оставить как есть
    static CapConfig savedConfig(Activity activity) {
        String url = savedUrl(activity);
        if (url == null) return null;
        try {
            InputStream in = activity.getAssets().open("capacitor.config.json");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            in.close();
            JSONObject json = new JSONObject(out.toString(StandardCharsets.UTF_8.name()));
            JSONObject server = json.optJSONObject("server");
            if (server == null) {
                server = new JSONObject();
                json.put("server", server);
            }
            server.put("url", url);
            server.put("cleartext", true);
            File dir = new File(activity.getFilesDir(), "dev-server");
            if (!dir.exists() && !dir.mkdirs()) return null;
            FileOutputStream file = new FileOutputStream(new File(dir, "capacitor.config.json"));
            file.write(json.toString().getBytes(StandardCharsets.UTF_8));
            file.close();
            return CapConfig.loadFromFile(activity, dir.getAbsolutePath());
        } catch (Exception e) {
            Logger.error("DevServer: не удалось применить адрес сервера", e);
            return null;
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", isDebuggable(getContext()));
        result.put("url", savedUrl(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void set(PluginCall call) {
        if (!isDebuggable(getContext())) {
            call.reject("Только в отладочной сборке");
            return;
        }
        String url = normalize(call.getString("url"));
        if (url == null) {
            call.reject("Адрес вида http://192.168.1.10:3000");
            return;
        }
        prefs(getContext()).edit().putString(KEY_URL, url).commit();
        JSObject result = new JSObject();
        result.put("url", url);
        call.resolve(result);
        restart();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        prefs(getContext()).edit().remove(KEY_URL).commit();
        call.resolve();
        restart();
    }

    // Мост и WebView создаются заново с новыми настройками
    private void restart() {
        Activity activity = getActivity();
        activity.runOnUiThread(activity::recreate);
    }
}
