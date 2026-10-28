# Z Messer-Hand (Fabric-Mod, Minecraft 1.21.11)

Kleiner Client-Mod zum [Z Butterfly-Messer](../butterfly-messer/README.md): Hältst du das Messer,
zeichnet er in der Ego-Sicht deinen echten Minecraft-Arm (mit deinem Skin und Ärmel) und setzt das
Messer in die Faust – genau so, wie Minecraft es in der 3. Person macht. Inspect, Flips und Leuchtspur
kommen weiter aus dem Ressourcenpaket; beim Inspect bewegt der Mod zusätzlich den Arm.

- Nur Fabric Loader nötig, kein Fabric API
- Greift nur ein, wenn du das Messer hältst (Befehl/Rezept oder umbenanntes Schwert bei aktivem Paket)
- Die fertige Datei baut GitHub automatisch: [`../butterfly-messer/Z-Messer-Hand-Mod.jar`](../butterfly-messer/Z-Messer-Hand-Mod.jar)

Selbst bauen (Java 25 für Gradle, der Mod selbst läuft mit Java 21):

```
./gradlew build
```
