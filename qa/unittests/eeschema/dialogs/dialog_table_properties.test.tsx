// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_TABLE_PROPERTIES over its _base: the WX_GRID with a covered cell filled and read-only,
 * the width entries labelled in the frame units, onBorderChecked's enables, and the override note.
 */
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import {
  DIALOG_TABLE_PROPERTIES,
  DialogTableProperties,
} from '@ziroeda/eeschema/dialogs/dialog_table_properties.js';
import { SCH_TABLE } from '@ziroeda/eeschema/sch_table.js';
import { SCH_TABLECELL } from '@ziroeda/eeschema/sch_tablecell.js';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { schFrame, schToolHarness } from '../support/sch_tool_harness.js';

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => {
  cleanup();
  SetPgm(null);
});

function setUp() {
  const h = schToolHarness(schFrame({}));
  const table = new SCH_TABLE();
  table.SetColCount(2);
  for (const text of ['A', 'B', 'C', 'D']) {
    const cell = new SCH_TABLECELL();
    cell.SetText(text);
    table.AddCell(cell);
  }
  table.Normalize();
  table.GetCell(0, 1)!.SetColSpan(0);
  h.frame.AddToScreen(table, h.frame.GetScreen());
  const dlg = new DIALOG_TABLE_PROPERTIES(h.frame, table);
  return { h, dlg, shown: dlg.TransferDataToWindow() };
}

describe('DIALOG_TABLE_PROPERTIES_BASE', () => {
  it('fills a covered cell with the covered colour and shows the others', () => {
    const { dlg, shown } = setUp();
    const { container } = render(
      <DialogTableProperties
        dlg={dlg}
        initial={shown}
        units="mm"
        onOk={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(container.querySelectorAll('.ze-grid-color-cell')).toHaveLength(1);
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('D')).toBeTruthy();
  });

  it('labels the widths in the frame units', () => {
    const { dlg, shown } = setUp();
    render(
      <DialogTableProperties
        dlg={dlg}
        initial={shown}
        units="mils"
        onOk={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getAllByText('mils')).toHaveLength(2);
  });

  it('a run with both boxes off greys its width', () => {
    const { dlg, shown } = setUp();
    render(
      <DialogTableProperties
        dlg={dlg}
        initial={{ ...shown, borderExternal: true, borderHeader: false }}
        units="mm"
        onOk={() => {}}
        onCancel={() => {}}
      />,
    );
    const width = screen.getByLabelText('Border width') as HTMLInputElement;
    expect(width.disabled).toBe(false);
    fireEvent.click(screen.getByLabelText('External border'));
    expect(width.disabled).toBe(true);
  });

  it('notes overridden item colours in the info bar', () => {
    const { h, dlg, shown } = setUp();
    h.frame.GetColorSettings().SetOverrideSchItemColors(true);
    render(
      <DialogTableProperties
        dlg={dlg}
        initial={shown}
        units="mm"
        onOk={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(
      screen.getByText('Note: individual item colors overridden in Preferences.'),
    ).toBeTruthy();
  });

  it('OK hands the values back', () => {
    const { dlg, shown } = setUp();
    const onOk = vi.fn();
    render(
      <DialogTableProperties
        dlg={dlg}
        initial={shown}
        units="mm"
        onOk={onOk}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText('Row lines'));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onOk.mock.calls[0]![0]).toMatchObject({ separatorRows: !shown.separatorRows });
  });
});
