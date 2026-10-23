// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_TEXT_PROPERTIES in the symbol editor (dialog_text_properties.cpp's m_isSymbolEditor
 * branches): Private and common to all units / body styles shown and written, the schematic-only
 * controls (exclude from simulation, syntax help, hyperlinks) hidden with no sheet pages listed.
 */
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import { DIALOG_TEXT_PROPERTIES } from '@ziroeda/eeschema/dialogs/dialog_text_properties.js';
import type { SCH_TEXT } from '@ziroeda/eeschema/sch_text.js';
import { afterEach, describe, expect, it } from 'vitest';
import { type SYMBOL_EDIT_HARNESS, symbolEditHarness } from '../support/symbol_edit_harness.js';

const effects = '(effects (font (size 1.27 1.27)))';
const prop = (aName: string, aValue: string) =>
  `(property "${aName}" "${aValue}" (at 0 0 0) ${effects})`;

/** T: two units, a text on unit 1; S: one unit, a text common to it. */
const LIB = `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  (symbol "T" ${prop('Reference', 'T')} ${prop('Value', 'T')}
    (symbol "T_1_1" (text "one" (at 0 0 0) ${effects}))
    (symbol "T_2_1" (text "two" (at 0 2.54 0) ${effects})))
  (symbol "S" ${prop('Reference', 'S')} ${prop('Value', 'S')}
    (symbol "S_0_1" (text "common" (at 0 0 0) ${effects}))))`;

let t: SYMBOL_EDIT_HARNESS;
afterEach(() => t?.dispose());

function setUp(aName: string, aText: string) {
  t = symbolEditHarness(LIB);
  t.open(aName);
  const text = [...t.frame.GetCurSymbol()!.GetDrawItems()].find(
    (i) => i.Type() === KICAD_T.SCH_TEXT_T && (i as SCH_TEXT).GetText() === aText,
  ) as SCH_TEXT;
  const dlg = new DIALOG_TEXT_PROPERTIES(t.frame, text);
  return { text, dlg, shown: dlg.TransferDataToWindow() };
}

describe('DIALOG_TEXT_PROPERTIES in the symbol editor', () => {
  it('shows the symbol editor boxes and hides the schematic ones', () => {
    const { dlg, shown } = setUp('T', 'one');
    expect(dlg.IsSymbolEditor()).toBe(true);
    expect(dlg.IsSchematicEditor()).toBe(false);
    expect(dlg.HyperlinkChoices().length).toBe(0);
    expect(dlg.CommonToAllUnitsEnabled()).toBe(true);
    expect(dlg.CommonToAllBodyStylesEnabled()).toBe(false);
    expect([shown.isPrivate, shown.commonToAllUnits, shown.commonToAllBodyStyles]).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('reads Private and unit 0', () => {
    const { text, dlg } = setUp('T', 'one');
    text.SetPrivate(true);
    text.SetUnit(0);
    const shown = dlg.TransferDataToWindow();
    expect([shown.isPrivate, shown.commonToAllUnits]).toEqual([true, true]);
  });

  it('does not read exclude-from-simulation in the symbol editor', () => {
    const { text, dlg } = setUp('T', 'one');
    text.SetExcludedFromSim(true);
    expect(dlg.TransferDataToWindow().excludeFromSim).toBe(false);
  });

  it('a single-unit symbol leaves the units box off for its unit-0 text', () => {
    const { text, dlg, shown } = setUp('S', 'common');
    expect(text.GetUnit()).toBe(0);
    expect(dlg.CommonToAllUnitsEnabled()).toBe(false);
    expect(shown.commonToAllUnits).toBe(false);
  });

  it('OK writes Private, the unit and the body style', () => {
    const { text, dlg, shown } = setUp('T', 'one');
    t.frame.SetUnit(2);
    expect(
      dlg.TransferDataFromWindow({
        ...shown,
        isPrivate: true,
        commonToAllUnits: false,
        commonToAllBodyStyles: true,
      }),
    ).toBe(true);
    expect(text.IsPrivate()).toBe(true);
    expect([text.GetUnit(), text.GetBodyStyle()]).toEqual([2, 0]);

    dlg.TransferDataFromWindow({ ...shown, commonToAllUnits: true, commonToAllBodyStyles: false });
    expect(text.IsPrivate()).toBe(false);
    expect([text.GetUnit(), text.GetBodyStyle()]).toEqual([0, t.frame.GetBodyStyle()]);
  });
});
