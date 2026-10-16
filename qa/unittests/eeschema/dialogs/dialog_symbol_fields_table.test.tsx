// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_SYMBOL_FIELDS_TABLE over its _base: the splitter with the view controls over the (greyed)
 * variants panel, the Edit / Export notebook, the presets as owner-drawn choices (no native
 * <select>), the sidebar toggle Unsplit()ting the left panel, and the export page's controls.
 */
import {
  type KICAD_MESSAGE_DIALOG_ARG,
  SetErrorPresenter,
  SetMessageDialogPresenter,
  SetInfoPresenter,
  SetQuestionPresenter,
} from '@ziroeda/common/confirm.js';
import { FIELD_T } from '@ziroeda/common/template_fieldnames.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import {
  DISPLAY_NAME_COLUMN,
  GROUP_BY_COLUMN,
  LABEL_COLUMN,
  SHOW_FIELD_COLUMN,
} from '@ziroeda/eeschema/fields_data_model.js';
import { GetTextExtent } from '@ziroeda/wx/controls.js';
import { SCH_COMMIT } from '@ziroeda/eeschema/sch_commit.js';
import type { SCH_EDIT_FRAME } from '@ziroeda/eeschema/sch_edit_frame.js';
import type { SCH_SYMBOL } from '@ziroeda/eeschema/sch_symbol.js';
import {
  wxEVT_GRID_CELL_CHANGED,
  wxEVT_GRID_RANGE_SELECTED,
  wxGridCellCoords,
  wxGridEvent,
  wxGridRangeSelectEvent,
} from '@ziroeda/wx/grid.js';
import { wxID_CANCEL } from '@ziroeda/wx/menu.js';
import { SCH_SELECTION_TOOL } from '@ziroeda/eeschema/tools/sch_selection_tool.js';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import {
  DIALOG_SYMBOL_FIELDS_TABLE,
  type DIALOG_SYMBOL_FIELDS_TABLE_WINDOW,
  DialogSymbolFieldsTable,
} from '@ziroeda/eeschema/dialogs/dialog_symbol_fields_table.js';
import { EESCHEMA_DEFAULTS } from '@ziroeda/eeschema/eeschema_settings.js';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schToolHarness } from '../support/sch_tool_harness.js';

let errors: string[] = [];
let infos: string[] = [];
let questions: string[] = [];

beforeEach(() => {
  SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER()));
  errors = [];
  infos = [];
  questions = [];
  SetErrorPresenter((aText) => errors.push(aText));
  SetInfoPresenter(async (aText) => {
    infos.push(aText);
  });
  SetQuestionPresenter(async (aText) => {
    questions.push(aText);
    return true;
  });
});
afterEach(() => {
  cleanup();
  SetPgm(null);
});

/** The live symbols, by reference. */
function symbols(aFrame: SCH_EDIT_FRAME): Map<string, SCH_SYMBOL> {
  const path = aFrame.Schematic().Hierarchy()[0]!;
  const out = new Map<string, SCH_SYMBOL>();
  for (const item of path.LastScreen()!.Items().OfType(KICAD_T.SCH_SYMBOL_T)) {
    const symbol = item as SCH_SYMBOL;
    out.set(symbol.GetRef(path), symbol);
  }
  return out;
}

/** The table's rows as the grid shows them, one string per row: "<Reference>|<Value>". */
function tableRows(aDialog: DIALOG_SYMBOL_FIELDS_TABLE): string[] {
  const m = aDialog.m_dataModel;
  const ref = m.GetFieldNameCol('Reference');
  const value = m.GetFieldNameCol('Value');
  return Array.from(
    { length: m.GetNumberRows() },
    (_, r) => `${m.GetValue(r, ref)}|${m.GetValue(r, value)}`,
  );
}

/** The view-controls row naming \a aField. */
function controlRow(aDialog: DIALOG_SYMBOL_FIELDS_TABLE, aField: string): number {
  const v = aDialog.m_viewControlsDataModel;
  for (let r = 0; r < v.GetNumberRows(); r++) if (v.GetCanonicalFieldName(r) === aField) return r;
  return -1;
}

const SCH = `(kicad_sch (version 20250114) (generator "eeschema")
  (uuid "00000000-0000-0000-0000-0000000000a0")
  (paper "A4")
  (lib_symbols
    (symbol "Device:R" (pin_numbers hide)
      (property "Reference" "R" (at 0 0 0) (effects (font (size 1.27 1.27))))
      (property "Value" "R" (at 0 0 0) (effects (font (size 1.27 1.27))))))
  (symbol (lib_id "Device:R") (at 40 60 0) (unit 1)
    (uuid "00000000-0000-0000-0000-0000000000a1")
    (property "Reference" "R1" (at 40 57 0) (effects (font (size 1.27 1.27))))
    (property "Value" "10k" (at 40 63 0) (effects (font (size 1.27 1.27))))
    (instances (project "t" (path "/00000000-0000-0000-0000-0000000000a0" (reference "R1") (unit 1)))))
  (symbol (lib_id "Device:R") (at 60 60 0) (unit 1)
    (uuid "00000000-0000-0000-0000-0000000000a2")
    (property "Reference" "R2" (at 60 57 0) (effects (font (size 1.27 1.27))))
    (property "Value" "10k" (at 60 63 0) (effects (font (size 1.27 1.27))))
    (instances (project "t" (path "/00000000-0000-0000-0000-0000000000a0" (reference "R2") (unit 1))))))`;

function open(
  aTab: 'edit' | 'export' = 'edit',
  aWindow: Partial<DIALOG_SYMBOL_FIELDS_TABLE_WINDOW> = {},
) {
  const frame = schToolHarness().frame;
  frame.OpenProjectFiles(['/t/t.kicad_sch'], 0, (p) => (p === '/t/t.kicad_sch' ? SCH : null));
  let closed = false;
  const window: DIALOG_SYMBOL_FIELDS_TABLE_WINDOW = {
    textEntry: async () => null,
    listDialog: async () => null,
    handleUnsavedChanges: async () => true,
    saveFileDialog: async () => null,
    writeFile: () => true,
    chooseFootprint: async () => null,
    show: () => {},
    raise: () => {},
    destroy: () => {
      closed = true;
    },
    fieldEditorSettings: () => structuredClone(EESCHEMA_DEFAULTS.field_editor),
    saveFieldEditorSettings: () => {},
    ...aWindow,
  };
  const dialog = new DIALOG_SYMBOL_FIELDS_TABLE(frame, window);
  if (aTab === 'export') dialog.ShowExportTab();
  render(<DialogSymbolFieldsTable dialog={dialog} />);
  return { frame, dialog, closed: () => closed };
}

describe('DIALOG_SYMBOL_FIELDS_TABLE_BASE', () => {
  it('Edit / Export notebook, view presets as a choice, no native select', () => {
    open();
    expect(screen.getByRole('tab', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Export' })).toBeTruthy();
    expect(screen.getByLabelText('View presets')).toBeTruthy();
    expect(document.querySelectorAll('select').length).toBe(0);
  });

  it('the variants panel is shown and greyed', () => {
    open();
    expect(screen.getByText('Schematic variants:').className).toMatch(/disabled/);
    expect((screen.getByLabelText('Add variant') as HTMLButtonElement).disabled).toBe(true);
  });

  it('the sidebar button Unsplit()s the left panel and splits it back', () => {
    open();
    expect(screen.queryByLabelText('View presets')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Collapse left panel'));
    expect(screen.queryByLabelText('View presets')).toBeNull();
    fireEvent.click(screen.getByLabelText('Expand left panel'));
    expect(screen.queryByLabelText('View presets')).toBeTruthy();
  });

  it('the Export page: delimiters, format presets and the preview', () => {
    open('export');
    expect((screen.getByLabelText('Field delimiter') as HTMLInputElement).value).toBe(',');
    expect(screen.getByLabelText('Format presets')).toBeTruthy();
    expect((screen.getByLabelText('Preview') as HTMLTextAreaElement).value).toContain('R1');
  });

  it('clicking Export switches the notebook and fills the preview', () => {
    open('edit');
    fireEvent.click(screen.getByRole('tab', { name: 'Export' }));
    expect(screen.getByRole('tab', { name: 'Export' }).getAttribute('aria-selected')).toBe('true');
    expect((screen.getByLabelText('Preview') as HTMLTextAreaElement).value).toContain('R1');
  });
});

describe('OnSizeViewControlsGrid (dialog_symbol_fields_table.cpp:1342)', () => {
  // The fields grid is as wide as the left pane, whatever its names: Include and Group By
  // take their labels' width, Field and BOM Name split the rest. Ours left the columns to
  // their contents, and a long field name pushed the grid under the right-hand panel.
  const sizes = (aDialog: DIALOG_SYMBOL_FIELDS_TABLE): number[] =>
    [DISPLAY_NAME_COLUMN, LABEL_COLUMN, SHOW_FIELD_COLUMN, GROUP_BY_COLUMN].map(
      (c) => aDialog.m_viewControlsGrid.GetStatedColSize(c) ?? -1,
    );

  it('fits the four columns to the grid window', () => {
    const { dialog } = open();
    dialog.OnSizeViewControlsGrid(400);
    const show = GetTextExtent('Include') + 15;
    const group = GetTextExtent('Group By') + 15;
    const rest = 400 - show - group;
    expect(sizes(dialog)).toEqual([Math.trunc(rest / 2), rest - Math.trunc(rest / 2), show, group]);
  });

  it('never squeezes Field or BOM Name below 60', () => {
    const { dialog } = open();
    dialog.OnSizeViewControlsGrid(100);
    expect(sizes(dialog).slice(0, 2)).toEqual([60, 60]);
  });

  it('gives the whole rest to the one name column that is shown', () => {
    const { dialog } = open();
    dialog.m_viewControlsGrid.HideCol(LABEL_COLUMN);
    dialog.OnSizeViewControlsGrid(400);
    const rest = 400 - (GetTextExtent('Include') + 15) - (GetTextExtent('Group By') + 15);
    expect(sizes(dialog)[0]).toBe(rest);
  });
});

describe('DIALOG_SYMBOL_FIELDS_TABLE on the live schematic', () => {
  /** DefaultEditing groups by Reference, Value and Footprint: the two 10k resistors are one row. */
  it('lists the schematic symbols, grouped as the editing preset says', () => {
    const { dialog } = open();
    expect(tableRows(dialog)).toStrictEqual(['R1, R2|10k']);
  });

  it('ungrouped, each symbol is its own row', () => {
    const { dialog } = open();
    dialog.OnGroupSymbolsToggled(false);
    expect(tableRows(dialog)).toStrictEqual(['R1|10k', 'R2|10k']);
  });

  /** TransferDataFromWindow (dialog_symbol_fields_table.cpp:669-700): ONE SCH_COMMIT. */
  it('OK applies an edited group cell to every symbol in it, as one undo step', () => {
    const { frame, dialog } = open();
    const before = frame.GetUndoCommandCount();
    dialog.m_dataModel.SetValue(0, dialog.m_dataModel.GetFieldNameCol('Value'), '22k');
    expect(dialog.m_dataModel.IsEdited()).toBe(true);
    act(() => dialog.OnOk());
    const live = symbols(frame);
    expect(live.get('R1')!.GetField(FIELD_T.VALUE)!.GetText()).toBe('22k');
    expect(live.get('R2')!.GetField(FIELD_T.VALUE)!.GetText()).toBe('22k');
    expect(frame.GetUndoCommandCount()).toBe(before + 1);
    expect(frame.GetUndoActionDescription()).toBe('Symbol Fields Table Edit');
  });

  it('OK with nothing edited pushes no commit', () => {
    const { frame, dialog } = open();
    const before = frame.GetUndoCommandCount();
    act(() => dialog.OnOk());
    expect(frame.GetUndoCommandCount()).toBe(before);
  });

  /** OnRemoveField (:815-833): the five mandatory rows cannot go. */
  it('refuses to remove a mandatory field', async () => {
    const { dialog } = open();
    dialog.m_viewControlsGrid.SetGridCursor(controlRow(dialog, 'Footprint'), 0);
    await act(() => dialog.OnRemoveField());
    expect(errors).toStrictEqual(['The first 5 fields are mandatory.']);
    expect(controlRow(dialog, 'Footprint')).toBeGreaterThanOrEqual(0);
  });

  it('removes a user field after asking', async () => {
    const { dialog } = open();
    dialog.AddField('MPN', 'MPN', true, false, true);
    dialog.m_viewControlsGrid.SetGridCursor(controlRow(dialog, 'MPN'), 0);
    await act(() => dialog.OnRemoveField());
    expect(questions).toStrictEqual(["Are you sure you want to remove the field 'MPN'?"]);
    expect(controlRow(dialog, 'MPN')).toBe(-1);
    expect(dialog.m_dataModel.GetFieldNameCol('MPN')).toBe(-1);
  });

  /** OnAddField (:782-812): a name already in use is refused, a new one gets a column. */
  it('Add Field refuses a duplicate name and adds a new one', async () => {
    let answer = 'Value';
    const { dialog } = open('edit', { textEntry: async () => answer });
    await act(() => dialog.OnAddField());
    expect(errors).toStrictEqual(["Field name 'Value' already in use."]);
    answer = 'MPN';
    await act(() => dialog.OnAddField());
    expect(controlRow(dialog, 'MPN')).toBeGreaterThan(controlRow(dialog, 'Value'));
    expect(dialog.m_dataModel.GetFieldNameCol('MPN')).toBeGreaterThanOrEqual(0);
  });

  /** OnViewControlsCellChanged (:1132-1215): Quantity cannot be a group-by column. */
  it('refuses to group by the Quantity column', () => {
    const { dialog } = open();
    const row = controlRow(dialog, '${QUANTITY}');
    dialog.m_viewControlsDataModel.SetValueAsBool(row, GROUP_BY_COLUMN, true);
    dialog.OnViewControlsCellChanged(
      new wxGridEvent(wxEVT_GRID_CELL_CHANGED, dialog.m_viewControlsGrid, row, GROUP_BY_COLUMN),
    );
    expect(errors).toStrictEqual(['The Quantity column cannot be grouped by.']);
    expect(dialog.m_viewControlsDataModel.GetValueAsBool(row, GROUP_BY_COLUMN)).toBe(false);
  });

  /** OnExport (:1498-1574): a relative name is the schematic folder's; the preview is written. */
  it('Export writes the preview to the file named on the Export page', async () => {
    const written: [string, string][] = [];
    const { frame, dialog } = open('export', {
      writeFile: (aPath, aText) => {
        written.push([aPath, aText]);
        return true;
      },
    });
    dialog.m_outputFileName = 'bom.csv';
    await act(() => dialog.OnExport());
    expect(written).toHaveLength(1);
    expect(written[0]![0]).toBe('/t/bom.csv');
    expect(written[0]![1]).toBe(dialog.m_textOutput);
    expect(written[0]![1]).toContain('"R1,R2"');
    expect(infos).toStrictEqual(["Wrote BOM output to '/t/bom.csv'"]);
    expect(frame.Schematic().Settings().m_BomExportFileName).toBe('bom.csv');
  });

  it('Export with no file named says so and writes nothing', async () => {
    const written: string[] = [];
    const { dialog } = open('export', { writeFile: (aPath) => written.push(aPath) > 0 });
    dialog.m_outputFileName = '';
    await act(() => dialog.OnExport());
    expect(errors).toStrictEqual(['No output file specified in Export tab.']);
    expect(written).toStrictEqual([]);
  });

  /** SCHEMATIC_LISTENER::OnSchItemsChanged (:2576-2623): an edit on the canvas reaches the table. */
  it('follows a commit made on the schematic while it is open', () => {
    const { frame, dialog } = open();
    dialog.OnGroupSymbolsToggled(false);
    const r2 = symbols(frame).get('R2')!;
    const commit = new SCH_COMMIT(frame);
    commit.Modify(r2, frame.GetScreen());
    r2.GetField(FIELD_T.VALUE)!.SetText('47k');
    act(() => commit.Push('Edit'));
    expect(tableRows(dialog)).toStrictEqual(['R1|10k', 'R2|47k']);
  });

  it('stops following once closed', async () => {
    const { frame, dialog, closed } = open();
    dialog.OnGroupSymbolsToggled(false);
    await act(() => dialog.OnClose());
    expect(closed()).toBe(true);
    const r2 = symbols(frame).get('R2')!;
    const commit = new SCH_COMMIT(frame);
    commit.Modify(r2, frame.GetScreen());
    r2.GetField(FIELD_T.VALUE)!.SetText('47k');
    commit.Push('Edit');
    expect(tableRows(dialog)).toStrictEqual(['R1|10k', 'R2|10k']);
  });

  /** onBomPresetChanged's "Save preset..." row, then savePresetsToSchematic on close. */
  it('saves a view preset into the schematic settings', async () => {
    const { frame, dialog } = open('edit', { textEntry: async () => 'Mine' });
    dialog.OnGroupSymbolsToggled(false);
    await act(() => dialog.onBomPresetChanged(dialog.m_bomPresetChoices.length - 2));
    expect(dialog.m_bomPresetChoices[dialog.m_bomPresetSelection]).toBe('Mine');
    await act(() => dialog.OnClose());
    const saved = frame.Schematic().Settings().m_BomPresets;
    expect(saved.map((p) => p.name)).toStrictEqual(['Mine']);
    expect(saved[0]!.groupSymbols).toBe(false);
  });
});

describe('DIALOG_SYMBOL_FIELDS_TABLE: what it restores and asks', () => {
  /** SetupAllColumnProperties (:469-529): a width saved in field_editor.field_widths wins. */
  it('sizes a column from the saved field width', () => {
    const { dialog } = open('edit', {
      fieldEditorSettings: () => ({
        ...structuredClone(EESCHEMA_DEFAULTS.field_editor),
        field_widths: { Value: 222 },
      }),
    });
    const col = dialog.m_dataModel.GetFieldNameCol('Value');
    expect(dialog.m_grid.GetColSize(col)).toBe(222);
    const header = screen.getByRole('columnheader', { name: /^Value/ }) as HTMLElement;
    expect(header.style.width).toBe('222px');
  });

  /** ~DIALOG_SYMBOL_FIELDS_TABLE writes the shown columns' widths back. */
  it('saves the column widths when it closes', async () => {
    let saved: Record<string, number> = {};
    const { dialog } = open('edit', {
      saveFieldEditorSettings: (v) => {
        saved = v.field_widths;
      },
    });
    dialog.m_grid.SetColSize(dialog.m_dataModel.GetFieldNameCol('Value'), 150);
    await act(() => dialog.OnClose());
    expect(saved.Value).toBe(150);
  });

  /** syncBomPresetSelection (:1797-1889): the table as opened IS "Default Editing". */
  it('shows the preset the table matches, and the separator once it matches none', () => {
    const { dialog } = open();
    expect(dialog.m_bomPresetChoices[dialog.m_bomPresetSelection]).toBe('Default Editing');
    dialog.OnFilterText('R1');
    expect(dialog.m_bomPresetChoices[dialog.m_bomPresetSelection]).toBe('---');
  });

  /** OnExport (:1500-1509): OKOrCancelDialog over unsaved edits; Cancel writes nothing. */
  it('asks before exporting unsaved edits, and Cancel stops the export', async () => {
    const asked: KICAD_MESSAGE_DIALOG_ARG[] = [];
    SetMessageDialogPresenter(async (aArg) => {
      asked.push(aArg);
      return wxID_CANCEL;
    });
    const written: string[] = [];
    const { dialog } = open('export', { writeFile: (aPath) => written.push(aPath) > 0 });
    dialog.m_dataModel.SetValue(0, dialog.m_dataModel.GetFieldNameCol('Value'), '22k');
    dialog.m_outputFileName = 'bom.csv';
    await act(() => dialog.OnExport());
    expect(asked.map((a) => [a.caption, a.message])).toStrictEqual([
      ['Unsaved data', 'Changes have not yet been saved. Export unsaved data?'],
    ]);
    expect(written).toStrictEqual([]);
  });

  /** OnTableRangeSelected (:1285-1369), "Select on Cross-probe": the row's symbols get selected. */
  it('selects the row’s symbols on the canvas in select mode', () => {
    const { frame, dialog } = open('edit', {
      fieldEditorSettings: () => ({
        ...structuredClone(EESCHEMA_DEFAULTS.field_editor),
        selection_mode: 1,
      }),
    });
    dialog.OnGroupSymbolsToggled(false);
    const row = tableRows(dialog).indexOf('R2|10k');
    dialog.OnTableRangeSelected(
      new wxGridRangeSelectEvent(
        wxEVT_GRID_RANGE_SELECTED,
        new wxGridCellCoords(row, 0),
        new wxGridCellCoords(row, 0),
        true,
      ),
    );
    const selection = frame.GetToolManager()!.GetTool(SCH_SELECTION_TOOL)!.GetSelection();
    expect(selection.GetSize()).toBe(1);
    expect(selection.Front() === symbols(frame).get('R2')).toBe(true);
  });
});
