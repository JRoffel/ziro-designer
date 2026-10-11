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
  // 183 -> 162 (10-11): the shared Page Settings pair; the .ze-pgs-* block and ze-btn-bitmap.
  common: 162, // -11 (10-11): the shared Table Properties form, replaced by one pair per editor
  cvpcb: 8,
  designer: 138,
  // 114 -> 122 (10-11): not new CSS. ze-lp-* classes the old Table Cell and Label forms shared
  // are Text / Sheet Properties' alone now (ze-lp-entry, -syntax, -fields, -shape, -options...),
  // and go with those dialogs; the ones nothing uses any more were deleted.
  // 122 -> 114 (10-11): Text Properties' pair; the .ze-tp-* form and the ze-lp-* classes it
  // alone still used.
  // 114 -> 124 (10-11): not new CSS. The ERC window's .ze-erc-* classes were shared with the
  // old DRC window; with DRC a _base pair they are ERC's alone, and go when ERC is converted.
  // 124 -> 123 (10-11): Field Properties' pair; the .ze-fieldprops-* rules (the ze-lp-* ones
  // it shared stay with Sheet Properties).
  // 123 -> 118 (10-11): Sheet Properties' pair; the last users of most .ze-lp-* rules.
  // 118 -> 98 (10-11): Symbol Properties' pair; the whole .ze-symprops-* block.
  // 98 -> 85 (10-11): Global Edit's pair; .ze-ge-* and the last .ze-lp-* / .ze-label-props rules.
  // 85 -> 69 (10-11): Change Symbols' pair; the .ze-chsym-* block.
  // 69 -> 55 (10-11): the six Schematic Setup panel pairs; the .ze-bompresets-*, .ze-busdefs-*
  // and .ze-fieldnames-* rules.
  eeschema: 55,
  gerbview: 31,
  pagelayout_editor: 14,
  // 477 -> 465 (10-10): the drill and position-file dialogs on the sizers.
  // 465 -> 466 (10-11): not new CSS. `span2` was shared with eeschema's Find dialog; with Find a
  // _base pair, Exchange Footprints (.ze-xfp-upper > .ze-radio.span2) is its only user.
  // 466 -> 467 (10-11), a reclassification: the old Pad Properties form shared .ze-fpprops-tabs
  // (footprint editor properties) and .ze-tvp-note (graphic properties); with it gone each has
  // one user, and goes when that dialog is converted. Its own .ze-padprops-dialog is deleted.
  // 467 -> 463 (10-11): DRC on its _base pair.
  // 463 -> 448 (10-11): Push Pad, Swap Layers, Enumerate Pads and Target Properties pairs.
  // 448 -> 434 (10-11): Unused Pad Layers, Filter Selection, Offset Item, Track/Via Size and
  // Diff Pair Dimensions pairs.
  // 434 -> 427 (10-11): Move Exact, Footprint Associations, Global Deletion and Outset Items pairs.
  // 427 -> 402 (10-11): Cleanup Graphics, Cleanup Tracks & Vias and Reference Image pairs.
  // 402 -> 389 (10-11): PNS Settings, Import Netlist, Update PCB and Import Settings pairs.
  // 389 -> 367 (10-11): Copper Zones and PANEL_ZONE_PROPERTIES on their _base pairs.
  pcbnew: 367,
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
