// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * PANEL_SETUP_ZONES (pcbnew/dialogs/panel_setup_zones.cpp): the shared PANEL_ZONE_PROPERTIES
 * with no net selector over the board's default ZONE_SETTINGS, written back ORPHANED.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { pcbMmToIU } from '@ziroeda/common/eda_units.js';
import { PANEL_SETUP_ZONES, PanelPcbZones } from '@ziroeda/pcbnew/dialogs/panel_setup_zones.js';
import { ORPHANED_NET } from '@ziroeda/pcbnew/netinfo.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';

afterEach(cleanup);

const board = () =>
  ParseBoard(`(kicad_pcb (version 20241229) (generator "test")
  (layers (0 "F.Cu" signal) (2 "B.Cu" signal))
  (net 0 ""))`);

describe('PANEL_SETUP_ZONES', () => {
  it('writes the window back as the defaults, orphaned', () => {
    const b = board();
    const v = PANEL_SETUP_ZONES.TransferDataToWindow(b);
    const r = PANEL_SETUP_ZONES.TransferDataFromWindow(
      { ...v, clearance: pcbMmToIU(0.7), net: 1 },
      b,
    );
    expect(r.ok).toBe(true);
    const zs = b.GetDesignSettings().GetDefaultZoneSettings();
    expect(zs.m_ZoneClearance).toBe(pcbMmToIU(0.7));
    expect(zs.m_Netcode).toBe(ORPHANED_NET);
  });

  it('a spoke thinner than the minimum width is refused, and the defaults stay', () => {
    const b = board();
    const v = PANEL_SETUP_ZONES.TransferDataToWindow(b);
    const before = b.GetDesignSettings().GetDefaultZoneSettings().m_ThermalReliefSpokeWidth;
    const bad = { ...v, thermalBridgeWidth: v.minThickness - 1 };
    const r = PANEL_SETUP_ZONES.TransferDataFromWindow(bad, b);
    expect(r).toEqual({
      ok: false,
      message: 'Thermal spoke width cannot be smaller than the minimum width.',
    });
    expect(PANEL_SETUP_ZONES.Validate(bad).ok).toBe(false);
    expect(b.GetDesignSettings().GetDefaultZoneSettings().m_ThermalReliefSpokeWidth).toBe(before);
  });

  it('is the heading over the zone panel, with no net selector', () => {
    const v = PANEL_SETUP_ZONES.TransferDataToWindow(board());
    render(<PanelPcbZones value={v} onChange={() => {}} units="mm" />);
    expect(screen.getByText('Default Properties for New Zones')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: /clearance/i })).toBeTruthy();
    expect(screen.queryByText('Net:')).toBeNull();
  });
});

describe('Board Setup OK', () => {
  it('stays open on a zone default AcceptOptions refuses, and says why', async () => {
    const { DialogBoardSetup } = await import('@ziroeda/pcbnew/dialogs/dialog_board_setup.js');
    const { freshBoardSetup } = await import('../../designer/board_setup_test_utils.js');
    const v = freshBoardSetup();
    let ok = false;
    render(
      <DialogBoardSetup
        value={{ ...v, zones: { ...v.zones, thermalBridgeWidth: v.zones.minThickness - 1 } }}
        units="mm"
        onOk={() => (ok = true)}
        onClose={() => {}}
      />,
    );
    screen.getByRole('button', { name: 'OK' }).click();
    expect(ok).toBe(false);
    expect(
      await screen.findByText('Thermal spoke width cannot be smaller than the minimum width.'),
    ).toBeTruthy();
  });
});
