import fs from "node:fs";
import { execSync } from "node:child_process";

const sources = ["index.html", "styles.css", "script.js", "motion.js", "gallery-data.js", "world-data.js",
  "world.js", "world-island.js", "world-map.js", "world-wind.js", "world.bundle.js"];
const text = sources.filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n");
const variants = (p) => [p, encodeURI(p), p.replace(/^assets\//, "")];

const files = execSync("git ls-files assets", { encoding: "utf8" }).trim().split("\n");
let total = 0;
for (const f of files) {
  const name = f.split("/").pop();
  if (variants(f).some((v) => text.includes(v)) || text.includes(name)) continue;
  const mb = fs.existsSync(f) ? fs.statSync(f).size / 1048576 : 0;
  total += mb;
  console.log(mb.toFixed(2).padStart(7), "MB ", f);
}
console.log("unused total", total.toFixed(1), "MB");
