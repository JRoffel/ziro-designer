// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_GLOBAL_DELETION's window (dialog_global_deletion.cpp) on its base: the item boxes, the
 * lock filters enabled only by their item box, the Layer Filter radio box naming the current
 * layer, and OK / Cancel. What the deletion does is global_deletion.test.ts's.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PCB_LAYER_ID } from '@ziroeda/common/layer_id.js';
import {
  DIALOG_GLOBAL_DELETION,
  DialogGlobalDeletion,
} from '@ziroeda/pcbnew/dialogs/dialog_global_deletion.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import { TEST_PCB_FRAME } from '../support/test_pcb_frame.js';

afterEach(cleanup);

function show() {
  const frame = new TEST_PCB_FRAME(
    ParseBoard(
      '(kicad_pcb (version 20241229) (generator "t") (layers (0 "F.Cu" signal) (2 "B.Cu" signal)))',
    ),
  );
  const dialog = new DIALOG_GLOBAL_DELETION(frame);
  dialog.SetCurrentLayer(PCB_LAYER_ID.B_Cu);
  const onResult = vi.fn();
  render(<DialogGlobalDeletion dialog={dialog} onResult={onResult} />);
  return { dialog, onResult };
}

const box = (aLabel: string) => screen.getByLabelText(aLabel) as HTMLInputElement;

describe('DIALOG_GLOBAL_DELETION window', () => {
  it('opens with nothing to delete and every lock filter greyed', () => {
    show();

    expect(box('Zones').checked).toBe(false);
    expect(box('Tracks & vias').checked).toBe(false);
    expect(box('Unlocked tracks').checked).toBe(true);
    expect(box('Unlocked tracks').disabled).toBe(true);
    expect(box('Locked footprints').disabled).toBe(true);
    expect(box('Locked graphics').disabled).toBe(true);
  });

  it('each item box enables its own lock filters', () => {
    show();

    fireEvent.click(box('Tracks & vias'));
    expect(box('Locked tracks').disabled).toBe(false);
    expect(box('Unlocked vias').disabled).toBe(false);
    expect(box('Locked footprints').disabled).toBe(true);

    fireEvent.click(box('Board outlines'));
    expect(box('Locked graphics').disabled).toBe(false);
  });

  it('the Layer Filter names the current layer and SetCurrentLayer selected All layers', () => {
    const { dialog } = show();

    expect((screen.getByLabelText('All layers') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText('Current layer (B.Cu) only'));
    expect(dialog.m_rbLayersOption).toBe(1);
  });

  it('OK answers true with the boxes set; Cancel answers false', () => {
    const first = show();
    fireEvent.click(box('Markers'));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(first.onResult).toHaveBeenCalledWith(true);
    expect(first.dialog.m_delMarkers).toBe(true);
    cleanup();

    const second = show();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(second.onResult).toHaveBeenCalledWith(false);
  });
});
