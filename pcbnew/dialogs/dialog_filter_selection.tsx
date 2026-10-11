// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `DIALOG_FILTER_SELECTION` (pcbnew/dialogs/dialog_filter_selection.cpp): which kinds of item
 * PCB_SELECTION_TOOL::filterSelection keeps. The filter is inclusive, not exclusive: an item
 * kind the dialog does not offer is dropped (`itemIsIncludedByFilter`'s default branch).
 *
 * `DialogFilterSelection` below is the window, DIALOG_FILTER_SELECTION_BASE over the class.
 */
import { type JSX, useState } from 'react';
import type { CHECK } from '@ziroeda/wx/controls.js';
import type { CHECK_STATE } from '@ziroeda/wx/wx_checkbox.js';
import { DIALOG_FILTER_SELECTION_BASE } from './dialog_filter_selection_base.js';

/** `DIALOG_FILTER_SELECTION::OPTIONS` (dialog_filter_selection.h:36-46), every one true by default. */
export interface SelectionFilter {
  footprints: boolean;
  /** Only consulted when `footprints` is on, as the dialog's checkbox is. */
  lockedFootprints: boolean;
  tracks: boolean;
  vias: boolean;
  zones: boolean;
  /** Graphics and dimensions on Edge.Cuts. */
  boardOutline: boolean;
  /** Graphics and dimensions on any other non-copper layer. */
  techLayers: boolean;
  text: boolean;
}

/** A wxCheckBox: `GetValue()` / `IsEnabled()`. */
interface CHECK_BOX {
  value: boolean;
  enabled: boolean;
}

const checkBox = (): CHECK_BOX => ({ value: false, enabled: true });

/** The base's labelled two-state boxes: GetSuggestedAllItemsState counts them at run time. */
const NUM_CHECKBOXES_ON_DLG = 8;

export class DIALOG_FILTER_SELECTION {
  ///< Reference to the options struct to fill.
  private readonly m_options: SelectionFilter;

  m_All_Items: CHECK_STATE = false;
  readonly m_Include_Modules = checkBox();
  readonly m_IncludeLockedModules = checkBox();
  readonly m_Include_Tracks = checkBox();
  readonly m_Include_Vias = checkBox();
  readonly m_Include_Zones = checkBox();
  readonly m_Include_Draw_Items = checkBox();
  readonly m_Include_Edges_Items = checkBox();
  readonly m_Include_PcbTexts = checkBox();

  constructor(aOptions: SelectionFilter) {
    this.m_options = aOptions;
  }

  /** The handler of every box but All items. */
  checkBoxClicked(): void {
    this.m_IncludeLockedModules.enabled = this.m_Include_Modules.value;

    // Update "All Items" checkbox based on how many items are currently checked
    this.m_All_Items = this.GetSuggestedAllItemsState();
  }

  TransferDataToWindow(): boolean {
    const o = this.m_options;

    this.m_Include_Modules.value = o.footprints;
    this.m_IncludeLockedModules.value = o.lockedFootprints;
    this.m_IncludeLockedModules.enabled = this.m_Include_Modules.value;

    this.m_Include_Tracks.value = o.tracks;
    this.m_Include_Vias.value = o.vias;
    this.m_Include_Zones.value = o.zones;
    this.m_Include_Draw_Items.value = o.techLayers;
    this.m_Include_Edges_Items.value = o.boardOutline;
    this.m_Include_PcbTexts.value = o.text;

    // Update "All Items" checkbox based on how many items are currently checked
    this.m_All_Items = this.GetSuggestedAllItemsState();

    return true;
  }

  private forceCheckboxStates(aNewState: boolean): void {
    this.m_Include_Modules.value = aNewState;
    this.m_IncludeLockedModules.value = aNewState;

    // Make enable state match checkbox state
    this.m_IncludeLockedModules.enabled = aNewState;

    this.m_Include_Tracks.value = aNewState;
    this.m_Include_Vias.value = aNewState;
    this.m_Include_Zones.value = aNewState;
    this.m_Include_Draw_Items.value = aNewState;
    this.m_Include_Edges_Items.value = aNewState;
    this.m_Include_PcbTexts.value = aNewState;
  }

  /** wxCHK_UNCHECKED false, wxCHK_CHECKED true, wxCHK_UNDETERMINED null. */
  GetSuggestedAllItemsState(): CHECK_STATE {
    let numChecked = 0;
    let numCheckboxesOnDlg = NUM_CHECKBOXES_ON_DLG;
    let suggestedState: CHECK_STATE = null; // Assume some but not all are checked

    // Tally how many checkboxes are checked.  Only include "locked footprints" in the total
    // if "footprints" is checked.
    if (this.m_Include_Modules.value) {
      numChecked++;

      if (this.m_IncludeLockedModules.value) numChecked++;
    } else {
      // If include modules isn't checked then ignore the "Locked Footprints" checkbox in tally
      numCheckboxesOnDlg--;
    }

    for (const cb of [
      this.m_Include_Tracks,
      this.m_Include_Vias,
      this.m_Include_Zones,
      this.m_Include_Draw_Items,
      this.m_Include_Edges_Items,
      this.m_Include_PcbTexts,
    ]) {
      if (cb.value) numChecked++;
    }

    // Change suggestion if all or none are checked
    if (!numChecked) suggestedState = false;
    else if (numChecked === numCheckboxesOnDlg) suggestedState = true;

    return suggestedState;
  }

  /** m_All_Items' click, with the state its click moved it to. */
  allItemsClicked(): void {
    if (this.m_All_Items === true)
      this.forceCheckboxStates(true); // Select all items
    else this.forceCheckboxStates(false); // Clear all items
  }

  TransferDataFromWindow(): boolean {
    const o = this.m_options;

    o.footprints = this.m_Include_Modules.value;
    o.lockedFootprints = this.m_IncludeLockedModules.value;
    o.tracks = this.m_Include_Tracks.value;
    o.vias = this.m_Include_Vias.value;
    o.zones = this.m_Include_Zones.value;
    o.techLayers = this.m_Include_Draw_Items.value;
    o.boardOutline = this.m_Include_Edges_Items.value;
    o.text = this.m_Include_PcbTexts.value;

    return true;
  }
}

type BOX =
  | 'm_Include_Modules'
  | 'm_Include_PcbTexts'
  | 'm_IncludeLockedModules'
  | 'm_Include_Draw_Items'
  | 'm_Include_Tracks'
  | 'm_Include_Edges_Items'
  | 'm_Include_Vias'
  | 'm_Include_Zones';

/** `ShowModal()` of DIALOG_FILTER_SELECTION: `onClose( true )` is wxID_OK. */
export function DialogFilterSelection({
  dialog,
  onClose,
}: {
  dialog: DIALOG_FILTER_SELECTION;
  onClose: (aOk: boolean) => void;
}): JSX.Element {
  const [, redraw] = useState(0);
  // OnInitDialog -> TransferDataToWindow
  useState(() => dialog.TransferDataToWindow());

  const check = (aKey: BOX): CHECK => ({
    value: dialog[aKey].value,
    enabled: dialog[aKey].enabled,
    onChange: (aOn) => {
      dialog[aKey].value = aOn;
      dialog.checkBoxClicked();
      redraw((n) => n + 1);
    },
  });

  return (
    <DIALOG_FILTER_SELECTION_BASE
      m_All_Items={{
        value: dialog.m_All_Items,
        onChange: (aState) => {
          dialog.m_All_Items = aState;
          dialog.allItemsClicked();
          redraw((n) => n + 1);
        },
      }}
      m_Include_Modules={check('m_Include_Modules')}
      m_Include_PcbTexts={check('m_Include_PcbTexts')}
      m_IncludeLockedModules={check('m_IncludeLockedModules')}
      m_Include_Draw_Items={check('m_Include_Draw_Items')}
      m_Include_Tracks={check('m_Include_Tracks')}
      m_Include_Edges_Items={check('m_Include_Edges_Items')}
      m_Include_Vias={check('m_Include_Vias')}
      m_Include_Zones={check('m_Include_Zones')}
      onOK={() => {
        if (dialog.TransferDataFromWindow()) onClose(true);
      }}
      onCancel={() => onClose(false)}
    />
  );
}
