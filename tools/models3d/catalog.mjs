/**
 * Writes the hosted 3D library's catalogue: every STEP-family model in an
 * upstream packages3D tree, as `{ "<Lib>.3dshapes": ["<Model>.step", ...] }`.
 *
 * A bucket cannot be listed from a page, and DIALOG_MIGRATE_3D_MODELS walks the
 * stock 3D directory for its STEP_CATALOG; this file is that walk, made once
 * when the library is built. Run it over the same tree `convert.mjs` converts.
 *
 * Usage: node catalog.mjs <stepRoot> <out.json>
 */
import fs from 'node:fs';
import path from 'node:path';

// MODEL_SUBSTITUTION's stepExtensions() (model_substitution_helpers.cpp).
const STEP = /\.(step|stp|stpz|step\.gz|stp\.gz|iges|igs)$/i;

const [root, out] = process.argv.slice(2);
if (!root || !out) {
  console.error('usage: node catalog.mjs <stepRoot> <out.json>');
  process.exit(1);
}

const catalog = {};
for (const lib of fs.readdirSync(root).sort()) {
  const dir = path.join(root, lib);
  if (!lib.endsWith('.3dshapes') || !fs.statSync(dir).isDirectory()) continue;
  const models = fs
    .readdirSync(dir)
    .filter((f) => STEP.test(f))
    .sort();
  if (models.length) catalog[lib] = models;
}
fs.writeFileSync(out, `${JSON.stringify(catalog)}\n`);
console.log(
  `${Object.values(catalog).flat().length} models in ${Object.keys(catalog).length} libraries`,
);
