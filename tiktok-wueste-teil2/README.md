# Teil 2 – Ausgesetzt in der Wüste Ägyptens (TikTok, 9:16)

**Story:** Globus-Zoom auf Ägypten → Regel 1: bis zu 50 °C, tagsüber Schatten, nur nachts laufen (Zeitraffer Tag → Nacht)
→ Regel 2: Kleidung anlassen → Gefahren: Hornviper & Deathstalker (3D-Modelle) → Gebissen? Checkliste
(✓ ruhig bleiben/stillhalten, ✕ nicht aussaugen, ✕ nicht abbinden, Notruf Ägypten 123)
→ Abstimmung „Wasser oder Essen?“ in den Kommentaren; der Gewinner kommt im nächsten Teil.

## Dateien
- `out/wueste_teil2_tiktok.mp4` – fertiges Video mit Stimme, Musik und Effekten
- `out/wueste_teil2_ohne_stimme.mp4` – nur Musik + Effekte
- `scene.js` – 3D-Szenen: Globus, Dünenlandschaft mit Hitzeflimmern, Tag/Nacht, Figur, Hornviper, Deathstalker
- `audio.py` – Musik in D-Phrygisch-Dominant mit Darbuka-Rhythmus, Wüsten-Soundeffekte, Mix auf −14 LUFS
- `voice/lines.txt` – Sprechertext (Platzhalter-Stimme via `gen_voice.sh`)

## Mit ElevenLabs-Stimme neu bauen
```bash
TEMPO=1.1 INTRA=0.17 python3 import_voice.py voice/elevenlabs_roger.mp3 && START=0.2 GAP=0.18 TAIL=1.0 python3 build_timeline.py
python3 serve.py 8124 & DUMP=1 node preview.cjs 1      # events.json für den Sound
node render.cjs 0 2 & node render.cjs 1 2               # Frames
GAIN=1.2 python3 audio.py && ./make_video.sh            # (VOICE=pico für die Platzhalter-Stimme)
```
Benötigt `node_modules` wie in `../tiktok-point-nemo` (three, three-globe, world-atlas, topojson-client, @fontsource/anton).
