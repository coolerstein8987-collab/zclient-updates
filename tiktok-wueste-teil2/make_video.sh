#!/bin/bash
# Encodes the rendered frames + soundtrack into TikTok-ready 1080x1920 MP4s.
set -e
cd "$(dirname "$0")"
DUR=$(python3 -c "import json,math; print(math.ceil(json.load(open('timeline.json'))['duration']*30)/30)")
FADE=$(python3 -c "print($DUR-0.35)")
enc() {
  ffmpeg -y -hide_banner -loglevel error -framerate 30 -i frames/%05d.jpg -i "$1" \
    -filter_complex "[1:a]atrim=0:$DUR,afade=t=out:st=$FADE:d=0.35[a]" -map 0:v -map "[a]" \
    -c:v libx264 -preset slow -crf 20 -maxrate 12M -bufsize 24M -pix_fmt yuv420p -profile:v high -level 4.2 -r 30 \
    -c:a aac -b:a 192k -ar 48000 -t "$DUR" -movflags +faststart "$2"
}
enc mix.wav out/wueste_teil2_tiktok.mp4
enc bed.wav out/wueste_teil2_ohne_stimme.mp4
ls -la out
