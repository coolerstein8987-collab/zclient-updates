"""Splits a single narration track (e.g. from ElevenLabs) into the 7 lines of the script.

The track is cut at its pauses into phrases (one per . ? ! , in the script), pauses are
tightened, and each line is written to voice/v<i>.wav for build_timeline.py.
Usage: python3 import_voice.py voice/elevenlabs_roger.mp3
"""
import os
import subprocess
import sys
import wave

import numpy as np

from build_timeline import LINES, merge_to_phrases, parse

# one phrase per . ? ! , in the script (same split as build_timeline.py)
PHRASES_PER_LINE = [sum(w["end_phrase"] for w in parse(l)) or 1 for l in LINES]


def phrase_syllables():
    out = []
    for l in LINES:
        cur = 0
        for w in parse(l):
            cur += w["syl"]
            if w["end_phrase"]:
                out.append(cur)
                cur = 0
        if cur:
            out.append(cur)
    return out

SR = 48000
INTRA = float(os.environ.get("INTRA", 0.20))  # pause between phrases of one line
PAD = (0.03, 0.06)  # keep a little audio before/after each phrase


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-af", f"atempo={os.environ.get('TEMPO', '1.0')}", "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
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
    if len(segs) > need:  # breaths inside a phrase: merge where the lengths fit the script best
        segs = merge_to_phrases(segs, phrase_syllables())
    if len(segs) != need:
        # fewer pauses than phrases: group segments into lines so durations best match each line's syllables
        import numpy as _np
        from build_timeline import syllables
        lw = [sum(syllables(w) for w in l.split()) for l in LINES]
        dur = [b_ - a_ for a_, b_ in segs]
        n, m = len(segs), len(LINES)
        tot_d, tot_w = sum(dur), sum(lw)
        INF = 1e9
        best = [[INF] * (m + 1) for _ in range(n + 1)]; back = [[0] * (m + 1) for _ in range(n + 1)]
        best[0][0] = 0
        for j in range(1, m + 1):
            for i in range(1, n + 1):
                for k in range(j - 1, i):
                    if best[k][j - 1] >= INF: continue
                    c = best[k][j - 1] + abs(_np.log((sum(dur[k:i]) / tot_d) / (lw[j - 1] / tot_w)))
                    if c < best[i][j]: best[i][j], back[i][j] = c, k
        cuts, i = [], n
        for j in range(m, 0, -1): cuts.append((back[i][j], i)); i = back[i][j]
        groups = cuts[::-1]
        for li, (k0, k1) in enumerate(groups, 1):
            parts = []
            for a_, b_ in segs[k0:k1]:
                s_ = x[max(0, int((a_ - PAD[0]) * SR)):int((b_ + PAD[1]) * SR)].copy()
                if parts: parts.append(np.zeros(int((INTRA - sum(PAD)) * SR)))
                parts.append(s_)
            line = np.concatenate(parts)
            write(f"voice/v{li}.wav", line)
            print(f"line {li}: {len(line) / SR:.2f}s ({k1 - k0} segs)")
        return
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
        print(f"line {i}: {len(line) / SR:.2f}s  " + " | ".join(f"{b - a:.2f}" for a, b in segs[k - n:k]))


if __name__ == "__main__":
    main()
