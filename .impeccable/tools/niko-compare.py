"""Front head shot from the game next to the reference face, same height, for eye/face reviews.
node .impeccable/tools/niko-angles.mjs http://127.0.0.1:8765/ <prefix> "0" 8
python .impeccable/tools/niko-compare.py .impeccable/review/<prefix>-0.png .impeccable/review/<prefix>-compare.png"""
import sys
from PIL import Image

shot = Image.open(sys.argv[1]).convert("RGB")
ref = Image.open("Low-Poly Starry Mage Explorer.png").convert("RGB").crop((520, 95, 770, 345))
h = shot.size[1]
ref = ref.resize((int(ref.size[0] * h / ref.size[1]), h), Image.LANCZOS)
out = Image.new("RGB", (shot.size[0] + ref.size[0] + 8, h), (30, 30, 30))
out.paste(shot, (0, 0))
out.paste(ref, (shot.size[0] + 8, 0))
out.save(sys.argv[2])
