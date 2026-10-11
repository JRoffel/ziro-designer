// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_SHAPE_PROPERTIES on a live PCB_SHAPE (dialog_shape_properties.cpp).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { UI_FILL_MODE } from '@ziroeda/common/eda_shape.js';
import { pcbIUScale } from '@ziroeda/common/eda_units.js';
import { LINE_STYLE } from '@ziroeda/common/stroke_params.js';
import type { BOARD } from '@ziroeda/pcbnew/board.js';
import { DIALOG_SHAPE_PROPERTIES } from '@ziroeda/pcbnew/dialogs/dialog_shape_properties.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import type { PCB_SHAPE } from '@ziroeda/pcbnew/pcb_shape.js';
import { TEST_PCB_FRAME } from '../support/test_pcb_frame.js';

const MM = (n: number): number => pcbIUScale.mmToIU(n);

let board: BOARD;
let frame: TEST_PCB_FRAME;
const shape = (i: number) => board.Drawings()[i] as PCB_SHAPE;
const dlg = (i: number) => new DIALOG_SHAPE_PROPERTIES(frame, shape(i));

beforeEach(() => {
  board = ParseBoard(`(kicad_pcb (version 20241229) (generator "test")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (5 "F.SilkS" user "F.Silkscreen") (1 "F.Mask" user))
  (net 0 "")
  (net 1 "GND")
  (gr_rect (start 0 0) (end 10 6) (stroke (width 0.2) (type dash)) (fill no) (layer "F.SilkS")
    (uuid "00000000-0000-4000-8000-000000000001"))
  (gr_line (start 0 10) (end 10 10) (stroke (width 0.2) (type solid)) (layer "F.Cu") (net 1)
    (uuid "00000000-0000-4000-8000-000000000002"))
  (gr_circle (center 20 20) (end 22 20) (stroke (width 0.1) (type solid)) (fill no) (layer "F.SilkS")
    (uuid "00000000-0000-4000-8000-000000000003"))
)`);
  frame = new TEST_PCB_FRAME(board);
});

/** Type into bound control `aIndex`, as wxEVT_TEXT would. */
const type = (d: DIALOG_SHAPE_PROPERTIES, aIndex: number, aText: string) =>
  d.OnBoundCtrlText(aIndex, aText);
const text = (d: DIALOG_SHAPE_PROPERTIES, aIndex: number) => d.GetBoundCtrls()[aIndex]!.text;

describe('DIALOG_SHAPE_PROPERTIES', () => {
  it('a rectangle gets the three rectangle pages, filled from the shape', () => {
    const d = dlg(0);
    const v = d.TransferDataToWindow();
    expect(d.GetWindowShape().pages.map((p) => p.title)).toEqual([
      'By Corners',
      'By Corner and Size',
      'By Center and Size',
    ]);
    // START_X..END_Y, CORNER_X..CORNER_H, CENTER_X..CENTER_H
    expect(d.GetBoundCtrls().map((c) => c.text)).toEqual([
      '0',
      '0',
      '10',
      '6',
      '0',
      '0',
      '10',
      '6',
      '5',
      '3',
      '10',
      '6',
    ]);
    expect(v).toMatchObject({
      lineWidth: MM(0.2),
      lineStyle: LINE_STYLE.DASH,
      roundRect: false,
      cornerRadius: null,
      fillMode: UI_FILL_MODE.NONE,
      layer: 'F.SilkS',
    });
  });

  it('a corner typed on one page moves the size and the center on the others', () => {
    const d = dlg(0);
    d.TransferDataToWindow();
    type(d, 2, '14'); // END_X: OnCornersChange
    expect(text(d, 6)).toBe('14'); // CORNER_W
    expect(text(d, 8)).toBe('7'); // CENTER_X
    type(d, 10, '4'); // CENTER_W: OnCenterSizeChange, start = center - size / 2
    expect([text(d, 0), text(d, 2)]).toEqual(['5', '9']);
  });

  it('a line by length and angle: 90 degrees turns the end up, Y being down', () => {
    const d = dlg(1);
    d.TransferDataToWindow();
    expect([text(d, 6), text(d, 7)]).toEqual(['10', '0']); // LENGTH, ANGLE
    type(d, 7, '90'); // GetRotated( { 10, 0 }, 90 deg ) = { 0, -10 }
    expect([text(d, 2), text(d, 3)]).toEqual(['0', '0']); // END_X, END_Y
    expect([text(d, 10), text(d, 11)]).toEqual(['0', '5']); // MID_X, MID_Y
  });

  it('a line rising to the right reads +45 degrees: updatePolar shows -EDA_ANGLE( p1 - p0 )', () => {
    const d = dlg(1);
    d.TransferDataToWindow();
    type(d, 3, '0'); // END_Y: (0,10) -> (10,0), up and right with Y down
    expect(text(d, 7)).toBe('45');
  });

  it('a circle by radius moves its point on the other page', () => {
    const d = dlg(2);
    d.TransferDataToWindow();
    expect(text(d, 2)).toBe('2'); // RADIUS
    type(d, 2, '3');
    expect([text(d, 5), text(d, 6)]).toEqual(['23', '20']); // PT_PT_X, PT_PT_Y
  });

  it('OK writes the working copy back as one undo step, and the tab is remembered', () => {
    const d = dlg(0);
    const v = d.TransferDataToWindow();
    type(d, 2, '12');
    expect(d.TransferDataFromWindow({ ...v, lineWidth: MM(0.3) }, 2).ok).toBe(true);
    expect(shape(0).GetEnd()).toEqual({ x: MM(12), y: MM(6) });
    expect(shape(0).GetStroke().GetWidth()).toBe(MM(0.3));
    expect(frame.GetUndoCommandCount()).toBe(1);
    expect(dlg(0).GetInitialPage()).toBe(2);
  });

  it('refuses what Validate() refuses, changing nothing', () => {
    const d = dlg(0);
    const v = d.TransferDataToWindow();
    type(d, 2, '0');
    type(d, 3, '0');
    expect(d.TransferDataFromWindow(v).message).toBe('Rectangle cannot be zero-sized.');

    const r = dlg(0);
    const w = r.TransferDataToWindow();
    // shortSide 6 mm: KiROUND( shortSide / 2.0 ) is what m_cornerRadius is reset to
    expect(r.Validate({ ...w, roundRect: true, cornerRadius: MM(4) })).toEqual({
      errors: ['Corner radius must be less than or equal to half the smaller side.'],
      fixedRadius: MM(3),
    });
    expect(r.Validate({ ...w, lineWidth: 0 }).errors).toEqual([
      'Line width must be greater than zero for an unfilled rectangle.',
    ]);
    expect(r.Validate({ ...w, lineWidth: 0, fillMode: UI_FILL_MODE.SOLID }).errors).toEqual([]);
    expect(frame.GetUndoCommandCount()).toBe(0);
  });

  it('a copper graphic keeps its net; moved off copper it has none', () => {
    const v = dlg(1).TransferDataToWindow();
    expect(v.net).toBe(1);
    dlg(1).TransferDataFromWindow({ ...v, layer: 'F.SilkS' });
    // SetNetCode( -1 ) is NETINFO_LIST::OrphanedItem(), whose netcode is UNCONNECTED, 0.
    expect(shape(1).GetNetCode()).toBe(0);
    expect(DIALOG_SHAPE_PROPERTIES.NetEnabled('F.Cu')).toBe(true);
    expect(DIALOG_SHAPE_PROPERTIES.NetEnabled('F.SilkS')).toBe(false);
  });

  it('a line, an arc and a bezier have no Fill; only a rectangle is rounded', () => {
    expect(dlg(1).GetWindowShape()).toMatchObject({ fillShown: false, roundRectShown: false });
    expect(dlg(0).GetWindowShape()).toMatchObject({ fillShown: true, roundRectShown: true });
    expect(dlg(2).GetWindowShape()).toMatchObject({ fillShown: true, roundRectShown: false });
  });

  it('the solder mask flag and its margin override', () => {
    const v = dlg(1).TransferDataToWindow();
    dlg(1).TransferDataFromWindow({ ...v, hasMask: true, maskMargin: MM(0.05) });
    expect(shape(1).HasSolderMask()).toBe(true);
    expect(shape(1).GetLocalSolderMaskMargin()).toBe(MM(0.05));
    dlg(1).TransferDataFromWindow({ ...dlg(1).TransferDataToWindow(), maskMargin: null });
    expect(shape(1).GetLocalSolderMaskMargin()).toBeUndefined();
  });
});
