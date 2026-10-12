// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_BOARD_REANNOTATE's window (pcbnew/dialogs/dialog_board_reannotate.cpp) on its base over a
 * live PCB_EDIT_FRAME: Reannotate PCB renumbers in the chosen order as one commit and reports
 * it, the prefix filter, and the digit-only starts.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installPgm } from '@ziroeda/designer/src/editors/pcb/pcb_canvas.js';
import { DialogBoardReannotate } from '@ziroeda/pcbnew/dialogs/dialog_board_reannotate.js';
import { PCB_EDIT_FRAME, type PCB_EDIT_FRAME_HOOKS } from '@ziroeda/pcbnew/pcb_edit_frame.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import { PCBNEW_SETTINGS } from '@ziroeda/pcbnew/pcbnew_settings.js';

afterEach(cleanup);

const fp = (aRef: string, x: number, y: number, n: number) =>
  `(footprint "R" (layer "F.Cu") (at ${x} ${y}) (uuid "00000000-0000-4000-8000-00000000000${n}")
    (property "Reference" "${aRef}" (at 0 -2 0) (layer "F.SilkS") (uuid "00000000-0000-4000-8000-00000000001${n}")
      (effects (font (size 1 1) (thickness 0.15)))))`;

let frame: PCB_EDIT_FRAME;

beforeEach(() => {
  installPgm();
  frame = new PCB_EDIT_FRAME({
    settings: () => new PCBNEW_SETTINGS(),
    onModify: () => {},
  } as unknown as PCB_EDIT_FRAME_HOOKS);
  frame.SetBoard(
    ParseBoard(`(kicad_pcb (version 20241229) (generator "test")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (5 "F.SilkS" user "F.Silkscreen"))
  (net 0 "")
  ${fp('R7', 20, 10, 1)}
  ${fp('R3', 10, 10, 2)})`),
    false,
  );
});

const refs = () =>
  frame
    .GetBoard()!
    .Footprints()
    .map((f) => f.GetReference());

describe('DIALOG_BOARD_REANNOTATE window', () => {
  it('Reannotate PCB numbers left to right from the front start, and says so', async () => {
    render(<DialogBoardReannotate frame={frame} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reannotate PCB' }));
    await waitFor(() => expect(screen.getByText('PCB successfully reannotated')).toBeTruthy());
    expect(refs()).toEqual(['R2', 'R1']);
  });

  it('a prefix keeps only letters, digits and _-+=/\\\\', () => {
    render(<DialogBoardReannotate frame={frame} onClose={() => {}} />);
    const prefix = screen.getByRole('textbox', { name: 'Front prefix' }) as HTMLInputElement;
    fireEvent.change(prefix, { target: { value: 'F_' } });
    fireEvent.change(prefix, { target: { value: 'F_#' } });
    expect(prefix.value).toBe('F_');
  });

  it('the starts take digits only', () => {
    render(<DialogBoardReannotate frame={frame} onClose={() => {}} />);
    const start = screen.getByRole('textbox', {
      name: 'Front reference start',
    }) as HTMLInputElement;
    fireEvent.change(start, { target: { value: '1a0' } });
    expect(start.value).toBe('10');
  });

  it('closes with Close', () => {
    let closed = false;
    render(<DialogBoardReannotate frame={frame} onClose={() => (closed = true)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(closed).toBe(true);
  });
});
