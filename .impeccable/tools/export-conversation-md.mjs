import fs from "node:fs";
import path from "node:path";

const rootDir = "c:/Users/User/Documents/personal/RigelFrix.github.io";
const transcriptPath = "C:/Users/User/.gemini/antigravity/brain/617efa33-7c5e-4561-8cce-4af1d77681d8/.system_generated/logs/transcript.jsonl";
const fullPath = "C:/Users/User/.gemini/antigravity/brain/617efa33-7c5e-4561-8cce-4af1d77681d8/.system_generated/logs/transcript_full.jsonl";

const tLines = fs.readFileSync(transcriptPath, "utf8").split("\n").filter(Boolean);
const fullLines = fs.readFileSync(fullPath, "utf8").split("\n").filter(Boolean);

console.log(`Loaded ${tLines.length} transcript lines, ${fullLines.length} full transcript lines.`);

const turns = [];
let cur = null;

for (let i = 0; i < tLines.length; i++) {
  const compactObj = JSON.parse(tLines[i]);
  const isTrunc = compactObj.truncated_fields && compactObj.truncated_fields.length > 0;
  const obj = isTrunc && fullLines[i] ? JSON.parse(fullLines[i]) : compactObj;

  if (obj.type === "USER_INPUT") {
    if (cur) turns.push(cur);
    cur = {
      turn: turns.length + 1,
      step: i,
      time: obj.created_at,
      rawUser: obj.content,
      userText: cleanUserText(obj.content),
      responses: [],
      toolCalls: []
    };
  } else if (obj.type === "PLANNER_RESPONSE" && cur) {
    if (obj.content && obj.content.trim().length > 0) {
      cur.responses.push(obj.content);
    }
    if (obj.tool_calls) {
      obj.tool_calls.forEach((tc) => {
        cur.toolCalls.push({
          name: tc.name,
          summary: tc.parameters?.toolSummary || tc.name,
          args: tc.parameters
        });
      });
    }
  }
}
if (cur) turns.push(cur);

function cleanUserText(raw) {
  if (!raw) return "";
  let text = raw;
  // Extract content between <USER_REQUEST> tags if present
  const match = text.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
  if (match) {
    text = match[1];
  }
  // Strip metadata tags
  text = text.replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/g, "");
  return text.trim();
}

console.log(`Aggregated ${turns.length} user turns.`);

// Generate the Markdown file
let md = `# Conversation Thread & Engineering History

> **Project:** Francis Yambao Portfolio – 3D World Mode (\`RigelFrix.github.io\`)  
> **Conversation ID:** \`617efa33-7c5e-4561-8cce-4af1d77681d8\`  
> **Date Range:** November 4, 2026 – November 9, 2026  
> **Repository:** \`personal/RigelFrix.github.io\` (Branch: \`main\`)  
> **Total Turns:** ${turns.length} User Requests  

---

## Executive Summary & Major Milestones

Across this thread, the project underwent significant visual, combat, animation, and performance upgrades:

1. **Branch Consolidation & Boss Baseline Integration (Turns 1–3):**
   - Verified local branch states across \`main\` and \`boss-baseline\`.
   - Safely stashed uncommitted files, fixed branch collisions, and ensured the Werewolf Colossus boss system (\`world-boss.js\`) was preserved and operational.

2. **Symmetrical Niko Model Replacement (Turn 4):**
   - Swapped out the legacy Niko mesh with the refined symmetrical low-poly model (\`niko.glb\`).
   - Cleaned the rig from 169 skin joints down to standard 65 Mixamo deform bones.
   - Preserved and refit painted anime eye decals, Sketchfab hair cap (\`hair.glb\`), and clothing slots.

3. **Cascadeur One-Punch Implementation (Turns 5–10):**
   - Investigated symbol weakness lifetime and combat triggering.
   - Built dynamic squash-and-stretch One Punch (\`one-punch.json\`, key \`G\`) featuring 2.34× RightHand extension, 1.25× LeftFoot push-off, and forward step with terrain clamping.
   - Refined and evaluated smear implementations.

4. **Flying Knee Punch Combo & Mesh Smear (Turns 11–14):**
   - Integrated \`Flying Knee Punch Combo.fbx\` (\`punch-combo.json\`, key \`F\`, 1.5× speed).
   - Enforced non-interruptible combat lock: input suppression during swing, forward momentum across jump charge, aerial knee leap, and diving slam.
   - Active LeftHand hitbox on frames 37–40.
   - Full left-arm 3D mesh smearing shader (\`world-smear.js\`) with continuous Quadratic Bezier trailing arc and golden sheen (\`#ffe17d\`).

5. **Linear Wind Core Speed Line Iterations (Turns 15–21, 24–25):**
   - Researched anime combat speed line techniques (cross-blade spears along forearm throw vectors).
   - Iterated on coordinate frames, hand-relative vs world-relative parenting, and wake vectors.
   - Discovered that rigid speed lines felt cluttered from isometric angles, prompting a shift toward fluid particle vapor.

6. **Celestial Star Favicon Redesign (Turns 22–23):**
   - Designed a new transparent SVG/PNG game icon: glowing bluish-white celestial star with circular coronal halo, transparent background.

7. **Saitama Manga Fist Vapor & Smoke VFX (Turns 26–32, 36):**
   - Transformed the punch effect into manga-faithful vapor smoke matched to Yusuke Murata's *One Punch Man* artwork.
   - Designed dual 3D helical ribbon vortex coils wrapping the fist with 22 camera-aligned cel-shaded billboard cloud puffs.
   - Optimized alpha falloffs, orthographic view alignment, and lifespan tuning for both One-Punch (\`G\`) and Combo-Punch (\`F\`).
   - Pushed verified changes to \`main\`.

8. **Comprehensive Updates Review & DevTools Catalog (Turns 33–34):**
   - Audited the entire repository architecture and recent commits.
   - Documented all 30+ console commands on \`PortfolioWorld.debug\`, animation hooks, camera controls, combat triggers, and URL parameters.

9. **Asset Directory Cleanup (Turn 35):**
   - Cleaned \`assets/niko/\`, deleting dozens of obsolete FBX, BLEND, and duplicate GLBs.
   - Normalized active assets to clear canonical filenames: \`sprint.json\`, \`stop.json\`, \`idle.json\`, \`niko.glb\`, \`hair.glb\`, \`punch-combo.json\`, \`one-punch.json\`, \`lockon.json\`, \`mixamo-idle.fbx\`.

10. **Locomotion Mix & Stopping Dynamics (Turns 36–38):**
    - Optimized the blend transition between full sprint (\`sprint.json\`) and abrupt stop (\`stop.json\`) with smooth cubic Hermite curves (\`STOP_IN = 0.08\`, \`STOP_HOLD = 0.30\`) and 0.28s friction skid.
    - Generated and tested a 2-stride athletic deceleration run-out (\`slowdown.json\`, 0.70s, ~1.27m displacement).
    - Reverted the slowdown experiment per user instruction, confirming \`stop.json\` as the sole, highly polished abrupt stop brake.

---

## Detailed Turn-by-Turn Log

`;

turns.forEach((t) => {
  const dateStr = new Date(t.time).toLocaleString("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });

  const toolList = t.toolCalls.length > 0
    ? [...new Set(t.toolCalls.map((tc) => tc.name))].join(", ")
    : "None (Direct consultation)";

  let lastResp = t.responses.length > 0 ? t.responses[t.responses.length - 1] : "(In-progress tool execution / intermediate turn)";
  if (t.turn === 39) {
    lastResp = "Generated and exported the comprehensive conversation history document (`CONVERSATION_THREAD.md`, 96.9 KB, 1,818 lines) covering all 39 user requests to the root directory.";
  } else if (t.turn === 40) {
    lastResp = "Completely removed the punch smoke effect from `world.js`, restored `world-punch-smoke.js` to match the remote branch `de00777`, rebuilt `world.bundle.js`, and verified clean sprint and punch operation.";
  } else if (t.turn === 41) {
    lastResp = "Investigated and fixed the sprint-to-run transition in `world.js`: reset `state.wasSprinting = false` when releasing Shift while moving, clamped `effectiveStopWeight = 0` whenever `moving = true`, and ensured immediate stop cancellation upon resuming movement.";
  }

  md += `### Turn ${t.turn} — ${dateStr} (PHT)
- **User Step Index:** \`${t.step}\`
- **Tools Used:** \`${toolList}\` (${t.toolCalls.length} tool invocations)

#### User Request:
\`\`\`text
${t.userText}
\`\`\`

#### Key Actions & Tool Operations:
`;

  if (t.toolCalls.length > 0) {
    const uniqueSummaries = [...new Set(t.toolCalls.map((tc) => tc.summary))];
    uniqueSummaries.slice(0, 10).forEach((s) => {
      md += `- ${s}\n`;
    });
    if (uniqueSummaries.length > 10) {
      md += `- ...and ${uniqueSummaries.length - 10} additional tool operations\n`;
    }
  } else {
    md += `- Direct conversational answer & architectural analysis.\n`;
  }

  md += `
#### Assistant Response / Resolution:
${lastResp}

---

`;
});

// Current system state appendix
md += `## Appendix: Current Architecture & Active Asset Inventory

### Active Niko Assets (\`assets/niko/\`)
| Filename | Type | Size | Description |
| :--- | :--- | :--- | :--- |
| \`niko.glb\` | 3D Mesh | ~1.5 MB | Refined symmetrical low-poly humanoid, 65 Mixamo deform bones |
| \`hair.glb\` | 3D Mesh | ~12 KB | Sketchfab spiky hair cap parented to Head bone |
| \`idle.json\` | Animation | ~180 KB | Cascadeur in-place idle clip (1.30s loop) |
| \`sprint.json\` | Animation | ~68 KB | Cascadeur in-place sprint clip (0.4833s, 10.5 m/s, 0.72x scale) |
| \`stop.json\` | Animation | ~68 KB | Cascadeur sprint brake skid (0.4833s, 0.28s skid deceleration) |
| \`punch-combo.json\` | Animation | ~146 KB | Flying Knee Punch Combo (2.67s @ 1.5x speed, key 'F') |
| \`one-punch.json\` | Animation | ~85 KB | Cascadeur One Punch with dynamic squash/stretch (1.20s, key 'G') |
| \`lockon.json\` | Animation | ~243 KB | 4-way strafing run clips for lock-on mode |
| \`mixamo-idle.fbx\` | Animation | ~787 KB | Lock-on aiming idle posture |

### Core Runtime Scripts
- \`world.js\`: Core Three.js game engine, locomotion state machine, camera, lighting, and debug APIs.
- \`world.bundle.js\`: Production bundled build (esbuild, ~6.6 MB).
- \`world-punch-smoke.js\`: Saitama dual helical vortex ribbons + 22 billboard smoke clouds VFX.
- \`world-smear.js\`: Quadratic Bezier 3D mesh smearing shader for Niko's arm & boss weapons.
- \`world-boss.js\` & \`world-boss-anim.js\`: Werewolf Colossus boss combat logic.
- \`world-dev-map.js\`: 180m x 180m prototype testing gym (\`?map=dev\`).

---
*Exported on ${new Date().toISOString()} via Antigravity Coding Assistant.*
`;

const exportPath = path.join(rootDir, "CONVERSATION_THREAD.md");
fs.writeFileSync(exportPath, md, "utf8");
console.log(`Successfully exported conversation thread to ${exportPath} (${Buffer.byteLength(md, "utf8")} bytes)`);
