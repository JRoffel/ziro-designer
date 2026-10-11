// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `DIALOG_GET_FOOTPRINT_BY_NAME` (pcbnew/dialogs/dialog_get_footprint_by_name.cpp): Get and Move
 * Footprint's reference entry, and the board's footprints as "REF    ( value )" rows that fill
 * it, each following the other.
 *
 * `DialogGetFootprintByName` below is the window, DIALOG_GET_FOOTPRINT_BY_NAME_BASE over the
 * class.
 */
import { type JSX, useReducer } from 'react';
import type { PCB_BASE_FRAME } from '../pcb_base_frame.js';
import { DIALOG_GET_FOOTPRINT_BY_NAME_BASE } from './dialog_get_footprint_by_name_base.js';

function GetFootprintName(aOptionCtrlString: string): string {
  const space = aOptionCtrlString.indexOf(' ');
  return space < 0 ? aOptionCtrlString : aOptionCtrlString.slice(0, space);
}

export class DIALOG_GET_FOOTPRINT_BY_NAME {
  m_SearchTextCtrl = '';
  readonly m_choiceFpList: string[] = [];
  /** `m_choiceFpList->GetSelection()`: -1 for none; the base's SetSelection( 0 ) on an empty list. */
  m_choiceFpListSelection = 0;
  /** Hide help string until someone implements successive placement (#2227) */
  readonly m_multipleHintShown = false;

  constructor(_aParent: PCB_BASE_FRAME, aFpList: readonly string[]) {
    this.m_choiceFpList.push(...aFpList);
  }

  /** @return the selected text (fp reference). */
  GetValue(): string {
    return this.m_SearchTextCtrl;
  }

  /** Called when selecting an item from the item list. */
  OnSelectFootprint(): void {
    const selection = this.m_choiceFpListSelection;

    if (selection >= 0) this.m_SearchTextCtrl = GetFootprintName(this.m_choiceFpList[selection]!);
  }

  OnSearchInputChanged(): void {
    // Find the matching footprint in the list if there is one
    const entry = this.m_SearchTextCtrl.trim().toLowerCase();

    for (let ii = 0; ii < this.m_choiceFpList.length; ++ii) {
      if (GetFootprintName(this.m_choiceFpList[ii]!).toLowerCase() === entry) {
        this.m_choiceFpListSelection = ii;
        return;
      }
    }

    this.m_choiceFpListSelection = -1;
  }
}

/** `ShowModal()` of DIALOG_GET_FOOTPRINT_BY_NAME: `onClose( true )` is wxID_OK. */
export function DialogGetFootprintByName({
  dialog,
  onClose,
}: {
  dialog: DIALOG_GET_FOOTPRINT_BY_NAME;
  onClose: (aOk: boolean) => void;
}): JSX.Element {
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  return (
    <DIALOG_GET_FOOTPRINT_BY_NAME_BASE
      m_SearchTextCtrl={{
        value: dialog.m_SearchTextCtrl,
        onChange: (aText) => {
          dialog.m_SearchTextCtrl = aText;
          dialog.OnSearchInputChanged();
          redraw();
        },
      }}
      multipleHintShown={dialog.m_multipleHintShown}
      m_choiceFpListChoices={dialog.m_choiceFpList}
      m_choiceFpList={{
        value: dialog.m_choiceFpList.length > 0 ? dialog.m_choiceFpListSelection : -1,
        onChange: (aIndex) => {
          dialog.m_choiceFpListSelection = aIndex;
          dialog.OnSelectFootprint();
          redraw();
        },
      }}
      onOK={() => onClose(true)}
      onCancel={() => onClose(false)}
    />
  );
}
