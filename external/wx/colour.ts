// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from wxWidgets (wxWindows Library Licence).
/**
 * `wxColour` (wx/colour.h): what wx paints with. KiCad hands it one through `COLOR4D::ToColour`;
 * here the channels stay the 0..1 floats COLOR4D carries, and the page's CSS colour is made the
 * one way GTK would get its GdkRGBA from them.
 */
export interface wxColour {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** `*wxBLACK`. */
export const wxBLACK: wxColour = { r: 0, g: 0, b: 0, a: 1 };

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The CSS colour of a wxColour: each channel to a byte, alpha to three decimals. */
export function wxColourToCss(c: wxColour): string {
  const ch = (v: number): number => Math.round(clamp01(v) * 255);
  return c.a >= 1
    ? `rgb(${ch(c.r)}, ${ch(c.g)}, ${ch(c.b)})`
    : `rgba(${ch(c.r)}, ${ch(c.g)}, ${ch(c.b)}, ${Math.round(clamp01(c.a) * 1000) / 1000})`;
}
