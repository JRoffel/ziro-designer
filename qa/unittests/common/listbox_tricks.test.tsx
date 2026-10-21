// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `wxListBox` with wxLB_MULTIPLE, `LISTBOX_TRICKS` (common/widgets/listbox_tricks.cpp) over it,
 * and the list widget's multiple selection.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { wxListBox, wxNOT_FOUND } from '@ziroeda/wx/listbox.js';
import { GetClipboardUTF8, SaveClipboard } from '@ziroeda/common/clipboard.js';
import {
  LISTBOX_TRICKS,
  LISTBOX_TRICKS_ID,
  LISTBOX_TRICKS_MENU,
} from '@ziroeda/common/widgets/listbox_tricks.js';
import { WxListBox } from '@ziroeda/common/widgets/wx_listbox.js';

afterEach(cleanup);

const box = (aItems: string[], aSelected: number[] = []): wxListBox => {
  const lb = new wxListBox(true);
  lb.Append(aItems);
  for (const s of aSelected) lb.SetSelection(s);
  return lb;
};

describe('wxListBox', () => {
  it('a multiple box adds to its selection; wxNOT_FOUND clears it; a single one moves', () => {
    const lb = box(['a', 'b', 'c'], [2, 0]);
    expect(lb.GetSelections()).toEqual([0, 2]);
    lb.SetSelection(wxNOT_FOUND);
    expect(lb.GetSelections()).toEqual([]);

    const single = new wxListBox();
    single.Append(['a', 'b']);
    single.SetSelection(0);
    single.SetSelection(1);
    expect(single.GetSelections()).toEqual([1]);
    expect(single.GetSelection()).toBe(1);
  });

  it('Insert and Delete move the selection with the rows', () => {
    const lb = box(['a', 'b', 'c'], [1, 2]);
    lb.Insert('x', 1);
    expect(lb.GetStrings()).toEqual(['a', 'x', 'b', 'c']);
    expect(lb.GetSelections()).toEqual([2, 3]);

    lb.Delete(2);
    expect(lb.GetStrings()).toEqual(['a', 'x', 'c']);
    expect(lb.GetSelections()).toEqual([2]);

    lb.SetString(0, 'A');
    expect(lb.GetString(0)).toBe('A');
    lb.Deselect(2);
    expect(lb.IsSelected(2)).toBe(false);
  });
});

describe('LISTBOX_TRICKS', () => {
  it('Delete removes the selected rows and selects the one before the first', () => {
    const lb = box(['a', 'b', 'c', 'd'], [1, 3]);
    let changed = 0;
    const tricks = new LISTBOX_TRICKS(lb, () => changed++);

    expect(tricks.listBoxDeleteSelected()).toEqual([1, 3]);
    expect(lb.GetStrings()).toEqual(['a', 'c']);
    expect(lb.GetSelections()).toEqual([0]);
    expect(changed).toBe(1);

    // Nothing selected: nothing removed, nothing posted.
    lb.SetSelection(wxNOT_FOUND);
    expect(tricks.listBoxDeleteSelected()).toEqual([]);
    expect(changed).toBe(1);

    // The first row deleted: the new first row is selected.
    lb.SetSelection(0);
    tricks.OnListBoxDelete();
    expect(lb.GetStrings()).toEqual(['c']);
    expect(lb.GetSelections()).toEqual([0]);
  });

  it('Duplicate inserts the selected rows after the last of them, and selects the copies', () => {
    const lb = box(['a', 'b', 'c'], [0, 1]);
    let changed = 0;
    new LISTBOX_TRICKS(lb, () => changed++).listBoxDuplicateSelected();
    expect(lb.GetStrings()).toEqual(['a', 'b', 'a', 'b', 'c']);
    expect(lb.GetSelections()).toEqual([2, 3]);
    expect(changed).toBe(1);
  });

  it('Copy puts each selected row on a line; Paste inserts trimmed lines after the selection', () => {
    const lb = box(['R_*', 'C_*', 'L_*'], [0, 2]);
    const tricks = new LISTBOX_TRICKS(lb);

    tricks.listBoxCopy();
    expect(GetClipboardUTF8()).toBe('R_*\nL_*\n');

    lb.SetSelection(wxNOT_FOUND);
    lb.SetSelection(0);
    SaveClipboard('  SOT*  \n  QFN* \n\n');
    tricks.listBoxPaste();
    expect(lb.GetStrings()).toEqual(['R_*', 'SOT*', 'QFN*', 'C_*', 'L_*']);
    expect(lb.GetSelections()).toEqual([1, 2]);

    // No selection: pasted at the end.
    lb.SetSelection(wxNOT_FOUND);
    SaveClipboard('X');
    tricks.listBoxPaste();
    expect(lb.GetStrings().at(-1)).toBe('X');

    // An empty clipboard pastes nothing.
    SaveClipboard('   ');
    tricks.listBoxPaste();
    expect(lb.GetCount()).toBe(6);
  });

  it('Cut copies, deletes, and selects the row now at the first deleted place', () => {
    const lb = box(['a', 'b', 'c', 'd'], [1, 2]);
    new LISTBOX_TRICKS(lb).listBoxCut();
    expect(GetClipboardUTF8()).toBe('b\nc\n');
    expect(lb.GetStrings()).toEqual(['a', 'd']);
    expect(lb.GetSelections()).toEqual([1]);

    const last = box(['a', 'b'], [1]);
    new LISTBOX_TRICKS(last).listBoxCut();
    expect(last.GetSelections()).toEqual([0]);
  });

  it('the menu and keys reach the same five actions', () => {
    expect(LISTBOX_TRICKS_MENU.map((m) => `${m.label}\t${m.accel}`)).toEqual([
      'Copy\tCtrl+C',
      'Cut\tCtrl+X',
      'Paste\tCtrl+V',
      'Duplicate\tCtrl+D',
      'Delete\tDel',
    ]);

    const lb = box(['a', 'b'], [0]);
    const tricks = new LISTBOX_TRICKS(lb);
    tricks.OnMenu(LISTBOX_TRICKS_ID.ID_DUPLICATE);
    expect(lb.GetStrings()).toEqual(['a', 'a', 'b']);
    tricks.OnMenu(LISTBOX_TRICKS_ID.ID_COPY);
    expect(GetClipboardUTF8()).toBe('a\n');
    tricks.OnMenu(LISTBOX_TRICKS_ID.ID_DELETE);
    expect(lb.GetStrings()).toEqual(['a', 'b']);
    tricks.OnMenu(LISTBOX_TRICKS_ID.ID_PASTE);
    expect(lb.GetStrings()).toEqual(['a', 'a', 'b']);
    tricks.OnMenu(LISTBOX_TRICKS_ID.ID_CUT);
    expect(lb.GetStrings()).toEqual(['a', 'b']);

    expect(tricks.OnListBoxKeyDown('d', true)).toBe(true);
    expect(lb.GetCount()).toBe(3);
    expect(tricks.OnListBoxKeyDown('Delete', false)).toBe(true);
    expect(lb.GetCount()).toBe(2);
    expect(tricks.OnListBoxKeyDown('d', false)).toBe(false);
    expect(tricks.OnListBoxKeyDown('q', true)).toBe(false);
    expect(lb.GetCount()).toBe(2);
    lb.SetSelection(0);
    expect(tricks.OnListBoxKeyDown('c', true)).toBe(true);
    expect(tricks.OnListBoxKeyDown('v', true)).toBe(true);
    expect(tricks.OnListBoxKeyDown('x', true)).toBe(true);
  });
});

describe('WxListBox with wxLB_MULTIPLE', () => {
  function Harness({ onRows }: { onRows: (aRows: number[]) => void }) {
    const [rows, setRows] = useState<number[]>([]);
    return (
      <WxListBox
        items={['a', 'b', 'c', 'd']}
        selection={-1}
        selections={rows}
        onSelectRows={(r) => {
          setRows(r);
          onRows(r);
        }}
        ariaLabel="Filters"
      />
    );
  }

  it('a click selects one row, Ctrl toggles, Shift extends from the last click', () => {
    const seen: number[][] = [];
    render(<Harness onRows={(r) => seen.push(r)} />);

    fireEvent.mouseDown(screen.getByText('b'));
    fireEvent.mouseDown(screen.getByText('d'), { ctrlKey: true });
    fireEvent.mouseDown(screen.getByText('b'), { ctrlKey: true });
    fireEvent.mouseDown(screen.getByText('a'));
    fireEvent.mouseDown(screen.getByText('c'), { shiftKey: true });
    // The anchor stays where the plain click put it.
    fireEvent.mouseDown(screen.getByText('b'), { shiftKey: true });
    fireEvent.mouseDown(screen.getByText('c'), { shiftKey: true });

    expect(seen).toEqual([[1], [1, 3], [3], [0], [0, 1, 2], [0, 1], [0, 1, 2]]);
    expect(screen.getAllByRole('option').map((o) => o.getAttribute('aria-selected'))).toEqual([
      'true',
      'true',
      'true',
      'false',
    ]);
  });
});
