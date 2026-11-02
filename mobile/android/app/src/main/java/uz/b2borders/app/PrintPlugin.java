package uz.b2borders.app;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Печать / PDF чека и накладной: window.print() во встроенном браузере Android не работает
@CapacitorPlugin(name = "Printer")
public class PrintPlugin extends Plugin {
    @PluginMethod
    public void printPage(PluginCall call) {
        String title = call.getString("title", "Документ");
        getActivity().runOnUiThread(() -> {
            WebView webView = getBridge().getWebView();
            PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
            if (manager == null) {
                call.reject("Печать недоступна");
                return;
            }
            PrintDocumentAdapter adapter = webView.createPrintDocumentAdapter(title);
            manager.print(title, adapter, new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
            call.resolve();
        });
    }
}
