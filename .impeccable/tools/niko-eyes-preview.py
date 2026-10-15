"""Preview assets/niko-eyes.png: each eye's layers stacked (open, shut) over skin, next to the reference crop.
python .impeccable/tools/niko-eyes-preview.py <out.png>"""
import sys
from PIL import Image

T = 256
atlas = Image.open("assets/niko-eyes.png").convert("RGBA")
tiles = lambda row: [atlas.crop((c * T, row * T, (c + 1) * T, (row + 1) * T)) for c in range(5)]
skin = (246, 200, 172, 255)
out = Image.new("RGB", (T * 5, T), (50, 50, 50))
ref = Image.open("Low-Poly Starry Mage Explorer.png").convert("RGB").crop((560, 190, 715, 268)).resize((T * 2 - 10, int(78 * (T * 2 - 10) / 155)), Image.LANCZOS)
out.paste(ref, (T * 3 + 5, (T - ref.size[1]) // 2))
# screen order: eyeR (row 1) on the left, eyeL (row 0) on the right
for i, row in enumerate([1, 0]):
    scl, iris, lash, brow, shut = tiles(row)
    open_ = Image.new("RGBA", (T, T), skin)
    for layer in (scl, iris, lash, brow):
        open_.alpha_composite(layer)
    closed = Image.new("RGBA", (T, T), skin)
    closed.alpha_composite(shut)
    closed.alpha_composite(brow)
    out.paste(open_.convert("RGB").resize((T // 2 * 2 - 0, T)).crop((0, 0, T, T)), (i * T // 1 if i == 0 else T, 0))
    out.paste(closed.convert("RGB").resize((T // 2, T // 2)), (2 * T + (i * T // 2), T // 4))
out.save(sys.argv[1])
