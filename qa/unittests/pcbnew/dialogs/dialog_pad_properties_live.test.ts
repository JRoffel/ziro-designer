// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_PAD_PROPERTIES on a live PAD (dialog_pad_properties.cpp), driven as its window drives
 * it: a control's member is set, then the handler the `_base.cpp` connects to it runs.
 *
 * Every expectation is derived from the C++, not from a run: positions from the footprint
 * transform (KiCad's RotatePoint turns (1, 0) by 90 degrees to (0, -1)), the layer sets from
 * transferDataToPad's switch (:2170-2263) and PAD's masks (pad.h), the defaults from
 * onPadShapeSelection (:1048-1171) and PadTypeSelected (:1262-1333).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { pcbIUScale } from '@ziroeda/common/eda_units.js';
import { PCB_LAYER_ID } from '@ziroeda/common/layer_id.js';
import { LSET } from '@ziroeda/common/lset.js';
import { RECT_CHAMFER_TOP_LEFT } from '@ziroeda/kimath/src/convert_basic_shapes_to_polygon.js';
import type { BOARD } from '@ziroeda/pcbnew/board.js';
import { DIALOG_PAD_PROPERTIES } from '@ziroeda/pcbnew/dialogs/dialog_pad_properties.js';
import type { PAD } from '@ziroeda/pcbnew/pad.js';
import {
  PAD_ATTRIB,
  PAD_DRILL_POST_MACHINING_MODE,
  PAD_PROP,
  PAD_SHAPE,
  PADSTACK,
  PADSTACK_MODE,
  UNCONNECTED_LAYER_MODE,
} from '@ziroeda/pcbnew/padstack.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import { ZONE_CONNECTION } from '@ziroeda/pcbnew/zones.js';
import { TEST_PCB_FRAME } from '../support/test_pcb_frame.js';

const MM = (n: number): number => pcbIUScale.mmToIU(n);
const L = PADSTACK.ALL_LAYERS;

let board: BOARD;
let frame: TEST_PCB_FRAME;
const pad = (fp = 0, i = 0): PAD => board.Footprints()[fp]!.Pads()[i]!;
// By uuid after an undo: the restored copy may come back at another index.
const padByUuid = (uuid: string): PAD =>
  board
    .Footprints()[0]!
    .Pads()
    .find((p) => p.m_Uuid === uuid)!;
const dlg = (p: PAD | null = pad()) => new DIALOG_PAD_PROPERTIES(frame, p);

/** The user picks row \a aRow of the pad shape choice. */
const pickShape = (d: DIALOG_PAD_PROPERTIES, aRow: number): void => {
  d.m_PadShapeSelector.SetSelection(aRow);
  d.OnPadShapeSelection();
};

/** The user picks row \a aRow of the pad type choice. */
const pickType = (d: DIALOG_PAD_PROPERTIES, aRow: number): void => {
  d.m_padType.SetSelection(aRow);
  d.PadTypeSelected();
};

beforeEach(() => {
  DIALOG_PAD_PROPERTIES.m_page = 0;
  DIALOG_PAD_PROPERTIES.m_sketchPreview = false;
  board = ParseBoard(`(kicad_pcb (version 20241229) (generator "test")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (1 "F.Mask" user) (3 "B.Mask" user)
    (13 "F.Paste" user) (15 "B.Paste" user))
  (net 0 "")
  (net 1 "GND")
  (net 2 "VCC")
  (footprint "Lib:J" (layer "F.Cu") (uuid "20000000-0000-4000-8000-000000000001") (at 10 20 90)
    (property "Reference" "J1" (at 0 0 0) (layer "F.SilkS") (uuid "20000000-0000-4000-8000-000000000002"))
    (pad "1" thru_hole rect (at 1 0 90) (size 2 1.2) (drill 0.8) (layers "*.Cu" "*.Mask")
      (net 1 "GND") (uuid "20000000-0000-4000-8000-000000000003"))
    (pad "2" smd trapezoid (at 3 0 90) (size 2 1.2) (rect_delta 0.2 0.3) (layers "F.Cu" "F.Mask")
      (uuid "20000000-0000-4000-8000-000000000004")))
  (footprint "Lib:R" (layer "B.Cu") (uuid "20000000-0000-4000-8000-000000000011") (at 30 40 0)
    (property "Reference" "R1" (at 0 0 0) (layer "B.SilkS") (uuid "20000000-0000-4000-8000-000000000012"))
    (pad "1" smd rect (at 1 2 90) (size 1 1.5) (layers "B.Cu" "B.Mask" "B.Paste")
      (uuid "20000000-0000-4000-8000-000000000013"))))`);
  frame = new TEST_PCB_FRAME(board);
});

describe('DIALOG_PAD_PROPERTIES: initValues', () => {
  it('reads the pad: absolute position, footprint-relative orientation', () => {
    const d = dlg();

    expect(d.m_title).toBe('Pad Properties');
    expect(d.m_padNumCtrl.value).toBe('1');
    expect(d.m_padNetSelector.netcode).toBe(1);
    expect(d.m_padType.GetSelection()).toBe(0); // PTH_DLG_TYPE
    expect(d.m_PadShapeSelector.GetSelection()).toBe(2); // CHOICE_SHAPE_RECT
    // (1, 0) turned 90 degrees is (0, -1), about the anchor (10, 20).
    expect(d.m_posX.GetValue()).toBe(MM(10));
    expect(d.m_posY.GetValue()).toBe(MM(19));
    // The file's pad angle is board-absolute: 90 against the footprint's 90.
    expect(d.m_pad_orientation.GetText()).toBe('0');
    expect(d.m_sizeX.GetValue()).toBe(MM(2));
    expect(d.m_sizeY.GetValue()).toBe(MM(1.2));
    expect(d.m_holeX.GetValue()).toBe(MM(0.8));
    // updateHoleControls: a round hole is one "Diameter:" box.
    expect(d.m_holeShapeCtrl.GetSelection()).toBe(0);
    expect(d.m_holeX.GetLabel()).toBe('Diameter:');
    expect(d.m_holeY.IsShown()).toBe(false);
    // *.Cu with no removal: "All copper layers".
    expect(d.m_rbCopperLayersSel.GetStrings()).toEqual([
      'All copper layers',
      'F.Cu, B.Cu and connected layers',
      'Connected layers only',
      'None',
    ]);
    expect(d.m_rbCopperLayersSel.GetSelection()).toBe(0);
    expect(d.m_layerFrontMask.value).toBe(true);
    expect(d.m_layerBackMask.value).toBe(true);
    expect(d.m_layerFrontPaste.value).toBe(false);
    expect(d.m_ZoneConnectionChoice.GetSelection()).toBe(0);
    expect(d.m_padToDieOpt.value).toBe(false);
    // A blank override is a null binder.
    expect(d.m_clearance.IsNull()).toBe(true);
    expect(d.m_shapePropsBook).toBe(0);
    expect(d.m_stackupImagesBook).toBe(0);
    expect(d.m_parentInfo).toBe('Footprint J1 (), front side, rotated 90 deg');
    expect(d.m_FlippedWarningShown).toBe(false);
  });

  it('shows the pad-size Y box and a "w" teardrop hint for a non-round shape', () => {
    const d = dlg();

    expect(d.m_sizeX.GetLabel()).toBe('Pad size X:');
    expect(d.m_sizeY.IsShown()).toBe(true);
    expect(d.m_teardropHint).toBe('w');

    pickShape(d, 0);
    expect(d.m_sizeX.GetLabel()).toBe('Diameter:');
    expect(d.m_sizeY.IsShown()).toBe(false);
    expect(d.m_sizeY.IsEnabled()).toBe(false);
    expect(d.m_teardropHint).toBe('d');
    // A circle has no offset option.
    expect(d.m_offsetShapeOpt.enabled).toBe(false);
  });

  it('shows one trapezoid axis: X when it is set (:899-908)', () => {
    const d = dlg(pad(0, 1));

    expect(d.m_PadShapeSelector.GetSelection()).toBe(3);
    expect(d.m_shapePropsBook).toBe(1);
    expect(d.m_trapDelta.GetValue()).toBe(MM(0.2));
    expect(d.m_trapAxisCtrl.GetSelection()).toBe(0);
  });

  it('the angles are truncated to three decimals (SetPrecision( 3 ))', () => {
    const d = dlg();

    d.m_pad_orientation.SetText('12.34567');
    expect(d.m_pad_orientation.GetDoubleValue()).toBe(12.345);
  });

  it('the default pad dialog edits the master pad, and OK touches no pad', () => {
    const d = dlg(null);

    expect(d.m_title).toBe('Default Pad Properties for Add Pad Tool');
    d.m_sizeX.SetText('3');
    d.OnValuesChanged();

    expect(d.TransferDataFromWindow()).toBe(true);
    expect(board.GetDesignSettings().m_Pad_Master.GetSize(L).x).toBe(MM(3));
    expect(frame.GetUndoCommandCount()).toBe(0);
  });
});

describe('DIALOG_PAD_PROPERTIES: TransferDataFromWindow', () => {
  it('writes back as one undo step, orientation footprint-relative', () => {
    const d = dlg();

    d.m_padNumCtrl.value = '7';
    d.m_padNetSelector.netcode = 2;
    d.m_posX.SetText('12');
    d.m_pad_orientation.SetText('45');
    d.m_sizeX.SetText('2.5');
    d.m_clearance.SetText('0.1');
    d.m_ZoneConnectionChoice.SetSelection(3);
    d.m_padToDieOpt.value = true;
    d.m_padToDie.SetText('0.3');

    expect(d.TransferDataFromWindow()).toBe(true);
    const p = pad();
    expect(p.GetNumber()).toBe('7');
    expect(p.GetNetCode()).toBe(2);
    expect(p.GetPosition()).toEqual({ x: MM(12), y: MM(19) });
    // SetFPRelativeOrientation( 45 ) on a footprint at 90.
    expect(p.GetOrientation().AsDegrees()).toBe(135);
    expect(p.GetSize(L)).toEqual({ x: MM(2.5), y: MM(1.2) });
    expect(p.GetLocalClearance()).toBe(MM(0.1));
    expect(p.GetLocalZoneConnection()).toBe(ZONE_CONNECTION.NONE);
    expect(p.GetPadToDieLength()).toBe(MM(0.3));
    expect(frame.GetUndoCommandCount()).toBe(1);
    frame.RestoreCopyFromUndoList();
    const restored = padByUuid('20000000-0000-4000-8000-000000000003');
    expect(restored.GetNumber()).toBe('1');
    expect(restored.GetOrientation().AsDegrees()).toBe(90);
  });

  it('writes the design settings master pad, without a net', () => {
    const d = dlg();

    d.m_padNumCtrl.value = '9';
    d.m_sizeX.SetText('3');
    d.TransferDataFromWindow();

    const master = board.GetDesignSettings().m_Pad_Master;
    expect(master.GetNumber()).toBe('9');
    expect(master.GetSize(L).x).toBe(MM(3));
    expect(master.GetNetCode()).toBe(0);
    expect(master.GetAttribute()).toBe(PAD_ATTRIB.PTH);
  });

  it('an NPTH pad loses its number and net', () => {
    const d = dlg();

    pickType(d, 3);
    expect(d.m_padNumCtrl.value).toBe('');
    d.TransferDataFromWindow();

    expect(pad().GetAttribute()).toBe(PAD_ATTRIB.NPTH);
    expect(pad().GetNumber()).toBe('');
    expect(pad().GetNetCode()).toBe(0);
  });

  it('a pad made SMD loses its hole and takes the SMD layers', () => {
    const d = dlg();

    pickType(d, 1);
    // The hole sizer and the padstack controls are PTH / NPTH only.
    expect(d.m_gbSizerHoleShown).toBe(false);
    expect(d.m_padstackControlsShown).toBe(false);
    expect(d.m_rbCopperLayersSel.GetStrings()).toEqual(['F.Cu', 'B.Cu']);
    d.TransferDataFromWindow();

    expect(pad().GetAttribute()).toBe(PAD_ATTRIB.SMD);
    expect(pad().GetDrillSize()).toEqual({ x: 0, y: 0 });
    // updatePadLayersList( std::nullopt ): PAD::SMDMask().
    expect(
      pad()
        .GetLayerSet()
        .equals(new LSET([PCB_LAYER_ID.F_Cu, PCB_LAYER_ID.F_Paste, PCB_LAYER_ID.F_Mask])),
    ).toBe(true);
  });

  it('PTH "F.Cu, B.Cu and connected layers" is all copper, outer layers kept', () => {
    const d = dlg();

    d.m_rbCopperLayersSel.SetSelection(1);
    d.OnSetCopperLayers();
    // The stackup image follows the preview pad.
    d.OnUpdateUI();
    expect(d.m_stackupImagesBook).toBe(1);
    d.TransferDataFromWindow();

    const set = pad().GetLayerSet();
    expect(set.and(LSET.AllCuMask()).equals(LSET.AllCuMask())).toBe(true);
    expect(set.test(PCB_LAYER_ID.F_Mask)).toBe(true);
    expect(pad().GetUnconnectedLayerMode()).toBe(
      UNCONNECTED_LAYER_MODE.REMOVE_EXCEPT_START_AND_END,
    );
  });

  it('PTH "None" keeps no copper, and the mode resets', () => {
    const d = dlg();

    d.m_rbCopperLayersSel.SetSelection(3);
    d.m_layerBackMask.value = false;
    d.OnSetLayers();
    d.OnUpdateUI();
    // OnUpdateUINonCopperWarning: the note page becomes the warning.
    expect(d.m_nonCopperWarningBook).toBe(1);
    expect(d.m_stackupImagesBook).toBe(3);
    d.TransferDataFromWindow();

    expect(pad().GetLayerSet().and(LSET.AllCuMask()).none()).toBe(true);
    expect(pad().GetLayerSet().test(PCB_LAYER_ID.B_Mask)).toBe(false);
    expect(pad().GetUnconnectedLayerMode()).toBe(UNCONNECTED_LAYER_MODE.KEEP_ALL);
  });

  it('refuses a through-hole pad with no hole (padValuesOK)', () => {
    const d = dlg();

    d.m_holeX.SetText('0');
    d.m_padNumCtrl.value = '5';

    expect(d.TransferDataFromWindow()).toBe(false);
    expect(d.m_messages?.title).toBe('Pad Properties Errors');
    expect(d.m_messages?.messages).toContain('Error: Through hole pad has no hole.');
    expect(pad().GetNumber()).toBe('1');
    expect(frame.GetUndoCommandCount()).toBe(0);
  });

  it('refuses a negative spoke width, and says why', () => {
    const d = dlg();

    d.m_spokeWidth.SetText('-1');
    expect(d.TransferDataFromWindow()).toBe(false);
    expect(d.m_error).toMatch(/^Spoke width must be at least /);
  });

  it('a trapezoid delta too large for the pad is clamped in the preview and refuses OK', () => {
    let d = dlg();

    pickShape(d, 3);
    expect(d.m_shapePropsBook).toBe(1);
    // A rect's delta is zero, so initPadstackLayerValues left the axis Vertical (:904-908).
    expect(d.m_trapAxisCtrl.GetSelection()).toBe(1);
    d.m_trapDelta.SetText('5');
    // transferDataToPad returns !error (:2344), and OK returns false when the master pad's
    // transfer does (:1717): the dialog stays open and the pad is untouched.
    expect(d.TransferDataFromWindow()).toBe(false);
    expect(pad().GetShape(L)).toBe(PAD_SHAPE.RECTANGLE);
    expect(frame.GetUndoCommandCount()).toBe(0);
    // delta.y > size.x becomes size.x - 2 (:2045-2049).
    expect(d.m_previewPad.GetDelta(L)).toEqual({ x: 0, y: MM(2) - 2 });

    d.m_trapAxisCtrl.SetSelection(0);
    d.m_trapDelta.SetText('-5');
    d.OnSetLayers();
    // delta.x < -size.y becomes -size.y + 2 (:2027-2031).
    expect(d.m_previewPad.GetDelta(L)).toEqual({ x: -MM(1.2) + 2, y: 0 });

    d = dlg();
    pickShape(d, 3);
    d.m_trapDelta.SetText('0.5');
    expect(d.TransferDataFromWindow()).toBe(true);
    expect(pad().GetDelta(L)).toEqual({ x: 0, y: MM(0.5) });
  });

  it('a pad newly made round-rect with no ratio takes the IPC one (:1062-1075)', () => {
    let d = dlg();

    pickShape(d, 4);
    expect(d.m_shapePropsBook).toBe(2);
    d.TransferDataFromWindow();
    expect(pad().GetShape(L)).toBe(PAD_SHAPE.ROUNDRECT);
    // min( 0.25 mm, 1.2 mm * 0.25 ) / 1.2 mm, through the percent box.
    expect(pad().GetRoundRectRadiusRatio(L)).toBeCloseTo(0.25 / 1.2, 9);

    d = dlg();
    d.m_cornerRatio.SetText('40');
    d.onCornerSizePercentChange(d.m_cornerRatio, '40');
    // The two ratio boxes mirror each other.
    expect(d.m_mixedCornerRatio.GetText()).toBe('40');
    d.TransferDataFromWindow();
    expect(pad().GetRoundRectRadiusRatio(L)).toBe(0.4);
  });

  it('a corner radius typed in mm sets the ratio boxes from it', () => {
    const d = dlg();

    pickShape(d, 4);
    d.m_cornerRadius.SetText('0.3');
    d.onCornerRadiusChange();
    // 0.3 mm of the 1.2 mm side.
    expect(d.m_cornerRatio.GetDoubleValue()).toBeCloseTo(25, 9);
  });

  it('a chamfered rectangle defaults to a 20% top-left chamfer (:1077-1097)', () => {
    const d = dlg();

    pickShape(d, 5);
    expect(d.m_shapePropsBook).toBe(3);
    expect(d.m_chamferRatio.GetDoubleValue()).toBe(20);
    expect(d.m_cbTopLeft.value).toBe(true);
    d.TransferDataFromWindow();

    expect(pad().GetShape(L)).toBe(PAD_SHAPE.CHAMFERED_RECT);
    expect(pad().GetChamferPositions(L)).toBe(RECT_CHAMFER_TOP_LEFT);
    expect(pad().GetChamferRectRatio(L)).toBe(0.2);
    expect(pad().GetRoundRectRadiusRatio(L)).toBe(0);
  });

  it('a chamfer over 50% locks the corners beside a chamfered one', () => {
    const d = dlg();

    pickShape(d, 5);
    d.m_chamferRatio.SetText('60');
    d.onCornerSizePercentChange(d.m_chamferRatio, '60');

    // Top left is chamfered: its neighbours, top right and bottom left, are disabled.
    expect(d.m_cbTopRight.enabled).toBe(false);
    expect(d.m_cbBottomLeft.enabled).toBe(false);
    expect(d.m_cbBottomRight.enabled).toBe(true);
    // One corner allows up to 100%, so 60 stands.
    expect(d.m_chamferRatio.GetDoubleValue()).toBe(60);
  });

  it('swaps a default spoke angle when the shape moves to or from a circle', () => {
    expect(pad().GetThermalSpokeAngle().AsDegrees()).toBe(90);

    let d = dlg();
    pickShape(d, 0);
    d.TransferDataFromWindow();
    expect(pad().GetThermalSpokeAngle().AsDegrees()).toBe(45);
    // A circle takes its size from the X box alone (:2009-2012).
    expect(pad().GetSize(L)).toEqual({ x: MM(2), y: MM(2) });

    d = dlg();
    pickShape(d, 1);
    d.TransferDataFromWindow();
    expect(pad().GetThermalSpokeAngle().AsDegrees()).toBe(90);
  });

  it('writes the fabrication property, the teardrops and the paste margin', () => {
    const d = dlg();

    d.m_choiceFabProperty.SetSelection(4);
    d.m_cbTeardrops.value = true;
    d.m_cbPreferZoneConnection.value = false;
    d.m_spTeardropLenPercent = 70;
    d.m_pasteMargin.onTextChanged('-0.1mm - 5%');
    d.TransferDataFromWindow();

    const p = pad();
    expect(p.GetProperty()).toBe(PAD_PROP.TESTPOINT);
    expect(p.GetTeardropParams().m_Enabled).toBe(true);
    // m_TdOnPadsInZones = !m_cbPreferZoneConnection
    expect(p.GetTeardropParams().m_TdOnPadsInZones).toBe(true);
    expect(p.GetTeardropParams().m_BestLengthRatio).toBe(0.7);
    expect(p.GetLocalSolderPasteMargin()).toBe(-MM(0.1));
    expect(p.GetLocalSolderPasteMarginRatio()).toBeCloseTo(-0.05, 12);
  });

  it('a flipped footprint shows its pad front-side and writes it back to the back', () => {
    const p = pad(1);
    let d = dlg(p);

    expect(d.m_FlippedWarningShown).toBe(true);
    expect(d.m_parentInfo).toBe('Footprint R1 (), back side (mirrored), rotated 0 deg');
    expect(d.m_rbCopperLayersSel.GetSelection()).toBe(0); // F.Cu
    expect(d.m_layerFrontMask.value).toBe(true);
    expect(d.m_layerFrontPaste.value).toBe(true);
    expect(d.m_posX.GetValue()).toBe(p.GetPosition().x);
    expect(d.m_posY.GetValue()).toBe(p.GetPosition().y);
    const pos = p.GetPosition();

    d = dlg(p);
    d.TransferDataFromWindow();
    expect(
      p
        .GetLayerSet()
        .equals(new LSET([PCB_LAYER_ID.B_Cu, PCB_LAYER_ID.B_Mask, PCB_LAYER_ID.B_Paste])),
    ).toBe(true);
    expect(p.GetPosition()).toEqual(pos);
  });

  it('KiCad 10.0.6: OK on a flipped footprint pad negates its relative orientation', () => {
    // initValues shows GetFPRelativeOrientation() unflipped (:670), while OK
    // writes it and then flips the pad (:1740, :1765), which negates it. The
    // C++ decides, so a no-change OK turns a relative 90 into -90 (270).
    const p = pad(1);
    const rel = p.GetFPRelativeOrientation().AsDegrees();
    expect(rel).not.toBe(0);
    dlg(p).TransferDataFromWindow();
    expect(p.GetFPRelativeOrientation().AsDegrees()).toBe((360 - rel) % 360);
  });

  it('transferDataToPad itself strips an NPTH pad and drops an SMD hole (:2122-2143)', () => {
    let d = dlg();

    // The type set with the boxes still holding a number and a hole: only the transfer clears them.
    d.m_padType.SetSelection(3);
    d.m_padNumCtrl.value = '5';
    d.TransferDataFromWindow();
    expect(board.GetDesignSettings().m_Pad_Master.GetNumber()).toBe('');

    d = dlg();
    d.m_padType.SetSelection(1);
    d.m_rbCopperLayersSel.SetSelection(0);
    expect(d.m_holeX.GetValue()).toBe(MM(0.8));
    d.TransferDataFromWindow();
    expect(pad().GetDrillSize()).toEqual({ x: 0, y: 0 });
  });

  it('the preview pad sits at the footprint-relative position (:1988-1996)', () => {
    const d = dlg();

    d.m_posX.SetText('12');
    d.OnValuesChanged();
    // The footprint's 90 takes local (1, 0) to (0, -1), so (x, y) -> (y, -x); undoing it on
    // (12, 19) - (10, 20) = (2, -1) is (x, y) -> (-y, x) = (1, 2).
    expect(d.m_previewPad.GetPosition()).toEqual({ x: MM(1), y: MM(2) });
  });

  it('OnModify marks the title once', () => {
    const d = dlg();

    d.m_sizeX.SetText('2.2');
    d.OnValuesChanged();
    d.OnValuesChanged();
    expect(d.m_title).toBe('*Pad Properties');
  });
});

describe('DIALOG_PAD_PROPERTIES: padstack', () => {
  it('Front/Inner/Back edits the back layer on its own', () => {
    const d = dlg();

    d.m_cbPadstackMode.SetSelection(1);
    d.OnPadstackModeChanged();
    expect(d.m_cbEditLayer.GetStrings()).toEqual(['F.Cu', 'Inner Layers', 'B.Cu']);
    expect(d.m_cbEditLayer.IsEnabled()).toBe(true);

    d.m_cbEditLayer.SetSelection(2);
    d.OnEditLayerChanged();
    expect(d.m_editLayer).toBe(PCB_LAYER_ID.B_Cu);
    d.m_sizeX.SetText('3');
    d.OnValuesChanged();
    d.TransferDataFromWindow();

    const stack = pad().Padstack();
    expect(stack.Mode()).toBe(PADSTACK_MODE.FRONT_INNER_BACK);
    expect(stack.Size(PCB_LAYER_ID.B_Cu).x).toBe(MM(3));
    expect(stack.Size(PCB_LAYER_ID.F_Cu).x).toBe(MM(2));
  });

  it('Normal has the one edit layer, disabled', () => {
    const d = dlg();

    expect(d.m_cbPadstackMode.GetSelection()).toBe(0);
    expect(d.m_cbEditLayer.GetStrings()).toEqual(['F.Cu']);
    expect(d.m_cbEditLayer.IsEnabled()).toBe(false);
  });
});

describe('DIALOG_PAD_PROPERTIES: backdrill and post machining', () => {
  it('a top backdrill to B.Cu is written through the padstack', () => {
    const d = dlg();

    expect(d.m_backDrillTopLayer.GetStrings()).toEqual(['F.Cu', 'B.Cu']);
    expect(d.m_backDrillTopSizeBinder.IsEnabled()).toBe(false);
    d.m_backDrillChoice.SetSelection(1);
    d.onBackDrillChoice();
    expect(d.m_backDrillTopSizeBinder.IsEnabled()).toBe(true);
    expect(d.m_backDrillBottomSizeBinder.IsEnabled()).toBe(false);
    d.m_backDrillTopSizeBinder.SetText('1');
    d.m_backDrillTopLayer.SetSelection(1);
    d.TransferDataFromWindow();

    const stack = pad().Padstack();
    expect(stack.GetBackdrillSize(true)).toBe(MM(1));
    expect(stack.GetBackdrillEndLayer(true)).toBe(PCB_LAYER_ID.B_Cu);
    expect(stack.GetBackdrillSize(false)).toBeUndefined();
  });

  it('a countersink defaults to 82 degrees and writes the angle in tenths', () => {
    const d = dlg();

    d.m_topPostMachining.SetSelection(1);
    d.onTopPostMachining();
    expect(d.m_topPostMachineSize2Binder.GetLabel()).toBe('Angle:');
    expect(d.m_topPostMachineSize2Binder.GetUnits()).toBe('degrees');
    expect(d.m_topPostMachineSize2Binder.GetDoubleValue()).toBe(82);
    d.m_topPostMachineSize1Binder.SetText('1.5');
    d.TransferDataFromWindow();

    const pm = pad().Padstack().FrontPostMachining();
    expect(pm.mode).toBe(PAD_DRILL_POST_MACHINING_MODE.COUNTERSINK);
    expect(pm.size).toBe(MM(1.5));
    expect(pm.angle).toBe(820);
  });

  it('a counterbore asks for a depth in the frame units', () => {
    const d = dlg();

    d.m_bottomPostMachining.SetSelection(2);
    d.onBottomPostMachining();
    expect(d.m_bottomPostMachineSize2Binder.GetLabel()).toBe('Depth:');
    expect(d.m_bottomPostMachineSize2Binder.GetUnits()).toBe(frame.GetUserUnits());
  });

  it('an oblong hole asks first when it would drop the backdrill; Cancel keeps it round', async () => {
    const d = dlg();
    const asked: string[] = [];

    d.m_confirm = async (aMessage) => {
      asked.push(aMessage);
      return false;
    };
    d.m_backDrillChoice.SetSelection(1);
    d.m_holeShapeCtrl.SetSelection(1);
    await d.OnDrillShapeSelected();

    expect(asked).toEqual([
      'Switching to non-circular hole will disable backdrills and post-machining. Continue?',
    ]);
    expect(d.m_holeShapeCtrl.GetSelection()).toBe(0);
  });

  it('an oblong hole disables the backdrill and post-machining controls', async () => {
    const d = dlg();

    d.m_holeShapeCtrl.SetSelection(1);
    await d.OnDrillShapeSelected();

    expect(d.m_holeX.GetLabel()).toBe('Hole size X:');
    expect(d.m_holeY.IsShown()).toBe(true);
    expect(d.m_backDrillChoice.IsEnabled()).toBe(false);
    expect(d.m_topPostMachining.IsEnabled()).toBe(false);
  });
});
