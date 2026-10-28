#!/usr/bin/env python3
"""Baut das Z Butterfly-Messer für Minecraft Java (1.21.6 – 1.21.11).

Erzeugt aus diesem Skript:
  * Ressourcenpaket: 3D-Modell (Klinge, zwei Griffe, Schrauben, Verschluss, Leucht-Einlagen),
    Texturen in vier Farben und eine Flip-Animation (Rechtsklick halten).
  * Datenpaket: Rezepte und /function-Befehle zum Holen des Messers.

Aufruf:  python3 build.py [Ausgabeordner]   (Standard: der Ordner über tools/)
Benötigt: Python 3.9+ und Pillow.

Koordinaten im Skript („lokal“): u = Länge (0 = Griffende, ~21 = Klingenspitze),
v = Breite (+ = Klingenrücken / Griff A, − = Schneide / Griff B), w = Dicke.
1 Einheit = 1/16 Block ≈ 1 cm am echten Messer.
"""
import json
import math
import os
import random
import shutil
import sys
import zipfile

from PIL import Image

NS = 'zknife'
PX = 16            # Texturpixel (und Raster-Zellen) pro Modell-Einheit
ATLAS = 256        # Texturgröße in Pixeln
UV = 16 / ATLAS    # Atlas-Pixel -> UV-Einheiten

# ---------------------------------------------------------------------------
# Farben (vier Varianten nach den Vorlagen)
# ---------------------------------------------------------------------------
VARIANTS = {
    'neon': dict(name='Neon', dye='lime_dye', head=(206, 232, 52), inlay=(220, 244, 60),
                 side=(46, 204, 92), accent=(118, 244, 196), mid=None, plate=None),
    'rot': dict(name='Rot', dye='red_dye', head=(200, 28, 44), inlay=(226, 40, 56),
                side=(52, 204, 222), accent=(118, 244, 196), mid=None, plate=None),
    'gold': dict(name='Gold', dye='yellow_dye', head=(255, 200, 28), inlay=(255, 214, 46),
                 side=(46, 196, 84), accent=(255, 214, 46), mid=(196, 202, 210), plate=(255, 206, 36)),
    'blau': dict(name='Blau', dye='light_blue_dye', head=(40, 70, 118), inlay=(44, 124, 240),
                 side=(56, 214, 236), accent=(64, 220, 240), mid=None, plate=None),
}
ORDER = ['neon', 'rot', 'gold', 'blau']

BLACK = (20, 22, 26)
FRAME_EDGE = (12, 13, 16)
CHANNEL = (30, 33, 39)
SILVER = (196, 202, 210)
SILVER_LIGHT = (232, 236, 241)
SILVER_DARK = (120, 126, 136)
WHITE = (238, 240, 244)

# ---------------------------------------------------------------------------
# Geometrie (lokal)
# ---------------------------------------------------------------------------
HANDLE_LEN = 11.625
H_IN, H_OUT = 0.0, 1.0625             # Griff-Breite (Abstand zur Mittellinie)
PIN_U, PIN_V = 11.0, 0.53125          # Drehpunkte (Schrauben) der Griffe
U_CENTER = 10.75                      # dieser Punkt der Mittellinie liegt in der Modellmitte

BLADE = [(10.375, -0.9375), (18.375, -0.9375), (20.875, 0.4375), (18.875, 0.4375),
         (18.4375, 0.1875), (17.0625, 0.1875), (16.875, 0.5), (10.375, 0.5)]
SLANT = ((18.375, -0.9375), (20.875, 0.4375))     # schräge Schneide vorne
PLATE = [(12.375, 0.0625), (16.5, 0.0625), (16.6875, 0.4375), (12.375, 0.4375)]

# Griff-Umrisse in (u, v') mit v' = Abstand zur Mittellinie (nach außen positiv)
TIP = [(0, H_IN), (0.375, H_IN), (0.375, H_OUT), (0.1875, H_OUT), (0, 0.875)]
BODY = [(0.375, H_IN), (10.25, H_IN), (10.5, H_OUT), (0.375, H_OUT)]
HEAD = [(10.25, H_IN), (HANDLE_LEN, H_IN), (HANDLE_LEN, 0.6875), (11.25, H_OUT), (10.5, H_OUT)]
INLAY = [(1.375, 0.5), (7.75, 0.5), (8.4375, 0.1875), (8.625, 0.1875), (8.625, 0.9375), (1.375, 0.9375)]

T_BLADE, T_PLATE = 0.11, 0.14
T_HANDLE, T_INLAY, T_SCREW, T_STRIP, T_LATCH = 0.34, 0.37, 0.40, 0.2, 0.09


def point_in_poly(x, y, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def mirror(poly, s):
    return [(u, s * v) for u, v in poly]


# ---------------------------------------------------------------------------
# Teile: Bemalung (Draufsicht) + Quader
# ---------------------------------------------------------------------------
class Part:
    """Ein beweglicher Teil (Klinge oder Griff) mit eigener Bemalung."""

    def __init__(self, name, umin, umax, vmin, vmax):
        self.name = name
        self.umin, self.umax, self.vmin, self.vmax = umin, umax, vmin, vmax
        self.W = round((umax - umin) * PX)
        self.H = round((vmax - vmin) * PX)
        self.layers = []   # (name, [(polygon, emission)], halbe Dicke)
        self.boxes = []    # fertige Quader

    # Pixel <-> lokal
    def center(self, c, r):
        return self.umin + (c + 0.5) / PX, self.vmax - (r + 0.5) / PX

    def mask(self, poly):
        return [[point_in_poly(*self.center(c, r), poly) for c in range(self.W)] for r in range(self.H)]

    def layer(self, name, regions, half):
        self.layers.append((name, regions, half))

    def box(self, u0, u1, v0, v1, half, emission=0, faces=None):
        """Quader direkt in lokalen Koordinaten (für Schrauben, Leisten …)."""
        c0, c1 = (u0 - self.umin) * PX, (u1 - self.umin) * PX
        r0, r1 = (self.vmax - v1) * PX, (self.vmax - v0) * PX
        self.boxes.append(dict(u0=u0, u1=u1, v0=v0, v1=v1, w0=-half, w1=half, c0=c0, r0=r0, c1=c1, r1=r1,
                               emission=emission, faces=faces or {'front', 'back', 'top', 'bottom', 'left', 'right'}))

    def build(self):
        for _, regions, half in self.layers:
            masks = [(self.mask(poly), em) for poly, em in regions]
            union = [[any(m[r][c] for m, _ in masks) for c in range(self.W)] for r in range(self.H)]
            for m, em in masks:
                for c0, r0, c1, r1 in tile(m):
                    faces = {'front', 'back'}
                    if r0 == 0 or any(not union[r0 - 1][c] for c in range(c0, c1)):
                        faces.add('top')
                    if r1 == self.H or any(not union[r1][c] for c in range(c0, c1)):
                        faces.add('bottom')
                    if c0 == 0 or any(not union[r][c0 - 1] for r in range(r0, r1)):
                        faces.add('left')
                    if c1 == self.W or any(not union[r][c1] for r in range(r0, r1)):
                        faces.add('right')
                    self.boxes.append(dict(
                        u0=self.umin + c0 / PX, u1=self.umin + c1 / PX,
                        v0=self.vmax - r1 / PX, v1=self.vmax - r0 / PX,
                        w0=-half, w1=half, c0=c0, r0=r0, c1=c1, r1=r1, emission=em, faces=faces))
        return self


def tile(mask):
    """Zerlegt eine Maske in möglichst wenige Rechtecke (zeilen- oder spaltenweise, was weniger ergibt)."""
    def greedy(m):
        H, W = len(m), len(m[0])
        used = [[False] * W for _ in range(H)]
        out = []
        for r in range(H):
            c = 0
            while c < W:
                if m[r][c] and not used[r][c]:
                    c1 = c
                    while c1 < W and m[r][c1] and not used[r][c1]:
                        c1 += 1
                    r1 = r + 1
                    while r1 < H and all(m[r1][x] and not used[r1][x] for x in range(c, c1)):
                        r1 += 1
                    for rr in range(r, r1):
                        for x in range(c, c1):
                            used[rr][x] = True
                    out.append((c, r, c1, r1))
                    c = c1
                else:
                    c += 1
        return out

    rows = greedy(mask)
    t = [list(col) for col in zip(*mask)]
    cols = [(r0, c0, r1, c1) for c0, r0, c1, r1 in greedy(t)]
    return rows if len(rows) <= len(cols) else cols


def make_blade():
    p = Part('blade', 10.25, 21.0, -1.0, 0.625)
    p.layer('base', [(BLADE, 15)], T_BLADE)
    p.layer('plate', [(PLATE, 15)], T_PLATE)
    return p.build()


def make_handle(s):
    """s = +1: Griff A (Rückenseite, mit Logo), s = −1: Griff B (Schneidenseite, mit Verschluss)."""
    vmin, vmax = (0.0, 1.25) if s > 0 else (-1.25, 0.0)
    p = Part('handle_a' if s > 0 else 'handle_b', -0.5, 11.75, vmin, vmax)
    p.s = s
    p.layer('base', [(mirror(TIP, s), 15), (mirror(BODY, s), 0), (mirror(HEAD, s), 15)], T_HANDLE)
    p.layer('inlay', [(mirror(INLAY, s), 15)], T_INLAY)

    def vr(a, b):  # v'-Bereich -> v-Bereich
        return (a * s, b * s) if s > 0 else (b * s, a * s)

    # Schraube am Drehpunkt
    v0, v1 = vr(PIN_V - 0.1875, PIN_V + 0.1875)
    p.box(PIN_U - 0.1875, PIN_U + 0.1875, v0, v1, T_SCREW)
    # Leuchtleiste an der Außenseite
    v0, v1 = vr(0.9375, 1.125)
    p.box(0.375, 10.375, v0, v1, T_STRIP, emission=15)
    if s < 0:  # Verschluss (Latch) am Griffende
        v0, v1 = vr(0.5, 0.8125)
        p.box(-0.3125, 0.25, v0, v1, T_LATCH)
    return p.build()


# ---------------------------------------------------------------------------
# Bemalung
# ---------------------------------------------------------------------------
class Canvas:
    def __init__(self, part):
        self.p = part
        self.img = Image.new('RGBA', (part.W, part.H), (0, 0, 0, 0))
        self.px = self.img.load()

    def each(self, poly=None, rect=None):
        p = self.p
        for r in range(p.H):
            for c in range(p.W):
                u, v = p.center(c, r)
                if rect and not (rect[0] <= u <= rect[1] and rect[2] <= v <= rect[3]):
                    continue
                if poly and not point_in_poly(u, v, poly):
                    continue
                yield c, r, u, v

    def fill(self, color, poly=None, rect=None, where=None):
        for c, r, u, v in self.each(poly, rect):
            if where is None or where(u, v):
                col = color(u, v) if callable(color) else color
                self.px[c, r] = tuple(int(max(0, min(255, x))) for x in col[:3]) + (255,)


def shade(col, f):
    return tuple(max(0, min(255, round(x * f))) for x in col)


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def dist_to_line(u, v, a, b):
    (ax, ay), (bx, by) = a, b
    dx, dy = bx - ax, by - ay
    return ((u - ax) * dy - (v - ay) * dx) / math.hypot(dx, dy)


def noise(seed):
    rnd = random.Random(seed)
    cache = {}

    def n(u, v):
        key = (round(u * PX), round(v * PX))
        if key not in cache:
            cache[key] = rnd.uniform(-1, 1)
        return cache[key]
    return n


def paint_blade(part, P):
    cv = Canvas(part)
    nz = noise(7)
    acc = P['accent']

    def body(u, v):
        t = (v + 0.9375) / 1.4375
        base = mix((15, 17, 21), (27, 30, 36), max(0, min(1, t)))
        return tuple(x + nz(u, v) * 2.2 for x in base)
    cv.fill(body, BLADE)

    def edge_dist(u, v):
        d_bottom = v + 0.9375
        d_slant = -dist_to_line(u, v, *SLANT)
        return min(d_bottom, d_slant)

    def gap(u):
        return 12.875 <= u <= 13.0 or 16.375 <= u <= 16.5 or 18.125 <= u <= 18.375

    # Schneide: Fase + Lichtkante, dann Akzentlinie
    cv.fill((32, 36, 43), BLADE, where=lambda u, v: edge_dist(u, v) < 0.1875)
    cv.fill((84, 92, 104), BLADE, where=lambda u, v: edge_dist(u, v) < 0.0625 and u > 11.7)
    cv.fill(acc, BLADE, where=lambda u, v: 0.125 <= edge_dist(u, v) < 0.25 and 11.9 < u < 20.55 and not gap(u))
    # Rücken-Lichtkante
    cv.fill((50, 55, 64), BLADE, where=lambda u, v: v > 0.4375 - 0.001 and u > 11.7 and v > 0.43)
    cv.fill((50, 55, 64), BLADE, where=lambda u, v: 18.85 < u < 20.8 and v > 0.375)
    # Zierlinien (dunkelgrau)
    line = (40, 45, 53)
    cv.fill(line, BLADE, where=lambda u, v: abs(v + 0.5) < 0.04 and 12.25 < u < 17.6)
    cv.fill(line, BLADE, where=lambda u, v: abs(-dist_to_line(u, v, *SLANT) - 0.6) < 0.045 and v > -0.53 and v < 0.3)
    cv.fill(line, BLADE, where=lambda u, v: abs(u - 14.1) < 0.04 and -0.4 < v < -0.12)
    cv.fill(line, BLADE, where=lambda u, v: abs(u - 14.28) < 0.04 and -0.4 < v < -0.12)
    cv.fill(line, BLADE, where=lambda u, v: abs(u - 19.3) < 0.04 and -0.05 < v < 0.25)
    # Dreieck am Klingenansatz
    tri = [(11.75, 0.1), (11.75, -0.3), (12.1, -0.1)]
    cv.fill(acc, tri)
    # Rückenplatte (erhöht)
    plate = P['plate']
    if plate:
        cv.fill(lambda u, v: shade(plate, 0.92 + 0.08 * (v - 0.0625) / 0.375), PLATE)
    else:
        cv.fill(lambda u, v: tuple(x + nz(u, v) * 1.5 for x in (26, 29, 35)), PLATE)
    hi = shade(plate, 1.12) if plate else (56, 62, 72)
    lo = shade(plate, 0.6) if plate else (12, 13, 16)
    cv.fill(hi, PLATE, where=lambda u, v: v > 0.375)
    cv.fill(lo, PLATE, where=lambda u, v: v < 0.125)
    tick = (20, 22, 26) if plate else (70, 76, 86)
    cv.fill(tick, PLATE, where=lambda u, v: (abs(u - 15.5) < 0.04 or abs(u - 15.68) < 0.04) and 0.15 < v < 0.36)
    # Angel (im Griff versteckt) dunkler
    cv.fill((10, 11, 13), BLADE, where=lambda u, v: u < 11.6)
    return cv.img


def paint_handle(part, P):
    s = part.s
    cv = Canvas(part)
    nz = noise(11 if s > 0 else 13)

    def V(a, b):   # v'-Band -> Test auf v
        return lambda u, v: a <= v * s <= b

    def poly(pl):
        return mirror(pl, s)

    head, inlay, side = P['head'], P['inlay'], P['side']
    mid = P['mid']
    # Grundkörper
    cv.fill(lambda u, v: tuple(x + nz(u, v) * 1.6 for x in BLACK), poly(BODY))
    if mid:   # Gold: silbernes Mittelteil
        cv.fill(lambda u, v: shade(mid, 0.9 + 0.1 * (v * s - H_IN)), poly(BODY), where=lambda u, v: u > 8.75)
    cv.fill(FRAME_EDGE, poly(BODY), where=V(1.0, 2))
    cv.fill(shade(side, 0.85), poly(BODY), where=lambda u, v: 0.9375 <= v * s < 1.0 and 0.375 < u < 10.3)
    cv.fill(CHANNEL, poly(BODY), where=V(0, 0.0625))
    # Silberne Führungsschiene (Liner) mit Kerben
    cv.fill(SILVER, poly(BODY), where=lambda u, v: 0.1875 <= v * s < 0.4375 and 1.5 < u < 7.6)
    cv.fill(SILVER_LIGHT, poly(BODY), where=lambda u, v: 0.375 <= v * s < 0.4375 and 1.5 < u < 7.6)
    cv.fill(SILVER_DARK, poly(BODY), where=lambda u, v: 0.1875 <= v * s < 0.25 and 1.5 < u < 7.6)
    for k in (2.6, 4.55, 6.5):
        cv.fill((70, 76, 86), poly(BODY), where=lambda u, v, k=k: abs(u - k) < 0.04 and 0.1875 <= v * s < 0.4375)
    # Leucht-Einlage
    cv.fill(lambda u, v: shade(inlay, 0.94 + 0.06 * math.sin(u * 0.9)), poly(INLAY))
    cv.fill(shade(inlay, 1.12), poly(INLAY), where=V(0.875, 2))
    cv.fill(shade(inlay, 0.78), poly(INLAY), where=lambda u, v: v * s < 0.5625 and u < 7.9)
    cv.fill(shade(inlay, 0.86), poly(INLAY), where=lambda u, v: u > 8.5)
    cv.fill(shade(inlay, 0.68), poly(INLAY), where=lambda u, v: u < 1.44)
    # Kopf mit Fase
    cv.fill(lambda u, v: shade(head, 0.97 + 0.04 * nz(u, v)), poly(HEAD))
    cv.fill(shade(head, 1.12), poly(HEAD), where=lambda u, v: v * s > 0.9375 or u > HANDLE_LEN - 0.07)
    cv.fill(shade(head, 0.72), poly(HEAD), where=lambda u, v: v * s < 0.125)
    cv.fill(shade(head, 0.62), poly(HEAD), where=lambda u, v: abs(dist_to_line(u, v * s, (10.25, H_IN), (10.5, H_OUT))) < 0.07)
    # Schraube
    screw_art = ['.DDDD.', 'DSLLSD', 'DLKKSD', 'DLKKSD', 'DSSSDD', '.DDDD.']
    screw_col = {'.': shade(head, 0.8), 'D': SILVER_DARK, 'S': SILVER, 'L': SILVER_LIGHT, 'K': (52, 56, 64)}

    def screw(u, v):
        x = min(5, max(0, int((u - (PIN_U - 0.1875)) * PX)))
        y = min(5, max(0, int(((PIN_V + 0.1875) - v * s) * PX)))
        return screw_col[screw_art[y][x]]
    cv.fill(screw, rect=(PIN_U - 0.1875, PIN_U + 0.1875, *sorted((s * (PIN_V - 0.1875), s * (PIN_V + 0.1875)))))
    # Endkappe
    cv.fill(lambda u, v: shade(side, 0.95 + 0.05 * nz(u, v)), poly(TIP))
    cv.fill(shade(side, 1.15), poly(TIP), where=lambda u, v: u < 0.07 or v * s > 0.98)
    cv.fill(shade(side, 0.7), poly(TIP), where=lambda u, v: u > 0.31)
    # Logo „Z“ auf Griff A
    if s > 0:
        Z = ['WWWWWWW', 'WKKKKKW', 'WWWWKWW', 'WWWKWWW', 'WWKWWWW', 'WKKKKKW', 'WWWWWWW']

        def logo(u, v):
            x = min(6, int((u - 9.125) * PX))
            y = min(6, int((0.8125 - v) * PX))
            return WHITE if Z[y][x] == 'W' else (16, 18, 22)
        cv.fill(logo, rect=(9.125, 9.5625, 0.375, 0.8125))
    # Außenkante: Leuchtleiste (für die Seitenfläche)
    cv.fill(shade(side, 1.08), rect=(0.375, 10.375, *sorted((s * 1.0625, s * 1.125))))
    # Verschluss (nur Griff B)
    if s < 0:
        cv.fill(SILVER, rect=(-0.3125, 0.25, -0.8125, -0.5))
        cv.fill(SILVER_LIGHT, rect=(-0.3125, 0.25, -0.8125, -0.5), where=lambda u, v: v < -0.75)
        cv.fill(SILVER_DARK, rect=(-0.3125, 0.25, -0.8125, -0.5), where=lambda u, v: v > -0.5625)
    return cv.img


# ---------------------------------------------------------------------------
# Textur-Atlas: Bemalung normal + um 90° gedreht (damit nie „rotation“ nötig ist)
# ---------------------------------------------------------------------------
LAYOUT = {
    'blade': dict(o=(0, 0), r=(200, 0)),
    'handle_a': dict(o=(0, 28), r=(228, 0)),
    'handle_b': dict(o=(0, 50), r=None),
}


def build_texture(parts, P):
    tex = Image.new('RGBA', (ATLAS, ATLAS), (0, 0, 0, 0))
    for part in parts:
        img = paint_blade(part, P) if part.name == 'blade' else paint_handle(part, P)
        lay = LAYOUT[part.name]
        tex.paste(img, lay['o'])
        if lay['r']:
            tex.paste(img.rotate(90, expand=True), lay['r'])
    return tex


# ---------------------------------------------------------------------------
# Modell-Elemente
# ---------------------------------------------------------------------------
def rot(a, x, y):
    r = math.radians(a)
    c, s = math.cos(r), math.sin(r)
    return c * x - s * y, s * x + c * y


class Pose:
    """Starre Bewegung in der Ebene: p -> R(angle)·p + (bx, by)."""

    def __init__(self, angle=0.0, b=(0.0, 0.0)):
        self.angle, self.b = angle, b

    def then_rotate(self, theta, pivot):
        bx, by = rot(theta, self.b[0] - pivot[0], self.b[1] - pivot[1])
        return Pose(self.angle + theta, (bx + pivot[0], by + pivot[1]))

    def apply(self, p):
        x, y = rot(self.angle, *p)
        return x + self.b[0], y + self.b[1]


def to_model(pose):
    """Lokale Messer-Ebene -> Modellraum (diagonal wie ein Schwert, Mitte bei 8/8)."""
    q = pose.then_rotate(45, (U_CENTER, 0.0))
    return Pose(q.angle, (q.b[0] + 8 - U_CENTER, q.b[1] + 8))


FACE_VERTS = {   # Minecraft FaceInfo: Eckpunkt-Reihenfolge je Seite (0 = min, 1 = max)
    'down': [(0, 0, 1), (0, 0, 0), (1, 0, 0), (1, 0, 1)],
    'up': [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)],
    'north': [(1, 1, 0), (1, 0, 0), (0, 0, 0), (0, 1, 0)],
    'south': [(0, 1, 1), (0, 0, 1), (1, 0, 1), (1, 1, 1)],
    'west': [(0, 1, 0), (0, 0, 0), (0, 0, 1), (0, 1, 1)],
    'east': [(1, 1, 1), (1, 0, 1), (1, 0, 0), (1, 1, 0)],
}
FACE_NORMAL = {'down': (0, -1, 0), 'up': (0, 1, 0), 'north': (0, 0, -1), 'south': (0, 0, 1),
               'west': (-1, 0, 0), 'east': (1, 0, 0)}


def r90(k, x, y):
    for _ in range(k % 4):
        x, y = -y, x
    return x, y


def element(part, bx, pose):
    """Ein Quader -> Minecraft-Element (mit Drehung um z, Winkel −45…45)."""
    mp = to_model(pose)
    A = mp.angle
    k = round(A / 90)
    a = A - 90 * k
    if abs(a) > 45 + 1e-9:
        raise ValueError(a)
    O = (8.0, 8.0)
    sx, sy = rot(-a, mp.b[0] - O[0], mp.b[1] - O[1])
    s = (sx + O[0], sy + O[1])
    corners = [r90(k, u, v) for u in (bx['u0'], bx['u1']) for v in (bx['v0'], bx['v1'])]
    xs = [c[0] + s[0] for c in corners]
    ys = [c[1] + s[1] for c in corners]
    frm = [min(xs), min(ys), 8 + bx['w0']]
    to = [max(xs), max(ys), 8 + bx['w1']]
    for val in frm + to:
        if not -16 <= val <= 32:
            raise ValueError(f'Element außerhalb des Modellraums: {val}')

    lay = LAYOUT[part.name]
    span_w = bx['w1'] - bx['w0']

    def local(q):
        x, y = r90(-k, q[0] - s[0], q[1] - s[1])
        return x, y, q[2] - 8

    def wanted(kind, u, v, w):
        X = (u - part.umin) * PX
        Y = (part.vmax - v) * PX
        f = (w - bx['w0']) / span_w
        if kind in ('front', 'back'):
            return X, Y
        if kind == 'top':
            return X, bx['r0'] + f
        if kind == 'bottom':
            return X, bx['r1'] - 1 + f
        if kind == 'right':
            return bx['c1'] - 1 + f, Y
        return bx['c0'] + f, Y

    faces = {}
    for face, verts in FACE_VERTS.items():
        n = FACE_NORMAL[face]
        if n[2]:
            kind = 'front' if n[2] > 0 else 'back'
        else:
            lx, ly = r90(-k, n[0], n[1])
            kind = {(0, 1): 'top', (0, -1): 'bottom', (1, 0): 'right', (-1, 0): 'left'}[(round(lx), round(ly))]
        if kind not in bx['faces']:
            continue
        pts = []
        for vx in verts:
            q = (to[0] if vx[0] else frm[0], to[1] if vx[1] else frm[1], to[2] if vx[2] else frm[2])
            pts.append(wanted(kind, *local(q)))
        uv = None
        sources = [lambda X, Y: (lay['o'][0] + X, lay['o'][1] + Y)]
        if lay['r']:
            sources.append(lambda X, Y: (lay['r'][0] + Y, lay['r'][1] + part.W - X))
        for src in sources:
            t = [src(*p) for p in pts]
            if (abs(t[0][0] - t[1][0]) < 1e-6 and abs(t[2][0] - t[3][0]) < 1e-6
                    and abs(t[0][1] - t[3][1]) < 1e-6 and abs(t[1][1] - t[2][1]) < 1e-6):
                uv = [t[0][0] * UV, t[0][1] * UV, t[2][0] * UV, t[2][1] * UV]
                break
        if uv is None:
            raise ValueError(f'Keine passende UV für {part.name} {face} (k={k})')
        faces[face] = {'uv': [round(x, 5) for x in uv], 'texture': '#skin'}
    el = {
        'from': [round(x, 5) for x in frm],
        'to': [round(x, 5) for x in to],
    }
    if abs(a) > 1e-9:
        el['rotation'] = {'angle': round(a, 5), 'axis': 'z', 'origin': [8, 8, 8]}
    el['faces'] = faces
    if bx['emission']:
        el['light_emission'] = bx['emission']
    return el


# ---------------------------------------------------------------------------
# Stellungen für die Flip-Animation
# ---------------------------------------------------------------------------
SWING = 1    # Drehrichtung der Klinge um Griff B (zur Bildschirmmitte hin)
FOLD = -1    # Drehrichtung von Griff A beim Zuklappen
PIN_A = (PIN_U, PIN_V)
PIN_B = (PIN_U, -PIN_V)


def poses(beta, gamma):
    blade = Pose().then_rotate(beta, PIN_B)
    pin_a = blade.apply(PIN_A)
    handle_a = blade.then_rotate(gamma, pin_a)
    return {'blade': blade, 'handle_a': handle_a, 'handle_b': Pose()}


FRAMES = {}
for i in range(9):
    FRAMES[f's{i}'] = (SWING * 22.5 * i, 0.0)
for j in range(1, 9):
    FRAMES[f'f{j}'] = (SWING * 180.0, FOLD * 22.5 * j)

# 40 Ticks = 2 Sekunden: offen – Klinge schwingt ein – Griff klappt zu – zu – auf – Klinge schwingt aus
TIMELINE = (['s0'] * 6 + [f's{i}' for i in range(1, 9)] + [f'f{j}' for j in range(1, 9)]
            + ['f8'] * 4 + ['f6', 'f4', 'f2', 's8'] + [f's{i}' for i in range(7, 0, -1)] + ['s0'] * 3)
assert len(TIMELINE) == 40, len(TIMELINE)
PERIOD = len(TIMELINE)
CONSUME_SECONDS = 100000     # 2.000.000 Ticks, Vielfaches von 40

DISPLAY = {
    'thirdperson_righthand': {'rotation': [0, -90, 55], 'translation': [0, 4.0, 0.5], 'scale': [0.85, 0.85, 0.85]},
    'thirdperson_lefthand': {'rotation': [0, 90, -55], 'translation': [0, 4.0, 0.5], 'scale': [0.85, 0.85, 0.85]},
    'firstperson_righthand': {'rotation': [0, -60, 10], 'translation': [-1.5, 5.0, -1.5], 'scale': [0.58, 0.58, 0.58]},
    'firstperson_lefthand': {'rotation': [0, -60, -30], 'translation': [-1.5, 4.0, -2.5], 'scale': [0.58, 0.58, 0.58]},
    'ground': {'rotation': [0, 0, 0], 'translation': [0, 2, 0], 'scale': [0.5, 0.5, 0.5]},
    'head': {'rotation': [0, 180, 0], 'translation': [0, 13, 7], 'scale': [1, 1, 1]},
    'fixed': {'rotation': [0, 180, 0], 'scale': [1, 1, 1]},
}


def frame_model(parts, name):
    beta, gamma = FRAMES[name]
    ps = poses(beta, gamma)
    elements = []
    for part in parts:
        for bx in part.boxes:
            elements.append(element(part, bx, ps[part.name]))
    return {'parent': f'{NS}:item/butterfly/base', 'textures': {'particle': '#skin'}, 'elements': elements}


# ---------------------------------------------------------------------------
# Paket-Dateien
# ---------------------------------------------------------------------------
SWORDS = ['wooden_sword', 'stone_sword', 'copper_sword', 'iron_sword', 'golden_sword', 'diamond_sword', 'netherite_sword']
NAMES = {
    'neon': ['Butterfly', 'butterfly', 'Butterfly Knife', 'Butterfly Messer', 'Butterfly-Messer', 'Balisong', 'Butterfly Neon'],
    'rot': ['Butterfly Rot', 'Butterfly rot', 'Butterfly Red'],
    'gold': ['Butterfly Gold', 'Butterfly gold', 'Butterfly Gelb'],
    'blau': ['Butterfly Blau', 'Butterfly blau', 'Butterfly Blue'],
}


def model_ref(variant, frame):
    return {'type': 'minecraft:model', 'model': f'{NS}:item/butterfly/{variant}/{frame}'}


def item_definition(variant):
    entries = []
    last = None
    for value in range(PERIOD):
        frame = TIMELINE[(PERIOD - value) % PERIOD]   # use_cycle zählt die verbleibenden Ticks herunter
        if frame != last:
            entries.append({'threshold': value - 0.5, 'model': model_ref(variant, frame)})
            last = frame
    return {'model': {
        'type': 'minecraft:condition',
        'property': 'minecraft:using_item',
        'on_true': {'type': 'minecraft:range_dispatch', 'property': 'minecraft:use_cycle', 'period': PERIOD,
                    'entries': entries, 'fallback': model_ref(variant, 's0')},
        'on_false': model_ref(variant, 's0'),
    }}


def sword_definition(sword):
    return {'model': {
        'type': 'minecraft:select',
        'property': 'minecraft:component',
        'component': 'minecraft:custom_name',
        'cases': [{'when': NAMES[v], 'model': model_ref(v, 's0')} for v in ORDER],
        'fallback': {'type': 'minecraft:model', 'model': f'minecraft:item/{sword}'},
    }}


def components(variant, snbt=False):
    P = VARIANTS[variant]
    name = f'Butterfly-Messer {P["name"]}'
    lore = 'Rechtsklick halten: Flip-Trick'
    if snbt:
        return (f'item_model="{NS}:butterfly_{variant}",item_name="{name}",'
                f'lore=[{{text:"{lore}",color:"gray",italic:false}}],'
                f'consumable={{consume_seconds:{CONSUME_SECONDS},animation:"none",has_consume_particles:false}},'
                f'use_effects={{can_sprint:true,speed_multiplier:1,interact_vibrations:false}}')
    return {
        'minecraft:item_model': f'{NS}:butterfly_{variant}',
        'minecraft:item_name': name,
        'minecraft:lore': [{'text': lore, 'color': 'gray', 'italic': False}],
        'minecraft:consumable': {'consume_seconds': CONSUME_SECONDS, 'animation': 'none', 'has_consume_particles': False},
        'minecraft:use_effects': {'can_sprint': True, 'speed_multiplier': 1.0, 'interact_vibrations': False},
    }


def give_command(variant):
    return f'give @s minecraft:iron_sword[{components(variant, snbt=True)}]'


def chat_command(variant):
    """Kurzform (unter 256 Zeichen) zum Eintippen im Chat."""
    return (f'/give @s iron_sword[item_model="{NS}:butterfly_{variant}",item_name="Butterfly {VARIANTS[variant]["name"]}",'
            f'consumable={{consume_seconds:{CONSUME_SECONDS},animation:"none",has_consume_particles:false}},'
            f'use_effects={{can_sprint:true,speed_multiplier:1}}]')


def dump(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))


def zip_dir(src, dst):
    with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for root, _, files in os.walk(src):
            for fn in sorted(files):
                full = os.path.join(root, fn)
                info = zipfile.ZipInfo(os.path.relpath(full, src).replace(os.sep, '/'), (2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                with open(full, 'rb') as f:
                    z.writestr(info, f.read())


def export_preview(out, parts):
    """Daten für die 3D-Vorschau (vorschau.html): Modelle, Anzeige-Werte, Texturen, Animation."""
    import base64
    import io
    data = {'frames': {n: frame_model(parts, n)['elements'] for n in FRAMES}, 'display': DISPLAY,
            'timeline': TIMELINE, 'variants': {}, 'order': ORDER}
    for v in ORDER:
        buf = io.BytesIO()
        build_texture(parts, VARIANTS[v]).save(buf, 'PNG', optimize=True)
        data['variants'][v] = {'name': VARIANTS[v]['name'], 'color': '#%02x%02x%02x' % VARIANTS[v]['inlay'],
                               'texture': 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode(),
                               'give': chat_command(v)}
    with open(os.path.join(out, 'knife-data.js'), 'w', encoding='utf-8') as f:
        f.write('window.KNIFE = ' + json.dumps(data, separators=(',', ':')) + ';\n')


def build(out):
    here = os.path.dirname(os.path.abspath(__file__))
    work = os.path.join(out, 'build')     # entpackte Pakete + Vorschau-Daten (nicht im Git)
    rp = os.path.join(work, 'resourcepack')
    dp = os.path.join(work, 'datapack')
    for d in (rp, dp):
        shutil.rmtree(d, ignore_errors=True)
    parts = [make_blade(), make_handle(1), make_handle(-1)]
    a = f'{rp}/assets/{NS}'

    # Ressourcenpaket
    dump(f'{rp}/pack.mcmeta', {'pack': {
        'description': [{'text': 'Z Butterfly-Messer', 'color': 'green'}, {'text': '\n3D · 4 Farben · Flip-Animation', 'color': 'gray'}],
        'pack_format': 63, 'supported_formats': [63, 75], 'min_format': 63, 'max_format': 75}})
    icon = os.path.join(here, 'pack.png')
    if os.path.exists(icon):
        shutil.copy(icon, f'{rp}/pack.png')
    dump(f'{a}/models/item/butterfly/base.json', {'gui_light': 'front', 'display': DISPLAY})
    count = 0
    for name in FRAMES:
        m = frame_model(parts, name)
        count = max(count, len(m['elements']))
        dump(f'{a}/models/item/butterfly/frame_{name}.json', m)
    for v in ORDER:
        P = VARIANTS[v]
        tex_dir = f'{a}/textures/item/butterfly'
        os.makedirs(tex_dir, exist_ok=True)
        build_texture(parts, P).save(f'{tex_dir}/{v}.png', optimize=True)
        for name in FRAMES:
            dump(f'{a}/models/item/butterfly/{v}/{name}.json',
                 {'parent': f'{NS}:item/butterfly/frame_{name}', 'textures': {'skin': f'{NS}:item/butterfly/{v}'}})
        dump(f'{a}/items/butterfly_{v}.json', item_definition(v))
    for sword in SWORDS:
        dump(f'{rp}/assets/minecraft/items/{sword}.json', sword_definition(sword))

    # Datenpaket
    dump(f'{dp}/pack.mcmeta', {'pack': {
        'description': [{'text': 'Z Butterfly-Messer', 'color': 'green'}, {'text': '\nRezepte + /function zknife:…', 'color': 'gray'}],
        'min_format': [94, 1], 'max_format': [94, 1]}})
    d = f'{dp}/data/{NS}'
    for v in ORDER:
        P = VARIANTS[v]
        dump(f'{d}/recipe/butterfly_{v}.json', {
            'type': 'minecraft:crafting_shapeless', 'category': 'equipment', 'group': 'zknife_butterfly',
            'ingredients': ['minecraft:iron_sword', f'minecraft:{P["dye"]}', 'minecraft:glowstone_dust'],
            'result': {'id': 'minecraft:iron_sword', 'count': 1, 'components': components(v)}})
        os.makedirs(f'{d}/function', exist_ok=True)
        with open(f'{d}/function/{v}.mcfunction', 'w', encoding='utf-8') as f:
            f.write(give_command(v) + '\n')
    with open(f'{d}/function/alle.mcfunction', 'w', encoding='utf-8') as f:
        f.write(''.join(give_command(v) + '\n' for v in ORDER))

    export_preview(work, parts)
    zip_dir(rp, os.path.join(out, 'Z-Butterfly-Messer-Ressourcenpaket.zip'))
    zip_dir(dp, os.path.join(out, 'Z-Butterfly-Messer-Datenpaket.zip'))
    for v in ORDER:
        assert len(chat_command(v)) <= 256, chat_command(v)
    print(f'{len(FRAMES)} Stellungen, max. {count} Elemente je Modell, {len(ORDER)} Farben -> {out}')
    return parts


if __name__ == '__main__':
    build(os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')))
