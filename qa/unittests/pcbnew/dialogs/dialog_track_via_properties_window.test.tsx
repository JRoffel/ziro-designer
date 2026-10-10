// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_TRACK_VIA_PROPERTIES's window (dialog_track_via_properties.cpp) on
 * DIALOG_TRACK_VIA_PROPERTIES_BASE: which boxes TransferDataToWindow shows, and the handlers'
 * enables - onTrackEdit (:1676), onViaEdit (:1640), onViaNotFreeClicked (:1610),
 * onBackdrillChange (:1880), onTopPostMachineChange (:1920), onWidthSelect (:1620) - and OK
 * handing the window back.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pcbIUScale } from '@ziroeda/common/eda_units.js';
import { INDETERMINATE_STATE } from '@ziroeda/common/widgets/ui_common.js';
import type { BOARD } from '@ziroeda/pcbnew/board.js';
import {
  DIALOG_TRACK_VIA_PROPERTIES,
  DialogTrackViaProperties,
  type TrackViaValues,
} from '@ziroeda/pcbnew/dialogs/dialog_track_via_properties.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import type { PCB_TRACK } from '@ziroeda/pcbnew/pcb_track.js';
import { TEST_PCB_FRAME } from '../support/test_pcb_frame.js';

afterEach(cleanup);

const MM = (n: number): number => pcbIUScale.mmToIU(n);

const U = {
  t1: '10000000-0000-4000-8000-000000000001',
  t2: '10000000-0000-4000-8000-000000000002',
  v1: '10000000-0000-4000-8000-000000000004',
};

let board: BOARD;
let frame: TEST_PCB_FRAME;

beforeEach(() => {
  board = ParseBoard(`(kicad_pcb (version 20241229) (generator "test")
  (layers (0 "F.Cu" signal) (4 "In1.Cu" signal) (6 "In2.Cu" signal) (2 "B.Cu" signal)
    (1 "F.Mask" user) (3 "B.Mask" user))
  (net 0 "")
  (net 1 "GND")
  (segment (start 0 0) (end 10 0) (width 0.25) (layer "F.Cu") (net 1) (uuid "${U.t1}"))
  (segment (start 10 0) (end 50 0) (width 0.5) (layer "F.Cu") (net 1) (uuid "${U.t2}"))
  (via (at 0 0) (size 0.8) (drill 0.4) (layers "F.Cu" "B.Cu") (net 1) (uuid "${U.v1}")))`);
  board.BuildConnectivity();
  frame = new TEST_PCB_FRAME(board);
  frame.SetUserUnits('mm');
});

function show(...uuids: string[]) {
  const items = uuids.map((u) => board.Tracks().find((t) => t.m_Uuid === u) as PCB_TRACK);
  const dlg = new DIALOG_TRACK_VIA_PROPERTIES(frame, items);
  const onApply = vi.fn<(v: TrackViaValues) => void>();
  render(<DialogTrackViaProperties dlg={dlg} frame={frame} onApply={onApply} onClose={vi.fn()} />);
  return { onApply };
}

const groupShown = (aLabel: string): boolean =>
  [...document.querySelectorAll('fieldset.ze-sbox > legend')].some((l) => l.textContent === aLabel);
const entry = (aLabel: string): HTMLInputElement =>
  screen.getByLabelText(aLabel) as HTMLInputElement;
const combo = (aName: string): HTMLButtonElement =>
  screen.getByRole('button', { name: aName }) as HTMLButtonElement;
const box = (aLabel: string): HTMLInputElement => screen.getByLabelText(aLabel) as HTMLInputElement;

function selectCombo(aName: string, aOption: string): void {
  fireEvent.click(combo(aName));
  const popup = screen.getAllByRole('listbox').find((l) => !l.getAttribute('aria-label'))!;
  fireEvent.mouseDown(within(popup).getByRole('option', { name: aOption }));
}

describe('DIALOG_TRACK_VIA_PROPERTIES window', () => {
  it('tracks only: the Vias box is hidden, a disagreeing width is INDETERMINATE', () => {
    show(U.t1, U.t2);
    expect(groupShown('Tracks')).toBe(true);
    expect(groupShown('Vias')).toBe(false);
    expect(entry('Track width').value).toBe(INDETERMINATE_STATE);
    expect(entry('Start Y').value).toBe('0');
  });

  it('onTrackEdit: the mask margin follows the solder mask check on an outer layer', () => {
    show(U.t1);
    expect(box('Solder mask').disabled).toBe(false);
    expect(entry('Solder mask expansion').disabled).toBe(true);
    fireEvent.click(box('Solder mask'));
    expect(entry('Solder mask expansion').disabled).toBe(false);
  });

  it('onTrackEdit: an inner layer greys the solder mask', () => {
    show(U.t1);
    selectCombo('Track layer', 'In1.Cu');
    expect(box('Solder mask').disabled).toBe(true);
  });

  it('onWidthSelect: a pre-defined width fills the width box', () => {
    frame.GetDesignSettings().m_TrackWidthList = [0, MM(0.2), MM(0.4)];
    show(U.t1, U.t2);
    selectCombo('Pre-defined track widths', '0.4');
    expect(entry('Track width').value).toBe('0.4');
  });

  it('via only: the net is greyed while "Automatically update via nets" is on', () => {
    show(U.v1);
    expect(groupShown('Tracks')).toBe(false);
    expect(box('Automatically update via nets').checked).toBe(true);
    expect((screen.getByLabelText('Net') as HTMLInputElement).disabled).toBe(true);
  });

  it('tracks with the via: the net stays editable (onViaNotFreeClicked only acts without tracks)', () => {
    show(U.t1, U.v1);
    expect((screen.getByLabelText('Net') as HTMLInputElement).disabled).toBe(false);
  });

  it('a through via fixes its layers; a blind one frees them (onViaEdit)', () => {
    show(U.v1);
    expect(combo('Start layer').disabled).toBe(true);
    selectCombo('Via type', 'Blind');
    expect(combo('Start layer').disabled).toBe(false);
  });

  it('onBackdrillChange: Top enables its size at 1.1 x the drill, on F.Cu', () => {
    show(U.v1);
    expect(entry('Top backdrill size').disabled).toBe(true);
    selectCombo('Backdrill', 'Top');
    expect(entry('Top backdrill size').disabled).toBe(false);
    expect(entry('Top backdrill size').value).toBe('0.44');
    expect(entry('Bottom backdrill size').disabled).toBe(true);
  });

  it('onTopPostMachineChange: a countersink asks for an angle, 82 by default', () => {
    show(U.v1);
    selectCombo('Top post-machining', 'Countersink');
    expect(entry('Top post-machining angle').value).toBe('82');
    selectCombo('Top post-machining', 'Counterbore');
    expect(screen.getByLabelText('Top post-machining depth')).toBeDefined();
  });

  it('OK hands back the window: a typed width in IU, the rest as shown', () => {
    const { onApply } = show(U.t1, U.t2);
    fireEvent.change(entry('Track width'), { target: { value: '0.3' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    const v = onApply.mock.calls[0]![0];
    expect(v.trackWidth).toBe(MM(0.3));
    expect(v.startX).toBeUndefined();
    expect(v.startY).toBe(0);
    expect(v.layer).toBe('F.Cu');
  });
});
