// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * DIALOG_FIND's window (dialog_find.cpp) on its base: each option box reaching onOptionChanged
 * with its own flag, F3 / Shift+F3 finding again (the char hook), and the three buttons. The
 * search itself is dialog_find.test.ts's.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FIND_OPTIONS,
  type DIALOG_FIND,
  DialogPcbFind,
} from '@ziroeda/pcbnew/dialogs/dialog_find.js';

afterEach(cleanup);

function show() {
  const dialog = {
    m_searchString: '',
    m_options: { ...DEFAULT_FIND_OPTIONS },
    m_status: '',
    GetHistory: () => [],
    SetSearchString: vi.fn(),
    SetOptions: vi.fn(),
    FindNext: vi.fn(),
    OnFindNext: vi.fn(),
    OnFindPrevious: vi.fn(),
    OnSearchAgain: vi.fn(),
    OnShowSearchPanel: vi.fn(),
  };
  render(<DialogPcbFind dialog={dialog as unknown as DIALOG_FIND} onClose={() => {}} />);
  return dialog;
}

describe('DIALOG_FIND window', () => {
  it('each option box sets its own flag', () => {
    const d = show();
    fireEvent.click(screen.getByLabelText('Match case'));
    expect(d.SetOptions).toHaveBeenLastCalledWith({ ...DEFAULT_FIND_OPTIONS, matchCase: true });
    fireEvent.click(screen.getByLabelText('Search net names'));
    expect(d.SetOptions).toHaveBeenLastCalledWith({
      ...DEFAULT_FIND_OPTIONS,
      includeNets: !DEFAULT_FIND_OPTIONS.includeNets,
    });
  });

  it('F3 finds again forwards, Shift+F3 backwards', () => {
    const d = show();
    const entry = screen.getByRole('textbox', { name: 'Search for' });
    fireEvent.keyDown(entry, { key: 'F3' });
    fireEvent.keyDown(entry, { key: 'F3', shiftKey: true });
    expect(d.FindNext.mock.calls).toEqual([[false], [true]]);
  });

  it('the buttons are Find Next, Find Previous and Restart Search', () => {
    const d = show();
    fireEvent.click(screen.getByRole('button', { name: 'Find Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Find Previous' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restart Search' }));
    expect(
      [d.OnFindNext, d.OnFindPrevious, d.OnSearchAgain].map((f) => f.mock.calls.length),
    ).toEqual([1, 1, 1]);
  });
});
