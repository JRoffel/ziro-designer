// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_SHEET_PROPERTIES over its _base: the Fields grid and its buttons, the Attributes and
 * Style boxes, the hierarchical path beside the buttons, the border width in the frame's units,
 * and the window's values reaching OK; Add field grows the grid.
 */
import { resolve } from 'node:path';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import {
  DIALOG_SHEET_PROPERTIES,
  DialogSheetProperties,
  type SHEET_DIALOG_VALUES,
} from '@ziroeda/eeschema/dialogs/dialog_sheet_properties.js';
import type { SHEET_PROPERTIES_RESULT } from '@ziroeda/eeschema/sch_edit_frame.js';
import type { SCH_SHEET } from '@ziroeda/eeschema/sch_sheet.js';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openProject, schFrame, schToolHarness } from '../support/sch_tool_harness.js';

const ORACLE = resolve(__dirname, '../../../data/eeschema/netlist_oracle/complex_hierarchy');
const SHEETS = ['complex_hierarchy.kicad_sch', 'ampli_ht.kicad_sch', 'complex_hierarchy.kicad_pro'];

const HOST = {
  ChooseFootprint: () => Promise.resolve(null),
  OpenFile: () => Promise.resolve(null),
  OpenDocument: () => {},
};

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => {
  cleanup();
  SetPgm(null);
});

function open() {
  const h = schToolHarness(schFrame({}));
  openProject(h.frame, ORACLE, 'complex_hierarchy', SHEETS);
  h.frame.SetCurrentSheet(h.frame.Schematic().Hierarchy()[0]!);
  const sheet = [...h.frame.GetScreen()!.Items().OfType(KICAD_T.SCH_SHEET_T)][0] as SCH_SHEET;
  const result: SHEET_PROPERTIES_RESULT = {
    isUndoable: false,
    clearAnnotation: false,
    updateHierarchyNavigator: false,
  };
  const dlg = new DIALOG_SHEET_PROPERTIES(h.frame, sheet, result, null, HOST, async () => 'ok');
  const onOk = vi.fn<(v: SHEET_DIALOG_VALUES) => void>();
  render(
    <DialogSheetProperties
      dlg={dlg}
      initial={dlg.TransferDataToWindow()}
      units="mils"
      onOk={onOk}
      onCancel={() => {}}
    />,
  );
  return { dlg, onOk };
}

describe('DIALOG_SHEET_PROPERTIES_BASE', () => {
  it('lays out Fields, Attributes, Style and the hierarchical path', () => {
    const { dlg } = open();
    expect(screen.getByRole('dialog', { name: 'Sheet Properties' })).toBeTruthy();
    for (const box of ['Fields', 'Attributes', 'Style']) expect(screen.getByText(box)).toBeTruthy();
    expect(screen.getByText('Hierarchical path:')).toBeTruthy();
    expect(screen.getByText(dlg.HierarchicalPath())).toBeTruthy();
    expect(screen.getByText('mils')).toBeTruthy();
    expect(screen.getByLabelText('Exclude from bill of materials').closest('label')?.title).toMatch(
      /^This is useful for adding symbols for board footprints/,
    );
  });

  it('hands every control to OK', () => {
    const { onOk } = open();
    fireEvent.change(screen.getByLabelText('Page number'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Border width'), { target: { value: '12' } });
    for (const box of [
      'Exclude from simulation',
      'Exclude from bill of materials',
      'Exclude from board',
      'Do not populate',
    ])
      fireEvent.click(screen.getByLabelText(box));
    fireEvent.click(screen.getByText('OK'));
    const v = onOk.mock.calls[0]![0];
    expect(v.pageNumber).toBe('7');
    expect(v.borderWidth).toBe('12');
    expect([v.excludeFromSim, v.excludeFromBom, v.excludeFromBoard, v.dnp]).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it('Add field appends a row to the grid', () => {
    const { dlg } = open();
    const rows = dlg.Grid().GetNumberRows();
    fireEvent.click(screen.getByLabelText('Add field'));
    expect(dlg.Grid().GetNumberRows()).toBe(rows + 1);
  });
});
