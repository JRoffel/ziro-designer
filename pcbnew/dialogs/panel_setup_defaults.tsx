// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * Board Setup > Text & Graphics > Defaults. Counterpart:
 * `pcbnew/dialogs/panel_setup_defaults.cpp` (`PANEL_SETUP_DEFAULTS`), which is
 * THREE panels in one scrolled window: text & graphics, a 10 px spacer,
 * dimensions, another spacer, then zones (`panel_setup_defaults.cpp:39-48`). The
 * first two are `PanelPcbTextGraphics`; the third is `PanelPcbZones`.
 */
import type { JSX } from 'react';
import { pcbIUScale } from '@ziroeda/common/eda_units.js';
import { type DimensionDefaults, PanelSetupDimensions } from './panel_setup_dimensions.js';
import type { StatusUnits } from '@ziroeda/common/widgets/kistatusbar_format.js';
import { wxEXPAND } from '@ziroeda/wx/defs.js';
import { SizerItem, Spacer } from '@ziroeda/wx/sizer.js';
import { PANEL_SETUP_DEFAULTS_BASE } from './panel_setup_defaults_base.js';
import { PanelPcbTextGraphics, type TextGfxDefaults } from './panel_setup_text_and_graphics.js';
import { PanelPcbZones, type ZoneDefaults } from './panel_setup_zones.js';

export function PanelSetupDefaults({
  textGraphics,
  onTextGraphics,
  dimensions,
  onDimensions,
  zones,
  onZones,
  units,
}: {
  textGraphics: TextGfxDefaults;
  onTextGraphics: (next: TextGfxDefaults) => void;
  dimensions: DimensionDefaults;
  onDimensions: (fn: (d: DimensionDefaults) => void) => void;
  zones: ZoneDefaults;
  onZones: (next: ZoneDefaults) => void;
  units: StatusUnits;
}): JSX.Element {
  return (
    <PANEL_SETUP_DEFAULTS_BASE
      m_scrollSizer={
        <>
          {/* m_textAndGraphicsPanel, m_dimensionsPanel and m_zonesPanel, AddSpacer( 10 ) apart. */}
          <SizerItem flag={wxEXPAND} border={5}>
            <PanelPcbTextGraphics value={textGraphics} onChange={onTextGraphics} units={units} />
          </SizerItem>
          <Spacer width={10} height={10} />
          <SizerItem flag={wxEXPAND} border={5}>
            <PanelSetupDimensions
              value={dimensions}
              update={onDimensions}
              units={units}
              iuPerMM={pcbIUScale.IU_PER_MM}
            />
          </SizerItem>
          <Spacer width={10} height={10} />
          <SizerItem flag={wxEXPAND} border={5}>
            <PanelPcbZones value={zones} onChange={onZones} units={units} />
          </SizerItem>
        </>
      }
    />
  );
}
