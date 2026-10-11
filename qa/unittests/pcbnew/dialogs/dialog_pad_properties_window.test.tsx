// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_PAD_PROPERTIES' window (dialog_pad_properties.cpp) on DIALOG_PAD_PROPERTIES_BASE: the
 * controls reach the handlers the `_base.cpp` connects, the labels the handlers set reach the
 * page, and OK / Cancel end the dialog as ShowQuasiModal does.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pcbIUScale } from '@ziroeda/common/eda_units.js';
import {
  DIALOG_PAD_PROPERTIES,
  DialogPadProperties,
} from '@ziroeda/pcbnew/dialogs/dialog_pad_properties.js';
import { PAD_ATTRIB } from '@ziroeda/pcbnew/padstack.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import { TEST_PCB_FRAME } from '../support/test_pcb_frame.js';

afterEach(cleanup);
beforeEach(() => {
  DIALOG_PAD_PROPERTIES.m_page = 0;
});

const MM = (n: number): number => pcbIUScale.mmToIU(n);

function show() {
  const board = ParseBoard(`(kicad_pcb (version 20241229) (generator "test")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (1 "F.Mask" user) (3 "B.Mask" user))
  (net 0 "")
  (net 1 "GND")
  (footprint "Lib:J" (layer "F.Cu") (uuid "20000000-0000-4000-8000-000000000001") (at 10 20 0)
    (property "Reference" "J1" (at 0 0 0) (layer "F.SilkS") (uuid "20000000-0000-4000-8000-000000000002"))
    (property "Value" "CONN" (at 0 1 0) (layer "F.Fab") (uuid "20000000-0000-4000-8000-000000000005"))
    (pad "1" thru_hole rect (at 1 0) (size 2 1.2) (drill 0.8) (layers "*.Cu" "*.Mask")
      (net 1 "GND") (uuid "20000000-0000-4000-8000-000000000003"))))`);
  const frame = new TEST_PCB_FRAME(board);
  frame.SetUserUnits('mm');
  const pad = () => board.Footprints()[0]!.Pads()[0]!;
  const onClose = vi.fn();
  const view = render(
    <DialogPadProperties dialog={new DIALOG_PAD_PROPERTIES(frame, pad())} onClose={onClose} />,
  );
  return { pad, onClose, view, frame };
}

const entry = (aLabel: string) => screen.getByLabelText(aLabel) as HTMLInputElement;
const combo = (aName: string) => screen.getByRole('button', { name: aName }) as HTMLButtonElement;
const button = (aName: string) => screen.getByRole('button', { name: aName });

function selectCombo(aName: string, aOption: string): void {
  fireEvent.click(combo(aName));
  const popup = screen.getAllByRole('listbox').find((l) => !l.getAttribute('aria-label'))!;
  fireEvent.mouseDown(within(popup).getByRole('option', { name: aOption }));
}

describe('DIALOG_PAD_PROPERTIES window', () => {
  it('opens on the General page with the four notebook pages and the parent footprint line', () => {
    show();

    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'General',
      'Connections',
      'Clearance Overrides',
      'Backdrill',
    ]);
    expect(screen.getByRole('tab', { name: 'General' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Footprint J1 (CONN), front side, rotated 0 deg')).toBeTruthy();
    expect(entry('Pad number').value).toBe('1');
    // A round hole is one "Diameter:" box; a rect pad has both size boxes.
    expect(screen.getByText('Diameter:')).toBeTruthy();
    expect(screen.getByText('Pad size X:')).toBeTruthy();
  });

  it('a typed change marks the title, and OK writes it and closes', () => {
    const { pad, onClose } = show();

    expect(screen.getByText('Pad Properties')).toBeTruthy();
    fireEvent.change(entry('Pad number'), { target: { value: 'A5' } });
    expect(screen.getByText('*Pad Properties')).toBeTruthy();

    fireEvent.click(button('OK'));
    expect(onClose).toHaveBeenCalledWith(true);
    expect(pad().GetNumber()).toBe('A5');
  });

  it('Cancel closes and writes nothing', () => {
    const { pad, onClose } = show();

    fireEvent.change(entry('Pad number'), { target: { value: 'A5' } });
    fireEvent.click(button('Cancel'));
    expect(onClose).toHaveBeenCalledWith(false);
    expect(pad().GetNumber()).toBe('1');
  });

  it('picking Circular relabels the size box Diameter: and hides Y', () => {
    show();

    selectCombo('Pad shape', 'Circular');
    expect(screen.queryByText('Pad size X:')).toBeNull();
    expect(screen.getAllByText('Diameter:')).toHaveLength(2);
  });

  it('picking SMD takes the hole section away and offers F.Cu / B.Cu', () => {
    const { pad } = show();

    expect(screen.getByText('Hole shape:')).toBeTruthy();
    selectCombo('Pad type', 'SMD');
    expect(screen.queryByText('Hole shape:')).toBeNull();
    expect(screen.queryByText('Padstack mode:')).toBeNull();

    fireEvent.click(button('OK'));
    expect(pad().GetAttribute()).toBe(PAD_ATTRIB.SMD);
    expect(pad().GetDrillSize()).toEqual({ x: 0, y: 0 });
  });

  it('a pad with no hole raises Pad Properties Errors and stays open', () => {
    const { pad, onClose } = show();

    fireEvent.change(entry('Diameter'), { target: { value: '0' } });
    fireEvent.click(button('OK'));

    expect(screen.getByText('Pad Properties Errors')).toBeTruthy();
    expect(screen.getByText('Error: Through hole pad has no hole.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(pad().GetDrillSize()).toEqual({ x: MM(0.8), y: MM(0.8) });
  });

  it('the notebook page is remembered for the session', () => {
    const first = show();

    fireEvent.click(screen.getByRole('tab', { name: 'Clearance Overrides' }));
    first.view.unmount();

    show();
    expect(
      screen.getByRole('tab', { name: 'Clearance Overrides' }).getAttribute('aria-selected'),
    ).toBe('true');
  });
});
