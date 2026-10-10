/**
 * The repo mirrors KiCad's tree file for file (file-structure-parity-method): every source file
 * under a folder KiCad has is the port of a KiCad file of the same path, or is written down in
 * tree_parity_exceptions.ts with the reason it is not. A new file that maps to nothing fails here;
 * so does an exception that has since been fixed (the list only shrinks).
 *
 * KiCad's side is qa/data/kicad_tree/<tag>.txt (regen.sh), so this runs without the reference.
 * Not KiCad-named, so not checked: designer/ (KiCad's kicad/, the shell), ai/, qa/, docs/, and
 * external/ (what KiCad gets from outside its tree: wx, libc, cairo).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TREE_EXCEPTIONS } from './tree_parity_exceptions.js';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const TAG = '10.0.6';
const KICAD = readFileSync(join(ROOT, `qa/data/kicad_tree/${TAG}.txt`), 'utf8')
  .split('\n')
  .filter(Boolean);
const KICAD_SET = new Set(KICAD);

/** The KiCad-named roots this tree mirrors. */
export const KICAD_ROOTS = [
  'common',
  'libs',
  'include',
  'thirdparty',
  'eeschema',
  'pcbnew',
  'gerbview',
  'cvpcb',
  'pcb_calculator',
  'pagelayout_editor',
  'bitmap2component',
  '3d-viewer',
  'utils',
] as const;

const EXTS = ['.cpp', '.h', '.c', '.hpp', '.cc'];

/** KiCad files by the folder they sit under, for the libraries whose inner layout differs. */
function basenamesUnder(aPrefix: string): Set<string> {
  const out = new Set<string>();
  for (const f of KICAD) if (f.startsWith(aPrefix)) out.add(basename(f).replace(/\.[^.]+$/, ''));
  return out;
}

/** The KiCad file a source file of ours ports, or null. */
export function kicadFileFor(aOurs: string): string | null {
  // A package's entry point is the package, not a file KiCad has.
  if (basename(aOurs) === 'index.ts') return '(package entry)';

  // dialog_x_base.tsx is dialog_x_base.cpp; dialog_x_ui.tsx is the same pair until it is renamed.
  const stem = aOurs.replace(/\.(tsx?)$/, '');
  const stems = [stem, stem.replace(/_(ui|base)$/, '')];
  const top = aOurs.split('/')[0]!;

  for (const s of stems)
    for (const c of [...EXTS.map((e) => s + e), `${s}_base.cpp`]) if (KICAD_SET.has(c)) return c;

  // common/'s headers live in include/.
  if (top === 'common') {
    const rel = stem.slice('common/'.length);
    for (const c of [`include/${rel}.h`, `include/${basename(stem)}.h`])
      if (KICAD_SET.has(c)) return c;
  }

  // A library (libs/<lib>, thirdparty/<lib>) is matched by name anywhere inside it: KiCad's
  // libraries keep src/ and include/ apart, and a vendored one keeps its upstream layout.
  if (top === 'libs' || top === 'thirdparty') {
    const lib = aOurs.split('/').slice(0, 2).join('/');
    const name = basename(stem).replace(/_(ui|base)$/, '');
    if (basenamesUnder(`${lib}/`).has(name)) return `${lib}/…/${name}`;
  }

  return null;
}

function ourFiles(): string[] {
  const out = execFileSync('git', ['ls-files', ...KICAD_ROOTS], { cwd: ROOT, encoding: 'utf8' });
  return out
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts') && !f.includes('/node_modules/'));
}

describe(`the tree mirrors KiCad ${TAG} file for file`, () => {
  const files = ourFiles();
  const unmapped = files.filter((f) => kicadFileFor(f) === null);
  // TREE_DUMP=<file>: the unmapped list, for writing the exceptions.
  if (process.env.TREE_DUMP) writeFileSync(process.env.TREE_DUMP, `${unmapped.join('\n')}\n`);

  it('every file maps to a KiCad file, or is a written exception', () => {
    const missing = unmapped.filter((f) => !(f in TREE_EXCEPTIONS));
    expect(
      missing,
      "port it under KiCad's name, or add it to tree_parity_exceptions.ts with why",
    ).toEqual([]);
  });

  it('and an exception that maps now, or is gone, comes off the list', () => {
    const present = new Set(files);
    const stale = Object.keys(TREE_EXCEPTIONS).filter(
      (f) => !present.has(f) || kicadFileFor(f) !== null,
    );
    expect(stale, 'remove these from tree_parity_exceptions.ts').toEqual([]);
  });

  it('every exception says why', () => {
    const bare = Object.entries(TREE_EXCEPTIONS).filter(([, why]) => why.trim().length < 8);
    expect(bare).toEqual([]);
  });

  it('the KiCad list is the reference tag, not something else', () => {
    expect(KICAD.length).toBeGreaterThan(5000);
    expect(KICAD_SET.has('pcbnew/dialogs/dialog_export_odbpp_base.cpp')).toBe(true);
    expect(dirname(KICAD[0]!)).not.toBe('.');
  });
});
