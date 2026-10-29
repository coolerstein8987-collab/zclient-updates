#!/bin/bash
# Synthesises the German narration (SVOX Pico), trims silence and speeds it up slightly.
set -e
cd "$(dirname "$0")"
mkdir -p voice
i=0
while IFS= read -r line; do
  i=$((i+1))
  pico2wave -l de-DE -w voice/raw$i.wav "$line"
  sox voice/raw$i.wav -r 48000 voice/v$i.wav silence 1 0.02 0.5% reverse silence 1 0.02 0.5% reverse tempo -s 1.2
done < voice/lines.txt
