// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `GRID_CELL_CHECKBOX_RENDERER` (common/widgets/grid_checkbox.{h,cpp}): wxGridCellBoolRenderer
 * drawing the native check box placed by the cell's alignment, 2 px in from the edge it is
 * aligned to (`GRID_CELL_CHECKBOX_MARGIN`). The grid view draws a bool renderer's box itself, so
 * the class is the bool renderer under KiCad's name.
 */
import { wxGridCellBoolRenderer } from '@ziroeda/wx/grid.js';

export class GRID_CELL_CHECKBOX_RENDERER extends wxGridCellBoolRenderer {}
