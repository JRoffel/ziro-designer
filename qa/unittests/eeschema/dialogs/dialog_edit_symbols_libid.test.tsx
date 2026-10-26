// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_EDIT_SYMBOLS_LIBID's window over its _base: Map Orphans enabled as the dialog says,
 * "Update symbol fields from new library" a live box writing m_checkBoxUpdateFields, an orphan's
 * current id drawn bold italic, and OK closing only when TransferDataFromWindow succeeds - with
 * wxID_OK when the schematic changed (InvokeDialogEditSymbolsLibId's answer).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WX_GRID } from '@ziroeda/common/widgets/wx_grid.js';
import {
  type DIALOG_EDIT_SYMBOLS_LIBID,
  DialogEditSymbolsLibId,
} from '@ziroeda/eeschema/dialogs/dialog_edit_symbols_libid.js';
import { wxID_CANCEL, wxID_OK } from '@ziroeda/wx/menu.js';

afterEach(cleanup);

/** The dialog as the window reads it: a two-row grid, row 1 an orphan. */
function fakeDialog(aOpts: { orphans?: boolean; ok?: boolean; modified?: boolean } = {}) {
  const grid = new WX_GRID();
  grid.CreateGrid(2, 3);
  grid.SetCellValue(0, 0, 'R1, R2');
  grid.SetCellValue(0, 1, 'Device:R');
  grid.SetCellValue(1, 0, 'U1');
  grid.SetCellValue(1, 1, 'Old:Chip');
  const calls: string[] = [];
  const dlg = {
    m_grid: grid,
    m_tricks: { GetCellTooltip: () => '' },
    m_buttonOrphanItemsEnabled: aOpts.orphans ?? true,
    m_checkBoxUpdateFields: false,
    IsMarkedRow: (aRow: number) => aRow === 1,
    onClickOrphansButton: () => {
      calls.push('orphans');
      return Promise.resolve();
    },
    TransferDataFromWindow: () => {
      calls.push('transfer');
      return Promise.resolve(aOpts.ok ?? true);
    },
    IsSchematicModified: () => aOpts.modified ?? true,
  };
  return { dlg: dlg as unknown as DIALOG_EDIT_SYMBOLS_LIBID, calls, raw: dlg };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('DialogEditSymbolsLibId', () => {
  it('Map Orphans follows the dialog, and runs onClickOrphansButton', () => {
    const { dlg, calls } = fakeDialog();
    render(<DialogEditSymbolsLibId dlg={dlg} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Map Orphans'));
    expect(calls).toEqual(['orphans']);

    cleanup();
    render(<DialogEditSymbolsLibId dlg={fakeDialog({ orphans: false }).dlg} onClose={() => {}} />);
    expect((screen.getByText('Map Orphans') as HTMLButtonElement).disabled).toBe(true);
  });

  it('the update-fields box is live and writes m_checkBoxUpdateFields', () => {
    const { dlg, raw } = fakeDialog();
    render(<DialogEditSymbolsLibId dlg={dlg} onClose={() => {}} />);
    const box = screen.getByLabelText('Update symbol fields from new library') as HTMLInputElement;

    expect(box.disabled).toBe(false);
    fireEvent.click(box);
    expect(raw.m_checkBoxUpdateFields).toBe(true);
  });

  it("draws an orphan's current id bold italic", () => {
    render(<DialogEditSymbolsLibId dlg={fakeDialog().dlg} onClose={() => {}} />);
    const orphan = screen.getByText('Old:Chip') as HTMLElement;
    const plain = screen.getByText('Device:R') as HTMLElement;

    expect([orphan.style.fontWeight, orphan.style.fontStyle]).toEqual(['bold', 'italic']);
    expect(plain.style.fontWeight).toBe('');
  });

  it('OK closes with wxID_OK when the schematic changed, wxID_CANCEL when not', async () => {
    const closed: number[] = [];
    render(<DialogEditSymbolsLibId dlg={fakeDialog().dlg} onClose={(r) => closed.push(r)} />);
    fireEvent.click(screen.getByText('OK'));
    await settle();

    cleanup();
    render(
      <DialogEditSymbolsLibId
        dlg={fakeDialog({ modified: false }).dlg}
        onClose={(r) => closed.push(r)}
      />,
    );
    fireEvent.click(screen.getByText('OK'));
    await settle();

    expect(closed).toEqual([wxID_OK, wxID_CANCEL]);
  });

  it('OK stays open when TransferDataFromWindow refuses; Cancel closes', async () => {
    const closed: number[] = [];
    const { dlg, calls } = fakeDialog({ ok: false });
    render(<DialogEditSymbolsLibId dlg={dlg} onClose={(r) => closed.push(r)} />);

    fireEvent.click(screen.getByText('OK'));
    await settle();
    expect([calls, closed]).toEqual([['transfer'], []]);

    fireEvent.click(screen.getByText('Cancel'));
    expect(closed).toEqual([wxID_CANCEL]);
  });
});
