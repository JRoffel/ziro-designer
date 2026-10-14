// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `INDICATOR_ICON` and `ROW_ICON_PROVIDER` (`include/widgets/indicator_icon.h`,
 * `common/widgets/indicator_icon.cpp`): the small state icon at the head of a
 * layer row - the blue right arrow on the active layer in pcbnew's appearance
 * panel and GerbView's layer list, blank on every other row.
 *
 * `ROW_ICON_PROVIDER::GetIndicatorIcon` maps a state to one of seven bitmaps
 * it builds pixel by pixel. OFF and ON are drawn (`.ze-layer-indicator` and
 * `.on` in shell.css, the arrow being `createArrow( size, scale, 1,
 * wxColour( 64, 72, 255 ) )`); the other five have no caller here and draw
 * as OFF.
 */

import type { JSX } from 'react';
import { rgb8ToCss } from '../gal/color4d.js';
import { rcTreeTextColour } from './rc_tree_style.js';

/** `KIUI::c_IndicatorSizeDIP` (include/widgets/ui_common.h): an indicator bitmap's side. */
export const c_IndicatorSizeDIP = 10;

/**
 * `createTurndown( size, aScaleFactor, aDirection, aColour )` (indicator_icon.cpp:126): the
 * disclosure triangle, its alpha per pixel at scale 1, turned clockwise `aDirection` quarter
 * turns (1 points right: CLOSED; 2 points down: OPEN).
 */
export function createTurndown(aSize: number, aDirection: number): number[][] {
  let image: number[][] = Array.from({ length: aSize }, () => new Array<number>(aSize).fill(0));

  const opacity = Math.trunc(0.7 * 255);
  const padding_start = 0;
  const padding_end = 2;

  let startX = Math.trunc((aSize - 1) / 2);
  let len = 1;
  const startY = padding_start;

  for (let y = 0; y < aSize - padding_end; ++y) {
    for (let x = 0; x < len; ++x) {
      const alpha = y % 2 || (x > 0 && x < len - 1) ? opacity : Math.trunc(opacity / 2);
      const row = image[y + startY];
      if (row && x + startX >= 0 && x + startX < aSize) row[x + startX] = alpha;
    }

    // Next row will start one pixel back and be two pixels longer
    if (y % 2) {
      startX -= 1;
      len += 2;
    }
  }

  // wxImage::Rotate90(): clockwise
  for (let i = 0; i < aDirection; ++i) {
    const rotated = Array.from({ length: aSize }, () => new Array<number>(aSize).fill(0));
    for (let y = 0; y < aSize; ++y)
      for (let x = 0; x < aSize; ++x) rotated[x]![aSize - 1 - y] = image[y]![x]!;
    image = rotated;
  }

  return image;
}

/** `GetIndicatorIcon( OPEN / CLOSED )` as an image URL, drawn in wxSYS_COLOUR_LISTBOXTEXT. */
export function turndownIconUrl(aState: ROW_ICON_STATE.OPEN | ROW_ICON_STATE.CLOSED): string {
  const image = createTurndown(c_IndicatorSizeDIP, aState === ROW_ICON_STATE.CLOSED ? 1 : 2);
  // wxSYS_COLOUR_LISTBOXTEXT: shell.css' --view-fg, as the RC tree reads it.
  const text = rcTreeTextColour();
  const colour = rgb8ToCss([
    Math.round(text.r * 255),
    Math.round(text.g * 255),
    Math.round(text.b * 255),
  ]);
  let rects = '';

  for (let y = 0; y < image.length; y++) {
    for (let x = 0; x < image[y]!.length; x++) {
      const a = image[y]![x]!;
      if (a)
        rects += `<rect x="${x}" y="${y}" width="1" height="1" fill-opacity="${(a / 255).toFixed(3)}"/>`;
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${c_IndicatorSizeDIP}" height="${c_IndicatorSizeDIP}" fill="${colour}">${rects}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** `GetIndicatorIcon( OFF )`: the blank bitmap of the same size. */
export const BLANK_INDICATOR_URL = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${c_IndicatorSizeDIP}" height="${c_IndicatorSizeDIP}"/>`,
)}`;

/** `ROW_ICON_PROVIDER::STATE`. */
export enum ROW_ICON_STATE {
  /** Row "off" or "deselected" */
  OFF,
  /** Row "dimmed" */
  DIMMED,
  /** Row "on" or "selected" */
  ON,
  /** Row above design alpha */
  UP,
  /** Row below design alpha */
  DOWN,
  OPEN,
  CLOSED,
}

export interface IndicatorIconProps {
  /** `SetIndicatorState( aIconId )`. */
  state: ROW_ICON_STATE;
}

export function IndicatorIcon({ state }: IndicatorIconProps): JSX.Element {
  return (
    <span
      className={`ze-layer-indicator${state === ROW_ICON_STATE.ON ? ' on' : ''}`}
      aria-hidden="true"
    />
  );
}
