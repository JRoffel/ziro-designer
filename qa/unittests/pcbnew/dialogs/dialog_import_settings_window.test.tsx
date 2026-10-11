// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_IMPORT_SETTINGS's window (dialog_import_settings.cpp) on its base: the base file's rows
 * in order, Import Settings disabled until one is checked, Select All toggling on its own flag,
 * and "File not found." when nothing was picked.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DIALOG_IMPORT_SETTINGS,
  DialogImportSettings,
} from '@ziroeda/pcbnew/dialogs/dialog_import_settings.js';

afterEach(cleanup);

function show() {
  const onImport = vi.fn();
  render(<DialogImportSettings onImport={onImport} onClose={() => {}} />);
  return { onImport };
}

const button = (aName: string) => screen.getByRole('button', { name: aName }) as HTMLButtonElement;
const box = (aLabel: string) => screen.getByLabelText(aLabel) as HTMLInputElement;

describe('DIALOG_IMPORT_SETTINGS window', () => {
  it('lists the base file rows in order, with KiCad’s zone row and no other', () => {
    show();
    const labels = screen
      .getAllByRole('checkbox')
      .map((c) => (c as HTMLInputElement).closest('label')!.textContent);
    expect(labels).toEqual([
      'Board layers and physical stackup',
      'Solder mask/paste defaults',
      'Zone hatched fill offsets',
      'Text & graphics default properties',
      'Text & graphics formatting',
      'Design rule constraints',
      'Predefined track & via dimensions',
      'Teardrop defaults',
      'Length-tuning pattern defaults',
      'Net classes',
      'Component classes',
      'Tuning Profiles',
      'Custom rules',
      'Violation severities',
    ]);
  });

  it('Import Settings stays disabled until a row is checked', () => {
    show();
    expect(button('Import Settings').disabled).toBe(true);
    fireEvent.click(box('Net classes'));
    expect(button('Import Settings').disabled).toBe(false);
    fireEvent.click(box('Net classes'));
    expect(button('Import Settings').disabled).toBe(true);
  });

  it('Select All toggles on its own flag, and clearing the last row resets it', () => {
    show();
    fireEvent.click(button('Select All'));
    expect(box('Custom rules').checked).toBe(true);
    // The flag, not the rows: one row cleared leaves the button reading Deselect All.
    fireEvent.click(box('Custom rules'));
    expect(button('Deselect All')).toBeTruthy();
    fireEvent.click(button('Deselect All'));
    expect(box('Net classes').checked).toBe(false);
    expect(button('Select All')).toBeTruthy();

    // Select All, then clear every row one by one: the last one puts the button back.
    fireEvent.click(button('Select All'));
    for (const c of screen.getAllByRole('checkbox')) fireEvent.click(c);
    expect(button('Select All')).toBeTruthy();
  });

  it('OK with no file picked says File not found. and does not import', () => {
    const { onImport } = show();
    fireEvent.click(box('Net classes'));
    fireEvent.click(button('Import Settings'));
    expect(screen.getByText('File not found.')).toBeTruthy();
    expect(onImport).not.toHaveBeenCalled();
  });

  it('remembers the picked files for the session, and hands the options over', () => {
    const files = [
      { name: 'other.kicad_pcb', text: '(kicad_pcb)' },
      { name: 'other.kicad_pro', text: '{}' },
    ];
    const first = new DIALOG_IMPORT_SETTINGS();
    first.TransferDataToWindow();
    first.SetFiles(files);
    first.m_ZoneHatchingOffsetsOpt = true;
    expect(first.TransferDataFromWindow()).toBe(true);
    expect(first.GetOptions()).toMatchObject({ zoneHatchingOffsets: true, layers: false });

    const second = new DIALOG_IMPORT_SETTINGS();
    second.TransferDataToWindow();
    expect(second.m_filePathCtrl).toBe('other.kicad_pcb, other.kicad_pro');
  });
});
