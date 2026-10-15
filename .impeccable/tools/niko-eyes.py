"""Cuts Niko's eye layers straight out of the reference render into assets/niko-eyes.png.

python .impeccable/tools/niko-eyes.py   (from the repo root)

Atlas: 5 x 2 tiles of T px. Row 0 = eyeL (his left, screen right in the front view), row 1 = eyeR.
Columns: 0 sclera (eye-white fill, also the iris clip mask), 1 iris (slides for gaze), 2 lash, 3 brow, 4 shut lash.
Each tile covers BOX reference px centred on the eye decal, u toward model +x, v down, so it maps 1:1 onto the
eyeL/eyeR decal UVs built by niko-rig.mjs (EYE_DECAL). Prints the decal numbers niko-rig needs.
"""
import json
import numpy as np
from PIL import Image
from scipy import ndimage

REF = "Low-Poly Starry Mage Explorer.png"
OUT = "assets/niko-eyes.png"
T = 256
BOX = 77  # reference px per tile (the figure is 1110 px tall = 1 model unit)

src = Image.open(REF).convert("RGB")
a = np.asarray(src).astype(float)
bg = a[5, 5]
fig = np.abs(a - bg).sum(2) > 40
ys, xs = np.where(fig)
top, height = ys.min(), ys.max() - ys.min()

# Eye bounding boxes: dark lash or cool iris pixels in the face window, below the brows
win = (slice(212, 268), slice(560, 720))
w = a[win]
L = w.mean(2)
dark = (L < 120) | (w[..., 2] - w[..., 0] > 6)
lab, n = ndimage.label(ndimage.binary_closing(dark, iterations=2))
sizes = ndimage.sum(dark, lab, range(1, n + 1))
eyes = []
for i in np.argsort(sizes)[-2:]:
    yy, xx = np.where(lab == i + 1)
    eyes.append((xx.min() + 560, xx.max() + 560, yy.min() + 212, yy.max() + 212))
eyes.sort()
(r0, r1, rt, rb), (l0, l1, lt, lb) = eyes  # screen-left = his right eye
mid = (r1 + l0) / 2
half = ((l0 + l1) / 2 - (r0 + r1) / 2) / 2
cy = (min(rt, lt) + max(rb, lb)) / 2
box_cy = cy - 8  # leave room for the brow above
print("eye boxes", eyes, "mid", mid, "half spacing px", half)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def tile(cx):
    box = (cx - BOX / 2, box_cy - BOX / 2, cx + BOX / 2, box_cy + BOX / 2)
    img = np.asarray(src.transform((T, T), Image.EXTENT, box, Image.BICUBIC)).astype(float)
    img = ndimage.gaussian_filter(img, (1.2, 1.2, 0))
    R, G, B = img[..., 0], img[..., 1], img[..., 2]
    L = img.mean(2)
    warm = R - B
    k = T / BOX
    yv = np.arange(T)[:, None].repeat(T, 1)
    eye_top = (cy - box_cy) * k + T / 2 - 22 * k  # just above the lash
    brow_zone = yv < eye_top

    lash = smooth(125, 95, L) * smooth(-2, 12, warm) * ~brow_zone
    iris = smooth(-4, 10, B - R) * smooth(200, 160, L) * ~brow_zone
    brow = smooth(185, 160, L) * smooth(70, 50, warm) * smooth(60, 85, L) * brow_zone
    scl_raw = (smooth(160, 185, L) * smooth(68, 52, warm)) * ~brow_zone

    # Eye interior: lash, iris and sclera blobs joined and hole-filled, kept to the main blob
    body = (lash > 0.5) | (iris > 0.5) | (scl_raw > 0.5)
    body = ndimage.binary_closing(body, iterations=4)
    lab, n = ndimage.label(body)
    if n:
        body = lab == (np.argmax(ndimage.sum(body, lab, range(1, n + 1))) + 1)
    body = ndimage.binary_fill_holes(body)
    # lash rows above the interior belong to the lash only
    interior = ndimage.binary_erosion(body, iterations=2) & ((lash < 0.5) | (iris > 0.5) | (scl_raw > 0.5))
    interior = ndimage.binary_fill_holes(ndimage.binary_closing(interior, iterations=3))
    sclA = smooth(0.35, 0.65, ndimage.gaussian_filter(interior.astype(float), 1.4))

    crisp = lambda m: smooth(0.32, 0.62, m)

    def biggest(m):
        lab, n = ndimage.label(m > 0.3)
        if not n:
            return m
        keep = lab == (np.argmax(ndimage.sum(m > 0.3, lab, range(1, n + 1))) + 1)
        return m * ndimage.binary_dilation(keep, iterations=2)

    lashA, irisA, browA = crisp(biggest(lash)), crisp(iris) * sclA, crisp(biggest(brow))

    def flat(mask, color):
        out = np.zeros((T, T, 4))
        out[..., :3] = color
        out[..., 3] = mask * 255
        return out

    def med(mask, fallback):
        sel = img[mask > 0.8]
        return np.median(sel, 0) if len(sel) > 20 else np.array(fallback, float)

    lash_c = med(lashA, (60, 42, 42)) * 0.85
    brow_c = med(browA, (150, 122, 120))
    scl_c = np.array([246, 238, 240.0])

    # Iris keeps its own two-tone colours; spread them outward so its soft edge never picks up sclera or lash
    core = (iris > 0.85) & (lash < 0.3)
    iris_rgb = img.copy()
    _, (iy, ix) = ndimage.distance_transform_edt(~core, return_indices=True)
    iris_rgb = img[iy, ix]
    iris_t = np.concatenate([iris_rgb, (irisA * 255)[..., None]], 2)

    # Sclera: soft lavender shade under the lash
    scl_t = flat(sclA, scl_c)
    rows = np.where(interior.any(1))[0]
    if len(rows):
        t = np.clip((yv - rows[0]) / max(1, (rows[-1] - rows[0]) * 0.45), 0, 1)
        shade = np.array([196, 186, 206.0])
        scl_t[..., :3] = shade * (1 - t[..., None]) + scl_c * t[..., None]

    # Shut eye: the lash arch flipped into a smile-curve, dropped to mid-eye, a little thinner
    thick = ndimage.binary_opening(lashA > 0.5, iterations=int(2.2 * k))
    m = ndimage.binary_dilation(thick, iterations=int(1.2 * k)) & (lashA > 0.5)
    m = m.astype(float)[::-1]
    lrows = np.where((lashA > 0.5).any(1))[0]
    if len(lrows):
        frows = np.where(m.any(1))[0]
        target = int((rows[0] + rows[-1]) / 2 + 4 * k) if len(rows) else T // 2
        m = np.roll(m, target - int(frows.mean()), 0)
    shutA = crisp(ndimage.gaussian_filter(m, 1.2))

    return [scl_t, iris_t, flat(lashA, lash_c), flat(browA, brow_c), flat(shutA, lash_c)]


atlas = np.zeros((2 * T, 5 * T, 4))
for row, cx in enumerate([mid + half, mid - half]):  # eyeL, eyeR
    for col, t in enumerate(tile(cx)):
        atlas[row * T : (row + 1) * T, col * T : (col + 1) * T] = t
Image.fromarray(np.clip(atlas, 0, 255).astype(np.uint8), "RGBA").save(OUT, optimize=True)

unit = 1 / height
print(json.dumps({
    "x": round(half * unit, 4),
    "y": round(0.5 - (box_cy - top) * unit, 4),
    "hw": round(BOX / 2 * unit, 4),
    "hh": round(BOX / 2 * unit, 4),
}))
