// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `PANEL_SETUP_ZONES` (pcbnew/dialogs/panel_setup_zones.cpp): Board Setup's default properties for
 * new zones, the shared PANEL_ZONE_PROPERTIES over the board's default ZONE_SETTINGS with no net
 * selector, on PANEL_SETUP_ZONES_BASE.
 */
import type { JSX } from 'react';
import type { StatusUnits } from '@ziroeda/common/widgets/kistatusbar_format.js';
import type { BOARD } from '../board.js';
import { ORPHANED_NET } from '../netinfo.js';
import { ZONE_SETTINGS } from '../zone_settings.js';
import type { TransferResult } from './dialog_text_properties.js';
import { PANEL_SETUP_ZONES_BASE } from './panel_setup_zones_base.js';
import {
  PanelZoneProperties,
  type ZoneValues,
  acceptZoneOptions,
  zoneSettingsToValues,
} from './panel_zone_properties.js';

/** What the page edits: PANEL_ZONE_PROPERTIES's values for the default settings. */
export type ZoneDefaults = ZoneValues;

export const PANEL_SETUP_ZONES = {
  /** `m_panelZoneProperties->TransferZoneSettingsToWindow()`, the bag's settings for no zone. */
  TransferDataToWindow(aBoard: BOARD): ZoneDefaults {
    return zoneSettingsToValues(
      aBoard.GetDesignSettings().GetDefaultZoneSettings(),
      null,
      aBoard.GetCopperLayerCount(),
    );
  },

  /**
   * `TransferZoneSettingsFromWindow()`, then the settings with `m_Netcode = ORPHANED` become the
   * board's defaults. False, and nothing changes, where AcceptOptions refuses.
   */
  TransferDataFromWindow(z: ZoneDefaults, aBoard: BOARD): TransferResult {
    const bds = aBoard.GetDesignSettings();
    const settings = bds.GetDefaultZoneSettings().clone();
    const result = acceptZoneOptions(settings, z, null, false, aBoard);
    if (!result.ok) return result;
    settings.m_Netcode = ORPHANED_NET;
    bds.SetDefaultZoneSettings(settings);
    return result;
  },

  /** What AcceptOptions would say about the window, without a board to write to. */
  Validate(z: ZoneDefaults): TransferResult {
    return acceptZoneOptions(new ZONE_SETTINGS(), z, null, false, null);
  },
};

interface Props {
  value: ZoneDefaults;
  onChange: (next: ZoneDefaults) => void;
  units: StatusUnits;
}

const NO_NETS: ReadonlyMap<number, string> = new Map();

export function PanelPcbZones({ value, onChange, units }: Props): JSX.Element {
  return (
    <PANEL_SETUP_ZONES_BASE
      m_panelZoneProperties={
        // new PANEL_ZONE_PROPERTIES( this, aFrame, m_zoneSettingsBag, false ): no net spec.
        <PanelZoneProperties
          values={value}
          onChange={(aPatch) => onChange({ ...value, ...aPatch })}
          units={units}
          nets={NO_NETS}
          allowNetSpec={false}
        />
      }
    />
  );
}
