// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_SCH_IMPORT_SETTINGS (dialog_sch_import_settings.cpp): every option opens unchecked,
 * Select All leaves Annotation alone, OK without a chosen file is "File not found.", and a file
 * chosen through Browse is handed over with the options.
 */
import { SetErrorPresenter } from '@ziroeda/common/confirm.js';
import { DialogSchImportSettings } from '@ziroeda/eeschema/dialogs/dialog_sch_import_settings.js';
import { SetFileDialog, type WxFileDialogProps } from '@ziroeda/wx/filedlg.js';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
  SetFileDialog(null);
  SetErrorPresenter(() => {});
});

const LABELS = [
  'Formatting preferences',
  'Annotation preferences',
  'Field name templates',
  'BOM presets',
  'BOM format presets',
  'Violation severities',
  'Pin conflict map',
  'Net classes',
  'Bus alias definitions',
  'Text variables',
];

const box = (l: string) => screen.getByLabelText(l) as HTMLInputElement;

describe('DIALOG_SCH_IMPORT_SETTINGS', () => {
  it('opens with every option unchecked', () => {
    render(<DialogSchImportSettings onImport={() => {}} onCancel={() => {}} />);
    expect(LABELS.map((l) => box(l).checked)).toEqual(LABELS.map(() => false));
  });

  it('Select All checks all but Annotation preferences', () => {
    render(<DialogSchImportSettings onImport={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
    expect(LABELS.map((l) => box(l).checked)).toEqual(
      LABELS.map((l) => l !== 'Annotation preferences'),
    );
  });

  it('OK without a chosen file says File not found. and stays', () => {
    const errors: string[] = [];
    SetErrorPresenter((m) => errors.push(m));
    const onImport = vi.fn();
    render(<DialogSchImportSettings onImport={onImport} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText('Import from'), { target: { value: '/x/y.kicad_pro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import Settings' }));
    expect(errors).toEqual(['File not found.']);
    expect(onImport).not.toHaveBeenCalled();
  });

  it('Browse picks a project file; OK hands its text and the options over', () => {
    let seen: WxFileDialogProps | null = null;
    SetFileDialog((props) => {
      seen = props;
      // biome-ignore lint/correctness/useExhaustiveDependencies: answers once, as a chooser would
      useEffect(() => {
        props.onDone({
          path: '/other/other.kicad_pro',
          text: '{"x":1}',
          bytes: new Uint8Array(),
          rest: [],
        });
      }, []);
      return <div />;
    });
    const onImport = vi.fn();
    render(<DialogSchImportSettings onImport={onImport} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    expect(seen!.title).toBe('Import Settings From');
    expect(seen!.filters!.map((f) => f.extensions)).toEqual([['kicad_pro']]);
    expect((screen.getByLabelText('Import from') as HTMLInputElement).value).toBe(
      '/other/other.kicad_pro',
    );
    fireEvent.click(box('Net classes'));
    fireEvent.click(screen.getByRole('button', { name: 'Import Settings' }));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0]![0]).toBe('{"x":1}');
    expect(onImport.mock.calls[0]![1]).toMatchObject({ netClasses: true, formatting: false });
  });
  it('a path edited after Browse is not the chosen file: File not found.', () => {
    const errors: string[] = [];
    SetErrorPresenter((m) => errors.push(m));
    SetFileDialog((props) => {
      // biome-ignore lint/correctness/useExhaustiveDependencies: answers once, as a chooser would
      useEffect(() => {
        props.onDone({ path: '/a/a.kicad_pro', text: '{}', bytes: new Uint8Array(), rest: [] });
      }, []);
      return <div />;
    });
    const onImport = vi.fn();
    render(<DialogSchImportSettings onImport={onImport} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    fireEvent.change(screen.getByLabelText('Import from'), { target: { value: '/b/b.kicad_pro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import Settings' }));
    expect(errors).toEqual(['File not found.']);
    expect(onImport).not.toHaveBeenCalled();
  });
});
