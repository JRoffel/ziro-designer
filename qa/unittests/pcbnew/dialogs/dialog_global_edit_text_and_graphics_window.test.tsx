// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_GLOBAL_EDIT_TEXT_AND_GRAPHICS's window (dialog_global_edit_text_and_graphics.cpp) on its
 * base: the Apply button (wxDialog's wxID_APPLY default, which the old form left out),
 * m_autoTextThickness as the BITMAP_BUTTON check button greying the thickness, and m_grid's
 * header row.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESET_REASON } from '@ziroeda/common/tool/tool_base.js';
import {
  type DIALOG_GLOBAL_EDIT_TEXT_AND_GRAPHICS,
  DialogGlobalEditTextAndGraphics,
} from '@ziroeda/pcbnew/dialogs/dialog_global_edit_text_and_graphics.js';
import type { PCB_SHAPE } from '@ziroeda/pcbnew/pcb_shape.js';
import { GLOBAL_EDIT_TOOL } from '@ziroeda/pcbnew/tools/global_edit_tool.js';
import { PCB_ACTIONS } from '@ziroeda/pcbnew/tools/pcb_actions.js';
import { GLOBAL_EDIT_TEST_FRAME } from '../support/global_edit_test_frame.js';
import { byUuid, type TOOL_HARNESS, toolHarness, U } from '../support/pcb_tool_harness.js';

afterEach(cleanup);

const MM = (n: number): number => Math.round(n * 1_000_000);

const BOARD_TEXT = `(kicad_pcb (version 20241229) (generator "pcbnew") (generator_version "9.0")
  (general (thickness 1.6) (legacy_teardrops no)) (paper "A4")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (5 "F.SilkS" user "F.Silkscreen") (25 "Edge.Cuts" user))
  (setup (pad_to_mask_clearance 0))
  (net 0 "")
  (gr_line (start 10 50) (end 20 50) (stroke (width 0.1) (type solid)) (layer "F.SilkS") (uuid "${U(31)}"))
)
`;

class FRAME extends GLOBAL_EDIT_TEST_FRAME {
  dialog: DIALOG_GLOBAL_EDIT_TEXT_AND_GRAPHICS | null = null;
  override ShowGlobalEditTextAndGraphicsDialog(
    aDialog: DIALOG_GLOBAL_EDIT_TEXT_AND_GRAPHICS,
  ): void {
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
});

function show() {
  h.mgr.RunAction(PCB_ACTIONS.editTextAndGraphics);
  const onClose = vi.fn();
  render(
    <DialogGlobalEditTextAndGraphics
      dialog={h.frame.dialog!}
      layers={[]}
      defaults={[
        {
          name: 'Silk Layers',
          line: '0.1 mm',
          width: '1 mm',
          height: '1 mm',
          thickness: '0.1 mm',
          italic: false,
          upright: true,
        },
      ]}
      onClose={onClose}
    />,
  );
  return { onClose };
}

const field = (aName: string) => screen.getByRole('textbox', { name: aName }) as HTMLInputElement;

describe('DIALOG_GLOBAL_EDIT_TEXT_AND_GRAPHICS window', () => {
  it('Apply changes the board and leaves the dialog open', () => {
    const { onClose } = show();
    fireEvent.click(screen.getByLabelText('PCB graphic items'));
    fireEvent.change(field('Line thickness'), { target: { value: '0.3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect((byUuid(h.board, 31) as unknown as PCB_SHAPE).GetWidth()).toBe(MM(0.3));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('the auto thickness button is a check button that greys the thickness', () => {
    show();
    const auto = screen.getByRole('button', { name: 'Adjust the text thickness' });
    expect(field('Text thickness').disabled).toBe(false);
    fireEvent.click(auto);
    expect(auto.getAttribute('aria-pressed')).toBe('true');
    expect(field('Text thickness').disabled).toBe(true);
  });

  it('shows the layer defaults under their header row', () => {
    show();
    for (const h of ['Line Thickness', 'Text Width', 'Keep Upright', 'Silk Layers'])
      expect(screen.getByText(h)).toBeTruthy();
  });
});
