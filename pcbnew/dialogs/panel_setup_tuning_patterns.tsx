// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * Board Setup > Design Rules > Length-tuning Patterns. Counterpart:
 * `pcbnew/dialogs/panel_setup_tuning_patterns_base.cpp` (PANEL_SETUP_TUNING_PATTERNS)
 * - three groups stacked vertically (Single Track Tuning, Differential Pairs,
 * Differential Pair Skews), each an illustration + fields: minimum/maximum
 * amplitude, spacing, corner style (chamfer/fillet), radius (% of amplitude),
 * and single-sided. Defaults are PNS::MEANDER_SETTINGS (pns_meander.cpp).
 * Illustrations are KiCad's own dark-theme SVGs (BITMAPS::tune_*_legend).
 *
 * Each group is a heading + `wxStaticLine` (`.ze-pref-group-title`) over a
 * `wxFlexGridSizer( 0, 5, 5, 5 )` with column 1 growable — five columns, not
 * the seven this had. No SetFont anywhere in the panel, so no font size here:
 * the 12.5px headings, the 12px grid and the 11px units were all invented.
 */

import { type JSX, useState } from 'react';

import { svgUrl } from '@ziroeda/bitmaps_png';
import { pcbIUScale, pcbIuToMM, pcbMmToIU } from '@ziroeda/common/eda_units.js';
import { UNIT_BINDER, unitLabel } from '@ziroeda/common/widgets/unit_binder.js';
import type { StatusUnits } from '@ziroeda/common/widgets/kistatusbar_format.js';
import {
  PANEL_SETUP_TUNING_PATTERNS_BASE,
  type TUNING_BLOCK,
} from './panel_setup_tuning_patterns_base.js';
import type { BOARD } from '../board.js';
import { MeanderStyle, type MeanderSettings } from '../router/pns_meander.js';

export type CornerStyle = 'Chamfer' | 'Fillet';

export interface TuningPattern {
  minAmplitudeMM: number;
  maxAmplitudeMM: number;
  spacingMM: number;
  cornerStyle: CornerStyle;
  radiusPct: number;
  singleSided: boolean;
}

export interface TuningSetup {
  singleTrack: TuningPattern;
  diffPair: TuningPattern;
  diffPairSkew: TuningPattern;
}

/** PANEL_SETUP_TUNING_PATTERNS's transfers (panel_setup_tuning_patterns.cpp). */
export const PANEL_SETUP_TUNING_PATTERNS = {
  TransferDataToWindow(aBoard: BOARD): TuningSetup {
    const bds = aBoard.GetDesignSettings();
    const mm = (iu: number): number => pcbIUScale.iuToMM(iu);
    const pattern = (s: MeanderSettings): TuningPattern => ({
      minAmplitudeMM: mm(s.minAmplitude),
      maxAmplitudeMM: mm(s.maxAmplitude),
      spacingMM: mm(s.spacing),
      cornerStyle: s.cornerStyle === MeanderStyle.MEANDER_STYLE_ROUND ? 'Fillet' : 'Chamfer',
      radiusPct: s.cornerRadiusPercentage,
      singleSided: s.singleSided,
    });
    return {
      singleTrack: pattern(bds.m_SingleTrackMeanderSettings),
      diffPair: pattern(bds.m_DiffPairMeanderSettings),
      diffPairSkew: pattern(bds.m_SkewMeanderSettings),
    };
  },

  TransferDataFromWindow(v: TuningSetup, aBoard: BOARD): void {
    const bds = aBoard.GetDesignSettings();
    const iu = (mm: number): number => pcbIUScale.mmToIU(mm);
    const apply = (s: MeanderSettings, p: TuningPattern): void => {
      s.minAmplitude = iu(p.minAmplitudeMM);
      s.maxAmplitude = iu(p.maxAmplitudeMM);
      s.spacing = iu(p.spacingMM);
      s.cornerStyle =
        p.cornerStyle === 'Fillet'
          ? MeanderStyle.MEANDER_STYLE_ROUND
          : MeanderStyle.MEANDER_STYLE_CHAMFER;
      s.cornerRadiusPercentage = Math.trunc(p.radiusPct);
      s.singleSided = p.singleSided;
    };
    apply(bds.m_SingleTrackMeanderSettings, v.singleTrack);
    apply(bds.m_DiffPairMeanderSettings, v.diffPair);
    apply(bds.m_SkewMeanderSettings, v.diffPairSkew);
  },
};

interface Props {
  value: TuningSetup;
  onChange: (next: TuningSetup) => void;
  /** The frame's units, which the amplitude and spacing UNIT_BINDERs show. */
  units: StatusUnits;
}

type LengthKey = 'minAmplitudeMM' | 'maxAmplitudeMM' | 'spacingMM';

/** PANEL_SETUP_TUNING_PATTERNS's window: its base over the three MEANDER_SETTINGS. */
export function PanelPcbTuning({ value, onChange, units }: Props): JSX.Element {
  const [, setTick] = useState(0);
  // m_track_minA, m_track_maxA, m_track_spacing and the dp_ / skew_ ones: UNIT_BINDERs on the
  // frame; TransferDataToWindow's SetValue.
  const [binders] = useState(() => {
    const provider = { GetUserUnits: () => units, GetIuScale: () => pcbIUScale };
    const make = (aKey: keyof TuningSetup) => {
      const one = (aLength: LengthKey) => {
        const b = new UNIT_BINDER(provider, '');
        b.SetValue(pcbMmToIU(value[aKey][aLength]));
        return b;
      };
      return {
        minAmplitudeMM: one('minAmplitudeMM'),
        maxAmplitudeMM: one('maxAmplitudeMM'),
        spacingMM: one('spacingMM'),
      };
    };
    return {
      singleTrack: make('singleTrack'),
      diffPair: make('diffPair'),
      diffPairSkew: make('diffPairSkew'),
    };
  });
  // m_track_r.SetUnits( EDA_UNITS::PERCENT ): the radii, held as typed.
  const [radius, setRadius] = useState<Partial<Record<keyof TuningSetup, string>>>({});

  const block = (aKey: keyof TuningSetup, aLegend: string): TUNING_BLOCK => {
    const s = value[aKey];
    const set = (aPatch: Partial<TuningPattern>): void =>
      onChange({ ...value, [aKey]: { ...s, ...aPatch } });
    const length = (aLength: LengthKey) => {
      const b = binders[aKey][aLength];
      return {
        value: b.GetText(),
        onChange: (aText: string) => {
          b.SetText(aText);
          set({ [aLength]: pcbIuToMM(b.GetValue()) });
          setTick((t) => t + 1);
        },
        // UNIT_BINDER::onKillFocus: evaluated and shown in the binder's format.
        onBlur: () => {
          b.ChangeValue(b.GetValue());
          setTick((t) => t + 1);
        },
        units: unitLabel(units),
      };
    };
    return {
      legend: svgUrl('tuning', aLegend),
      minA: length('minAmplitudeMM'),
      maxA: length('maxAmplitudeMM'),
      spacing: length('spacingMM'),
      // SetSelection( m_cornerStyle == MEANDER_STYLE_ROUND ? 1 : 0 )
      corner: {
        value: s.cornerStyle === 'Fillet' ? 1 : 0,
        onChange: (aIndex) => set({ cornerStyle: aIndex === 1 ? 'Fillet' : 'Chamfer' }),
      },
      r: {
        value: radius[aKey] ?? String(s.radiusPct),
        onChange: (aText) => {
          setRadius((r) => ({ ...r, [aKey]: aText }));
          const n = Number(aText);
          if (aText.trim() !== '' && Number.isFinite(n)) set({ radiusPct: n });
        },
        onBlur: () => {},
        units: '%',
      },
      singleSided: { value: s.singleSided, onChange: (aOn) => set({ singleSided: aOn }) },
    };
  };

  return (
    <PANEL_SETUP_TUNING_PATTERNS_BASE
      track={block('singleTrack', 'tune_single_track_length_legend')}
      dp={block('diffPair', 'tune_diff_pair_length_legend')}
      skew={block('diffPairSkew', 'tune_diff_pair_skew_legend')}
    />
  );
}
