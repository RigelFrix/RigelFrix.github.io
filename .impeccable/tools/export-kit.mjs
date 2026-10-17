/* node .impeccable/tools/export-kit.mjs  — writes assets/kit/*.glb */
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const vendor = path.join(root, "vendor/three");
const outfile = path.join(here, ".kit-run.mjs");

await build({
  entryPoints: [path.join(here, "kit-main.js")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2022",
  plugins: [
    {
      name: "vendored-three",
      setup(b) {
        b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(vendor, "three.module.min.js") }));
        b.onResolve({ filter: /^three\/addons\// }, (args) => ({
          path: path.join(vendor, "addons", args.path.slice("three/addons/".length)),
        }));
      },
    },
  ],
  logLevel: "info",
});

const run = spawnSync(process.execPath, [outfile], { cwd: root, stdio: "inherit" });
fs.rmSync(outfile, { force: true });
process.exit(run.status ?? 1);
