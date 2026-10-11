// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * Three Schematic Setup pages over their _base pairs: Annotation (unit notation, order,
 * numbering, reuse), Pin Conflicts Map (KiCad's erc bitmaps, the state as the tooltip, a click
 * cycling the mirrored pair) and Formatting (the inter-sheet controls following their checkbox,
 * the operating-point ranges by name).
 */
import { bitmapUrl } from '@ziroeda/common/bitmap_store.js';
import { defaultFormatting } from '@ziroeda/eeschema/schematic_settings.js';
import {
  defaultAnnotation,
  PanelEeschemaAnnotationOptions,
} from '@ziroeda/eeschema/dialogs/panel_eeschema_annotation_options.js';
import { PanelSetupFormatting } from '@ziroeda/eeschema/dialogs/panel_setup_formatting.js';
import { PanelSetupPinmap } from '@ziroeda/eeschema/dialogs/panel_setup_pinmap.js';
import { defaultErcSettings } from '@ziroeda/eeschema/index.js';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

describe('PANEL_EESCHEMA_ANNOTATION_OPTIONS_BASE', () => {
  it('maps every control onto the slice', () => {
    const onChange = vi.fn();
    render(<PanelEeschemaAnnotationOptions value={defaultAnnotation()} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Sort symbols by Y position'));
    expect(onChange.mock.calls.at(-1)![0].sortOrder).toBe('y');
    fireEvent.click(screen.getByLabelText('First free after sheet number X 1000'));
    expect(onChange.mock.calls.at(-1)![0].numbering).toBe('sheetX1000');
    fireEvent.change(screen.getByLabelText('First free number after'), { target: { value: '42' } });
    expect(onChange.mock.calls.at(-1)![0].firstFreeAfter).toBe(42);
    fireEvent.click(screen.getByLabelText('Allow reference reuse'));
    expect(onChange.mock.calls.at(-1)![0].allowReuse).toBe(!defaultAnnotation().allowReuse);
    for (const h of ['Units', 'Order', 'Numbering']) expect(screen.getByText(h)).toBeTruthy();
  });
});

describe('PANEL_SETUP_PINMAP_BASE', () => {
  it('draws the erc bitmaps, the state as the tooltip, and a click cycles the mirrored pair', () => {
    const settings = defaultErcSettings();
    const onChange = vi.fn();
    render(<PanelSetupPinmap settings={settings} onChange={onChange} />);
    // Output against Output is an error in the default map, so the tooltip is not state 0's.
    const cell = screen.getByLabelText('Output Pin / Output Pin');
    const state = settings.pinMap[1]![1]! as number;
    expect(state).toBe(2);
    expect(cell.getAttribute('title')).toBe(
      ['No error or warning', 'Generate warning', 'Generate error'][state],
    );
    expect(cell.querySelector('img')?.getAttribute('src')).toBe(
      bitmapUrl(['erc_green', 'ercwarn', 'ercerr'][state]!),
    );
    fireEvent.click(cell);
    const next = onChange.mock.calls[0]![0].pinMap;
    expect(next[1][1]).toBe((state + 1) % 3);
    expect(screen.queryByText('Pin Conflicts Map')).toBeNull();
  });
});

describe('PANEL_SETUP_FORMATTING_BASE', () => {
  it('the inter-sheet controls follow Show inter-sheet references', () => {
    render(
      <PanelSetupFormatting
        value={{ ...defaultFormatting(), intersheetRefsShow: false }}
        onChange={() => {}}
      />,
    );
    expect((screen.getByLabelText('Prefix') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Show own page reference') as HTMLInputElement).disabled).toBe(
      true,
    );
    cleanup();
    render(
      <PanelSetupFormatting
        value={{ ...defaultFormatting(), intersheetRefsShow: true }}
        onChange={() => {}}
      />,
    );
    expect((screen.getByLabelText('Prefix') as HTMLInputElement).disabled).toBe(false);
  });

  it('writes the numbers and the dashed-line note is the small italic info font', () => {
    const onChange = vi.fn();
    render(<PanelSetupFormatting value={defaultFormatting()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Connection grid'), { target: { value: '25' } });
    expect(onChange.mock.calls.at(-1)![0].connectionGridMils).toBe(25);
    const note = screen.getByText('Dash and dot lengths are ratios of the line width.');
    expect(note.className).toMatch(/small-info/);
    expect(note.className).toMatch(/italic/);
  });
});
