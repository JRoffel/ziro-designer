// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_LINE_PROPERTIES (dialog_line_properties.cpp) on live graphic lines: the width through
 * m_width (a UNIT_BINDER: 1000 schematic IU is 0.1 mm), leave-unchanged when widths differ, the
 * style rows (lineTypeNames, then "Leave unchanged" when styles differ), Default, and OK as one
 * "Edit Line(s)" commit that skips a line still being drawn (IS_NEW).
 */
import { IS_NEW } from '@ziroeda/common/eda_item_flags.js';
import { SCH_LAYER_ID } from '@ziroeda/common/layer_id.js';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { LINE_STYLE } from '@ziroeda/common/stroke_params.js';
import { DIALOG_LINE_PROPERTIES } from '@ziroeda/eeschema/dialogs/dialog_line_properties.js';
import { SCH_LINE } from '@ziroeda/eeschema/sch_line.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schFrame, schToolHarness } from './support/sch_tool_harness.js';

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => SetPgm(null));

const GREEN = { r: 0, g: 1, b: 0, a: 1 };
const LEAVE = '-- leave unchanged --';
const DASH = 1;
const LEAVE_ROW = 5;

function line(h: ReturnType<typeof schToolHarness>, aWidth: number, aStyle = LINE_STYLE.SOLID) {
  const l = new SCH_LINE({ x: 0, y: 0 }, SCH_LAYER_ID.LAYER_NOTES);
  l.SetEndPoint({ x: 12700, y: 0 });
  l.SetLineWidth(aWidth);
  l.SetLineStyle(aStyle);
  h.frame.AddToScreen(l, h.frame.GetScreen());
  return l;
}

describe('DIALOG_LINE_PROPERTIES', () => {
  it('shows the common width and style, leave-unchanged when they differ', () => {
    const h = schToolHarness(schFrame({}));
    const a = line(h, 1000);
    const b = line(h, 1000, LINE_STYLE.DASH);
    const shown = new DIALOG_LINE_PROPERTIES(h.frame, [a, b]).TransferDataToWindow();
    expect(shown.width).toBe('0.1');
    expect([shown.styleIndeterminate, shown.style]).toEqual([true, LEAVE_ROW]);

    const same = new DIALOG_LINE_PROPERTIES(h.frame, [b]).TransferDataToWindow();
    expect([same.styleIndeterminate, same.style]).toEqual([false, DASH]);
    expect(
      new DIALOG_LINE_PROPERTIES(h.frame, [a, line(h, 2000)]).TransferDataToWindow().width,
    ).toBe(LEAVE);
  });

  it('OK writes width, style and colour as one undo step', () => {
    const h = schToolHarness(schFrame({}));
    const a = line(h, 1000);
    const undo = h.frame.GetUndoCommandCount();
    const dlg = new DIALOG_LINE_PROPERTIES(h.frame, [a]);

    dlg.TransferDataFromWindow({
      ...dlg.TransferDataToWindow(),
      width: '0.3',
      style: DASH,
      color: GREEN,
    });

    expect([a.GetStroke().GetWidth(), a.GetLineStyle()]).toEqual([3000, LINE_STYLE.DASH]);
    expect(a.GetLineColor()).toEqual(GREEN);
    expect(h.frame.GetUndoCommandCount()).toBe(undo + 1);
  });

  it('leave-unchanged keeps the widths, but the style row past lineTypeNames is DEFAULT', () => {
    const h = schToolHarness(schFrame({}));
    const a = line(h, 1000);
    const b = line(h, 2000, LINE_STYLE.DASH);
    const dlg = new DIALOG_LINE_PROPERTIES(h.frame, [a, b]);

    // Upstream writes the style even from the INDETERMINATE_STYLE row: std::advance past the
    // end of lineTypeNames is LINE_STYLE::DEFAULT.
    dlg.TransferDataFromWindow(dlg.TransferDataToWindow());

    expect([a.GetStroke().GetWidth(), b.GetStroke().GetWidth()]).toEqual([1000, 2000]);
    // Stored as DEFAULT; SCH_LINE::GetLineStyle() reports a graphic line's DEFAULT as SOLID.
    expect([a.GetStroke().GetLineStyle(), b.GetStroke().GetLineStyle()]).toEqual([
      LINE_STYLE.DEFAULT,
      LINE_STYLE.DEFAULT,
    ]);
  });

  it('Default is width 0, no colour, and Solid (DEFAULT_LINE_STYLE_LABEL)', () => {
    const h = schToolHarness(schFrame({}));
    const dlg = new DIALOG_LINE_PROPERTIES(h.frame, [line(h, 1000, LINE_STYLE.DASH)]);
    const reset = dlg.ResetDefaults({ ...dlg.TransferDataToWindow(), color: GREEN });
    expect([reset.width, reset.style, reset.color.a]).toEqual(['0', 0, 0]);
  });

  it('a line still being drawn is not put in the commit', () => {
    const h = schToolHarness(schFrame({}));
    const a = line(h, 1000);
    a.SetFlags(IS_NEW);
    const undo = h.frame.GetUndoCommandCount();
    const dlg = new DIALOG_LINE_PROPERTIES(h.frame, [a]);

    dlg.TransferDataFromWindow({ ...dlg.TransferDataToWindow(), width: '0.2' });

    expect(a.GetStroke().GetWidth()).toBe(2000);
    expect(h.frame.GetUndoCommandCount()).toBe(undo);
  });

  it('the width follows the frame units', () => {
    const h = schToolHarness(schFrame({}));
    h.frame.SetUserUnits('mils');
    const a = line(h, 2540);
    const dlg = new DIALOG_LINE_PROPERTIES(h.frame, [a]);
    expect(dlg.TransferDataToWindow().width).toBe('10');
  });
});
