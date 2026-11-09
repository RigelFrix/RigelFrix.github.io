import fs from "node:fs";

let content = fs.readFileSync(".cursor/rules/core-memory.mdc", "utf8");

const target = `  - Sprint Stop Braking (\`c:/Users/Rigel/Desktop/Cascadeur/running+stopping.fbx\` -> \`assets/niko/stop.json\`, 65 bones, 0.4833s). Abrupt emergency brake / friction slide (~0.49m displacement over 0.28s) into idle.
  - Sprint Slowdown Run-Out (\`assets/niko/slowdown.json\`, 65 deform bones, 0.70s / 42 frames @ 60fps). Athletic 2-stride deceleration easing forward momentum (braking stride -> catch step -> bilateral settle, ~1.27m displacement over 0.62s) with zero-pop boundary dot product 0.9999 into idle. Selectable live via \`PortfolioWorld.debug.stopStyle("slowdown" | "abrupt")\` or URL parameter \`?stop=slowdown|abrupt\` (default: \`slowdown\`).`.replace(/\n/g, "\r\n");

const repl = `  - Sprint Stop Braking (\`c:/Users/Rigel/Desktop/Cascadeur/running+stopping.fbx\` -> \`assets/niko/stop.json\`, 65 bones, 0.4833s). Triggers strictly when stopping from sprint mode (\`Shift + WASD\`), skid-decelerating with quadratic momentum over 0.28s, then crossfading seamlessly into idle; immediately interruptible by WASD input. Code cleaned and refactored with unified \`evalClipTime\` helper.`.replace(/\n/g, "\r\n");

if (content.includes(target)) {
  content = content.replace(target, repl);
  fs.writeFileSync(".cursor/rules/core-memory.mdc", content, "utf8");
  console.log("Updated core-memory.mdc");
} else {
  console.error("Target not found");
}
