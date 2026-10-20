# Pads the islands of a GLB's base-colour atlas: everything outside the UV triangles (the black gaps) and a thin
# rim just inside them is replaced by the nearest island colour, so texture filtering and mipmaps at the seams
# sample skin instead of black. Writes a JPEG for mesh-clean.mjs --texture.
# Usage (from .impeccable/tools): python tex-pad.py <in.glb> <out.jpg> [rim_px=2]
import io
import json
import struct
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage


def read_glb(path):
    data = open(path, "rb").read()
    off, js, bn = 12, None, None
    while off < len(data):
        ln, typ = struct.unpack_from("<I4s", data, off)
        off += 8
        chunk = data[off : off + ln]
        off += ln
        if typ == b"JSON":
            js = json.loads(chunk)
        else:
            bn = chunk
    return js, bn


def accessor(js, bn, i, comps, dtype):
    a = js["accessors"][i]
    bv = js["bufferViews"][a["bufferView"]]
    start = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    size = np.dtype(dtype).itemsize * comps
    stride = bv.get("byteStride", size)
    raw = np.frombuffer(bn, dtype=np.uint8, count=stride * (a["count"] - 1) + size, offset=start)
    rows = np.lib.stride_tricks.as_strided(raw, shape=(a["count"], size), strides=(stride, 1))
    return np.ascontiguousarray(rows).view(dtype).reshape(a["count"], comps)


def main(src, out, rim=2):
    js, bn = read_glb(src)
    prim = js["meshes"][0]["primitives"][0]
    uv = accessor(js, bn, prim["attributes"]["TEXCOORD_0"], 2, np.float32)
    ia = js["accessors"][prim["indices"]]
    tri = accessor(js, bn, prim["indices"], 1, np.uint16 if ia["componentType"] == 5123 else np.uint32).reshape(-1, 3)

    mat = js["materials"][prim["material"]]
    tex = js["textures"][mat["pbrMetallicRoughness"]["baseColorTexture"]["index"]]
    img = js["images"][tex["source"]]
    bv = js["bufferViews"][img["bufferView"]]
    start = bv.get("byteOffset", 0)
    image = Image.open(io.BytesIO(bn[start : start + bv["byteLength"]])).convert("RGB")
    w, h = image.size

    # glTF uv: (0, 0) is the top-left of the image
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    for t in tri:
        pts = [(float(uv[k, 0]) * w, float(uv[k, 1]) * h) for k in t]
        draw.polygon(pts, fill=255)
    inside = np.asarray(mask) > 0
    core = ndimage.binary_erosion(inside, iterations=rim) if rim > 0 else inside
    pixels = np.asarray(image).copy()
    _, (iy, ix) = ndimage.distance_transform_edt(~core, return_indices=True)
    padded = pixels[iy, ix]
    Image.fromarray(padded).save(out, quality=92, optimize=True)
    print(f"{src}: {w}x{h}, islands cover {inside.mean():.1%}, padded {(~core).mean():.1%} of the atlas -> {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 2)
