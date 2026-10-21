// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_LIB_SYMBOL_PROPERTIES (dialog_lib_symbol_properties.cpp) on a live symbol editor symbol:
 * the controls filled from the symbol, a derived symbol's inherited fields and parent list,
 * Validate's refusals and questions, what OK writes back, and the handlers that change other
 * controls (power, unit count, body styles, filters, jumper groups).
 */
import { SetErrorPresenter, SetQuestionPresenter } from '@ziroeda/common/confirm.js';
import { schIUScale } from '@ziroeda/common/eda_units.js';
import { FIELD_T } from '@ziroeda/common/template_fieldnames.js';
import { UNDO_REDO } from '@ziroeda/common/undo_redo_container.js';
import type { GRID_TEXT_BUTTON_HOST } from '@ziroeda/common/widgets/grid_text_button_helpers.js';
import {
  DIALOG_LIB_SYMBOL_PROPERTIES,
  DialogLibSymbolProperties,
} from '@ziroeda/eeschema/dialogs/dialog_lib_symbol_properties.js';
import {
  EESCHEMA_DEFAULTS,
  setEeschemaSettingsProvider,
} from '@ziroeda/eeschema/eeschema_settings.js';
import { FIELDS_DATA_COL_ORDER } from '@ziroeda/eeschema/fields_grid_table.js';
import type { LIB_SYMBOL } from '@ziroeda/eeschema/lib_symbol.js';
import type { SCH_FIELD } from '@ziroeda/eeschema/sch_field.js';
import { wxID_CANCEL, wxID_OK } from '@ziroeda/wx/menu.js';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { type SYMBOL_EDIT_HARNESS, symbolEditHarness } from '../support/symbol_edit_harness.js';

const prop = (aName: string, aValue: string) =>
  `(property "${aName}" "${aValue}" (at 0 0 0) (effects (font (size 1.27 1.27))))`;
const pin = (aNumber: string) =>
  `(pin input line (at 10.16 0 180) (length 5.08) (name "A" (effects (font (size 1.27 1.27)))) (number "${aNumber}" (effects (font (size 1.27 1.27)))))`;

/**
 * U: two units (the first named "Alpha"), keywords, two filters, user fields MPN and Vendor, a jumper
 * group, pin names inside at 20 mil. D derives from U (overriding MPN, adding Note), DD from D.
 * r10 and V are roots, there to be sorted in D's parent list.
 */
const LIB = `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  (symbol "U" (pin_names (offset 0.508)) (exclude_from_sim yes) (in_bom yes) (on_board no)
    (duplicate_pin_numbers_are_jumpers yes) (jumper_pin_groups ("1" "2"))
    ${prop('Reference', 'U')} ${prop('Value', 'U')} ${prop('MPN', 'X1')} ${prop('Vendor', 'Acme')}
    ${prop('ki_keywords', 'amp op')} ${prop('ki_fp_filters', 'SOIC* DIP*')}
    (symbol "U_1_1" (unit_name "Alpha")
      (rectangle (start -5.08 -5.08) (end 5.08 5.08) (stroke (width 0) (type default)) (fill (type none)))
      ${pin('1')})
    (symbol "U_2_1" ${pin('2')}))
  (symbol "D" (extends "U") ${prop('Reference', 'U')} ${prop('Value', 'D')} ${prop('MPN', 'Y2')} ${prop('Note', 'n')})
  (symbol "DD" (extends "D") ${prop('Reference', 'U')} ${prop('Value', 'DD')})
  (symbol "r10" ${prop('Reference', 'R')} ${prop('Value', 'r10')} (symbol "r10_1_1" ${pin('1')}))
  (symbol "V" ${prop('Reference', 'V')} ${prop('Value', 'V')} (symbol "V_1_1" ${pin('1')})))`;

const HOST: GRID_TEXT_BUTTON_HOST = {
  ChooseFootprint: async () => null,
  OpenFile: async () => null,
  OpenDocument: () => {},
};

let t: SYMBOL_EDIT_HARNESS;
let errors: string[] = [];
let questions: string[] = [];
let answer = true;

function setUp(aName = 'U'): { symbol: LIB_SYMBOL; dlg: DIALOG_LIB_SYMBOL_PROPERTIES } {
  errors = [];
  questions = [];
  answer = true;
  SetErrorPresenter((aText) => {
    errors.push(aText);
  });
  SetQuestionPresenter(async (aMessage) => {
    questions.push(aMessage);
    return answer;
  });
  DIALOG_LIB_SYMBOL_PROPERTIES.m_lastOpenedPage = 0;
  t = symbolEditHarness(LIB);
  t.frame.SetUserUnits('mils');
  const symbol = t.open(aName);
  const dlg = new DIALOG_LIB_SYMBOL_PROPERTIES(t.frame, symbol, HOST);
  return { symbol, dlg };
}

const rowNames = (aDlg: DIALOG_LIB_SYMBOL_PROPERTIES): string[] =>
  aDlg.m_fields.Fields().map((f) => f.GetName());

const cells = (aGrid: DIALOG_LIB_SYMBOL_PROPERTIES['m_unitNamesGrid'], aCol: number): string[] =>
  Array.from({ length: aGrid.GetNumberRows() }, (_, r) => aGrid.GetCellValue(r, aCol));

afterEach(() => {
  cleanup();
  t?.dispose();
  setEeschemaSettingsProvider(() => EESCHEMA_DEFAULTS);
  SetErrorPresenter((aText) => console.error(aText));
  SetQuestionPresenter(async () => false);
});

describe('DIALOG_LIB_SYMBOL_PROPERTIES TransferDataToWindow', () => {
  it('fills the controls from a root symbol', () => {
    const { dlg } = setUp();
    expect(dlg.TransferDataToWindow()).toBe(true);
    const s = dlg.OnUpdateUI();

    expect(s.m_SymbolNameCtrl).toBe('U');
    expect(s.m_KeywordCtrl).toBe('amp op');
    expect(s.m_unitSpinCtrl).toBe(2);
    // Units not locked: interchangeable, and enabled for more than one unit.
    expect(s.m_OptionPartsInterchangeable).toEqual({ value: true, enabled: true });
    expect(cells(dlg.m_unitNamesGrid, 0)).toEqual(['A', 'B']);
    expect(cells(dlg.m_unitNamesGrid, 1)).toEqual(['Alpha', '']);
    expect(s.bodyStyleRadio).toBe(0);
    expect(s.m_OptionPower).toEqual({ value: false, enabled: true });
    expect(s.m_OptionLocalPower.enabled).toBe(false);
    expect(s.spiceFieldsShown).toBe(true);
    expect(s.m_excludeFromSimCheckBox.value).toBe(true);
    expect(s.m_excludeFromBomCheckBox.value).toBe(false);
    expect(s.m_excludeFromBoardCheckBox.value).toBe(true);
    expect(s.m_PinsNameInsideButt).toBe(true);
    expect(s.m_nameOffsetCtrl).toEqual({ value: '20', enabled: true });
    expect(dlg.m_FootprintFilterListBox.GetStrings()).toEqual(['SOIC*', 'DIP*']);
    expect(s.m_cbDuplicatePinsAreJumpers).toBe(true);
    expect(cells(dlg.m_jumperGroupsGrid, 0)).toEqual(['1, 2']);
    // A root symbol: the lower panel shown, no parent to choose.
    expect(s.lowerBasicPanelShown).toBe(true);
    expect(s.m_inheritanceSelectCombo).toEqual({ value: '', enabled: false });
    expect(rowNames(dlg)).toContain('MPN');
  });

  it('opens on the page the last dialog closed on', () => {
    const { dlg } = setUp();
    DIALOG_LIB_SYMBOL_PROPERTIES.m_lastOpenedPage = 2;
    dlg.TransferDataToWindow();
    expect(dlg.m_state.m_NoteBook).toBe(2);

    dlg.m_state.m_NoteBook = 3;
    dlg.Close();
    expect(DIALOG_LIB_SYMBOL_PROPERTIES.m_lastOpenedPage).toBe(3);
  });

  it('a derived symbol: inherited rows, its own overrides, a sorted parent list without itself or its descendants', () => {
    const { dlg } = setUp('D');
    DIALOG_LIB_SYMBOL_PROPERTIES.m_lastOpenedPage = 2;
    expect(dlg.TransferDataToWindow()).toBe(true);
    const s = dlg.snapshot();

    expect(s.inheritanceChoices).toEqual(['r10', 'U', 'V']);
    expect(s.m_inheritanceSelectCombo).toEqual({ value: 'U', enabled: true });
    expect(s.lowerBasicPanelShown).toBe(false);
    // A derived symbol always opens on General.
    expect(s.m_NoteBook).toBe(0);

    // Vendor is U's alone: a row of its own, inherited.
    const vendor = dlg.m_fields.Fields().findIndex((f) => f.GetName() === 'Vendor');
    expect(dlg.m_fields.at(vendor).GetText()).toBe('Acme');
    expect(dlg.m_fields.IsInherited(vendor)).toBe(true);
    expect(dlg.GridTooltip(vendor, 0)).toBe("This field is inherited from 'Vendor'.");
    // MPN is D's own override: one row, D's text, shown as not inherited while it differs.
    const mpns = dlg.m_fields.Fields().filter((f) => f.GetName() === 'MPN');
    expect(mpns.map((f) => f.GetText())).toEqual(['Y2']);
    const mpn = dlg.m_fields.Fields().findIndex((f) => f.GetName() === 'MPN');
    expect(dlg.m_fields.IsInherited(mpn)).toBe(false);
    dlg.m_fields.at(mpn).SetText('X1');
    expect(dlg.m_fields.IsInherited(mpn)).toBe(true);
    const note = dlg.m_fields.Fields().findIndex((f) => f.GetName() === 'Note');
    expect(dlg.m_fields.IsInherited(note)).toBe(false);
    expect(dlg.GridTooltip(note, 0)).toBe('');
  });

  it('a power symbol hides the simulation button and enables local power', () => {
    const { symbol, dlg } = setUp('V');
    symbol.SetLocalPower();
    dlg.TransferDataToWindow();
    const s = dlg.snapshot();
    expect(s.m_OptionPower.value).toBe(true);
    expect(s.m_OptionLocalPower).toEqual({ value: true, enabled: true });
    expect(s.spiceFieldsShown).toBe(false);
  });

  it('a custom body style symbol lists its names; pins outside show offset 0, disabled', () => {
    const { symbol, dlg } = setUp('V');
    symbol.SetBodyStyleCount(3, false, false);
    symbol.SetBodyStyleNames(['Big', 'Small', 'Tiny']);
    symbol.SetPinNameOffset(0);
    dlg.TransferDataToWindow();
    const s = dlg.OnUpdateUI();
    expect(s.bodyStyleRadio).toBe(2);
    expect(cells(dlg.m_bodyStyleNamesGrid, 0)).toEqual(['Big', 'Small', 'Tiny']);
    expect(s.m_PinsNameInsideButt).toBe(false);
    expect(s.m_nameOffsetCtrl.enabled).toBe(false);
    // One unit: the interchangeable box is checked and disabled.
    expect(s.m_OptionPartsInterchangeable).toEqual({ value: true, enabled: false });
  });

  it('a read-only legacy library symbol', () => {
    errors = [];
    t = symbolEditHarness(LIB);
    const symbol = t.open('U');
    t.frame.SetSymbolOrigin(false, true);
    expect(new DIALOG_LIB_SYMBOL_PROPERTIES(t.frame, symbol, HOST).m_state.readOnly).toBe(true);
    t.frame.SetSymbolOrigin(true, true);
    expect(new DIALOG_LIB_SYMBOL_PROPERTIES(t.frame, symbol, HOST).m_state.readOnly).toBe(false);
  });
});

describe('DIALOG_LIB_SYMBOL_PROPERTIES Validate', () => {
  it('refuses a reference with no letter prefix, on General with the cell to fix', async () => {
    const { dlg } = setUp();
    dlg.TransferDataToWindow();
    dlg.m_state.m_NoteBook = 2;
    const ref = dlg.m_fields.GetFieldRow(FIELD_T.REFERENCE);
    dlg.m_fields.at(ref).SetText('1');

    expect(await dlg.Validate()).toBe(false);
    expect(dlg.m_state.m_NoteBook).toBe(0);
    expect(dlg.m_delayedFocusRow).toBe(ref);
    expect(dlg.m_delayedFocusColumn).toBe(FIELDS_DATA_COL_ORDER.FDC_VALUE);
    dlg.OnUpdateUI();
    expect(errors).toEqual(['References must start with a letter.']);
    expect(dlg.m_grid.GetGridCursorRow()).toBe(ref);
  });

  it('a derived symbol may have an empty reference', async () => {
    const { dlg } = setUp('D');
    dlg.TransferDataToWindow();
    dlg.m_fields.at(dlg.m_fields.GetFieldRow(FIELD_T.REFERENCE)).SetText('');
    expect(await dlg.Validate()).toBe(true);
  });

  it('refuses a user field with text and no name', async () => {
    const { dlg } = setUp();
    dlg.TransferDataToWindow();
    const mpn = dlg.m_fields.Fields().findIndex((f) => f.GetName() === 'MPN');
    dlg.m_fields.at(mpn).SetName('');
    expect(await dlg.Validate()).toBe(false);
    expect(dlg.m_delayedErrorMessage).toBe('Fields must have a name.');
    expect(dlg.m_delayedFocusRow).toBe(mpn);
    expect(dlg.m_delayedFocusColumn).toBe(FIELDS_DATA_COL_ORDER.FDC_NAME);
  });

  it('refuses a derived symbol with no parent chosen', async () => {
    const { dlg } = setUp('D');
    dlg.TransferDataToWindow();
    dlg.m_state.m_inheritanceSelectCombo.value = '';
    expect(await dlg.Validate()).toBe(false);
    expect(dlg.m_delayedErrorMessage).toBe('Derived symbol must have a parent selected');
  });

  it('refuses two units with one name, the default letters counting, case ignored', async () => {
    const { dlg } = setUp();
    dlg.TransferDataToWindow();
    dlg.m_unitNamesGrid.SetCellValue(0, 1, 'B');
    dlg.m_unitNamesGrid.SetCellValue(1, 1, 'b');
    expect(await dlg.Validate()).toBe(false);
    expect(dlg.m_delayedErrorMessage).toBe("The unit name 'b' is already in use.");
    expect(dlg.m_delayedFocusRow).toBe(1);
    expect(dlg.m_delayedFocusPage).toBe(1);
  });

  it('asks before deleting units and body styles, and stops on No', async () => {
    const { symbol, dlg } = setUp();
    symbol.SetBodyStyleCount(2, false, true);
    symbol.SetHasDeMorganBodyStyles(true);
    dlg.TransferDataToWindow();
    dlg.OnUnitSpinCtrl(1);
    dlg.OnBodyStyle(0);

    answer = false;
    expect(await dlg.Validate()).toBe(false);
    expect(questions).toEqual(['Delete extra units from symbol?']);

    answer = true;
    questions = [];
    expect(await dlg.Validate()).toBe(true);
    expect(questions).toEqual([
      'Delete extra units from symbol?',
      'Delete extra body styles from symbol?',
    ]);
  });

  it('custom body styles need two named entries', async () => {
    const { dlg } = setUp();
    dlg.TransferDataToWindow();
    dlg.OnBodyStyle(2);
    dlg.OnAddBodyStyle();
    dlg.OnAddBodyStyle();
    dlg.m_bodyStyleNamesGrid.SetCellValue(0, 0, 'One');
    expect(await dlg.Validate()).toBe(false);
    expect(dlg.m_delayedErrorMessage).toBe('Custom body styles must have at least 2 entries');

    dlg.m_bodyStyleNamesGrid.SetCellValue(1, 0, 'Two');
    expect(await dlg.Validate()).toBe(true);
    expect(questions).toEqual([]);
  });
});

describe('DIALOG_LIB_SYMBOL_PROPERTIES TransferDataFromWindow', () => {
  it('writes the controls back to the symbol', () => {
    const { symbol, dlg } = setUp();
    dlg.TransferDataToWindow();
    const s = dlg.m_state;
    s.m_KeywordCtrl = 'opamp';
    s.m_OptionPartsInterchangeable.value = false;
    s.m_excludeFromBomCheckBox.value = true;
    s.m_excludeFromSimCheckBox.value = false;
    s.m_ShowPinNumButt = false;
    s.m_cbDuplicatePinsAreJumpers = false;
    s.m_nameOffsetCtrl.value = '30';
    dlg.m_unitNamesGrid.SetCellValue(1, 1, 'Beta');
    dlg.m_FootprintFilterListBox.Append('QFN*');
    dlg.m_jumperGroupsGrid.SetCellValue(0, 0, ' 2 ,\t1 ');

    expect(dlg.TransferDataFromWindow()).toBe(true);
    expect(symbol.GetKeyWords()).toBe('opamp');
    expect(symbol.UnitsLocked()).toBe(true);
    expect(symbol.GetExcludedFromBOM()).toBe(true);
    expect(symbol.GetExcludedFromSim()).toBe(false);
    expect(symbol.GetShowPinNumbers()).toBe(false);
    expect(symbol.GetDuplicatePinNumbersAreJumpers()).toBe(false);
    expect(symbol.GetPinNameOffset()).toBe(schIUScale.milsToIU(30));
    expect([...symbol.GetUnitDisplayNames()]).toEqual([
      [1, 'Alpha'],
      [2, 'Beta'],
    ]);
    expect(symbol.GetFPFilters()).toEqual(['SOIC*', 'DIP*', 'QFN*']);
    expect(symbol.JumperPinGroups().map((g) => [...g])).toEqual([['2', '1']]);
    // Editing the frame's symbol: an undo entry, as LIBEDIT.
    expect(t.frame.GetUndoCommandCount()).toBe(1);
    expect(t.frame.PopCommandFromUndoList()!.GetPickedItemStatus(0)).toBe(UNDO_REDO.LIBEDIT);
  });

  it('pin names inside at offset 0 are put at 20; outside is 0', () => {
    const { symbol, dlg } = setUp();
    dlg.TransferDataToWindow();
    dlg.m_state.m_nameOffsetCtrl.value = '0';
    dlg.TransferDataFromWindow();
    expect(symbol.GetPinNameOffset()).toBe(20);

    dlg.m_state.m_PinsNameInsideButt = false;
    dlg.TransferDataFromWindow();
    expect(symbol.GetPinNameOffset()).toBe(0);
  });

  it('a rename is LIB_RENAME, refused when the library has the name', () => {
    const { symbol, dlg } = setUp();
    dlg.TransferDataToWindow();
    dlg.m_state.m_SymbolNameCtrl = 'V';
    expect(dlg.TransferDataFromWindow()).toBe(false);
    expect(errors).toEqual(["Symbol name 'V' already in use in library 'mine'."]);

    dlg.m_state.m_SymbolNameCtrl = 'W:x';
    expect(dlg.TransferDataFromWindow()).toBe(true);
    // CTX_LIBID escapes ':' (a LIB_ID separator), not '/'.
    expect(symbol.GetName()).toBe('W{colon}x');
    expect(t.frame.PopCommandFromUndoList()!.GetPickedItemStatus(0)).toBe(UNDO_REDO.LIB_RENAME);

    dlg.m_state.m_SymbolNameCtrl = '';
    expect(dlg.TransferDataFromWindow()).toBe(false);
    expect(errors.at(-1)).toBe('Symbol must have a name.');
  });

  it('a power symbol takes its name as its value; local power when asked', () => {
    const { symbol, dlg } = setUp('V');
    dlg.TransferDataToWindow();
    dlg.onPowerCheckBox(true, true);
    dlg.m_state.m_SymbolNameCtrl = 'GNDREF';
    dlg.TransferDataFromWindow();
    expect(symbol.IsLocalPower()).toBe(true);
    expect(symbol.GetValueField().GetText()).toBe('GNDREF');

    dlg.onPowerCheckBox(true, false);
    dlg.TransferDataFromWindow();
    expect(symbol.IsPower()).toBe(true);
    expect(symbol.IsLocalPower()).toBe(false);

    dlg.onPowerCheckBox(false, false);
    dlg.TransferDataFromWindow();
    expect(symbol.IsPower()).toBe(false);
  });

  it('body styles: De Morgan, custom names, single', () => {
    const { symbol, dlg } = setUp('V');
    dlg.TransferDataToWindow();
    dlg.OnBodyStyle(1);
    dlg.TransferDataFromWindow();
    expect(symbol.HasDeMorganBodyStyles()).toBe(true);
    expect(symbol.GetBodyStyleCount()).toBe(2);

    dlg.OnBodyStyle(2);
    dlg.OnAddBodyStyle();
    dlg.OnAddBodyStyle();
    dlg.OnAddBodyStyle();
    dlg.m_bodyStyleNamesGrid.SetCellValue(0, 0, 'P');
    dlg.m_bodyStyleNamesGrid.SetCellValue(2, 0, 'Q');
    dlg.TransferDataFromWindow();
    expect(symbol.HasDeMorganBodyStyles()).toBe(false);
    expect(symbol.GetBodyStyleNames()).toEqual(['P', 'Q']);

    dlg.OnBodyStyle(0);
    dlg.TransferDataFromWindow();
    expect(symbol.IsMultiBodyStyle()).toBe(false);
    expect(symbol.GetBodyStyleNames()).toEqual([]);
  });

  it('a jumper group naming a missing pin is refused', () => {
    const { dlg } = setUp();
    dlg.TransferDataToWindow();
    dlg.OnAddJumperGroup();
    dlg.m_jumperGroupsGrid.SetCellValue(1, 0, '1 9');
    expect(dlg.TransferDataFromWindow()).toBe(false);
    expect(errors).toEqual(["Pin '9' in jumper pin group 2 does not exist in this symbol."]);
  });

  it('fields: an unchanged inherited row is not written, an empty template field is skipped, an unnamed one is "untitled"', () => {
    const { symbol, dlg } = setUp('D');
    dlg.TransferDataToWindow();
    // D owns MPN (overridden), so it stays; its parent U's own fields are not copied in.
    expect(dlg.TransferDataFromWindow()).toBe(true);
    const names: string[] = [];
    const fields: SCH_FIELD[] = [];
    symbol.GetFields(fields);
    for (const f of fields) names.push(f.GetName());
    expect(names).toContain('MPN');
    expect(names).toContain('Note');
    expect(names).not.toContain('Vendor');
    expect(symbol.GetLibParent()?.GetName()).toBe('U');

    const v = setUp('V');
    v.dlg.TransferDataToWindow();
    v.dlg.OnAddField();
    const row = v.dlg.m_fields.size() - 1;
    v.dlg.m_fields.at(row).SetName('');
    v.dlg.m_fields.at(row).SetText('text');
    v.dlg.OnAddField();
    expect(v.dlg.TransferDataFromWindow()).toBe(true);
    const vNames: string[] = [];
    const vFields: SCH_FIELD[] = [];
    v.symbol.GetFields(vFields);
    for (const f of vFields) vNames.push(f.GetName());
    expect(vNames).toContain('untitled');
    // The second new field had a name and no text: it is not mandatory, not a template, kept.
    expect(vNames.filter((n) => n.startsWith('Field')).length).toBe(1);
  });

  it('re-parents a derived symbol to the chosen symbol', () => {
    const { symbol, dlg } = setUp('D');
    dlg.TransferDataToWindow();
    dlg.m_state.m_inheritanceSelectCombo.value = 'V';
    expect(dlg.TransferDataFromWindow()).toBe(true);
    expect(symbol.GetLibParent()?.GetName()).toBe('V');
  });
});

describe('DIALOG_LIB_SYMBOL_PROPERTIES handlers', () => {
  it('power excludes the symbol from everything and locks those boxes; off frees them', () => {
    const { dlg } = setUp('V');
    dlg.TransferDataToWindow();
    let s = dlg.onPowerCheckBox(true, false);
    for (const k of [
      'm_excludeFromSimCheckBox',
      'm_excludeFromBomCheckBox',
      'm_excludeFromBoardCheckBox',
      'm_excludeFromPosFilesCheckBox',
    ] as const)
      expect(s[k]).toEqual({ value: true, enabled: false });
    expect(s.spiceFieldsShown).toBe(false);
    expect(s.m_OptionLocalPower.enabled).toBe(true);

    s = dlg.onPowerCheckBox(false, false);
    expect(s.m_excludeFromBomCheckBox).toEqual({ value: true, enabled: true });
    expect(s.spiceFieldsShown).toBe(true);
    expect(s.m_OptionLocalPower.enabled).toBe(false);
  });

  it("a power symbol's name and value follow each other", () => {
    const { dlg } = setUp('V');
    dlg.TransferDataToWindow();
    const valueRow = dlg.m_fields.GetFieldRow(FIELD_T.VALUE);
    dlg.OnSymbolNameText('Q');
    expect(dlg.m_grid.GetCellValue(valueRow, FIELDS_DATA_COL_ORDER.FDC_VALUE)).toBe('V');

    dlg.onPowerCheckBox(true, false);
    dlg.OnSymbolNameText('VCC');
    expect(dlg.m_grid.GetCellValue(valueRow, FIELDS_DATA_COL_ORDER.FDC_VALUE)).toBe('VCC');

    // Typing in the value cell renames the symbol (OnUpdateUI reads the open editor).
    dlg.m_grid.SetGridCursor(valueRow, FIELDS_DATA_COL_ORDER.FDC_VALUE);
    dlg.m_grid.EnableCellEditControl(true);
    dlg.m_grid.GetCellEditor(valueRow, FIELDS_DATA_COL_ORDER.FDC_VALUE).m_value = 'VDD';
    expect(dlg.OnUpdateUI().m_SymbolNameCtrl).toBe('VDD');
  });

  it('the symbol name is checked as a value when it loses the focus', () => {
    const { dlg } = setUp();
    dlg.TransferDataToWindow();
    // FIELD_VALIDATOR( VALUE ) refuses a tab (spaces are a value's to have).
    dlg.OnSymbolNameText('a\tb');
    dlg.OnSymbolNameKillFocus();
    expect(errors.length).toBe(1);
    expect(dlg.m_delayedFocusPage).toBe(0);
    // Re-entrancy: no second dialog while the first is pending.
    dlg.OnSymbolNameKillFocus();
    expect(errors.length).toBe(1);
    dlg.OnUpdateUI();
    expect(dlg.m_delayedFocusCtrl).toBeNull();

    dlg.OnSymbolNameText('ab');
    dlg.OnSymbolNameKillFocus();
    expect(errors.length).toBe(1);
    expect(dlg.m_delayedFocusPage).toBe(-1);
  });

  it('the unit count grows the names grid with letters, and shrinks it', () => {
    const { dlg } = setUp();
    dlg.TransferDataToWindow();
    dlg.OnUnitSpinCtrl(4);
    expect(cells(dlg.m_unitNamesGrid, 0)).toEqual(['A', 'B', 'C', 'D']);
    expect(cells(dlg.m_unitNamesGrid, 1)).toEqual(['Alpha', '', '', '']);
    dlg.OnUnitSpinCtrl(1);
    expect(cells(dlg.m_unitNamesGrid, 1)).toEqual(['Alpha']);
    expect(dlg.OnUpdateUI().m_OptionPartsInterchangeable.enabled).toBe(false);
  });

  it('the body-style names grid follows the custom radio', () => {
    const { dlg } = setUp();
    dlg.TransferDataToWindow();
    expect(dlg.OnBodyStyle(2).bodyStyleNamesEnabled).toBe(true);
    expect(dlg.OnBodyStyle(1).bodyStyleNamesEnabled).toBe(false);
  });

  it('body-style and jumper rows add, move and delete', () => {
    const { dlg } = setUp();
    dlg.TransferDataToWindow();
    dlg.OnBodyStyle(2);
    dlg.OnAddBodyStyle();
    dlg.OnAddBodyStyle();
    dlg.m_bodyStyleNamesGrid.SetCellValue(0, 0, 'P');
    dlg.m_bodyStyleNamesGrid.SetCellValue(1, 0, 'Q');
    dlg.m_bodyStyleNamesGrid.SetGridCursor(1, 0);
    dlg.OnBodyStyleMoveUp();
    expect(cells(dlg.m_bodyStyleNamesGrid, 0)).toEqual(['Q', 'P']);
    dlg.OnBodyStyleMoveDown();
    expect(cells(dlg.m_bodyStyleNamesGrid, 0)).toEqual(['P', 'Q']);
    dlg.m_bodyStyleNamesGrid.SetGridCursor(0, 0);
    dlg.OnDeleteBodyStyle();
    expect(cells(dlg.m_bodyStyleNamesGrid, 0)).toEqual(['Q']);

    dlg.OnAddJumperGroup();
    expect(dlg.m_jumperGroupsGrid.GetNumberRows()).toBe(2);
    dlg.m_jumperGroupsGrid.SetGridCursor(0, 0);
    dlg.OnRemoveJumperGroup();
    expect(cells(dlg.m_jumperGroupsGrid, 0)).toEqual(['']);
  });

  it('a new field is hidden, at the editor default text size; mandatory rows will not delete', () => {
    const { dlg } = setUp();
    dlg.TransferDataToWindow();
    const before = dlg.m_fields.size();
    dlg.OnAddField();
    const added = dlg.m_fields.at(before);
    expect(added.IsVisible()).toBe(false);
    expect(added.GetTextSize().x).toBe(schIUScale.milsToIU(50));

    dlg.m_grid.SetGridCursor(0, 0);
    dlg.OnDeleteField();
    expect(errors).toEqual([
      `The first ${dlg.m_fields.GetMandatoryRowCount()} fields are mandatory.`,
    ]);
    expect(dlg.m_fields.size()).toBe(before + 1);
  });

  it('footprint filters: add replaces spaces, edit takes the first selected, a double click picks', async () => {
    const { dlg } = setUp();
    dlg.TransferDataToWindow();
    const asked: string[] = [];
    let reply: string | null = 'SOT 23*';
    dlg.ShowTextEntry = async (aLabel, aCaption, aDefault) => {
      asked.push(`${aLabel}|${aCaption}|${aDefault}`);
      return reply;
    };

    await dlg.OnAddFootprintFilter();
    expect(dlg.m_FootprintFilterListBox.GetStrings()).toEqual(['SOIC*', 'DIP*', 'SOT_23*']);
    expect(dlg.m_FootprintFilterListBox.GetSelections()).toEqual([2]);

    reply = '';
    await dlg.OnAddFootprintFilter();
    expect(dlg.m_FootprintFilterListBox.GetCount()).toBe(3);

    dlg.m_FootprintFilterListBox.SetSelection(-1);
    dlg.m_FootprintFilterListBox.SetSelection(1);
    dlg.m_FootprintFilterListBox.SetSelection(0);
    reply = 'SO 8';
    await dlg.OnEditFootprintFilter();
    expect(dlg.m_FootprintFilterListBox.GetStrings()).toEqual(['SO 8', 'DIP*', 'SOT_23*']);

    reply = null;
    await dlg.OnFpFilterDClick(0);
    await dlg.OnFpFilterDClick(-1);
    expect(asked.slice(-2)).toEqual([
      'Filter:|Edit Footprint Filter|SO 8',
      'Filter:|Add Footprint Filter|',
    ]);
  });
});

describe('DialogLibSymbolProperties', () => {
  it('draws the five pages, applies on OK and cancels on Cancel', async () => {
    const { symbol, dlg } = setUp();
    const closes: number[] = [];
    render(<DialogLibSymbolProperties dlg={dlg} units="mils" onClose={(r) => closes.push(r)} />);

    for (const page of [
      'General',
      'Units & Body Styles',
      'Footprint Filters',
      'Pin Connections',
      'Embedded Files',
    ])
      expect(screen.getByRole('tab', { name: page })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Keywords'), { target: { value: 'k2' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(closes).toEqual([wxID_OK]));
    expect(symbol.GetKeyWords()).toBe('k2');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(closes).toEqual([wxID_OK, wxID_CANCEL]);
  });

  it('Read Only disables OK', () => {
    t = symbolEditHarness(LIB);
    const symbol = t.open('U');
    t.frame.SetSymbolOrigin(false, true);
    const dlg = new DIALOG_LIB_SYMBOL_PROPERTIES(t.frame, symbol, HOST);
    render(<DialogLibSymbolProperties dlg={dlg} units="mils" onClose={() => {}} />);
    expect((screen.getByRole('button', { name: 'Read Only' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

describe('DIALOG_LIB_SYMBOL_PROPERTIES details', () => {
  it("a derived symbol gets no copies of its parent's mandatory fields, and its grandparent's rows", () => {
    const d = setUp('D');
    const count = (aName: string) =>
      d.dlg.m_fields.Fields().filter((f) => f.GetName() === aName).length;
    expect(count('Reference')).toBe(1);
    expect(count('Value')).toBe(1);
    t.dispose();

    // DD derives from D, which derives from U: U's Vendor arrives through the recursion.
    const dd = setUp('DD');
    const names = dd.dlg.m_fields.Fields().map((f) => f.GetName());
    expect(names).toContain('Vendor');
    expect(names).toContain('Note');
    const vendor = names.indexOf('Vendor');
    expect(dd.dlg.m_fields.IsInherited(vendor)).toBe(true);
  });

  it('one unit: interchangeable shows checked even when locked, and OK leaves it unlocked', () => {
    const { symbol, dlg } = setUp('V');
    symbol.LockUnits(true);
    dlg.TransferDataToWindow();
    expect(dlg.m_state.m_OptionPartsInterchangeable.value).toBe(true);

    dlg.m_state.m_OptionPartsInterchangeable.value = false;
    dlg.TransferDataFromWindow();
    expect(symbol.UnitsLocked()).toBe(false);
  });

  it('a user field with neither name nor text passes Validate', async () => {
    const { dlg } = setUp();
    dlg.TransferDataToWindow();
    dlg.OnAddField();
    const row = dlg.m_fields.size() - 1;
    dlg.m_fields.at(row).SetName('');
    expect(await dlg.Validate()).toBe(true);
  });

  it('saved user fields are numbered from 42; an empty template field is not saved', () => {
    setEeschemaSettingsProvider(() => ({
      ...EESCHEMA_DEFAULTS,
      drawing: {
        ...EESCHEMA_DEFAULTS.drawing,
        field_names: [{ name: 'Supplier', url: false, visible: true }],
      },
    }));
    const { symbol, dlg } = setUp();
    dlg.TransferDataToWindow();
    const names = dlg.m_fields.Fields().map((f) => f.GetName());
    expect(names).toContain('Supplier');
    expect(dlg.TransferDataFromWindow()).toBe(true);

    const fields: SCH_FIELD[] = [];
    symbol.GetFields(fields);
    expect(fields.some((f) => f.GetName() === 'Supplier')).toBe(false);
    const user = fields.filter((f) => !f.IsMandatory());
    expect(user.map((f) => f.GetOrdinal())).toEqual(user.map((_, i) => 42 + i));
  });

  it('HasPinNumber: a plain number, a stacked pin, and the stacked pin by its own text', () => {
    const { symbol } = setUp('V');
    const pin = symbol.GetGraphicalPins(0, 0)[0]!;
    pin.SetNumber('[5,6]');
    expect(symbol.HasPinNumber('5')).toBe(true);
    expect(symbol.HasPinNumber('6')).toBe(true);
    expect(symbol.HasPinNumber('[5,6]')).toBe(true);
    expect(symbol.HasPinNumber('7')).toBe(false);
  });

  it('the saved user fields keep the order the grid shows (their ordinals follow the rows)', () => {
    const { symbol, dlg } = setUp();
    dlg.TransferDataToWindow();
    const names = () => dlg.m_fields.Fields().map((f) => f.GetName());
    const mpn = names().indexOf('MPN');
    const vendor = names().indexOf('Vendor');
    expect(vendor).toBe(mpn + 1);
    dlg.m_fields.SwapRows(mpn, vendor);
    expect(dlg.TransferDataFromWindow()).toBe(true);

    const fields: SCH_FIELD[] = [];
    symbol.GetFields(fields);
    const order = fields.map((f) => f.GetName()).filter((n) => n === 'MPN' || n === 'Vendor');
    expect(order).toEqual(['Vendor', 'MPN']);
  });
});
