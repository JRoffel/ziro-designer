// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * Board Setup > Design Rules > Teardrops. Counterpart:
 * `pcbnew/dialogs/panel_setup_teardrops_base.cpp` (PANEL_SETUP_TEARDROPS), three
 * groups stacked vertically (Round Shapes, Rectangular Shapes, Track-to-Track),
 * each an illustration beside ONE `wxGridBagSizer( 2, 3 )` of six columns:
 * label / control / units on the left, and the same three again on the right
 * starting at `wxLEFT, 40`. Best length, best width and the track-width limit
 * are percentages of the pad/via diameter (round) or width (rect/track);
 * maximum length/width are mm. Illustrations are KiCad's own dark-theme SVGs
 * (BITMAPS::teardrop_*_sizes), vendored like assets/constraints.
 *
 * Two things this had wrong beyond the font sizes:
 *
 *  - the percentage fields are `wxSpinCtrlDouble`s with a range and an
 *    increment (`:51`, `:93`, `:142`), so they carry GTK's stepper buttons.
 *    They were plain number inputs, whose steppers the browser hides until you
 *    hover them.
 *  - the units read `%(` + an ITALIC hint letter + ` )` — three static texts,
 *    the middle one `wxFONTSTYLE_ITALIC` at the dialog's own point size
 *    (`:66`, `:108`, `:159`) — not one grey 11px "%(d)".
 */

import { type JSX, useState } from 'react';

import { svgUrl } from '@ziroeda/bitmaps_png';
import { pcbIUScale, pcbIuToMM, pcbMmToIU } from '@ziroeda/common/eda_units.js';
import type { StatusUnits } from '@ziroeda/common/widgets/kistatusbar_format.js';
import { UNIT_BINDER, unitLabel } from '@ziroeda/common/widgets/unit_binder.js';
import { PANEL_SETUP_TEARDROPS_BASE, type TEARDROP_GROUP } from './panel_setup_teardrops_base.js';
import type { BOARD } from '../board.js';
import { TARGET_TD } from '../teardrop/teardrop_parameters.js';

export interface TeardropShape {
  bestLengthPct: number;
  maxLengthMM: number;
  bestWidthPct: number;
  maxWidthMM: number;
  preferZoneConnection: boolean;
  trackWidthLimitPct: number;
  allowSpanTwoSegments: boolean;
  curvedEdges: boolean;
}

/**
 * `teardrop_options` in the project file: TEARDROP_PARAMETERS_LIST's target
 * flags. PANEL_SETUP_TEARDROPS does not show these - DIALOG_GLOBAL_EDIT_TEARDROPS
 * owns them - but they travel with the page's values so OK writes them back
 * unchanged.
 */
export interface TeardropTargets {
  /** m_TargetVias / `td_onvia`. */
  vias: boolean;
  /** m_TargetPTHPads / `td_onpthpad`. */
  pthPads: boolean;
  /** m_TargetSMDPads / `td_onsmdpad`. */
  smdPads: boolean;
  /** m_TargetTrack2Track / `td_ontrackend`. */
  trackToTrack: boolean;
  /** m_UseRoundShapesOnly / `td_onroundshapesonly`. */
  roundShapesOnly: boolean;
}

/** The three shape groups PANEL_SETUP_TEARDROPS edits, apart from the targets. */
export type TeardropShapeKey = 'round' | 'rect' | 'trackToTrack';

export interface TeardropsSetup {
  round: TeardropShape;
  rect: TeardropShape;
  trackToTrack: TeardropShape;
  targets: TeardropTargets;
}

/** PANEL_SETUP_TEARDROPS's transfers (panel_setup_teardrops.cpp). */
export const PANEL_SETUP_TEARDROPS = {
  TransferDataToWindow(aBoard: BOARD): TeardropsSetup {
    const tdl = aBoard.GetDesignSettings().GetTeadropParamsList();
    const mm = (iu: number): number => pcbIUScale.iuToMM(iu);
    const shape = (t: TARGET_TD): TeardropShape => {
      const p = tdl.GetParameters(t);
      return {
        maxLengthMM: mm(p.m_TdMaxLen),
        maxWidthMM: mm(p.m_TdMaxWidth),
        bestLengthPct: p.m_BestLengthRatio * 100.0,
        bestWidthPct: p.m_BestWidthRatio * 100.0,
        trackWidthLimitPct: p.m_WidthtoSizeFilterRatio * 100.0,
        preferZoneConnection: !p.m_TdOnPadsInZones,
        allowSpanTwoSegments: p.m_AllowUseTwoTracks,
        curvedEdges: p.m_CurvedEdges,
      };
    };
    return {
      round: shape(TARGET_TD.TARGET_ROUND),
      rect: shape(TARGET_TD.TARGET_RECT),
      trackToTrack: shape(TARGET_TD.TARGET_TRACK),
      targets: {
        vias: tdl.m_TargetVias,
        pthPads: tdl.m_TargetPTHPads,
        smdPads: tdl.m_TargetSMDPads,
        trackToTrack: tdl.m_TargetTrack2Track,
        roundShapesOnly: tdl.m_UseRoundShapesOnly,
      },
    };
  },

  TransferDataFromWindow(v: TeardropsSetup, aBoard: BOARD): void {
    const tdl = aBoard.GetDesignSettings().GetTeadropParamsList();
    const iu = (mm: number): number => pcbIUScale.mmToIU(mm);
    const apply = (t: TARGET_TD, s: TeardropShape, withZone: boolean): void => {
      const p = tdl.GetParameters(t);
      p.m_BestLengthRatio = s.bestLengthPct / 100.0;
      p.m_BestWidthRatio = s.bestWidthPct / 100.0;
      p.m_TdMaxLen = iu(s.maxLengthMM);
      p.m_TdMaxWidth = iu(s.maxWidthMM);
      p.m_CurvedEdges = s.curvedEdges;
      p.m_WidthtoSizeFilterRatio = s.trackWidthLimitPct / 100.0;
      if (withZone) p.m_TdOnPadsInZones = !s.preferZoneConnection;
      p.m_AllowUseTwoTracks = s.allowSpanTwoSegments;
    };
    apply(TARGET_TD.TARGET_ROUND, v.round, true);
    apply(TARGET_TD.TARGET_RECT, v.rect, true);
    apply(TARGET_TD.TARGET_TRACK, v.trackToTrack, false);
    tdl.m_TargetVias = v.targets.vias;
    tdl.m_TargetPTHPads = v.targets.pthPads;
    tdl.m_TargetSMDPads = v.targets.smdPads;
    tdl.m_TargetTrack2Track = v.targets.trackToTrack;
    tdl.m_UseRoundShapesOnly = v.targets.roundShapesOnly;
  },
};

interface Props {
  value: TeardropsSetup;
  onChange: (next: TeardropsSetup) => void;
  /** The frame's units, which the six length UNIT_BINDERs show. */
  units: StatusUnits;
}

type LengthKey = 'maxLengthMM' | 'maxWidthMM';

/** PANEL_SETUP_TEARDROPS's window: its base over the three TEARDROP_PARAMETERS. */
export function PanelPcbTeardrops({ value, onChange, units }: Props): JSX.Element {
  const [, setTick] = useState(0);
  // m_teardropMaxLenRound, m_teardropMaxWidthRound and the Rect / T2T ones: UNIT_BINDERs on the
  // frame; TransferDataToWindow's SetValue.
  const [binders] = useState(() => {
    const provider = { GetUserUnits: () => units, GetIuScale: () => pcbIUScale };
    const make = (aKey: TeardropShapeKey) => {
      const one = (aLength: LengthKey) => {
        const b = new UNIT_BINDER(provider, '');
        b.SetValue(pcbMmToIU(value[aKey][aLength]));
        return b;
      };
      return { maxLengthMM: one('maxLengthMM'), maxWidthMM: one('maxWidthMM') };
    };
    return { round: make('round'), rect: make('rect'), trackToTrack: make('trackToTrack') };
  });

  const group = (aKey: TeardropShapeKey, aBitmap: string, aPreferZone: boolean): TEARDROP_GROUP => {
    const s = value[aKey];
    const set = (aPatch: Partial<TeardropShape>): void =>
      onChange({ ...value, [aKey]: { ...s, ...aPatch } });
    const length = (aLength: LengthKey) => {
      const b = binders[aKey][aLength];
      return {
        value: b.GetText(),
        onChange: (aText: string) => {
          b.SetText(aText);
          // GetIntValue
          set({ [aLength]: pcbIuToMM(b.GetIntValue()) });
          setTick((t) => t + 1);
        },
        onBlur: () => {
          b.ChangeValue(b.GetValue());
          setTick((t) => t + 1);
        },
        units: unitLabel(units),
      };
    };
    const pct = (aField: 'bestLengthPct' | 'bestWidthPct' | 'trackWidthLimitPct') => ({
      value: s[aField],
      onChange: (aValue: number) => set({ [aField]: aValue }),
    });
    const check = (aField: 'preferZoneConnection' | 'allowSpanTwoSegments' | 'curvedEdges') => ({
      value: s[aField],
      onChange: (aOn: boolean) => set({ [aField]: aOn }),
    });
    return {
      bitmap: svgUrl('teardrops', aBitmap),
      m_spLenPercent: pct('bestLengthPct'),
      m_tcTdMaxLen: length('maxLengthMM'),
      m_spWidthPercent: pct('bestWidthPct'),
      m_tcMaxWidth: length('maxWidthMM'),
      m_cbPreferZoneConnection: aPreferZone ? check('preferZoneConnection') : undefined,
      m_spTeardropHDPercent: pct('trackWidthLimitPct'),
      m_cbTeardropsUseNextTrack: check('allowSpanTwoSegments'),
      m_cbCurvedEdges: check('curvedEdges'),
    };
  };

  return (
    <PANEL_SETUP_TEARDROPS_BASE
      // The constructor's SetBitmap( KiBitmapBundle( BITMAPS::teardrop_*sizes ) ).
      round={group('round', 'teardrop_sizes', true)}
      rect={group('rect', 'teardrop_rect_sizes', true)}
      track={group('trackToTrack', 'teardrop_track_sizes', false)}
    />
  );
}
