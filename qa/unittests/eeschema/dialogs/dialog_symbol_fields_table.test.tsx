// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_SYMBOL_FIELDS_TABLE over its _base: the splitter with the view controls over the (greyed)
 * variants panel, the Edit / Export notebook, the presets as owner-drawn choices (no native
 * <select>), the sidebar toggle Unsplit()ting the left panel, and the export page's controls.
 */
import { parse } from '@ziroeda/sexpr';
import { readSchematic } from '@ziroeda/eeschema';
import { DialogSymbolFieldsTable } from '@ziroeda/eeschema/dialogs/dialog_symbol_fields_table.js';
import { defaultBomPresets } from '@ziroeda/eeschema/schematic_settings.js';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(cleanup);

const DOC = readSchematic(
  parse(`(kicad_sch (version 20250114) (generator "eeschema")
  (lib_symbols
    (symbol "Device:R" (pin_numbers hide)
      (property "Reference" "R" (at 0 0 0) (effects (font (size 1.27 1.27))))
      (property "Value" "R" (at 0 0 0) (effects (font (size 1.27 1.27))))))
  (symbol (lib_id "Device:R") (at 40 60 0) (unit 1) (uuid "s1")
    (property "Reference" "R1" (at 40 57 0) (effects (font (size 1.27 1.27))))
    (property "Value" "10k" (at 40 63 0) (effects (font (size 1.27 1.27))))))`),
);

function open(aTab: 'edit' | 'export' = 'edit') {
  const onClose = vi.fn();
  render(
    <DialogSymbolFieldsTable
      docs={new Map([['root.kicad_sch', DOC]])}
      rootFile="root.kicad_sch"
      presets={defaultBomPresets()}
      onSavePresets={() => {}}
      defaultBomFileName="root.csv"
      initialTab={aTab}
      onApply={() => {}}
      onClose={onClose}
    />,
  );
  return { onClose };
}

describe('DIALOG_SYMBOL_FIELDS_TABLE_BASE', () => {
  it('Edit / Export notebook, view presets as a choice, no native select', () => {
    open();
    expect(screen.getByRole('tab', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Export' })).toBeTruthy();
    expect(screen.getByLabelText('View presets')).toBeTruthy();
    expect(document.querySelectorAll('select').length).toBe(0);
  });

  it('the variants panel is shown and greyed', () => {
    open();
    expect(screen.getByText('Schematic variants:').className).toMatch(/disabled/);
    expect((screen.getByLabelText('Add variant') as HTMLButtonElement).disabled).toBe(true);
  });

  it('the sidebar button Unsplit()s the left panel and splits it back', () => {
    open();
    expect(screen.queryByLabelText('View presets')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Collapse left panel'));
    expect(screen.queryByLabelText('View presets')).toBeNull();
    fireEvent.click(screen.getByLabelText('Expand left panel'));
    expect(screen.queryByLabelText('View presets')).toBeTruthy();
  });

  it('the Export page: delimiters, format presets and the preview', () => {
    open('export');
    expect((screen.getByLabelText('Field delimiter') as HTMLInputElement).value).toBe(',');
    expect(screen.getByLabelText('Format presets')).toBeTruthy();
    expect((screen.getByLabelText('Preview') as HTMLTextAreaElement).value).toContain('R1');
  });

  it('clicking Export switches the notebook and fills the preview', () => {
    open('edit');
    fireEvent.click(screen.getByRole('tab', { name: 'Export' }));
    expect(screen.getByRole('tab', { name: 'Export' }).getAttribute('aria-selected')).toBe('true');
    expect((screen.getByLabelText('Preview') as HTMLTextAreaElement).value).toContain('R1');
  });
});
