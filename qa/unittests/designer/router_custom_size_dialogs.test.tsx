// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The two dialogs behind the router size menus' "Use Custom Values..." rows:
 * `DIALOG_TRACK_VIA_SIZE` and `DIALOG_PNS_DIFF_PAIR_DIMENSIONS` (`pcbnew/dialogs/`).
 *
 * They look like the same dialog and are not, in ways that all come from upstream:
 *
 *   - the Track/Via one writes `BOARD_DESIGN_SETTINGS`' stored custom values; the diff-pair one
 *     writes the router's `PNS::SIZES_SETTINGS` it was given;
 *   - the Track/Via one refuses with `PCB_VIA::ValidateViaParameters` - the same function Board
 *     Setup > Pre-defined Sizes uses - and neither floors a value: Track/Via's `minSize` is passed
 *     as UNIT_BINDER's `aAllowEval`, a bool, not as a range;
 *   - the diff-pair one refuses only a gap of zero, and accepts a width of zero;
 *   - the diff-pair one's checkbox GREYS the via-gap row and starts TICKED.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pcbIUScale, pcbMmToIU as mmToIU } from '@ziroeda/common/eda_units.js';
import type { BOARD_DESIGN_SETTINGS } from '@ziroeda/pcbnew/board_design_settings.js';
import {
  DIALOG_PNS_DIFF_PAIR_DIMENSIONS,
  DialogPnsDiffPairDimensions,
} from '@ziroeda/pcbnew/dialogs/dialog_pns_diff_pair_dimensions.js';
import {
  DIALOG_TRACK_VIA_SIZE,
  DialogTrackViaSize,
} from '@ziroeda/pcbnew/dialogs/dialog_track_via_size.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import { DEFAULT_ROUTER_SIZES, type PnsRouterSizes } from '@ziroeda/pcbnew/router/pns_router.js';

afterEach(cleanup);

const MM = (n: number): number => mmToIU(n);
const entry = (aLabel: string): HTMLInputElement =>
  screen.getByLabelText(aLabel) as HTMLInputElement;
const type = (aLabel: string, value: string): void => {
  fireEvent.change(entry(aLabel), { target: { value } });
};
const ok = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'OK' }));
};

/** The frame as a UNIT_BINDER asks it. */
const frame = (aUnits: 'mm' | 'mils' = 'mm') => ({
  GetUserUnits: () => aUnits,
  GetIuScale: () => pcbIUScale,
});

// ---------------------------------------------------------------------------

function openTrackVia(aUnits: 'mm' | 'mils' = 'mm'): {
  bds: BOARD_DESIGN_SETTINGS;
  onClose: ReturnType<typeof vi.fn>;
} {
  const bds = ParseBoard(
    '(kicad_pcb (version 20241229) (generator "t") (layers (0 "F.Cu" signal) (2 "B.Cu" signal)))',
  ).GetDesignSettings();
  bds.SetCustomTrackWidth(MM(0.25));
  bds.SetCustomViaSize(MM(0.8));
  bds.SetCustomViaDrill(MM(0.4));
  const onClose = vi.fn();
  render(
    <DialogTrackViaSize dialog={new DIALOG_TRACK_VIA_SIZE(frame(aUnits), bds)} onClose={onClose} />,
  );
  return { bds, onClose };
}

describe('DIALOG_TRACK_VIA_SIZE', () => {
  it('loads the stored custom values into its three fields', () => {
    openTrackVia();

    expect(entry('Track width').value).toBe('0.25');
    expect(entry('Via diameter').value).toBe('0.8');
    expect(entry('Via hole').value).toBe('0.4');
  });

  it('stores all three on OK', () => {
    const { bds, onClose } = openTrackVia();

    type('Track width', '0.3');
    type('Via diameter', '1');
    type('Via hole', '0.5');
    ok();

    expect(onClose).toHaveBeenCalledWith(true);
    expect([bds.GetCustomTrackWidth(), bds.GetCustomViaSize(), bds.GetCustomViaDrill()]).toEqual([
      MM(0.3),
      MM(1),
      MM(0.5),
    ]);
  });

  it('floors nothing: minSize is the binder’s aAllowEval, not a range', () => {
    const { bds } = openTrackVia();

    type('Track width', '0.001');
    ok();

    expect(bds.GetCustomTrackWidth()).toBe(MM(0.001));
  });

  it('refuses a hole that is not smaller than the diameter, says so, and keeps the values', () => {
    const { bds, onClose } = openTrackVia();

    type('Via diameter', '0.4');
    type('Via hole', '0.4');
    ok();

    expect(onClose).not.toHaveBeenCalled();
    // The wording is `PCB_VIA::ValidateViaParameters`', shared with the Pre-defined Sizes grid.
    expect(screen.getByText(/Via hole size must be smaller than via diameter/)).toBeTruthy();
    expect(bds.GetCustomViaSize()).toBe(MM(0.8));
  });

  it('puts the caret in the field the error names once the error is dismissed', () => {
    // `if( error->m_Field == …::DRILL ) m_viaDrillText->SetFocus();`
    openTrackVia();

    type('Via diameter', '0.4');
    type('Via hole', '0.4');
    ok();
    fireEvent.click(screen.getAllByRole('button', { name: 'OK' }).at(-1)!);

    expect(document.activeElement).toBe(entry('Via hole'));
  });

  it('reads the frame’s units', () => {
    const { bds } = openTrackVia('mils');

    type('Track width', '20');
    ok();
    expect(bds.GetCustomTrackWidth()).toBe(MM(0.508));
  });
});

// ---------------------------------------------------------------------------

function openDiffPair(): { sizes: PnsRouterSizes; onClose: ReturnType<typeof vi.fn> } {
  const sizes: PnsRouterSizes = {
    ...DEFAULT_ROUTER_SIZES,
    diffPairWidth: MM(0.2),
    diffPairGap: MM(0.25),
    diffPairViaGap: MM(0.5),
    diffPairViaGapSameAsTraceGap: true,
  };
  const onClose = vi.fn();
  render(
    <DialogPnsDiffPairDimensions
      dialog={new DIALOG_PNS_DIFF_PAIR_DIMENSIONS(frame(), sizes)}
      onClose={onClose}
    />,
  );
  return { sizes, onClose };
}

describe('DIALOG_PNS_DIFF_PAIR_DIMENSIONS', () => {
  it('loads the dimensions; the via gap shows DiffPairViaGap(), the track gap while it follows', () => {
    openDiffPair();

    expect(entry('Width').value).toBe('0.2');
    expect(entry('Track gap').value).toBe('0.25');
    expect(entry('Via gap').value).toBe('0.25');
  });

  it('greys the via gap while it follows the track gap, rather than hiding it', () => {
    openDiffPair();

    expect(entry('Via gap').disabled).toBe(true);
  });

  it('unticking the box enables the via gap, and writes the flag at once (updateCheckbox)', () => {
    const { sizes } = openDiffPair();

    fireEvent.click(screen.getByLabelText('Via gap same as track gap'));

    expect(entry('Via gap').disabled).toBe(false);
    expect(sizes.diffPairViaGapSameAsTraceGap).toBe(false);
  });

  it('stores the three dimensions and stamps the sources "user choice"', () => {
    const { sizes, onClose } = openDiffPair();

    fireEvent.click(screen.getByLabelText('Via gap same as track gap'));
    type('Width', '0.15');
    type('Track gap', '0.2');
    type('Via gap', '0.4');
    ok();

    expect(onClose).toHaveBeenCalledWith(true);
    expect([sizes.diffPairWidth, sizes.diffPairGap, sizes.diffPairViaGap]).toEqual([
      MM(0.15),
      MM(0.2),
      MM(0.4),
    ]);
    expect(sizes.diffPairGapSource).toBe('user choice');
    expect(sizes.diffPairWidthSource).toBe('user choice');
  });

  it('refuses a gap of zero with its own message, then puts the caret in the gap', () => {
    const { sizes, onClose } = openDiffPair();

    type('Track gap', '0');
    ok();

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Track gap must be greater than 0.')).toBeTruthy();
    expect(sizes.diffPairGap).toBe(MM(0.25));
    fireEvent.click(screen.getAllByRole('button', { name: 'OK' }).at(-1)!);
    expect(document.activeElement).toBe(entry('Track gap'));
  });

  it('accepts a WIDTH of zero, which it does not check at all', () => {
    const { sizes } = openDiffPair();

    type('Width', '0');
    ok();

    expect(sizes.diffPairWidth).toBe(0);
  });
});

describe('both dialogs, as _base.cpp draws them', () => {
  it('Track/Via labels its rows Track width / Via diameter / Via hole', () => {
    openTrackVia();
    for (const l of ['Track width:', 'Via diameter:', 'Via hole:'])
      expect(screen.getByText(l)).toBeTruthy();
  });

  it('a wxDialog does not dismiss on a click outside it', () => {
    const { onClose } = openDiffPair();

    fireEvent.mouseDown(document.querySelector('.ze-modal-backdrop')!);
    expect(onClose).not.toHaveBeenCalled();
  });
});
