// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_LIB_EDIT_PIN_TABLE (dialog_lib_edit_pin_table.cpp) on a live symbol editor symbol: the
 * filters' setup, adding / deleting / grouping rows, the summary, import and export through the
 * frame's file dialog and the clipboard, OK replacing the symbol's pins, and Cancel's
 * unsaved-changes question.
 */
import { GetClipboardUTF8, SaveClipboard } from '@ziroeda/common/clipboard.js';
import { schIUScale } from '@ziroeda/common/eda_units.js';
import { PIN_ORIENTATION } from '@ziroeda/common/pin_type.js';
import {
  COL_ORDER,
  DIALOG_LIB_EDIT_PIN_TABLE,
  DialogLibEditPinTable,
  ID_CROSSPROBE,
} from '@ziroeda/eeschema/dialogs/dialog_lib_edit_pin_table.js';
import type { LIB_SYMBOL } from '@ziroeda/eeschema/lib_symbol.js';
import type { SCH_PIN } from '@ziroeda/eeschema/sch_pin.js';
import { currentSymbolEditorSettings } from '@ziroeda/eeschema/symbol_editor/symbol_editor_settings.js';
import { wxReadFileSync, wxWriteFileSync } from '@ziroeda/wx/filefn.js';
import { wxID_CANCEL, wxID_OK } from '@ziroeda/wx/menu.js';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { type SYMBOL_EDIT_HARNESS, symbolEditHarness } from '../support/symbol_edit_harness.js';

const prop = (aName: string, aValue: string) =>
  `(property "${aName}" "${aValue}" (at 0 0 0) (effects (font (size 1.27 1.27))))`;
const pin = (aY: number, aName: string, aNumber: string) =>
  `(pin input line (at -5.08 ${aY} 0) (length 2.54) (name "${aName}" (effects (font (size 1.27 1.27)))) (number "${aNumber}" (effects (font (size 1.27 1.27)))))`;

/**
 * Q: two units, pins 1 and 2 named D in unit 1 and pin 3 in unit 2. S: one unit, De Morgan.
 * R: derived from Q.
 */
const LIB = `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  (symbol "Q" ${prop('Reference', 'U')} ${prop('Value', 'Q')}
    (symbol "Q_1_1" ${pin(2.54, 'D', '1')} ${pin(0, 'D', '2')})
    (symbol "Q_2_1" ${pin(0, 'E', '3')}))
  (symbol "S" ${prop('Reference', 'U')} ${prop('Value', 'S')}
    (symbol "S_1_1" ${pin(0, 'X', '1')})
    (symbol "S_1_2" ${pin(0, 'X', '1')}))
  (symbol "R" (extends "Q") ${prop('Reference', 'U')} ${prop('Value', 'R')}))`;

let t: SYMBOL_EDIT_HARNESS;

afterEach(() => {
  cleanup();
  t?.dispose();
});

function setUp(aName = 'Q', aSelected: (s: LIB_SYMBOL) => SCH_PIN[] = () => []) {
  t = symbolEditHarness(LIB);
  t.frame.SetUserUnits('mils');
  const symbol = t.open(aName);
  const dlg = new DIALOG_LIB_EDIT_PIN_TABLE(t.frame, symbol, aSelected(symbol));
  return { symbol, dlg };
}

const numbers = (aDlg: DIALOG_LIB_EDIT_PIN_TABLE): string[] =>
  Array.from({ length: aDlg.m_dataModel.GetNumberRows() }, (_, r) =>
    aDlg.m_dataModel.GetValue(r, COL_ORDER.COL_NUMBER),
  );

describe('DIALOG_LIB_EDIT_PIN_TABLE', () => {
  it('sets up the unit filter for a multi-unit symbol and the body-style filter for De Morgan', () => {
    const q = setUp('Q');
    expect(q.dlg.m_state.unitFilterChoices).toEqual(['ALL', 'A', 'B']);
    expect(q.dlg.m_state.m_unitFilter).toEqual({ value: -1, enabled: true });
    expect(q.dlg.m_state.m_cbFilterByBodyStyle.enabled).toBe(false);
    expect(q.dlg.m_state.m_bodyStyleFilter.enabled).toBe(false);
    t.dispose();

    const s = setUp('S');
    expect(s.dlg.m_state.m_cbFilterByUnit.enabled).toBe(false);
    expect(s.dlg.m_state.bodyStyleFilterChoices).toEqual(['ALL', 'Standard', 'Alternate']);
    expect(s.dlg.m_state.m_bodyStyleFilter).toEqual({ value: -1, enabled: true });
  });

  it('copies the pins, fills the rows and the summary', () => {
    const { symbol, dlg } = setUp();
    const s = dlg.TransferDataToWindow();
    expect(numbers(dlg)).toEqual(['1', '2', '3']);
    expect(s.m_pin_count).toBe('3');
    expect(s.m_pin_numbers_summary).toBe('1-3');
    // PIN_NUMBERS::GetDuplicates() says so when there are none.
    expect(s.m_duplicate_pins).toBe('none');
    // Copies: editing the table leaves the symbol alone until OK.
    expect(dlg.m_pins.some((p) => symbol.GetGraphicalPins(0, 0).includes(p))).toBe(false);
  });

  it('a library symbol is editable; a derived one is read only', () => {
    expect(setUp('Q').dlg.m_state.readOnly).toBe(false);
    t.dispose();
    expect(setUp('R').dlg.m_state.readOnly).toBe(true);
  });

  it('adds a pin like the last, a pin_step below; deletes rows; counts duplicates', () => {
    const { dlg } = setUp();
    dlg.TransferDataToWindow();
    const last = dlg.m_pins[dlg.m_pins.length - 1]!;
    dlg.OnAddRow();
    const added = dlg.m_pins[dlg.m_pins.length - 1]!;
    expect(added.GetUnit()).toBe(last.GetUnit());
    expect(added.GetOrientation()).toBe(PIN_ORIENTATION.PIN_RIGHT);
    expect(added.GetPosition()).toEqual({
      x: last.GetPosition().x,
      y: last.GetPosition().y - schIUScale.milsToIU(currentSymbolEditorSettings().repeat.pin_step),
    });
    expect(dlg.m_state.m_pin_count).toBe('4');

    // A new pin has no number yet; two of them are not duplicates of each other.
    dlg.OnAddRow();
    expect(dlg.m_state.m_duplicate_pins).toBe('none');
    expect(dlg.m_state.m_pin_numbers_summary).toBe('1-3');
    dlg.m_pins.pop();
    dlg.m_dataModel.RemoveRow(dlg.m_dataModel.GetNumberRows() - 1);

    // A second pin numbered 1: a duplicate.
    added.SetNumber('1');
    dlg.OnCellEdited();
    expect(dlg.m_state.m_duplicate_pins).toBe('1');

    dlg.m_grid.SetGridCursor(0, COL_ORDER.COL_NUMBER);
    dlg.OnDeleteRow();
    expect(dlg.m_pins.length).toBe(3);
    expect(dlg.m_state.m_pin_count).toBe('3');
  });

  it('a pin pointing up repeats to the right; an empty table adds a blank pin', () => {
    const { dlg } = setUp('S');
    dlg.TransferDataToWindow();
    const last = dlg.m_pins[dlg.m_pins.length - 1]!;
    last.SetOrientation(PIN_ORIENTATION.PIN_UP);
    dlg.OnAddRow();
    const added = dlg.m_pins[dlg.m_pins.length - 1]!;
    expect(added.GetPosition()).toEqual({
      x: last.GetPosition().x + schIUScale.milsToIU(100),
      y: last.GetPosition().y,
    });

    dlg.m_pins = [];
    dlg.OnAddRow();
    expect(dlg.m_pins.length).toBe(1);
    expect(dlg.m_pins[0]!.GetPosition()).toEqual({ x: 0, y: 0 });
  });

  it('grouping by name, and the filters, rebuild the rows', () => {
    const { dlg } = setUp();
    dlg.TransferDataToWindow();
    dlg.m_state.m_cbGroup = true;
    dlg.OnRebuildRows();
    expect(numbers(dlg)).toEqual(['3', '1, 2']);
    expect(dlg.IsDisplayGrouped()).toBe(true);

    // Choosing a unit ticks its box.
    let s = dlg.OnFilterChoice('m_unitFilter', 1);
    expect(s.m_cbFilterByUnit.value).toBe(true);
    s = dlg.OnFilterCheckBox('m_cbFilterByUnit', false);
    s = dlg.OnFilterCheckBox('m_cbFilterByUnit', true);
    // Checked with no unit chosen: the first (ALL, 0) is.
    expect(s.m_unitFilter.value).toBe(0);
    s = dlg.OnFilterChoice('m_unitFilter', 2);
    expect(s.m_cbFilterByUnit.value).toBe(true);
    expect(numbers(dlg)).toEqual(['3']);
    s = dlg.OnFilterCheckBox('m_cbFilterByUnit', false);
    expect(s.m_unitFilter.value).toBe(-1);
    expect(numbers(dlg)).toEqual(['3', '1, 2']);

    s = dlg.OnFilterCheckBox('m_cbFilterSelected', true);
    expect(s.m_cbFilterSelected).toBe(true);
    expect(numbers(dlg)).toEqual([]);
  });

  it('the body-style filter for a De Morgan symbol', () => {
    const { dlg } = setUp('S');
    dlg.TransferDataToWindow();
    expect(numbers(dlg)).toEqual(['1', '1']);
    let s = dlg.OnFilterChoice('m_bodyStyleFilter', 2);
    expect(s.m_cbFilterByBodyStyle.value).toBe(true);
    expect(dlg.m_dataModel.GetNumberRows()).toBe(1);
    s = dlg.OnFilterCheckBox('m_cbFilterByBodyStyle', false);
    expect(s.m_bodyStyleFilter.value).toBe(-1);
    expect(dlg.m_dataModel.GetNumberRows()).toBe(2);
    s = dlg.OnFilterCheckBox('m_cbFilterByBodyStyle', true);
    expect(s.m_bodyStyleFilter.value).toBe(0);
  });

  it('the filter by selection keeps the pins selected in the editor', () => {
    const { dlg } = setUp('Q', (s) =>
      s.GetGraphicalPins(0, 0).filter((p) => p.GetNumber() === '3'),
    );
    dlg.TransferDataToWindow();
    dlg.OnFilterCheckBox('m_cbFilterSelected', true);
    expect(numbers(dlg)).toEqual(['3']);
  });

  it('Group Selected Pins wants two rows selected, then makes them one row and ungroups', () => {
    const { dlg } = setUp();
    dlg.TransferDataToWindow();
    expect(dlg.OnUpdateUI().groupSelectedEnabled).toBe(false);
    dlg.m_grid.SelectBlock(0, 0, 1, 0);
    expect(dlg.OnUpdateUI().groupSelectedEnabled).toBe(true);
    dlg.m_state.m_cbGroup = true;
    const s = dlg.OnGroupSelected();
    expect(s.m_cbGroup).toBe(false);
    expect(numbers(dlg)[0]).toBe('1, 2');
  });

  it('OK replaces the symbol pins with the table pins', () => {
    const { symbol, dlg } = setUp();
    dlg.TransferDataToWindow();
    dlg.m_dataModel.SetValue(0, COL_ORDER.COL_NAME, 'CLK');
    dlg.OnAddRow();
    expect(dlg.TransferDataFromWindow()).toBe(true);
    const pins = symbol.GetGraphicalPins(0, 0);
    expect(pins.length).toBe(4);
    expect(pins.some((p) => p.GetName() === 'CLK')).toBe(true);
    expect(dlg.m_pins.length).toBe(0);
  });

  it('exports all or only the shown pins, to the file the frame asks for or the clipboard', async () => {
    const { dlg } = setUp();
    dlg.TransferDataToWindow();
    const asked: string[] = [];
    t.frame.FileDialog = async (aTitle: string, _aDir: string, aName: string) => {
      asked.push(`${aTitle}|${aName}`);
      return '/libs/q.csv';
    };

    await dlg.OnExportButtonClick(true);
    expect(asked).toEqual(['Select pin data file|Q.csv']);
    expect(new TextDecoder().decode(wxReadFileSync('/libs/q.csv')!).split('\n').length).toBe(5);

    dlg.OnFilterChoice('m_unitFilter', 2);
    dlg.m_state.exportAllPins = false;
    await dlg.OnExportButtonClick(false);
    expect(
      GetClipboardUTF8()
        .split('\n')
        .filter((l) => l !== '').length,
    ).toBe(2);

    // A cancelled file dialog exports nothing, to the file or the clipboard.
    t.frame.FileDialog = async () => null;
    wxWriteFileSync('/libs/q.csv', new TextEncoder().encode('untouched'));
    SaveClipboard('kept');
    await dlg.OnExportButtonClick(true);
    expect(new TextDecoder().decode(wxReadFileSync('/libs/q.csv')!)).toBe('untouched');
    expect(GetClipboardUTF8()).toBe('kept');
  });

  it('imports by replacing or appending; errors can cancel', async () => {
    const { dlg } = setUp();
    dlg.TransferDataToWindow();
    dlg.m_state.m_cbGroup = true;

    SaveClipboard('Number\tName\n7\tA\n8\tB\n');
    dlg.m_state.replaceAll = false;
    let s = await dlg.OnImportButtonClick(false);
    expect(dlg.m_pins.length).toBe(5);
    expect(s.m_cbGroup).toBe(false);
    expect(s.m_pin_count).toBe('5');

    dlg.m_state.replaceAll = true;
    s = await dlg.OnImportButtonClick(false);
    expect(dlg.m_pins.length).toBe(2);

    // An unknown column: the errors box; Cancel there stops the import.
    SaveClipboard('Number\tColour\n9\tred\n');
    const shown: string[] = [];
    dlg.ShowErrors = async (aMessage) => {
      shown.push(aMessage);
      return false;
    };
    await dlg.OnImportButtonClick(false);
    expect(shown.length).toBe(1);
    expect(dlg.m_pins.length).toBe(2);

    dlg.ShowErrors = async () => true;
    await dlg.OnImportButtonClick(false);
    expect(dlg.m_pins.map((p) => p.GetNumber())).toEqual(['9']);

    // From a file the frame's dialog names.
    wxWriteFileSync('/libs/p.tsv', new TextEncoder().encode('Number\tName\n4\tZ\n'));
    t.frame.FileDialog = async () => '/libs/p.tsv';
    await dlg.OnImportButtonClick(true);
    expect(dlg.m_pins.map((p) => p.GetNumber())).toEqual(['4']);

    // Nothing to import leaves the pins.
    SaveClipboard('');
    await dlg.OnImportButtonClick(false);
    expect(dlg.m_pins.map((p) => p.GetNumber())).toEqual(['4']);
  });

  it('the cross-probe menu toggles its setting', () => {
    const { dlg } = setUp();
    const cfg = currentSymbolEditorSettings();
    const before = cfg.pin_table.crossprobe_on_selection;
    expect(dlg.MenuItems()).toEqual([
      {
        id: ID_CROSSPROBE,
        label: 'Highlight on Cross-probe',
        help: 'Highlight corresponding pin on canvas when it is selected in the table',
        checked: before,
      },
    ]);
    dlg.OnMenu(ID_CROSSPROBE);
    expect(cfg.pin_table.crossprobe_on_selection).toBe(!before);
    dlg.OnMenu(-1);
    expect(cfg.pin_table.crossprobe_on_selection).toBe(!before);
    dlg.OnMenu(0);
    expect(cfg.pin_table.crossprobe_on_selection).toBe(before);
  });

  it('Cancel with no edit closes; with an edit it asks, and Save applies', async () => {
    const { symbol, dlg } = setUp();
    dlg.TransferDataToWindow();
    let asked = 0;
    expect(
      await dlg.OnClose(async () => {
        asked++;
        return 'save';
      }),
    ).toBe(wxID_CANCEL);
    expect(asked).toBe(0);

    dlg.m_dataModel.SetValue(0, COL_ORDER.COL_NAME, 'CLK');
    expect(await dlg.OnClose(async () => 'cancel')).toBeNull();
    expect(await dlg.OnClose(async () => 'discard')).toBe(wxID_CANCEL);
    expect(symbol.GetGraphicalPins(0, 0).some((p) => p.GetName() === 'CLK')).toBe(false);
    expect(await dlg.OnClose(async () => 'save')).toBe(wxID_OK);
    expect(symbol.GetGraphicalPins(0, 0).some((p) => p.GetName() === 'CLK')).toBe(true);
  });
});

describe('DialogLibEditPinTable', () => {
  it('draws the table and closes with OK', async () => {
    const { symbol, dlg } = setUp();
    const closes: number[] = [];
    render(
      <DialogLibEditPinTable
        dlg={dlg}
        onClose={(r) => closes.push(r)}
        askUnsaved={async () => 'discard'}
        showErrors={async () => true}
        showMenu={async () => 0}
      />,
    );

    expect(screen.getByText('Pin count:')).toBeTruthy();
    // The summary and the count, from updateSummary().
    expect(screen.getByText('1-3')).toBeTruthy();
    expect(screen.getByText('none')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(closes).toEqual([wxID_OK]));
    expect(symbol.GetGraphicalPins(0, 0).length).toBe(3);
  });

  it('Cancel goes through OnClose', async () => {
    const { dlg } = setUp();
    const closes: number[] = [];
    render(
      <DialogLibEditPinTable
        dlg={dlg}
        onClose={(r) => closes.push(r)}
        askUnsaved={async () => 'discard'}
        showErrors={async () => true}
        showMenu={async () => 0}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(closes).toEqual([wxID_CANCEL]));
  });
});
