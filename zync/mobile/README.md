# Zync – Handy-App (Android & iOS)

Es gibt zwei Wege, Zync aufs Handy zu bringen:

## 1. Als App installieren (PWA) – ohne App Store, sofort

1. Zync-Server mit **HTTPS** erreichbar machen (siehe Haupt-README).
2. Die Adresse im Handy-Browser öffnen.
   - **Android (Chrome):** Menü ⋮ → „App installieren“ / „Zum Startbildschirm hinzufügen“.
   - **iPhone (Safari):** Teilen-Symbol → „Zum Home-Bildschirm“.
3. Zync startet danach im Vollbild wie eine normale App, mit eigenem Icon.

## 2. Native App bauen (Capacitor)

Voraussetzungen: Node.js 22, für Android **Android Studio**, für iOS **Xcode** (nur auf dem Mac).

```bash
cd mobile
npm install
# In capacitor.config.json bei "server.url" die Adresse deines Zync-Servers eintragen!
npx cap add android      # bzw. npx cap add ios
npx cap sync
npx cap open android     # öffnet Android Studio → ▶ Run oder Build → APK
```

### Berechtigungen für Anrufe

**Android** – in `android/app/src/main/AndroidManifest.xml` innerhalb von `<manifest>` ergänzen:

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.CAMERA" />
```

**iOS** – in `ios/App/App/Info.plist` ergänzen:

```xml
<key>NSMicrophoneUsageDescription</key><string>Zync braucht das Mikrofon für Sprachanrufe.</string>
<key>NSCameraUsageDescription</key><string>Zync braucht die Kamera für Videoanrufe.</string>
```

> Hinweis: Bildschirmübertragung (Screen-Share) unterstützen mobile Browser/WebViews nicht –
> am Handy kannst du Streams aber **anschauen**, chatten, callen und Video nutzen.
