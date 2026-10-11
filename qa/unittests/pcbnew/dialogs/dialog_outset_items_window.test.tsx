// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_OUTSET_ITEMS's window (dialog_outset_items.cpp) on its base: the greyed grid and layer
 * controls following their boxes, typed values reaching the parameters on OK, and the
 * "Line width must be a positive value." error that keeps the dialog open.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PCB_LAYER_ID } from '@ziroeda/common/layer_id.js';
import { pcbIUScale } from '@ziroeda/common/eda_units.js';
import {
  DIALOG_OUTSET_ITEMS,
  DialogOutsetItems,
} from '@ziroeda/pcbnew/dialogs/dialog_outset_items.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import type { OUTSET_PARAMETERS } from '@ziroeda/pcbnew/tools/item_modification_routine.js';
import { TEST_PCB_FRAME } from '../support/test_pcb_frame.js';

afterEach(cleanup);

const MM = pcbIUScale.mmToIU(1);

function show(aOverrides: Partial<OUTSET_PARAMETERS> = {}) {
  const frame = new TEST_PCB_FRAME(
    ParseBoard(
      '(kicad_pcb (version 20241229) (generator "t") (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (35 "F.CrtYd" user)))',
    ),
  );
  const params: OUTSET_PARAMETERS = {
    outsetDistance: 0.25 * MM,
    roundCorners: false,
    useSourceLayers: false,
    useSourceWidths: false,
    layer: PCB_LAYER_ID.F_CrtYd,
    lineWidth: 0.05 * MM,
    gridRounding: null,
    deleteSourceItems: false,
    ...aOverrides,
  };
  const onClose = vi.fn();
  render(<DialogOutsetItems dialog={new DIALOG_OUTSET_ITEMS(frame, params)} onClose={onClose} />);
  return { params, onClose };
}

const entry = (aName: string) => screen.getByRole('textbox', { name: aName }) as HTMLInputElement;
const box = (aLabel: string) => screen.getByLabelText(aLabel) as HTMLInputElement;

describe('DIALOG_OUTSET_ITEMS window', () => {
  it('shows the parameters, with the grid entry greyed while rounding is off', () => {
    show();

    expect(parseFloat(entry('Outset').value)).toBe(0.25);
    expect(parseFloat(entry('Line width').value)).toBe(0.05);
    expect(parseFloat(entry('Grid size').value)).toBe(0.01);
    expect(entry('Grid size').disabled).toBe(true);
    expect(box('Round outwards to grid multiples (when possible)').checked).toBe(false);

    fireEvent.click(box('Round outwards to grid multiples (when possible)'));
    expect(entry('Grid size').disabled).toBe(false);
  });

  it('Copy item layers greys the layer selector', () => {
    show();

    const layer = () => screen.getByRole('button', { name: 'Layer' }) as HTMLButtonElement;
    expect(layer().disabled).toBe(false);
    fireEvent.click(box('Copy item layers'));
    expect(layer().disabled).toBe(true);
  });

  it('OK writes what was typed into the parameters', () => {
    const { params, onClose } = show();

    fireEvent.change(entry('Outset'), { target: { value: '0.5' } });
    fireEvent.click(box('Round corners (when possible)'));
    fireEvent.click(box('Round outwards to grid multiples (when possible)'));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    expect(onClose).toHaveBeenCalledWith(true);
    expect(params.outsetDistance).toBe(0.5 * MM);
    expect(params.roundCorners).toBe(true);
    expect(params.gridRounding).toBe(0.01 * MM);
  });

  it('a zero line width raises the error and leaves the dialog open', () => {
    const { params, onClose } = show();

    fireEvent.change(entry('Line width'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Line width must be a positive value.')).toBeTruthy();
    expect(params.lineWidth).toBe(0.05 * MM);
  });
});
