"""Synthesises the whole soundtrack: music bed, sound effects synced to the scene's cue sheet,
and the processed narration. Writes mix.wav (voice + music + sfx) and nomix_voice.wav (music + sfx only).
"""
import json
import os
import wave

import numpy as np
from scipy import signal

SR = 48000
rng = np.random.default_rng(11)
TL = json.load(open("timeline.json"))
EV = json.load(open("events.json"))
CUE = EV["cues"]
DUR = TL["duration"] + 0.6
N = int(DUR * SR)


def tvec(d):
    return np.arange(int(d * SR)) / SR


def sos(kind, f, order=2, **kw):
    return signal.butter(order, f, btype=kind, fs=SR, output="sos", **kw)


def filt(x, kind, f, order=2):
    return signal.sosfilt(sos(kind, f, order), x)


def peq(x, f0, gain_db, q=1.0):
    a = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / SR
    al = np.sin(w0) / (2 * q)
    b = [1 + al * a, -2 * np.cos(w0), 1 - al * a]
    aa = [1 + al / a, -2 * np.cos(w0), 1 - al / a]
    return signal.lfilter(b, aa, x)


def ir(decay, length, bright=6000, seed=1):
    r = np.random.default_rng(seed)
    t = tvec(length)
    out = []
    for ch in range(2):
        n = r.standard_normal(len(t)) * np.exp(-t / decay)
        n = filt(n, "low", bright)
        n[: int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR))
        out.append(n / np.sqrt(np.sum(n ** 2)))
    return np.stack(out)


def reverb(x, decay=1.2, length=3.0, wet=0.3, bright=6000):
    """x: (2, n) -> (2, n) with tail truncated to n."""
    h = ir(decay, length, bright)
    y = np.stack([signal.fftconvolve(x[c], h[c])[: x.shape[1]] for c in range(2)])
    return x * (1 - wet) + y * wet * 3


def st(x, pan=0.0):
    l = np.cos((pan + 1) * np.pi / 4)
    r = np.sin((pan + 1) * np.pi / 4)
    return np.stack([x * l, x * r])


def place(buf, x, t0, gain=1.0):
    i0 = int(round(t0 * SR))
    if x.ndim == 1:
        x = st(x)
    if i0 < 0:
        x = x[:, -i0:]
        i0 = 0
    n = min(x.shape[1], buf.shape[1] - i0)
    if n > 0:
        buf[:, i0:i0 + n] += x[:, :n] * gain


def env_ad(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(t / max(a, 1e-4), 1) * np.exp(-np.maximum(t - a, 0) / d)


def glide(f0, f1, d, curve="exp"):
    t = tvec(d)
    if curve == "exp":
        f = f0 * (f1 / f0) ** (t / d)
    else:
        f = f0 + (f1 - f0) * (t / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def noise(d):
    return rng.standard_normal(int(d * SR))


def note(n):
    return 440 * 2 ** ((n - 69) / 12)


# ------------------------------------------------------------------ SFX
def sfx_hit():
    d = 1.8
    t = tvec(d)
    sub = glide(110, 28, d) * np.exp(-t / 0.55)
    body = filt(noise(d), "low", 500) * np.exp(-t / 0.18) * 0.8
    click = filt(noise(0.03), "high", 2000) * np.exp(-tvec(0.03) / 0.006)
    x = np.tanh(1.6 * (sub + body))
    x[: len(click)] += click * 0.6
    return reverb(st(x), 1.6, 3.5, 0.25, 3000)


def sfx_glitch():
    out = np.zeros(int(0.32 * SR))
    for k in range(6):
        seg_ = rng.standard_normal(int(rng.uniform(0.012, 0.04) * SR))
        seg_ = np.round(seg_ * 3) / 3
        seg_ = np.repeat(seg_[::8], 8)[: len(seg_)]
        i = int(k * 0.05 * SR)
        out[i:i + len(seg_)] += seg_ * rng.uniform(0.3, 0.7)
    return filt(out, "band", [300, 6000]) * 0.5


def sfx_whoosh(pre=0.35, post=0.3, pan_from=-0.8, pan_to=0.8):
    d = pre + post
    t = tvec(d)
    n = noise(d)
    lo = filt(n, "band", [250, 1200])
    hi = filt(n, "band", [1800, 7000])
    k = np.clip(t / pre, 0, 1)
    e = np.where(t < pre, (t / pre) ** 2.5, np.exp(-(t - pre) / 0.09))
    x = (lo * (1 - k) + hi * k * 0.8) * e
    pans = pan_from + (pan_to - pan_from) * np.clip(t / d, 0, 1)
    l = np.cos((pans + 1) * np.pi / 4)
    r = np.sin((pans + 1) * np.pi / 4)
    sub = glide(70, 40, d) * e * 0.5
    return np.stack([x * l + sub, x * r + sub]), pre


def sfx_ping():
    d = 2.2
    t = tvec(d)
    p = (np.sin(2 * np.pi * 1320 * t) + 0.3 * np.sin(2 * np.pi * 2640 * t)) * env_ad(len(t), 0.004, 0.45)
    thump = glide(120, 50, 0.4) * np.exp(-tvec(0.4) / 0.08)
    p[: len(thump)] += thump * 0.8
    for k, (dt, g) in enumerate([(0.38, 0.35), (0.76, 0.15)]):
        i = int(dt * SR)
        p[i:] += p[: len(p) - i] * g
    return reverb(st(p), 1.5, 3, 0.35, 5000)


def sfx_zip(d):
    t = tvec(d)
    x = glide(500, 2600, d) * (0.6 + 0.4 * np.sin(2 * np.pi * 28 * t)) * env_ad(len(t), 0.03, d * 0.5)
    return x * 0.35


def sfx_blip(f=1900):
    t = tvec(0.12)
    return (np.sin(2 * np.pi * f * t) + 0.4 * np.sin(2 * np.pi * f * 1.5 * t)) * env_ad(len(t), 0.002, 0.03) * 0.5


def sfx_count(d):
    out = np.zeros(int((d + 0.2) * SR))
    tick = np.sin(2 * np.pi * 3200 * tvec(0.012)) * np.exp(-tvec(0.012) / 0.003)
    tt = 0.0
    while tt < d:
        i = int(tt * SR)
        out[i:i + len(tick)] += tick * 0.45
        prog = tt / d
        tt += 0.035 + 0.09 * prog ** 2.2
    out[int(d * SR):int(d * SR) + int(0.12 * SR)] += sfx_blip(2400)[: int(0.12 * SR)] * 0.8
    return out


def sfx_sweep():
    d = 1.4
    t = tvec(d)
    x = filt(noise(d), "band", [2500, 9000]) * np.sin(np.pi * np.clip(t / 0.9, 0, 1)) ** 2 * 0.4
    hum = np.sin(2 * np.pi * 55 * t) * env_ad(len(t), 0.1, 0.6) * 0.5
    ping = sfx_ping()[0][: len(t)] * 0.5
    return st(x + hum) + st(ping)


def sfx_quindar():
    t = tvec(0.25)
    beep = np.sin(2 * np.pi * 2525 * t) * np.minimum(1, np.minimum(t, 0.25 - t) / 0.01) * 0.28
    stat = filt(noise(0.45), "band", [800, 4000]) * env_ad(int(0.45 * SR), 0.02, 0.15) * 0.18
    return np.concatenate([beep, np.zeros(int(0.05 * SR)), stat])


def sfx_flyby():
    d = 1.6
    t = tvec(d)
    n = filt(noise(d), "band", [400, 4000])
    e = np.exp(-((t - 0.45) / 0.3) ** 2)
    tone = glide(520, 260, d) * e * 0.25
    pans = np.tanh((t - 0.45) * 4)
    l = np.cos((pans + 1) * np.pi / 4)
    r = np.sin((pans + 1) * np.pi / 4)
    x = n * e * 0.6 + tone
    return np.stack([x * l, x * r])


def sfx_meteor(d, big):
    t = tvec(d)
    whistle = glide(2400, 500, d) * np.clip(t / d, 0, 1) ** 1.5 * 0.18
    crack = filt(noise(d) * (rng.random(len(t)) < 0.02), "high", 1500) * (t / d) * 0.6
    roar = filt(noise(d), "low", 900) * (t / d) ** 2 * 0.5
    fall = whistle + crack + roar
    bd = 1.6 if big else 0.9
    tb = tvec(bd)
    boom = glide(90 if big else 120, 30, bd) * np.exp(-tb / (0.4 if big else 0.2))
    boom += filt(noise(bd), "low", 700) * np.exp(-tb / (0.25 if big else 0.1)) * 0.7
    boom = np.tanh(boom * (2.2 if big else 1.4)) * (1.0 if big else 0.6)
    x = np.concatenate([fall, boom])
    return reverb(st(x, rng.uniform(-0.4, 0.4)), 1.0, 2.5, 0.25, 4000)


def sfx_riser(d):
    t = tvec(d)
    k = t / d
    saw = signal.sawtooth(2 * np.pi * np.cumsum(180 * 10 ** (k * 1.1)) / SR) * 0.15
    n = filt(noise(d), "high", 1500) * 0.4
    x = (saw + n * k) * k ** 2
    x = filt(x, "low", 9000)
    return reverb(st(x), 0.6, 1.5, 0.2)


def sfx_boom():
    d = 4.0
    t = tvec(d)
    sub = glide(70, 22, d) * np.exp(-t / 0.45)
    body = filt(noise(d), "low", 350) * np.exp(-t / 0.35)
    crack = filt(noise(d), "band", [1500, 7000]) * np.exp(-t / 0.15) * 0.5
    debris = filt(noise(d) * (rng.random(len(t)) < 0.006), "high", 2500) * np.exp(-t / 0.6) * 0.6
    x = np.tanh(1.8 * (sub + body)) + crack + debris
    return reverb(st(x), 1.6, 3.0, 0.2, 2500)


def sfx_pop():
    t = tvec(0.12)
    return glide(420, 950, 0.12) * env_ad(len(t), 0.003, 0.035) * 0.6


def sfx_tap():
    t = tvec(1.4)
    click = filt(noise(0.02), "high", 3000) * np.exp(-tvec(0.02) / 0.004) * 0.6
    bell = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / dcy) for f, a, dcy in
               [(1567.98, 0.5, 0.6), (2349.3, 0.3, 0.45), (3135.96, 0.15, 0.3)])
    i = int(0.06 * SR)
    bell2 = np.zeros_like(bell)
    bell2[i:] = (np.sin(2 * np.pi * 2093 * t) * np.exp(-t / 0.6) * 0.45)[: len(t) - i]
    x = bell + bell2
    x[: len(click)] += click
    return reverb(st(x * 0.45), 1.0, 2.0, 0.3)


def sfx_wind(d):
    t = tvec(d)
    n = np.stack([filt(noise(d), "band", [180, 1400]), filt(noise(d), "band", [180, 1400])])
    e = (0.6 + 0.4 * np.sin(2 * np.pi * 0.7 * t)) * np.minimum(t / 0.3, 1) * np.clip((d - t) / 0.3, 0, 1)
    return n * e * 0.25


def sfx_heat(d):
    t = tvec(d)
    shimmer = filt(noise(d), "band", [5000, 11000]) * (0.5 + 0.5 * np.sin(2 * np.pi * 13 * t)) * 0.12
    hum = np.sin(2 * np.pi * 58 * t) * 0.18 + np.sin(2 * np.pi * 116 * t) * 0.05
    e = np.minimum(t / 0.4, 1) * np.clip((d - t) / 0.25, 0, 1)
    return st((shimmer + hum) * e)


def sfx_night(d):
    t = tvec(d)
    x = np.zeros(len(t))
    for k in np.arange(0.35, d, 0.42):
        for j in range(3):
            i = int((k + j * 0.045) * SR)
            c = np.sin(2 * np.pi * 4300 * tvec(0.03)) * np.hanning(int(0.03 * SR))
            x[i:i + len(c)] += c[: len(x) - i] * 0.05
    down = sfx_whoosh(0.05, 0.6)[0] * 0.4
    y = st(x, 0.4) + st(filt(noise(d), "band", [150, 600]) * 0.06)
    y[:, : down.shape[1]] += down[:, : y.shape[1]]
    return y


def sfx_rasp(d):
    t = tvec(d)
    n = filt(noise(d), "band", [1800, 7000])
    am = (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 22 * t))) * (0.6 + 0.4 * np.sin(2 * np.pi * 1.3 * t))
    e = np.minimum(t / 0.25, 1) * np.clip((d - t) / 0.2, 0, 1)
    return st(n * am * e * 0.35, 0.2)


def sfx_skitter(d):
    t = tvec(d)
    x = np.zeros(len(t))
    click = filt(noise(0.004), "high", 3000) * np.exp(-tvec(0.004) / 0.0008)
    for k in rng.uniform(0, d - 0.01, int(d * 45)):
        i = int(k * SR)
        x[i:i + len(click)] += click * rng.uniform(0.2, 0.6)
    return st(x * 0.5, -0.2)


def sfx_strike():
    w, pre = sfx_whoosh(0.12, 0.08)
    x = np.zeros((2, int(0.6 * SR)))
    x[:, : w.shape[1]] += w * 0.8
    i = int(0.12 * SR)
    hit = st(np.tanh(3 * glide(200, 60, 0.4) * np.exp(-tvec(0.4) / 0.08)) * 0.7)
    x[:, i:i + hit.shape[1]] += hit[:, : x.shape[1] - i]
    return x


def sfx_alarm():
    t = tvec(0.6)
    tone = np.where(t < 0.3, np.sin(2 * np.pi * 880 * t), np.sin(2 * np.pi * 660 * t)) * env_ad(len(t), 0.005, 0.5) * 0.25
    return reverb(st(tone) + sfx_hit()[:, : len(t)] * 0.5, 0.8, 1.5, 0.2)


def sfx_heartbeat(d):
    x = np.zeros(int(d * SR))
    beat = np.sin(2 * np.pi * 52 * tvec(0.18)) * np.exp(-tvec(0.18) / 0.05)
    for k in np.arange(0.0, d - 0.3, 0.72):
        for off, g in ((0, 1.0), (0.2, 0.7)):
            i = int((k + off) * SR)
            x[i:i + len(beat)] += beat[: len(x) - i] * g
    return st(x * 0.9)


def sfx_check():
    t = tvec(0.6)
    x = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / 0.2) for f, a in ((1046.5, 0.5), (1318.5, 0.35), (1568, 0.2)))
    x[int(0.07 * SR):] += (np.sin(2 * np.pi * 2093 * t) * np.exp(-t / 0.25) * 0.3)[: len(t) - int(0.07 * SR)]
    return x * 0.5


def sfx_buzz():
    t = tvec(0.3)
    return filt(signal.square(2 * np.pi * 110 * t) + 0.5 * signal.square(2 * np.pi * 117 * t), "low", 1800) * env_ad(len(t), 0.005, 0.12) * 0.18


def sfx_help():
    d = 0.9
    t = tvec(d)
    f = 700 + 350 * np.sin(np.pi * t / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(len(t), 0.03, 0.4) * 0.22


def sfx_fall(d):
    t = tvec(d)
    return st(np.sin(2 * np.pi * np.cumsum(1800 * (300 / 1800) ** (t / d)) / SR) * 0.18 * np.minimum(t / 0.1, 1))


def sfx_land():
    return sfx_hit() * 0.9


def sfx_ding():
    t = tvec(0.5)
    return st((np.sin(2 * np.pi * 1318.5 * t) + 0.5 * np.sin(2 * np.pi * 1975.5 * t)) * np.exp(-t / 0.15) * 0.3)


def sfx_charge(d):
    t = tvec(d)
    f = 200 * (1800 / 200) ** (t / d)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.12 + filt(noise(d), "band", [800, 5000]) * 0.08 * (t / d)
    return st(x * np.minimum(t / 0.1, 1))


def sfx_fizzle():
    d = 0.7
    t = tvec(d)
    pf = filt(noise(d), "band", [300, 2500]) * np.exp(-t / 0.25) * 0.4
    deflate = np.sin(2 * np.pi * np.cumsum(600 * (120 / 600) ** (t / d)) / SR) * np.exp(-t / 0.3) * 0.2
    return st(pf + deflate)


def sfx_paper():
    d = 0.4
    return st(filt(noise(d) * (rng.random(int(d * SR)) < 0.2), "band", [1500, 8000]) * env_ad(int(d * SR), 0.02, 0.15) * 0.5)


def sfx_stamp():
    return st(np.tanh(3 * glide(160, 60, 0.25) * np.exp(-tvec(0.25) / 0.05)) * 0.6)


def sfx_punches(d):
    x = np.zeros((2, int(d * SR) + SR))
    for k in np.arange(0, d - 0.1, 1 / 3.2):
        w, pre = sfx_whoosh(0.12, 0.05)
        place(x, w * 0.5, k)
        place(x, st(np.tanh(2 * glide(220, 90, 0.12) * np.exp(-tvec(0.12) / 0.03)) * 0.3), k + 0.12)
    return x


def sfx_window():
    t = tvec(0.5)
    return st(np.sin(2 * np.pi * np.cumsum(500 + 300 * np.sin(2 * np.pi * 3 * t)) / SR) * env_ad(len(t), 0.05, 0.2) * 0.12)


def sfx_gong():
    out = np.zeros(int(1.6 * SR))
    for k, f in enumerate([784, 659.3, 523.3]):
        t = tvec(1.0)
        tone = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)) * np.exp(-t / 0.5) * 0.25
        i = int(k * 0.3 * SR); out[i:i + len(tone)] += tone[: len(out) - i]
    return st(out)


def sfx_sad():
    out = np.zeros(int(2.0 * SR))
    for k, (f, d) in enumerate([(311, 0.35), (293.7, 0.35), (277.2, 0.35), (261.6, 0.9)]):
        t = tvec(d)
        vib = 1 + (0.02 * np.sin(2 * np.pi * 6 * t) if k == 3 else 0)
        tone = filt(signal.sawtooth(2 * np.pi * np.cumsum(f * vib) / SR), "low", 1200) * env_ad(len(t), 0.03, d * 0.6) * 0.25
        i = int(k * 0.38 * SR); out[i:i + len(tone)] += tone[: len(out) - i]
    return st(out)


def sfx_clunk():
    t = tvec(0.25)
    return st(np.tanh(2.5 * (np.sin(2 * np.pi * 140 * t) + filt(noise(0.25), "band", [200, 1500]) * 0.6) * np.exp(-t / 0.05)) * 0.4)


def sfx_beach(d):
    t = tvec(d)
    waves = filt(noise(d), "low", 900) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.25 * t)) * 0.18
    gull = np.zeros(len(t))
    for k in (0.4, 1.3):
        tt = tvec(0.35)
        g = np.sin(2 * np.pi * np.cumsum(1800 - 900 * tt / 0.35) / SR) * np.hanning(len(tt)) * 0.08
        i = int(k * SR); gull[i:i + len(g)] += g[: len(gull) - i]
    return np.stack([waves + gull, waves * 0.9 + gull * 0.6])


def sfx_powerup(d):
    t = tvec(d)
    f = 80 * (400 / 80) ** np.minimum(t / (d * 0.7), 1)
    rumble = np.tanh(2 * np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.25
    zap = filt(noise(d), "band", [2000, 8000]) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 18 * t))) * 0.08
    return st((rumble + zap) * np.minimum(t / 0.2, 1) * np.clip((d - t) / 0.08, 0, 1))


def sfx_thud():
    x = sfx_hit() * 0.6
    x[:, : int(0.5 * SR)] += st(filt(noise(0.5), "band", [800, 5000]) * np.exp(-tvec(0.5) / 0.12) * 0.3)
    return x


def sfx_tada():
    out = np.zeros((2, int(1.8 * SR)))
    for k, ch in enumerate([[65, 69, 72], [65, 69, 72, 77]]):
        d = 0.18 if k == 0 else 1.2
        b = st(filt(sum(signal.sawtooth(2 * np.pi * note(n) * tvec(d)) for n in ch), "low", 3000) * env_ad(int(d * SR), 0.01, d * 0.5) * 0.18)
        place(out, b, k * 0.2)
    return reverb(out, 0.8, 1.5, 0.25)


# ------------------------------------------------------------------ music: German oom-pah polka
BPM = 132
BEAT = 60 / BPM
LAND, L8, STEUER, END = (CUE[k] for k in ("land0", "l8", "steuer", "end"))
# F major: I - V7 - V7 - I, one chord per bar of two beats
PROG = [(53, [65, 69, 72]), (48, [64, 67, 70]), (48, [64, 67, 70]), (53, [65, 69, 72]),
        (53, [65, 69, 72]), (58, [65, 70, 74]), (48, [64, 67, 70]), (53, [65, 69, 72])]
MELODY = [72, 77, 76, 74, 72, 70, 69, 70, 72, 74, 76, 79, 77, None, 72, 74,
          76, 77, 76, 74, 72, 74, 76, 72, 74, 72, 70, 67, 65, None, 69, 72]


def brass(freqs, d):
    t = tvec(d)
    x = sum(signal.sawtooth(2 * np.pi * f * (1 + det) * t) for f in freqs for det in (-0.004, 0.004))
    return filt(x, "low", 2400) * env_ad(len(t), 0.01, d * 0.35)


def tuba(f, d):
    t = tvec(d)
    x = np.sin(2 * np.pi * f * t) + 0.5 * signal.sawtooth(2 * np.pi * f * t)
    return filt(x, "low", 600) * env_ad(len(t), 0.012, d * 0.5)


def accordion(f, d):
    t = tvec(d)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t)
    x = signal.sawtooth(2 * np.pi * np.cumsum(f * 0.997 * vib) / SR) + signal.sawtooth(2 * np.pi * np.cumsum(f * 1.003 * vib) / SR) + 0.6 * signal.square(2 * np.pi * np.cumsum(f * vib) / SR)
    e = np.minimum(t / 0.03, 1) * np.clip((d - t) / 0.05, 0, 1)
    return filt(x, "band", [300, 3500]) * e


def build_music():
    out = np.zeros((2, N))
    t, k = LAND, 0
    while t < END - 0.2:
        bar = int(k // 2) % len(PROG)
        root, chord = PROG[bar]
        quiet = L8 - 0.1 < t < STEUER + 0.1   # drop out for the power-up gag
        if not quiet:
            f = note(root - 12 + (7 if k % 2 else 0))
            place(out, st(tuba(f, BEAT * 0.9), -0.1), t, 0.55)
            place(out, st(brass([note(n) for n in chord], BEAT * 0.45), 0.25), t + BEAT / 2, 0.11)
            m = MELODY[k % len(MELODY)]
            if m:
                place(out, st(accordion(note(m), BEAT * 0.95), -0.2), t, 0.07)
            hat = filt(noise(0.03), "high", 7000) * np.exp(-tvec(0.03) / 0.006)
            place(out, st(hat, 0.3), t + BEAT / 2, 0.12)
        t += BEAT
        k += 1
    return reverb(out, 0.9, 1.8, 0.18, 6000) * 1.6


# ------------------------------------------------------------------ voice
def read_mono(path):
    with wave.open(path) as f:
        x = np.frombuffer(f.readframes(f.getnframes()), dtype=np.int16).astype(np.float64) / 32768
        assert f.getframerate() == SR
    return x


NATURAL_VOICE = os.environ.get("VOICE", "elevenlabs") == "elevenlabs"


def process_voice(x):
    if NATURAL_VOICE:
        # studio TTS (ElevenLabs): only clean the lows, a touch of presence, gentle levelling
        x = filt(x, "high", 70)
        x = peq(x, 3500, 1.5, 1.0)
        ratio, thr = 3.0, 0.05
    else:
        # SVOX Pico: band-limited 16 kHz voice needs more shaping and some synthetic air
        x = filt(x, "high", 85)
        x = peq(x, 220, 2.0, 0.8)
        x = peq(x, 3200, 3.5, 1.0)
        x = peq(x, 650, -1.5, 1.2)
        air = filt(np.tanh(6 * filt(x, "high", 2500)) / 6, "high", 7000)
        x = x + air * 0.6
        ratio, thr = 3.5, 0.08
    # RMS compressor
    e = np.sqrt(signal.lfilter([0.002], [1, -0.998], x ** 2) + 1e-9)
    g = np.where(e > thr, (thr / e) ** (1 - 1 / ratio), 1.0)
    return x * g


def build_voice():
    v = np.zeros((2, N))
    for ln in TL["lines"]:
        x = process_voice(read_mono(f"voice/v{ln['id']}.wav"))
        place(v, st(x), ln["start"])
    v /= np.max(np.abs(v)) + 1e-9
    v = reverb(v, 0.35, 0.8, 0.04 if NATURAL_VOICE else 0.08, 7000)
    return v * 0.9


def build_sfx():
    fx = np.zeros((2, N))
    for e in EV["events"]:
        t, ty = e["t"], e["type"]
        if ty == "hit":
            place(fx, sfx_hit(), t, 0.6)
        elif ty == "glitch":
            place(fx, st(sfx_glitch()), t, 0.5)
        elif ty == "whoosh":
            w, pre = sfx_whoosh(pan_from=rng.choice([-0.8, 0.8]), pan_to=0)
            place(fx, w, t - pre, 0.55)
        elif ty == "ping":
            place(fx, sfx_ping(), t, 0.5)
        elif ty == "zip":
            place(fx, st(sfx_zip(e["dur"]), rng.uniform(-0.5, 0.5)), t, 0.6)
        elif ty == "blip":
            place(fx, st(sfx_blip()), t, 0.45)
        elif ty == "count":
            place(fx, st(sfx_count(e["dur"])), t, 0.5)
        elif ty == "sweep":
            place(fx, sfx_sweep(), t, 0.55)
        elif ty == "quindar":
            place(fx, st(sfx_quindar()), t, 0.7)
        elif ty == "flyby":
            place(fx, sfx_flyby(), t - 0.3, 0.7)
        elif ty == "meteor":
            place(fx, sfx_meteor(e["dur"], e.get("big")), t, 0.5 if e.get("big") else 0.24)
        elif ty == "riser":
            place(fx, sfx_riser(e["dur"]), t, 0.55)
        elif ty == "boom":
            place(fx, sfx_boom(), t, 0.8)
        elif ty == "pop":
            place(fx, st(sfx_pop()), t, 0.6)
        elif ty == "tap":
            place(fx, sfx_tap(), t, 0.8)
        elif ty == "fall":
            place(fx, sfx_fall(e["dur"]), t, 0.8)
        elif ty == "land":
            place(fx, sfx_land(), t, 0.9)
        elif ty == "ding":
            place(fx, sfx_ding(), t, 0.6)
        elif ty == "charge":
            place(fx, sfx_charge(e["dur"]), t, 0.8)
        elif ty == "fizzle":
            place(fx, sfx_fizzle(), t, 0.9)
        elif ty == "paper":
            place(fx, sfx_paper(), t, 0.7)
        elif ty == "stamp":
            place(fx, sfx_stamp(), t, 0.7)
        elif ty == "punches":
            place(fx, sfx_punches(e["dur"]), t, 0.7)
        elif ty == "window":
            place(fx, sfx_window(), t, 0.7)
        elif ty == "gong":
            place(fx, sfx_gong(), t, 0.7)
        elif ty == "sad":
            place(fx, sfx_sad(), t, 0.8)
        elif ty == "clunk":
            place(fx, sfx_clunk(), t, 0.6)
        elif ty == "beach":
            place(fx, sfx_beach(e["dur"]), t, 0.8)
        elif ty == "whip":
            w, pre = sfx_whoosh(0.15, 0.1)
            place(fx, w, t - pre, 0.6)
        elif ty == "powerup":
            place(fx, sfx_powerup(e["dur"]), t, 0.9)
        elif ty == "thud":
            place(fx, sfx_thud(), t, 0.9)
        elif ty == "tada":
            place(fx, sfx_tada(), t, 0.8)
        elif ty == "wind":
            place(fx, sfx_wind(e["dur"] + 0.3), t, 0.7)
        elif ty == "heat":
            place(fx, sfx_heat(e["dur"]), t, 0.6)
        elif ty == "night":
            place(fx, sfx_night(e["dur"] + 0.3), t, 0.8)
        elif ty == "rasp":
            place(fx, sfx_rasp(e["dur"]), t, 0.8)
        elif ty == "skitter":
            place(fx, sfx_skitter(e["dur"]), t, 0.6)
        elif ty == "strike":
            place(fx, sfx_strike(), t - 0.12, 0.7)
        elif ty == "alarm":
            place(fx, sfx_alarm(), t, 0.7)
        elif ty == "heartbeat":
            place(fx, sfx_heartbeat(e["dur"]), t, 0.6)
        elif ty == "check":
            place(fx, st(sfx_check()), t, 0.6)
        elif ty == "buzz":
            place(fx, st(sfx_buzz()), t, 0.6)
        elif ty == "help":
            place(fx, st(sfx_help()), t, 0.6)
        elif ty == "hitsoft":
            place(fx, sfx_hit(), t, 0.3)
    # soft tick whenever a new caption chunk pops in
    tick = filt(noise(0.015), "band", [2000, 6000]) * np.exp(-tvec(0.015) / 0.003)
    for ln in TL["lines"][:-1]:
        for w in ln["words"]:
            if w.get("em"):
                place(fx, st(tick), w["t0"], 0.12)
    return fx


def write(path, x):
    x = np.clip(x, -1, 1)
    with wave.open(path, "w") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes((x.T * 32767).astype(np.int16).tobytes())


def main():
    music = build_music()
    fx = build_sfx()
    voice = build_voice()
    venv = np.abs(voice).max(axis=0)
    venv = signal.lfilter([1 - 0.9995], [1, -0.9995], venv)
    venv = np.clip(venv / (venv.max() + 1e-9) * 3, 0, 1)
    duck = 1 - 0.6 * venv
    music_d = music * duck * 0.3
    fx_d = fx * 0.45 * (1 - 0.7 * venv)
    bed = music_d + fx_d
    mix = bed + voice
    g = float(os.environ.get("GAIN", "1.0"))
    write("mix.wav", limit(mix * g))
    write("bed.wav", limit(bed * g))
    print("peak before limit", np.max(np.abs(mix * 0.8)), "dur", mix.shape[1] / SR)


def limit(x, ceil=0.89):
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    g = np.minimum(1.0, ceil / (np.abs(x).max(axis=0) + 1e-9))
    g = minimum_filter1d(g, int(0.006 * SR))
    g = uniform_filter1d(g, int(0.004 * SR))
    g = signal.lfilter([1 - 0.9997], [1, -0.9997], g - 1) + 1
    g = np.minimum(g, minimum_filter1d(np.minimum(1.0, ceil / (np.abs(x).max(axis=0) + 1e-9)), int(0.006 * SR)))
    return np.clip(x * g, -0.99, 0.99)


if __name__ == "__main__":
    main()
