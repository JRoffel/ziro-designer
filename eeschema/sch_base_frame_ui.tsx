// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The window half of the dialogs SCH_BASE_FRAME opens itself (sch_base_frame.ts): today the
 * EDA_LIST_DIALOG of SelectLibrary.
 */
import { EdaListDialog } from '@ziroeda/common/dialogs/eda_list_dialog.js';
import { wxID_CANCEL, wxID_OK } from '@ziroeda/wx/menu.js';
import type { JSX } from 'react';
import { type EDA_LIST_DIALOG_ARG, PINNING_SYMBOL } from './sch_base_frame.js';

/**
 * `GetTextSelection()`'s answer for a row: its first column, the pinning symbol taken off
 * (eda_list_dialog.cpp:217).
 */
export function LibraryRowValue(aText: string): string {
  return aText.startsWith(PINNING_SYMBOL) ? aText.substring(PINNING_SYMBOL.length) : aText;
}

/**
 * `EDA_LIST_DIALOG dlg( this, aDialogTitle, headers, itemsToDisplay, libraryName, false )` with
 * SelectLibrary's list label, extra checkboxes and "New Library..." button. It fills \a arg's
 * `textSelection` and checkbox values and closes with the id ShowModal() would return.
 */
export function SelectLibraryDialog({
  arg,
  onClose,
}: {
  arg: EDA_LIST_DIALOG_ARG;
  onClose: (aRetCode: number) => void;
}): JSX.Element {
  return (
    <EdaListDialog
      title={arg.title}
      headers={arg.headers}
      rows={arg.items.map((item) => ({ value: LibraryRowValue(item[0]), cells: item }))}
      preselectText={arg.selection}
      sortList={arg.sortList}
      listLabel={arg.listLabel}
      extraCheckboxes={arg.extraCheckboxes}
      {...(arg.extraButton ? { extraButton: arg.extraButton } : {})}
      onResult={(aValue, _aName, aExtras) => {
        if (aExtras?.button !== undefined) {
          onClose(aExtras.button);
          return;
        }

        if (aValue === null && !aExtras) {
          onClose(wxID_CANCEL);
          return;
        }

        arg.textSelection = aValue ?? '';
        // dlg.GetExtraCheckboxValues()
        aExtras?.checkboxes.forEach((v, i) => {
          arg.extraCheckboxes[i]!.value = v;
        });
        onClose(wxID_OK);
      }}
    />
  );
}
