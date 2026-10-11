// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * Which controls the dimension properties dialog shows, by kind.
 * Counterpart: the `switch( m_dimension->Type() )` in
 * `DIALOG_DIMENSION_PROPERTIES`' constructor, which hides whole sizers, plus
 * `m_extensionOvershoot.Show(false)` for anything that is not a
 * `PCB_DIM_ALIGNED`.
 *
 * These rules are not cosmetic. Every hidden control corresponds to a field the
 * engine refuses to write for that kind, so a control shown where the engine
 * ignores it is a box the user can type into that silently does nothing — and
 * one hidden where the engine *does* write is a property they can never reach.
 * The last describe below ties each flag to the engine to keep the two honest.
 */
import { describe, expect, it } from 'vitest';
import { dimensionDialogFields as fieldsFor } from '@ziroeda/pcbnew/dialogs/dialog_dimension_properties.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';

/** The dimension kinds as the KICAD_T each one is (pcb_dimension.h). */
/** The five `(dimension (type …))` kinds, as the file spells them. */
type DimensionKind = 'aligned' | 'orthogonal' | 'center' | 'radial' | 'leader';

const TYPE_OF: Record<DimensionKind, KICAD_T> = {
  aligned: KICAD_T.PCB_DIM_ALIGNED_T,
  orthogonal: KICAD_T.PCB_DIM_ORTHOGONAL_T,
  leader: KICAD_T.PCB_DIM_LEADER_T,
  center: KICAD_T.PCB_DIM_CENTER_T,
  radial: KICAD_T.PCB_DIM_RADIAL_T,
};
const dimensionDialogFields = (k: DimensionKind) => fieldsFor(TYPE_OF[k]);

const ALL: DimensionKind[] = ['aligned', 'orthogonal', 'center', 'radial', 'leader'];

describe('an aligned or orthogonal dimension', () => {
  it('shows Dimension Format, Text and Line, and only these two have an overshoot', () => {
    // The constructor's `default:` hides m_sizerLeader and m_sizerCenter; TransferDataToWindow
    // shows m_extensionOvershoot only for a PCB_DIM_ALIGNED, which an orthogonal one is too.
    for (const k of ['aligned', 'orthogonal'] as const) {
      const f = dimensionDialogFields(k);
      expect([f.leader, f.center, f.format, f.text], k).toEqual([false, false, true, true]);
      expect(
        [f.textPositionMode, f.arrowLength, f.extensionOffset, f.extensionOvershoot],
        k,
      ).toEqual([true, true, true, true]);
    }
  });
});

describe('a centre dimension', () => {
  const f = dimensionDialogFields('center');

  it('keeps only its own layer box and the Dimension Line box', () => {
    // case PCB_DIM_CENTER_T: hides m_sizerLeader, m_sizerFormat and m_sizerText.
    expect([f.leader, f.center, f.format, f.text]).toEqual([false, true, false, false]);
  });

  it('hides the arrow length and extension offset, because it draws only a cross', () => {
    expect(f.arrowLength).toBe(false);
    expect(f.extensionOffset).toBe(false);
    expect(f.extensionOvershoot).toBe(false);
  });
});

describe('a leader', () => {
  const f = dimensionDialogFields('leader');

  it('swaps Dimension Format for Leader Format, which holds its text, frame and layer', () => {
    // case PCB_DIM_LEADER_T: hides m_sizerFormat and m_sizerCenter.
    expect([f.leader, f.center, f.format, f.text]).toEqual([true, false, false, true]);
  });

  it('loses the position-mode choice', () => {
    expect(f.textPositionMode).toBe(false);
  });

  it('is the only kind with the Leader Format box', () => {
    for (const k of ALL.filter((x) => x !== 'leader'))
      expect(dimensionDialogFields(k).leader, k).toBe(false);
  });

  it('has no extension overshoot, the cast that gates it failing for a leader', () => {
    expect(f.extensionOvershoot).toBe(false);
  });
});

describe('a radial dimension', () => {
  const f = dimensionDialogFields('radial');

  it('measures, so it keeps the format and text groups', () => {
    expect(f.format).toBe(true);
    expect(f.text).toBe(true);
  });

  it('has no extension overshoot, being no kind of aligned', () => {
    // Arrow direction is in gbSizerLine and nothing hides it, for any kind.
    expect(f.extensionOvershoot).toBe(false);
  });
});
