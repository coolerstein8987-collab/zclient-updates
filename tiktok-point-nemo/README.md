# Point Nemo – TikTok-Video (Geografie, 28,5 s, 9:16)

**Story:** Der einsamste Ort der Welt → Point Nemo im Südpazifik → nächstes Land 2.688 km entfernt
→ die nächsten Menschen sind oft die Astronauten auf der ISS (400 km) → deshalb Raumschiff-Friedhof
(260+ Wracks, u. a. die MIR) → bald stürzt auch die ISS hier ab → „Folg mir für mehr verrückte Orte!“

## Dateien
- `out/point_nemo_tiktok.mp4` – fertiges Video mit Stimme, Musik und Soundeffekten (1080×1920, 30 fps, −14 LUFS)
- `out/point_nemo_ohne_stimme.mp4` – gleiches Video nur mit Musik + Effekten (zum Selbst-Einsprechen oder für TikToks Text-to-Speech)
- `index.html` + `scene.js` – 3D-Szene (Three.js: Erde mit Atmosphäre, Wolken, Nachtlichtern, ISS-Modell, Meteoren, Bloom, Glitch, Chromatic Aberration), jeder Frame ist eine reine Funktion der Zeit
- `voice/lines.txt` – Sprechertext; `gen_voice.sh` erzeugt die Stimme (SVOX Pico, Deutsch)
- `build_timeline.py` – berechnet Satz- und Wort-Timings für die Untertitel aus den Sprachaufnahmen
- `audio.py` – synthetisiert Musik (D-Moll, 120 BPM), alle Soundeffekte und den Mix
- `render.cjs` – rendert die Frames mit Headless-Chromium; `make_video.sh` kodiert die MP4s

## Neu rendern
```bash
npm install three@0.160.0 three-globe world-atlas topojson-client @fontsource/anton
sudo apt-get install libttspico-utils sox ffmpeg fonts-inter fonts-noto-color-emoji
pip install numpy scipy
./gen_voice.sh && python3 build_timeline.py
python3 serve.py 8123 &                         # lokaler Server für die Szene
node preview.cjs 2.5 10 20                      # Einzelbilder -> preview/ (DUMP=1 schreibt events.json)
node render.cjs 0 2 & node render.cjs 1 2       # alle Frames -> frames/
python3 audio.py && ./make_video.sh             # Soundtrack + MP4s -> out/
```
Kartendaten/Texturen: three-globe (NASA Blue Marble / Black Marble), Natural Earth via world-atlas.
