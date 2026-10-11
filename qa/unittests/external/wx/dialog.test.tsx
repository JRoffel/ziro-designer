// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * wxDialog's wxEVT_CHAR_HOOK: the window sees a key before the focused control does, even a
 * control that stops the key's propagation; a key the hook consumes never reaches the control.
 */
import { Dialog } from '@ziroeda/wx/dialog.js';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

describe('wxDialog char hook', () => {
  it('sees a key from a control that stops its propagation', () => {
    const hook = vi.fn();
    render(
      <Dialog title="T" onClose={() => {}} onCharHook={hook}>
        <input aria-label="entry" onKeyDown={(e) => e.stopPropagation()} />
      </Dialog>,
    );
    fireEvent.keyDown(screen.getByLabelText('entry'), { key: 'F3' });
    expect(hook).toHaveBeenCalledTimes(1);
  });

  it('a key it consumes goes no further', () => {
    const control = vi.fn();
    render(
      <Dialog title="T" onClose={() => {}} onCharHook={(e) => e.key === 'F3' && e.preventDefault()}>
        <input aria-label="entry" onKeyDown={control} />
      </Dialog>,
    );
    fireEvent.keyDown(screen.getByLabelText('entry'), { key: 'F3' });
    fireEvent.keyDown(screen.getByLabelText('entry'), { key: 'a' });
    expect(control).toHaveBeenCalledTimes(1);
  });
});
