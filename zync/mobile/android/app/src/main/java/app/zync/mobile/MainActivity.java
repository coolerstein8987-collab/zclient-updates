package app.zync.mobile;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Zync als Android-App: Beim ersten Start fragt die App nach der Server-Adresse
 * (www/index.html), danach lädt sie Zync direkt von diesem Server – Updates des
 * Servers sind damit sofort in der App, ohne neue APK.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "Zync";
    private static final String PREFS = "zync";
    private static final String KEY_SERVER = "server";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ZyncAppPlugin.class);
        String server = getServer(this);
        if (server != null) {
            CapConfig remote = remoteConfig(server);
            if (remote != null) config = remote;
        }
        super.onCreate(savedInstanceState);
        setupWindow();
        setupBackButton();
    }

    /** Randlos zeichnen, aber Statusleiste, Navigationsleiste und Tastatur freihalten. */
    private void setupWindow() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(false);
        if (bridge == null) return;
        WebView webView = bridge.getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
            Insets sys = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            ViewGroup.MarginLayoutParams lp = (ViewGroup.MarginLayoutParams) v.getLayoutParams();
            lp.leftMargin = sys.left;
            lp.topMargin = sys.top;
            lp.rightMargin = sys.right;
            lp.bottomMargin = Math.max(sys.bottom, ime.bottom);
            v.setLayoutParams(lp);
            return WindowInsetsCompat.CONSUMED;
        });
        // Downloads (Anhänge) im Browser bzw. Download-Manager öffnen
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url.startsWith("http")) openExternal(this, Uri.parse(url));
        });
    }

    /** Zurück-Taste: erst innerhalb von Zync zurück (Fenster schließen, Chat verlassen), sonst App minimieren. */
    private void setupBackButton() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = bridge != null ? bridge.getWebView() : null;
                if (webView != null && webView.canGoBack()) webView.goBack();
                else moveTaskToBack(true);
            }
        });
    }

    private CapConfig remoteConfig(String server) {
        try {
            JSONObject json = new JSONObject(readAsset("capacitor.config.json"));
            JSONObject srv = json.optJSONObject("server");
            if (srv == null) srv = new JSONObject();
            srv.put("url", server);
            srv.put("errorPath", "offline.html");
            if (server.startsWith("http://")) srv.put("cleartext", true);
            json.put("server", srv);
            File dir = new File(getFilesDir(), "zync-config");
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Kann " + dir + " nicht anlegen");
            try (FileOutputStream out = new FileOutputStream(new File(dir, "capacitor.config.json"))) {
                out.write(json.toString().getBytes(StandardCharsets.UTF_8));
            }
            return CapConfig.loadFromFile(this, dir.getAbsolutePath());
        } catch (Exception e) {
            Log.e(TAG, "Server-Konfiguration fehlgeschlagen", e);
            return null;
        }
    }

    private String readAsset(String name) throws IOException {
        try (InputStream in = getAssets().open(name); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            for (int n; (n = in.read(buf)) != -1; ) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }

    static String getServer(Context context) {
        return context.getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_SERVER, null);
    }

    static void setServer(Context context, String server) {
        context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_SERVER, server).apply();
    }

    /** Startet die App neu, damit eine geänderte Server-Adresse greift. */
    static void restart(Activity activity) {
        Intent intent = new Intent(activity, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        activity.startActivity(intent);
        activity.finish();
        activity.overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
    }

    static void openExternal(Context context, Uri uri) {
        try {
            context.startActivity(new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (ActivityNotFoundException e) {
            Log.w(TAG, "Keine App für " + uri, e);
        }
    }
}
