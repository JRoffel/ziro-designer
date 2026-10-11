// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_ANNOTATE over its _base (dialog_annotate.cpp): with an info-bar message only "Entire
 * schematic" is disabled, and set; Regroup symbol units follows Reset (OnOptionChanged); the
 * start number is read with ToLong (0 when it does not parse); Close writes the preferences back.
 */
import { DialogAnnotate } from '@ziroeda/eeschema/dialogs/dialog_annotate.js';
import { EESCHEMA_DEFAULTS, type EeschemaSettings } from '@ziroeda/eeschema/eeschema_settings.js';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

function store() {
  const eeschema: EeschemaSettings = structuredClone(EESCHEMA_DEFAULTS);
  return {
    eeschema,
    common: {} as never,
    hotkeys: {},
    updateEeschema: (m: (s: EeschemaSettings) => void) => m(eeschema),
    updateCommon: () => {},
  };
}

function open(aInfo?: string, aScope = 0) {
  const s = store();
  s.eeschema.annotation.scope = aScope;
  const onAnnotate = vi.fn();
  const onClose = vi.fn();
  render(
    <DialogAnnotate
      settings={s}
      initial={{ order: 'x', algo: 'incremental', startNumber: 0 }}
      messages={[]}
      {...(aInfo ? { infoBarMessage: aInfo } : {})}
      onAnnotate={onAnnotate}
      onClear={() => {}}
      onClose={onClose}
    />,
  );
  return { s, onAnnotate, onClose };
}

const radio = (l: string) => screen.getByLabelText(l) as HTMLInputElement;

describe('DIALOG_ANNOTATE', () => {
  it('an info-bar message disables only Entire schematic, and selects it', () => {
    open('Schematic is not fully annotated.');
    expect(screen.getByText('Schematic is not fully annotated.')).toBeTruthy();
    expect([radio('Entire schematic').checked, radio('Entire schematic').disabled]).toEqual([
      true,
      true,
    ]);
    expect(radio('Current sheet only').disabled).toBe(false);
    expect(radio('Selection').disabled).toBe(false);
  });

  it('Regroup symbol units is enabled only with Reset', () => {
    open();
    expect(radio('Regroup symbol units').disabled).toBe(true);
    fireEvent.click(radio('Reset existing annotations'));
    expect(radio('Regroup symbol units').disabled).toBe(false);
  });

  it('Annotate reads the start number with ToLong, 0 when it does not parse', () => {
    const { onAnnotate } = open();
    fireEvent.change(screen.getByLabelText('First free number after'), {
      target: { value: '200' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Annotate' }));
    expect(onAnnotate.mock.calls[0]![0]).toMatchObject({ startNumber: 200, algo: 'incremental' });
    fireEvent.change(screen.getByLabelText('First free number after'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Annotate' }));
    expect(onAnnotate.mock.calls[1]![0]).toMatchObject({ startNumber: 0 });
  });

  it('Close writes the preferences back and hands the project slice over', () => {
    const { s, onClose } = open();
    fireEvent.click(radio('Reset existing annotations'));
    fireEvent.click(radio('Sort symbols by Y position'));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(s.eeschema.annotation.options).toBe(1);
    expect(onClose).toHaveBeenCalledWith({ order: 'y', algo: 'incremental', startNumber: 0 });
  });

  it('a saved scope is read only when Entire schematic is enabled', () => {
    open(undefined, 1);
    expect(radio('Current sheet only').checked).toBe(true);
    cleanup();
    open('Schematic is not fully annotated.', 1);
    expect(radio('Entire schematic').checked).toBe(true);
  });

  it("the message panel's floor is the constructor's 160, not the base's 120", () => {
    open();
    expect(screen.getByTestId('report-panel-view').style.minHeight).toBe('160px');
  });
});
