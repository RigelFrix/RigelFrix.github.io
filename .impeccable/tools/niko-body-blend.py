"""Build a clean bald T-pose body for Niko, in the style of a Mixamo Y Bot:
one connected mesh, rounded head, inset eyes, arms and legs joined to the torso.
Keeps the existing skeleton and clips from body-source.glb.

  blender --background --python niko-body-blend.py
"""
import bpy
import math
from mathutils import Vector
from pathlib import Path

ROOT = Path(r"C:\Users\Rigel\Documents\PersonalGitHub\RigelFrix.github.io")
SRC = ROOT / "assets" / "niko" / "body-source.glb"
OUT = ROOT / "assets" / "niko" / "body.glb"
BLEND = ROOT / "assets" / "niko" / "body-clean.blend"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SRC))

arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
arm.name = "Armature"
arm.data.display_type = "OCTAHEDRAL"
arm.show_in_front = True
for bone in arm.data.bones:
    bone.hide = bone.name.startswith("Cape") or bone.name.endswith("Socket")

for obj in [o for o in bpy.data.objects if o.type == "MESH"]:
    bpy.data.objects.remove(obj, do_unlink=True)

def bone_mid(name):
    bone = arm.data.bones[name]
    head = arm.matrix_world @ bone.head_local
    tail = arm.matrix_world @ bone.tail_local
    return head, tail, (head + tail) / 2

FINGERS = ("Thumb", "Index", "Middle", "Ring", "Pinky")

def skip(name):
    return name.startswith("Cape") or name.endswith("Socket") or name in {"Hair", "Ahoge", "Lantern"} or any(f in name for f in FINGERS)

def radius_of(name, length):
    if name == "Head":
        return 0.092
    if name == "Neck":
        return 0.04
    if name == "Hips":
        return 0.078
    if name.startswith("Spine"):
        return 0.072 if name == "Spine2" else 0.064
    if "Shoulder" in name:
        return 0.04
    if name.endswith("ForeArm"):
        return 0.028
    if name.endswith("Arm"):
        return 0.034
    if name.endswith("Hand"):
        return 0.024
    if any(f in name for f in ("Thumb", "Index", "Middle", "Ring", "Pinky")):
        return max(0.0065, length * 0.42)
    if name.endswith("UpLeg"):
        return 0.046
    if name.endswith("Leg"):
        return 0.034
    if name.endswith("Foot"):
        return 0.028
    if name.endswith("ToeBase"):
        return 0.02
    return max(0.016, length * 0.22)

mball_data = bpy.data.metaballs.new("NikoBody")
mball_data.resolution = 0.008
mball_data.render_resolution = 0.008
mball_data.threshold = 0.4
balls = bpy.data.objects.new("NikoBody", mball_data)
bpy.context.collection.objects.link(balls)

def add_ball(co, radius, stiffness=1.15):
    el = mball_data.elements.new()
    el.co = co
    el.radius = radius
    el.stiffness = stiffness

def fill_segment(a, b, radius):
    length = (b - a).length
    steps = max(1, int(length / max(radius * 0.45, 0.01)))
    for s in range(steps + 1):
        add_ball(a.lerp(b, s / steps), radius)

for bone in arm.data.bones:
    if skip(bone.name):
        continue
    head = arm.matrix_world @ bone.head_local
    kids = [c for c in bone.children if not skip(c.name)]
    radius = radius_of(bone.name, 0.05)
    if not kids:
        add_ball(head, radius * 0.85)
        continue
    for child in kids:
        fill_segment(head, arm.matrix_world @ child.head_local, radius)

head_pos = arm.matrix_world @ arm.data.bones["Head"].head_local
add_ball(head_pos + Vector((0, 0, 0.08)), 0.095, 1.25)
add_ball(head_pos + Vector((0, -0.02, 0.045)), 0.07, 1.2)
print("HEAD", tuple(round(v, 3) for v in head_pos))

bpy.ops.object.select_all(action="DESELECT")
balls.select_set(True)
bpy.context.view_layer.objects.active = balls
bpy.ops.object.convert(target="MESH")
body = bpy.context.view_layer.objects.active
body.name = "Body"

remesh = body.modifiers.new("Remesh", "REMESH")
remesh.mode = "VOXEL"
remesh.voxel_size = 0.011
remesh.use_smooth_shade = True
bpy.ops.object.modifier_apply(modifier="Remesh")

dec = body.modifiers.new("Decimate", "DECIMATE")
dec.ratio = 0.55
bpy.ops.object.modifier_apply(modifier="Decimate")

bpy.ops.object.shade_smooth()

def add_cylinder(a, b, radius):
    delta = b - a
    if delta.length < 1e-4:
        return None
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=radius, depth=delta.length, location=(a + b) / 2)
    obj = bpy.context.view_layer.objects.active
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    return obj

finger_parts = []
for bone in arm.data.bones:
    if not any(f in bone.name for f in FINGERS):
        continue
    kids = [c for c in bone.children if any(f in c.name for f in FINGERS)]
    a = arm.matrix_world @ bone.head_local
    if kids:
        b = arm.matrix_world @ kids[0].head_local
    else:
        parent = arm.matrix_world @ bone.parent.head_local
        direction = a - parent
        if direction.length < 1e-5:
            direction = Vector((1 if "Left" in bone.name else -1, 0, 0))
        b = a + direction.normalized() * 0.012
    part = add_cylinder(a, b, 0.007 if "Thumb" in bone.name else 0.0055)
    if part:
        finger_parts.append(part)
if finger_parts:
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    for part in finger_parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active

for old in list(bpy.data.materials):
    bpy.data.materials.remove(old)
skin = bpy.data.materials.new("skin")
skin.use_nodes = True
skin.diffuse_color = (0.965, 0.812, 0.690, 1)
bsdf = skin.node_tree.nodes.get("Principled BSDF")
if bsdf:
    bsdf.inputs["Base Color"].default_value = (0.965, 0.812, 0.690, 1)
    bsdf.inputs["Roughness"].default_value = 0.7
body.data.materials.append(skin)

face_mat = bpy.data.materials.new("face")
face_mat.use_nodes = True
face_mat.diffuse_color = (0.965, 0.812, 0.690, 1)
face_bsdf = face_mat.node_tree.nodes.get("Principled BSDF")
if face_bsdf:
    face_bsdf.inputs["Base Color"].default_value = (0.965, 0.812, 0.690, 1)
    face_bsdf.inputs["Roughness"].default_value = 0.7
body.data.materials.append(face_mat)

# Front of the head becomes the face: clean cap, planar UVs the game already paints.
import bmesh
bm = bmesh.new()
bm.from_mesh(body.data)
bm.faces.ensure_lookup_table()
uv_layer = bm.loops.layers.uv.new("UVMap")
head_center = Vector((0, -0.1, 0.34))
# After glTF import the armature is Z-up, so the head is along +Z and the face looks along -Y.
for face in bm.faces:
    c = face.calc_center_median()
    n = face.normal
    if False and c.z > 0.27 and n.y < -0.25:
        face.material_index = 1
    for loop in face.loops:
        p = loop.vert.co
        loop[uv_layer].uv = (0.5 + p.x / 0.26, 0.5 + (p.z - 0.30) / 0.26)
bm.to_mesh(body.data)
bm.free()

# glTF +Z (the face) is Blender -Y after import.
face_dir = Vector((0, -1, 0))
crown = head_pos + Vector((0, 0, 0.07))

def make_eye(name, side):
    loc = Vector((0.028 * side, head_pos.y - 0.02, head_pos.z + 0.055))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=12, radius=0.012, location=loc)
    eye = bpy.context.view_layer.objects.active
    eye.name = name
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (0.95, 0.95, 0.95, 1)
    eye.data.materials.append(mat)
    group = eye.vertex_groups.new(name="Head")
    group.add(list(range(len(eye.data.vertices))), 1.0, "REPLACE")
    mod = eye.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    bpy.ops.object.shade_smooth()
    return eye

eye_l = make_eye("eyeL", 1)
eye_r = make_eye("eyeR", -1)

for eye in (eye_l, eye_r):
    origin = Vector((eye.location.x, head_pos.y - 0.35, eye.location.z))
    hit, loc, normal, _idx = body.ray_cast(origin, Vector((0, 1, 0)))
    if hit:
        eye.location = loc + Vector((0, 0.018, 0))
        print(eye.name, "seated", tuple(round(v, 3) for v in eye.location))
    else:
        print(eye.name, "missed the head")

lantern = arm.matrix_world @ arm.data.bones["Lantern"].head_local
hips = arm.matrix_world @ arm.data.bones["Hips"].head_local
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.016, location=hips + Vector((0, -0.02, 0.04)))
glow = bpy.context.view_layer.objects.active
aim = hips - lantern
if aim.length > 1e-5:
    hit, loc, _normal, _idx = body.ray_cast(lantern, aim.normalized())
    if hit:
        glow.location = loc + aim.normalized() * 0.01
        print("glow seated", tuple(round(v, 3) for v in glow.location))
glow = bpy.context.view_layer.objects.active
glow.name = "glow"
gmat = bpy.data.materials.new("glow")
gmat.use_nodes = True
gmat.diffuse_color = (1, 0.9, 0.4, 1)
glow.data.materials.append(gmat)
gg = glow.vertex_groups.new(name="Lantern")
gg.add(list(range(len(glow.data.vertices))), 1.0, "REPLACE")
gmod = glow.modifiers.new("Armature", "ARMATURE")
gmod.object = arm

# The face is the front of the bald head itself, lifted a hair so it can take the painted blush.
face_mesh = bpy.data.meshes.new("face")
face_obj = bpy.data.objects.new("face", face_mesh)
bpy.context.collection.objects.link(face_obj)
src = bmesh.new()
src.from_mesh(body.data)
out = bmesh.new()
uv_out = out.loops.layers.uv.new("UVMap")
vert_map = {}
for f in src.faces:
    c = f.calc_center_median()
    if not (c.z > 0.26 and c.z < 0.40 and f.normal.y < -0.45 and abs(c.x) < 0.07):
        continue
    new_verts = []
    for v in f.verts:
        if v.index not in vert_map:
            nv = out.verts.new(v.co + Vector((0, -0.0004, 0)))
            vert_map[v.index] = nv
        new_verts.append(vert_map[v.index])
    try:
        nf = out.faces.new(new_verts)
    except ValueError:
        continue
    for loop, src_loop in zip(nf.loops, f.loops):
        p = src_loop.vert.co
        loop[uv_out].uv = (0.5 + p.x / 0.26, 0.5 + (p.z - 0.30) / 0.26)
src.free()
out.to_mesh(face_mesh)
out.free()
face_obj.data.materials.append(face_mat)
fg = face_obj.vertex_groups.new(name="Head")
fg.add(list(range(len(face_obj.data.vertices))), 1.0, "REPLACE")
fmod = face_obj.modifiers.new("Armature", "ARMATURE")
fmod.object = arm
bpy.ops.object.select_all(action="DESELECT")
face_obj.select_set(True)
bpy.context.view_layer.objects.active = face_obj
bpy.ops.object.shade_smooth()

body.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type="ARMATURE_AUTO")

for obj in (eye_l, eye_r, glow, face_obj):
    obj.parent = arm

bpy.ops.object.select_all(action="DESELECT")
blend_path = str(BLEND)
bpy.ops.wm.save_as_mainfile(filepath=blend_path)

bpy.ops.export_scene.gltf(
    filepath=str(OUT),
    export_format="GLB",
    export_apply=True,
    export_animations=True,
    export_skins=True,
    export_yup=True,
)
print("BODY-OK", body.name, "verts", len(body.data.vertices), "faces", len(body.data.polygons))
print("SAVED", blend_path)
