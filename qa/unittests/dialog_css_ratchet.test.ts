/**
 * No dialog carries layout CSS of its own (the dialog spec, 10-10): KiCad's `_base.cpp` states a
 * sizer tree and wx lays it out, so a dialog here is its sizer tree (external/wx/sizer.tsx) on
 * the shared chrome, and nothing else.
 *
 * A per-dialog class is a CSS class that exactly one file uses, and that file is a dialog or a
 * panel (under a dialogs/ folder, or named dialog_* / panel_*). Each folder's count may only go
 * down; the sweep ends with every one at 0.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** 10-10, when the sizers landed. Lower a number when a pass removes some. */
const BASELINE: Record<string, number> = {
  '3d-viewer': 6,
  common: 194,
  cvpcb: 8,
  designer: 138,
  eeschema: 142,
  gerbview: 31,
  pagelayout_editor: 14,
  // 477 -> 465 (10-10): the drill and position-file dialogs on the sizers.
  pcbnew: 465,
};

const git = (...aSpecs: string[]): string[] =>
  execFileSync('git', ['ls-files', ...aSpecs], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);

/** Every class a stylesheet defines (selectors only, comments and at-rules skipped). */
function cssClasses(): Set<string> {
  const out = new Set<string>();

  for (const f of git('*.css')) {
    if (f.startsWith('docs/') || f.startsWith('qa/')) continue;

    const text = readFileSync(join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

    for (const m of text.matchAll(/([^{}]+)\{/g)) {
      const sel = m[1]!.trim();
      if (sel.startsWith('@')) continue;
      for (const c of sel.matchAll(/\.([a-zA-Z][\w-]*)/g)) out.add(c[1]!);
    }
  }

  return out;
}

const isDialog = (aFile: string): boolean =>
  aFile.includes('/dialogs/') || /^(dialog|panel)_/.test(basename(aFile));

/** Per folder, the classes only one dialog file uses. */
export function perDialogClasses(): Record<string, string[]> {
  const classes = cssClasses();
  const users = new Map<string, string[]>();

  for (const f of git('*.ts', '*.tsx')) {
    if (f.startsWith('qa/') || f.startsWith('docs/') || f.endsWith('.d.ts')) continue;

    const tokens = new Set(readFileSync(join(ROOT, f), 'utf8').match(/[A-Za-z][\w-]*/g) ?? []);

    for (const c of classes) if (tokens.has(c)) users.set(c, [...(users.get(c) ?? []), f]);
  }

  const out: Record<string, string[]> = {};

  for (const [c, files] of users) {
    if (files.length !== 1 || !isDialog(files[0]!)) continue;
    const area = files[0]!.split('/')[0]!;
    out[area] = [...(out[area] ?? []), c];
  }

  return out;
}

describe('dialogs carry no CSS of their own', () => {
  const now = perDialogClasses();
  const count = (a: string): number => now[a]?.length ?? 0;
  const areas = [...new Set([...Object.keys(BASELINE), ...Object.keys(now)])].sort();

  it('no folder gains a per-dialog class: lay the dialog out with the wx sizers', () => {
    const grew = areas
      .filter((a) => count(a) > (BASELINE[a] ?? 0))
      .map((a) => `${a}: ${count(a)} per-dialog classes against ${BASELINE[a] ?? 0}`);
    expect(grew).toEqual([]);
  });

  it('and a pass that removes some lowers the number here', () => {
    const fell = areas
      .filter((a) => count(a) < (BASELINE[a] ?? 0))
      .map((a) => `${a}: ${count(a)} now, baseline says ${BASELINE[a]}`);
    expect(fell, 'lower the baseline').toEqual([]);
  });
});
