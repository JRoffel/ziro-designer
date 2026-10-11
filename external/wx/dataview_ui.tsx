// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from wxWidgets (wxWindows Library Licence).
/**
 * `wxDataViewListCtrl` (wx/dataview.h) in the shape KiCad builds it: `AppendToggleColumn` then
 * `AppendIconTextColumn`, as ZONE_SETTINGS::SetupLayersList does for every zone dialog's layer
 * list. GTK draws it as a treeview, the same face as wxCheckListBox (`.ze-gridlist`). The icon is
 * a COLOR_SWATCH bitmap, so a row's icon is its colour.
 */
import type { JSX, ReactNode, Ref } from 'react';
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

/** `wxDataViewIconText` under wxDataViewIconTextRenderer: the icon, then the text. */
export function DataViewIconText({ icon, text }: { icon: ReactNode; text: string }): JSX.Element {
  return (
    <>
      <span className="ze-dataview-icon">{icon}</span>
      {text}
    </>
  );
}

/**
 * `wxDataViewCtrl` over a list model (`wxDataViewIndexListModel`): a header row of the appended
 * columns, one row per item, single selection (wxDV_SINGLE), with wxDV_HORIZ_RULES and
 * wxDV_VERT_RULES drawn as the grid's rules.
 */
export function DataViewCtrl({
  columns,
  rowCount,
  cell,
  selection,
  onSelect,
  tableRef,
  ariaLabel,
}: {
  /** `AppendTextColumn` / `AppendIconTextColumn`: each column's title. */
  columns: readonly string[];
  /** The model's `GetCount()`. */
  rowCount: number;
  /** The model's `GetValueByRow( row, col )`, rendered. */
  cell: (aRow: number, aCol: number) => ReactNode;
  /** `GetSelection()`: the selected row, or null. */
  selection: number | null;
  /** wxEVT_DATAVIEW_SELECTION_CHANGED. */
  onSelect: (aRow: number) => void;
  /** For `SetFocus()` and `EnsureVisible()`. */
  tableRef?: Ref<HTMLTableElement>;
  ariaLabel: string;
}): JSX.Element {
  return (
    // The window scrolls its rows, as a wxDataViewCtrl does.
    <div className="ze-dataview-window">
      <table className="ze-grid ze-dataview" ref={tableRef} tabIndex={0} aria-label={ariaLabel}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, row) => (
            <tr
              // biome-ignore lint/suspicious/noArrayIndexKey: an index-list model's item IS its row
              key={row}
              data-row={row}
              aria-selected={selection === row}
              className={selection === row ? 'selected' : ''}
              onClick={() => onSelect(row)}
            >
              {columns.map((c, col) => (
                <td key={c}>{cell(row, col)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
