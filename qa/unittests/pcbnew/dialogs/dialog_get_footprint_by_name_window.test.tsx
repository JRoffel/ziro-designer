// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_GET_FOOTPRINT_BY_NAME's window (dialog_get_footprint_by_name.cpp) on its base: a row
 * picked fills the reference (GetFootprintName, up to the first space), a typed reference picks
 * its row without regard to case, an unknown one picks none, and the hint stays hidden (#2227).
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DIALOG_GET_FOOTPRINT_BY_NAME,
  DialogGetFootprintByName,
} from '@ziroeda/pcbnew/dialogs/dialog_get_footprint_by_name.js';
import type { PCB_BASE_FRAME } from '@ziroeda/pcbnew/pcb_base_frame.js';

afterEach(cleanup);

const LIST = ['C1    ( 100n )', 'R1    ( 10k )', 'U3    ( ESP32 )'];

function show() {
  const dialog = new DIALOG_GET_FOOTPRINT_BY_NAME(null as unknown as PCB_BASE_FRAME, LIST);
  const onClose = vi.fn();
  render(<DialogGetFootprintByName dialog={dialog} onClose={onClose} />);
  return { dialog, onClose };
}

const entry = () =>
  screen.getByRole('textbox', { name: 'Reference designator' }) as HTMLInputElement;

describe('DIALOG_GET_FOOTPRINT_BY_NAME window', () => {
  it('titles itself Get and Move Footprint and hides the multiple-items hint', () => {
    show();
    expect(screen.getByText('Get and Move Footprint')).toBeTruthy();
    expect(screen.queryByText(/successive placement/)).toBeNull();
  });

  it('typing a reference selects its row, case-blind; an unknown one selects none', () => {
    const { dialog } = show();

    fireEvent.change(entry(), { target: { value: ' r1 ' } });
    expect(dialog.m_choiceFpListSelection).toBe(1);

    fireEvent.change(entry(), { target: { value: 'R9' } });
    fireEvent.change(entry(), { target: { value: 'U3' } });
    expect(dialog.m_choiceFpListSelection).toBe(2);

    fireEvent.change(entry(), { target: { value: 'R9' } });
    expect(dialog.m_choiceFpListSelection).toBe(-1);
  });

  it('picking a row fills the reference with its name alone', () => {
    const { dialog } = show();

    dialog.m_choiceFpListSelection = 2;
    dialog.OnSelectFootprint();
    expect(dialog.GetValue()).toBe('U3');
  });

  it('OK answers true with the typed value; Cancel answers false', () => {
    const first = show();
    fireEvent.change(entry(), { target: { value: 'C1' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(first.onClose).toHaveBeenCalledWith(true);
    expect(first.dialog.GetValue()).toBe('C1');
    cleanup();

    const second = show();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(second.onClose).toHaveBeenCalledWith(false);
  });
});
