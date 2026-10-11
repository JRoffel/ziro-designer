// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_TARGET_PROPERTIES' window (dialog_target_properties.cpp) on its base: the values in the
 * frame's units, OK writing them, Validate's error keeping the dialog open, Cancel writing nothing.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pcbIUScale } from '@ziroeda/common/eda_units.js';
import {
  DIALOG_TARGET_PROPERTIES,
  DialogTargetProperties,
} from '@ziroeda/pcbnew/dialogs/dialog_target_properties.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import type { PCB_TARGET } from '@ziroeda/pcbnew/pcb_target.js';
import { TEST_PCB_FRAME } from '../support/test_pcb_frame.js';

afterEach(cleanup);

const MM = (n: number): number => pcbIUScale.mmToIU(n);

function show() {
  const board = ParseBoard(`(kicad_pcb (version 20241229) (generator "test")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (25 "Edge.Cuts" user))
  (target plus (at 10 20) (size 4) (width 0.2) (layer "Edge.Cuts")
    (uuid "70000000-0000-4000-8000-000000000001")))`);
  const frame = new TEST_PCB_FRAME(board);
  frame.SetUserUnits('mm');
  const target = () => board.Drawings()[0] as PCB_TARGET;
  const onClose = vi.fn();
  render(
    <DialogTargetProperties
      dialog={new DIALOG_TARGET_PROPERTIES(frame, target())}
      onClose={onClose}
    />,
  );
  return { target, onClose };
}

const entry = (aLabel: string) => screen.getByLabelText(aLabel) as HTMLInputElement;

describe('DIALOG_TARGET_PROPERTIES window', () => {
  it('shows the target in the frame units, with the focus in Size', () => {
    show();

    expect(entry('Size').value).toBe('4');
    expect(entry('Thickness').value).toBe('0.2');
    expect(screen.getAllByText('mm')).toHaveLength(2);
    expect(document.activeElement).toBe(entry('Size'));
  });

  it('OK writes what was typed and closes', () => {
    const { target, onClose } = show();

    fireEvent.change(entry('Size'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onClose).toHaveBeenCalledWith(true);
    expect(target().GetSize()).toBe(MM(6));
  });

  it('a size under one mil raises the error and stays open', () => {
    const { target, onClose } = show();

    fireEvent.change(entry('Size'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(within(document.body).getByText(/^Size must be at least 0\.0254 mm/)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(target().GetSize()).toBe(MM(4));
  });

  it('Cancel closes and writes nothing', () => {
    const { target, onClose } = show();

    fireEvent.change(entry('Size'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledWith(false);
    expect(target().GetSize()).toBe(MM(4));
  });
});
