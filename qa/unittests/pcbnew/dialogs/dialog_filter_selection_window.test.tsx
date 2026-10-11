// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_FILTER_SELECTION's window on its base: the base's labels, a box's click reaching
 * checkBoxClicked, the All items box walking its three states, OK writing the options.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DIALOG_FILTER_SELECTION,
  DialogFilterSelection,
  type SelectionFilter,
} from '@ziroeda/pcbnew/dialogs/dialog_filter_selection.js';

afterEach(cleanup);

function show() {
  const options: SelectionFilter = {
    footprints: true,
    lockedFootprints: true,
    tracks: true,
    vias: true,
    zones: true,
    boardOutline: true,
    techLayers: true,
    text: true,
  };
  const onClose = vi.fn();
  render(<DialogFilterSelection dialog={new DIALOG_FILTER_SELECTION(options)} onClose={onClose} />);
  return { options, onClose };
}

const box = (aLabel: string) => screen.getByLabelText(aLabel) as HTMLInputElement;

describe('DIALOG_FILTER_SELECTION window', () => {
  it("has the base's ten boxes, All items checked on the defaults", () => {
    show();

    expect(screen.getByText('Filter Selected Items')).toBeTruthy();
    for (const l of [
      'Include footprints',
      'Include text items',
      'Include locked footprints',
      'Include drawings',
      'Include tracks',
      'Include board outline layer',
      'Include vias',
      'Include zones',
    ])
      expect(box(l).checked).toBe(true);
    expect(box('All items').checked).toBe(true);
  });

  it('unticking footprints disables the locked box and makes All items undetermined', () => {
    show();

    fireEvent.click(box('Include footprints'));
    expect(box('Include locked footprints').disabled).toBe(true);
    expect(box('All items').getAttribute('aria-checked')).toBe('mixed');
  });

  it('All items walks checked -> undetermined, clearing every box', () => {
    show();

    fireEvent.click(box('All items'));
    expect(box('All items').getAttribute('aria-checked')).toBe('mixed');
    expect(box('Include tracks').checked).toBe(false);
  });

  it('OK writes the boxes back; Cancel leaves the options', () => {
    const first = show();
    fireEvent.click(box('Include vias'));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(first.onClose).toHaveBeenCalledWith(true);
    expect(first.options.vias).toBe(false);
    cleanup();

    const second = show();
    fireEvent.click(box('Include vias'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(second.onClose).toHaveBeenCalledWith(false);
    expect(second.options.vias).toBe(true);
  });
});
