// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_TABLE_PROPERTIES (eeschema/dialogs/dialog_table_properties.cpp) on a live SCH_TABLE: the
 * cells shown with covered ones blank, the -1 separator read back as unticked, OK as one 'Edit
 * Table' commit with cross-references stored as KIIDs, and a pair of line flags both off storing
 * the stroke -1 wide.
 */
import { resolve } from 'node:path';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { LINE_STYLE } from '@ziroeda/common/stroke_params.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import { DIALOG_TABLE_PROPERTIES } from '@ziroeda/eeschema/dialogs/dialog_table_properties.js';
import type { SCH_SYMBOL } from '@ziroeda/eeschema/sch_symbol.js';
import { SCH_TABLE } from '@ziroeda/eeschema/sch_table.js';
import { SCH_TABLECELL } from '@ziroeda/eeschema/sch_tablecell.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openProject, schFrame, schToolHarness } from './support/sch_tool_harness.js';

const ORACLE = resolve(__dirname, '../../data/eeschema/netlist_oracle/complex_hierarchy');
const SHEETS = ['complex_hierarchy.kicad_sch', 'ampli_ht.kicad_sch', 'complex_hierarchy.kicad_pro'];

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => SetPgm(null));

function setUp() {
  const h = schToolHarness(schFrame({}));
  openProject(h.frame, ORACLE, 'complex_hierarchy', SHEETS);
  const root = h.frame.Schematic().Hierarchy()[0]!;
  h.frame.SetCurrentSheet(root);

  // A 2 x 2 table, cells A B / C D.
  const table = new SCH_TABLE();
  table.SetColCount(2);
  for (const text of ['A', 'B', 'C', 'D']) {
    const cell = new SCH_TABLECELL();
    cell.SetText(text);
    table.AddCell(cell);
  }
  table.Normalize();
  h.frame.AddToScreen(table, h.frame.GetScreen());

  return { h, root, table, dlg: new DIALOG_TABLE_PROPERTIES(h.frame, table) };
}

describe('DIALOG_TABLE_PROPERTIES', () => {
  it('shows the cells, a covered one blank, and a -1 separator as unticked boxes', () => {
    const { table, dlg } = setUp();
    table.GetCell(0, 1)!.SetColSpan(0);
    const seps = table.GetSeparatorsStroke().clone();
    seps.SetWidth(-1);
    table.SetSeparatorsStroke(seps);
    table.SetStrokeRows(true);

    const shown = dlg.TransferDataToWindow();

    expect(shown.cellText).toEqual([
      ['A', ''],
      ['C', 'D'],
    ]);
    expect(shown.covered).toEqual([
      [false, true],
      [false, false],
    ]);
    // A -1 stroke never reaches m_separatorsWidth.SetValue(), so its box keeps the base's
    // wxEmptyString.
    expect([shown.separatorRows, shown.separatorWidth]).toEqual([false, '']);
  });

  it('writes the cells and strokes as one commit, refs as KIIDs', () => {
    const { h, root, table, dlg } = setUp();
    const undo = h.frame.GetUndoCommandCount();
    const symbol = [...root.LastScreen()!.Items().OfType(KICAD_T.SCH_SYMBOL_T)].find(
      (s) => !(s as SCH_SYMBOL).GetRef(root).startsWith('#'),
    ) as SCH_SYMBOL;
    const ref = symbol.GetRef(root, true);
    const shown = dlg.TransferDataToWindow();

    expect(
      dlg.TransferDataFromWindow({
        ...shown,
        cellText: [
          [`\${${ref}:VALUE}`, 'B'],
          ['C', 'x'],
        ],
        // 2540 schematic IU is 0.254 mm (the frame's default units); DASH is index 1.
        borderWidth: '0.254',
        borderStyle: 1,
      }),
    ).toBe(true);

    expect(table.GetCell(0, 0)!.GetText()).toBe(
      `\${${root.Path().AsString()}/${symbol.m_Uuid}:VALUE}`,
    );
    expect(table.GetCell(1, 1)!.GetText()).toBe('x');
    expect(table.GetBorderStroke().GetWidth()).toBe(2540);
    expect(table.GetBorderStroke().GetLineStyle()).toBe(LINE_STYLE.DASH);
    expect(h.frame.GetUndoCommandCount()).toBe(undo + 1);
  });

  it('stores a line pair with both flags off as -1 wide', () => {
    const { table, dlg } = setUp();
    const shown = dlg.TransferDataToWindow();

    dlg.TransferDataFromWindow({
      ...shown,
      borderExternal: false,
      borderHeader: false,
      borderWidth: '0.254',
      separatorRows: true,
      separatorCols: false,
      separatorWidth: '0.127',
    });

    expect(table.GetBorderStroke().GetWidth()).toBe(-1);
    expect(table.GetSeparatorsStroke().GetWidth()).toBe(1270);
    expect([table.StrokeRows(), table.StrokeColumns()]).toEqual([true, false]);
  });

  it('the widths follow the frame units', () => {
    const { h, table, dlg } = setUp();
    h.frame.SetUserUnits('mils');
    const shown = dlg.TransferDataToWindow();
    // 2540 IU is 10 mils.
    dlg.TransferDataFromWindow({ ...shown, borderExternal: true, borderWidth: '10' });
    expect(table.GetBorderStroke().GetWidth()).toBe(2540);
  });

  it('onBorderChecked: a run switched on with a negative width takes the default thickness', () => {
    const { dlg } = setUp();
    // m_Drawing.default_line_thickness is 6, which 10.0.6 hands to SetValue() as internal
    // units: 6 IU is 0.0006 mm.
    expect(dlg.DefaultWidthText('-1', true, 'border')).toBe('0.0006');
    expect(dlg.DefaultWidthText('-1', false, 'border')).toBe('-1');
    expect(dlg.DefaultWidthText('0.254', true, 'separators')).toBe('0.254');
  });
});
