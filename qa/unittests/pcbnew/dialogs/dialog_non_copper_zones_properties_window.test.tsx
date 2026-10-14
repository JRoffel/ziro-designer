// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_NON_COPPER_ZONES_EDITOR's window (dialog_non_copper_zones_properties.cpp) on its base:
 * the SetupLayersList rows, OnUpdateUI's corner label and enable, the hatch fields following the
 * fill type, and OK writing the zone or raising its error.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PCB_LAYER_ID } from '@ziroeda/common/layer_id.js';
import type { BOARD } from '@ziroeda/pcbnew/board.js';
import {
  DIALOG_NON_COPPER_ZONES_EDITOR,
  DialogNonCopperZonesProperties,
} from '@ziroeda/pcbnew/dialogs/dialog_non_copper_zones_properties.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import type { ZONE } from '@ziroeda/pcbnew/zone.js';
import { CONVERT_SETTINGS, CONVERT_STRATEGY } from '@ziroeda/pcbnew/pcbnew_settings.js';
import { TEST_PCB_FRAME } from '../support/test_pcb_frame.js';

afterEach(cleanup);

const Z = '60000000-0000-4000-8000-000000000001';
let board: BOARD;
let frame: TEST_PCB_FRAME;
const zone = (): ZONE => board.Zones().find((z) => z.m_Uuid === Z)!;

beforeEach(() => {
  board = ParseBoard(`(kicad_pcb (version 20241229) (generator "test")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal) (5 "F.SilkS" user "F.Silkscreen") (7 "B.SilkS" user "B.Silkscreen"))
  (net 0 "")
  (zone (net 0) (net_name "") (layer "F.SilkS") (uuid "${Z}")
    (hatch edge 0.5)
    (connect_pads (clearance 0))
    (min_thickness 0.3)
    (fill (thermal_gap 0.5) (thermal_bridge_width 0.5))
    (polygon (pts (xy 0 0) (xy 10 0) (xy 10 10) (xy 0 10)))))`);
  frame = new TEST_PCB_FRAME(board);
});

const LAYERS = [
  { name: 'F.SilkS', color: '#f0f' },
  { name: 'B.SilkS', color: '#0ff' },
];

function show() {
  const onResult = vi.fn();
  render(
    <DialogNonCopperZonesProperties
      dialog={new DIALOG_NON_COPPER_ZONES_EDITOR(frame, zone())}
      units="mm"
      layers={LAYERS}
      onResult={onResult}
    />,
  );
  return { onResult };
}

const field = (aName: string) => screen.getByRole('textbox', { name: aName }) as HTMLInputElement;

describe('DIALOG_NON_COPPER_ZONES_EDITOR window', () => {
  it('lists the layers with the zone’s own ticked, each with its swatch', () => {
    show();
    const list = screen.getByRole('listbox', { name: 'Layers' });
    expect(list.querySelectorAll('.ze-layer-swatch')).toHaveLength(2);
    expect((screen.getByLabelText('F.SilkS') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('B.SilkS') as HTMLInputElement).checked).toBe(false);
  });

  it('OnUpdateUI words the corner row for the smoothing and enables it only with one', () => {
    show();
    expect(field('Corner radius').disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Corner smoothing'));
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Chamfer' }));
    expect(screen.getByText('Chamfer distance:')).toBeTruthy();
    expect(field('Corner radius').disabled).toBe(false);
  });

  it('the hatch fields follow the fill type', () => {
    show();
    expect(field('Hatch width').disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Fill type'));
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Hatch pattern' }));
    expect(field('Hatch width').disabled).toBe(false);
  });

  it('OK writes the layers back', () => {
    const { onResult } = show();
    fireEvent.click(screen.getByLabelText('B.SilkS'));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onResult).toHaveBeenCalledWith(true);
    expect(zone().GetLayerSet().Contains(PCB_LAYER_ID.B_SilkS)).toBe(true);
  });

  it('no layer raises "No layer selected." and stays open', () => {
    const { onResult } = show();
    fireEvent.click(screen.getByLabelText('F.SilkS'));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onResult).not.toHaveBeenCalled();
    expect(screen.getByText('No layer selected.')).toBeTruthy();
  });
});

describe('DIALOG_NON_COPPER_ZONES_EDITOR converting (CONVERT_TOOL)', () => {
  it('carries the Conversion Settings box, retitled, and OK writes the strategy back', () => {
    const settings = new CONVERT_SETTINGS();
    settings.m_Strategy = CONVERT_STRATEGY.CENTERLINE;
    const zoneSettings = frame.GetDesignSettings().GetDefaultZoneSettings().clone();
    const onResult = vi.fn();
    render(
      <DialogNonCopperZonesProperties
        dialog={new DIALOG_NON_COPPER_ZONES_EDITOR(frame, null, zoneSettings, settings)}
        units="mm"
        layers={LAYERS}
        onResult={onResult}
      />,
    );
    expect(screen.getByText('Convert to Non Copper Zone')).toBeTruthy();
    expect(screen.getByText('Conversion Settings')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Create bounding hull'));
    fireEvent.click(screen.getByLabelText('F.SilkS'));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onResult).toHaveBeenCalledWith(true);
    expect(settings.m_Strategy).toBe(CONVERT_STRATEGY.BOUNDING_HULL);
  });

  it('has no Conversion Settings box when only editing a zone', () => {
    show();
    expect(screen.queryByText('Conversion Settings')).toBeNull();
    expect(screen.getByText('Non Copper Zone Properties')).toBeTruthy();
  });
});
