// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * pcbnew's DIALOG_TABLE_PROPERTIES window (dialog_table_properties.cpp) on its base: the cell
 * grid (mirrored on a back layer, covered cells read-only), onBorderChecked's enables, and OK
 * writing the grid and the binders back.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pcbIUScale } from '@ziroeda/common/eda_units.js';
import { LINE_STYLE } from '@ziroeda/common/stroke_params.js';
import {
  DIALOG_TABLE_PROPERTIES,
  DialogTableProperties,
} from '@ziroeda/pcbnew/dialogs/dialog_table_properties.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import type { PCB_TABLE } from '@ziroeda/pcbnew/pcb_table.js';
import { TEST_PCB_FRAME } from '../support/test_pcb_frame.js';

afterEach(cleanup);

const MM = (n: number): number => pcbIUScale.mmToIU(n);

const cell = (
  text: string,
  n: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  span = '(span 1 1)',
) =>
  `(table_cell "${text}" (start ${x0} ${y0}) (end ${x1} ${y1}) (margins 1 1 1 1) ${span}
        (layer "LAYER") (uuid "aaaaaaaa-0000-4000-8000-00000000000${n}") (effects (font (size 1 1))))`;

function show(layer = 'F.SilkS', spans: string[] = []) {
  const board = ParseBoard(
    `(kicad_pcb (version 20241229) (generator "test")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (5 "F.SilkS" user "F.Silkscreen") (7 "B.SilkS" user "B.Silkscreen"))
  (net 0 "")
  (table (column_count 2) (uuid "d6f049b1-ff3f-4087-ba96-404a150d1c9b") (layer "LAYER")
    (border (external yes) (header no) (stroke (width 0.2) (type solid)))
    (separators (rows yes) (cols yes) (stroke (width 0.05) (type dash)))
    (column_widths 10 10) (row_heights 5 5)
    (cells
      ${cell('A', 1, 0, 0, 10, 5, spans[0])}
      ${cell('B', 2, 10, 0, 20, 5, spans[1])}
      ${cell('C', 3, 0, 5, 10, 10, spans[2])}
      ${cell('D', 4, 10, 5, 20, 10, spans[3])})))`.replaceAll('LAYER', layer),
  );
  const frame = new TEST_PCB_FRAME(board);
  frame.SetUserUnits('mm');
  const table = () => board.Drawings()[0] as PCB_TABLE;
  const onClose = vi.fn();
  const view = render(
    <DialogTableProperties dlg={new DIALOG_TABLE_PROPERTIES(frame, table())} onClose={onClose} />,
  );
  const gridCell = (r: number, c: number): HTMLElement =>
    view.container.querySelector(`td[data-row="${r}"][data-col="${c}"]`)!;
  return { table, onClose, gridCell };
}

const entry = (aLabel: string) => screen.getByLabelText(aLabel) as HTMLInputElement;
const box = (aLabel: string) => screen.getByLabelText(aLabel) as HTMLInputElement;
const combo = (aName: string) => screen.getByRole('button', { name: aName }) as HTMLButtonElement;
const ok = () => fireEvent.click(screen.getByRole('button', { name: 'OK' }));

function selectCombo(aName: string, aOption: string): void {
  fireEvent.click(combo(aName));
  const popup = screen.getAllByRole('listbox').find((l) => !l.getAttribute('aria-label'))!;
  fireEvent.mouseDown(within(popup).getByRole('option', { name: aOption }));
}

describe('pcbnew DIALOG_TABLE_PROPERTIES window', () => {
  it('the grid shows the cells in order on the front', () => {
    const { gridCell } = show();
    expect(gridCell(0, 0).textContent).toBe('A');
    expect(gridCell(0, 1).textContent).toBe('B');
    expect(gridCell(1, 0).textContent).toBe('C');
  });

  it('on a back layer the grid is mirrored', () => {
    const { gridCell } = show('B.SilkS');
    expect(gridCell(0, 0).textContent).toBe('B');
    expect(gridCell(0, 1).textContent).toBe('A');
  });

  it('a typed cell is written to its cell at OK', () => {
    const { table, gridCell, onClose } = show();
    fireEvent.mouseDown(gridCell(1, 1), { button: 0 });
    fireEvent.mouseUp(gridCell(1, 1));
    const input = gridCell(1, 1).querySelector('input')!;
    fireEvent.change(input, { target: { value: 'Z' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    ok();
    expect(table().GetCell(1, 1)!.GetText()).toBe('Z');
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it('a covered cell is drawn as its colour and stays empty', () => {
    const { table, gridCell } = show('F.SilkS', ['(span 2 1)', '(span 0 0)']);
    expect(gridCell(0, 1).textContent).toBe('');
    ok();
    expect(table().GetCell(0, 1)!.GetText()).toBe('');
  });

  it('on a back layer the covered cell is found in the mirrored column', () => {
    // Storage column 1 of row 0 is covered; mirrored, the grid shows it in column 0.
    const { gridCell } = show('B.SilkS', ['(span 2 1)', '(span 0 0)']);
    expect(gridCell(0, 0).textContent).toBe('');
    expect(gridCell(0, 1).textContent).toBe('A');
  });

  it('the border width and style follow the two border boxes', () => {
    show();
    expect(entry('Border width').disabled).toBe(false);
    fireEvent.click(box('External border'));
    expect(entry('Border width').disabled).toBe(true);
    expect(combo('Border style').disabled).toBe(true);
    fireEvent.click(box('Header border'));
    expect(entry('Border width').disabled).toBe(false);
  });

  it('OK writes the typed widths in the frame units, and the chosen style', () => {
    const { table } = show();
    expect(entry('Border width').value).toBe('0.2');
    fireEvent.change(entry('Border width'), { target: { value: '0.3' } });
    selectCombo('Separators style', 'Dotted');
    ok();
    expect(table().GetBorderStroke().GetWidth()).toBe(MM(0.3));
    expect(table().GetSeparatorsStroke().GetLineStyle()).toBe(LINE_STYLE.DOT);
  });

  it('turning both separators off stores no stroke', () => {
    const { table } = show();
    fireEvent.click(box('Row lines'));
    fireEvent.click(box('Column lines'));
    expect(entry('Separators width').disabled).toBe(true);
    ok();
    expect(table().GetSeparatorsStroke().GetWidth()).toBe(-1);
  });

  it('Cancel leaves the table alone', () => {
    const { table, onClose } = show();
    fireEvent.click(box('External border'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledWith(false);
    expect(table().StrokeExternal()).toBe(true);
  });

  it('Syntax help opens its window', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Syntax help' }));
    expect(screen.getByText('Syntax Help')).toBeDefined();
  });
});
