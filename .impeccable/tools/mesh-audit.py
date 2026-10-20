# Audit a single-mesh GLB: degenerate / duplicate / flipped triangles, normals that disagree with the face,
# seams (same position, split vertex) and open or non-manifold edges.
# Usage: python mesh-audit.py <file.glb> [y_min]   (y_min limits the report to vertices above that height)
import json
import struct
import sys
from collections import defaultdict

import numpy as np


def load(path):
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
    prim = js["meshes"][0]["primitives"][0]

    def acc(i, comps, dtype):
        a = js["accessors"][i]
        bv = js["bufferViews"][a["bufferView"]]
        start = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        size = np.dtype(dtype).itemsize * comps
        stride = bv.get("byteStride", size)
        if stride == size:
            arr = np.frombuffer(bn, dtype=dtype, count=a["count"] * comps, offset=start)
        else:
            raw = np.frombuffer(bn, dtype=np.uint8, count=stride * (a["count"] - 1) + size, offset=start)
            rows = np.lib.stride_tricks.as_strided(raw, shape=(a["count"], size), strides=(stride, 1))
            arr = np.ascontiguousarray(rows).view(dtype).ravel()
        return arr.reshape(-1, comps) if comps > 1 else arr

    pos = acc(prim["attributes"]["POSITION"], 3, np.float32)
    nrm = acc(prim["attributes"]["NORMAL"], 3, np.float32)
    ia = js["accessors"][prim["indices"]]
    idx = acc(prim["indices"], 1, np.uint16 if ia["componentType"] == 5123 else np.uint32).astype(np.int64)
    return pos, nrm, idx.reshape(-1, 3)


def audit(path, y_min=-1e9):
    pos, nrm, tri = load(path)
    p = pos[tri]
    cross = np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0])
    area = np.linalg.norm(cross, axis=1) / 2
    fn = cross / np.maximum(area[:, None] * 2, 1e-12)
    keep = p[:, :, 1].min(axis=1) > y_min
    print(f"{path}: verts {len(pos)}, tris {len(tri)} (report on {keep.sum()} tris with y > {y_min})")

    degenerate = (area < 1e-9) & keep
    print("degenerate (zero-area) tris:", int(degenerate.sum()))

    key = [tuple(sorted(t)) for t in tri]
    seen = defaultdict(list)
    for i, k in enumerate(key):
        seen[k].append(i)
    dups = [v for v in seen.values() if len(v) > 1 and keep[v[0]]]
    print("duplicate tris (same 3 verts):", len(dups))

    vn = nrm[tri].mean(axis=1)
    vn /= np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-12)
    agree = (fn * vn).sum(axis=1)
    flipped = (agree < -0.2) & keep & ~degenerate
    print("tris whose winding points against their vertex normals:", int(flipped.sum()))

    # Weld by position to see the real surface
    q = np.round(pos / 1e-5).astype(np.int64)
    uniq, weld = np.unique(q, axis=0, return_inverse=True)
    weld = weld.ravel()
    print("positions shared by split vertices (seams):", int(len(pos) - len(uniq)))
    edges = defaultdict(int)
    directed = defaultdict(int)
    for t, k in zip(tri, keep):
        if not k:
            continue
        w = weld[t]
        for a, b in ((w[0], w[1]), (w[1], w[2]), (w[2], w[0])):
            edges[(min(a, b), max(a, b))] += 1
            directed[(a, b)] += 1
    open_edges = sum(1 for c in edges.values() if c == 1)
    nonmanifold = sum(1 for c in edges.values() if c > 2)
    inconsistent = sum(1 for (a, b), c in directed.items() if c > 1)
    print("open edges:", open_edges, " non-manifold edges:", nonmanifold, " edges walked the same way twice (flipped neighbour):", inconsistent)

    # Normal spread at seams: same position, different normals = hard lighting crease
    groups = defaultdict(list)
    for i, w in enumerate(weld):
        if pos[i, 1] > y_min:
            groups[w].append(i)
    worst = []
    for w, ids in groups.items():
        if len(ids) < 2:
            continue
        ns = nrm[ids]
        d = float((ns @ ns.T).min())
        worst.append(d)
    worst = np.array(worst) if worst else np.array([1.0])
    print("seam vertices whose normals differ by > 30 deg:", int((worst < np.cos(np.radians(30))).sum()), "of", len(worst))


if __name__ == "__main__":
    audit(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else -1e9)
