// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_GLOBAL_EDIT_TRACKS_AND_VIAS's window (dialog_global_edit_tracks_and_vias.cpp) on its base:
 * the base's Apply button (wxDialog's default wxID_APPLY: Validate and TransferDataFromWindow
 * without closing, which the old form left out), "Apply and Close", and the action controls
 * greying under "Set to net class / custom rule values".
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESET_REASON } from '@ziroeda/common/tool/tool_base.js';
import {
  type DIALOG_GLOBAL_EDIT_TRACKS_AND_VIAS,
  DialogGlobalEditTracksAndVias,
} from '@ziroeda/pcbnew/dialogs/dialog_global_edit_tracks_and_vias.js';
import type { PCB_TRACK } from '@ziroeda/pcbnew/pcb_track.js';
import { GLOBAL_EDIT_TOOL } from '@ziroeda/pcbnew/tools/global_edit_tool.js';
import { PCB_ACTIONS } from '@ziroeda/pcbnew/tools/pcb_actions.js';
import { GLOBAL_EDIT_TEST_FRAME } from '../support/global_edit_test_frame.js';
import { byUuid, type TOOL_HARNESS, toolHarness, U } from '../support/pcb_tool_harness.js';

afterEach(cleanup);

const MM = (n: number): number => Math.round(n * 1_000_000);

const BOARD_TEXT = `(kicad_pcb (version 20241229) (generator "pcbnew") (generator_version "9.0")
  (general (thickness 1.6) (legacy_teardrops no)) (paper "A4")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (25 "Edge.Cuts" user))
  (setup (pad_to_mask_clearance 0))
  (net 0 "") (net 1 "N1")
  (segment (start 10 10) (end 20 10) (width 0.25) (layer "F.Cu") (net 1) (uuid "${U(20)}"))
)
`;

class FRAME extends GLOBAL_EDIT_TEST_FRAME {
  dialog: DIALOG_GLOBAL_EDIT_TRACKS_AND_VIAS | null = null;
  override ShowGlobalEditTracksAndViasDialog(aDialog: DIALOG_GLOBAL_EDIT_TRACKS_AND_VIAS): void {
    this.dialog = aDialog;
  }
}

let h: TOOL_HARNESS<FRAME>;

beforeEach(() => {
  h = toolHarness(
    BOARD_TEXT,
    (aBoard) => new FRAME(aBoard),
    () => [new GLOBAL_EDIT_TOOL()],
  );
  h.mgr.ResetTools(RESET_REASON.MODEL_RELOAD);
  h.board.GetDesignSettings().m_TrackWidthList = [0, MM(0.4), MM(0.5)];
});

function show() {
  h.mgr.RunAction(PCB_ACTIONS.editTracksAndVias);
  const onClose = vi.fn();
  render(
    <DialogGlobalEditTracksAndVias
      dialog={h.frame.dialog!}
      nets={new Map([[1, 'N1']])}
      layers={[]}
      onClose={onClose}
    />,
  );
  return { onClose };
}

const track = (): PCB_TRACK => byUuid(h.board, 20) as unknown as PCB_TRACK;

const pickWidth = (): void => {
  fireEvent.click(screen.getByLabelText('Track width'));
  fireEvent.mouseDown(screen.getByRole('option', { name: /0\.500/ }));
};

describe('DIALOG_GLOBAL_EDIT_TRACKS_AND_VIAS window', () => {
  it('Apply changes the board and leaves the dialog open', () => {
    const { onClose } = show();
    pickWidth();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(track().GetWidth()).toBe(MM(0.5));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Apply and Close changes the board and closes', () => {
    const { onClose } = show();
    pickWidth();
    fireEvent.click(screen.getByRole('button', { name: 'Apply and Close' }));
    expect(track().GetWidth()).toBe(MM(0.5));
    expect(onClose).toHaveBeenCalled();
  });

  it('the Vias box switches every via type with it (onVias)', () => {
    show();
    const through = () => (screen.getByLabelText('Through vias') as HTMLInputElement).checked;
    expect(through()).toBe(true);
    fireEvent.click(screen.getByLabelText('Vias'));
    expect(through()).toBe(false);
  });

  it('net class values grey the specified-value controls', () => {
    show();
    expect((screen.getByLabelText('Track width') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByLabelText('Set to net class / custom rule values'));
    expect((screen.getByLabelText('Track width') as HTMLButtonElement).disabled).toBe(true);
  });
});
