// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `SYMBOL_FILTER_COMBOBOX` (eeschema/widgets/symbol_filter_combobox.cpp): a read-only FILTER_COMBOBOX
 * of symbol names whose list starts with "<do not derive>", which reads back as no parent.
 */
import {
  type FilterComboCtrlProps,
  FilterComboCtrl,
  filterListContent,
  sortStringList,
} from '@ziroeda/common/widgets/filter_combobox.js';
import { wxMatches } from '@ziroeda/wx/utils.js';
import type { JSX } from 'react';

/** `kNoParentSymbol`. [data] */
export const kNoParentSymbol = '<do not derive>';

/**
 * `SYMBOL_FILTER_COMBOPOPUP::getListContent`: the base list, with "<do not derive>" first when the
 * filter is empty or matches it.
 */
export function symbolFilterListContent(aStringList: readonly string[], aFilter: string): string[] {
  const listContent = filterListContent(aStringList, aFilter);
  const filterString = aFilter.trim();

  // Special handling for <do not derive>
  if (filterString === '' || wxMatches(kNoParentSymbol.toLowerCase(), filterString))
    listContent.unshift(kNoParentSymbol);

  return listContent;
}

/** `GetValue()`: the popup's string, '' for "<do not derive>". */
export function symbolFilterValue(aValue: string): string {
  if (aValue === kNoParentSymbol) return '';

  return aValue;
}

export interface SymbolFilterComboBoxProps
  extends Omit<FilterComboCtrlProps, 'getListContent' | 'onAccept'> {
  /** `SetStringList( aList )`. */
  stringList: readonly string[];
  /**
   * `FILTERED_ITEM_SELECTED`, with the selected string as the closed combo now shows it;
   * `GetValue()` is `symbolFilterValue()` of that.
   */
  onChange: (aSelected: string) => void;
}

export function SymbolFilterComboBox({
  stringList,
  value,
  onChange,
  ...rest
}: SymbolFilterComboBoxProps): JSX.Element {
  const sorted = sortStringList(stringList);

  return (
    <FilterComboCtrl
      {...rest}
      value={value}
      getListContent={(f) => symbolFilterListContent(sorted, f)}
      onAccept={(selectedString) => {
        // No update on empty
        if (selectedString !== '' && selectedString !== value) onChange(selectedString);
      }}
    />
  );
}
