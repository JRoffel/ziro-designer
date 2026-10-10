// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_PLOT (dialog_plot.cpp) on DIALOG_PLOT_BASE: SetPlotFormat's option groups and enables,
 * the solder mask alert, OnRightClickLayers' "Select Fab Layers", and Plot writing a Gerber per
 * checked layer into the project folder.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BOARD } from '@ziroeda/pcbnew/board.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import { DialogPcbPlot } from '@ziroeda/pcbnew/dialogs/dialog_plot.js';

afterEach(cleanup);

const DIR = resolve(__dirname, '../../data/pcbnew/plot');
const SOURCE = readFileSync(resolve(DIR, 'gerber_oracle.kicad_pcb'), 'utf8');

function testBoard(): BOARD {
  const k = ParseBoard(SOURCE);
  k.SetFileName('/oracle/gerber_oracle.kicad_pcb');
  return k;
}

/** Select a Combo's option by its accessible name (the popup is the listbox with no label). */
function selectCombo(name: string, optionLabel: string): void {
  fireEvent.click(screen.getByRole('button', { name }));
  const popup = screen.getAllByRole('listbox').find((l) => !l.getAttribute('aria-label'))!;
  fireEvent.mouseDown(within(popup).getByRole('option', { name: optionLabel }));
}

const groupShown = (aLabel: string): boolean =>
  [...document.querySelectorAll('fieldset.ze-sbox > legend')].some((l) => l.textContent === aLabel);

const box = (aLabel: string): HTMLInputElement => screen.getByLabelText(aLabel) as HTMLInputElement;

/** A row's check box in the Include Layers list. */
const layerBox = (aLayer: string): HTMLInputElement =>
  within(screen.getByRole('listbox', { name: 'Include Layers' })).getByLabelText(
    aLayer,
  ) as HTMLInputElement;

function show(board = testBoard(), onOutputFile = vi.fn()) {
  render(
    <DialogPcbPlot
      board={board}
      fileName="gerber_oracle.kicad_pcb"
      units="mm"
      onOutputFile={onOutputFile}
      onClose={vi.fn()}
    />,
  );
  return { board, onOutputFile };
}

describe('DIALOG_PLOT', () => {
  it('opens on Gerber: its options shown, the others hidden, drill marks and mirror greyed', () => {
    show();
    expect(groupShown('Gerber Options')).toBe(true);
    expect(groupShown('PDF Options')).toBe(false);
    expect(groupShown('Postscript Options')).toBe(false);
    expect(box('Mirrored plot').disabled).toBe(true);
    expect(box('Negative plot').disabled).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Drill marks' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('SetPlotFormat( PDF ): the PDF group replaces Gerber, and mirror and negative come back', () => {
    show();
    selectCombo('Plot format', 'PDF');
    expect(groupShown('PDF Options')).toBe(true);
    expect(groupShown('Gerber Options')).toBe(false);
    expect(box('Mirrored plot').disabled).toBe(false);
    expect(box('Negative plot').disabled).toBe(false);
  });

  it('the DNP radios follow the DNP check, and pad numbers follow sketch pads', () => {
    show();
    expect(box('Hide').disabled).toBe(!box('Indicate DNP on fabrication layers').checked);
    fireEvent.click(box('Indicate DNP on fabrication layers'));
    expect(box('Hide').disabled).toBe(!box('Indicate DNP on fabrication layers').checked);
    const sketch = box('Sketch pads on fabrication layers').checked;
    expect(box('Include pad numbers').disabled).toBe(!sketch);
  });

  it('the solder mask alert shows for Gerber only, when a mask expansion is set', () => {
    const board = testBoard();
    board.GetDesignSettings().m_SolderMaskExpansion = 50000;
    show(board);
    expect(screen.queryByText('Board setup')).not.toBeNull();
    selectCombo('Plot format', 'SVG');
    expect(screen.queryByText('Board setup')).toBeNull();
  });

  it('Select Fab Layers checks copper and technical layers, never the courtyards', () => {
    show();
    const list = screen.getByRole('listbox', { name: 'Include Layers' });
    fireEvent.contextMenu(list);
    fireEvent.click(screen.getByText('Select Fab Layers'));
    expect(layerBox('F.Cu').checked).toBe(true);
    expect(layerBox('F.Courtyard').checked).toBe(false);
    expect(layerBox('F.Silkscreen').checked).toBe(true);
  });

  it('Plot writes one Gerber per checked layer, and the job file, into the output folder', async () => {
    const { onOutputFile } = show();
    const list = screen.getByRole('listbox', { name: 'Include Layers' });
    fireEvent.contextMenu(list);
    fireEvent.click(screen.getByText('Deselect All Layers'));
    fireEvent.click(layerBox('F.Cu'));
    fireEvent.change(screen.getByLabelText('Output directory'), { target: { value: 'fab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Plot' }));
    await waitFor(() => expect(onOutputFile).toHaveBeenCalled());
    const paths = onOutputFile.mock.calls.map((c) => c[0] as string);
    expect(paths.filter((p) => p.endsWith('.gbr'))).toEqual(['fab/gerber_oracle-F_Cu.gbr']);
    expect(paths.some((p) => p === 'fab/gerber_oracle-job.gbrjob')).toBe(true);
  });
});
