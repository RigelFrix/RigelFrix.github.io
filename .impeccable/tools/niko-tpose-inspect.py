import bpy
from mathutils import Vector
from pathlib import Path

ROOT = Path(r"C:\Users\Rigel\Documents\PersonalGitHub\RigelFrix.github.io")
NIKO = ROOT / "assets" / "niko" / "niko-t-pose.glb"
YBOT = ROOT / "assets" / "niko" / "Y Bot (3).fbx"


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def bounds(obj):
    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def dump(label):
    print(f"\n== {label} ==")
    for obj in bpy.context.scene.objects:
        kind = obj.type
        extra = ""
        if kind == "MESH":
            lo, hi = bounds(obj)
            extra = f" verts {len(obj.data.vertices)} faces {len(obj.data.polygons)} bounds {tuple(round(v, 3) for v in lo)} .. {tuple(round(v, 3) for v in hi)}"
            mats = [s.material.name if s.material else "-" for s in obj.material_slots]
            extra += f" mats {mats}"
        elif kind == "ARMATURE":
            bones = obj.data.bones
            extra = f" bones {len(bones)}"
        print(f"  {kind:10} {obj.name}{extra}")
    arms = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
    for arm in arms:
        print(f"-- armature {arm.name} --")
        for b in arm.data.bones:
            h = arm.matrix_world @ b.head_local
            parent = b.parent.name if b.parent else "-"
            print(f"  {b.name:28} parent {parent:28} head ({h.x:8.3f},{h.y:8.3f},{h.z:8.3f})")


clear()
bpy.ops.import_scene.gltf(filepath=str(NIKO))
dump("NIKO")

clear()
bpy.ops.import_scene.fbx(filepath=str(YBOT), automatic_bone_orientation=False)
dump("YBOT")
