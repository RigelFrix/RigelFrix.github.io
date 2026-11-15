# Worked example: the sprint 180° turn

The full record of one root-motion clip, from brief to verified result. Use it as the reference when a number in a new clip looks odd, and as the template for the next root-motion move.

## Brief

- Source: `assets/niko/sprinting-stop-v3.fbx` (Cascadeur), frames 0–40.
- User's description: frames 0–30 slow down while still moving forward and end in a planted action pose; frames 31–40 accelerate the opposite way; at the end, blend into the sprint.
- Trigger: sprinting at speed ≥ 7 with the sprint clip visible, then reverse input (`TurnLoco.blockedReason`).

## What the probe measured

```
node .impeccable/tools/run-tool.mjs .impeccable/tools/anim-probe.mjs assets/niko/sprinting-stop-v3.fbx --plant rf:16-38,lf:23-31 --clips sprint,stop,turn-180
```

| Fact | Value |
| --- | --- |
| Keys | 41 (frames 0–40). The first export was keyed at 60 fps (0.667 s), the re-bake at 30 fps (1.333 s); the poses are identical |
| Scale | bind hips 54.45 → Niko hips 0.5445: `hipScale` 0.01; × 2.176 = 0.02176 world units per source unit |
| Root travel | 6.2 source units on frame 1, 4.3–5.8 per frame through frame 12, slowing to 0 at **frame 25** (apex, 2.18 world units), drifting back up to 0.6 per frame to frame 30, then 0.5 → 3.4 per frame backwards to frame 40 (ends at 1.67 world units) |
| Speed | 60 fps: enters at 8.14, leaves at 4.15 world units/s. 30 fps: 4.07 and 2.07 |
| Hip heading | +12.8° at frame 8, back through 0 at frame 13, −54.3° at frames 22–23, −45.9° at frame 30, then −50.9, −58.4, −69.8, −87.1, −106.0, −120.8, −132.5, −141.2, −147.1, **−151.4° at frame 40** |
| Chest heading | −93.6° at frame 30, −159.1° at frame 40 |
| Right foot | Planted from about frame 13 to the end; it is the pivot and push-off foot, heel lifting near 40. Drift over frames 16–38: 0.31 world units |
| Left foot | Planted from about frame 21 to 33, then steps back. Drift over frames 23–31: 0.06 world units |
| Sprint clip | Hip heading swings −16° to +18° around rest, starts and ends at −16° |

What followed from the numbers:

- **Timing is 60 fps.** Only then does the run-in (8.1) sit near the sprint speed (10.5); at 30 fps it enters below jog speed (4.6). The sibling clips last whole frames at 60 fps too (sprint and stop 29/60 s, idle 78/60 s).
- **The root stops at frame 25, not 30.** Frames 25–30 are the hold on planted feet.
- **Most of the rotation is in frames 31–40**, and the clip ends about 29° short of 180° while still turning.
- **The right foot is down for two thirds of the clip**, so any root motion that is not the authored hip path slides it.

## What went wrong before, in order

| Attempt | What the game did | What the user saw |
| --- | --- | --- |
| Earlier v2 clip | Played a cut range at a changed rate | "the game is cropping and cutting most of it and changing its speed" |
| v3, first pass | 1.33 s timing; hip yaw stripped to the rest value; root travel from a guessed brake curve | "the game drifts the animation making the planted feet in wrong direction" |
| v3, second pass | Hip yaw kept to the plant and pinned after it with Euler angles; root yaw lerped over frames 31–40 | "the animation looks so slow"; "the model will rotate direction" between the 180 and the sprint |
| v3, third pass | Rate ×1.45 (0.92 s); root snapped 180° at the plant; exit blend started at 94% toward a frozen sprint pose | "the problem is still the same" |

Each pass changed constants. None of them measured the file. The root cause in every case was the game's own motion standing in for the clip's:

- The clip played on 30 fps timing, twice as long as authored.
- The root snapped at the plant while the Hips track stayed pinned at the sideways plant twist, so the body flipped at the plant and then unwound during the sprint blend.
- The pin used a `YXZ` Euler yaw on a quaternion pitched ~54°, which is not a heading.
- Root travel was a power curve, not the hip path, so planted feet slid.

## The export

`node .impeccable/tools/run-tool.mjs .impeccable/tools/export-turn-180.mjs` prints:

```
duration=0.6667s bones=65 hipRest=(-0.0012, 0.5445, 0.0000)
axes: forward=(1.00, 0.00) left=(0.00, -1.00)
authored hip heading turned -150.5°; root yawDelta=-180°
root yaw per frame: 0 ×14, -8 -19 -31 -42 -51 -57 -60 -62 -63 ×10, -67 -81 -102 -125 -143 -158 -168 -175 -180
hip twist left in clip: -16 -14 -12 -10 -8 -5 -3 -2 -2 -2 -4 -6 -10 -16 -15 ... 4 -1 -5 -3 1 4 7 10 11 13 13
root forward (model units): 0.00 0.06 0.12 ... 1.00 (frame 25) ... 0.77
apex frame 25 (1.002 model units); speed in 3.74 out 1.90 model units/s
```

How to read it:

- The root yaw is flat while the hips only wobble (frames 0–13), follows the first twist into the plant, holds through the plant, then carries the turn and lands on exactly −180°.
- The twist left in the Hips track stays between −16° and +13°, inside the sprint's own ±17°. That is the proof the exit blend has no yaw to fix.
- `root` holds the hip path; `apexFrame` 25 is where the game flips its travel direction.

The yaw extraction, in `export-turn-180.mjs`:

```js
const heading = unwrapYaw(headingRaw);            // true hip-line heading per frame, model space
const authoredSign = Math.sign(heading.at(-1) - heading[0]) || -1;
let peak = 0;
const progress = heading.map((h) => (peak = Math.max(peak, authoredSign * (h - heading[0]))));
const yawCurve = progress.map((v) => v / progress.at(-1));   // 0..1, last frame exactly 1
const yawSpan = authoredSign * Math.PI;
// Hips track keeps only what the root does not carry
rootInv.setFromAxisAngle(UP, -yawSpan * yawCurve[frame]);
twisted.copy(rootInv).multiply(hipWorld[frame]).normalize();
```

## The game side

`TURN180` in `world.js`:

| Key | Value | Meaning |
| --- | --- | --- |
| `animScale` | 1.0 | Playback rate; live through `PortfolioWorld.sprint({ turn180Anim })` |
| `blendIn` | 0.08 s | Sprint pose → clip |
| `blendOut` | 0.14 s | Clip's last frame → sprint, starts when the clip ends |
| `carryUntil` | 0.3 | Entry speed surplus is gone by frame 12, before the right foot plants at 13 |
| `yawCurve`, `root`, `apex` | from the JSON | Root yaw, root travel, travel-direction flip |

`TurnLoco.start`: start direction = travel direction (or the reverse-commit direction); root yaw synced to it; `turn180Scale` = armature world scale; `turn180Carry` = `clamp(speed − authored entry speed, −4, 4)`; capture the live pose and start the "in" bridge.

`TurnLoco.step`, the whole of the motion:

```js
const from = this.sampleRoot(prevNorm, this._rootA);
const to = this.sampleRoot(turnNorm, this._rootB);
const dir = state.turn180StartDir;
const forward = (to.x - from.x) * state.turn180Scale + this.carryDist(turnNorm) - this.carryDist(prevNorm);
const left = (to.y - from.y) * state.turn180Scale;
robot.position.x += dir.x * forward + dir.z * left;      // left of (x, z) is (z, -x)
robot.position.z += dir.z * forward - dir.x * left;
const span = (turnNorm - prevNorm) * turnDur;
if (span > 1e-5) state.speedMeter = Math.hypot(forward, left) / span;
state.moveDir.copy(turnNorm < TURN180.apex ? dir : state.turn180TargetDir);
const yaw = wrapYaw(state.turn180StartYaw + state.turn180YawDelta * this.sampleYaw(turnNorm));
robot.rotation.y = yaw;
state.yaw = yaw;
```

At the end of the clip: yaw set to exactly start ± π, speed set to the authored exit speed (about 4.1), `state.sprintHold` on while Shift is held, `poseInertia.captureClip(turnClip, turnClip.duration)`, sprint phase from `matchSprintPhase`, `poseInertia.play("out", TURN180.blendOut)`.

In the mixer block the clip time uses the same clock: `actions.turn180.time = (turn180Timer / turn180Dur) × clipDuration`.

## Verified result

`node .impeccable/tools/verify-turn-180.mjs` (warm-up lap, then a recorded turn):

| Measure | Result |
| --- | --- |
| Clip duration / wall time | 0.667 s / 0.667 s |
| Root yaw at clip end | −180.0° |
| Largest per-frame body heading step at and after the handoff | 4.0° |
| Body heading in the 0.3 s after the clip | −181° to −212°, measured from the last sprint frame before the turn, which itself carries up to 17° of sprint twist |
| Planted foot drift, game vs source | Right 0.29–0.34 vs 0.31; left 0.04–0.06 vs 0.06 world units |
| Gait two frames after the clip | Sprint 1.00, jog 0.00, speed about 5 and rising |

Still in the clip itself, and reported to the user as such:

- The chest is about 35° short of fully turned on the last frame and finishes during the 0.14 s blend, in the turn's own direction. A few more authored frames would remove it.
- Niko leaves at the clip's push-off speed (about 4.1) and is back above 9 about 0.2 s later.

Not covered by the check: releasing Shift or every key in the middle of the turn, and turning next to walls.

## Follow-up: "a bug when the direction is vertical against the camera"

The root yaw, travel and duration in the user's `log-report` were identical in all four directions, so the clip playback was not the cause. The INPUT lines were: every A↔D turn overlapped the keys; every W↔S turn had the first key released 43–158 ms before the other went down (same finger).

During that gap Niko is in the stop skid and the speed meter falls below the 180's 7 m/s gate within about 45 ms. The old gate rejected the key as "slow", normal movement started the new way, and when the meter climbed back over 7 inside the 0.16 s reverse-commit window the turn fired from the old facing. `verify-turn-180-gap.mjs` on the old build, 60 ms gap: 0.20–0.27 units run the new way, facing 64–80° off, then a 64–80° snap back, turn 35–49 ms late. Gaps of 100 ms and more gave no turn at all. Same numbers in all four directions.

Fix in `TurnLoco`:

- `releasedFromSprint()`: commit window live, in the stop skid, and the skid began at 7 m/s or more. Then the speed and sprint-gait gates are skipped, so the opposite key starts the turn on the frame it goes down.
- The turn joins the clip as many frames in as the key was up (`joinMax` frame 12; the body starts turning at 14), because the skid has already done that much of the braking.
- Entry speed is what the root is really doing (`STOP_SKID` 0.48 × meter). The difference to the authored speed fades straight to zero by frame 15 (`joinCarryUntil`; a foot plants at 16).
- Starting to move again after a stop sets `turn180CommitT = 0`, so a turn can never fire after he has set off the new way.

Result, all four direction pairs, gaps 0–140 ms: turn starts 5–10 ms after the key, 0.00 units run the new way, facing step 0.0–0.5°, root turn 180°, planted foot drift unchanged (0.30 / 0.06). A 200 ms gap gives no turn (stop, then jog off), as designed.

Still visible and inherent: out of a long gap the skid has almost stopped him (about 1–2 units/s), and the clip's run-in then takes him back up to about 5.5 before the plant, over 0.9–1.2 units.
