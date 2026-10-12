// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_TABLECELL_PROPERTIES (pcbnew/dialogs/dialog_tablecell_properties.cpp) over live table
 * cells: "-- mixed values --" where the cells disagree and left alone on OK, one commit, the
 * auto-thickness button, and Edit Table...'s return value.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pcbIUScale } from '@ziroeda/common/eda_units.js';
import { GR_TEXT_H_ALIGN_T } from '@ziroeda/common/font/text_attributes.js';
import { INDETERMINATE_STATE } from '@ziroeda/common/widgets/ui_common.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import type { BOARD } from '@ziroeda/pcbnew/board.js';
import {
  DIALOG_TABLECELL_PROPERTIES,
  DialogTableCellProperties,
  TABLECELL_PROPS_RETVALUE,
} from '@ziroeda/pcbnew/dialogs/dialog_tablecell_properties.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import type { PCB_TABLE } from '@ziroeda/pcbnew/pcb_table.js';
import type { PCB_TABLECELL } from '@ziroeda/pcbnew/pcb_tablecell.js';
import { TEST_PCB_FRAME } from '../support/test_pcb_frame.js';

afterEach(cleanup);

const MM = (n: number): number => pcbIUScale.mmToIU(n);

const cell = (text: string, x0: number, y0: number, x1: number, y1: number, size: number) =>
  `(table_cell "${text}" (start ${x0} ${y0}) (end ${x1} ${y1}) (margins 1 1 1 1) (span 1 1)
     (layer "F.SilkS") (uuid "aaaaaaaa-0000-0000-0000-00000000000${text}")
     (effects (font (size ${size} ${size}))))`;

let board: BOARD;
let frame: TEST_PCB_FRAME;

beforeEach(() => {
  board = ParseBoard(`(kicad_pcb (version 20241229) (generator "test")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (5 "F.SilkS" user "F.Silkscreen"))
  (net 0 "")
  (table (column_count 2) (uuid "d6f049b1-ff3f-4087-ba96-404a150d1c9b") (layer "F.SilkS")
    (border (external yes) (header no) (stroke (width 0.2) (type solid)))
    (separators (rows yes) (cols yes) (stroke (width 0.05) (type solid)))
    (column_widths 10 10) (row_heights 5)
    (cells ${cell('1', 0, 0, 10, 5, 1)} ${cell('2', 10, 0, 20, 5, 2)})))`);
  frame = new TEST_PCB_FRAME(board);
});

const cells = (): PCB_TABLECELL[] =>
  (board.Drawings().find((d) => d.Type() === KICAD_T.PCB_TABLE_T) as PCB_TABLE).GetCells();

describe('DIALOG_TABLECELL_PROPERTIES', () => {
  it('shows what the cells share and "-- mixed values --" where they differ', () => {
    const c = new DIALOG_TABLECELL_PROPERTIES(frame, cells()).TransferDataToWindow();
    expect(c.text).toBe(INDETERMINATE_STATE);
    expect(c.height).toBe(INDETERMINATE_STATE);
    expect(c.marginLeft).toBe('1');
    expect(c.autoThickness).toBe(true);
  });

  it('OK leaves a mixed value alone and writes the shared ones, in one commit', () => {
    const d = new DIALOG_TABLECELL_PROPERTIES(frame, cells());
    const c = d.TransferDataToWindow();
    expect(d.TransferDataFromWindow({ ...c, marginLeft: '2', hAlign: 'right' })).toBe(true);
    expect(cells().map((x) => x.GetText())).toEqual(['1', '2']);
    expect(cells().map((x) => x.GetTextHeight())).toEqual([MM(1), MM(2)]);
    expect(cells().map((x) => x.GetMarginLeft())).toEqual([MM(2), MM(2)]);
    expect(cells()[1]!.GetHorizJustify()).toBe(GR_TEXT_H_ALIGN_T.GR_TEXT_H_ALIGN_RIGHT);
    expect(frame.GetUndoCommandCount()).toBe(1);
    expect(d.GetReturnValue()).toBe(TABLECELL_PROPS_RETVALUE.TABLECELL_PROPS_OK);
  });

  it('Edit Table... writes the cells, then answers TABLECELL_PROPS_EDIT_TABLE', () => {
    const d = new DIALOG_TABLECELL_PROPERTIES(frame, [cells()[0]!]);
    const onClose = vi.fn();
    render(<DialogTableCellProperties dialog={d} onClose={onClose} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Cell contents' }), {
      target: { value: 'A' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Edit Table...' }));
    expect(onClose).toHaveBeenCalled();
    expect(cells()[0]!.GetText()).toBe('A');
    expect(d.GetReturnValue()).toBe(TABLECELL_PROPS_RETVALUE.TABLECELL_PROPS_EDIT_TABLE);
  });

  it('the auto-thickness button greys the thickness; unpressed it is live', () => {
    render(
      <DialogTableCellProperties
        dialog={new DIALOG_TABLECELL_PROPERTIES(frame, [cells()[0]!])}
        onClose={() => {}}
      />,
    );
    const thickness = () => screen.getByRole('textbox', { name: 'Thickness' }) as HTMLInputElement;
    expect(thickness().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Adjust the text thickness' }));
    expect(thickness().disabled).toBe(false);
  });
});
