// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * The three stroke dialogs over their _base files: DIALOG_LINE_PROPERTIES, DIALOG_WIRE_BUS_PROPERTIES
 * and DIALOG_JUNCTION_PROPS. Titles, the units labels (the frame's, not "mm"), Default (wxID_APPLY)
 * and the junction size disabled when no junction is selected.
 */
import { SCH_LAYER_ID } from '@ziroeda/common/layer_id.js';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import {
  DIALOG_JUNCTION_PROPS,
  DialogJunctionProps,
} from '@ziroeda/eeschema/dialogs/dialog_junction_props.js';
import {
  DIALOG_LINE_PROPERTIES,
  DialogLineProperties,
} from '@ziroeda/eeschema/dialogs/dialog_line_properties.js';
import {
  DIALOG_WIRE_BUS_PROPERTIES,
  DialogWireBusProperties,
} from '@ziroeda/eeschema/dialogs/dialog_wire_bus_properties.js';
import { SCH_JUNCTION } from '@ziroeda/eeschema/sch_junction.js';
import { SCH_LINE } from '@ziroeda/eeschema/sch_line.js';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { schFrame, schToolHarness } from '../support/sch_tool_harness.js';

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => {
  cleanup();
  SetPgm(null);
});

function lineOn(aLayer: SCH_LAYER_ID) {
  const h = schToolHarness(schFrame({}));
  const l = new SCH_LINE({ x: 0, y: 0 }, aLayer);
  l.SetEndPoint({ x: 12700, y: 0 });
  l.SetLineWidth(2540);
  h.frame.AddToScreen(l, h.frame.GetScreen());
  return { h, l };
}

describe('the three stroke dialogs', () => {
  it('Line Properties: its title, the units, Default puts width 0 back', () => {
    const { h, l } = lineOn(SCH_LAYER_ID.LAYER_NOTES);
    const dlg = new DIALOG_LINE_PROPERTIES(h.frame, [l]);
    const onOk = vi.fn();
    render(
      <DialogLineProperties
        dlg={dlg}
        initial={dlg.TransferDataToWindow()}
        units="mils"
        onOk={onOk}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText('Line Properties')).toBeTruthy();
    expect(screen.getByText('mils')).toBeTruthy();
    expect((screen.getByLabelText('Width') as HTMLInputElement).value).toBe('0.254');
    fireEvent.click(screen.getByRole('button', { name: 'Default' }));
    expect((screen.getByLabelText('Width') as HTMLInputElement).value).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onOk.mock.calls[0]![0]).toMatchObject({ width: '0' });
  });

  it('Wire & Bus Properties: no junction selected greys the junction size', () => {
    const { h, l } = lineOn(SCH_LAYER_ID.LAYER_WIRE);
    const dlg = new DIALOG_WIRE_BUS_PROPERTIES(h.frame, [l]);
    render(
      <DialogWireBusProperties
        dlg={dlg}
        initial={dlg.TransferDataToWindow()}
        units="mm"
        onOk={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText('Wire & Bus Properties')).toBeTruthy();
    expect((screen.getByLabelText('Junction size') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Wire/bus width') as HTMLInputElement).disabled).toBe(false);
  });

  it('Junction Properties: its title and Default', () => {
    const h = schToolHarness(schFrame({}));
    const j = new SCH_JUNCTION({ x: 0, y: 0 }, 1000);
    h.frame.AddToScreen(j, h.frame.GetScreen());
    const dlg = new DIALOG_JUNCTION_PROPS(h.frame, [j]);
    render(
      <DialogJunctionProps
        dlg={dlg}
        initial={dlg.TransferDataToWindow()}
        units="mm"
        onOk={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText('Junction Properties')).toBeTruthy();
    expect((screen.getByLabelText('Diameter') as HTMLInputElement).value).toBe('0.1');
    fireEvent.click(screen.getByRole('button', { name: 'Default' }));
    expect((screen.getByLabelText('Diameter') as HTMLInputElement).value).toBe('0');
  });
});
