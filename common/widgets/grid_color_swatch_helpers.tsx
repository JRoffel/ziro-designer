// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `common/widgets/grid_color_swatch_helpers.cpp`: GRID_CELL_COLOR_RENDERER, what a WX_GRID cell
 * draws when it holds a colour. Here it is the drawing WxGridView's `renderCell` returns.
 *
 * Only the default-size form is here: `GRID_CELL_COLOR_RENDERER( aParent )` with `m_size ==
 * wxDefaultSize` makes the swatch `aRect.GetSize()`, so the colour fills the cell
 * (DIALOG_TABLE_PROPERTIES' covered cells). The sized, centred swatch and GRID_CELL_COLOR_SELECTOR
 * are drawn with COLOR_SWATCH by their callers so far.
 */
import type { CSSProperties, JSX } from 'react';

/** `GRID_CELL_COLOR_RENDERER::Draw` at wxDefaultSize: `aColor` (any CSS colour) over the cell. */
export function GRID_CELL_COLOR_RENDERER({ color }: { color: string }): JSX.Element {
  return (
    <span className="ze-grid-color-cell" style={{ '--swatch-color': color } as CSSProperties} />
  );
}
