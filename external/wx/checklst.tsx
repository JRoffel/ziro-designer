// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from wxWidgets (wxWindows Library Licence).
/**
 * `wxCheckListBox` (wx/checklst.h): a list box whose rows each carry a check box. GTK draws it as
 * a treeview with a toggle column, the same face as any list (`.ze-gridlist`); a row is selected
 * by clicking its label and checked by clicking its box. Single selection (`wxLB_SINGLE`).
 *
 * `wxRearrangeList` (wx/rearrangectrl.h) is this list with an order the user changes
 * (MoveCurrentUp / MoveCurrentDown): the owner holds the order and passes the rows in it.
 */
import type { JSX, MouseEvent } from 'react';
import { CheckBox } from './controls.js';

export interface CheckListBoxProps {
  /** The rows' labels, in display order. */
  items: readonly string[];
  /** `IsChecked( n )` for each row. */
  checked: readonly boolean[];
  /** `Check( n, on )`, from a click on a row's box. */
  onCheck: (aIndex: number, aOn: boolean) => void;
  /** `GetSelection()`; -1 for none. */
  selection?: number;
  /** wxEVT_LISTBOX: a click on a row's label selects it. */
  onSelect?: (aIndex: number) => void;
  /** wxEVT_RIGHT_DOWN on the list: the owner's popup menu. */
  onContextMenu?: (aEvent: MouseEvent<HTMLDivElement>) => void;
  ariaLabel?: string;
}

/**
 * `wxListBox::DoGetBestSize` (src/gtk/listbox.cpp) for a wxCheckListBox: the text height, raised to
 * wx's "rough height of checkbox" of 25, plus 4 per row - for at least 3 rows and at most 10, so a
 * long list does not make its window tall: a sizer stretches it from there and it scrolls.
 * qa/probes/plot_layer_list_probe.cpp asks wxGTK for the 22 layers of DIALOG_PLOT: 290.
 * [data] wx's own constants, not a theme metric.
 */
export function CheckListBoxBestHeight(aCount: number): number {
  const rowHeight = 25 + 4;
  return rowHeight * Math.min(Math.max(aCount, 3), 10);
}

export function CheckListBox({
  items,
  checked,
  onCheck,
  selection = -1,
  onSelect,
  onContextMenu,
  ariaLabel,
}: CheckListBoxProps): JSX.Element {
  return (
    <div
      className="ze-gridlist ze-checklist"
      role="listbox"
      aria-label={ariaLabel}
      style={{ minHeight: CheckListBoxBestHeight(items.length) }}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        onContextMenu(e);
      }}
    >
      <div className="ze-checklist-rows">
        {items.map((label, i) => (
          <div
            // Rows are positions in the list; the owner reorders the labels, not the rows.
            // biome-ignore lint/suspicious/noArrayIndexKey: a row IS its index here
            key={i}
            role="option"
            aria-selected={i === selection}
            className={`ze-gridlist-row${i === selection ? ' selected' : ''}`}
            onClick={() => onSelect?.(i)}
          >
            <CheckBox
              label={label}
              checked={checked[i] ?? false}
              onChange={(on) => onCheck(i, on)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** `wxRearrangeList::MoveCurrentUp` / `MoveCurrentDown` on the owner's arrays: the moved order. */
export function moveCurrent<T>(aItems: readonly T[], aCurrent: number, aBy: -1 | 1): T[] {
  const to = aCurrent + aBy;

  if (aCurrent < 0 || to < 0 || to >= aItems.length) return [...aItems];

  const out = [...aItems];
  [out[aCurrent], out[to]] = [out[to]!, out[aCurrent]!];
  return out;
}
