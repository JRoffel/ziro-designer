// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_REFERENCE_IMAGE_PROPERTIES on a live PCB_REFERENCE_IMAGE
 * (dialog_reference_image_properties.cpp, panel_image_editor.cpp): the transfers, PANEL_IMAGE_EDITOR's
 * CheckValues, and the three-way binding where width, height and scale are one stored number.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { pcbIUScale } from '@ziroeda/common/eda_units.js';
import { PCB_LAYER_ID } from '@ziroeda/common/layer_id.js';
import type { BOARD } from '@ziroeda/pcbnew/board.js';
import { BOARD_USE } from '@ziroeda/pcbnew/board_types.js';
import { DIALOG_REFERENCE_IMAGE_PROPERTIES } from '@ziroeda/pcbnew/dialogs/dialog_reference_image_properties.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import type { PCB_REFERENCE_IMAGE } from '@ziroeda/pcbnew/pcb_reference_image.js';
import { TEST_PCB_FRAME } from '../support/test_pcb_frame.js';

const MM = (n: number): number => pcbIUScale.mmToIU(n);

/** A 100 x 50 greyscale PNG with no pHYs chunk, so 300 ppi. */
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAAAyCAAAAACPXiFiAAAALElEQVR4nO3NMQEAAAwCIKMb3Qx7dkEB0geRSCQSiUQikUgkEolEIpFIJDcD7NPEiNYtp+MAAAAASUVORK5CYII=';

let board: BOARD;
let frame: TEST_PCB_FRAME;
const image = (): PCB_REFERENCE_IMAGE => board.Drawings()[0] as PCB_REFERENCE_IMAGE;
const dlg = () => new DIALOG_REFERENCE_IMAGE_PROPERTIES(frame, image());

beforeEach(() => {
  board = ParseBoard(`(kicad_pcb (version 20241229) (generator "test")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (5 "F.SilkS" user "F.Silkscreen") (7 "B.SilkS" user "B.Silkscreen"))
  (image (at 10 20) (layer "F.SilkS") (scale 2) (uuid "50000000-0000-4000-8000-000000000001")
    (data "${PNG}")))`);
  frame = new TEST_PCB_FRAME(board);
});

/** The dialog after OnInitDialog, as the window shows it. */
const shown = () => {
  const d = dlg();
  d.TransferDataToWindow();
  return d;
};

/** OK after CheckValues passed: what the window does. */
const ok = (d: DIALOG_REFERENCE_IMAGE_PROPERTIES) => {
  expect(d.CheckValues()).toBeNull();
  return d.TransferDataFromWindow();
};

describe('DIALOG_REFERENCE_IMAGE_PROPERTIES', () => {
  it('reads the image; width and height are the scaled pixel size', () => {
    const d = shown();
    expect(d.m_posX.GetIntValue()).toBe(MM(10));
    expect(d.m_posY.GetIntValue()).toBe(MM(20));
    expect(d.m_LayerSelectionCtrl.GetLayerSelection()).toBe(PCB_LAYER_ID.F_SilkS);
    expect(d.m_cbLocked).toBe(false);
    expect(d.GetScale()).toBe(2);
    // 100 x 50 px at 300 ppi, doubled: 200/300 in by 100/300 in.
    expect(d.m_width.GetIntValue()).toBeCloseTo((200 / 300) * MM(25.4), -1);
    expect(d.m_height.GetIntValue()).toBeCloseTo((100 / 300) * MM(25.4), -1);
  });

  it('writes position, layer, lock and scale as one undo entry', () => {
    const d = shown();
    d.m_posX.SetValue(MM(30));
    d.m_posY.SetValue(MM(40));
    d.m_LayerSelectionCtrl.SetLayerSelection(PCB_LAYER_ID.B_SilkS);
    d.m_cbLocked = true;
    d.m_scaleText = '3';
    expect(ok(d)).toBe(true);

    const b = image();
    expect(b.GetPosition()).toEqual({ x: MM(30), y: MM(40) });
    expect(b.GetLayer()).toBe(PCB_LAYER_ID.B_SilkS);
    expect(b.IsLocked()).toBe(true);
    expect(b.GetReferenceImage().GetImageScale()).toBe(3);
    expect(frame.GetUndoCommandCount()).toBe(1);
    frame.RestoreCopyFromUndoList();
    expect(image().GetPosition()).toEqual({ x: MM(10), y: MM(20) });
    expect(image().GetReferenceImage().GetImageScale()).toBe(2);
  });

  it('Cancel leaves the bitmap alone: the editor works on a copy', () => {
    const d = shown();
    d.m_scaleText = '5';
    d.onScaleChanged();
    expect(image().GetReferenceImage().GetImageScale()).toBe(2);
    expect(frame.GetUndoCommandCount()).toBe(0);
  });

  it('scales about the centre: the position does not move', () => {
    // Even with a transform origin off-centre, which SetImageScale would scale about.
    image()
      .GetReferenceImage()
      .SetTransformOriginOffset({ x: MM(1), y: MM(1) });
    const d = shown();
    d.m_scaleText = '5';
    expect(ok(d)).toBe(true);
    expect(image().GetPosition()).toEqual({ x: MM(10), y: MM(20) });
    expect(image().GetReferenceImage().GetTransformOriginOffset()).toEqual({ x: MM(1), y: MM(1) });
  });

  it('CheckValues refuses a negative scale', () => {
    const d = shown();
    d.m_scaleText = '-1';
    expect(d.CheckValues()).toEqual({ error: 'Scale must be a positive number.' });
  });

  it('CheckValues refuses an image under 15 scaled pixels on its short side', () => {
    const d = shown();
    // 50 px * 0.28 = 14 px.
    d.m_scaleText = '0.28';
    expect(d.CheckValues()).toEqual({
      error: 'This scale results in an image which is too small (1.19 mm or 46.7 mil).',
    });
    // 50 px * 0.3 = 15 px is enough.
    d.m_scaleText = '0.3';
    expect(d.CheckValues()).toBeNull();
  });

  it('CheckValues asks before an image over 6000 scaled pixels', () => {
    const d = shown();
    // 100 px * 61 = 6100 px.
    d.m_scaleText = '61';
    expect(d.CheckValues()).toEqual({
      confirm:
        'This scale results in an image which is very large (516.5 mm or 20.33 in). Are you sure?',
    });
    // 100 px * 60 = 6000 px is not asked about.
    d.m_scaleText = '60';
    expect(d.CheckValues()).toBeNull();
  });

  it('a typed width becomes a scale, and the height follows (onWidthChanged)', () => {
    const d = shown();
    const w = d.m_width.GetIntValue();
    const h = d.m_height.GetIntValue();
    d.m_width.SetValue(w * 3);
    d.onWidthChanged();
    expect(d.GetScale()).toBeCloseTo(6, 6);
    expect(d.m_height.GetIntValue()).toBeCloseTo(h * 3, -1);
  });

  it('a typed height becomes a scale the same way (onHeightChanged)', () => {
    const d = shown();
    const w = d.m_width.GetIntValue();
    d.m_height.SetValue(d.m_height.GetIntValue() * 3);
    d.onHeightChanged();
    expect(d.GetScale()).toBeCloseTo(6, 6);
    expect(d.m_width.GetIntValue()).toBeCloseTo(w * 3, -1);
  });

  it('a typed scale moves both sizes but leaves its own text alone (onScaleChanged)', () => {
    const d = shown();
    const w = d.m_width.GetIntValue();
    d.m_scaleText = '4.';
    d.onScaleChanged();
    expect(d.m_scaleText).toBe('4.');
    expect(d.m_width.GetIntValue()).toBeCloseTo(w * 2, -1);
  });

  it('a width, height or scale of zero or less is ignored', () => {
    const d = shown();
    d.m_width.SetValue(0);
    d.onWidthChanged();
    d.m_height.SetValue(-5);
    d.onHeightChanged();
    expect(d.GetScale()).toBe(2);
    d.m_scaleText = '0';
    d.onScaleChanged();
    expect(d.GetImageSize().x).toBeGreaterThan(0);
  });

  it('takes the converted image the panel hands back', () => {
    const OTHER =
      'iVBORw0KGgoAAAANSUhEUgAAAMgAAAAyCAAAAAA8Oss9AAAAoklEQVR4nN3OAQkAAAzDsEqbf1U3USg8CsKeoA5YqAMW6oCFOmChDlioAxbqgIU6YKEOWKgDFuqAhTpgoQ5YqAMW6oCFOmChDlioAxbqgIU6YKEOWKgDFuqAhTpgoQ5YqAMW6oCFOmChDlioAxbqgIU6YKEOWKgDFuqAhTpgoQ5YqAMW6oCFOmChDlioAxbqgIU6YKEOWKgDFuqAhTpgoQ5YDqc3xIghBGcQAAAAAElFTkSuQmCC';
    const d = shown();
    d.OnGreyScaleConvert(OTHER);
    expect(ok(d)).toBe(true);
    expect(image().GetReferenceImage().GetImage().GetSizePixels()).toEqual({ x: 200, y: 50 });
    expect(image().GetReferenceImage().GetImageScale()).toBe(2);
  });

  it('hides and keeps the lock in a footprint holder', () => {
    board.SetBoardUse(BOARD_USE.FPHOLDER);
    const d = shown();
    expect(d.m_lockedShown).toBe(false);
    d.m_cbLocked = true;
    expect(ok(d)).toBe(true);
    // IsLocked() is always false in a footprint holder; look from a board.
    board.SetBoardUse(BOARD_USE.NORMAL);
    expect(image().IsLocked()).toBe(false);
  });
});
