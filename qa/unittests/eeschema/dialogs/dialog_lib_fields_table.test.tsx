// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_LIB_FIELDS_TABLE (dialog_lib_fields_table.cpp) on a live symbol editor library: the
 * scope's symbols and the field list, the view controls driving the grid, adding / renaming /
 * removing fields, the grid's popup actions, OK writing back through the library manager, and
 * Cancel's unsaved-changes question.
 */
import { SetErrorPresenter, SetQuestionPresenter } from '@ziroeda/common/confirm.js';
import { LIB_ID } from '@ziroeda/common/lib_id.js';
import {
  DIALOG_LIB_FIELDS_TABLE,
  type DIALOG_LIB_FIELDS_TABLE_WINDOW,
  DialogLibFieldsTable,
  MYID_CLEAR_CELL,
  MYID_CREATE_DERIVED_SYMBOL,
  MYID_REVERT_ROW,
  MYID_SELECT_FOOTPRINT,
  SCOPE,
} from '@ziroeda/eeschema/dialogs/dialog_lib_fields_table.js';
import {
  DISPLAY_NAME_COLUMN,
  GROUP_BY_COLUMN,
  SHOW_FIELD_COLUMN,
} from '@ziroeda/eeschema/fields_data_model.js';
import { LIB_FIELDS_EDITOR_GRID_DATA_MODEL } from '@ziroeda/eeschema/lib_fields_data_model.js';
import { currentSymbolEditorSettings } from '@ziroeda/eeschema/symbol_editor/symbol_editor_settings.js';
import { GRIDTRICKS_FIRST_SHOWHIDE } from '@ziroeda/common/grid_tricks.js';
import { GRID_CELL_CHECKBOX_RENDERER } from '@ziroeda/common/widgets/grid_checkbox.js';
import {
  GRID_CELL_FPID_EDITOR,
  GRID_CELL_URL_EDITOR,
} from '@ziroeda/common/widgets/grid_text_button_helpers.js';
import {
  type wxGrid,
  wxGridEvent,
  wxEVT_GRID_CELL_CHANGED,
  wxEVT_GRID_CELL_LEFT_CLICK,
} from '@ziroeda/wx/grid.js';
import { wxID_CANCEL, wxID_OK } from '@ziroeda/wx/menu.js';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { type SYMBOL_EDIT_HARNESS, symbolEditHarness } from '../support/symbol_edit_harness.js';

const prop = (aName: string, aValue: string) =>
  `(property "${aName}" "${aValue}" (at 0 0 0) (effects (font (size 1.27 1.27))))`;
const pin = (aNumber: string) =>
  `(pin input line (at 0 0 0) (length 2.54) (name "A" (effects (font (size 1.27 1.27)))) (number "${aNumber}" (effects (font (size 1.27 1.27)))))`;

/** U: a root with MPN and Vendor; D derives from U; V a root of its own. */
const LIB = `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  (symbol "U" ${prop('Reference', 'U')} ${prop('Value', '10k')} ${prop('MPN', 'X1')} ${prop('Vendor', 'Acme')}
    ${prop('ki_fp_filters', 'R_*')} (symbol "U_1_1" ${pin('1')}))
  (symbol "D" (extends "U") ${prop('Reference', 'U')} ${prop('Value', '22k')})
  (symbol "V" ${prop('Reference', 'V')} ${prop('Value', '1u')} (symbol "V_1_1" ${pin('1')})))`;

let t: SYMBOL_EDIT_HARNESS;
let errors: string[];
let answer: boolean;

function windowStub(aOver: Partial<DIALOG_LIB_FIELDS_TABLE_WINDOW> = {}) {
  const messages: string[] = [];
  const window: DIALOG_LIB_FIELDS_TABLE_WINDOW = {
    textEntry: async () => null,
    handleUnsavedChanges: async () => true,
    messageBox: (m) => messages.push(m),
    newSymbol: async () => null,
    host: {
      ChooseFootprint: async () => null,
      OpenFile: async () => null,
      OpenDocument: () => {},
    },
    ...aOver,
  };
  return { window, messages };
}

function setUp(
  aScope = SCOPE.SCOPE_LIBRARY,
  aOver: Partial<DIALOG_LIB_FIELDS_TABLE_WINDOW> = {},
  aSymbol = 'U',
) {
  errors = [];
  answer = true;
  SetErrorPresenter((m) => {
    errors.push(m);
  });
  SetQuestionPresenter(async () => answer);
  t = symbolEditHarness(LIB, { getTreeLibId: () => new LIB_ID('mine', aSymbol) });
  t.open(aSymbol);
  const { window, messages } = windowStub(aOver);
  const dlg = new DIALOG_LIB_FIELDS_TABLE(t.frame, aScope, window);
  dlg.TransferDataToWindow();
  return { dlg, messages };
}

afterEach(() => {
  cleanup();
  t?.dispose();
  SetErrorPresenter((m) => console.error(m));
  SetQuestionPresenter(async () => false);
});

const col = (d: DIALOG_LIB_FIELDS_TABLE, aName: string) => d.m_dataModel.GetFieldNameCol(aName);
const nameCol = (d: DIALOG_LIB_FIELDS_TABLE) =>
  col(d, LIB_FIELDS_EDITOR_GRID_DATA_MODEL.SYMBOL_NAME);
const names = (d: DIALOG_LIB_FIELDS_TABLE) =>
  Array.from({ length: d.m_dataModel.GetNumberRows() }, (_, r) =>
    d.m_dataModel.GetValue(r, nameCol(d)),
  );
const row = (d: DIALOG_LIB_FIELDS_TABLE, aName: string) => names(d).indexOf(aName);
const viewRow = (d: DIALOG_LIB_FIELDS_TABLE, aField: string) =>
  Array.from({ length: d.m_viewControlsDataModel.GetNumberRows() }, (_, r) =>
    d.m_viewControlsDataModel.GetCanonicalFieldName(r),
  ).indexOf(aField);
const gridEvent = (aGrid: wxGrid, aRow: number, aCol: number, aType: number) =>
  new wxGridEvent(aType, aGrid, aRow, aCol);

describe('DIALOG_LIB_FIELDS_TABLE', () => {
  it('the whole library, sorted by name, with the field list KiCad builds', () => {
    const { dlg } = setUp();
    expect(dlg.m_title).toBe("Symbol Fields Table ('mine' Library)");
    expect(names(dlg)).toEqual(['D', 'U', 'V']);
    expect(dlg.m_choiceScope).toBe(0);

    const fields = Array.from({ length: dlg.m_dataModel.GetNumberCols() }, (_, c) =>
      dlg.m_dataModel.GetColFieldName(c),
    );
    expect(fields).toEqual([
      'Symbol Name',
      'Reference',
      'Value',
      'Footprint',
      'Datasheet',
      'Description',
      'Keywords',
      '${EXCLUDE_FROM_BOM}',
      '${EXCLUDE_FROM_SIM}',
      '${EXCLUDE_FROM_BOARD}',
      'Power',
      'LocalPower',
      'MPN',
      'Vendor',
    ]);
    // Reference and Description are hidden, the rest shown.
    expect(dlg.m_grid.IsColShown(col(dlg, 'Reference'))).toBe(false);
    expect(dlg.m_grid.IsColShown(col(dlg, 'Description'))).toBe(false);
    expect(dlg.m_grid.IsColShown(col(dlg, 'Value'))).toBe(true);
    // The column editors and renderers.
    const attr = (c: number) => dlg.m_dataModel.GetAttr(0, c, 0 as never)!;
    expect(attr(col(dlg, 'Footprint')).GetEditorPtr()).toBeInstanceOf(GRID_CELL_FPID_EDITOR);
    expect(attr(col(dlg, 'Datasheet')).GetEditorPtr()).toBeInstanceOf(GRID_CELL_URL_EDITOR);
    expect(attr(col(dlg, 'Power')).GetRendererPtr()).toBeInstanceOf(GRID_CELL_CHECKBOX_RENDERER);
    // The view controls show Field, Include and Group By.
    expect(dlg.m_viewControlsGrid.IsColShown(1)).toBe(false);
  });

  it('related symbols only: the target symbol root and the symbols derived from it', () => {
    const { dlg } = setUp(SCOPE.SCOPE_RELATED_SYMBOLS, {}, 'D');
    expect(dlg.m_choiceScope).toBe(1);
    expect(names(dlg)).toEqual(['D', 'U']);
    dlg.OnScope(0);
    // Upstream quirk: UpdateFieldList's AddField returns early for a field already listed, so a
    // symbol new to the scope is never put in the data store, and its cells read as missing.
    expect(dlg.m_dataModel.GetNumberRows()).toBe(3);
    expect(names(dlg).filter((n) => n === 'D' || n === 'U')).toEqual(['D', 'U']);
    expect(names(dlg)).not.toContain('V');
  });

  it('an empty library says so', () => {
    errors = [];
    t = symbolEditHarness(LIB, { getTreeLibId: () => new LIB_ID('nowhere', 'X') });
    const { window, messages } = windowStub();
    const dlg = new DIALOG_LIB_FIELDS_TABLE(t.frame, SCOPE.SCOPE_LIBRARY, window);
    dlg.TransferDataToWindow();
    expect(messages).toEqual(["No symbols found in library 'nowhere'."]);
  });

  it('filters, groups and sorts', () => {
    const { dlg } = setUp();
    dlg.OnFilterText('*k');
    expect(names(dlg)).toEqual(['D', 'U']);
    dlg.OnFilterText('');

    // Group by Footprint (all empty): one group of three.
    const fpRow = viewRow(dlg, 'Footprint');
    dlg.m_viewControlsDataModel.SetValueAsBool(fpRow, GROUP_BY_COLUMN, true);
    dlg.OnViewControlsCellChanged(
      gridEvent(dlg.m_viewControlsGrid, fpRow, GROUP_BY_COLUMN, wxEVT_GRID_CELL_CHANGED),
    );
    expect(dlg.m_dataModel.GetNumberRows()).toBe(1);
    expect(dlg.m_modified).toBe(true);
    dlg.OnGroupSymbolsToggled(false);
    expect(dlg.m_dataModel.GetNumberRows()).toBe(3);
    dlg.OnGroupSymbolsToggled(true);

    // Clicking the expander column opens the group.
    dlg.OnTableCellClick(gridEvent(dlg.m_grid, 0, nameCol(dlg), wxEVT_GRID_CELL_LEFT_CLICK));
    expect(dlg.m_dataModel.GetNumberRows()).toBe(4);
  });

  it('the view controls rename a column label and show / hide a column', () => {
    const { dlg } = setUp();
    const r = viewRow(dlg, 'MPN');
    // The display name is not editable in the view controls (VIEW_CONTROLS SetValue ignores
    // it); a change event there puts the grid's label back to it.
    dlg.m_dataModel.SetColLabelValue(col(dlg, 'MPN'), 'Part');
    dlg.OnViewControlsCellChanged(
      gridEvent(dlg.m_viewControlsGrid, r, DISPLAY_NAME_COLUMN, wxEVT_GRID_CELL_CHANGED),
    );
    expect(dlg.m_dataModel.GetColLabelValue(col(dlg, 'MPN'))).toBe('MPN');
    expect(dlg.m_modified).toBe(true);

    dlg.m_viewControlsDataModel.SetValueAsBool(r, SHOW_FIELD_COLUMN, false);
    dlg.OnViewControlsCellChanged(
      gridEvent(dlg.m_viewControlsGrid, r, SHOW_FIELD_COLUMN, wxEVT_GRID_CELL_CHANGED),
    );
    expect(dlg.m_grid.IsColShown(col(dlg, 'MPN'))).toBe(false);
    expect(dlg.m_dataModel.GetShowColumn(col(dlg, 'MPN'))).toBe(false);
  });

  it('adds, renames and removes fields', async () => {
    let reply: string | null = 'Note';
    const { dlg } = setUp(SCOPE.SCOPE_LIBRARY, { textEntry: async () => reply });
    const cols = dlg.m_dataModel.GetNumberCols();
    await dlg.OnAddField();
    expect(dlg.m_dataModel.GetNumberCols()).toBe(cols + 1);
    expect(dlg.m_dataModel.GetColFieldName(cols)).toBe('Note');
    expect(viewRow(dlg, 'Note')).toBe(cols);

    reply = 'Note';
    await dlg.OnAddField();
    expect(errors).toEqual(["Field name 'Note' already in use."]);
    reply = '';
    await dlg.OnAddField();
    expect(errors.at(-1)).toBe('Field must have a name.');

    // Rename the cursor's row.
    dlg.m_viewControlsGrid.SetGridCursor(viewRow(dlg, 'Note'), 0);
    reply = 'Remark';
    await dlg.OnRenameField();
    expect(col(dlg, 'Remark')).toBe(cols);
    expect(viewRow(dlg, 'Remark')).toBe(cols);
    reply = 'MPN';
    await dlg.OnRenameField();
    expect(errors.at(-1)).toBe("Field name 'MPN' already exists.");

    // Remove, after asking.
    answer = false;
    await dlg.OnRemoveField();
    expect(col(dlg, 'Remark')).toBe(cols);
    answer = true;
    await dlg.OnRemoveField();
    expect(col(dlg, 'Remark')).toBe(-1);
    expect(viewRow(dlg, 'Remark')).toBe(-1);
  });

  it('OK writes the edited symbols back through the library manager', () => {
    const { dlg } = setUp();
    dlg.m_dataModel.SetValue(row(dlg, 'V'), col(dlg, 'Value'), '2u');
    dlg.OnModify();
    expect(dlg.OnOk()).toBe(wxID_OK);
    expect(t.frame.GetLibManager().GetSymbol('V', 'mine')!.GetValueField().GetText()).toBe('2u');
    expect(t.frame.GetLibManager().IsSymbolModified('V', 'mine')).toBe(true);
    expect(dlg.m_modified).toBe(false);
  });

  it('the canvas symbol is the one edited, and the canvas is redrawn', () => {
    const { dlg } = setUp();
    const cur = t.frame.GetCurSymbol()!;
    dlg.m_dataModel.SetValue(row(dlg, 'U'), col(dlg, 'Value'), '47k');
    dlg.OnApply();
    expect(cur.GetValueField().GetText()).toBe('47k');
    expect(t.frame.GetScreen()!.IsContentModified()).toBe(true);
  });

  it('Cancel with edits asks; a refusal keeps the dialog', async () => {
    let asked = 0;
    let keep = false;
    const { dlg } = setUp(SCOPE.SCOPE_LIBRARY, {
      handleUnsavedChanges: async () => {
        asked++;
        return !keep;
      },
    });
    expect(await dlg.OnCancel()).toBe(wxID_CANCEL);
    expect(asked).toBe(0);
    dlg.m_dataModel.SetValue(0, col(dlg, 'Value'), 'x');
    keep = true;
    expect(await dlg.OnCancel()).toBeNull();
    keep = false;
    expect(await dlg.OnCancel()).toBe(wxID_CANCEL);
    expect(asked).toBe(2);
  });

  it('the grid popup: clear, revert, derive, footprint, show / hide', async () => {
    let newName: string | null = 'U2';
    let seenNames: readonly string[] = [];
    const parents: string[] = [];
    const { dlg } = setUp(SCOPE.SCOPE_LIBRARY, {
      newSymbol: async (aNames, aParent, aValidator) => {
        seenNames = aNames;
        parents.push(aParent);
        expect(aValidator('U')).toBe(false);
        expect(aValidator('W')).toBe(true);
        return newName;
      },
      host: {
        ChooseFootprint: async () => 'Resistor_SMD:R_0402',
        OpenFile: async () => null,
        OpenDocument: () => {},
      },
    });
    const u = row(dlg, 'U');
    const mpn = col(dlg, 'MPN');
    dlg.m_grid.SetGridCursor(u, mpn);

    await dlg.m_gridTricks.DoPopupSelection(MYID_CLEAR_CELL);
    expect(dlg.m_dataModel.GetValue(u, mpn)).toBe('');
    expect(dlg.m_modified).toBe(true);
    dlg.m_grid.SetGridCursor(u, mpn);
    await dlg.m_gridTricks.DoPopupSelection(MYID_REVERT_ROW);
    expect(dlg.m_dataModel.GetValue(u, mpn)).toBe('X1');
    expect(dlg.m_modified).toBe(false);

    dlg.m_grid.SetGridCursor(u, col(dlg, 'Footprint'));
    await dlg.m_gridTricks.DoPopupSelection(MYID_SELECT_FOOTPRINT);
    expect(dlg.m_dataModel.GetValue(u, col(dlg, 'Footprint'))).toBe('Resistor_SMD:R_0402');

    dlg.m_grid.SetGridCursor(row(dlg, 'U'), mpn);
    await dlg.m_gridTricks.DoPopupSelection(MYID_CREATE_DERIVED_SYMBOL);
    expect(seenNames).toEqual(['U', 'D', 'V']);
    expect(parents).toEqual(['U']);
    expect(names(dlg)).toEqual(['D', 'U', 'U2', 'V']);
    newName = null;
    await dlg.m_gridTricks.DoPopupSelection(MYID_CREATE_DERIVED_SYMBOL);
    expect(names(dlg).length).toBe(4);

    // Show / hide by the popup's own column order.
    const vendor = col(dlg, 'Vendor');
    await dlg.m_gridTricks.DoPopupSelection(GRIDTRICKS_FIRST_SHOWHIDE + vendor);
    expect(dlg.m_grid.IsColShown(vendor)).toBe(false);
    expect(
      dlg.m_viewControlsDataModel.GetValueAsBool(viewRow(dlg, 'Vendor'), SHOW_FIELD_COLUMN),
    ).toBe(false);

    // OK files the derived symbol in the library.
    expect(dlg.OnOk()).toBe(wxID_OK);
    expect(t.frame.GetLibManager().GetSymbol('U2', 'mine')).not.toBeNull();
  });

  it('remembers the sash and the column widths; the sidebar toggles', () => {
    const { dlg } = setUp();
    const cfg = currentSymbolEditorSettings().lib_field_editor;
    cfg.sidebar_collapsed = false;
    dlg.OnSidebarToggle(321);
    expect(cfg.sidebar_collapsed).toBe(true);
    expect(cfg.sash_pos).toBe(321);
    dlg.OnSidebarToggle(999);
    expect(cfg.sidebar_collapsed).toBe(false);
    expect(cfg.sash_pos).toBe(321);

    // Closing with the sidebar collapsed keeps the remembered sash.
    dlg.OnSidebarToggle(400);
    dlg.Destroy(77);
    expect(cfg.sash_pos).toBe(400);
    dlg.OnSidebarToggle(0);

    dlg.m_grid.SetColSize(col(dlg, 'Value'), 123);
    dlg.Destroy(250);
    expect(cfg.sash_pos).toBe(250);
    expect(cfg.field_widths.Value).toBe(123);
    // A hidden column keeps whatever it had.
    expect(cfg.field_widths.Reference).toBeUndefined();
  });
});

describe('DialogLibFieldsTable', () => {
  it('draws, and closes with OK', async () => {
    const { dlg } = setUp();
    const closes: number[] = [];
    render(<DialogLibFieldsTable dialog={dlg} onClose={(r) => closes.push(r)} />);
    expect(screen.getByLabelText('Scope')).toBeTruthy();
    expect(screen.getByText('Group symbols')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(closes).toEqual([wxID_OK]));
  });
});

describe('DIALOG_LIB_FIELDS_TABLE Cancel, saving', () => {
  it('Save in the unsaved-changes question applies the edits', async () => {
    const { dlg } = setUp(SCOPE.SCOPE_LIBRARY, {
      handleUnsavedChanges: async (_aMessage, aSave) => aSave(),
    });
    dlg.m_dataModel.SetValue(row(dlg, 'V'), col(dlg, 'Value'), '3u');
    expect(await dlg.OnCancel()).toBe(wxID_CANCEL);
    expect(t.frame.GetLibManager().GetSymbol('V', 'mine')!.GetValueField().GetText()).toBe('3u');
  });
});
