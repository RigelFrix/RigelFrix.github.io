import fs from "fs";

let s = fs.readFileSync(".cursor/rules/core-memory.mdc", "utf8");
const target = "Verified with `.impeccable/tools/verify-hitbox.mjs` and `.impeccable/tools/verify-niko-smear.mjs`.";
const addition = " Linear Wind Core (speed line along punch trajectory) is implemented in `world-wind-core.js`: 3D cross-blade needle spear plus companion cavitation streaks, driven directly by `nikoSmear.getHandMotion()` (throw vector `P_curr - P_lag` and opposite wake vector `P_lag - P_curr`) to guarantee the speed lines trail in the opposite direction from where the hand is thrown and pierce straight forward into the strike target.";

if (s.includes(target)) {
  s = s.replace(target, target + " " + addition);
  s = s.replace(/\r?\n/g, "\r\n");
  fs.writeFileSync(".cursor/rules/core-memory.mdc", s, "utf8");
  console.log("Updated core-memory.mdc successfully");
} else {
  console.log("Target not found");
}
