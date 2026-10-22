#!/usr/bin/env python3
"""Generates the PWA icons in app/icons/ with no third-party dependencies.

Draws a dark-navy tile with a ring of six gem-colored wedges (one per category)
around a glowing Stormlight diamond, and writes PNGs using zlib directly.

Usage: python3 tools/make-icons.py
Outputs: icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png (180),
         icon.svg (same design, used as favicon).
"""
import math
import os
import struct
import zlib

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'app', 'icons')

GEMS = ['#2f6fd6', '#c0392b', '#1e9e5a', '#e0a526', '#8e44ad', '#9aa7b8']
SS = 4  # supersampling factor per axis


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def write_png(path, w, h, rgba):
    raw = bytearray()
    stride = w * 4
    for y in range(h):
        raw.append(0)
        raw.extend(rgba[y * stride:(y + 1) * stride])

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def coverage(poly, size):
    """Rasterize a polygon (list of (x, y) in 0..1 units) to per-pixel coverage 0..255
    using SSxSS supersampling with even-odd scanline spans."""
    hi = size * SS
    acc = [0] * (size * size)
    pts = [(x * hi, y * hi) for x, y in poly]
    n = len(pts)
    ys = [p[1] for p in pts]
    y0 = max(0, int(min(ys)))
    y1 = min(hi - 1, int(max(ys)) + 1)
    for sy in range(y0, y1 + 1):
        yc = sy + 0.5
        xs = []
        for i in range(n):
            ax, ay = pts[i]
            bx, by = pts[(i + 1) % n]
            if (ay <= yc < by) or (by <= yc < ay):
                xs.append(ax + (yc - ay) * (bx - ax) / (by - ay))
        xs.sort()
        row = (sy // SS) * size
        for j in range(0, len(xs) - 1, 2):
            xa = max(0, int(math.ceil(xs[j] - 0.5)))
            xb = min(hi - 1, int(math.floor(xs[j + 1] - 0.5)))
            for sx in range(xa, xb + 1):
                acc[row + sx // SS] += 1
    full = SS * SS
    return [min(255, v * 255 // full) for v in acc]


def circle(cx, cy, r, steps=160):
    return [(cx + r * math.cos(2 * math.pi * i / steps), cy + r * math.sin(2 * math.pi * i / steps)) for i in range(steps)]


def wedge(cx, cy, r0, r1, a0, a1, steps=40):
    outer = [(cx + r1 * math.cos(a0 + (a1 - a0) * i / steps), cy + r1 * math.sin(a0 + (a1 - a0) * i / steps)) for i in range(steps + 1)]
    inner = [(cx + r0 * math.cos(a1 - (a1 - a0) * i / steps), cy + r0 * math.sin(a1 - (a1 - a0) * i / steps)) for i in range(steps + 1)]
    return outer + inner


def rounded_rect(r, steps=24):
    pts = []
    for cx, cy, start in ((1 - r, r, -90), (1 - r, 1 - r, 0), (r, 1 - r, 90), (r, r, 180)):
        for i in range(steps + 1):
            a = math.radians(start + 90 * i / steps)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def design(scale):
    """List of (polygon, rgb, alpha) layers, centered, scaled by `scale` (1 = fills tile)."""
    c = 0.5
    s = scale
    layers = []
    gap = math.radians(4)
    for i, col in enumerate(GEMS):
        a0 = math.radians(-90 - 30 + i * 60) + gap / 2
        a1 = a0 + math.radians(60) - gap
        layers.append((wedge(c, c, 0.27 * s, 0.42 * s, a0, a1), hex_rgb(col), 1.0))
        # facet highlight on each wedge
        layers.append((wedge(c, c, 0.36 * s, 0.40 * s, a0 + 0.05, a1 - 0.05), (255, 255, 255), 0.22))
    # central diamond (brilliant cut silhouette)
    d = [(c - 0.13 * s, c - 0.06 * s), (c - 0.07 * s, c - 0.15 * s), (c + 0.07 * s, c - 0.15 * s),
         (c + 0.13 * s, c - 0.06 * s), (c, c + 0.17 * s)]
    layers.append((d, (233, 246, 255), 1.0))
    layers.append(([(c - 0.07 * s, c - 0.15 * s), (c, c - 0.06 * s), (c, c + 0.17 * s), (c - 0.13 * s, c - 0.06 * s)], (143, 211, 255), 0.55))
    layers.append(([(c - 0.13 * s, c - 0.06 * s), (c + 0.13 * s, c - 0.06 * s), (c + 0.12 * s, c - 0.045 * s), (c - 0.12 * s, c - 0.045 * s)], (90, 169, 224), 0.8))
    return layers


def render(size, maskable=False):
    bg_top = hex_rgb('#16245a')
    bg_bot = hex_rgb('#070b18')
    glow = (143, 211, 255)
    img = bytearray(size * size * 4)
    # Background: radial navy gradient + stormlight glow
    for y in range(size):
        for x in range(size):
            u, v = (x + 0.5) / size, (y + 0.5) / size
            dist = math.hypot(u - 0.5, v - 0.42) / 0.75
            t = min(1.0, dist)
            r = bg_top[0] * (1 - t) + bg_bot[0] * t
            g = bg_top[1] * (1 - t) + bg_bot[1] * t
            b = bg_top[2] * (1 - t) + bg_bot[2] * t
            gd = math.hypot(u - 0.5, v - 0.5)
            ga = max(0.0, 1 - gd / (0.30 if maskable else 0.42)) ** 2 * 0.55
            r, g, b = r + (glow[0] - r) * ga, g + (glow[1] - g) * ga, b + (glow[2] - b) * ga
            i = (y * size + x) * 4
            img[i:i + 4] = bytes((int(r), int(g), int(b), 255))
    # Shape mask (rounded tile for "any" icons, full bleed for maskable)
    if not maskable:
        m = coverage(rounded_rect(0.22), size)
        for p in range(size * size):
            img[p * 4 + 3] = m[p]
    for poly, rgb, alpha in design(0.72 if maskable else 1.0):
        cov = coverage(poly, size)
        for p, cv in enumerate(cov):
            if not cv:
                continue
            a = cv / 255 * alpha
            i = p * 4
            for k in range(3):
                img[i + k] = int(img[i + k] * (1 - a) + rgb[k] * a)
    return img


def svg():
    parts = []
    for poly, rgb, alpha in design(1.0):
        pts = ' '.join(f'{x * 100:.2f},{y * 100:.2f}' for x, y in poly)
        parts.append(f'<polygon points="{pts}" fill="rgb{rgb}" fill-opacity="{alpha}"/>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
            '<defs><radialGradient id="b" cx="50%" cy="42%" r="75%"><stop offset="0" stop-color="#16245a"/>'
            '<stop offset="1" stop-color="#070b18"/></radialGradient>'
            '<radialGradient id="g" cx="50%" cy="50%" r="42%"><stop offset="0" stop-color="#8fd3ff" stop-opacity=".55"/>'
            '<stop offset="1" stop-color="#8fd3ff" stop-opacity="0"/></radialGradient></defs>'
            '<rect width="100" height="100" rx="22" fill="url(#b)"/><rect width="100" height="100" rx="22" fill="url(#g)"/>'
            + ''.join(parts) + '</svg>\n')


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, size, mask in (('icon-192.png', 192, False), ('icon-512.png', 512, False),
                             ('icon-maskable-512.png', 512, True), ('apple-touch-icon.png', 180, True)):
        write_png(os.path.join(OUT, name), size, size, render(size, mask))
        print('wrote', name)
    with open(os.path.join(OUT, 'icon.svg'), 'w') as f:
        f.write(svg())
    print('wrote icon.svg')


if __name__ == '__main__':
    main()
