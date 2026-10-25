/* Pull the Mixamo quaternion curves out of Pixel Pass's lock-on .anim files.
   Writes assets/niko/lockon.json for world.js to retarget onto Niko. */
import fs from "node:fs";

const dir = "C:/Users/Rigel/Documents/PersonalGitHub/Pixel_Pass/Assets/Characters";
const named = [
  ["walkF", "Walking (1).anim", "walk", 0, 1],
  ["walkB", "Walking Backwards.anim", "walk", 0, -1],
  ["walkL", "Left Strafe Walking.anim", "walk", -1, 0],
  ["walkR", "Right Strafe Walking.anim", "walk", 1, 0],
  ["walkFL", "Jog Forward Diagonal.anim", "walk", -0.7071067, 0.7071067],
  ["walkFR", "Jog Forward Diagonal (1).anim", "walk", 0.7071067, 0.7071067],
  ["walkBL", "Jog Backward Diagonal.anim", "walk", -0.7071067, -0.7071067],
  ["walkBR", "Jog Backward Diagonal (1).anim", "walk", 0.7071067, -0.7071067],
  ["runF", "Running.anim", "run", 0, 1],
  ["runB", "Running Backward.anim", "run", 0, -1],
  ["runL", "Left Strafe Run.anim", "run", -1, 0],
  ["runR", "Right Strafe Run.anim", "run", 1, 0],
];

const parse = (file) => {
  const text = fs.readFileSync(`${dir}/${file}`, "utf8").replace(/\r\n/g, "\n");
  const duration = Number(text.match(/m_StopTime: ([0-9.eE+-]+)/)[1]);
  const section = (start, end) => text.slice(text.indexOf(start), text.indexOf(end));
  const curves = (chunk) => chunk.split("\n  - curve:").slice(1).map((block) => {
    const path = (block.match(/\n    path: (.+)/) || [])[1]?.trim();
    const keys = [];
    const re = /time: ([0-9.eE+-]+)\n        value: \{([^}]+)\}/g;
    let match;
    while ((match = re.exec(block))) {
      const value = Object.fromEntries(match[2].split(",").map((part) => part.trim().split(":").map((s) => s.trim())).map(([k, v]) => [k, Number(v)]));
      keys.push({ t: Number(match[1]), value });
    }
    return { path, keys };
  }).filter((curve) => curve.path && curve.keys.length);
  const rotations = curves(section("m_RotationCurves:", "m_CompressedRotationCurves:"));
  const positions = curves(section("m_PositionCurves:", "m_ScaleCurves:"));
  return { duration, rotations, positions };
};

const round = (n) => Math.round(n * 10000) / 10000;
const boneOf = (path) => path.split("/").pop().replace(/^mixamorig:/, "");
const parentOf = (path) => {
  const parts = path.split("/");
  if (parts.length < 2) return null;
  return parts[parts.length - 2].replace(/^mixamorig:/, "");
};

const clips = named.map(([name, file, gait, x, y]) => {
  const anim = parse(file);
  const bones = anim.rotations.map((curve) => {
    const pos = curve.path.endsWith("mixamorig:Hips") ? anim.positions.find((item) => item.path === curve.path) : null;
    return {
      name: boneOf(curve.path),
      parent: parentOf(curve.path),
      times: curve.keys.map((key) => round(key.t)),
      q: curve.keys.flatMap((key) => [round(key.value.x), round(key.value.y), round(key.value.z), round(key.value.w)]),
      ...(pos ? { posTimes: pos.keys.map((key) => round(key.t)), pos: pos.keys.flatMap((key) => [round(key.value.x), round(key.value.y), round(key.value.z)]) } : {}),
    };
  });
  const hips = bones.find((bone) => bone.name === "Hips");
  const travel = hips?.pos ? [hips.pos.at(-3) - hips.pos[0], hips.pos.at(-1) - hips.pos[2]] : [0, 0];
  return { name, gait, x, y, duration: round(anim.duration), travel: travel.map(round), bones };
});

const out = "assets/niko/lockon.json";
fs.writeFileSync(out, JSON.stringify({ clips }));
const bytes = fs.statSync(out).size;
console.log(clips.map((clip) => `${clip.name} ${clip.gait} (${clip.x},${clip.y}) travel ${clip.travel.join(",")} bones ${clip.bones.length}`).join("\n"));
console.log(`wrote ${out} ${(bytes / 1024).toFixed(0)} KB`);
