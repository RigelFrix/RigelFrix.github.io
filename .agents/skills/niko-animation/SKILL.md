---
name: niko-animation
description: Exports a Cascadeur or Mixamo FBX animation onto Niko and integrates it into the 3D world (world.js) - retargeting to a JSON clip, root-motion extraction, timing, state logic, blends between clips, and numeric verification against the source. Use when adding, replacing, re-exporting, extracting or debugging any character animation, or when the user reports an animation that looks slow, cropped, sliding, snapping, facing the wrong way, or rotating during a transition.
---

# Niko animation: export and integration

How to take an animation the user authored (Cascadeur FBX, sometimes Mixamo) and make the game play it the way it was authored. Written after the sprint 180° turn, which went through many failed rounds of tuning by feel before this method fixed it in one. The worked example with every number is in [turn-180-case.md](turn-180-case.md).

Project rules still apply (`.cursor/rules/core-memory.mdc`): after editing always run `node .impeccable/tools/build-world.mjs`; the shell is PowerShell (`;`, not `&&`); update the core memory when the task is done.

**Locomotion ownership:** stop / 180 / gait / `poseInertia` / `STOP`+`TURN180` live only in `world-loco.js` (`createLoco`). Wire new root-motion or sprint blends there and run the matching `verify-*.mjs`. Do **not** paste new loco into `world.js`. Clip load/retarget stays in `world-niko.js`. See core-memory “Where to edit”.

## The principle

**The source clip is the truth. The game plays it back; it does not re-invent it.**

The user animates in Cascadeur and judges the game against what they saw there. Whenever the game substituted its own motion for the clip's (a braking curve, a root snap, a different duration, a blend that starts before the clip ends), the user saw it immediately and reported it as "slow", "cropped", "drifting", or "rotating".

So the game contributes only what the clip cannot know: where Niko is, which way he was travelling, and when the move starts. Everything else comes out of the file:

1. **Measure** the source before writing any code.
2. **Extract** what the root must do (heading, travel) into data stored beside the clip.
3. **Play back** the clip and that data on one clock.
4. **Verify** the game against the source with the same measurements.

Do not tune by feel. If something looks wrong, measure it first; the number tells you which of the steps above is broken.

## Workflow

```
- [ ] 1. Read the brief: which file, which frames mean what, what it transitions from and to
- [ ] 2. Measure the source with anim-probe.mjs
- [ ] 3. Pick the timing from the measurements
- [ ] 4. Choose the clip type: in-place loop, in-place one-shot, or root motion
- [ ] 5. Export to assets/niko/<name>.json
- [ ] 6. Wire it into world.js (action, state, clock)
- [ ] 7. Blend in and out with poseInertia
- [ ] 8. Rebuild: node .impeccable/tools/build-world.mjs
- [ ] 9. Verify numerically against the probe's numbers
- [ ] 10. Report (timing chosen and why, what remains authored, what was not tested), update core memory, delete temp files
```

## Where things are

| Thing | Location |
| --- | --- |
| Source animations | `assets/niko/*.fbx`. New exports usually arrive in `c:/Users/Rigel/Downloads/`; copy them into `assets/niko/` and keep older takes |
| Bind pose of the Cascadeur rig | `assets/niko/niko-cascadeur-clean.fbx` if present, else `c:/Users/Rigel/Desktop/Cascadeur/niko-cascadeur-clean.fbx` (the exporters try both) |
| Target body | `assets/niko/niko.glb`, 65 Mixamo bones, `mixamorig` prefix stripped at load |
| Exported clips | `assets/niko/<name>.json`, imported in `world-niko.js` and `world-loco.js` (esbuild embeds them) |
| Probe | `.impeccable/tools/anim-probe.mjs` |
| Exporters | `export-cascadeur-animations.mjs` (idle, sprint: in place), `export-stop.mjs` (sprint stop + world-space `stop-mirror.json` from `sprinting-stop-v3-3.fbx`), `export-one-punch.mjs`, `export-flying-knee.mjs`, `export-turn-180.mjs` (root motion; copy this one for a new root-motion clip) |
| Runner | `node .impeccable/tools/run-tool.mjs <script.mjs> [args]` from the repo root |
| Game code | Clips/load/cloak/secondary: `world-niko.js` (`directClip`, `actions.*`, `matchHemisphere`). Loco/mixer weights/IK: `world-loco.js` (`poseInertia`, `StopLoco`, `TurnLoco`). `world.js` is thin orchestration only. |
| Checks | `.impeccable/tools/verify-*.mjs` (Puppeteer + Edge; each starts its own server) |
| Loco changes | Edit `world-loco.js` only; never re-open a dump into `world.js` |

Exporters and the probe must go through `run-tool.mjs`: `FBXLoader` imports the bare specifier `three`, which plain node cannot resolve, so the runner bundles the script with the vendored three first. It leaves `.temp-tool.mjs` in the repo root; delete it when done. Node also needs DOM stubs whose `onload` fires, or `GLTFLoader.parseAsync` never resolves; copy the stub block from `anim-probe.mjs`.

## Coordinate facts

Get these wrong and the clip plays sideways or mirrored. All of them were confirmed by measurement.

- **Heading convention:** `yaw = atan2(v.x, v.z)`. Rotating by `Ry(a)` adds `a`. The root is `robot`; its facing direction is `(sin yaw, 0, cos yaw)`.
- **Left of a travel direction** `(x, z)` is `(z, -x)`.
- **Niko's model space:** nose toward +X, his left toward −Z. The game sets `model.rotation.y = -π/2` so he walks +Z. Exporters set that yaw to 0 while reading the rest pose, so clip rotations are in model space.
- **Hips parents are identity** (Armature and Scene: no rotation, scale 1). The Hips track is therefore a model-space rotation, and a root yaw `R` can be removed with `Ry(-R) × hips`. The probe prints this chain; recheck it if the body GLB changes.
- **Units:** source units × `hipScale` (Niko hips height ÷ bind hips height, 0.01) = model units; model units × the armature's world scale (2.176) = world units. Read the second factor live with `bot.bones.Hips.parent.getWorldScale()`, never hard-code it in the game.
- **Game speeds:** jog `SPEED` 4.6, sprint `SPRINT_SPEED` 10.5 world units/s. Niko is about 2.2 world units tall.
- **True heading of a body part** is the yaw of a left-to-right joint pair (`LeftUpLeg`/`RightUpLeg` for hips, `LeftArm`/`RightArm` for chest), flattened to the ground and unwrapped across frames. Never read heading from Euler angles: with the hips pitched ~50° in a skid, the `YXZ` yaw is not the direction the body faces.

## Step 2: measure the source

```
node .impeccable/tools/run-tool.mjs .impeccable/tools/anim-probe.mjs assets/niko/<clip>.fbx --clips sprint,stop
```

Options: `--plant rf:16-38,lf:23-31` (foot drift inside frame windows), `--quiet` (summary only), `--frames N`, `--scale`.

Read from the table, per frame:

| Column | What it tells you |
| --- | --- |
| key dt / fps | The rate the file was baked at. Not necessarily the authored timing |
| `along`, `step` | Root travel along the run-in direction. `step × fps` = speed. The frame where `along` peaks is the apex (root stops) |
| `hipYaw`, `chestYaw` | True heading relative to frame 0. Where the turn really happens, and how far it gets |
| `LF/RF along`, `y` | A foot is planted while `along` stays flat and `y` stays low. Note the frame windows |
| `--clips` output | Hip heading range of the clips this one hands off to. The last frame of the new clip has to land inside it |

Write down: frame count, apex frame, plant windows per foot, total heading turned, entry and exit speed at each candidate fps, and the heading range of the neighbouring clips.

**The user's frame description is intent, not measurement.** For the 180 the brief said "0–30 slowing down, 31–40 accelerating the other way". The probe showed the root stops at frame 25 and the body rotates mostly in frames 31–40. Honour the intent, build the mechanics on the measured frames.

## Step 3: timing

A re-bake at another fps holds the same poses with different timestamps, so the file's duration proves nothing. Decide the timing with evidence, in this order:

1. **Entry speed.** Convert the first frame's `step` to world units/s at each candidate fps (the probe prints 30 and 60). The authored timing is the one whose entry speed matches the state the clip starts from. The 180 enters at 8.1 at 60 fps and 4.1 at 30 fps; it starts from a 10.5 sprint, so it is a 60 fps clip.
2. **Sibling clips.** `sprint.json`, `stop.json` and `idle.json` last a whole number of frames at 60 fps (29/60 s and 78/60 s), which is the Cascadeur scene rate.
3. **The user's words.** "Looks slow" after a re-bake means the duration doubled, not that the clip needs a speed multiplier.

Stamp the exported clip with the authored duration (`frames / fps`) regardless of the FBX timestamps. Keep the game's rate multiplier at 1.0 and expose it as a live knob (`PortfolioWorld.sprint({ turn180Anim })`) so the user can try other rates without a rebuild. Do not ship a multiplier to "make it snappier".

## Step 4: clip type

| Type | Examples | Root motion | Hips track |
| --- | --- | --- | --- |
| In-place loop | idle, sprint | Game moves the root at the gait speed | Rotation + vertical bob (+ small sideways sway) |
| In-place one-shot | (legacy short stops) | Game decays the speed | Same |
| Root motion | 180 turn, sprint stop (`sprinting-stop-v3-3`), planted feet while travelling | Extracted from the clip, played back on the root | 180: yaw stripped + bob; stop: authored hips + bob (facing stays) |

Use root motion whenever feet plant while the root moves or turns. A guessed root curve under planted feet always slides them.

## Step 5: export

Every exporter uses the same retarget, per bone and per frame, with both skeletons measured at model yaw 0:

```js
// align = rotation taking the bind rig's arm-across axis onto Niko's
delta  = srcWorld(frame) * srcRestWorld^-1          // how far the source bone moved from its bind
posed  = align * delta * align^-1 * tgtRestWorld    // same motion on Niko's rest
local  = parentPosed^-1 * posed                     // what the track stores
if (dot(local, previousFrameLocal) < 0) local = -local   // keep the quaternion on one hemisphere
```

Hips position: `x, z` = Niko's rest (plus scaled sideways sway for in-place loops), `y = restY + (srcY − srcRestY) × hipScale`. Scale tracks are written only when a bone's scale leaves 1 by more than 0.005 (squash and stretch, as in the one-punch).

Clip JSON, read by `directClip` in `useNikoModel`:

```json
{ "name": "turn180", "duration": 0.6667,
  "bones": [{ "name": "Hips", "times": [], "q": [], "posTimes": [], "pos": [] },
            { "name": "Spine", "times": [], "q": [] }] }
```

Extra top-level keys are free; root-motion clips add `fps`, `lastFrame`, `apexFrame`, `yawDeltaDeg`, `yawCurve`, `root`.

### Root-motion extraction

Do this in the exporter, never at runtime. See `export-turn-180.mjs`.

**Root yaw.** For each frame take the true hip heading (rest hip-across axis rotated by `hipsWorld × restWorld^-1`, flattened, `atan2(x, z)`), then unwrap.

- The root takes the part that only ever grows: `progress[i] = max(progress[i-1], sign × (heading[i] − heading[0]))`. Wobble against the turn direction stays in the Hips track as twist.
- Normalise so the last frame is exactly 1 and store it as `yawCurve`; the game multiplies by `±π` (`yawDeltaDeg`). Authored turns rarely reach the full angle (the 180 turns 150.5°). Scaling the curve makes the root land exactly on the gameplay angle, and the shortfall is spread across the turn as a few degrees of hip twist instead of being left for the exit blend to unwind.
- Rewrite the Hips track as `Ry(−yawDelta × yawCurve[i]) × hipsWorld[i]`, then re-apply the hemisphere check.
- Print the twist left in the clip per frame. It must stay inside the next clip's range (sprint is ±17°). If it does not, the root curve is wrong.

**Root travel.** Hip position minus frame 0, flattened, rotated by `align`, projected on Niko's forward and left axes, × `hipScale`. Store `[forward, left]` per frame in model units as `root`. Also store `apexFrame` (largest forward value) and print the entry and exit speeds.

The exporter's log is the first verification: root yaw per frame, twist left per frame, travel per frame. Read all three before touching the game.

## Step 6: wire it into world.js

**Action setup** (in `useNikoModel`): `mixer.clipAction(directClip(data))`, weight 0, `setEffectiveTimeScale(0)`, `play()`. One-shots also `setLoop(THREE.LoopOnce, 1)`. Add the clip to the `matchHemisphere` calls below the actions: the mixer averages quaternion components, and two clips stored on opposite hemispheres twist a limb through a full turn when they overlap.

**Clips never run on mixer time.** Every action's time scale is 0; the frame loop writes `action.time` and the weights each frame from game state (a loop phase or a move timer). This is what lets the root and the clip share a clock.

**Rules for a root-motion move** (`TurnLoco.start` / `TurnLoco.step` is the reference):

1. **One clock.** `norm = timer / duration` drives the clip time, the root yaw and the root travel. Duration = clip duration ÷ the rate knob. Nothing else may advance any of the three.
2. **Travel by deltas of the curve.** Each frame move the root by `sampleRoot(norm) − sampleRoot(prevNorm)`, times the world scale, laid along the direction Niko was travelling when the move began (`forward` on that direction, `left` on its left). Never integrate a speed you made up.
3. **Yaw from the curve.** `robot.rotation.y = startYaw + yawDelta × sampleYaw(norm)` and mirror it into `state.yaw`. Start yaw comes from the travel direction, not from `robot.rotation.y` (that lags in curves).
4. **Entry speed carry.** The clip runs in at its own speed, the game at another. Add the difference (clamped) as extra forward distance that eases to zero before the first foot plants. Without it there is a speed step on the first frame; if it lasts past the plant, the foot slides.
5. **Report the real speed.** `state.speedMeter` = distance actually moved ÷ time, so the HUD, gait weights and effects stay honest. Flip `state.moveDir` at the apex.
6. **Lock out everything procedural.** During the move: bank, lead, chest twist, foot dust. During the move and its exit blend: steering (`pathOmega = 0`) and plant-lag facing (`exitFacingLock`). Each of these rotates or offsets the body and reads as "the direction changes".
7. **Keep collisions.** After the step, call `resolveCollisions(robot.position)` and `stepTo(before, robot.position)` as the normal movement branch does.
8. **End exactly.** On the last frame set yaw to `startYaw + yawDelta`, set the speed to the clip's exit speed, flip `moveDir`, and start the exit blend. Do not start the exit blend earlier: cutting the last frames is what the user called "cropping".

## Step 7: blends

`poseInertia` in `world.js` is the only blend used between full-body clips that differ a lot:

- **Mixer weights stay exclusive** (the move at 1 and the gait at 0, or the reverse). Cross-fading two full-body clips by weight averages hip rotations that are far apart and wrings the limbs — including **jog ↔ sprint**. Never drive those two from a continuous `state.sprint` crossfade; Shift spam made that look like broken ankles.
- **Jog ↔ sprint (temporary soft lean):** upright Mixamo jog vs Cascadeur motorcycle sprint. Soft mixer crossfade via `gaitMix` (~0.5 s, smoothstep) with Shift/`gaitExitSpeed` hysteresis. Phase-match the destination when a blend starts. **Do not** overwrite legs from the other clip under blended hips (that wrings ankles). Replace with an authored transition when one exists. Check: `verify-gait-blend.mjs`.
- **Entering a one-shot:** `poseInertia.capture(bot.bones)` then `poseInertia.play("in", 0.08)`. It slerps from the snapshot to whatever the mixer writes each frame, legs slightly slower than the body.
- **Leaving a one-shot:** `poseInertia.captureClip(clip, clip.duration)` snapshots the clip's exact last frame; `matchClipPhase` / `matchSprintPhase` picks the loop phase whose hips and legs are closest; set the loop phase to it; `poseInertia.play("out", 0.14)`. No fixed target: the destination clip keeps running underneath, so nothing pops when the bridge ends.
- **Gait after the move.** Hold the gait (`state.sprintHold` + `state.gaitSprint = true` while the speed ramps and Shift is held) so a jog cycle does not flash in.

If the body visibly rotates during the exit blend, the blend is not the problem. The root yaw at the clip's end plus the twist left in the clip does not match the next clip; fix the extraction.

## Step 9: verify

`verify-turn-180.mjs` is the template. It records every rendered frame inside the page and compares the game with the source.

- **Record in the page** with a `requestAnimationFrame` loop pushing into an array, and read the array back once at the end. Sampling through `page.evaluate` every 25–40 ms misses single-frame snaps.
- **Record:** move timer and duration, `state.yaw`, speed, root position, hip heading and chest heading from bone world positions (same joint pairs as the probe), both feet's world positions, and the weights of every action involved.
- **Assert:** clip duration equals the authored one; the root turned exactly the gameplay angle; the largest per-frame heading step at and after the handoff is small (4° for the 180); the body heading after the handoff stays inside the next clip's range; the gait two frames after the end is the intended one.
- **Compare with the source:** run the probe with `--plant` on the same frame windows. Planted-foot drift in the game should equal the source's (180: right foot 0.31 in the source, 0.29–0.34 in game). More drift means the root is not following the clip.
- **Read the per-frame table**, not only the pass line. A root snap shows as one row where root yaw jumps while hip heading does not.
- **Test how the move is entered, in every direction and with every key timing.** `verify-turn-180-gap.mjs` is the template: it sends the keys from inside the page on `requestAnimationFrame` (exact gaps), runs W↔S and A↔D, and tries both an overlap (opposite key down while the first is held) and a release gap of 0–200 ms. W and S share a finger, so a player always lets go before pressing the other; A and D overlap. A check that only presses one way with one timing passes while the other way is broken.

Headless gotchas: do a warm-up lap first (the first sprint and the first move compile shaders and stall 1–2 s); in the Dev Gym sprint with S, because W runs into the training dummy; never return a GSAP object from `page.evaluate`; the image reader caches by path, so use a new screenshot name each run.

Numeric checks do not replace the user's eye. Say so in the report and ask for a `log-report` (`?dev=1&log=1`, F9) if they still see a problem.

## Symptom to cause

| The user says | Usual cause | Check |
| --- | --- | --- |
| "Looks slow" | Clip stamped at the wrong fps, or a re-bake doubled the duration | Probe entry speed at 30 and 60 fps |
| "The game crops / cuts it" | Exit blend starts before the last frame, or a cut range drops frames | Clip time reaches `duration`; frame count equals the source's |
| "Rotates / direction changes in the transition" | Root yaw at the end + twist left in the clip does not match the next clip; or the root snaps mid-clip | Exporter's twist log; hip heading column across the handoff |
| "Planted feet drift / face the wrong way" | Root travel or yaw is not from the clip, or runs on another clock | Foot drift, game vs probe |
| "Snap at the transition" | Clip time jumps or freezes, blend toward a frozen pose, weight cross-fade | Per-frame heading step; action weights |
| "Feet end up in different places" | Loop phase not matched to the outgoing pose | `matchClipPhase` / `matchSprintPhase` |
| "Ankle breaking / feet twist when blending jog↔sprint" | Sprint legs under jog hips (leg mask), or mix thrashing | Soft full-body `gaitMix` + phase match + hysteresis; never stamp exclusive legs onto blended hips |
| "Body snaps upright ↔ motorcycle lean" | Instant gait weight flip or `gaitBlend` too short | Soft `gaitMix` ease (~0.5 s) on upper body |
| "A jog flashes in" | Gait weight follows a low exit speed | Gait weights after the end; `sprintHold` / `gaitSprint` |
| "Sideways / H and V swapped" | Raw FBX locals used without the bind retarget, or model yaw not zeroed in the exporter | Use the shared retarget |
| "Bug only in one direction / only on W and S" | Usually not the direction: those keys are typed differently (release, then press). Read the INPUT lines of the `log-report` for the gap between key up and key down, then look for a gate that rejects the move during the gap and lets it fire late | `verify-turn-180-gap.mjs`: `back`, `faceSnap`, `delay` columns |

## Do not repeat

All of these were tried on the 180 and rejected by the user:

- Guessed brake and acceleration curves for the root.
- Snapping the root 180° at the plant frame.
- Pinning or stripping hip yaw with Euler angles.
- Lerping the root yaw linearly over part of the clip.
- Starting the exit blend before the clip ends (`holdFrac`).
- Blending toward a frozen target pose, or freezing the destination clip during the blend.
- Stretching a clip to a different duration, or shipping a speed multiplier to compensate.
- Declaring it fixed from a screenshot or from a check that only looks at the final yaw.

## Reporting

Tell the user, in plain words: which timing was chosen and the evidence; what the game now takes from the clip; what they will still see that is in the clip itself (for the 180: the chest ends 35° short and finishes during the blend, and the exit speed is the clip's push-off); what was not tested; the live knob. Then patch the matching sentence in `.cursor/rules/core-memory.mdc`.
