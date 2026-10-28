package app.zync.mobile;

import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Fängt zync://-Links ab:
 *   zync://connect?url=https://…  → Server-Adresse speichern und Zync laden
 *   zync://setup                  → Server-Adresse vergessen und Einrichtung zeigen
 */
@CapacitorPlugin(name = "ZyncApp")
public class ZyncAppPlugin extends Plugin {

    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        if (!"zync".equals(url.getScheme())) return null;
        String action = url.getHost();
        if ("connect".equals(action)) {
            String server = url.getQueryParameter("url");
            if (server == null || !server.matches("^https?://[^/\\s]+$")) return true;
            MainActivity.setServer(getContext(), server);
        } else if ("setup".equals(action)) {
            MainActivity.setServer(getContext(), null);
        } else {
            return true;
        }
        getActivity().runOnUiThread(() -> MainActivity.restart(getActivity()));
        return true;
    }
}
