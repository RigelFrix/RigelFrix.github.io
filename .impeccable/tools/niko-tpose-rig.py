"""Fit the Y Bot Mixamo skeleton onto assets/niko/niko-t-pose.glb and bind it.

Run from anywhere:
  blender --background --python .impeccable/tools/niko-tpose-rig.py
Writes assets/niko/niko-t-pose-rigged.glb and niko-t-pose-rigged.blend.
Bone names are the Mixamo names without the mixamorig: prefix.
"""
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(r"C:\Users\Rigel\Documents\PersonalGitHub\RigelFrix.github.io")
NIKO = ROOT / "assets" / "niko" / "niko-t-pose.glb"
YBOT = ROOT / "assets" / "niko" / "Y Bot (3).fbx"
OUT = ROOT / "assets" / "niko" / "niko-t-pose-rigged.glb"
BLEND = ROOT / "assets" / "niko" / "niko-t-pose-rigged.blend"
REVIEW = ROOT / ".impeccable" / "review"

PREFIX = "mixamorig:"


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def centroid(pts):
    n = len(pts)
    return Vector((
        sum(p.x for p in pts) / n,
        sum(p.y for p in pts) / n,
        sum(p.z for p in pts) / n,
    ))


def median(vals):
    vals = sorted(vals)
    return vals[len(vals) // 2]


clear()
bpy.ops.import_scene.fbx(filepath=str(YBOT), automatic_bone_orientation=False)
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
for obj in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
    bpy.data.objects.remove(obj, do_unlink=True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
print("ARM", tuple(round(v, 4) for v in arm.scale), tuple(round(math.degrees(v), 2) for v in arm.rotation_euler))
for bone in arm.data.bones:
    if bone.name.startswith(PREFIX):
        bone.name = bone.name[len(PREFIX):]
arm.name = "Armature"
arm.data.name = "Armature"

rest = {b.name: arm.matrix_world @ b.head_local for b in arm.data.bones}

bpy.ops.import_scene.gltf(filepath=str(NIKO))
mesh = next(o for o in bpy.context.scene.objects if o.type == "MESH" and o != arm)
mesh.name = "Niko"
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
before = len(mesh.data.vertices)
bpy.ops.mesh.remove_doubles(threshold=0.0001)
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.mesh.customdata_custom_splitnormals_clear()
bpy.ops.object.mode_set(mode="OBJECT")
print(f"VERTS {before} -> {len(mesh.data.vertices)}")

pts = [mesh.matrix_world @ v.co for v in mesh.data.vertices]
z0 = min(p.z for p in pts)
z1 = max(p.z for p in pts)


def band(za, zb, pred=lambda p: True):
    return [p for p in pts if za <= p.z < zb and pred(p)]


# Arms are the widest horizontal slice.
best = None
step = (z1 - z0) / 48
z = z0
while z < z1:
    sl = band(z, z + step * 2)
    if len(sl) > 20:
        span = max(p.x for p in sl) - min(p.x for p in sl)
        if best is None or span > best[0]:
            best = (span, z)
    z += step
arm_z = best[1] + step
arm_pts = band(arm_z - 0.04, arm_z + 0.04)
arm_y = median([p.y for p in arm_pts])
arm_zz = median([p.z for p in arm_pts])
tip_x = max(p.x for p in arm_pts)

# Chest is the torso just under the arms, before the arms widen the slice.
chest = band(arm_zz - 0.16, arm_zz - 0.08, lambda p: abs(p.x) < 0.25)
chest_x = max(abs(p.x) for p in chest) if chest else 0.12
shoulder_x = chest_x + 0.045
wrist_x = shoulder_x + (tip_x - shoulder_x) * 0.70
elbow_x = (shoulder_x + wrist_x) * 0.5

# Crotch: the lowest slice that is a single center mass, just above two legs.
crotch_z = None
z = z0
while z < arm_zz:
    sl = band(z, z + 0.03)
    center = [p for p in sl if abs(p.x) < 0.045]
    left = [p for p in sl if p.x < -0.08]
    right = [p for p in sl if p.x > 0.08]
    if len(center) > 8 and len(left) < 4 and len(right) < 4 and z > z0 + 0.25 * (z1 - z0):
        crotch_z = z
        break
    z += 0.02
if crotch_z is None:
    crotch_z = z0 + 0.40 * (z1 - z0)
hips_z = crotch_z + 0.08
pelvis = band(hips_z - 0.04, hips_z + 0.06)
hips_y = median([p.y for p in pelvis]) if pelvis else 0.0

def leg_cloud(sign, za, zb):
    return band(za, zb, lambda p: p.x * sign > 0.06)

def leg_x(sign, za, zb):
    cloud = leg_cloud(sign, za, zb)
    return median([p.x for p in cloud]) if cloud else 0.12 * sign

# Ankle: down the shin only (not the stomach, which also sticks forward).
ankle_z = z0 + 0.10
prev_reach = 0.0
z = crotch_z - 0.06
while z > z0 + 0.02:
    sl = [p for p in pts if z <= p.z < z + 0.03 and 0.07 < p.x < 0.22]
    reach = -min((p.y for p in sl), default=0.0) if sl else 0.0
    if len(sl) >= 4 and reach > 0.05 and prev_reach < 0.03:
        ankle_z = z + 0.04
        break
    if sl:
        prev_reach = reach
    z -= 0.015
print("ANKLE", round(ankle_z, 3), "crotch", round(crotch_z, 3))

up_x = leg_x(1, hips_z - 0.08, hips_z + 0.02)
knee_z = (hips_z + ankle_z) * 0.5
knee_cloud = leg_cloud(1, knee_z - 0.04, knee_z + 0.04)
knee = centroid(knee_cloud) if knee_cloud else Vector((up_x, hips_y, knee_z))
ankle_cloud = band(ankle_z - 0.02, ankle_z + 0.04, lambda p: p.x > 0.04)
foot_cloud = band(z0, ankle_z, lambda p: p.x > 0.04)
foot_x = median([p.x for p in ankle_cloud]) if ankle_cloud else up_x
heel_y = max(p.y for p in foot_cloud)
toe_y = min(p.y for p in foot_cloud)
toe_z = median([p.z for p in foot_cloud if p.y < toe_y + 0.03])

# Neck is the narrow column between the shoulders and the head.
neck_z = arm_zz + 0.08
narrow = 1e9
z = arm_zz + 0.02
while z < z1 - 0.05:
    sl = band(z, z + 0.03, lambda p: abs(p.x) < 0.2)
    if len(sl) > 8:
        span = max(p.x for p in sl) - min(p.x for p in sl)
        if span < narrow:
            narrow = span
            neck_z = z + 0.015
    z += 0.02
neck_pts = band(neck_z - 0.02, neck_z + 0.03)
neck_y = median([p.y for p in neck_pts]) if neck_pts else hips_y
head_z = neck_z + 0.08
head_pts = band(head_z, z1)
head_y = median([p.y for p in head_pts]) if head_pts else neck_y

# Spine stations follow Y Bot's spacing from hips up to the neck.
y_hips = rest["Hips"].z
y_neck = rest["Neck"].z
span = y_neck - y_hips
spine_z = {}
for name in ("Spine", "Spine1", "Spine2", "Neck"):
    spine_z[name] = hips_z + (rest[name].z - y_hips) / span * (neck_z - hips_z)

# Head sits at the base of the skull; the crown is the end bone.
head_bone_z = neck_z + (rest["Head"].z - y_neck) / (rest["HeadTop_End"].z - y_neck) * (z1 - neck_z)

positions = {
    "Hips": Vector((0, hips_y, hips_z)),
    "Spine": Vector((0, hips_y, spine_z["Spine"])),
    "Spine1": Vector((0, (hips_y + neck_y) * 0.5, spine_z["Spine1"])),
    "Spine2": Vector((0, neck_y, spine_z["Spine2"])),
    "Neck": Vector((0, neck_y, neck_z)),
    "Head": Vector((0, head_y, head_bone_z)),
    "HeadTop_End": Vector((0, head_y, z1 - 0.01)),
}

for sign, side in ((1, "Left"), (-1, "Right")):
    sx = shoulder_x * sign
    positions[f"{side}Shoulder"] = Vector((sx * 0.32, arm_y, arm_zz))
    positions[f"{side}Arm"] = Vector((sx, arm_y, arm_zz))
    positions[f"{side}ForeArm"] = Vector((elbow_x * sign, arm_y, arm_zz))
    positions[f"{side}Hand"] = Vector((wrist_x * sign, arm_y, arm_zz))
    hand = positions[f"{side}Hand"]
    src_hand = rest[f"{side}Hand"]
    src_tip = rest[f"{side}HandMiddle4"]
    src_len = (src_tip - src_hand).length
    niko_len = abs(tip_x - wrist_x)
    scale = niko_len / src_len
    for name, src in rest.items():
        if not name.startswith(f"{side}Hand") or name == f"{side}Hand":
            continue
        offset = src - src_hand
        # Mirror the left-hand shape for the right hand by flipping local X of the offset.
        if side == "Right":
            offset = Vector((-offset.x, offset.y, offset.z))
            src_left = rest["Left" + name[len("Right"):]]
            offset = Vector((-(src_left - rest["LeftHand"]).x, (src_left - rest["LeftHand"]).y, (src_left - rest["LeftHand"]).z))
        positions[name] = hand + offset * scale
    lx = leg_x(sign, hips_z - 0.05, hips_z + 0.02)
    positions[f"{side}UpLeg"] = Vector((lx, hips_y, hips_z - 0.015))
    if sign == 1:
        positions["LeftLeg"] = Vector((knee.x, knee.y, knee.z))
    else:
        positions["RightLeg"] = Vector((-knee.x, knee.y, knee.z))
    positions[f"{side}Foot"] = Vector((foot_x * sign, heel_y - 0.01, ankle_z))
    positions[f"{side}ToeBase"] = Vector((foot_x * sign, (heel_y + toe_y) * 0.45, max(z0 + 0.02, toe_z)))
    positions[f"{side}Toe_End"] = Vector((foot_x * sign, toe_y + 0.005, max(z0 + 0.012, toe_z - 0.01)))

missing = [b.name for b in arm.data.bones if b.name not in positions]
if missing:
    raise SystemExit(f"no placement for {missing}")

print("PLACE hips", tuple(round(v, 3) for v in positions["Hips"]), "neck", tuple(round(v, 3) for v in positions["Neck"]))
print("PLACE arm", tuple(round(v, 3) for v in positions["LeftArm"]), "elbow", tuple(round(v, 3) for v in positions["LeftForeArm"]), "hand", tuple(round(v, 3) for v in positions["LeftHand"]))
print("PLACE upleg", tuple(round(v, 3) for v in positions["LeftUpLeg"]), "knee", tuple(round(v, 3) for v in positions["LeftLeg"]), "foot", tuple(round(v, 3) for v in positions["LeftFoot"]), "toe", tuple(round(v, 3) for v in positions["LeftToe_End"]))

CHAIN = {
    "Hips": "Spine",
    "Spine": "Spine1",
    "Spine1": "Spine2",
    "Spine2": "Neck",
    "Neck": "Head",
    "Head": "HeadTop_End",
}
for side in ("Left", "Right"):
    CHAIN[f"{side}Shoulder"] = f"{side}Arm"
    CHAIN[f"{side}Arm"] = f"{side}ForeArm"
    CHAIN[f"{side}ForeArm"] = f"{side}Hand"
    CHAIN[f"{side}Hand"] = f"{side}HandMiddle1"
    for finger in ("Thumb", "Index", "Middle", "Ring", "Pinky"):
        for i in range(1, 4):
            CHAIN[f"{side}Hand{finger}{i}"] = f"{side}Hand{finger}{i + 1}"
    CHAIN[f"{side}UpLeg"] = f"{side}Leg"
    CHAIN[f"{side}Leg"] = f"{side}Foot"
    CHAIN[f"{side}Foot"] = f"{side}ToeBase"
    CHAIN[f"{side}ToeBase"] = f"{side}Toe_End"

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
rolls = {b.name: b.roll for b in arm.data.edit_bones}
dirs = {}
for bone in arm.data.edit_bones:
    direction = bone.tail - bone.head
    dirs[bone.name] = direction.normalized() if direction.length > 1e-6 else Vector((0, 0, 1))
for bone in arm.data.edit_bones:
    bone.use_connect = False
    bone.head = positions[bone.name]
for bone in arm.data.edit_bones:
    nxt = CHAIN.get(bone.name)
    if nxt:
        bone.tail = positions[nxt]
    else:
        bone.tail = bone.head + dirs[bone.name] * 0.025
    bone.roll = rolls[bone.name]
bpy.ops.object.mode_set(mode="OBJECT")

# Bones are already fitted to the model he built. One subdivision then rounds the
# broad faces. Creases are left off: holding the corners pinched the legs into ridges.
bpy.context.view_layer.objects.active = mesh
mod = mesh.modifiers.new("Round", "SUBSURF")
mod.levels = 1
mod.render_levels = 1
bpy.ops.object.modifier_apply(modifier="Round")
for poly in mesh.data.polygons:
    poly.use_smooth = True
print(f"SMOOTH FACES {len(mesh.data.polygons)} VERTS {len(mesh.data.vertices)}")

for old in list(bpy.data.materials):
    bpy.data.materials.remove(old)
skin = bpy.data.materials.new("skin")
skin.use_nodes = True
skin.diffuse_color = (0.82, 0.78, 0.74, 1)
bsdf = skin.node_tree.nodes.get("Principled BSDF")
if bsdf:
    bsdf.inputs["Base Color"].default_value = (0.82, 0.78, 0.74, 1)
    bsdf.inputs["Roughness"].default_value = 0.7
mesh.data.materials.append(skin)

bpy.ops.object.select_all(action="DESELECT")
mesh.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
groups = {g.name for g in mesh.vertex_groups}
print("GROUPS", len(groups))

# Vertices the heat map missed get the nearest joint.
unowned = []
for v in mesh.data.vertices:
    total = 0.0
    for g in v.groups:
        total += g.weight
    if total < 0.01:
        unowned.append(v.index)
if unowned:
    heads = {b.name: arm.matrix_world @ b.head_local for b in arm.data.bones}
    for index in unowned:
        co = mesh.matrix_world @ mesh.data.vertices[index].co
        name = min(heads, key=lambda n: (heads[n] - co).length)
        mesh.vertex_groups[name].add([index], 1.0, "REPLACE")
    print("UNOWNED", len(unowned))

arm.data.display_type = "OCTAHEDRAL"
arm.show_in_front = True

long = []
for edge in mesh.data.edges:
    a = mesh.data.vertices[edge.vertices[0]].co
    b = mesh.data.vertices[edge.vertices[1]].co
    length = (a - b).length
    if length > 0.2:
        long.append((length, a, b))
long.sort(key=lambda item: item[0], reverse=True)
print("LONG EDGES", len(long))
for length, a, b in long[:6]:
    print(" ", round(length, 3), tuple(round(v, 3) for v in a), tuple(round(v, 3) for v in b))

# Bend the left arm down and the right knee forward, and record that the skin follows.
hand_index = max(range(len(mesh.data.vertices)), key=lambda i: mesh.data.vertices[i].co.x)
foot_index = min(range(len(mesh.data.vertices)), key=lambda i: (mesh.data.vertices[i].co.z, mesh.data.vertices[i].co.x))


def world_of(index):
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(deps)
    return mesh.matrix_world @ ev.data.vertices[index].co


bpy.ops.object.mode_set(mode="OBJECT")


def look_at(cam, loc, target):
    cam.location = loc
    cam.rotation_euler = (target - loc).to_track_quat("-Z", "Y").to_euler()


cam = bpy.data.cameras.new("Cam")
cam.type = "ORTHO"
cam.ortho_scale = 2.15
cam_obj = bpy.data.objects.new("Cam", cam)
bpy.context.scene.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj
bpy.context.scene.render.engine = "BLENDER_WORKBENCH"
bpy.context.scene.render.resolution_x = 900
bpy.context.scene.render.resolution_y = 1100
bpy.context.scene.display.shading.light = "STUDIO"
bpy.context.scene.display.shading.color_type = "MATERIAL"
key = bpy.data.lights.new("Key", "SUN")
key.energy = 3.5
key_obj = bpy.data.objects.new("Key", key)
key_obj.rotation_euler = (math.radians(50), 0, math.radians(-40))
bpy.context.scene.collection.objects.link(key_obj)

center = Vector((0, 0, (z0 + z1) * 0.5))
for label, loc in (
    ("front", center + Vector((0, -4, 0))),
    ("side", center + Vector((4, 0, 0))),
):
    look_at(cam_obj, loc, center)
    bpy.context.scene.render.filepath = str(REVIEW / f"niko-rig-{label}.png")
    bpy.ops.render.render(write_still=True)

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
arm.pose.bones["LeftArm"].rotation_mode = "XYZ"
arm.pose.bones["LeftArm"].rotation_euler = (math.radians(-70), 0, 0)
arm.pose.bones["RightLeg"].rotation_mode = "XYZ"
arm.pose.bones["RightLeg"].rotation_euler = (math.radians(60), 0, 0)
print("POSE hand", tuple(round(v, 3) for v in (world_of(hand_index) - mesh.data.vertices[hand_index].co)))
for label, loc in (("pose", center + Vector((0, -4, 0))), ("pose-side", center + Vector((4, 0, 0)))):
    look_at(cam_obj, loc, center)
    bpy.context.scene.render.filepath = str(REVIEW / f"niko-rig-{label}.png")
    bpy.ops.render.render(write_still=True)
bpy.ops.pose.select_all(action="SELECT")
bpy.ops.pose.transforms_clear()
bpy.ops.object.mode_set(mode="OBJECT")

bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.ops.export_scene.gltf(
    filepath=str(OUT),
    export_format="GLB",
    use_selection=False,
    export_apply=False,
    export_animations=False,
    export_skins=True,
    export_yup=True,
)
print("SAVED", OUT)
print("BONES", len(arm.data.bones))
