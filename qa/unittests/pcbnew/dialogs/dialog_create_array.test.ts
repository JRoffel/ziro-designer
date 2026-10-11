// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_CREATE_ARRAY (pcbnew/dialogs/dialog_create_array.cpp): CREATE_ARRAY_DIALOG_ENTRIES'
 * defaults as the persister restores them, TransferDataFromWindow's options, errors and stacking
 * warnings, OnAxisNumberingChange, calculateCircularArrayProperties, the session memory, and
 * setControlEnablement.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { type ARRAY_CIRCULAR_OPTIONS, ARRAY_GRID_OPTIONS } from '@ziroeda/common/array_options.js';
import { pcbIUScale } from '@ziroeda/common/eda_units.js';
import {
  DIALOG_CREATE_ARRAY,
  ResetCreateArrayOptions,
} from '@ziroeda/pcbnew/dialogs/dialog_create_array.js';

const MM = (n: number): number => pcbIUScale.mmToIU(n);
const board = () => new DIALOG_CREATE_ARRAY(false, { x: 0, y: 0 });
const footprintEditor = () => new DIALOG_CREATE_ARRAY(true, { x: 0, y: 0 });

beforeEach(() => ResetCreateArrayOptions());

describe('CREATE_ARRAY_DIALOG_ENTRIES, restored to the controls', () => {
  it('opens on a 5 x 5 grid at 2.54 mm, staggering rows by 1, centred on the source', () => {
    // Both grid-position radios default true; "centre on source" is restored second and wins.
    expect(board().RestoreConfigToControls()).toMatchObject({
      page: 0,
      nx: '5',
      ny: '5',
      dx: MM(2.54),
      dy: MM(2.54),
      stagger: '1',
      staggerRows: true,
      centreOnSource: true,
      circAngle: '90',
      circCount: '4',
      fullCircle: false,
      arrangeSelection: false,
      uniqueRefs: true,
    });
  });
});

describe('TransferDataFromWindow', () => {
  it('makes a grid from the grid page', () => {
    const d = board();
    const r = d.TransferDataFromWindow(d.RestoreConfigToControls());
    if (!r.ok) throw new Error(r.error);
    const grid = r.settings as ARRAY_GRID_OPTIONS;
    expect(grid).toBeInstanceOf(ARRAY_GRID_OPTIONS);
    expect([grid.m_nx, grid.m_ny, grid.m_delta, grid.m_centred]).toEqual([
      5,
      5,
      { x: MM(2.54), y: MM(2.54) },
      true,
    ]);
    expect(r.warnings).toEqual([]);
  });

  it('refuses a count that is not an integer, with wxString::ToLong', () => {
    const d = board();
    const r = d.TransferDataFromWindow({ ...d.RestoreConfigToControls(), nx: '2.5' });
    expect(r).toEqual({ ok: false, error: 'Bad numeric value for horizontal count: 2.5' });
  });

  it('warns of items stacked on one another by a zero delta', () => {
    const d = board();
    const r = d.TransferDataFromWindow({ ...d.RestoreConfigToControls(), dx: 0, offsetX: 0 });
    expect(r.ok && r.warnings).toEqual(['horizontal delta of zero with 5 objects']);
  });

  it('makes a circle from the circular page, clockwise for the first direction', () => {
    const d = board();
    const r = d.TransferDataFromWindow({
      ...d.RestoreConfigToControls(),
      page: 1,
      circDirection: 0,
    });
    if (!r.ok) throw new Error(r.error);
    const circ = r.settings as ARRAY_CIRCULAR_OPTIONS;
    expect([circ.m_nPts, circ.m_angle.AsDegrees(), circ.m_clockwise]).toEqual([4, 90, true]);
  });

  it('warns of a zero angle with more than one point', () => {
    const d = board();
    const r = d.TransferDataFromWindow({ ...d.RestoreConfigToControls(), page: 1, circAngle: '0' });
    expect(r.ok && r.warnings).toEqual(['angular delta of zero with 4 objects']);
  });

  it('numbers pads from a set start in the footprint editor, in the chosen alphabet', () => {
    const d = footprintEditor();
    const r = d.TransferDataFromWindow({
      ...d.RestoreConfigToControls(),
      gridStartNumberingOpt: 1,
      gridNumberingScheme: 0,
      priAxisNumbering: 3, // Alphabet, full 26 characters
      priNumberingOffset: 'B',
      priNumberingStep: '2',
    });
    if (!r.ok) throw new Error(r.error);
    expect([r.settings.GetItemNumber(0), r.settings.GetItemNumber(1)]).toEqual(['B', 'D']);
  });

  it('refuses a start the alphabet cannot read', () => {
    const d = footprintEditor();
    const r = d.TransferDataFromWindow({
      ...d.RestoreConfigToControls(),
      gridStartNumberingOpt: 1,
      priAxisNumbering: 3,
      priNumberingOffset: '1',
    });
    expect(r).toEqual({
      ok: false,
      error:
        "Could not determine numbering start from '1': expected value consistent with alphabet 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.",
    });
  });
});

describe('the controls between them', () => {
  it('OnAxisNumberingChange turns a start the new alphabet cannot read into its first number', () => {
    expect(DIALOG_CREATE_ARRAY.OnAxisNumberingChange(3, '1')).toBe('A');
    expect(DIALOG_CREATE_ARRAY.OnAxisNumberingChange(0, 'A')).toBe('1');
    expect(DIALOG_CREATE_ARRAY.OnAxisNumberingChange(0, '7')).toBe('7');
  });

  it('a full circle divides 360 degrees by the count', () => {
    const c = { ...board().RestoreConfigToControls(), fullCircle: true, circCount: '6' };
    expect(DIALOG_CREATE_ARRAY.calculateCircularArrayProperties(c).circAngle).toBe('60');
  });

  it('OK remembers the controls for the next time it opens', () => {
    const d = board();
    DIALOG_CREATE_ARRAY.ReadConfigFromControls({
      ...d.RestoreConfigToControls(),
      nx: '7',
      page: 1,
    });
    expect(board().RestoreConfigToControls()).toMatchObject({ nx: '7', page: 1 });
  });

  it('the board editor hides pad numbering and shows annotation unless arranging', () => {
    const d = board();
    const c = d.RestoreConfigToControls();
    expect(d.setControlEnablement(c)).toMatchObject({
      gridPadNumberingShown: false,
      circPadNumberingShown: false,
      footprintReannotateShown: true,
    });
    expect(d.setControlEnablement({ ...c, arrangeSelection: true }).footprintReannotateShown).toBe(
      false,
    );
  });

  it('the footprint editor greys numbering until Renumber pads and a set start', () => {
    const d = footprintEditor();
    const c = d.RestoreConfigToControls();
    expect(d.setControlEnablement({ ...c, renumberPads: false })).toMatchObject({
      gridStartNumberingOpt: false,
      priAxis: false,
      footprintReannotateShown: false,
    });
    expect(
      d.setControlEnablement({ ...c, renumberPads: true, gridStartNumberingOpt: 1 }),
    ).toMatchObject({
      gridStartNumberingOpt: true,
      priAxis: true,
      secAxis: false,
    });
  });
});
