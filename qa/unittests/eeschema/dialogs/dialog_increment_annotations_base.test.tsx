// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_INCREMENT_ANNOTATIONS_BASE has no derived class upstream: the tool reads the members
 * back after ShowModal() == wxID_OK. Here OK writes them into the tool's values, Cancel leaves
 * them alone, and nothing is refused (the .fbp's validator is wxFILTER_NONE).
 */
import { DIALOG_INCREMENT_ANNOTATIONS_BASE } from '@ziroeda/eeschema/dialogs/dialog_increment_annotations_base.js';
import type { INCREMENT_ANNOTATIONS_VALUES } from '@ziroeda/eeschema/tools/sch_editor_control.js';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

const values = (): INCREMENT_ANNOTATIONS_VALUES => ({
  firstRefDes: '',
  allSheets: false,
  increment: 1,
});

describe('DIALOG_INCREMENT_ANNOTATIONS_BASE', () => {
  it('OK writes the three members back into the tool values', () => {
    const v = values();
    const onOk = vi.fn();
    render(<DIALOG_INCREMENT_ANNOTATIONS_BASE values={v} onOk={onOk} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText('Start reference designator'), {
      target: { value: 'R12' },
    });
    fireEvent.click(screen.getByLabelText('All sheets'));
    const spin = screen.getByLabelText('Increment by') as HTMLInputElement;
    fireEvent.change(spin, { target: { value: '5' } });
    fireEvent.blur(spin);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onOk).toHaveBeenCalledTimes(1);
    expect(v).toEqual({ firstRefDes: 'R12', allSheets: true, increment: 5 });
  });

  it('Cancel leaves the tool values untouched', () => {
    const v = values();
    const onCancel = vi.fn();
    render(<DIALOG_INCREMENT_ANNOTATIONS_BASE values={v} onOk={() => {}} onCancel={onCancel} />);
    fireEvent.change(screen.getByLabelText('Start reference designator'), {
      target: { value: 'R12' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(v).toEqual(values());
  });

  it('no validator: an empty reference is accepted, the tool decides (IsSplitNeeded)', () => {
    const v = values();
    const onOk = vi.fn();
    render(<DIALOG_INCREMENT_ANNOTATIONS_BASE values={v} onOk={onOk} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onOk).toHaveBeenCalledTimes(1);
  });

  it('opens on the current sheet, increment 1, and the spin control is 1..64', () => {
    render(
      <DIALOG_INCREMENT_ANNOTATIONS_BASE values={values()} onOk={() => {}} onCancel={() => {}} />,
    );
    expect((screen.getByLabelText('Current sheet only') as HTMLInputElement).checked).toBe(true);
    const spin = screen.getByLabelText('Increment by') as HTMLInputElement;
    expect(spin.value).toBe('1');
    fireEvent.change(spin, { target: { value: '99' } });
    fireEvent.blur(spin);
    expect(spin.value).toBe('64');
  });
});
