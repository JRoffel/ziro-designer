// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * `.ze-splitter` is the 5 px wxAUI sash beside a docked pane (the project manager's tree, the
 * symbol and footprint editors' library trees). wxSplitterWindow once reused the name with
 * `flex: 1`, and every such sash grew across the window, shoving the launchers to the far side.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(
  fileURLToPath(new URL('../../../common/widgets/shell.css', import.meta.url)),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** The declaration blocks of every rule whose selector list names `.ze-splitter` itself. */
function sashRules(): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = m[1]!.split(',');
    if (selectors.some((s) => /\.ze-splitter(?![\w-])/.test(s))) out.push(m[2]!);
  }
  return out;
}

describe('the AUI sash class', () => {
  it('is never told to grow', () => {
    const rules = sashRules();
    expect(rules.length).toBeGreaterThan(0);
    for (const body of rules) expect(body).not.toMatch(/(^|;|\s)flex:\s*1\b/);
  });

  it('stays 5 px wide', () => {
    const base = css.match(/(^|\})\s*\.ze-splitter\s*\{([^}]*)\}/);
    expect(base?.[2]).toMatch(/width:\s*5px/);
    expect(base?.[2]).toMatch(/flex:\s*0 0 auto/);
  });
});
