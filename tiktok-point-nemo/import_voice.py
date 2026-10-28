"""Splits a single narration track (e.g. from ElevenLabs) into the 7 lines of the script.

The track is cut at its pauses into phrases (one per . ? ! , in the script), pauses are
tightened, and each line is written to voice/v<i>.wav for build_timeline.py.
Usage: python3 import_voice.py voice/elevenlabs_roger.mp3
"""
import subprocess
import sys
import wave

import numpy as np

SR = 48000
PHRASES_PER_LINE = [1, 2, 3, 4, 2, 1, 1]
INTRA = 0.20       # pause between phrases of one line
PAD = (0.03, 0.06)  # keep a little audio before/after each phrase


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768


def segments(x, thr_db=-40, min_pause=0.12):
    hop = SR // 100
    e = np.array([np.sqrt(np.mean(x[i:i + hop] ** 2)) for i in range(0, len(x) - hop, hop)])
    voiced = 20 * np.log10(e + 1e-9) > thr_db
    segs, start, silent = [], None, 0
    for i, v in enumerate(voiced):
        if v:
            start = i if start is None else start
            silent = 0
        elif start is not None:
            silent += 1
            if silent * 0.01 >= min_pause:
                segs.append((start * 0.01, (i - silent + 1) * 0.01))
                start, silent = None, 0
    if start is not None:
        segs.append((start * 0.01, len(voiced) * 0.01))
    return segs


def write(path, x):
    with wave.open(path, "w") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


def main():
    x = load(sys.argv[1])
    segs = segments(x)
    need = sum(PHRASES_PER_LINE)
    while len(segs) > need:  # breaths inside a phrase: merge across the shortest pause
        gaps = [segs[k + 1][0] - segs[k][1] for k in range(len(segs) - 1)]
        k = int(np.argmin(gaps))
        segs[k:k + 2] = [(segs[k][0], segs[k + 1][1])]
    if len(segs) != need:
        sys.exit(f"found {len(segs)} phrases, expected {need}: {segs}")
    k = 0
    for i, n in enumerate(PHRASES_PER_LINE, 1):
        parts = []
        for j in range(n):
            a, b = segs[k + j]
            s = x[max(0, int((a - PAD[0]) * SR)):int((b + PAD[1]) * SR)].copy()
            fi, fo = int(0.01 * SR), int(0.025 * SR)
            s[:fi] *= np.linspace(0, 1, fi)
            s[-fo:] *= np.linspace(1, 0, fo)
            if parts:
                parts.append(np.zeros(int((INTRA - sum(PAD)) * SR)))
            parts.append(s)
        k += n
        line = np.concatenate(parts)
        write(f"voice/v{i}.wav", line)
        print(f"line {i}: {len(line) / SR:.2f}s")


if __name__ == "__main__":
    main()
