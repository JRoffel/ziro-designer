// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_UPDATE_FROM_PCB (dialog_update_from_pcb.cpp): the dry run on open and on every option,
 * re-link clearing and disabling References, and Update Schematic applying, disabling OK and
 * staying open. The board comes through the headless MAIL_PCB_GET_NETLIST answer.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CTL_OMIT_FILTERS } from '@ziroeda/common/ctl_flags.js';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { STRING_FORMATTER } from '@ziroeda/common/richio.js';
import { FIELD_T } from '@ziroeda/common/template_fieldnames.js';
import { setHeadlessPcbNetlistProvider } from '@ziroeda/eeschema/browser/headless_pcb_netlist.js';
import { DIALOG_UPDATE_FROM_PCB } from '@ziroeda/eeschema/dialogs/dialog_update_from_pcb.js';
import { SCH_REFERENCE_LIST } from '@ziroeda/eeschema/sch_reference_list.js';
import { SYMBOL_FILTER } from '@ziroeda/eeschema/sch_sheet_path.js';
import { loadKicadNetlist } from '@ziroeda/pcbnew/netlist_reader/kicad_netlist_reader.js';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openProject, schFrame } from '../support/sch_tool_harness.js';

const DIR = resolve(__dirname, '../../../data/eeschema/netlist_oracle/complex_hierarchy');

beforeEach(() => SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER())));
afterEach(() => {
  cleanup();
  setHeadlessPcbNetlistProvider(() => null);
  SetPgm(null);
});

/** The schematic's own netlist as the board, short net names, C1's value changed. */
function board(): string {
  const nl = loadKicadNetlist(
    readFileSync(resolve(DIR, 'complex_hierarchy.kicad-cli.net'), 'utf8'),
  );

  for (let i = 0; i < nl.GetCount(); i++) {
    const c = nl.GetComponent(i)!;
    const nets = [...Array(c.GetNetCount()).keys()].map((k) => c.GetNetAt(k));
    c.ClearNets();
    for (const n of nets)
      c.AddNet(n.GetPinName(), n.GetNetName().slice(n.GetNetName().lastIndexOf('/') + 1), '', '');
  }

  nl.GetComponentByReference('C1')!.SetValue('100uF');
  const sf = new STRING_FORMATTER();
  nl.Format('pcb_netlist', sf, 0, CTL_OMIT_FILTERS);
  return sf.GetString();
}

function open() {
  const frame = schFrame();
  openProject(frame, DIR, 'complex_hierarchy', [
    'complex_hierarchy.kicad_sch',
    'ampli_ht.kicad_sch',
    'complex_hierarchy.kicad_pro',
  ]);
  const text = board();
  setHeadlessPcbNetlistProvider(() => text);
  return frame;
}

const c1Value = (frame: ReturnType<typeof open>): string => {
  const refs = new SCH_REFERENCE_LIST();
  frame.Schematic().Hierarchy().GetSymbols(refs, SYMBOL_FILTER.SYMBOL_FILTER_ALL);
  return refs.at(refs.FindRef('C1')).GetSymbol().GetField(FIELD_T.VALUE)!.GetText();
};

const okButton = () =>
  screen.getByRole('button', { name: 'Update Schematic' }) as HTMLButtonElement;

describe('DIALOG_UPDATE_FROM_PCB', () => {
  it('opens on a dry run: the change is listed, nothing applied, OK enabled', () => {
    const frame = open();
    render(<DIALOG_UPDATE_FROM_PCB frame={frame} onClose={() => {}} />);
    expect(screen.getByText("Change C1 value from '47uF' to '100uF'.")).toBeTruthy();
    expect(okButton().disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(c1Value(frame)).toBe('47uF');
  });

  it('every option re-runs the dry run', () => {
    render(<DIALOG_UPDATE_FROM_PCB frame={open()} onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText('Values'));
    expect(screen.queryByText("Change C1 value from '47uF' to '100uF'.")).toBeNull();
  });

  it('re-link clears and disables References', () => {
    render(<DIALOG_UPDATE_FROM_PCB frame={open()} onClose={() => {}} />);
    const refs = screen.getByLabelText('Reference designators') as HTMLInputElement;
    expect([refs.checked, refs.disabled]).toEqual([true, false]);
    fireEvent.click(
      screen.getByLabelText(
        'Re-link footprints to schematic symbols based on their reference designators',
      ),
    );
    expect([refs.checked, refs.disabled]).toEqual([false, true]);
  });

  it('Update Schematic applies, disables OK and stays open', () => {
    const frame = open();
    const onClose = vi.fn();
    const onUpdated = vi.fn();
    render(<DIALOG_UPDATE_FROM_PCB frame={frame} onUpdated={onUpdated} onClose={onClose} />);
    fireEvent.click(okButton());
    expect(c1Value(frame)).toBe('100uF');
    expect(okButton().disabled).toBe(true);
    expect(onUpdated).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});
