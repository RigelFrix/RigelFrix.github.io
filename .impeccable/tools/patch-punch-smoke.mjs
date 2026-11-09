import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const worldPath = path.join(root, "world.js");

let content = fs.readFileSync(worldPath, "utf8");

// 1. Import
const importTarget = 'import { createSmearHandler } from "./world-smear.js";\r\nimport { buildDevMap } from "./world-dev-map.js";';
const importRepl = 'import { createSmearHandler } from "./world-smear.js";\r\nimport { createPunchSmoke } from "./world-punch-smoke.js";\r\nimport { buildDevMap } from "./world-dev-map.js";';

if (!content.includes(importRepl)) {
  if (content.includes(importTarget)) {
    content = content.replace(importTarget, importRepl);
    console.log("Patched import");
  } else {
    console.error("Failed to find importTarget");
  }
}

// 2. Instantiation
const smearTarget = '  const nikoSmear = createSmearHandler({\r\n    weight: 6.8,\r\n    noiseScale: 30.0,\r\n    noisePower: 2.3,\r\n    stretch: 1.65,\r\n    sheenColor: "#ffe17d",\r\n  });';
const smearRepl = '  const nikoSmear = createSmearHandler({\r\n    weight: 6.8,\r\n    noiseScale: 30.0,\r\n    noisePower: 2.3,\r\n    stretch: 1.65,\r\n    sheenColor: "#ffe17d",\r\n  });\r\n\r\n  /* Niko Saitama-style fist vapor & smoke VFX */\r\n  const nikoPunchSmoke = createPunchSmoke({ scene, robot });';

if (!content.includes(smearRepl)) {
  if (content.includes(smearTarget)) {
    content = content.replace(smearTarget, smearRepl);
    console.log("Patched instantiation");
  } else {
    console.error("Failed to find smearTarget");
  }
}

// 3. triggerPunch and triggerOnePunch hide
const triggerPunchTarget = '    state.punchHitboxActive = false;\r\n    punchHitbox.active = false;\r\n    punchHitbox.frame = -1;\r\n    state.path = [];\r\n    state.pending = null;\r\n    bot.actions.punch.reset();';
const triggerPunchRepl = '    state.punchHitboxActive = false;\r\n    punchHitbox.active = false;\r\n    punchHitbox.frame = -1;\r\n    nikoPunchSmoke.hide();\r\n    state.path = [];\r\n    state.pending = null;\r\n    bot.actions.punch.reset();';

if (!content.includes(triggerPunchRepl)) {
  if (content.includes(triggerPunchTarget)) {
    content = content.replace(triggerPunchTarget, triggerPunchRepl);
    console.log("Patched triggerPunch hide");
  } else {
    console.error("Failed to find triggerPunchTarget");
  }
}

const triggerOnePunchTarget = '    state.punchHitboxActive = false;\r\n    punchHitbox.active = false;\r\n    punchHitbox.frame = -1;\r\n    state.path = [];\r\n    state.pending = null;\r\n    bot.actions.onePunch.reset();';
const triggerOnePunchRepl = '    state.punchHitboxActive = false;\r\n    punchHitbox.active = false;\r\n    punchHitbox.frame = -1;\r\n    nikoPunchSmoke.hide();\r\n    state.path = [];\r\n    state.pending = null;\r\n    bot.actions.onePunch.reset();';

if (!content.includes(triggerOnePunchRepl)) {
  if (content.includes(triggerOnePunchTarget)) {
    content = content.replace(triggerOnePunchTarget, triggerOnePunchRepl);
    console.log("Patched triggerOnePunch hide");
  } else {
    console.error("Failed to find triggerOnePunchTarget");
  }
}

// 4. One Punch update loop
const onePunchSmearTarget = '            nikoSmear.stepLag(dt, 7.5, smearScale, 1.0); // 1.0 = Right arm\r\n          } else {\r\n            nikoSmear.reset();\r\n          }';
const onePunchSmearRepl = '            nikoSmear.stepLag(dt, 7.5, smearScale, 1.0); // 1.0 = Right arm\r\n          } else {\r\n            nikoSmear.reset();\r\n          }\r\n\r\n          // Saitama Anime Smoke & Vapor ejecting from Right Hand on impact (frames 16-20):\r\n          nikoPunchSmoke.update(punchFrame, bot.bones?.RightHand, punchHitbox, dt, robot, "onePunch");';

if (!content.includes(onePunchSmearRepl)) {
  if (content.includes(onePunchSmearTarget)) {
    content = content.replace(onePunchSmearTarget, onePunchSmearRepl);
    console.log("Patched onePunch update loop");
  } else {
    console.error("Failed to find onePunchSmearTarget");
  }
}

// 5. Combo Punch update loop
const comboPunchSmearTarget = '            nikoSmear.stepLag(dt, 7.5, smearScale, -1.0);\r\n          } else {\r\n            nikoSmear.reset();\r\n          }';
const comboPunchSmearRepl = '            nikoSmear.stepLag(dt, 7.5, smearScale, -1.0);\r\n          } else {\r\n            nikoSmear.reset();\r\n          }\r\n\r\n          // Saitama Anime Smoke & Vapor ejecting from Left Hand on impact (frames 37-40):\r\n          nikoPunchSmoke.update(punchFrame, bot.bones?.LeftHand, punchHitbox, dt, robot, "flyingKnee");';

if (!content.includes(comboPunchSmearRepl)) {
  if (content.includes(comboPunchSmearTarget)) {
    content = content.replace(comboPunchSmearTarget, comboPunchSmearRepl);
    console.log("Patched comboPunch update loop");
  } else {
    console.error("Failed to find comboPunchSmearTarget");
  }
}

// 6. Not punching fallback
const notPunchingTarget = '        state.punchHitboxActive = false;\r\n        punchHitbox.active = false;\r\n        punchHitbox.frame = -1;\r\n        nikoSmear.reset();\r\n      }\r\n      const locked = lockTarget && bot.lockMoves;';
const notPunchingRepl = '        state.punchHitboxActive = false;\r\n        punchHitbox.active = false;\r\n        punchHitbox.frame = -1;\r\n        nikoSmear.reset();\r\n        nikoPunchSmoke.update(-1, null, null, dt, robot);\r\n      }\r\n      const locked = lockTarget && bot.lockMoves;';

if (!content.includes(notPunchingRepl)) {
  if (content.includes(notPunchingTarget)) {
    content = content.replace(notPunchingTarget, notPunchingRepl);
    console.log("Patched not punching fallback");
  } else {
    console.error("Failed to find notPunchingTarget");
  }
}

// 7. Debug API
const debugSmokeTarget = '      punchSmoke: () => ({\r\n        active: false,\r\n        puffCount: 0,\r\n      }),';
const debugSmokeRepl = `      punchSmoke: () => ({
        active: nikoPunchSmoke.isActive(),
        puffCount: nikoPunchSmoke.getPuffCount(),
        spawn: (type = "onePunch") => {
          const hand = type === "onePunch" ? bot.bones?.RightHand : bot.bones?.LeftHand;
          const pos = new THREE.Vector3();
          if (hand) hand.getWorldPosition(pos);
          else pos.copy(robot.position).add(new THREE.Vector3(0, 1.2, 0.5));
          const yaw = robot.rotation.y;
          const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).normalize();
          nikoPunchSmoke.spawnBurst(pos, fwd, type === "onePunch" ? 1.0 : -1.0);
        },
      }),`.replace(/\n/g, "\r\n");

if (!content.includes("spawn: (type = \"onePunch\")")) {
  if (content.includes(debugSmokeTarget)) {
    content = content.replace(debugSmokeTarget, debugSmokeRepl);
    console.log("Patched debug API");
  } else {
    console.error("Failed to find debugSmokeTarget");
  }
}

fs.writeFileSync(worldPath, content, "utf8");
console.log("world.js updated successfully.");
