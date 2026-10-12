// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * PANEL_PCBNEW_DISPLAY_ORIGIN (pcbnew/dialogs/panel_pcbnew_display_origin.cpp) on its base: which
 * radio each setting checks, and what each radio writes back.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type DisplayOriginValue,
  PanelDisplayOrigin,
} from '@ziroeda/pcbnew/dialogs/panel_pcbnew_display_origin.js';

afterEach(cleanup);

const radio = (aName: string): HTMLInputElement =>
  screen.getByRole('radio', { name: aName }) as HTMLInputElement;

describe('PANEL_PCBNEW_DISPLAY_ORIGIN', () => {
  it.each([
    [false, false, 'Increases right', 'Increases down'],
    [true, true, 'Increases left', 'Increases up'],
  ])('invert x %s, y %s checks %s and %s', (aX, aY, aXRadio, aYRadio) => {
    const v: DisplayOriginValue = {
      origin_mode: 0,
      origin_invert_x_axis: aX,
      origin_invert_y_axis: aY,
    };
    render(<PanelDisplayOrigin value={v} onChange={() => {}} idPrefix="t" showDisplayOrigin />);
    expect(radio(aXRadio).checked).toBe(true);
    expect(radio(aYRadio).checked).toBe(true);
  });

  it.each([
    ['Increases up', { origin_invert_y_axis: true }],
    ['Increases left', { origin_invert_x_axis: true }],
    ['Grid origin', { origin_mode: 2 }],
    ['Drill/place file origin', { origin_mode: 1 }],
  ] as const)('%s writes %o', (aName, aPatch) => {
    let patch: Partial<DisplayOriginValue> | null = null;
    const v: DisplayOriginValue = {
      origin_mode: 0,
      origin_invert_x_axis: false,
      origin_invert_y_axis: false,
    };
    render(
      <PanelDisplayOrigin value={v} onChange={(p) => (patch = p)} idPrefix="t" showDisplayOrigin />,
    );
    fireEvent.click(radio(aName));
    expect(patch).toEqual(aPatch);
  });
});
