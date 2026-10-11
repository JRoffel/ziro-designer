// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_SCH_FIND over its _base: Find mode hides the replace row and buttons, Find and Replace
 * shows them; the symbol editor hides the four schematic options and the search-panel link;
 * the current-sheet box greys under selection-only; F3 / Shift+F3 find next / previous.
 */
import { DialogSchFind } from '@ziroeda/eeschema/dialogs/dialog_sch_find.js';
import { defaultSearchData } from '@ziroeda/eeschema/tools/sch_find_replace_tool.js';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

function open(over: Partial<Parameters<typeof DialogSchFind>[0]> = {}) {
  const props = {
    frame: 'FRAME_SCH' as const,
    data: defaultSearchData(),
    onChange: vi.fn(),
    onFindNext: vi.fn(),
    onFindPrevious: vi.fn(),
    onClose: () => {},
    onShowSearchPanel: () => {},
    ...over,
  };
  render(<DialogSchFind {...props} />);
  return props;
}

describe('DIALOG_SCH_FIND', () => {
  it('Find: no replace row, option or buttons; the search panel link shows', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Find' })).toBeTruthy();
    expect(screen.queryByLabelText('Replace with')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Replace All' })).toBeNull();
    expect(screen.queryByLabelText('Replace matches in reference designators')).toBeNull();
    expect(screen.getByText(/^Show search panel/)).toBeTruthy();
  });

  it('Find and Replace: the replace row, option and buttons', () => {
    open({ replace: true });
    expect(screen.getByRole('dialog', { name: 'Find and Replace' })).toBeTruthy();
    expect(screen.getByLabelText('Replace with')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Replace All' })).toBeTruthy();
    expect(screen.getByLabelText('Replace matches in reference designators')).toBeTruthy();
  });

  it('the symbol editor hides pins, net names, current sheet and the link', () => {
    open({ frame: 'FRAME_SCH_SYMBOL_EDITOR' });
    expect(screen.queryByLabelText('Search pin names and numbers')).toBeNull();
    expect(screen.queryByLabelText('Search net names')).toBeNull();
    expect(screen.queryByLabelText('Search the current sheet only')).toBeNull();
    expect(screen.queryByText(/^Show search panel/)).toBeNull();
    expect(screen.getByLabelText('Include hidden fields')).toBeTruthy();
  });

  it('the current-sheet box greys under selection-only', () => {
    open({ data: { ...defaultSearchData(), searchSelectedOnly: true } });
    expect(
      (screen.getByLabelText('Search the current sheet only') as HTMLInputElement).disabled,
    ).toBe(true);
  });

  it('F3 finds next, Shift+F3 previous', () => {
    const p = open();
    fireEvent.keyDown(screen.getByLabelText('Search for'), { key: 'F3' });
    fireEvent.keyDown(screen.getByLabelText('Search for'), { key: 'F3', shiftKey: true });
    expect(p.onFindNext).toHaveBeenCalledTimes(1);
    expect(p.onFindPrevious).toHaveBeenCalledTimes(1);
  });
});
