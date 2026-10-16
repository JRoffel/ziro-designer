// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * A KiCad dialog is Fit() to its controls' best sizes, once. Ours is `max-content`, so
 * anything whose content can grow sizes the dialog with it unless the shared rule says
 * it does not. Each rule here is one a dialog was found too big without:
 *
 * - an unsized wxTextCtrl / wxComboBox is GTK's best width, not the browser's 20-char
 *   <input> (Footprint Properties came out ~1700 px wide);
 * - a wxDataViewListCtrl has no height of its own (Rule Area Properties, every layer
 *   stacked, cut off below the screen);
 * - a wxHtmlWindow report does not widen the dialog (Update PCB grew with each line);
 * - a grid with a wxEVT_SIZE handler is its slot's width (Symbol Fields Table's
 *   fields grid ran under the right pane).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  fileURLToPath(new URL('../../../common/widgets/shell.css', import.meta.url)),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of the rule whose selector list contains exactly `aSelector`. */
function rule(aSelector: string): string {
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    if ((m[1] ?? '').split(',').some((sel) => sel.trim() === aSelector)) return m[2] ?? '';
  return '';
}

describe('the shared rules that keep a dialog at its Fit() size', () => {
  it("an entry and a combo are GTK's best widths, and wxEXPAND still stretches them", () => {
    expect(css).toMatch(/--ctl-entry-width:\s*98px/);
    expect(css).toMatch(/--ctl-textcombo-width:\s*77px/);
    expect(rule('.ze-textctrl')).toMatch(/width:\s*var\(--ctl-entry-width\)/);
    expect(rule('.ze-textcombo')).toMatch(/width:\s*var\(--ctl-textcombo-width\)/);
    expect(rule('.ze-szi-across > .ze-textctrl')).toMatch(/min-width:\s*100%/);
    expect(rule('.ze-szi-across > .ze-textcombo')).toMatch(/min-width:\s*100%/);
  });

  it('a data view list has no height of its own', () => {
    expect(rule('.ze-dataview-list')).toMatch(/(^|[^-])height:\s*0/);
  });

  it('a report view and a self-sizing grid window add no width', () => {
    // Neither way: across it widened the dialog, down it ran off the screen.
    expect(rule('.ze-report-view')).toMatch(/contain:\s*size/);
    expect(rule('.ze-report-panel')).toMatch(/min-height:\s*225px/);
    expect(rule('.ze-grid-window')).toMatch(/contain:\s*inline-size/);
  });
});
