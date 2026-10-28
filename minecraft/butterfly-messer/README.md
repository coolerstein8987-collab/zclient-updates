# Z Butterfly-Messer (Minecraft Java 1.21.6 – 1.21.11)

Ein 3D-Butterfly-Messer (Balisong) im Neon-Look für Minecraft, gemacht für den Z Client (1.21.11).
Eigenes Design nach dem Vorbild des Valorant-Messers, ohne Logos oder Dateien von Riot.

![Vorschau](vorschau.png)

**Was drin ist**

- **3D-Modell:** Klinge mit Fase, erhöhter Rückenplatte und Akzentlinien, zwei Griffe mit
  Leucht-Einlagen, Schrauben, Führungsschienen, Verschluss und Z-Logo
- **Dein echter Arm in der Ego-Sicht:** Mit dem kleinen Mod [Z Messer-Hand](#mod-z-messer-hand) hält dein
  Minecraft-Arm (mit deinem Skin) das Messer – auch beim Inspect
- **Inspect:** Messer hochnehmen, zeigen, ein ganzer Dreher, Flip zu und wieder auf (3,3 Sekunden)
- **Flips:** schnelle Flip-Schleife (2 Sekunden pro Durchgang)
- **Leuchtspur:** Bei jeder Drehung zieht die Klinge eine durchscheinende, leuchtende Spur
  mit hellem Rand, Linien und Funken – in der Farbe des Messers
- **Vier Farben:** Neon (Gelb/Grün), Rot, Gold, Blau
- **Leuchtet im Dunkeln:** Einlagen, Köpfe, Seitenleisten, Klingenlinien und Spuren

## Installieren

1. [`Z-Butterfly-Messer-Ressourcenpaket.zip`](Z-Butterfly-Messer-Ressourcenpaket.zip) herunterladen
   (nicht entpacken).
2. In den Ordner `resourcepacks` deines Minecraft- bzw. Z-Client-Ordners legen.
3. Im Spiel unter **Optionen → Ressourcenpakete** aktivieren.

## Mod: Z Messer-Hand

Minecraft blendet den Arm aus, sobald man etwas in der Hand hält – das kann kein Ressourcenpaket ändern.
Dafür gibt es den Mod [`Z-Messer-Hand-Mod.jar`](Z-Messer-Hand-Mod.jar) (Fabric, Minecraft 1.21.11,
Quellcode in [`../zknife-hand/`](../zknife-hand/)):

1. Die Datei in den Ordner `mods` deines Z-Client- bzw. Fabric-Ordners legen.
2. Das Ressourcenpaket muss aktiv sein.

Er braucht nur den Fabric Loader (kein Fabric API) und ändert nur die Ego-Sicht, wenn du das Messer hältst.
Ohne Mod siehst du in der Ego-Sicht nur das Messer (wie bei jedem Gegenstand in Minecraft).

## Steuerung im Spiel

| Taste | Was passiert |
| --- | --- |
| Rechtsklick halten | Inspect (läuft einmal ab, danach Ruhehaltung) |
| Schleichen + Rechtsklick halten | Flips in Dauerschleife |

Das funktioniert mit einem Messer aus Befehl oder Datenpaket (B und C unten).

## Messer bekommen

**A) Schwert im Amboss umbenennen** (geht auch im Überleben und auf Servern):

| Name im Amboss | Farbe |
| --- | --- |
| `Butterfly` (oder `Butterfly Messer`, `Balisong`) | Neon |
| `Butterfly Rot` | Rot |
| `Butterfly Gold` | Gold |
| `Butterfly Blau` | Blau |

Funktioniert mit jedem Schwert (Holz bis Netherit), aber ohne Inspect und Flips.

**B) Befehl** (Cheats an), mit Inspect und Flips:

```
/give @s iron_sword[item_model="zknife:butterfly_neon",item_name="Butterfly Neon",consumable={consume_seconds:100000,animation:"none",has_consume_particles:false},use_effects={can_sprint:true,speed_multiplier:1}]
```

Für die anderen Farben `neon` durch `rot`, `gold` oder `blau` ersetzen.

**C) Datenpaket** (nur 1.21.11): [`Z-Butterfly-Messer-Datenpaket.zip`](Z-Butterfly-Messer-Datenpaket.zip) in den
Ordner `datapacks` der Welt legen (oder beim Erstellen der Welt hinzufügen). Dann:

- **Herstellen:** Eisenschwert + Farbstoff + Glowstone-Staub (formlos) –
  Hellgrün = Neon, Rot = Rot, Gelb = Gold, Hellblau = Blau
- **Befehl:** `/function zknife:neon` (oder `rot`, `gold`, `blau`, `alle`)

## Gut zu wissen

- Andere Spieler sehen das Modell nur, wenn sie das Ressourcenpaket auch aktiviert haben.
  Ohne Paket sehen sie ein normales Eisenschwert.
- Die Leuchtspur gibt es beim Inspect und bei den Flips. Spuren bei normalen Schwerthieben
  (wie im Afterswing-Video) gehen nur mit einem Mod, nicht mit einem Ressourcenpaket.
- Beim Inspect und bei den Flips kannst du normal laufen und sprinten. Solange du Rechtsklick hältst,
  wird nicht angegriffen und mit der zweiten Hand kein Block gesetzt.
- Schaden und Haltbarkeit sind die eines Eisenschwerts (beim Umbenennen die des jeweiligen Schwerts).

## Selbst anpassen

Alles wird von [`tools/build.py`](tools/build.py) erzeugt: Form, Farben, Spuren, Inspect,
Flips und beide Pakete. Die Arm-Haltung für den Mod steht dort ebenfalls (`MOD_…`) und muss zu
`../zknife-hand/src/main/java/de/zclient/zknifehand/KnifeHand.java` passen. Farben ändern: `VARIANTS` im Skript anpassen, dann bauen:

```
pip install pillow
python3 tools/build.py
```

Die Pakete landen wieder in diesem Ordner. Die entpackten Dateien und eine 3D-Vorschau zum Drehen,
mit Inspect und Flips (`build/vorschau.html`, im Browser öffnen), kommen nach `build/`.
