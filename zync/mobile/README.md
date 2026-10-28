# Zync – Handy-App (Android & iOS)

## Android-App (APK) – fertig gebaut

GitHub Actions baut die App automatisch (`.github/workflows/zync-android.yml`), sobald sich etwas
in `zync/mobile/` ändert, und legt sie unter `zync/client/public/downloads/zync.apk` ab.
Jeder Zync-Server bietet sie damit direkt zum Download an:

- **Einstellungen → Zync-Apps** (bzw. im „Ich“-Tab am Handy: „Android-App holen“)
- oder direkt `https://<dein-server>/downloads/zync.apk`

Installieren:

1. APK am Handy herunterladen und öffnen (Chrome-Warnung → „Trotzdem herunterladen“).
2. „Aus dieser Quelle zulassen“ einschalten, dann **Installieren**.
3. Beim ersten Start die **Server-Adresse** eingeben (z. B. `dein-zync.onrender.com`).

Die App lädt Zync danach direkt von deinem Server – neue Funktionen sind sofort drin,
ohne neue APK. Server wechseln: Einstellungen → Zync-Apps → „Server-Adresse ändern“.

Signatur: Der Build nutzt einen festen Schlüssel aus dem GitHub-Actions-Cache, damit sich neue
APKs über die alte installieren lassen. GitHub löscht Caches, die 7 Tage nicht benutzt wurden –
meldet Android dann „App nicht installiert“, einmal die alte App deinstallieren. Dauerhaft stabil
wird es mit einem Repo-Secret `ZYNC_KEYSTORE_BASE64` (base64 eines Keystores mit Passwort
`android` und Alias `androiddebugkey`).

Was die App zusätzlich zur Website kann:

- eigenes Zync-Icon (inkl. Android-13-Themen-Icon) und Startbildschirm
- Vollbild mit dunkler Status- und Navigationsleiste, Tastatur schiebt den Chat mit
- Zurück-Taste schließt Fenster/Profil/Chat statt die App zu beenden
- Mikrofon und Kamera für Calls, Sprachnachrichten und Fotos
- Spracherkennung und Vorlesen für Zync KI (Diktieren und KI-Anruf) über die Android-Sprachdienste
- „Mit Discord anmelden“ direkt in der App
- Offline-Seite mit „Nochmal versuchen“, wenn der Server schläft (Render-Gratis-Plan)

Selbst bauen (Android Studio oder JDK 21 + Android-SDK):

```bash
cd zync/mobile
npm install
npx cap sync android
cd android && ./gradlew assembleDebug   # → app/build/outputs/apk/debug/app-debug.apk
```

Wichtige Dateien: `android/app/src/main/java/app/zync/mobile/MainActivity.java` (Server-Adresse,
Fenster, Zurück-Taste), `ZyncAppPlugin.java` (`zync://connect` / `zync://setup`),
`www/index.html` (Einrichtung) und `www/offline.html`.

## iPhone & iPad

Eine iOS-App braucht einen Mac mit Xcode und einen Apple-Developer-Account. Ohne das geht Zync
als Web-App: **Safari → Teilen → „Zum Home-Bildschirm“** – startet im Vollbild mit eigenem Icon.

Mit Mac: `npx cap add ios`, dann in `ios/App/App/Info.plist` ergänzen:

```xml
<key>NSMicrophoneUsageDescription</key><string>Zync braucht das Mikrofon für Sprachanrufe.</string>
<key>NSCameraUsageDescription</key><string>Zync braucht die Kamera für Videoanrufe.</string>
```

> Hinweis: Bildschirmübertragung (Screen-Share) unterstützen mobile Browser/WebViews nicht –
> am Handy kannst du Streams aber **anschauen**, chatten, callen und Video nutzen.
