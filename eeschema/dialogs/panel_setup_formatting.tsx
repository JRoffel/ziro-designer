// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * Schematic Setup > Formatting. Counterpart:
 * `eeschema/dialogs/panel_setup_formatting_base.cpp` (PANEL_SETUP_FORMATTING),
 * the SCHEMATIC_SETTINGS formatting fields in KiCad's two-column layout:
 *   left column  : Text, Symbols, Connections
 *   right column : Inter-sheet References, Dashed Lines, Operating-point Overlay
 *
 * (Symbol unit notation lives on the separate Annotation page, not here, see
 * panel_eeschema_annotation_options.tsx.)
 *
 * Field sizing mirrors upstream: value controls grow to fill the group's second
 * column (KiCad's AddGrowableCol), except the Dashed-Lines dash/gap fields
 * (fixed ~"XXX.XXX" wide, no grow) and the inter-sheet Prefix/Suffix (min 160px).
 *
 * These are project-scoped defaults (SCHEMATIC_SETTINGS): default text/line
 * sizes, junction/hop-over/connection-grid sizes, dashed-line ratios, inter-sheet
 * reference presentation, and simulator operating-point overlay precision/range.
 */

import type { JSX } from 'react';
import { PANEL_SETUP_FORMATTING_BASE } from './panel_setup_formatting_base.js';
import {
  JUNCTION_DOT_SIZES,
  HOP_OVER_SIZES,
  OPO_V_RANGES,
  OPO_I_RANGES,
  type FormattingSettings,
} from '../schematic_settings.js';

// The data model lives in schematic_settings.ts (KiCad's data/UI split);
// re-exported here so the panel stays the import site for its slice.
export {
  JUNCTION_DOT_SIZES,
  HOP_OVER_SIZES,
  OPO_V_RANGES,
  OPO_I_RANGES,
  defaultFormatting,
  type FormattingSettings,
} from '../schematic_settings.js';

interface Props {
  value: FormattingSettings;
  onChange: (next: FormattingSettings) => void;
}

export function PanelSetupFormatting({ value, onChange }: Props): JSX.Element {
  const set = (patch: Partial<FormattingSettings>): void => onChange({ ...value, ...patch });

  type NUMBER_KEY = {
    [K in keyof FormattingSettings]: FormattingSettings[K] extends number ? K : never;
  }[keyof FormattingSettings];

  /** A wxTextCtrl over a number: the text a wxTextCtrl would show, read back as a number. */
  const num = (k: NUMBER_KEY) => ({
    value: String(value[k]),
    onChange: (t: string) => {
      const n = Number(t);
      if (Number.isFinite(n)) set({ [k]: n });
    },
  });
  const text = (k: 'intersheetRefsPrefix' | 'intersheetRefsSuffix') => ({
    value: value[k],
    onChange: (t: string) => set({ [k]: t }),
  });
  const byName = (k: 'opoVRange' | 'opoIRange', aChoices: readonly string[]) => ({
    value: Math.max(0, aChoices.indexOf(value[k])),
    onChange: (i: number) => set({ [k]: aChoices[i]! }),
  });

  return (
    <PANEL_SETUP_FORMATTING_BASE
      m_textSizeCtrl={num('defaultTextSizeMils')}
      m_overbarHeightCtrl={num('overbarOffsetRatio')}
      m_textOffsetRatioCtrl={num('labelOffsetRatio')}
      m_labelSizeRatioCtrl={num('labelSizeRatio')}
      m_lineWidthCtrl={num('defaultLineWidthMils')}
      m_pinSymbolSizeCtrl={num('pinSymbolSizeMils')}
      // [data] The slice stores mils; upstream's UNIT_BINDERs show the frame's units.
      units="mils"
      junctionDotChoices={JUNCTION_DOT_SIZES}
      m_choiceJunctionDotSize={{
        value: value.junctionDotChoice,
        onChange: (i) => set({ junctionDotChoice: i }),
      }}
      hopOverChoices={HOP_OVER_SIZES}
      m_choiceHopOverSize={{
        value: value.hopOverChoice,
        onChange: (i) => set({ hopOverChoice: i }),
      }}
      m_connectionGridCtrl={num('connectionGridMils')}
      m_showIntersheetsReferences={{
        value: value.intersheetRefsShow,
        onChange: (on) => set({ intersheetRefsShow: on }),
      }}
      intersheetRefsEnabled={value.intersheetRefsShow}
      m_listOwnPage={{
        value: value.intersheetRefsOwnPage,
        onChange: (on) => set({ intersheetRefsOwnPage: on }),
      }}
      abbreviated={value.intersheetRefsAbbreviated}
      onAbbreviated={(on) => set({ intersheetRefsAbbreviated: on })}
      m_prefixCtrl={text('intersheetRefsPrefix')}
      m_suffixCtrl={text('intersheetRefsSuffix')}
      m_dashLengthCtrl={num('dashLengthRatio')}
      m_gapLengthCtrl={num('gapLengthRatio')}
      m_vPrecisionCtrl={{ value: value.opoVPrecision, onChange: (n) => set({ opoVPrecision: n }) }}
      vRangeChoices={OPO_V_RANGES}
      m_vRangeCtrl={byName('opoVRange', OPO_V_RANGES)}
      m_iPrecisionCtrl={{ value: value.opoIPrecision, onChange: (n) => set({ opoIPrecision: n }) }}
      iRangeChoices={OPO_I_RANGES}
      m_iRangeCtrl={byName('opoIRange', OPO_I_RANGES)}
    />
  );
}
