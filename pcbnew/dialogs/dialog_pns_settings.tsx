// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `DIALOG_PNS_SETTINGS` (pcbnew/dialogs/dialog_pns_settings.cpp): Interactive Router Settings, on
 * the ROUTING_SETTINGS the router reads. The constructor loads every control, onModeChange
 * greys the boxes a mode cannot act on (Walk around enables none of the four), and OK writes
 * every control back, greyed or hidden, so a setting made in one mode survives another.
 *
 * "Suggest track finish" is hidden ("Don't show options that are not implemented"), its value
 * carried through as the hidden checkbox does upstream.
 *
 * `DialogPnsSettings` below is the window, DIALOG_PNS_SETTINGS_BASE over the class.
 */
import { type JSX, useReducer } from 'react';
import type { CHECK } from '@ziroeda/wx/controls.js';
import { PnsMode, type RoutingSettings } from '../router/pns_routing_settings.js';
import { DIALOG_PNS_SETTINGS_BASE, type RADIO } from './dialog_pns_settings_base.js';

/** A wxCheckBox: its value and Enable(). */
interface BOX {
  value: boolean;
  enabled: boolean;
}

const box = (aValue: boolean): BOX => ({ value: aValue, enabled: true });

export class DIALOG_PNS_SETTINGS {
  /** The router's ROUTING_SETTINGS; the frame stores it as the tools.pns NESTED_SETTINGS. */
  readonly m_settings: RoutingSettings;

  m_rbMarkObstacles = false;
  m_rbShove = false;
  m_rbWalkaround = false;
  readonly m_shoveVias: BOX;
  readonly m_backPressure: BOX;
  readonly m_removeLoops: BOX;
  readonly m_suggestEnding: BOX;
  readonly m_smartPads: BOX;
  readonly m_smoothDragged: BOX;
  readonly m_violateDrc: BOX;
  readonly m_freeAngleMode: BOX;
  readonly m_optimizeEntireDraggedTrack: BOX;
  readonly m_autoPosture: BOX;
  readonly m_fixAllSegments: BOX;
  /** `m_suggestEnding->Hide()`. */
  readonly m_suggestEndingShown = false;

  constructor(_aParent: unknown, aSettings: RoutingSettings) {
    this.m_settings = aSettings;

    // Load widgets' values from settings
    switch (aSettings.routingMode) {
      case PnsMode.RM_MarkObstacles:
        this.m_rbMarkObstacles = true;
        break;
      case PnsMode.RM_Shove:
        this.m_rbShove = true;
        break;
      case PnsMode.RM_Walkaround:
        this.m_rbWalkaround = true;
        break;
    }

    this.m_shoveVias = box(aSettings.shoveVias);
    this.m_backPressure = box(aSettings.jumpOverObstacles);
    this.m_removeLoops = box(aSettings.removeLoops);
    this.m_suggestEnding = box(aSettings.suggestFinish);
    this.m_smartPads = box(aSettings.smartPads);
    this.m_smoothDragged = box(aSettings.smoothDraggedSegments);
    this.m_violateDrc = box(aSettings.allowDrcViolations);
    this.m_freeAngleMode = box(aSettings.freeAngleMode);
    this.m_optimizeEntireDraggedTrack = box(aSettings.optimizeEntireDraggedTrack);
    this.m_autoPosture = box(aSettings.autoPosture);
    this.m_fixAllSegments = box(aSettings.fixAllSegments);

    // Enable/disable some options
    this.onModeChange();
  }

  /** wxEVT_RADIOBUTTON: one of the three mode buttons selected. */
  SetMode(aMode: PnsMode): void {
    this.m_rbMarkObstacles = aMode === PnsMode.RM_MarkObstacles;
    this.m_rbShove = aMode === PnsMode.RM_Shove;
    this.m_rbWalkaround = aMode === PnsMode.RM_Walkaround;
    this.onModeChange();
  }

  onModeChange(): void {
    this.m_freeAngleMode.enabled = this.m_rbMarkObstacles;
    this.m_violateDrc.enabled = this.m_rbMarkObstacles;
    this.m_shoveVias.enabled = this.m_rbShove;
    this.m_backPressure.enabled = this.m_rbShove;
  }

  TransferDataFromWindow(): boolean {
    const s = this.m_settings;

    // Save widgets' values to settings
    if (this.m_rbMarkObstacles) s.routingMode = PnsMode.RM_MarkObstacles;
    else if (this.m_rbShove) s.routingMode = PnsMode.RM_Shove;
    else if (this.m_rbWalkaround) s.routingMode = PnsMode.RM_Walkaround;

    s.shoveVias = this.m_shoveVias.value;
    s.jumpOverObstacles = this.m_backPressure.value;
    s.removeLoops = this.m_removeLoops.value;
    s.suggestFinish = this.m_suggestEnding.value;
    s.smartPads = this.m_smartPads.value;
    s.smoothDraggedSegments = this.m_smoothDragged.value;
    s.optimizeEntireDraggedTrack = this.m_optimizeEntireDraggedTrack.value;
    s.autoPosture = this.m_autoPosture.value;
    s.fixAllSegments = this.m_fixAllSegments.value;
    s.allowDrcViolations = this.m_violateDrc.value;
    s.freeAngleMode = this.m_freeAngleMode.value;

    return true;
  }
}

/** `ShowModal()` of DIALOG_PNS_SETTINGS: `onClose( true )` is wxID_OK. */
export function DialogPnsSettings({
  dialog,
  onClose,
}: {
  dialog: DIALOG_PNS_SETTINGS;
  onClose: (aOk: boolean) => void;
}): JSX.Element {
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  const check = (aBox: BOX): CHECK => ({
    value: aBox.value,
    enabled: aBox.enabled,
    onChange: (aOn) => {
      aBox.value = aOn;
      redraw();
    },
  });
  const radio = (aOn: boolean, aMode: PnsMode): RADIO => ({
    value: aOn,
    onSelect: () => {
      dialog.SetMode(aMode);
      redraw();
    },
  });

  return (
    <DIALOG_PNS_SETTINGS_BASE
      m_rbMarkObstacles={radio(dialog.m_rbMarkObstacles, PnsMode.RM_MarkObstacles)}
      m_freeAngleMode={check(dialog.m_freeAngleMode)}
      m_violateDrc={check(dialog.m_violateDrc)}
      m_rbShove={radio(dialog.m_rbShove, PnsMode.RM_Shove)}
      m_shoveVias={check(dialog.m_shoveVias)}
      m_backPressure={check(dialog.m_backPressure)}
      m_rbWalkaround={radio(dialog.m_rbWalkaround, PnsMode.RM_Walkaround)}
      m_removeLoops={check(dialog.m_removeLoops)}
      m_smartPads={check(dialog.m_smartPads)}
      m_smoothDragged={check(dialog.m_smoothDragged)}
      m_suggestEnding={check(dialog.m_suggestEnding)}
      suggestEndingShown={dialog.m_suggestEndingShown}
      m_optimizeEntireDraggedTrack={check(dialog.m_optimizeEntireDraggedTrack)}
      m_autoPosture={check(dialog.m_autoPosture)}
      m_fixAllSegments={check(dialog.m_fixAllSegments)}
      onOK={() => {
        if (dialog.TransferDataFromWindow()) onClose(true);
      }}
      onCancel={() => onClose(false)}
    />
  );
}
