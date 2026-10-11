// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_SWAP_LAYERS' window (dialog_swap_layers.cpp) on its base: LAYER_GRID_TABLE's two
 * columns over the board's copper layers, OK filling the layer map, Cancel leaving it empty.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PCB_LAYER_ID } from '@ziroeda/common/layer_id.js';
import {
  DIALOG_SWAP_LAYERS,
  DialogSwapLayers,
} from '@ziroeda/pcbnew/dialogs/dialog_swap_layers.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';

afterEach(cleanup);

function show() {
  const board = ParseBoard(
    '(kicad_pcb (version 20241229) (generator "t") (layers (0 "F.Cu" signal) (2 "B.Cu" signal)))',
  );
  const map = new Map<PCB_LAYER_ID, PCB_LAYER_ID>();
  const dialog = new DIALOG_SWAP_LAYERS({ GetBoard: () => board }, map);
  dialog.TransferDataToWindow();
  const onResult = vi.fn();
  render(<DialogSwapLayers dialog={dialog} copperLayerCount={2} onResult={onResult} />);
  return { dialog, map, onResult };
}

describe('DIALOG_SWAP_LAYERS window', () => {
  it('heads the grid "Move items on:" / "To layer:", one row per copper layer', () => {
    show();

    expect(screen.getByText('Move items on:')).toBeTruthy();
    expect(screen.getByText('To layer:')).toBeTruthy();
    expect(screen.getAllByText('F.Cu').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('B.Cu').length).toBeGreaterThanOrEqual(2);
  });

  it('OK runs TransferDataFromWindow into the map and answers true', () => {
    const { dialog, map, onResult } = show();

    dialog.SetDestination(0, PCB_LAYER_ID.B_Cu);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onResult).toHaveBeenCalledWith(true);
    expect(map.get(PCB_LAYER_ID.F_Cu)).toBe(PCB_LAYER_ID.B_Cu);
  });

  it('Cancel answers false and fills nothing', () => {
    const { map, onResult } = show();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onResult).toHaveBeenCalledWith(false);
    expect(map.size).toBe(0);
  });
});
