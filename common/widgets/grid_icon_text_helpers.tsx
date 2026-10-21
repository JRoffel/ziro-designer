// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `include/widgets/grid_icon_text_helpers.h` + `common/widgets/grid_icon_text_helpers.cpp`:
 * `GRID_CELL_ICON_TEXT_RENDERER`, a cell that draws the icon matching its text before the text.
 * The view (`wx/grid_ui.tsx`) draws it from DrawValue's `icon`.
 */
import type { JSX } from 'react';
import { bitmapUrl } from '../bitmap_store.js';
import { DialogIcon } from '../dialogs/dialog_message.js';
import {
  type wxGrid,
  type wxGridCellChoiceView,
  type wxGridCellDrawn,
  wxGridCellChoiceEditor,
  wxGridCellRenderer,
} from '@ziroeda/wx/grid.js';

export class GRID_CELL_ICON_TEXT_RENDERER extends wxGridCellRenderer implements wxGridCellDrawn {
  constructor(
    private readonly m_icons: readonly string[],
    private readonly m_names: readonly string[],
  ) {
    super();
  }

  /**
   * `Draw`: the icon at the text's index in the names (the set of icons might be smaller than
   * the set of labels), then the text.
   */
  DrawValue(
    aValue: string,
    _aGrid: wxGrid,
    _aRow: number,
    _aCol: number,
  ): { label: string; icon?: string } {
    const position = this.m_names.indexOf(aValue);
    const icon =
      position >= 0 && position < this.m_icons.length
        ? bitmapUrl(this.m_icons[position]!)
        : undefined;

    return icon === undefined ? { label: aValue } : { label: aValue, icon };
  }
}

/**
 * `GRID_CELL_ICON_TEXT_POPUP( icons, names )`: a read-only wxBitmapComboBox of the names, each with
 * its icon (the set of icons might be smaller than the set of labels). The view draws the shared
 * Combo from GetComboOptions.
 */
export class GRID_CELL_ICON_TEXT_POPUP
  extends wxGridCellChoiceEditor
  implements wxGridCellChoiceView
{
  constructor(
    private readonly m_icons: readonly string[],
    private readonly m_names: readonly string[],
  ) {
    super(m_names, false);
  }

  /** `Clone()`. */
  Clone(): GRID_CELL_ICON_TEXT_POPUP {
    return new GRID_CELL_ICON_TEXT_POPUP(this.m_icons, this.m_names);
  }

  /** `Create()`'s `Append( m_names[i], KiBitmapBundle( m_icons[i] ) )` for each name. */
  GetComboOptions(): { value: string; label: string; bitmap?: string }[] {
    return this.m_names.map((name, i) => {
      const icon = i < this.m_icons.length ? bitmapUrl(this.m_icons[i]!) : undefined;

      return icon === undefined
        ? { value: name, label: name }
        : { value: name, label: name, bitmap: icon };
    });
  }
}

/**
 * `GRID_CELL_STATUS_ICON_RENDERER( aStatus )`: wxArtProvider's message-box icon for the status at
 * wxART_BUTTON size, centred in the cell; nothing for status 0.
 */
export function GridCellStatusIcon({
  status,
  tooltip,
}: {
  status: 0 | 'warning' | 'error';
  /** The cell's text, which GRID_TRICKS shows as the tooltip. */
  tooltip: string;
}): JSX.Element | null {
  if (status === 0) return null;

  return (
    <span className="ze-grid-status-cell" title={tooltip}>
      <DialogIcon icon={status} className="ze-grid-status-icon" />
    </span>
  );
}
