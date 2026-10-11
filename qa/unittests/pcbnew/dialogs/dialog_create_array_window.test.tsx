// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_CREATE_ARRAY's window on its base: OnSelectCenterButton disabling the dialog while the
 * picker runs, the full circle greying the angle, Arrange hiding the annotation box, and OK's
 * wxMessageBox.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pcbIUScale } from '@ziroeda/common/eda_units.js';
import type { VECTOR2I } from '@ziroeda/kimath/src/math/vector2.js';
import {
  DIALOG_CREATE_ARRAY,
  DialogCreateArray,
  ResetCreateArrayOptions,
} from '@ziroeda/pcbnew/dialogs/dialog_create_array.js';

afterEach(cleanup);
beforeEach(() => ResetCreateArrayOptions());

function show() {
  let answer: (aPoint: VECTOR2I | null) => void = () => {};
  const onApply = vi.fn();
  render(
    <DialogCreateArray
      dialog={new DIALOG_CREATE_ARRAY(false, { x: 0, y: 0 })}
      units="mm"
      picker={{
        pickPoint: () =>
          new Promise((resolve) => {
            answer = resolve;
          }),
        pickItem: () => Promise.resolve(null),
      }}
      onApply={onApply}
      onClose={() => {}}
    />,
  );
  return { onApply, answer: (aPoint: VECTOR2I | null) => answer(aPoint) };
}

const textbox = (aName: string) => screen.getByRole('textbox', { name: aName }) as HTMLInputElement;

describe('DIALOG_CREATE_ARRAY window', () => {
  it('Select Point... disables the dialog until the picker answers, then fills the center', async () => {
    const { answer } = show();
    fireEvent.click(screen.getByRole('tab', { name: 'Circular Array' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Point...' }));
    expect(screen.getByRole('dialog').getAttribute('aria-disabled')).toBe('true');
    await act(async () => answer({ x: pcbIUScale.mmToIU(3), y: pcbIUScale.mmToIU(4) }));
    expect(screen.getByRole('dialog').getAttribute('aria-disabled')).toBeNull();
    expect(textbox('Center pos X').value).toBe('3');
    expect(textbox('Center pos Y').value).toBe('4');
  });

  it('Full circle greys the angle and divides the turn by the count', () => {
    show();
    fireEvent.click(screen.getByLabelText('Full circle'));
    expect(textbox('Angle between items').disabled).toBe(true);
    fireEvent.change(textbox('Item count'), { target: { value: '8' } });
    expect(textbox('Angle between items').value).toBe('45');
  });

  it('Arrange selection hides Footprint Annotation', () => {
    show();
    expect(screen.getByText('Footprint Annotation')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Arrange selection'));
    expect(screen.queryByText('Footprint Annotation')).toBeNull();
  });

  it('OK with a bad count says why and creates nothing', () => {
    const { onApply } = show();
    fireEvent.change(textbox('Horizontal count'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByText('Bad numeric value for horizontal count: x')).toBeTruthy();
    expect(onApply).not.toHaveBeenCalled();
  });
});
