// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_SHAPE_PROPERTIES (dialog_shape_properties.cpp), schematic branch, on a live shape: the
 * border and fill shown, OK as one "Edit <shape>" commit, no border as width -1.
 */
import { SHAPE_T } from '@ziroeda/common/eda_shape.js';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { LINE_STYLE } from '@ziroeda/common/stroke_params.js';
import { DIALOG_SHAPE_PROPERTIES } from '@ziroeda/eeschema/dialogs/dialog_shape_properties.js';
import { SCH_SHAPE } from '@ziroeda/eeschema/sch_shape.js';
import { SCH_RULE_AREA } from '@ziroeda/eeschema/sch_rule_area.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schFrame, schToolHarness } from './support/sch_tool_harness.js';

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => SetPgm(null));

const GREEN = { r: 0, g: 1, b: 0, a: 1 };

function setUp() {
  const h = schToolHarness(schFrame({}));
  const shape = new SCH_SHAPE(SHAPE_T.RECTANGLE);
  shape.SetStart({ x: 0, y: 0 });
  shape.SetEnd({ x: 12700, y: 12700 });
  h.frame.AddToScreen(shape, h.frame.GetScreen());
  return { h, shape, dlg: new DIALOG_SHAPE_PROPERTIES(h.frame, shape) };
}

const DASH = 1;
const HATCH = 2;

describe('DIALOG_SHAPE_PROPERTIES', () => {
  it('shows the border through the binder and the fill as the choice selects it', () => {
    const { shape, dlg } = setUp();
    shape.SetFillModeProp(1);
    const stroke = shape.GetStroke();
    stroke.SetWidth(2540);
    shape.SetStroke(stroke);
    const shown = dlg.TransferDataToWindow();
    // 2540 schematic IU is 0.254 mm in the frame's default units.
    expect([shown.border, shown.borderWidth]).toEqual([true, '0.254']);
    expect(shown.fill).toBe(1);
    expect(dlg.Title()).toBe('Rectangle Properties');
    expect(dlg.IsRuleArea()).toBe(false);
  });

  it('a shape with no border (-1) leaves the width box empty', () => {
    const { shape, dlg } = setUp();
    const stroke = shape.GetStroke();
    stroke.SetWidth(-1);
    shape.SetStroke(stroke);
    // The else branch never calls m_borderWidth.SetValue(): the base's wxEmptyString stays.
    expect([dlg.TransferDataToWindow().border, dlg.TransferDataToWindow().borderWidth]).toEqual([
      false,
      '',
    ]);
  });

  it('OK writes border, style, colours and fill as one commit named after the shape', () => {
    const { h, shape, dlg } = setUp();
    const undo = h.frame.GetUndoCommandCount();

    dlg.TransferDataFromWindow({
      ...dlg.TransferDataToWindow(),
      border: true,
      borderWidth: '0.254',
      borderStyle: DASH,
      borderColor: GREEN,
      fill: HATCH,
      fillColor: GREEN,
    });

    expect(shape.GetWidth()).toBe(2540);
    expect(shape.GetStroke().GetLineStyle()).toBe(LINE_STYLE.DASH);
    expect(shape.GetStroke().GetColor()).toEqual(GREEN);
    expect(shape.GetFillModeProp()).toBe(HATCH);
    expect(shape.GetFillColor()).toEqual(GREEN);
    expect(h.frame.GetUndoCommandCount()).toBe(undo + 1);
  });

  it('no border stores width -1; a style past lineTypeNames is SOLID', () => {
    const { shape, dlg } = setUp();
    dlg.TransferDataFromWindow({
      ...dlg.TransferDataToWindow(),
      border: false,
      borderWidth: '0.254',
      borderStyle: 99,
    });
    expect(shape.GetWidth()).toBe(-1);
    expect(shape.GetStroke().GetLineStyle()).toBe(LINE_STYLE.SOLID);
  });

  it('onBorderChecked: ticking the border with a negative width gives the default line width', () => {
    const { h, dlg } = setUp();
    h.frame.SetUserUnits('mils');
    // m_Drawing.default_line_thickness is 6 mils, through schIUScale.MilsToIU here.
    expect(dlg.OnBorderChecked('-1', true)).toBe('6');
    expect(dlg.OnBorderChecked('-1', false)).toBe('-1');
  });

  it("a rule area's exclude and DNP flags", () => {
    const h = schToolHarness(schFrame({}));
    const area = new SCH_RULE_AREA();
    area.AddPoint({ x: 0, y: 0 });
    area.AddPoint({ x: 12700, y: 0 });
    area.AddPoint({ x: 12700, y: 12700 });
    h.frame.AddToScreen(area, h.frame.GetScreen());
    const dlg = new DIALOG_SHAPE_PROPERTIES(h.frame, area);
    expect(dlg.IsRuleArea()).toBe(true);

    dlg.TransferDataFromWindow({
      ...dlg.TransferDataToWindow(),
      excludeFromSim: true,
      excludeFromBoard: true,
      dnp: true,
    });

    expect([
      area.GetExcludedFromSim(),
      area.GetExcludedFromBOM(),
      area.GetExcludedFromBoard(),
    ]).toEqual([true, false, true]);
    expect(area.GetDNP()).toBe(true);
  });
});
