"""Create a Blender control-rig file from the exact Niko GLB used by the game.

Run with Blender 5.0+:
  blender --background --python .impeccable/tools/niko-control-rig.py

The source GLB is left unchanged. Requires the Mixamo Rig add-on installed in Blender.
"""
import argparse
from math import pi
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets" / "niko" / "low-poly-humanoid-v6-clean.glb"
HAIR_SOURCE = ROOT / "assets" / "niko" / "hair-short.glb"
OUTPUT = ROOT / "assets" / "niko" / "low-poly-humanoid-v6-control-rig.blend"
FBX_OUTPUT = ROOT / "assets" / "niko" / "low-poly-humanoid-v6-mixamo-rig.fbx"

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output", type=Path, default=OUTPUT, help="Blender project output path")
parser.add_argument("--fbx-output", type=Path, default=FBX_OUTPUT, help="Deformation-rig FBX output path")
parser.add_argument("--overwrite", action="store_true", help="Replace existing output files")
script_args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
args = parser.parse_args(script_args)
blend_output = args.output.resolve()
fbx_output = args.fbx_output.resolve()

if not SOURCE.is_file():
    raise FileNotFoundError(f"Niko source model not found: {SOURCE}")
if not HAIR_SOURCE.is_file():
    raise FileNotFoundError(f"Niko hair asset not found: {HAIR_SOURCE}")
if bpy.app.version < (5, 0, 0):
    raise RuntimeError(f"Blender 5.0 or later is required; found {bpy.app.version_string}")
existing_outputs = [path for path in (blend_output, fbx_output) if path.exists()]
if existing_outputs and not args.overwrite:
    raise FileExistsError(f"Refusing to overwrite existing model files: {', '.join(map(str, existing_outputs))}")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))

armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
if len(armatures) != 1:
    raise RuntimeError(f"Expected one armature in Niko's GLB; found {len(armatures)}")
armature = armatures[0]

skinned_meshes = [
    obj for obj in bpy.context.scene.objects
    if obj.type == "MESH"
    and any(modifier.type == "ARMATURE" and modifier.object == armature for modifier in obj.modifiers)
]
if len(skinned_meshes) != 1:
    raise RuntimeError(f"Expected one Niko mesh bound to the armature; found {len(skinned_meshes)}")
character = skinned_meshes[0]
character.name = "Niko"
armature.name = "Niko_Armature"
armature.data.name = "Niko_Skeleton"

helper = bpy.data.objects.get("Icosphere")
if helper is not None:
    if helper.type != "MESH" or helper.modifiers or helper.vertex_groups:
        raise RuntimeError("Blender's Icosphere import helper was not the expected unskinned mesh")
    bpy.data.objects.remove(helper, do_unlink=True)

for collection in list(bpy.data.collections):
    if collection.name == "glTF_not_exported" and not collection.objects and not collection.children:
        bpy.data.collections.remove(collection)

if bpy.data.objects.get("Icosphere") is not None:
    raise RuntimeError("The stray Blender GLB-import helper is still present")

required_bones = {
    "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
    "LeftArm", "LeftForeArm", "LeftHand", "RightArm", "RightForeArm", "RightHand",
    "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot",
}
missing_bones = sorted(required_bones.difference(armature.data.bones.keys()))
if missing_bones:
    raise RuntimeError(f"Niko's skeleton is missing Mixamo bones: {', '.join(missing_bones)}")

bone_names = set(armature.data.bones.keys())
unmapped_groups = sorted(group.name for group in character.vertex_groups if group.name not in bone_names)
if unmapped_groups:
    raise RuntimeError(f"Niko has skin groups with no matching bone: {', '.join(unmapped_groups)}")

invalid_weight_vertices = [
    vertex.index
    for vertex in character.data.vertices
    if not vertex.groups
    or abs(sum(group.weight for group in vertex.groups) - 1.0) > 0.002
]
if invalid_weight_vertices:
    raise RuntimeError(
        f"Niko has unweighted or unnormalized skin vertices: {invalid_weight_vertices[:10]}"
    )

skull_top = max(vertex.co.z for vertex in character.data.vertices)
skull_points = [
    vertex.co.copy()
    for vertex in character.data.vertices
    if vertex.co.z >= skull_top - 0.12
]
if not skull_points:
    raise RuntimeError("Could not locate Niko's skull vertices")

if not any(
    modifier.type == "ARMATURE" and modifier.object == armature
    for modifier in character.modifiers
):
    raise RuntimeError("Niko's mesh is not bound to the source skeleton")

bpy.ops.import_scene.gltf(filepath=str(HAIR_SOURCE))
hair_meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj != character]
if len(hair_meshes) != 1:
    raise RuntimeError(f"Expected one hair mesh; found {len(hair_meshes)}")
hair = hair_meshes[0]
hair.data.transform(hair.matrix_world.copy())

# Match the in-game hair fit: rotate the cap onto Niko's +X-facing head, then fit its
# silhouette around the upper skull before binding every cap vertex to the Head bone.
turn_to_front = Matrix.Rotation(pi / 2, 4, "Z")
skull_center = sum(skull_points, Vector()) / len(skull_points)
skull_radius = max(
    ((point.x - skull_center.x) ** 2 + (point.y - skull_center.y) ** 2) ** 0.5
    for point in skull_points
)
hair_points = [turn_to_front @ vertex.co for vertex in hair.data.vertices]
hair_center = sum(hair_points, Vector()) / len(hair_points)
hair_radius = max(
    ((point.x - hair_center.x) ** 2 + (point.y - hair_center.y) ** 2) ** 0.5
    for point in hair_points
)
if hair_radius < 1e-6 or skull_radius < 1e-6:
    raise RuntimeError("Could not determine Niko's head or hair size")
hair_scale = skull_radius * 1.28 / hair_radius
for vertex, point in zip(hair.data.vertices, hair_points):
    vertex.co = (point - hair_center) * hair_scale + skull_center + Vector((0.01, -0.01, -0.02))
hair.data.update()
hair.name = "Niko_Hair"
head_group = hair.vertex_groups.new(name="Head")
head_group.add(list(range(len(hair.data.vertices))), 1.0, "REPLACE")
hair_modifier = hair.modifiers.new("Niko_Armature", "ARMATURE")
hair_modifier.object = armature
for obj in list(bpy.context.scene.objects):
    if obj.type == "EMPTY":
        bpy.data.objects.remove(obj, do_unlink=True)

if "mixamo_rig" not in bpy.context.preferences.addons:
    result = bpy.ops.preferences.addon_enable(module="mixamo_rig")
    if "FINISHED" not in result or "mixamo_rig" not in bpy.context.preferences.addons:
        raise RuntimeError("Could not enable the Mixamo Rig add-on in this Blender installation")

bpy.ops.object.select_all(action="DESELECT")
armature.select_set(True)
bpy.context.view_layer.objects.active = armature
if not bpy.ops.mr.make_rig.poll():
    raise RuntimeError("The Mixamo control-rig operator rejected Niko's selected armature")
result = bpy.ops.mr.make_rig(bake_anim=False, ik_arms=True, ik_legs=True)
if "FINISHED" not in result or not armature.data.get("mr_control_rig"):
    raise RuntimeError(f"Mixamo control-rig creation did not finish: {result}")

expected_bones = {
    group.name
    for group in character.vertex_groups
}
if not expected_bones.issubset(armature.data.bones.keys()):
    raise RuntimeError("The control rig no longer contains every bone used by Niko's skin weights")

for label, obj in (("body", character), ("hair", hair)):
    if not any(
        modifier.type == "ARMATURE" and modifier.object == armature
        for modifier in obj.modifiers
    ):
        raise RuntimeError(f"Niko's {label} is no longer bound to the generated armature")

head_control = armature.pose.bones.get("Ctrl_Head")
if head_control is None:
    raise RuntimeError("The Mixamo control rig did not create its head control")

def evaluated_vertices(obj):
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated_obj = obj.evaluated_get(depsgraph)
    evaluated_mesh = evaluated_obj.to_mesh()
    try:
        return [vertex.co.copy() for vertex in evaluated_mesh.vertices]
    finally:
        evaluated_obj.to_mesh_clear()


body_rest = evaluated_vertices(character)
hair_rest = evaluated_vertices(hair)
head_rotation = head_control.rotation_euler.copy()
head_control.rotation_euler.y += 0.25
body_pose = evaluated_vertices(character)
hair_pose = evaluated_vertices(hair)
head_control.rotation_euler = head_rotation
bpy.context.view_layer.update()

body_delta = max((posed - rest).length for rest, posed in zip(body_rest, body_pose))
hair_delta = max((posed - rest).length for rest, posed in zip(hair_rest, hair_pose))
if body_delta < 1e-4 or hair_delta < 1e-4:
    raise RuntimeError("Niko's head control does not deform both the skinned body and hair")

bpy.ops.file.pack_all()

readme = bpy.data.texts.new("START HERE - Niko rig controls")
readme.write(
    "NIKO - BLENDER ANIMATION RIG\n"
    "\n"
    "Select Niko_Armature and switch to Pose Mode. Move the Ctrl_* custom shapes to animate.\n"
    "Use Ctrl_Hand_IK_Left/Right and Ctrl_Foot_IK_Left/Right for IK; Ctrl_Head and Ctrl_Hips\n"
    "for the head and root. Rotate the spine and FK controls as needed. The DEF and MCH bone\n"
    "collections are rig internals; animate the visible CTRL collection, not the skin bones.\n"
    "\n"
    "The source GLB contains a 65-joint Mixamo-named, weighted skin and no animation clips.\n"
    "For a new control rig from the raw GLB, turn off Apply Animation in the Mixamo Rig dialog.\n"
    "The game source GLB and the separate Niko hair GLB have not been changed.\n"
    "\n"
    "Niko's body and hair are packaged as a Mixamo-skeleton FBX beside this .blend file.\n"
)

bpy.ops.object.select_all(action="DESELECT")
armature.select_set(True)
bpy.context.view_layer.objects.active = armature

blend_output.parent.mkdir(parents=True, exist_ok=True)
fbx_output.parent.mkdir(parents=True, exist_ok=True)
stage_blend = blend_output.with_name(f"{blend_output.stem}.building{blend_output.suffix}")
stage_fbx = fbx_output.with_name(f"{fbx_output.stem}.building{fbx_output.suffix}")
if stage_blend.exists() or stage_fbx.exists():
    raise FileExistsError("Refusing to overwrite a previously staged Blender or FBX file")

bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(stage_blend))

for obj in (character, hair, armature):
    obj.select_set(True)
bpy.context.view_layer.objects.active = armature
fbx_result = bpy.ops.export_scene.fbx(
    filepath=str(stage_fbx),
    use_selection=True,
    object_types={"ARMATURE", "MESH"},
    use_mesh_modifiers=True,
    use_armature_deform_only=True,
    add_leaf_bones=False,
    bake_anim=False,
    path_mode="COPY",
    embed_textures=True,
    axis_forward="-Z",
    axis_up="Y",
)
if "FINISHED" not in fbx_result or not stage_fbx.is_file() or stage_fbx.stat().st_size == 0:
    raise RuntimeError(f"Mixamo-skeleton FBX export failed: {fbx_result}")

if args.overwrite:
    stage_blend.replace(blend_output)
    stage_fbx.replace(fbx_output)
else:
    stage_blend.rename(blend_output)
    stage_fbx.rename(fbx_output)

print(f"Saved Blender 5 Mixamo control rig: {blend_output}")
print(f"Saved Mixamo-skeleton FBX: {fbx_output}")
print(f"Niko body: {character.name}, {len(character.data.vertices)} vertices")
print(f"Head control deformation: body {body_delta:.5f}, hair {hair_delta:.5f}")
print(f"Armature: {armature.name}, {len(armature.data.bones)} bones")
print(f"Control rig marker: {armature.data['mr_control_rig']}")
