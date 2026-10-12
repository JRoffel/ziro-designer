// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * Board Setup > Design Rules > Constraints — `PANEL_SETUP_CONSTRAINTS`
 * (`pcbnew/dialogs/panel_setup_constraints_base.cpp`).
 *
 * The page came out ~115 px wider than KiCad's and its two halves did not line
 * up, and every cause was a per-element fact that no measurement of the page
 * as a whole could name:
 *
 *   - `bScrolledSizer` adds BOTH halves at proportion 0 and puts the one
 *     growable spacer after them (`:379-395`), so neither column stretches;
 *   - a section heading is one cell in the FIRST column (`Add( m_staticText23,
 *     0, wxTOP|wxLEFT, 13 )`), which is what makes the bitmap column as wide as
 *     "Copper" — not a cell spanning all four;
 *   - `fgSizer2`, the Maximum allowed deviation row, is label | entry | units
 *     with NO bitmap column (`:400-424`);
 *   - `m_minResolvedSpokeCountCtrl` is a `wxSpinCtrl` (`:452`), not an entry;
 *   - every bitmap is asked for at 24 px
 *     (`KiBitmapBundle( …, 24 )`, `panel_setup_constraints.cpp:61-73`).
 *
 * So these assert the structure, per element. The widths themselves are in
 * `common/widgets/shell.css` and are measured by
 * `qa/probes/constraints_layout_probe.cpp`; what a DOM test can pin is that
 * the markup those rules are written against is the markup we render.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DialogBoardSetup } from '@ziroeda/pcbnew/dialogs/dialog_board_setup.js';
import { freshBoardSetup } from './board_setup_test_utils.js';
import type { BoardSetupValues } from '@ziroeda/pcbnew/dialogs/dialog_board_setup.js';
import {
  clampMaxErrorMM,
  MAX_ERROR_SIZE_MM,
  MIN_ERROR_SIZE_MM,
} from '@ziroeda/pcbnew/dialogs/panel_setup_constraints.js';

afterEach(cleanup);

/** The dialog on its Constraints page, plus whatever OK last handed back. */
function open(over: Partial<BoardSetupValues> = {}): { ok: () => BoardSetupValues | null } {
  let out: BoardSetupValues | null = null;
  render(
    <DialogBoardSetup
      value={{ ...freshBoardSetup(), ...over }}
      /* The frame's display units: Board Setup's fields and grid cells are
         `UNIT_BINDER`s and `WX_GRID`s with `SetUnitsProvider( m_Frame )`. */
      units="mm"
      onOk={(next) => {
        out = next;
      }}
      onClose={() => {}}
    />,
  );
  fireEvent.click(screen.getByText('Constraints'));
  return {
    ok: () => {
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));
      return out;
    },
  };
}

/** The fourteen UNIT_BINDER rows of fgFeatureConstraints, in Add() order (the groove row hidden). */
const ROWS = [
  'Minimum clearance',
  'Minimum track width',
  'Minimum connection width',
  'Minimum annular width',
  'Minimum via diameter',
  'Copper to hole clearance',
  'Copper to edge clearance',
  'Minimum drill size',
  'Hole to hole clearance',
  'Minimum uVia diameter',
  'Minimum uVia hole',
  'Minimum item clearance',
  'Minimum text height',
  'Minimum text thickness',
];

describe('the Constraints page structure', () => {
  it('heads the four sections Copper, Holes, uVias, Silk, in that order', () => {
    open();
    const text = document.body.textContent ?? '';
    const at = ['Copper', 'Holes', 'uVias', 'Silk'].map((h) => text.indexOf(h));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
  });

  it('builds every constraint as a binder in the frame units', () => {
    open();
    for (const name of ROWS) expect(screen.getByRole('textbox', { name })).toBeTruthy();
    // Every row's units label, and the deviation's.
    expect(screen.getAllByText('mm')).toHaveLength(ROWS.length + 1);
  });

  it('hides the creepage groove row, as a stock KiCad does', () => {
    // Show( false ) unless ADVANCED_CFG::m_EnableCreepageSlot.
    open();
    expect(screen.queryByText('Minimum groove for creepage:')).toBeNull();
  });

  it('draws the eleven row bitmaps and the two zone-fill ones', () => {
    open();
    expect(document.querySelectorAll('img.ze-staticbitmap')).toHaveLength(13);
  });

  it('formats the zone filling note in the frame units', () => {
    open();
    expect(screen.getByText('Note: zone filling can be slow when < 0.005 mm.')).toBeTruthy();
  });

  it('draws the thermal spoke count as a spin control, not a text field', () => {
    open();
    const input = screen.getByLabelText('Minimum thermal relief spoke count');
    expect(input.closest('.ze-spinctrl')!.querySelectorAll('button')).toHaveLength(2);
  });
});

describe('the spoke count spin control', () => {
  it('clamps to the wxSpinCtrl range rather than refusing', () => {
    const { ok } = open();

    fireEvent.change(screen.getByLabelText('Minimum thermal relief spoke count'), {
      target: { value: '99' },
    });
    // [data] `wxSpinCtrl( …, wxSP_ARROW_KEYS, 0, 10, 0 )`.
    expect(ok()!.constraints.minThermalSpokes).toBe(10);
  });
});

describe('m_MaxError is clamped on the way out', () => {
  it('is the range from board_design_settings.h', () => {
    expect([MIN_ERROR_SIZE_MM, MAX_ERROR_SIZE_MM]).toEqual([0.001, 0.1]);
    expect(clampMaxErrorMM(0)).toBe(0.001);
    expect(clampMaxErrorMM(5)).toBe(0.1);
    expect(clampMaxErrorMM(0.005)).toBe(0.005);
  });

  it('stores a typed-in zero as the minimum, not as zero', () => {
    // GetArcToSegmentCount divides by the error, so a zero out of this page is
    // a division by zero in the zone filler.
    const { ok } = open({
      constraints: { ...freshBoardSetup().constraints, maxDeviationMM: 0 },
    });

    expect(ok()!.constraints.maxDeviationMM).toBe(MIN_ERROR_SIZE_MM);
  });

  it('leaves an in-range value exactly as typed', () => {
    const { ok } = open();

    fireEvent.change(screen.getByRole('textbox', { name: 'Maximum allowed deviation' }), {
      target: { value: '0.02' },
    });
    expect(ok()!.constraints.maxDeviationMM).toBe(0.02);
  });
});

describe('TransferDataFromWindow validates before it stores', () => {
  const type = (key: string, value: string): void => {
    fireEvent.change(document.getElementById(`ze-constraint-${key}`)!, { target: { value } });
  };

  it('refuses a negative clearance and commits nothing', () => {
    const { ok } = open();

    type('minClearanceMM', '-1');
    // `Validate` returns false before the first assignment, so OK does not fire
    // and none of the page's other edits land either.
    expect(ok()).toBeNull();
    expect(screen.getByText(/Minimum clearance must be at least/)).toBeTruthy();
  });

  it('refuses a value over the 10 inch cap', () => {
    const { ok } = open();

    // [data] `Validate( 0, 10, EDA_UNITS::INCH )` — 254 mm.
    type('minTrackMM', '300');
    expect(ok()).toBeNull();
    expect(screen.getByText(/Minimum track width must be less than/)).toBeTruthy();
  });

  it('holds the drill to its own mils range, not the inch one', () => {
    const { ok } = open();

    // [data] `Validate( 2, 1000, EDA_UNITS::MILS )` — 0.0508 mm to 25.4 mm. A
    // 0.01 mm drill is inside the inch range every other field uses and
    // outside this one.
    type('minThroughHoleMM', '0.01');
    expect(ok()).toBeNull();
    expect(screen.getByText(/Minimum drill size must be at least/)).toBeTruthy();
  });

  it('leaves the fields upstream does not validate alone', () => {
    const { ok } = open();

    // `TransferDataFromWindow` calls Validate on ten fields and these are not
    // among them: a uVia or Silk value out of range is stored as typed.
    type('minUViaMM', '900');
    type('minTextHeightMM', '900');
    expect(ok()!.constraints.minUViaMM).toBe(900);
  });

  it('accepts the whole page when every value is in range', () => {
    const { ok } = open();

    type('minClearanceMM', '0.2');
    expect(ok()!.constraints.minClearanceMM).toBe(0.2);
  });
});
