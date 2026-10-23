// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_SHAPE_PROPERTIES in the symbol editor (dialog_shape_properties.cpp's
 * `dynamic_cast<SYMBOL_EDIT_FRAME*>` branches): the fill radios and their custom colour, Private,
 * common to all units / body styles, the symbol editor's default line width, and the read-only
 * OK for a symbol that cannot be edited.
 */
import { FILL_T, SHAPE_T } from '@ziroeda/common/eda_shape.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import {
  DIALOG_SHAPE_PROPERTIES,
  type SHAPE_DIALOG_VALUES,
} from '@ziroeda/eeschema/dialogs/dialog_shape_properties.js';
import type { SCH_SHAPE } from '@ziroeda/eeschema/sch_shape.js';
import {
  currentSymbolEditorSettings,
  setSymbolEditorSettingsProvider,
} from '@ziroeda/eeschema/symbol_editor/symbol_editor_settings.js';
import { afterEach, describe, expect, it } from 'vitest';
import { type SYMBOL_EDIT_HARNESS, symbolEditHarness } from '../support/symbol_edit_harness.js';

/** KiCad's default theme: LAYER_DEVICE #840000, LAYER_DEVICE_BACKGROUND #FFFFC2. [data] */
const DEVICE = { r: 132 / 255, g: 0, b: 0, a: 1 };
const DEVICE_BACKGROUND = { r: 1, g: 1, b: 194 / 255, a: 1 };
const UNSPECIFIED = { r: 0, g: 0, b: 0, a: 0 };
const BLUE = { r: 0, g: 0, b: 1, a: 1 };
const GREEN = { r: 0, g: 1, b: 0, a: 1 };

let t: SYMBOL_EDIT_HARNESS;
afterEach(() => t?.dispose());

function setUp(aFill = FILL_T.NO_FILL) {
  t = symbolEditHarness();
  t.open('U');
  const shape = [...t.frame.GetCurSymbol()!.GetDrawItems()].find(
    (i) => i.Type() === KICAD_T.SCH_SHAPE_T,
  ) as SCH_SHAPE;
  expect(shape.GetShape()).toBe(SHAPE_T.RECTANGLE);
  shape.SetFillMode(aFill);
  const dlg = new DIALOG_SHAPE_PROPERTIES(t.frame, shape);
  return { shape, dlg, shown: dlg.TransferDataToWindow() };
}

const close = (a: { r: number; g: number; b: number; a: number }) =>
  [a.r, a.g, a.b, a.a].map((c) => Math.round(c * 255));

describe('DIALOG_SHAPE_PROPERTIES in the symbol editor', () => {
  it('shows the symbol editor page, with the units box live for a multi-unit symbol', () => {
    const { dlg, shown } = setUp();
    expect(dlg.IsSymbolEditor()).toBe(true);
    expect(dlg.IsReadOnly()).toBe(false);
    expect(dlg.AllUnitsEnabled()).toBe(true);
    expect(dlg.AllBodyStylesEnabled()).toBe(false);
    expect(shown.fillRadio).toBe('none');
    expect(shown.customColor).toEqual(UNSPECIFIED);
    expect([shown.isPrivate, shown.allUnits, shown.allBodyStyles]).toEqual([false, false, false]);
  });

  it.each([
    [FILL_T.FILLED_SHAPE, 'outline', DEVICE],
    [FILL_T.FILLED_WITH_BG_BODYCOLOR, 'background', DEVICE_BACKGROUND],
  ] as const)('fill mode %s shows the %s radio and its colour', (aFill, aRadio, aColor) => {
    const { shown } = setUp(aFill);
    expect(shown.fillRadio).toBe(aRadio);
    expect(close(shown.customColor)).toEqual(close(aColor));
  });

  it('an outline fill with a coloured border shows the border colour; custom shows its own', () => {
    t = symbolEditHarness();
    const { shape, dlg } = setUp(FILL_T.FILLED_SHAPE);
    const stroke = shape.GetStroke();
    stroke.SetColor(BLUE);
    shape.SetStroke(stroke);
    expect(dlg.TransferDataToWindow().customColor).toEqual(BLUE);
    shape.SetFillMode(FILL_T.FILLED_WITH_COLOR);
    shape.SetFillColor(GREEN);
    const shown = dlg.TransferDataToWindow();
    expect([shown.fillRadio, shown.customColor]).toEqual(['custom', GREEN]);
  });

  it('common to all units reads unit 0, and Private', () => {
    const { shape, dlg } = setUp();
    shape.SetUnit(0);
    shape.SetPrivate(true);
    const shown = dlg.TransferDataToWindow();
    expect([shown.allUnits, shown.isPrivate]).toEqual([true, true]);
  });

  it('OK writes the fill mode, colour, Private, unit and body style', () => {
    const { shape, dlg, shown } = setUp();
    t.frame.SetUnit(2);
    const values: SHAPE_DIALOG_VALUES = {
      ...shown,
      fillRadio: 'custom',
      customColor: GREEN,
      isPrivate: true,
      allUnits: false,
      allBodyStyles: true,
    };
    expect(dlg.TransferDataFromWindow(values)).toBe(true);
    expect(shape.GetFillMode()).toBe(FILL_T.FILLED_WITH_COLOR);
    expect(shape.GetFillColor()).toEqual(GREEN);
    expect(shape.IsPrivate()).toBe(true);
    expect([shape.GetUnit(), shape.GetBodyStyle()]).toEqual([2, 0]);

    for (const [radio, mode] of [
      ['outline', FILL_T.FILLED_SHAPE],
      ['background', FILL_T.FILLED_WITH_BG_BODYCOLOR],
      ['none', FILL_T.NO_FILL],
    ] as const) {
      dlg.TransferDataFromWindow({ ...values, fillRadio: radio, allUnits: true });
      expect(shape.GetFillMode()).toBe(mode);
      expect(shape.GetUnit()).toBe(0);
    }
    dlg.TransferDataFromWindow({ ...values, allBodyStyles: false });
    expect(shape.GetBodyStyle()).toBe(t.frame.GetBodyStyle());
  });

  it('the radios set the custom swatch; custom opens the picker', () => {
    const { dlg, shown } = setUp();
    expect(dlg.OnFillRadio(shown, 'none')).toEqual({
      patch: { fillRadio: 'none', customColor: UNSPECIFIED },
      openPicker: false,
    });
    const outline = dlg.OnFillRadio({ ...shown, borderColor: UNSPECIFIED }, 'outline');
    expect(close(outline.patch.customColor!)).toEqual(close(DEVICE));
    expect(dlg.OnFillRadio({ ...shown, borderColor: BLUE }, 'outline').patch.customColor).toEqual(
      BLUE,
    );
    expect(close(dlg.OnFillRadio(shown, 'background').patch.customColor!)).toEqual(
      close(DEVICE_BACKGROUND),
    );
    expect(dlg.OnFillRadio(shown, 'custom')).toEqual({
      patch: { fillRadio: 'custom' },
      openPicker: true,
    });
    expect(dlg.OnCustomColorSwatch(GREEN)).toEqual({ customColor: GREEN, fillRadio: 'custom' });
  });

  it('with the outline fill the border colour carries to the fill', () => {
    const { dlg, shown } = setUp();
    expect(dlg.OnBorderSwatch({ ...shown, fillRadio: 'outline' }, BLUE)).toEqual({
      borderColor: BLUE,
      fillColor: BLUE,
      customColor: BLUE,
    });
    expect(dlg.OnBorderSwatch({ ...shown, fillRadio: 'none' }, BLUE)).toEqual({
      borderColor: BLUE,
    });
  });

  it("ticking the border takes the symbol editor's default line width", () => {
    const { dlg } = setUp();
    const base = currentSymbolEditorSettings();
    setSymbolEditorSettingsProvider(() => ({
      ...base,
      defaults: { ...base.defaults, line_width: 10 },
    }));
    try {
      // 10 mils is 0.254 mm in the frame's default units.
      expect(dlg.OnBorderChecked('-1', true)).toBe('0.254');
    } finally {
      setSymbolEditorSettingsProvider(() => base);
    }
  });

  it('a symbol that cannot be edited is read only', () => {
    const { dlg } = setUp();
    t.frame.IsSymbolEditable = () => false;
    expect(dlg.IsReadOnly()).toBe(true);
  });

  it('a single-unit symbol leaves the units box off even for a unit-0 shape', () => {
    t = symbolEditHarness(`(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
      (symbol "S" (property "Reference" "S" (at 0 0 0) (effects (font (size 1.27 1.27))))
        (symbol "S_0_1" (rectangle (start -2.54 -2.54) (end 2.54 2.54)
          (stroke (width 0) (type default)) (fill (type none))))))`);
    t.open('S');
    const shape = [...t.frame.GetCurSymbol()!.GetDrawItems()].find(
      (i) => i.Type() === KICAD_T.SCH_SHAPE_T,
    ) as SCH_SHAPE;
    expect(shape.GetUnit()).toBe(0);
    const dlg = new DIALOG_SHAPE_PROPERTIES(t.frame, shape);
    expect(dlg.AllUnitsEnabled()).toBe(false);
    expect(dlg.TransferDataToWindow().allUnits).toBe(false);
  });
});
