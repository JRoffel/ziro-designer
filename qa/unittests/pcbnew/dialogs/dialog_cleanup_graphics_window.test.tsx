// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_CLEANUP_GRAPHICS's window (dialog_cleanup_graphics.cpp) on its base: which options each
 * editor shows, a tick listing the changes at once, a row selected focusing its item
 * (wxEVT_DATAVIEW_SELECTION_CHANGED), and "Update PCB" applying them. The cleaner itself is
 * graphics_cleaner.test.ts's.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DialogCleanupGraphics } from '@ziroeda/pcbnew/dialogs/dialog_cleanup_graphics.js';
import { DIALOG_CLEANUP_GRAPHICS } from '@ziroeda/pcbnew/dialogs/dialog_cleanup_graphics.js';
import { GLOBAL_EDIT_TOOL } from '@ziroeda/pcbnew/tools/global_edit_tool.js';
import { GLOBAL_EDIT_TEST_FRAME } from '../support/global_edit_test_frame.js';
import { toolHarness, U } from '../support/pcb_tool_harness.js';

afterEach(cleanup);

const line = (n: number) =>
  `(gr_line (start 0 0) (end 10 0) (stroke (width 0.1) (type solid)) (layer "F.SilkS") (uuid "${U(n)}"))`;

function show(aFootprintEditor = false) {
  const h = toolHarness(
    `(kicad_pcb (version 20241229) (generator "pcbnew")
      (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (5 "F.SilkS" user "F.Silkscreen") (25 "Edge.Cuts" user))
      (net 0 "") ${line(1)} ${line(2)})`,
    (aBoard) => new GLOBAL_EDIT_TEST_FRAME(aBoard),
    () => [new GLOBAL_EDIT_TOOL()],
  );
  const dialog = new DIALOG_CLEANUP_GRAPHICS(h.frame, aFootprintEditor);
  const onClose = vi.fn();
  render(<DialogCleanupGraphics dialog={dialog} onClose={onClose} />);
  return { h, dialog, onClose };
}

const rows = () => within(screen.getByTestId('cleanupgfx-changes')).queryAllByText(/./);

describe('DIALOG_CLEANUP_GRAPHICS window', () => {
  it('the board editor shows the outline fix and its tolerance, not the pad merge', () => {
    show();

    expect(screen.queryByLabelText('Fix discontinuities in board outlines')).not.toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Tolerance' })).not.toBeNull();
    expect(screen.queryByLabelText('Merge overlapping graphics into pads')).toBeNull();
    expect(screen.getByRole('button', { name: 'Update PCB' })).toBeTruthy();
  });

  it('the footprint editor shows the pad merge and its net tie hint instead', () => {
    show(true);

    expect(screen.queryByLabelText('Merge overlapping graphics into pads')).not.toBeNull();
    expect(screen.queryByText(/Net Tie pad group/)).not.toBeNull();
    expect(screen.queryByLabelText('Fix discontinuities in board outlines')).toBeNull();
    expect(screen.getByRole('button', { name: 'Update Footprint' })).toBeTruthy();
  });

  it('a tick lists the changes at once; selecting an item row focuses it', () => {
    const { h } = show();
    const focus = vi.spyOn(h.frame, 'FocusOnItem').mockImplementation(() => {});

    expect(rows()).toHaveLength(0);
    fireEvent.click(screen.getByLabelText('Delete redundant graphics'));
    expect(rows().length).toBeGreaterThan(0);

    // RC_TREE_MODEL::ToUUID: a marker row with no marker parent names nothing; its item row does.
    fireEvent.click(rows()[0]!);
    expect(focus).not.toHaveBeenCalled();
    fireEvent.click(rows().at(-1)!);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('Update PCB deletes the duplicate and closes', () => {
    const { h, onClose } = show();

    fireEvent.click(screen.getByLabelText('Delete redundant graphics'));
    fireEvent.click(screen.getByRole('button', { name: 'Update PCB' }));

    expect(onClose).toHaveBeenCalled();
    expect(h.board.Drawings()).toHaveLength(1);
  });
});
