// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * PANEL_SETUP_FORMATTING (pcbnew/dialogs/panel_setup_formatting.cpp) on its base: the dash and
 * gap ratios as UNSCALED text, and the five "Apply board defaults" checks each to its own flag.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type PcbFormatting,
  PanelPcbFormatting,
} from '@ziroeda/pcbnew/dialogs/panel_setup_formatting.js';

afterEach(cleanup);

const START: PcbFormatting = {
  dashLengthRatio: 12,
  gapLengthRatio: 3,
  applyFields: false,
  applyText: false,
  applyShapes: false,
  applyDimensions: false,
  applyBarcodes: false,
};

let last: PcbFormatting = START;
function Harness(): JSX.Element {
  const [v, setV] = useState(START);
  last = v;
  return <PanelPcbFormatting value={v} onChange={setV} />;
}

describe('PANEL_SETUP_FORMATTING', () => {
  it('shows the ratios as StringFromValue( UNSCALED ) prints them', () => {
    render(<Harness />);
    expect((screen.getByRole('textbox', { name: 'Dash length' }) as HTMLInputElement).value).toBe(
      '12',
    );
    expect((screen.getByRole('textbox', { name: 'Gap length' }) as HTMLInputElement).value).toBe(
      '3',
    );
  });

  it('a typed ratio is read back with DoubleValueFromString', () => {
    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Gap length' }), {
      target: { value: '2.5' },
    });
    expect(last.gapLengthRatio).toBe(2.5);
    expect(last.dashLengthRatio).toBe(12);
  });

  it.each([
    ['Apply board defaults to footprint fields', 'applyFields'],
    ['Apply board defaults to footprint text', 'applyText'],
    ['Apply board defaults to non-copper footprint shapes', 'applyShapes'],
    ['Apply board defaults to footprint dimensions', 'applyDimensions'],
    ['Apply board defaults to footprint barcodes', 'applyBarcodes'],
  ] as const)('"%s" sets %s alone', (aLabel, aKey) => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('checkbox', { name: aLabel }));
    expect(last).toEqual({ ...START, [aKey]: true });
  });
});
