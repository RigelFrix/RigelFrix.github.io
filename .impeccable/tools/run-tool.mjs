import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const vendor = path.join(root, "vendor/three");

const vendoredThree = {
  name: "vendored-three",
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(vendor, "three.module.min.js") }));
    b.onResolve({ filter: /^three\/addons\// }, (args) => ({
      path: path.join(vendor, "addons", args.path.slice("three/addons/".length)),
    }));
  },
};

const script = process.argv[2];
if (!script) {
  console.error("Usage: node .impeccable/tools/run-tool.mjs <script.mjs>");
  process.exit(1);
}

const out = path.join(root, ".temp-tool.mjs");
await build({
  entryPoints: [path.resolve(script)],
  outfile: out,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  plugins: [vendoredThree],
  loader: { ".glb": "binary", ".fbx": "binary", ".json": "json" },
  logLevel: "error",
});

const res = spawnSync("node", [out, ...process.argv.slice(3)], { stdio: "inherit" });
process.exit(res.status || 0);
