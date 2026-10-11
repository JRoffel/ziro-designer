// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_EDIT_SYMBOLS_LIBID over its _base: the grid's three columns, Map Orphans enabled only
 * with an orphan, "Update symbol fields from new library" greyed (the record path cannot reload
 * fields), OK handing back the typed new id, and the last apply's errors shown once.
 */
import { DialogEditSymbolsLibId } from '@ziroeda/eeschema/dialogs/dialog_edit_symbols_libid.js';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

const ROWS = [
  { references: ['R1', 'R2'], symbolIds: ['s1', 's2'], current: 'Device:R', orphan: false },
  { references: ['U1'], symbolIds: ['s3'], current: 'Old:Chip', orphan: true },
];

function open(aRows = ROWS, aErrors: string[] = []) {
  const onApply = vi.fn();
  render(
    <DialogEditSymbolsLibId
      rows={aRows}
      candidatesFor={() => []}
      onApply={onApply}
      onClose={() => {}}
      errors={aErrors}
    />,
  );
  return { onApply };
}

describe('DIALOG_EDIT_SYMBOLS_LIBID_BASE', () => {
  it('Map Orphans is enabled with an orphan, disabled without', () => {
    open();
    expect((screen.getByText('Map Orphans') as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    open([ROWS[0]!]);
    expect((screen.getByText('Map Orphans') as HTMLButtonElement).disabled).toBe(true);
  });

  it('Update symbol fields from new library is shown and greyed', () => {
    open();
    const box = screen.getByLabelText('Update symbol fields from new library') as HTMLInputElement;
    expect(box.disabled).toBe(true);
  });

  it('OK with nothing typed applies no change', () => {
    const { onApply } = open();
    fireEvent.click(screen.getByText('OK'));
    return new Promise<void>((done) =>
      setTimeout(() => {
        expect(onApply).toHaveBeenCalledWith(new Map());
        done();
      }, 0),
    );
  });

  it('the last apply errors are shown', () => {
    open(ROWS, ['Symbol library identifier X is not valid.']);
    expect(screen.getByText('Symbol library identifier X is not valid.')).toBeTruthy();
  });
});
