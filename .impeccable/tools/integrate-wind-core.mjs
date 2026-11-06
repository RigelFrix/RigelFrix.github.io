import fs from "fs";

let content = fs.readFileSync("world.js", "utf8");

// Ensure import exists
if (!content.includes('import { createWindCore } from "./world-wind-core.js";')) {
  content = content.replace(
    'import { createSmearHandler } from "./world-smear.js";',
    'import { createSmearHandler } from "./world-smear.js";\r\nimport { createWindCore } from "./world-wind-core.js";'
  );
}

// 1. Instantiate nikoWindCore after nikoSmear
const smearTarget = `  const nikoSmear = createSmearHandler({
    weight: 6.8,
    noiseScale: 30.0,
    noisePower: 2.3,
    stretch: 1.65,
    sheenColor: "#ffe17d",
  });`;

const smearReplacement = `  const nikoSmear = createSmearHandler({
    weight: 6.8,
    noiseScale: 30.0,
    noisePower: 2.3,
    stretch: 1.65,
    sheenColor: "#ffe17d",
  });

  /* Niko left forearm linear wind core (speed line along punch trajectory) */
  const nikoWindCore = createWindCore({ scene });`;

content = content.replace(smearTarget.replace(/\r?\n/g, "\r\n"), smearReplacement.replace(/\r?\n/g, "\r\n"));

// 2. nikoWindCore.hide() in triggerPunch
const triggerTarget = `    punchHitbox.active = false;
    punchHitbox.frame = -1;
    state.path = [];`;

const triggerReplacement = `    punchHitbox.active = false;
    punchHitbox.frame = -1;
    nikoWindCore.hide();
    state.path = [];`;

content = content.replace(triggerTarget.replace(/\r?\n/g, "\r\n"), triggerReplacement.replace(/\r?\n/g, "\r\n"));

// 3. Update nikoWindCore in punch frame loop
const loopTarget = `        // Full arm smear effect on Niko's left arm when swinging at frames 33-42:
        const smearActive = punchFrame >= 33 && punchFrame <= 42;
        if (smearActive) {
          let smearScale = 1.0;
          if (punchFrame < 36) {
            smearScale = THREE.MathUtils.clamp((punchFrame - 33) / 3.0, 0.4, 1.0);
          } else if (punchFrame > 40) {
            smearScale = THREE.MathUtils.clamp((42 - punchFrame) / 2.0, 0.3, 1.0);
          }
          nikoSmear.stepLag(dt, 7.5, smearScale, -1.0);
        } else {
          nikoSmear.reset();
        }`;

const loopReplacement = `        // Full arm smear effect on Niko's left arm when swinging at frames 33-42:
        const smearActive = punchFrame >= 33 && punchFrame <= 42;
        if (smearActive) {
          let smearScale = 1.0;
          if (punchFrame < 36) {
            smearScale = THREE.MathUtils.clamp((punchFrame - 33) / 3.0, 0.4, 1.0);
          } else if (punchFrame > 40) {
            smearScale = THREE.MathUtils.clamp((42 - punchFrame) / 2.0, 0.3, 1.0);
          }
          nikoSmear.stepLag(dt, 7.5, smearScale, -1.0);
        } else {
          nikoSmear.reset();
        }

        // Linear Wind Core along Niko's left forearm (speed line along punch trajectory):
        if (punchFrame >= 33 && punchFrame <= 42 && bot.bones?.LeftForeArm && bot.bones?.LeftHand) {
          nikoWindCore.update(punchFrame, bot.bones.LeftForeArm, bot.bones.LeftHand, dt);
        } else {
          nikoWindCore.hide();
        }`;

content = content.replace(loopTarget.replace(/\r?\n/g, "\r\n"), loopReplacement.replace(/\r?\n/g, "\r\n"));

// 4. nikoWindCore.hide() on punch completion
const durTarget = `          if (state.punchTimer >= dur) {
            state.punching = false;
            state.punchTimer = 0;
            state.punchHitboxActive = false;
            punchHitbox.active = false;
            punchHitbox.frame = -1;
            nikoSmear.reset();
            actions.punch.setEffectiveWeight(0);`;

const durReplacement = `          if (state.punchTimer >= dur) {
            state.punching = false;
            state.punchTimer = 0;
            state.punchHitboxActive = false;
            punchHitbox.active = false;
            punchHitbox.frame = -1;
            nikoSmear.reset();
            nikoWindCore.hide();
            actions.punch.setEffectiveWeight(0);`;

content = content.replace(durTarget.replace(/\r?\n/g, "\r\n"), durReplacement.replace(/\r?\n/g, "\r\n"));

// 5. nikoWindCore.hide() when punch action is not punching
const stopTarget = `      } else if (actions.punch) {
        actions.punch.setEffectiveWeight(0);
        state.punchHitboxActive = false;
        punchHitbox.active = false;
        punchHitbox.frame = -1;
        nikoSmear.reset();
      }`;

const stopReplacement = `      } else if (actions.punch) {
        actions.punch.setEffectiveWeight(0);
        state.punchHitboxActive = false;
        punchHitbox.active = false;
        punchHitbox.frame = -1;
        nikoSmear.reset();
        nikoWindCore.hide();
      }`;

content = content.replace(stopTarget.replace(/\r?\n/g, "\r\n"), stopReplacement.replace(/\r?\n/g, "\r\n"));

// 6. Debug export
const debugTarget = `      nikoSmear: () => ({
        lagDistance: nikoSmear.getLagDistance(),
        active: nikoSmear.uniforms.uSmearStretch.value > 0,
        stretch: +nikoSmear.uniforms.uSmearStretch.value.toFixed(3),
        armSide: nikoSmear.uniforms.uSmearArmSide.value,
      }),`;

const debugReplacement = `      nikoSmear: () => ({
        lagDistance: nikoSmear.getLagDistance(),
        active: nikoSmear.uniforms.uSmearStretch.value > 0,
        stretch: +nikoSmear.uniforms.uSmearStretch.value.toFixed(3),
        armSide: nikoSmear.uniforms.uSmearArmSide.value,
      }),
      windCore: () => ({
        active: nikoWindCore.isActive(),
        visible: nikoWindCore.mesh.visible,
        position: nikoWindCore.mesh.position.toArray(),
        scale: nikoWindCore.mesh.scale.toArray(),
      }),`;

content = content.replace(debugTarget.replace(/\r?\n/g, "\r\n"), debugReplacement.replace(/\r?\n/g, "\r\n"));

// Normalize all line endings to CRLF
content = content.replace(/\r?\n/g, "\r\n");

fs.writeFileSync("world.js", content, "utf8");
console.log("Successfully updated world.js with Linear Wind Core effect and CRLF!");

