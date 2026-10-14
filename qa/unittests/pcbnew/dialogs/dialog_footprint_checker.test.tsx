// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_FOOTPRINT_CHECKER (pcbnew/dialogs/dialog_footprint_checker.cpp): Run Checks puts the
 * footprint's own check results on the board as markers and in the tree; Delete All takes them off;
 * the menu's Footprint Checker opens it through FOOTPRINT_EDITOR_CONTROL::CheckFootprint.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installPgm } from '@ziroeda/designer/src/editors/pcb/pcb_canvas.js';
import { DialogFootprintChecker } from '@ziroeda/pcbnew/dialogs/dialog_footprint_checker.js';
import { FOOTPRINT_EDIT_FRAME } from '@ziroeda/pcbnew/footprint_edit_frame.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import { PCB_ACTIONS } from '@ziroeda/pcbnew/tools/pcb_actions.js';
import { attachFootprintFrameCanvas } from '../support/footprint_frame_canvas.js';

afterEach(cleanup);

const U = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
/** A footprint whose through-hole pad has no hole. */
const BOARD_TEXT = `(kicad_pcb (version 20241229) (generator "test")
  (general (thickness 1.6))
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (5 "F.SilkS" user))
  (setup)
  (net 0 "")
  (footprint "Lib:R" (layer "F.Cu") (at 0 0) (uuid "${U(1)}")
    (pad "1" thru_hole circle (at 1 0) (size 1.5 1.5) (drill 0) (layers "*.Cu") (uuid "${U(2)}")))
)`;

let frame: FOOTPRINT_EDIT_FRAME;
let shown = 0;

beforeEach(() => {
  installPgm();
  shown = 0;
  frame = new FOOTPRINT_EDIT_FRAME({ fpEdit: () => {}, showFootprintChecker: () => shown++ });
  attachFootprintFrameCanvas(frame);
  frame.ReloadFootprint(ParseBoard(BOARD_TEXT).GetFirstFootprint()!);
});

const markers = () => frame.GetBoard()!.Markers().length;

describe('DIALOG_FOOTPRINT_CHECKER', () => {
  it('Run Checks reports a hole-less through-hole pad as a marker in the tree', () => {
    render(<DialogFootprintChecker frame={frame} onClose={() => {}} />);
    expect(markers()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Run Checks' }));
    expect(markers()).toBeGreaterThan(0);
    expect(document.body.textContent).toContain('Through hole pad has no hole');
  });

  it('Delete All Markers takes them off the board and out of the tree', () => {
    render(<DialogFootprintChecker frame={frame} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run Checks' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete All Markers' }));
    expect(markers()).toBe(0);
    expect(document.body.textContent).not.toContain('Through hole pad has no hole');
  });

  it('the Footprint Checker action opens it', () => {
    frame.GetToolManager()!.RunAction(PCB_ACTIONS.checkFootprint);
    expect(shown).toBe(1);
  });
});
