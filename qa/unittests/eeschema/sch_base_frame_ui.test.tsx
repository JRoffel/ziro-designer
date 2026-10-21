// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The windows of SCH_BASE_FRAME::SelectLibrary's EDA_LIST_DIALOG (sch_base_frame.cpp:715) and of
 * SAVE_SYMBOL_AS_DIALOG (symbol_editor.cpp:774): what each fills in and the id it closes with.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { wxID_CANCEL, wxID_HIGHEST, wxID_OK } from '@ziroeda/wx/menu.js';
import type { EDA_LIST_DIALOG_ARG } from '@ziroeda/eeschema/sch_base_frame.js';
import { LibraryRowValue, SelectLibraryDialog } from '@ziroeda/eeschema/sch_base_frame_ui.js';
import {
  CONFLICT_STRATEGY,
  SAVE_AS_IDS,
  SAVE_SYMBOL_AS_DIALOG,
  type SAVE_SYMBOL_AS_PARAMS,
} from '@ziroeda/eeschema/symbol_editor/symbol_editor.js';
import type { SYMBOL_EDIT_FRAME } from '@ziroeda/eeschema/symbol_editor/symbol_edit_frame.js';
import { SaveSymbolAsDialog } from '@ziroeda/eeschema/symbol_editor/symbol_editor_ui.js';

afterEach(cleanup);

const ITEMS: [string, string][] = [
  ['☆ Pinned', 'a pinned library'],
  ['Device', 'devices'],
  ['Power', 'power symbols'],
];

const arg = (aSelection: string): EDA_LIST_DIALOG_ARG => ({
  title: 'Select Symbol Library',
  headers: ['Library', 'Description'],
  items: ITEMS,
  selection: aSelection,
  sortList: false,
  listLabel: 'Library:',
  extraCheckboxes: [{ label: 'Flatten', value: false }],
  extraButton: { id: wxID_HIGHEST, label: 'New Library...' },
  textSelection: '',
});

describe('SelectLibraryDialog', () => {
  it('GetTextSelection takes the pinning symbol off a pinned row', () => {
    expect(LibraryRowValue('☆ Pinned')).toBe('Pinned');
    expect(LibraryRowValue('Device')).toBe('Device');
  });

  it('OK fills the selection and the checkboxes and closes with wxID_OK', () => {
    const a = arg('device');
    const ids: number[] = [];
    render(<SelectLibraryDialog arg={a} onClose={(id) => ids.push(id)} />);

    // The list keeps the items' order (aSortList false) and the starred text.
    expect(
      [...screen.getByRole('list', { name: 'Library:' }).querySelectorAll('[role=listitem]')].map(
        (r) => r.firstChild?.textContent,
      ),
    ).toEqual(['☆ Pinned', 'Device', 'Power']);

    fireEvent.click(screen.getByLabelText('Flatten'));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));

    expect(ids).toEqual([wxID_OK]);
    expect(a.textSelection).toBe('Device');
    expect(a.extraCheckboxes[0]!.value).toBe(true);
  });

  it('OK with no row selected is still wxID_OK, with an empty selection', () => {
    const a = arg('Missing');
    const ids: number[] = [];
    render(<SelectLibraryDialog arg={a} onClose={(id) => ids.push(id)} />);

    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(ids).toEqual([wxID_OK]);
    expect(a.textSelection).toBe('');
  });

  it('a pinned row answers its bare name', () => {
    const a = arg('');
    const ids: number[] = [];
    render(<SelectLibraryDialog arg={a} onClose={(id) => ids.push(id)} />);

    fireEvent.click(screen.getByText('☆ Pinned'));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(a.textSelection).toBe('Pinned');
  });

  it('Cancel closes with wxID_CANCEL and New Library... with its id, touching nothing', () => {
    const a = arg('Power');
    const ids: number[] = [];
    render(<SelectLibraryDialog arg={a} onClose={(id) => ids.push(id)} />);

    fireEvent.click(screen.getByLabelText('Flatten'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'New Library...' }));

    expect(ids).toEqual([wxID_CANCEL, wxID_HIGHEST]);
    expect(a.textSelection).toBe('');
    expect(a.extraCheckboxes[0]!.value).toBe(false);
  });
});

describe('SaveSymbolAsDialog', () => {
  const frame = {
    GetLibraryItemsForListDialog: () => ({ headers: ['Library', 'Description'], items: ITEMS }),
  } as unknown as SYMBOL_EDIT_FRAME;

  const params = (): SAVE_SYMBOL_AS_PARAMS => ({
    m_SymbolName: 'R{slash}x',
    m_LibraryName: 'Power',
    m_FlattenSymbol: false,
    m_ConflictStrategy: CONFLICT_STRATEGY.OVERWRITE,
  });

  it('shows the unescaped name, saves to the chosen library, escaped and underscored', async () => {
    const p = params();
    const seen: [string, string, boolean][] = [];
    const dlg = new SAVE_SYMBOL_AS_DIALOG(
      frame,
      p,
      async (aLib, aName, aFlatten) => {
        seen.push([aLib, aName, aFlatten]);
        return SAVE_AS_IDS.ID_RENAME_CONFLICTS;
      },
      ['Base'],
    );
    const ids: number[] = [];
    render(<SaveSymbolAsDialog dlg={dlg} onClose={(id) => ids.push(id)} />);

    const name = screen.getByLabelText('Name') as HTMLInputElement;
    expect(name.value).toBe('R/x');
    expect(document.activeElement).toBe(name);

    fireEvent.change(name, { target: { value: ' my part:1 ' } });
    fireEvent.click(screen.getByText('Device'));
    fireEvent.click(screen.getByLabelText(/^Flatten\/remove symbol inheritance/));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(ids).toEqual([wxID_OK]));
    expect(seen).toEqual([['Device', 'my_part{colon}1', true]]);
    expect(p).toMatchObject({
      m_SymbolName: 'my_part{colon}1',
      m_LibraryName: 'Device',
      m_FlattenSymbol: true,
      m_ConflictStrategy: CONFLICT_STRATEGY.RENAME,
    });
  });

  it('a validator that cancels keeps the dialog up; no parents, no flatten box', async () => {
    let answer: number = wxID_CANCEL;
    const dlg = new SAVE_SYMBOL_AS_DIALOG(frame, params(), async () => answer, []);
    const ids: number[] = [];
    render(<SaveSymbolAsDialog dlg={dlg} onClose={(id) => ids.push(id)} />);

    expect(screen.queryByLabelText(/^Flatten/)).toBeNull();
    // initDialog preselects m_LibraryName.
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(ids).toEqual([]);

    answer = wxID_OK;
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(ids).toEqual([wxID_OK]));
    expect(dlg.m_params.m_LibraryName).toBe('Power');

    fireEvent.click(screen.getByRole('button', { name: 'New Library...' }));
    expect(ids).toEqual([wxID_OK, SAVE_AS_IDS.ID_MAKE_NEW_LIBRARY]);
  });
});
