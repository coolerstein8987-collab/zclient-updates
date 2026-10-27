# ⚡ Zync – Verbinde. Teile. Vibe.

Zync ist eine moderne Chat-, Voice- und Streaming-App – wie Discord, nur ohne Bezahlschranke:
GIF-Profilbilder, Banner, Streams in 4K/60 und alle Designs sind für alle kostenlos.
Läuft im **Browser**, als **Handy-App** und als **Desktop-App (Windows/macOS/Linux)**.

| Chat | Profil | Profil-Editor |
|---|---|---|
| ![Chat](docs/chat.jpg) | ![Profil](docs/profil-popout.jpg) | ![Profil-Editor](docs/profil-editor.jpg) |
| **Zuschnitt (Zoom & Ziehen, GIF bleibt animiert)** | **Eingehender Anruf** | **Theme „Sakura“ + Sprechblasen** |
| ![Zuschnitt](docs/zuschnitt.jpg) | ![Anruf](docs/anruf.jpg) | ![Sakura](docs/theme-sakura.jpg) |

![Handy-Ansicht](docs/handy.jpg)

## Was Zync kann

**Chat**
- Nachrichten mit Markdown (**fett**, *kursiv*, `Code`, Codeblöcke, `||Spoiler||`, Zitate, Listen, Überschriften), bis 4000 Zeichen
- Antworten, Bearbeiten (auch mit ↑), Löschen, Anpinnen, Reaktionen, Suche im Kanal, Ungelesen-Marker
- Fotos, Videos, GIFs & Dateien bis **100 MB** (Drag & Drop, Einfügen aus der Zwischenablage, Spoiler-Markierung)
- Emoji-Picker mit Suche & „Zuletzt benutzt“, `:shortcodes:`, Emoticons (`:)` → 🙂), große Emojis
- **Sticker**: animiertes Zynci-Paket (16 Sticker) + eigene Sticker hochladen
- **GIF-Favoriten**: jedes Bild/GIF im Chat mit ⭐ speichern
- @Erwähnungen mit Autovervollständigung, @everyone, „… schreibt“-Anzeige

**Freunde & Server**
- Freunde per Benutzername hinzufügen, Anfragen annehmen/ablehnen, entfernen, blockieren, „Gerade aktiv“
- Direktnachrichten und Anrufe 1:1
- Server erstellen mit Vorlagen (Freunde, Gaming, Anime-Fanclub, Community, Lerngruppe …)
- Text- & Sprachkanäle, Kategorien, Einladungslinks, Rollen (Besitzer/Admin/Mitglied), Spitznamen, Kick, Besitz übertragen
- Server-Icon & Banner (auch GIF) mit Zuschnitt, Akzentfarbe, öffentlich in „Entdecken“

**Voice, Video & Streams**
- Sprachkanäle und DM-Anrufe (Klingeln, Annehmen mit/ohne Video, Ablehnen)
- Kamera, **Bildschirmübertragung bis 4K/60 FPS** mit Systemton, Bild-in-Bild, Vollbild, Spotlight
- Mikrofon-Pipeline: Rauschunterdrückung, Echounterdrückung, Auto-Verstärkung, Eingangslautstärke bis 200 %,
  automatische oder manuelle Empfindlichkeit, **Push-to-Talk**, Opus bis 256 kbps
- Lautstärke pro Person (Rechtsklick auf Kachel), Ausgabegerät wählbar, Mikrofon-Test mit Pegelanzeige, Kamera-Vorschau

**Profil**
- Profilbild & Banner **auch als GIF**, vorher zoomen und Ausschnitt verschieben (Maus, Mausrad, Pinch, Pfeiltasten)
- Anzeigename, Pronomen, Status-Text, „Über mich“ (Markdown), **Tags** (z. B. HxH, Anime, Gaming …), „Vibe“/Lieblingssong
- Profil-Farbverlauf, **Avatar-Dekos** (Aurora-Ring, Neon, Flammen, Sakura, Heiligenschein, Katzenohren, Glitch, Orbit, Herzen)
- **Profil-Effekte** (Funkeln, Schnee, Herzen, Sternenhimmel, Kirschblüten, Glut, Blasen)
- **Namens-Stil**: Schriftart (Elegant, Script, Pixel, Marker …), Effekt (Glühen, Schimmern, Regenbogen, Welle), Farbverlauf
- Status: Online, Abwesend, Nicht stören, Unsichtbar

**Einstellungen**
- **Darstellung**: 11 Themes (Nacht, AMOLED, Graphit, Hell, Aurora, Ozean, Wald, Sakura, Sunset, Cyber, Latte), Akzentfarben mit
  Verlauf, Schriftarten, UI-/Chat-Skalierung, Eckenrundung, Sättigung, Dichte, Sprechblasen-Modus, **PC-/Handy-Ansicht erzwingen**
- **Effekte & 3D**: animierte Hintergründe (Aurora, 3D-Partikel, Retro-Grid, Wellen, Orbs), Parallax, Glassmorphism,
  Neon-Glow, 3D-Tilt-Karten, 3D-Server-Icons, Animationen reduzieren/aus
- **App-Icon**: 11 Logo-Varianten (Tab-Icon, Desktop-Fenster, Tray)
- **Chat**, **Benachrichtigungen** (Desktop, Sounds, Lautstärke), **Tastenkürzel** (frei belegbar), **Privatsphäre**

## Schnellstart

Voraussetzung: **Node.js 22.5 oder neuer** (nutzt die eingebaute SQLite-Datenbank – keine weiteren Datenbanken nötig).

```bash
cd zync
npm run install:all     # Abhängigkeiten für Server und Client installieren
npm run dev             # Entwicklung: http://localhost:5173
```

Für den echten Betrieb:

```bash
npm start               # baut den Client und startet alles auf http://localhost:3001
```

Daten (Datenbank + Uploads) liegen in `server/data/`.

## Online stellen (für Freunde, Handy, andere PCs)

Mikrofon, Kamera und Bildschirmübertragung funktionieren im Browser nur über **HTTPS** (oder `localhost`).
Am einfachsten: Zync hinter einen Reverse-Proxy mit automatischem Zertifikat stellen, z. B. [Caddy](https://caddyserver.com):

```
zync.deine-domain.de {
    reverse_proxy localhost:3001
}
```

| Umgebungsvariable | Bedeutung |
|---|---|
| `PORT` | Port des Servers (Standard `3001`) |
| `ZYNC_DATA` | Ordner für Datenbank und Uploads (Standard `server/data`) |
| `ZYNC_TLS_CERT`, `ZYNC_TLS_KEY` | Pfade zu Zertifikat/Schlüssel → Zync spricht direkt HTTPS |
| `ZYNC_TRUST_PROXY=1` | Hinter einem Reverse-Proxy setzen (korrekte IPs fürs Rate-Limit) |
| `ZYNC_TURN_URL`, `ZYNC_TURN_USER`, `ZYNC_TURN_PASS` | TURN-Server für Anrufe durch strenge Firewalls/Mobilfunk (z. B. [coturn](https://github.com/coturn/coturn)) |

Anrufe und Streams laufen direkt zwischen den Teilnehmern (WebRTC, Peer-to-Peer) – der Server vermittelt nur.
Ohne TURN-Server klappt das in den meisten Heimnetzen; in Firmen-/Schulnetzen oder im Mobilfunk hilft ein TURN-Server.

## Handy-App

- **Sofort (PWA):** Zync-Adresse im Handy-Browser öffnen → „Zum Startbildschirm hinzufügen“. Läuft dann im Vollbild wie eine App.
- **Native App (Android/iOS):** siehe [`mobile/README.md`](mobile/README.md) (Capacitor).

Die Oberfläche erkennt Handys automatisch (eigene Handy-Ansicht mit Tab-Leiste, Wischnavigation, Bottom-Sheets).
In *Einstellungen → Darstellung → Ansicht* kann man die Handy- oder PC-Ansicht auch erzwingen.

## Desktop-App (Windows, macOS, Linux)

```bash
cd desktop
npm install
npm start                       # verbindet sich mit http://localhost:3001
ZYNC_URL=https://zync.deine-domain.de npm start
npm run dist:win                # Installer bauen (bzw. dist:mac / dist:linux)
```

Extras der Desktop-App: eigene Fensterleiste, Bildschirm-/Fensterauswahl beim Streamen, Systemton-Übertragung (Windows),
Tray-Icon, im Hintergrund weiterlaufen, globale Tastenkürzel (Strg+Shift+M stumm, Strg+Shift+D Ton aus), App-Icon-Varianten.
Die Server-Adresse lässt sich jederzeit über das Tray-Menü ändern.

## Projektstruktur

```
zync/
├── server/      Node.js + Express + Socket.IO + SQLite (Accounts, Freunde, Server, Nachrichten, Uploads, Voice-Signalisierung)
├── client/      React + Vite (Web-App, PWA, Handy- und PC-Ansicht)
├── desktop/     Electron-Hülle für Windows/macOS/Linux
├── mobile/      Capacitor-Projekt für Android/iOS
└── docs/        Screenshots
```

## Tastenkürzel

| Kürzel | Aktion |
|---|---|
| `Strg + K` | Schnellsuche (Kanäle, Personen, Server) |
| `Strg + Shift + M` / `D` | Stummschalten / Ton aus |
| `V` (gedrückt halten) | Push-to-Talk (wenn aktiviert, frei belegbar) |
| `Enter` / `Shift + Enter` | Senden / neue Zeile |
| `↑` | Letzte eigene Nachricht bearbeiten |
| `Tab` | @Erwähnung oder :emoji: vervollständigen |
| `Shift + Klick` auf 🗑 | Ohne Nachfrage löschen |
