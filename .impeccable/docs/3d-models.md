# 3D models: how to regenerate, recreate, or import them

Guide for AI agents working on this repo. Read it before you replace Niko, add a prop from a reference link, or redo a model.
Project rules still apply (`.cursor/rules/core-memory.mdc`): edit `world.js`, then always run `node .impeccable/tools/build-world.mjs`; CRLF in js/html; never commit unless asked.

## 1. Pick the route first

| What you were given | Route |
| --- | --- |
| A link to someone else's model (Sketchfab, ArtStation, a store page) | **B**: recreate it as an original procedural model (route **A**). Download it only if its licence allows it (see section 3). |
| A Tripo Studio link to a model the user generated | **C**: fetch the user's GLB, decode it, clean it, wire it in. |
| A GLB the user dropped into `assets/` | **C**, starting from "Cleanup" (section 4.4). |
| "Make a sword / prop / rock like X" with no file | **A**: write a generator script. |

Never guess. If the user's wording could mean "copy that file" or "make one like it", recreate it (route A) and say so.

## 2. Route A: procedural GLB generator (how the xiphos sword was made)

Reference implementations: `.impeccable/tools/xiphos-sword.mjs` writes `assets/models/xiphos-sword.glb`,
and `.impeccable/tools/longsword.mjs` writes `assets/models/longsword.glb` (run either from the repo root).

The Sketchfab Longsword by shor.riot (2,524 triangles / 1,531 vertices) is not downloadable, its public API does
not list a licence, and its page is marked NoAI. The project prop is a generic original weathered-steel longsword
with a fuller, iron crossguard, wrapped grip, and faceted pommel; it does not include the source mesh, textures, or
distinctive ornament.

### 2.1 Collect the brief from the reference page

From the reference page, write down the facts that define the look: triangle count, vertex count, texture size,
materials, and the author's own description. Example, for the Sketchfab xiphos the user linked:
- 718 triangles / 424 vertices, 256×256 hand-painted diffuse textures, PS2/GameCube "stylized realism".
- Leaf-shaped bronze blade with patina, heavily worn iron hilt.

Turn that into a shape spec: silhouette (profile stations), cross-section, parts, and palette. Do not trace or download
their mesh.

### 2.2 Build it in a script, not by hand

The pattern in `xiphos-sword.mjs`:
- `@gltf-transform/core` `Document` + `NodeIO` writes the GLB; geometry comes from the vendored three
  (`../../vendor/three/three.module.min.js`): `LatheGeometry` for round parts (grip, pommel), `ExtrudeGeometry` for flat
  outlines (guard), and hand-built ring lofts for blades (a profile table `[t, halfWidth, halfThickness]` × a cross-section ring).
- Low-poly look = **faceted**: `geometry.toNonIndexed()` then `computeVertexNormals()`, so every triangle is flat.
- "Hand-painted" textures = SVG drawn in code and rasterised by `sharp` (gradients, blurred blotches for patina/rust,
  pits, scratches). Use a **seeded** random so every build is identical. Keep textures small (64–256 px).
- UVs: blades get u across the width and v along the length (v = 0 at the base; glTF image row 0 is v = 0).
  Tiling parts use a side projection (`boxUv`) so the texel density matches across pieces.
- Units and pivot: +Y up along the object's main axis, origin where it is held or stands. The xiphos origin is near
  the pommel, the guard face at y ≈ 0.2, the tip at y ≈ 0.92, and the grip centre at y = 0.1 (`SWORD_GRIP_Y` in `world.js`).
- Log the triangle count at the end and keep it near the reference (xiphos: 556 vs the reference's 718).

### 2.3 Preview before wiring

Server: `node .impeccable/tools/serve.mjs 8765` (repo root, background). Then, from `.impeccable/tools`:

```
node model-view.mjs /assets/models/<file>.glb <prefix>   # writes ../review/<prefix>-{front,side,iso,top}.png
```

Read the PNGs. The image tool caches by path, so use a new prefix every time.

### 2.4 Wire it into the world

See the sword pickup blocks in `world.js`:
- `import xiphosGlb from "./assets/models/<file>.glb";`. esbuild's binary loader embeds it in `world.bundle.js`, so `file://` still works.
- Parse with `new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "")`.
- Swap materials to the island look: `node.material = softMapped(node.material.map)`, with `castShadow` and `receiveShadow` on.
- Size it against Niko: he is about 2.2 world units tall (2.5 units ≈ 1.5 m). The xiphos is `SWORD_SIZE` 1.15 world units.
- Place it with `island.spot(...)`, `landing`, or offsets in **screen terms**: the default camera's screen-right is
  `(+1, 0, −1)/√2` and up-screen (away from the camera) is `(−1, 0, −1)/√2`. Snap the spot to walkable ground with
  `island.nav.walkable` / `island.nav.nearest`, and set its height with `island.groundAt`.
- Things Niko holds are parented to a bone. `fitSwordGrip()` builds the grip from the knuckle bones
  (`RightHandIndex1/Pinky1/Middle1/Thumb1`). They are children of `RightHand`, so the fit holds in every clip.
  The blade runs along the knuckle line, dipped toward the fingers, with its flat facing the palm.
- Both the Xiphos and longsword have independent ground placements and pickup state. The longsword uses Niko's left
  hand so the two swords can be collected separately and held together.
- Add a `debug` hook (`debug.sword()` / `debug.longsword()`, pass `true` to equip either) and a Puppeteer check
  (`sword-check.mjs` / `longsword-check.mjs`).
- Remember: from the 45° top-down camera, a blade pointing straight at the viewer looks like it hangs down. Confirm
  directions numerically (bone world axes) before "fixing" what a screenshot seems to show.

## 3. Route B: a model from someone else's page

1. Open the page and read its licence and "Download" state.
   - Downloads disabled, or no licence: **do not** fetch it from network requests or a HAR capture. Recreate it with route A.
     The repo has done this before: the training dummy (iltaen's Sketchfab dummy had downloads off) and the xiphos.
   - Downloadable and CC0 / CC-BY (Sketchfab "Download 3D model"): download the glTF/GLB, keep the credit,
     and still restyle it to the island look. `assets/niko/hair-short.glb` is a Sketchfab cap that came in as a download.
2. Reference downloads go in `assets/sampleModels/` (reference only, never shipped; `.vercelignore` excludes it).
3. Tell the user which one you did.

## 4. Route C: Tripo (how Niko's body was made)

### 4.1 History, so you do not redo dead ends

- The user generates characters in **Tripo Studio** (`studio.tripo3d.ai`) from the character art in `assets/`
  (`Niko_ Child of the Star Character Guide.png`, `Low-Poly Starry Mage Explorer.png` and its `.glb` in `assets/sampleModels/`).
  Page slugs like `low-poly-humanoid-character-with-light-skin-and-dark-gray-shorts-8a00cde2-…` are Tripo's own captions.
- First Tripo body (task `8a00cde2…`): low-poly humanoid, **6,264 triangles / 7,262 vertices**, one base-colour texture,
  Mixamo skeleton with the `mixamorig:` prefix, **no animation clips**, faces **+X**, arms along Z, origin at the feet,
  about 0.98 units tall. Saved plain as `assets/niko/low-poly-humanoid.glb`.
- `assets/niko/fantasy-character-7k.glb`: a second Tripo character (task `868144a6…`). Its PBR source was 1.9 M triangles;
  it was simplified to 7,000 faces with meshoptimizer (section 4.3). It is not in the game.
- `low-poly-humanoid-v2…v6.glb` are the user's own iterations (v2 came from a Tripo `3d-model/...47ce7efe…` page; v6 is a
  Blender face edit). **`low-poly-humanoid-v6-clean.glb` is the body in the game** (v6 run through section 4.4).
- Rejected, do not repeat: sculpting the face in code (nose/jaw/brow vertex pushes), the older procedural mascot as the
  main body, and baking clips into the GLB (clips are retargeted at load instead).

### 4.2 Getting the GLB out of Tripo

Preferred: ask the user to export it from Tripo with these settings:
- Format **GLB** (not FBX/OBJ/USDZ). Mesh: **low-poly / smart mesh**, about 5k–20k triangles.
- **Auto-rig: humanoid/biped (Mixamo-compatible)**. T-pose or A-pose, facing forward.
- Textures embedded, 1024–2048 px (4K is wasted at this camera distance).
- Then save it in `assets/niko/` with a new version suffix. Never overwrite the user's file.

If the user asks you to fetch it from a Tripo page they own:
1. Open the workspace page in the browser tool and let the viewer load.
2. The viewer streams a **signed, meshopt-compressed GLB** from CloudFront:
   `https://tripo-data.rg1.data.tripo3d.com/tripo-studio/<yyyymmdd>/<taskId>/tripo_<pbr_model|rigging>_<taskId>_meshopt.glb?Key-Pair-Id=…&Policy=…&Signature=…`
   Find it with `performance.getEntriesByType("resource").map((e) => e.name).filter((u) => /tripo-data.*\.glb/.test(u))`,
   or by searching the page HTML. The `rigging` file is the rigged low-poly; `pbr_model` is the high-poly textured mesh.
   A `output_point_cloud_…glb` is not the mesh.
3. Download it with **node `fetch`** and write the bytes to a file. Do not use PowerShell `curl` (it is Invoke-WebRequest),
   and do not pass the URL through a shell (the `~` in signatures gets mangled). Signed URLs expire, so download right away.
   Do not commit or paste the signed URL into docs.
4. If a quad/retopo mesh is shown in the viewer but never appears in the resources, do not block on it. Simplify locally (4.3).

### 4.3 Decode, and simplify if needed

Run scripts from `.impeccable/tools` (that is where `@gltf-transform/*`, `meshoptimizer`, `sharp` and `puppeteer-core` are installed).

```js
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
await MeshoptDecoder.ready;
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder }).read(src);
await new NodeIO().write(out, doc); // a FRESH NodeIO: one that registered meshopt but has no encoder throws encodeGltfBuffer
```

"Some extensions were not registered for I/O" on write is expected, and the texture still writes.

Simplifying (how the 7k fantasy character was made): `MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3,
uvs, 2, [highUvWeight, highUvWeight], null, targetFaces * 3, 1, [])`. Strides are in floats, the target index count must be a
multiple of 3, `target_error` up to 1 so the count is actually reached, and the UV weight is high so the texture does not swim.
Then `compactMesh`, and write a plain GLB with the original JPEG material.

### 4.4 Cleanup (every new body goes through this)

From `.impeccable/tools`:

```
python tex-pad.py ../../assets/niko/<v>.glb ../review/<v>-padded.jpg
node mesh-clean.mjs ../../assets/niko/<v>.glb ../../assets/niko/<v>-clean.glb --texture ../review/<v>-padded.jpg
python mesh-audit.py ../../assets/niko/<v>-clean.glb [yMin]
```

- `tex-pad.py` fills the black gaps between UV islands with the nearest island colour, so seams and mipmaps don't go dark.
- `mesh-clean.mjs` drops degenerate triangles, fills small holes, and collapses only tiny folded slivers. Larger folds,
  like the shorts hem, are intentional; collapsing them made non-manifold edges. It also recomputes smooth normals shared
  across UV seams, and **removes Blender's duplicate unused armature**. A second skin with the same bone names steals the
  animation binding, and the body then stays in bind pose. UVs, skin weights and texture are left alone.
- Aim for 0 open edges, 0 non-manifold edges and 0 seam normal breaks in the audit.

### 4.5 Putting a body in the game

All in `useNikoModel` (`world.js`):
- Swap `import nikoBody from "./assets/niko/<v>-clean.glb";`. The body is scaled to `PREVIOUS_HEIGHT` 2.17 and yawed
  `-Math.PI / 2` (Tripo faces +X; the game walks +Z), with the origin planted at the soles.
- Animation is **not** in the GLB. `retargetMixamo` plays `assets/niko/Idle.fbx` and `assets/Running (1).fbx` on any body
  with Mixamo bone names. `mixamorig` is stripped on the **target only**; hips keep only their vertical bob.
- Lock-on strafes come from `assets/niko/lockon.json` (Pixel Pass Unity `.anim` curves via `lockon-clips.mjs`). Unity
  arm curves need the y/z sign flip in `curvesClip` or the wrists cross.
- Eyes are painted decals from `assets/niko-eyes.png`, fitted with `EYE_FIT` (`debug.eyes`, `face-fit.mjs`). Hair is
  `hair-short.glb` seated on the Head bone (`HAIR_FIT`, `debug.hair`).
- An embedded textured body grows the bundle by roughly its file size. Keep bodies around 1.5 MB.

### 4.6 Verify

- `niko-walk.mjs`, `niko-angles.mjs`, `face-fit.mjs`, `niko-light.mjs` (all in `.impeccable/tools`, screenshots in `.impeccable/review/`).
- Prove animation numerically: a bone quaternion changes while a key is held, and the skinned mesh's skeleton bone is the
  same object as `bot.bones.<name>`. Screenshot descriptions have invented T-poses before.
- `python mesh-audit.py` on the shipped file.

## 5. Tool index (`.impeccable/tools`)

| Tool | Use |
| --- | --- |
| `xiphos-sword.mjs` | Procedural GLB template (run from the repo root) |
| `longsword.mjs` | Procedural longsword GLB generator (run from the repo root) |
| `model-view.mjs <url> <prefix>` | Front, side, iso and top shots of any GLB served on :8765 |
| `glb-shots.mjs`, `pose-shot.mjs` | Character GLB shots (clips, hands, face) |
| `glb-dump.mjs` | Dump a GLB's nodes, materials and textures |
| `tex-pad.py`, `mesh-clean.mjs`, `mesh-audit.py` | Body cleanup and audit |
| `sword-check.mjs [base] [prefix]` | In-game pickup and grip shots |
| `longsword-check.mjs [base] [prefix]` | Longsword pickup and left-hand grip check |
| `export-kit.mjs` | Exports island pieces to `assets/kit/` for the three.js editor |

When you finish, update `.cursor/rules/core-memory.mdc`. Patch the sentence that changed rather than appending history.
