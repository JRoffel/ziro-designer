// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_CLEANUP_TRACKS_AND_VIAS's window (dialog_cleanup_tracks_and_vias.cpp) on its base: the
 * layer filter offering copper only (SetNotAllowedLayerSet( AllNonCuMask() )), "Build Changes"
 * listing first, a changed option going back to "Build Changes", then "Update PCB" applying.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DIALOG_CLEANUP_TRACKS_AND_VIAS,
  DialogCleanupTracksAndVias,
} from '@ziroeda/pcbnew/dialogs/dialog_cleanup_tracks_and_vias.js';
import { GLOBAL_EDIT_TOOL } from '@ziroeda/pcbnew/tools/global_edit_tool.js';
import { GLOBAL_EDIT_TEST_FRAME } from '../support/global_edit_test_frame.js';
import { toolHarness, U } from '../support/pcb_tool_harness.js';

afterEach(cleanup);

// Two co-linear segments of N1: "Merge co-linear tracks" makes them one.
const BOARD_TEXT = `(kicad_pcb (version 20241229) (generator "pcbnew")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (5 "F.SilkS" user "F.Silkscreen") (25 "Edge.Cuts" user))
  (net 0 "") (net 1 "N1")
  (segment (start 10 10) (end 20 10) (width 0.25) (layer "F.Cu") (net 1) (uuid "${U(20)}"))
  (segment (start 20 10) (end 30 10) (width 0.25) (layer "F.Cu") (net 1) (uuid "${U(21)}")))`;

function show() {
  const h = toolHarness(
    BOARD_TEXT,
    (aBoard) => new GLOBAL_EDIT_TEST_FRAME(aBoard),
    () => [new GLOBAL_EDIT_TOOL()],
  );
  const dialog = new DIALOG_CLEANUP_TRACKS_AND_VIAS(h.frame);
  const onClose = vi.fn();
  render(<DialogCleanupTracksAndVias dialog={dialog} onClose={onClose} />);
  return { h, dialog, onClose };
}

const okButton = (aName: string) => screen.getByRole('button', { name: aName });

describe('DIALOG_CLEANUP_TRACKS_AND_VIAS window', () => {
  it('the layer filter offers copper layers only', () => {
    const { dialog } = show();

    const names = dialog.m_layerFilter.GetRows().map((r) => r.name);
    expect(names).toContain('F.Cu');
    expect(names).toContain('B.Cu');
    expect(names).not.toContain('F.Silkscreen');
    expect(names).not.toContain('Edge.Cuts');
  });

  it('Build Changes lists the merge; a changed option goes back to Build Changes', async () => {
    show();

    fireEvent.click(screen.getByLabelText('Merge co-linear tracks'));
    await act(async () => {
      fireEvent.click(okButton('Build Changes'));
    });
    expect(
      within(screen.getByTestId('cleanup-changes')).queryAllByText(/./).length,
    ).toBeGreaterThan(0);
    expect(okButton('Update PCB')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Delete redundant vias'));
    expect(okButton('Build Changes')).toBeTruthy();
    expect(within(screen.getByTestId('cleanup-changes')).queryAllByText(/./)).toHaveLength(0);
  });

  it('Update PCB merges the tracks and closes', async () => {
    const { h, onClose } = show();

    fireEvent.click(screen.getByLabelText('Merge co-linear tracks'));
    await act(async () => {
      fireEvent.click(okButton('Build Changes'));
    });
    await act(async () => {
      fireEvent.click(okButton('Update PCB'));
    });

    expect(onClose).toHaveBeenCalled();
    expect(h.board.Tracks()).toHaveLength(1);
  });
});
