// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from wxWidgets (wxWindows Library Licence).
/**
 * `wxDataViewListCtrl` (wx/dataview.h) in the shape KiCad builds it: `AppendToggleColumn` then
 * `AppendIconTextColumn`, as ZONE_SETTINGS::SetupLayersList does for every zone dialog's layer
 * list. GTK draws it as a treeview, the same face as wxCheckListBox (`.ze-gridlist`). The icon is
 * a COLOR_SWATCH bitmap, so a row's icon is its colour.
 */
import type { JSX } from 'react';
import { CheckBox } from './controls.js';

export interface DATAVIEW_TOGGLE_ROW {
  /** The toggle column's value. */
  toggle: boolean;
  /** The icon-text column: its text and the swatch colour of its icon. */
  text: string;
  iconColour: string;
}

export function DataViewListCtrl({
  rows,
  onToggle,
  ariaLabel,
}: {
  rows: readonly DATAVIEW_TOGGLE_ROW[];
  /** wxEVT_DATAVIEW_ITEM_VALUE_CHANGED on the toggle column. */
  onToggle: (aRow: number, aOn: boolean) => void;
  ariaLabel?: string;
}): JSX.Element {
  return (
    <div className="ze-gridlist" role="listbox" aria-label={ariaLabel}>
      {rows.map((r, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a row IS its index here
        <div key={i} role="option" aria-selected={false} className="ze-gridlist-row">
          <CheckBox
            label={
              <>
                <span className="ze-layer-swatch" style={{ background: r.iconColour }} />
                {r.text}
              </>
            }
            checked={r.toggle}
            onChange={(on) => onToggle(i, on)}
          />
        </div>
      ))}
    </div>
  );
}
