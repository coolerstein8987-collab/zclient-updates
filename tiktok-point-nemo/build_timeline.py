"""Builds timeline.json: when each narration line plays and when each caption word lights up.

Word timing: each line's audio is split at its pauses; words are assigned to the
phrase (punctuation-delimited) they belong to and spread inside it by syllable weight.
"""
import json
import re
import wave

import numpy as np

SR = 48000
START = 0.35   # first line begins here
GAP = 0.22     # silence between lines
TAIL = 1.15    # hold after the last line

# Display words with optional spoken form (for syllable weighting) in square brackets.
LINES = [
    "Das ist der einsamste Ort der Welt.",
    "Point[Peunt] Nemo. Mitten im Südpazifik.",
    "Das nächste Land? Über 2.600[zweitausendsechshundert] Kilometer weg. In jede Richtung.",
    "Die nächsten Menschen? Oft gar nicht auf der Erde, sondern auf der Raumstation. Nur 400[vierhundert] Kilometer über dir.",
    "Darum liegt hier ein Friedhof für Raumschiffe. Über 260[zweihundertsechzig] sind hier schon versunken.",
    "Und bald stürzt sogar die Raumstation selbst hier ab.",
    "Folg mir für mehr verrückte Orte!",
]

# Words that get the accent colour in captions.
EMPHASIS = {"einsamste", "Point", "Nemo.", "2.600", "Richtung.", "Erde,", "Raumstation.",
            "400", "Friedhof", "Raumschiffe.", "260", "Raumstation", "ab.", "verrückte"}


def syllables(word):
    w = word.lower()
    w = re.sub(r"(ei|ie|eu|äu|au|ai)", "a", w)
    n = len(re.findall(r"[aeiouyäöü]+", w))
    return max(1, n)


def read_wav(path):
    with wave.open(path) as f:
        data = np.frombuffer(f.readframes(f.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        return data, f.getframerate()


def speech_segments(x, sr, min_pause=0.11):
    hop = int(sr * 0.01)
    env = np.array([np.sqrt(np.mean(x[i:i + hop] ** 2)) for i in range(0, len(x) - hop, hop)])
    thr = max(env.max() * 0.04, 1e-4)
    voiced = env > thr
    segs, start, silent = [], None, 0
    for i, v in enumerate(voiced):
        if v:
            if start is None:
                start = i
            silent = 0
        elif start is not None:
            silent += 1
            if silent * 0.01 >= min_pause:
                segs.append((start * 0.01, (i - silent + 1) * 0.01))
                start, silent = None, 0
    if start is not None:
        segs.append((start * 0.01, len(voiced) * 0.01))
    return segs


def parse(line):
    words = []
    for tok in line.split():
        m = re.match(r"^(.*?)\[(.*?)\](.*)$", tok)
        if m:
            display, spoken = m.group(1) + m.group(3), m.group(2)
        else:
            display, spoken = tok, tok
        words.append({"w": display, "syl": syllables(spoken),
                      "end_phrase": bool(re.search(r"[.?!,]$", display))})
    return words


def main():
    t = START
    out = []
    for i, text in enumerate(LINES, 1):
        x, sr = read_wav(f"voice/v{i}.wav")
        dur = len(x) / sr
        words = parse(text)
        phrases, cur = [], []
        for w in words:
            cur.append(w)
            if w["end_phrase"]:
                phrases.append(cur)
                cur = []
        if cur:
            phrases.append(cur)
        segs = speech_segments(x, sr)
        # Merge the shortest gaps until segment count matches phrase count.
        while len(segs) > len(phrases):
            gaps = [segs[k + 1][0] - segs[k][1] for k in range(len(segs) - 1)]
            k = int(np.argmin(gaps))
            segs[k:k + 2] = [(segs[k][0], segs[k + 1][1])]
        if len(segs) < len(phrases):
            # Fallback: spread phrases over the whole line by syllables.
            total = sum(w["syl"] for p in phrases for w in p)
            segs, acc = [], 0.0
            for p in phrases:
                s = sum(w["syl"] for w in p)
                segs.append((dur * acc / total, dur * (acc + s) / total))
                acc += s
        for p, (s0, s1) in zip(phrases, segs):
            total = sum(w["syl"] for w in p)
            acc = 0
            for w in p:
                w["t0"] = round(t + s0 + (s1 - s0) * acc / total, 3)
                acc += w["syl"]
                w["t1"] = round(t + s0 + (s1 - s0) * acc / total, 3)
        out.append({
            "id": i, "text": text, "start": round(t, 3), "end": round(t + dur, 3),
            "words": [{"w": w["w"], "t0": w["t0"], "t1": w["t1"], "em": w["w"] in EMPHASIS}
                      for w in words],
        })
        t += dur + GAP
    total = round(t - GAP + TAIL, 3)
    json.dump({"duration": total, "fps": 30, "lines": out}, open("timeline.json", "w"),
              ensure_ascii=False, indent=1)
    for l in out:
        print(l["id"], l["start"], l["end"], " ".join(f'{w["w"]}@{w["t0"]}' for w in l["words"]))
    print("duration", total)


if __name__ == "__main__":
    main()
