// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * Board Setup > Text & Graphics > Formatting. Counterpart:
 * `pcbnew/dialogs/panel_setup_formatting_base.cpp` (PANEL_SETUP_FORMATTING),
 * two groups:
 *   Dashed Lines               : dash length / gap length (ratios of line width).
 *   When Adding Footprints to Board : apply board defaults to a footprint's
 *                                     fields / text / non-copper shapes /
 *                                     dimensions / barcodes.
 *
 * NEITHER GROUP IS A GROUP BOX. Both are a `wxStaticText` with a
 * `wxStaticLine` under it (`panel_setup_formatting_base.cpp:20-25, 56-61`),
 * which is `.ze-pref-group-title`. This drew two `<fieldset>`s with bold 11.5px
 * legends — a bordered box, a heavier weight and a smaller size, none of which
 * upstream has. The only SetFont on the page is `m_dashedLineHelp`'s
 * `KIUI::GetInfoFont( this ).Italic()` (`panel_setup_formatting.cpp:41`).
 */

import { type JSX, useState } from 'react';
import { DoubleValueFromString, stringFromValue, unityScale } from '@ziroeda/common/eda_units.js';
import { PANEL_SETUP_FORMATTING_BASE } from './panel_setup_formatting_base.js';
import type { BOARD } from '../board.js';

export interface PcbFormatting {
  dashLengthRatio: number;
  gapLengthRatio: number;
  applyFields: boolean;
  applyText: boolean;
  applyShapes: boolean;
  applyDimensions: boolean;
  applyBarcodes: boolean;
}

/** PANEL_SETUP_FORMATTING's transfers (pcbnew/dialogs/panel_setup_formatting.cpp). */
export const PANEL_SETUP_FORMATTING = {
  TransferDataToWindow(aBoard: BOARD): PcbFormatting {
    const bds = aBoard.GetDesignSettings();
    const plot = aBoard.GetPlotOptions();
    return {
      dashLengthRatio: plot.GetDashedLineDashRatio(),
      gapLengthRatio: plot.GetDashedLineGapRatio(),
      applyFields: bds.m_StyleFPFields,
      applyText: bds.m_StyleFPText,
      applyShapes: bds.m_StyleFPShapes,
      applyDimensions: bds.m_StyleFPDimensions,
      applyBarcodes: bds.m_StyleFPBarcodes,
    };
  },

  /** True when the plot options (board-side) changed. */
  TransferDataFromWindow(f: PcbFormatting, aBoard: BOARD): boolean {
    const bds = aBoard.GetDesignSettings();
    const plot = aBoard.GetPlotOptions();
    const modified =
      plot.GetDashedLineDashRatio() !== f.dashLengthRatio ||
      plot.GetDashedLineGapRatio() !== f.gapLengthRatio;
    plot.SetDashedLineDashRatio(f.dashLengthRatio);
    plot.SetDashedLineGapRatio(f.gapLengthRatio);
    aBoard.SetPlotOptions(plot);
    bds.m_StyleFPFields = f.applyFields;
    bds.m_StyleFPText = f.applyText;
    bds.m_StyleFPShapes = f.applyShapes;
    bds.m_StyleFPDimensions = f.applyDimensions;
    bds.m_StyleFPBarcodes = f.applyBarcodes;
    return modified;
  },
};

interface Props {
  value: PcbFormatting;
  onChange: (next: PcbFormatting) => void;
}

/** PANEL_SETUP_FORMATTING's window: its base over the board's values. */
export function PanelPcbFormatting({ value, onChange }: Props): JSX.Element {
  // `StringFromValue( unityScale, EDA_UNITS::UNSCALED, ratio )`, held as typed until it reads.
  const [texts, setTexts] = useState<{ dash?: string; gap?: string }>({});
  const set = <K extends keyof PcbFormatting>(k: K, val: PcbFormatting[K]): void =>
    onChange({ ...value, [k]: val });

  const ratio = (aKey: 'dash' | 'gap', aField: 'dashLengthRatio' | 'gapLengthRatio') => ({
    value: texts[aKey] ?? stringFromValue(unityScale, 'unscaled', value[aField]),
    onChange: (aText: string) => {
      setTexts((t) => ({ ...t, [aKey]: aText }));
      // `DoubleValueFromString`
      const n = DoubleValueFromString(aText);
      if (Number.isFinite(n)) set(aField, n);
    },
  });

  const check = (
    aKey: 'applyFields' | 'applyText' | 'applyShapes' | 'applyDimensions' | 'applyBarcodes',
  ) => ({
    value: value[aKey],
    onChange: (aOn: boolean) => set(aKey, aOn),
  });

  return (
    <PANEL_SETUP_FORMATTING_BASE
      m_dashLengthCtrl={ratio('dash', 'dashLengthRatio')}
      m_gapLengthCtrl={ratio('gap', 'gapLengthRatio')}
      m_styleFields={check('applyFields')}
      m_styleText={check('applyText')}
      m_styleShapes={check('applyShapes')}
      m_styleDimensions={check('applyDimensions')}
      m_styleBarcodes={check('applyBarcodes')}
    />
  );
}
