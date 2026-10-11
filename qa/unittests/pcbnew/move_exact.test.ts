// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_MOVE_EXACT (pcbnew/dialogs/dialog_move_exact.cpp): GetTranslationInIU's polar reading,
 * OnPolarChanged's conversion both ways, OnTextChanged's out-of-range check, the anchor menu
 * buildRotationAnchorMenu builds, and TransferDataFromWindow writing the tool's values.
 *
 * Every expected coordinate is hand-computed from the C++. m_moveY is a REL_Y_COORD binder, and
 * with the Y axis not inverted (the default) PCB_ORIGIN_TRANSFORMS negates a relative angle both
 * ways (pcb_origin_transforms.cpp:76, :121): a typed bearing of +90 degrees is -90 on the board,
 * so the move goes UP the screen (-y). The limit is INT_MAX * sqrt(1/2).
 */
import { describe, expect, it } from 'vitest';
import { pcbMmToIU as mmToIU } from '@ziroeda/common/eda_units.js';
import { ANGLE_0 } from '@ziroeda/kimath/src/geometry/eda_angle.js';
import { BOX2I } from '@ziroeda/kimath/src/math/box2.js';
import {
  DIALOG_MOVE_EXACT,
  type MOVE_EXACT_VALUES,
  ROTATION_ANCHOR,
} from '@ziroeda/pcbnew/dialogs/dialog_move_exact.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import { TEST_PCB_FRAME } from './support/test_pcb_frame.js';

const MM = (n: number): number => mmToIU(n);

/** Within a nanometre: the polar form goes through trigonometry, then rounds to IU. */
const near = (got: number, want: number): void =>
  expect(Math.abs(got - want)).toBeLessThanOrEqual(1);

function open(
  aAnchor = ROTATION_ANCHOR.ROTATE_AROUND_ITEM_ANCHOR,
  aBox = new BOX2I({ x: 0, y: 0 }, { x: MM(10), y: MM(10) }),
) {
  const frame = new TEST_PCB_FRAME(
    ParseBoard(
      '(kicad_pcb (version 20241229) (generator "t") (layers (0 "F.Cu" signal) (2 "B.Cu" signal)))',
    ),
  );
  frame.SetUserUnits('mm');
  const values: MOVE_EXACT_VALUES = {
    translation: { x: 0, y: 0 },
    rotation: ANGLE_0,
    rotationAnchor: aAnchor,
  };
  const d = new DIALOG_MOVE_EXACT(frame, values, aBox);
  d.TransferDataToWindow();
  return { d, values, frame };
}

describe('DIALOG_MOVE_EXACT', () => {
  it('opens on "0" in every entry, labelled Move X / Move Y / Rotate', () => {
    const { d } = open();

    expect([d.m_moveX.GetText(), d.m_moveY.GetText(), d.m_rotate.GetText()]).toEqual([
      '0',
      '0',
      '0',
    ]);
    expect([d.m_moveX.GetLabel(), d.m_moveY.GetLabel(), d.m_rotate.GetLabel()]).toEqual([
      'Move X:',
      'Move Y:',
      'Rotate:',
    ]);
  });

  it('writes a Cartesian translation and the rotation into the tool values', () => {
    const { d, values } = open();

    d.m_moveX.SetText('5');
    d.m_moveY.SetText('-2');
    d.m_rotate.SetText('30');
    expect(d.TransferDataFromWindow()).toBe(true);
    expect(values.translation).toEqual({ x: MM(5), y: MM(-2) });
    expect(values.rotation.AsDegrees()).toBe(30);
  });

  it('reads a polar entry as distance and bearing: a typed +90 degrees moves up (-y)', () => {
    const { d, values } = open();

    d.m_polarCoords = true;
    d.OnPolarChanged();
    expect([d.m_moveX.GetLabel(), d.m_moveY.GetLabel()]).toEqual(['Distance:', 'Angle:']);
    expect(d.m_moveY.GetUnits()).toBe('degrees');

    d.m_moveX.SetText('10');
    d.m_moveY.SetText('90');
    d.TransferDataFromWindow();
    near(values.translation.x, 0);
    near(values.translation.y, -MM(10));
  });

  it('converts typed Cartesian values to polar and back (OnPolarChanged)', () => {
    const { d } = open();

    d.m_moveX.SetText('3');
    d.m_moveY.SetText('4');
    d.m_polarCoords = true;
    d.OnPolarChanged();
    expect(d.m_moveX.GetText()).toBe('5');
    // atan2( 4, 3 ) in degrees at the binder's four places, shown negated by ToDisplay.
    expect(d.m_moveY.GetText()).toBe('-53.1301');

    // KiCad 10.0.6 quirk, kept: going back, OnPolarChanged compares the DISPLAYED bearing
    // (-53.1301, negated by ToDisplay) with m_stateTheta.AsDegrees() (+53.1301, read back through
    // FromDisplay). They differ, so it recomputes from the displayed -53.1301 degrees:
    // 5 * cos( -53.1301 ) and 5 * sin( -53.1301 ), at the binder's ten places.
    d.m_polarCoords = false;
    d.OnPolarChanged();
    expect([d.m_moveX.GetText(), d.m_moveY.GetText()]).toEqual(['3.0000001644', '-3.9999998767']);
  });

  it('a move off the right of the board area greys OK and reds the entries (OnTextChanged)', () => {
    const { d } = open();

    d.m_moveX.SetText('1518.5');
    d.OnTextChanged();
    expect(d.m_okEnabled).toBe(false);
    expect(d.m_invalidLength).toMatch(/^Invalid movement values\./);

    d.m_moveX.SetText('50');
    d.OnTextChanged();
    expect(d.m_okEnabled).toBe(true);
    expect(d.m_invalidLength).toBe('');
  });

  it('checks the left and vertical edges too, against INT_MAX * sqrt(1/2)', () => {
    const { d } = open();

    // The box's left edge is 0: anything past -1518.5 mm crosses.
    d.m_moveX.SetText('-1519');
    d.OnTextChanged();
    expect(d.m_okEnabled).toBe(false);

    d.m_moveX.SetText('0');
    d.m_moveY.SetText('1519');
    d.OnTextChanged();
    expect(d.m_okEnabled).toBe(false);
  });

  it('a blank entry left reads "0" again (OnTextFocusLost)', () => {
    const { d } = open();

    d.m_moveY.SetText('');
    d.OnTextFocusLost(d.m_moveY);
    expect(d.m_moveY.GetText()).toBe('0');
  });

  it('Reset zeroes its own entry', () => {
    const { d } = open();

    d.m_moveX.SetText('5');
    d.m_rotate.SetText('45');
    d.OnClear('x');
    d.OnClear('rot');
    expect(d.m_moveX.GetText()).toBe('0');
    expect(d.m_rotate.GetText()).toBe('0');
  });

  it('the anchor menu is the given anchor, the local origin, and the drill/place origin in the board editor', () => {
    const { d, values } = open(ROTATION_ANCHOR.ROTATE_AROUND_SEL_CENTER);

    expect(d.m_anchorOptions.GetStrings()).toEqual(
      d.m_hash_key.endsWith('|pcb_editor')
        ? [
            'Rotate around selection center',
            'Rotate around local coordinates origin',
            'Rotate around drill/place origin',
          ]
        : ['Rotate around selection center', 'Rotate around local coordinates origin'],
    );
    expect(d.m_anchorOptions.GetSelection()).toBe(0);
    expect(d.m_hash_key.startsWith('Move Item|with_selection')).toBe(true);

    d.m_anchorOptions.SetSelection(1);
    d.TransferDataFromWindow();
    expect(values.rotationAnchor).toBe(ROTATION_ANCHOR.ROTATE_AROUND_USER_ORIGIN);
  });
});
