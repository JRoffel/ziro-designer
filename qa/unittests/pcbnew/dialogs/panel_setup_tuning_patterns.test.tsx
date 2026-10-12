// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * PANEL_SETUP_TUNING_PATTERNS (pcbnew/dialogs/panel_setup_tuning_patterns.cpp) on its base: the
 * three MEANDER_SETTINGS, lengths in the frame's units, the radius in percent, each block its own.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PANEL_SETUP_TUNING_PATTERNS,
  PanelPcbTuning,
  type TuningSetup,
} from '@ziroeda/pcbnew/dialogs/panel_setup_tuning_patterns.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';

afterEach(cleanup);

const start = (): TuningSetup =>
  PANEL_SETUP_TUNING_PATTERNS.TransferDataToWindow(
    ParseBoard(
      `(kicad_pcb (version 20241229) (generator "test") (layers (0 "F.Cu" signal) (2 "B.Cu" signal)) (net 0 ""))`,
    ),
  );

const box = (aName: string) => screen.getByRole('textbox', { name: aName }) as HTMLInputElement;

describe('PANEL_SETUP_TUNING_PATTERNS', () => {
  it('shows the amplitudes in the frame units and the radius in percent', () => {
    const v = start();
    v.singleTrack.minAmplitudeMM = 0.254;
    v.diffPairSkew.radiusPct = 80;
    render(<PanelPcbTuning value={v} onChange={() => {}} units="mils" />);
    expect(box('Single track minimum amplitude').value).toBe('10');
    expect(box('Skew radius').value).toBe('80');
    expect(screen.getAllByText('%')).toHaveLength(3);
  });

  it('a typed length lands in its own block, in mm', () => {
    let last: TuningSetup | null = null;
    const v = start();
    render(<PanelPcbTuning value={v} onChange={(n) => (last = n)} units="mm" />);
    fireEvent.change(box('Differential pair spacing'), { target: { value: '0.9' } });
    expect(last!.diffPair.spacingMM).toBeCloseTo(0.9);
    expect(last!.singleTrack).toEqual(v.singleTrack);
    expect(last!.diffPairSkew).toEqual(v.diffPairSkew);
  });

  it('Fillet is MEANDER_STYLE_ROUND, written back through the board', () => {
    const v = start();
    v.diffPair.cornerStyle = 'Fillet';
    const b = ParseBoard(
      `(kicad_pcb (version 20241229) (generator "test") (layers (0 "F.Cu" signal) (2 "B.Cu" signal)) (net 0 ""))`,
    );
    PANEL_SETUP_TUNING_PATTERNS.TransferDataFromWindow(v, b);
    expect(PANEL_SETUP_TUNING_PATTERNS.TransferDataToWindow(b).diffPair.cornerStyle).toBe('Fillet');
    expect(PANEL_SETUP_TUNING_PATTERNS.TransferDataToWindow(b).singleTrack.cornerStyle).toBe(
      v.singleTrack.cornerStyle,
    );
  });
});
