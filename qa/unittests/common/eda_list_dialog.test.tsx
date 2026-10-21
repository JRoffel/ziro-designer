// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `EDA_LIST_DIALOG` with `SAVE_AS_DIALOG`'s additions
 * (`pcbnew/footprint_libraries_utils.cpp:995-1055`): a Name row whose
 * validator excludes the characters a footprint name may not hold, and an
 * OK button labelled Save. OK answers the selected row and the trimmed name.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  EDA_LIST_DIALOG,
  type EdaListExtras,
  EdaListDialog,
} from '@ziroeda/common/dialogs/eda_list_dialog.js';

afterEach(cleanup);

describe('EdaListDialog as SAVE_AS_DIALOG', () => {
  it('answers the library and the name, the excluded characters never typed', () => {
    const answers: [string | null, string | undefined][] = [];
    const { container } = render(
      <EdaListDialog
        title="Save Footprint As"
        listLabel="Save in library:"
        okLabel="Save"
        headers={['Nickname', 'Description']}
        rows={[
          { value: 'A', cells: ['A', ''] },
          { value: 'B', cells: ['B', ''] },
        ]}
        initialValue="B"
        nameRow={{ label: 'Name:', value: 'R', excludeChars: '/:' }}
        onResult={(aLib, aName) => answers.push([aLib, aName])}
      />,
    );

    const name = screen.getByLabelText('Name') as HTMLInputElement;
    fireEvent.change(name, { target: { value: ' R/0805: ' } });
    expect(name.value).toBe(' R0805 ');

    const save = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Save',
    )!;
    fireEvent.click(save);

    expect(answers).toEqual([['B', 'R0805']]);
  });

  it('without a name row it answers the row alone, under OK', () => {
    const answers: [string | null, string | undefined][] = [];
    const { container } = render(
      <EdaListDialog
        title="Pick"
        headers={['Item']}
        rows={[{ value: 'x', cells: ['x'] }]}
        onResult={(aValue, aName) => answers.push([aValue, aName])}
      />,
    );

    expect(screen.queryByLabelText('Name')).toBeNull();
    // Nothing is preselected without aPreselectText: OK answers nothing until a row is chosen.
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'OK')!,
    );
    fireEvent.click(screen.getByText('x'));
    fireEvent.click(
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'OK')!,
    );
    expect(answers).toEqual([
      [null, undefined],
      ['x', undefined],
    ]);
  });
});

describe('EDA_LIST_DIALOG', () => {
  const rows = ['R10', 'r2', 'C1', 'R1'].map((n) => ({ value: n, cells: [n, `${n} desc`] }));

  it('filters on the first column with *text*, case-folded, and sorts by StrNumCmp when asked', () => {
    const dlg = new EDA_LIST_DIALOG(rows, true);
    expect(dlg.Rows().map((r) => r.value)).toEqual(['C1', 'R1', 'r2', 'R10']);

    dlg.m_filter = 'R1';
    expect(dlg.Rows().map((r) => r.value)).toEqual(['R1', 'R10']);
    dlg.m_filter = '0';
    expect(dlg.Rows().map((r) => r.value)).toEqual(['R10']);
    dlg.m_filter = 'desc';
    expect(dlg.Rows()).toEqual([]);

    const unsorted = new EDA_LIST_DIALOG(rows, false);
    expect(unsorted.Rows().map((r) => r.value)).toEqual(['R10', 'r2', 'C1', 'R1']);
  });

  it('FindItem matches the whole first column, case ignored', () => {
    const pinned = [
      { value: 'Device', cells: ['☆ Device', ''] },
      { value: 'Power', cells: ['Power', ''] },
    ];
    const dlg = new EDA_LIST_DIALOG(pinned, false);
    // listctrl_finditem_probe: exact Power=1 lower power=1 pinned Device=-1 partial Pow=-1.
    expect(dlg.FindItem('Power')).toBe('Power');
    expect(dlg.FindItem('power')).toBe('Power');
    expect(dlg.FindItem('Device')).toBeNull();
    expect(dlg.FindItem('☆ Device')).toBe('Device');
    expect(dlg.FindItem('Pow')).toBeNull();
  });

  it('sizes the list by its column count, and splits two columns 42 : 58', () => {
    expect(EDA_LIST_DIALOG.ListMinSize(1)).toEqual([260, 200]);
    expect(EDA_LIST_DIALOG.ListMinSize(2)).toEqual([600, 200]);
    expect(EDA_LIST_DIALOG.ColumnWidths(1, 300)).toEqual([300]);
    expect(EDA_LIST_DIALOG.ColumnWidths(2, 500)).toEqual([210, 290]);
  });
});

describe('EdaListDialog extras', () => {
  it('answers its extra checkboxes, and its extra button by id', () => {
    const answers: [string | null, EdaListExtras | undefined][] = [];
    render(
      <EdaListDialog
        title="Pick"
        headers={['Library', 'Description']}
        rows={[{ value: 'L', cells: ['L', ''] }]}
        initialValue="L"
        showFilter
        extraCheckboxes={[
          { label: 'Flatten', value: false },
          { label: 'Keep', value: true },
        ]}
        extraButton={{ id: 6000, label: 'New Library...' }}
        onResult={(aValue, _aName, aExtras) => answers.push([aValue, aExtras])}
      />,
    );

    fireEvent.click(screen.getByLabelText('Flatten'));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    fireEvent.click(screen.getByRole('button', { name: 'New Library...' }));

    expect(answers).toEqual([
      ['L', { checkboxes: [true, true] }],
      [null, { checkboxes: [true, true], button: 6000 }],
    ]);
    // The filter box is there, and typing in it drops the selection with the rebuilt list.
    expect(screen.getByLabelText('Filter')).toBeTruthy();
  });

  it('a TransferDataFromWindow that refuses keeps the dialog up', async () => {
    const answers: (string | null)[] = [];
    let accept = false;
    render(
      <EdaListDialog
        title="Pick"
        headers={['Item']}
        rows={[{ value: 'x', cells: ['x'] }]}
        initialValue="x"
        transferDataFromWindow={async () => accept}
        onResult={(aValue) => answers.push(aValue)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(answers).toEqual([]);

    accept = true;
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(answers).toEqual(['x']));
  });
});

describe('EdaListDialog answers', () => {
  const rows = [
    { value: 'x', cells: ['x'] },
    { value: 'y', cells: ['y'] },
  ];

  it('Cancel answers null; a preselect naming no row selects nothing', () => {
    const answers: (string | null)[] = [];
    render(
      <EdaListDialog
        title="Pick"
        headers={['Item']}
        rows={rows}
        initialValue="z"
        onResult={(aValue) => answers.push(aValue)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(answers).toEqual([null, null]);
  });

  it('typing in the filter rebuilds the list, and the selection goes with it', () => {
    const answers: (string | null)[] = [];
    render(
      <EdaListDialog
        title="Pick"
        headers={['Item']}
        rows={rows}
        initialValue="x"
        showFilter
        onResult={(aValue) => answers.push(aValue)}
      />,
    );

    const filter = screen.getByLabelText('Filter');
    fireEvent.change(filter, { target: { value: 'q' } });
    fireEvent.change(filter, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(answers).toEqual([null]);
  });

  it('double-clicking a row is OK on that row', async () => {
    const answers: (string | null)[] = [];
    render(
      <EdaListDialog
        title="Pick"
        headers={['Item']}
        rows={rows}
        initialValue="x"
        onResult={(aValue) => answers.push(aValue)}
      />,
    );

    fireEvent.doubleClick(screen.getByText('y'));
    await waitFor(() => expect(answers).toEqual(['y']));
  });
});

describe('EdaListDialog preselect', () => {
  it('selects the row FindItem names, so OK answers it at once', () => {
    const answers: (string | null)[] = [];
    render(
      <EdaListDialog
        title="Pick"
        headers={['Library']}
        rows={[
          { value: 'a', cells: ['Alpha'] },
          { value: 'b', cells: ['Beta'] },
        ]}
        preselectText="beta"
        onResult={(aValue) => answers.push(aValue)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(answers).toEqual(['b']);
  });
});
