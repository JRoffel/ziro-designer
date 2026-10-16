// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * wxGauge is a GtkProgressBar, and its look is what GTK draws, measured by
 * qa/probes/progress_bar_probe.py rather than read from Yaru's stylesheet - which
 * said a #222222 trough inside a #181818 border, and that is what we drew: a dark
 * outlined slot with a 2px fill, where KiCad's DRC gauge is a #4B4B4B bar with no
 * border and a fill that takes all 4 rows inside its own 1px #EB6637 edge.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  fileURLToPath(new URL('../../../common/widgets/shell.css', import.meta.url)),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

function rule(aSelector: string): string {
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    if ((m[1] ?? '').split(',').some((sel) => sel.trim() === aSelector)) return m[2] ?? '';
  return '';
}

describe('the gauge, as GTK draws it', () => {
  it('a #4B4B4B trough, 4 rows, no border', () => {
    expect(css).toMatch(/--gauge-trough:\s*#4b4b4b/i);
    const gauge = rule('.ze-gauge');
    expect(gauge).toMatch(/(^|[^-])height:\s*4px/);
    expect(gauge).toMatch(/(^|[^-])border:\s*none/);
  });

  it('a #E95420 fill over all 4 rows, its 1px #EB6637 edge inside', () => {
    expect(css).toMatch(/--gauge-fill:\s*#e95420/i);
    expect(css).toMatch(/--gauge-fill-edge:\s*#eb6637/i);
    for (const sel of ['.ze-gauge::-webkit-progress-value', '.ze-gauge::-moz-progress-bar'])
      expect(rule(sel)).toMatch(/box-shadow:\s*inset 0 0 0 1px var\(--gauge-fill-edge\)/);
  });
});
