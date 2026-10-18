import bpy
from mathutils import Vector
from pathlib import Path

ROOT = Path(r"C:\Users\Rigel\Documents\PersonalGitHub\RigelFrix.github.io")
NIKO = ROOT / "assets" / "niko" / "niko-t-pose.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(NIKO))
mesh = next(o for o in bpy.context.scene.objects if o.type == "MESH")
pts = [mesh.matrix_world @ v.co for v in mesh.data.vertices]
zs = [p.z for p in pts]
z0, z1 = min(zs), max(zs)
print(f"MESH {mesh.name} verts {len(pts)} z {z0:.3f}..{z1:.3f} h {z1 - z0:.3f}")
bins = 40
for i in range(bins):
    a = z0 + (z1 - z0) * i / bins
    b = z0 + (z1 - z0) * (i + 1) / bins
    band = [p for p in pts if a <= p.z < b]
    if len(band) < 8:
        continue
    xs = [p.x for p in band]
    ys = [p.y for p in band]
    left = [p for p in band if p.x < -0.05]
    right = [p for p in band if p.x > 0.05]
    print(
        f"z {a:6.3f} n {len(band):4d} x {min(xs):7.3f}..{max(xs):7.3f} "
        f"y {min(ys):6.3f}..{max(ys):6.3f} L {len(left):4d} R {len(right):4d}"
    )

# Extreme points: leftmost, rightmost, top, bottom clusters
leftmost = min(pts, key=lambda p: p.x)
rightmost = max(pts, key=lambda p: p.x)
top = max(pts, key=lambda p: p.z)
print("LEFTMOST", tuple(round(v, 3) for v in leftmost))
print("RIGHTMOST", tuple(round(v, 3) for v in rightmost))
print("TOP", tuple(round(v, 3) for v in top))

# Front-most and back-most in the head band and hip band
def band_stats(z_a, z_b, label):
    band = [p for p in pts if z_a <= p.z <= z_b]
    if not band:
        print(label, "empty")
        return
    print(
        label,
        "n", len(band),
        "x", round(min(p.x for p in band), 3), round(max(p.x for p in band), 3),
        "y", round(min(p.y for p in band), 3), round(max(p.y for p in band), 3),
        "cx", round(sum(p.x for p in band) / len(band), 3),
        "cy", round(sum(p.y for p in band) / len(band), 3),
        "cz", round(sum(p.z for p in band) / len(band), 3),
    )

h = z1 - z0
band_stats(z1 - 0.12 * h, z1, "HEAD")
band_stats(z0, z0 + 0.06 * h, "FEET")
band_stats(z0 + 0.45 * h, z0 + 0.55 * h, "HIPS")
