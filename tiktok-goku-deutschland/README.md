# „Was wäre, wenn Son Goku aus Deutschland käme?“ (TikTok, 9:16)

Fan-Parodie im 3D-Spielzeug-Stil: Goku heißt Jürgen, braucht einen Antrag fürs Kamehameha (Formular K-3, dreifach),
darf in der Ruhezeit nicht trainieren, wartet auf die Bahn (+20 Min), trennt die Dragon Balls, reserviert um 6 Uhr
die Strandliege in Socken und Sandalen, Kraftlevel über 9000 – die Steuererklärung auch. Schluss: „Welches Land als Nächstes?“

- `out/goku_deutschland_tiktok.mp4` – Video (aktuell mit Platzhalter-Stimme)
- `out/goku_deutschland_ohne_stimme.mp4` – nur Polka-Musik + Comic-Sounds
- `scene.js` – Figur und Sets komplett aus eigenen 3D-Grundformen (keine Original-Grafiken/-Sounds)

## Mit ElevenLabs-Stimme neu bauen
```bash
TEMPO=1.0 python3 import_voice.py voice/<datei>.mp3 && START=0.2 GAP=0.18 TAIL=1.0 python3 build_timeline.py
python3 serve.py 8125 & DUMP=1 node preview.cjs 1
node render.cjs 0 2 & node render.cjs 1 2
GAIN=1.25 python3 audio.py && ./make_video.sh
```
