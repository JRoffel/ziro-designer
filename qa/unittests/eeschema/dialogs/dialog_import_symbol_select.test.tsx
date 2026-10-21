// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_IMPORT_SYMBOL_SELECT over its _base (dialog_import_symbol_select.cpp): a library file's
 * symbols listed with the power and already-there icons and derived ones in italics; checking a
 * derived symbol brings its parent; the filter, Select All / None, the status line and the Import
 * button; the unit choice of the symbol previewed; the conflicts dialog and what the import
 * receives.
 */
import { SetErrorPresenter } from '@ziroeda/common/confirm.js';
import {
  DIALOG_IMPORT_SYMBOL_SELECT,
  DialogImportSymbolSelect,
} from '@ziroeda/eeschema/dialogs/dialog_import_symbol_select.js';
import { SCH_FILE_T } from '@ziroeda/eeschema/sch_io/sch_io_mgr.js';
import type { DIALOG_IMPORT_SYMBOL_SELECT_ARG } from '@ziroeda/eeschema/symbol_editor/symbol_editor_import_export.js';
import { CONFLICT_RESOLUTION } from '@ziroeda/eeschema/symbol_import_manager.js';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type SYMBOL_EDIT_HARNESS, symbolEditHarness } from '../support/symbol_edit_harness.js';

const prop = (aName: string, aValue: string) =>
  `(property "${aName}" "${aValue}" (at 0 0 0) (effects (font (size 1.27 1.27))))`;
const body = (aName: string, aUnit = 1) =>
  `(symbol "${aName}_${aUnit}_1" (rectangle (start -2.54 -2.54) (end 2.54 2.54) (stroke (width 0) (type default)) (fill (type none))))`;
/** A root, a power symbol, D derived from A, a two-unit M, and U, which the destination has. */
const SOURCE = `(kicad_symbol_lib (version 20241209) (generator "x")
  (symbol "A" (in_bom yes) (on_board yes) ${prop('Reference', 'U')} ${prop('Value', 'A')} ${body('A')})
  (symbol "PWR" (power) (in_bom yes) (on_board yes) ${prop('Reference', '#PWR')} ${prop('Value', 'PWR')} ${body('PWR')})
  (symbol "D" (extends "A") ${prop('Reference', 'U')} ${prop('Value', 'D')})
  (symbol "M" (in_bom yes) (on_board yes) ${prop('Reference', 'U')} ${prop('Value', 'M')} ${body('M', 1)} ${body('M', 2)})
  (symbol "U" (in_bom yes) (on_board yes) ${prop('Reference', 'U')} ${prop('Value', 'U')} ${body('U')}))`;

let t: SYMBOL_EDIT_HARNESS;
let errors: string[] = [];

function setUp(aSource = SOURCE, aPath = '/libs/src.kicad_sym') {
  errors = [];
  SetErrorPresenter((aText) => {
    errors.push(aText);
  });
  t = symbolEditHarness();
  t.fs.Write(aPath.slice('/libs/'.length), new TextEncoder().encode(aSource));
  return new DIALOG_IMPORT_SYMBOL_SELECT(t.frame, aPath, 'mine', SCH_FILE_T.SCH_KICAD);
}

afterEach(() => {
  cleanup();
  t?.dispose();
  SetErrorPresenter((aText) => console.error(aText));
});

const rowOf = (aDlg: DIALOG_IMPORT_SYMBOL_SELECT, aName: string) =>
  aDlg.m_state.rows.findIndex((r) => r.name === aName);

describe('DIALOG_IMPORT_SYMBOL_SELECT', () => {
  it('lists the file: power and already-there icons, derived symbols marked', () => {
    const dlg = setUp();
    const s = dlg.TransferDataToWindow()!;

    expect(dlg.m_title).toBe('Import Symbols from src.kicad_sym');
    expect(s.rows).toEqual([
      { name: 'A', checked: false, icon: null, derived: false },
      { name: 'D', checked: false, icon: null, derived: true },
      { name: 'M', checked: false, icon: null, derived: false },
      { name: 'PWR', checked: false, icon: 'add_power', derived: false },
      { name: 'U', checked: false, icon: 'small_warning', derived: false },
    ]);
    expect(s.m_statusLine).toBe('0 symbols selected');
    expect(s.okEnabled).toBe(false);
    expect(s.unitChoiceEnabled).toBe(false);
  });

  it('checking a derived symbol brings its parent; unchecking the parent takes the child too', () => {
    const dlg = setUp();
    dlg.TransferDataToWindow();

    let s = dlg.onItemChecked(rowOf(dlg, 'D'), true);
    expect(s.rows.filter((r) => r.checked).map((r) => r.name)).toEqual(['A', 'D']);
    expect(s.m_statusLine).toBe('1 symbols selected, 1 parents auto-included');
    expect(s.okEnabled).toBe(true);
    expect(dlg.GetSelectedSymbols().sort()).toEqual(['A', 'D']);
    // Rebuilt (a filter change), the parent brought along still shows checked.
    expect(dlg.OnFilterTextChanged('').rows.find((r) => r.name === 'A')!.checked).toBe(true);

    s = dlg.onItemChecked(rowOf(dlg, 'A'), false);
    expect(s.rows.filter((r) => r.checked)).toEqual([]);
    expect(s.m_statusLine).toBe('0 symbols selected');
    expect(s.okEnabled).toBe(false);
  });

  it('the filter narrows the list, and Select All / None act on what it shows', () => {
    const dlg = setUp();
    dlg.TransferDataToWindow();

    let s = dlg.OnFilterTextChanged('P');
    expect(s.rows.map((r) => r.name)).toEqual(['PWR']);
    expect(dlg.m_listIndices.get('A')).toBe(-1);

    s = dlg.OnSelectAll();
    expect(s.m_statusLine).toBe('1 symbols selected');
    expect(dlg.GetSelectedSymbols()).toEqual(['PWR']);

    s = dlg.OnFilterTextChanged('');
    expect(s.rows.find((r) => r.name === 'PWR')!.checked).toBe(true);
    s = dlg.OnSelectNone();
    expect(dlg.GetSelectedSymbols()).toEqual([]);
  });

  it('a multi-unit symbol selected offers its units; a single-unit one turns the choice off', () => {
    const dlg = setUp();
    dlg.TransferDataToWindow();

    let s = dlg.OnSymbolSelected(rowOf(dlg, 'M'));
    expect(dlg.m_selectedSymbol).toBe('M');
    expect(s.unitChoices).toEqual(['Unit A', 'Unit B']);
    expect(s.unitChoiceEnabled).toBe(true);
    expect(dlg.OnUnitChanged(1).m_unitChoice).toBe(1);

    s = dlg.OnSymbolSelected(rowOf(dlg, 'A'));
    expect(s.unitChoices).toEqual([]);
    expect(s.unitChoiceEnabled).toBe(false);

    s = dlg.OnSymbolSelected(-1);
    expect(dlg.m_selectedSymbol).toBe('');
  });

  it('a symbol the destination has is a conflict, overwritten unless skipped', () => {
    const dlg = setUp();
    dlg.TransferDataToWindow();
    expect(dlg.BeginResolveConflicts()).toBeNull();

    dlg.onItemChecked(rowOf(dlg, 'U'), true);
    dlg.onItemChecked(rowOf(dlg, 'A'), true);
    expect(dlg.BeginResolveConflicts()).toEqual([{ name: 'U', action: 'Overwrite' }]);
    expect(dlg.GetConflictResolutions().get('U')).toBe(CONFLICT_RESOLUTION.OVERWRITE);

    dlg.SetConflictAction('U', 'Skip');
    const arg = {
      selectedSymbols: [],
      conflictResolutions: new Map(),
    } as unknown as DIALOG_IMPORT_SYMBOL_SELECT_ARG;
    dlg.FillArg(arg);

    expect(arg.selectedSymbols.sort()).toEqual(['A', 'U']);
    expect(arg.conflictResolutions.get('U')).toBe(CONFLICT_RESOLUTION.SKIP);
  });

  it('an empty or unreadable library says so and lists nothing', () => {
    let dlg = setUp('(kicad_symbol_lib (version 20241209) (generator "x"))');
    expect(dlg.TransferDataToWindow()).toBeNull();
    expect(errors).toEqual(["Symbol library '/libs/src.kicad_sym' is empty."]);
    // Left as the base builds it: Import disabled.
    expect(dlg.m_state.okEnabled).toBe(false);

    t.dispose();
    dlg = setUp('(kicad_symbol_lib (version 20241209) (generator "x") (symbol');
    expect(dlg.TransferDataToWindow()).toBeNull();
    expect(errors[0]).toBe("Cannot read symbol library '/libs/src.kicad_sym'.");
  });
});

describe('DialogImportSymbolSelect', () => {
  it('Import with a conflict asks, and Skip All is what the import gets', async () => {
    setUp();
    const arg: DIALOG_IMPORT_SYMBOL_SELECT_ARG = {
      filePath: '/libs/src.kicad_sym',
      destLibrary: 'mine',
      pluginType: SCH_FILE_T.SCH_KICAD,
      selectedSymbols: [],
      conflictResolutions: new Map(),
    };
    const onClose = vi.fn();
    render(<DialogImportSymbolSelect frame={t.frame} arg={arg} onClose={onClose} />);

    expect(screen.getByText('Import Symbols from src.kicad_sym')).toBeTruthy();
    // A derived symbol's name in italics, a root's not.
    expect(screen.getByText('D').closest('.ze-dataview-italic')).toBeTruthy();
    expect(screen.getByText('A').closest('.ze-dataview-italic')).toBeNull();
    const importButton = () =>
      screen.getAllByRole('button', { name: 'Import' })[0] as HTMLButtonElement;
    expect(importButton().disabled).toBe(true);

    fireEvent.click(screen.getByLabelText('Import U'));
    expect(screen.getByText('1 symbols selected')).toBeTruthy();
    fireEvent.click(importButton());

    expect(screen.getByText('Resolve Import Conflicts')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Skip All' }));
    expect((screen.getByLabelText('Action for U') as HTMLInputElement).value).toBe('Skip');
    fireEvent.click(screen.getAllByRole('button', { name: 'Import' }).at(-1)!);

    await waitFor(() => expect(onClose).toHaveBeenCalledWith(5100));
    expect(arg.selectedSymbols).toEqual(['U']);
    expect(arg.conflictResolutions.get('U')).toBe(CONFLICT_RESOLUTION.SKIP);
  });
});
