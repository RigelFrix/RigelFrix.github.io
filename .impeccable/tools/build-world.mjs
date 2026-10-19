/* Bundles world.js and the vendored three.js into world.bundle.js, a plain script that also
   runs when index.html is opened straight from disk. Run after editing world.js:
   node .impeccable/tools/build-world.mjs */

import { build } from "esbuild";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

await build({
  entryPoints: [path.join(root, "world.js")],
  outfile: path.join(root, "world.bundle.js"),
  bundle: true,
  format: "iife",
  minify: true,
  target: "es2020",
  legalComments: "eof",
  banner: { js: "/* Built from world.js by .impeccable/tools/build-world.mjs. Edit world.js, then rebuild. */" },
  plugins: [vendoredThree],
  loader: { ".glb": "binary", ".fbx": "binary", ".png": "dataurl" },
  logLevel: "info",
});

/* Stamp the bundle's hash into index.html so browsers never run a stale copy. */
const bundle = fs.readFileSync(path.join(root, "world.bundle.js"));
const version = createHash("sha1").update(bundle).digest("hex").slice(0, 8);
const indexPath = path.join(root, "index.html");
const html = fs.readFileSync(indexPath, "utf8");
const stamped = html.replace(/src="\.\/world\.bundle\.js(\?v=[^"]*)?"/, `src="./world.bundle.js?v=${version}"`);

if (stamped === html && !html.includes(`world.bundle.js?v=${version}`)) {
  throw new Error("index.html has no world.bundle.js script tag to stamp");
}

fs.writeFileSync(indexPath, stamped);
console.log(`index.html -> world.bundle.js?v=${version}`);
