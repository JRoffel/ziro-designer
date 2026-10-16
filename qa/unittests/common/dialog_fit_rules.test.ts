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
 * - a wxHtmlWindow (WX_HTML_REPORT_BOX) is 1 x 1 whatever its page holds (DRC's running
 *   report pushed the buttons out of the dialog);
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
    expect(rule('.ze-grid-window.ze-grid-self-sized')).toMatch(/contain:\s*inline-size/);
  });

  it('a grid window takes the slot and fills what its rows leave; the rows keep their height', () => {
    // wxGrid::DrawGridSpace paints below the last row in the default cell background. Our
    // table WAS the sizer item, so a taller slot (Footprint Properties' fields grid, once its
    // notebook page filled) spread across four rows ~77px each.
    expect(rule('.ze-grid-window')).toMatch(/background:\s*var\(--grid-cell-bg\)/);
    expect(rule('.ze-grid-window')).not.toMatch(/overflow|contain/);
  });

  it('a grid with a stated min size asks for that, not every column, and scrolls (Symbol Fields Table)', () => {
    expect(rule('.ze-szi-minw.ze-szi-minh > .ze-grid-window')).toMatch(/contain:\s*size/);
    expect(rule('.ze-szi-minw.ze-szi-minh > .ze-grid-window')).toMatch(/overflow:\s*auto/);
    expect(rule('.ze-szi-minw:not(.ze-szi-minh) > .ze-grid-window')).toMatch(
      /contain:\s*inline-size/,
    );
    expect(rule('.ze-szi-minh > .ze-grid-window.ze-grid-self-sized')).toMatch(/contain:\s*size/);
    // wxDataViewCtrl is a scrolled window too: ERC's marker tree, SetMinSize( 640,260 ), ran the
    // dialog off the top and bottom of the screen with 107 violations.
    expect(rule('.ze-szi-minw.ze-szi-minh > .ze-dataview-window')).toMatch(/contain:\s*size/);
    expect(rule('.ze-szi-minw.ze-szi-minh > .ze-dataview-window')).toMatch(/overflow:\s*auto/);
  });

  it('an open cell editor sizes neither column nor row: it is laid over the cell', () => {
    expect(rule('.ze-grid td')).toMatch(/position:\s*relative/);
    expect(rule('.ze-grid td > .ze-grid-editor')).toMatch(/position:\s*absolute/);
    expect(rule('.ze-grid td > .ze-grid-editor')).toMatch(/inset:\s*0/);
    expect(rule('.ze-grid td > .ze-grid-under-editor')).toMatch(/visibility:\s*hidden/);
  });

  it("a layer cell's swatch is drawn: 14 x 14 including its edge, the name 8 after it", () => {
    const sw = rule('.ze-grid td > .ze-grid-text.ze-swatch-text > .ze-combo-swatch');
    expect(sw).toMatch(/display:\s*inline-block/);
    expect(sw).toMatch(/box-sizing:\s*border-box/);
    expect(sw).toMatch(/(^|[^-])width:\s*14px/);
    expect(sw).toMatch(/(^|[^-])height:\s*14px/);
    expect(sw).toMatch(/margin-right:\s*8px/);
  });

  it("an html window's page never sizes the dialog (wxHtmlWindow's best size is 1 x 1)", () => {
    expect(rule('.ze-html-window')).toMatch(/contain:\s*size/);
  });

  it('a page sizer fills its book page, so a proportion-1 report gets the page', () => {
    // DRC's running report got 22px of a 369px Simplebook page.
    for (const sel of [
      '.ze-nb-body > .ze-nb-page > .ze-sizer',
      '.ze-simplebook > .ze-simplebook-page > .ze-sizer',
      // wxSplitterWindow sizes each window to its pane (Symbol Fields Table's right side).
      '.ze-wxsplitter-pane > .ze-sizer',
    ])
      expect(rule(sel)).toMatch(/flex:\s*1 0 auto/);
    // and the notebook's pages fill the frame below its tabs.
    expect(rule('.ze-nb-body')).toMatch(/flex:\s*1 1 auto/);
  });

  it('a report wraps at spaces and scrolls across for a word too long, as wxHtmlWindow', () => {
    expect(rule('.ze-report-view')).toMatch(
      /grid-template-columns:\s*minmax\(min-content,\s*1fr\)/,
    );
    expect(rule('.ze-report-line')).not.toMatch(/word-break|overflow-wrap/);
  });
});
