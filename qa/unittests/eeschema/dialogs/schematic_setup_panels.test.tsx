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
import { SetErrorPresenter } from '@ziroeda/common/confirm.js';
import { DialogSchematicSetup } from '@ziroeda/eeschema/dialogs/dialog_schematic_setup.js';
import { defaultFormatting, defaultSchematicSetup } from '@ziroeda/eeschema/schematic_settings.js';
import {
  defaultAnnotation,
  PanelEeschemaAnnotationOptions,
} from '@ziroeda/eeschema/dialogs/panel_eeschema_annotation_options.js';
import {
  PanelSetupFormatting,
  validateFormatting,
} from '@ziroeda/eeschema/dialogs/panel_setup_formatting.js';
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

  // TransferDataToWindow's SET_VALUE: m_OverbarHeight (1.23, KIFONT::METRICS) is shown
  // `* 100.0` as PERCENT; m_TextOffsetRatio 0.15 and m_LabelSizeRatio 0.375 likewise.
  // The four UNIT_BINDERs are SetUnits( MILS ): 50, 6, 25 and 50 mils.
  it('shows the ratios as percentages and the sizes in mils, the way KiCad fills them', () => {
    const onChange = vi.fn();
    render(<PanelSetupFormatting value={defaultFormatting()} onChange={onChange} />);
    const field = (aLabel: string) => (screen.getByLabelText(aLabel) as HTMLInputElement).value;
    expect(field('Overbar offset ratio')).toBe('123');
    expect(field('Label offset ratio')).toBe('15');
    expect(field('Global label margin ratio')).toBe('37.5');
    expect(field('Default text size')).toBe('50');
    expect(field('Default line width')).toBe('6');
    expect(field('Pin symbol size')).toBe('25');
    expect(field('Dash length')).toBe('12');
    fireEvent.change(screen.getByLabelText('Overbar offset ratio'), { target: { value: '150' } });
    expect(onChange.mock.calls.at(-1)![0].overbarOffsetRatio).toBe(1.5);
    // The evaluator honours a typed unit: 2.54 mm is 25400 IU, 100 mils.
    fireEvent.change(screen.getByLabelText('Default text size'), { target: { value: '2.54mm' } });
    expect(onChange.mock.calls.at(-1)![0].defaultTextSizeMils).toBe(100);
    cleanup();
    // A 1.3 mm text size (13000 IU) is 51.1811… mils; eeschema's StringFromValue prints %.3f.
    render(
      <PanelSetupFormatting
        value={{ ...defaultFormatting(), defaultTextSizeMils: 13000 / 254 }}
        onChange={() => {}}
      />,
    );
    expect(field('Default text size')).toBe('51.181');
  });

  // m_connectionGridSize.Validate( MIN_CONNECTION_GRID_MILS (25), 10000, MILS ).
  it('refuses a connection grid outside 25..10000 mils', () => {
    const at = (aMils: number) =>
      validateFormatting({ ...defaultFormatting(), connectionGridMils: aMils });
    expect(at(24)).toBe('Connection grid must be at least 25 mils.');
    expect(at(25)).toBeNull();
    expect(at(10000)).toBeNull();
    expect(at(10001)).toBe('Connection grid must be less than 10000 mils.');
  });

  // PAGED_DIALOG::TransferDataFromWindow: Formatting's Validate failing vetoes OK, and
  // UNIT_BINDER::delayedFocusHandler shows the message through DisplayErrorMessage.
  it('OK with an out-of-range connection grid keeps the dialog open', () => {
    const errors: string[] = [];
    SetErrorPresenter((aText) => errors.push(aText));
    const onOk = vi.fn();
    const value = defaultSchematicSetup();
    value.formatting.connectionGridMils = 10;
    render(
      <DialogSchematicSetup
        value={value}
        initialPage="formatting"
        onOk={onOk}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onOk).not.toHaveBeenCalled();
    expect(errors).toEqual(['Connection grid must be at least 25 mils.']);
    fireEvent.change(screen.getByLabelText('Connection grid'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onOk.mock.calls[0]![0].formatting.connectionGridMils).toBe(50);
  });
});
