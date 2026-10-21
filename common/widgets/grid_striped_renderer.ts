// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `STRIPED_STRING_RENDERER` (common/widgets/grid_striped_renderer.{h,cpp}): a string cell drawn
 * over horizontal stripes 3 px tall, alternating wxSYS_COLOUR_WINDOW and a light grey - what the
 * library Symbol Fields Table draws in a cell the symbol has no such field for. A selected cell is
 * filled with the selection colour instead. The text is the string renderer's.
 */
import { type wxGridCellBackgroundDrawn, wxGridCellStringRenderer } from '@ziroeda/wx/grid.js';

/** `stripeHeight`. [data] */
const STRIPE_HEIGHT = 3;
/** `color2( 240, 240, 240 )`, "Light gray". */
const STRIPE_COLOUR_2 = '#f0f0f0'; // [data] wxColour color2( 240, 240, 240 )

export class STRIPED_STRING_RENDERER
  extends wxGridCellStringRenderer
  implements wxGridCellBackgroundDrawn
{
  /** `Draw()`'s background: the selection fill when selected, else the stripes. */
  DrawBackground(aSelected: boolean): string | null {
    if (aSelected) return null;

    // color1 is wxSYS_COLOUR_WINDOW
    return `repeating-linear-gradient(to bottom, var(--chrome-bg2) 0 ${STRIPE_HEIGHT}px, ${STRIPE_COLOUR_2} ${STRIPE_HEIGHT}px ${2 * STRIPE_HEIGHT}px)`;
  }
}
