// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * DIALOG_UPDATE_SYMBOL_FIELDS (dialog_update_symbol_fields.cpp) on a derived symbol in the live
 * symbol editor: the parent's name, the mandatory rows then the parent's and the symbol's user
 * fields (sorted, all checked), Select All / None, and OK syncing the checked fields from the
 * parent through SyncFieldsFromParent as one undoable commit.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FIELD_T } from '@ziroeda/common/template_fieldnames.js';
import {
  DIALOG_UPDATE_SYMBOL_FIELDS,
  DialogUpdateSymbolFields,
} from '@ziroeda/eeschema/dialogs/dialog_update_symbol_fields.js';
import { wxID_CANCEL, wxID_OK } from '@ziroeda/wx/menu.js';
import { afterEach, describe, expect, it } from 'vitest';
import { type SYMBOL_EDIT_HARNESS, symbolEditHarness } from '../support/symbol_edit_harness.js';

const prop = (aName: string, aValue: string, aHide = false) =>
  `(property "${aName}" "${aValue}" (at 0 0 0) (effects (font (size 1.27 1.27))${aHide ? ' hide' : ''}))`;

/** P{arent}: Value 10k, MPN and Vendor. Ch{ild}: Value 22k, MPN edited, a Note of its own. */
const LIB = `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  (symbol "P" ${prop('Reference', 'R')} ${prop('Value', '10k')} ${prop('MPN', 'X1')} ${prop('Vendor', 'Acme')}
    (symbol "P_1_1" (rectangle (start -1.27 -1.27) (end 1.27 1.27) (stroke (width 0) (type default)) (fill (type none)))))
  (symbol "Ch" (extends "P") ${prop('Reference', 'R')} ${prop('Value', '22k')} ${prop('MPN', 'CHANGED')} ${prop('Note', 'mine')}))`;

let t: SYMBOL_EDIT_HARNESS;
afterEach(() => {
  cleanup();
  t?.dispose();
});

function setUp() {
  t = symbolEditHarness(LIB);
  t.open('Ch');
  const sym = t.frame.GetCurSymbol()!;
  return { sym, dlg: new DIALOG_UPDATE_SYMBOL_FIELDS(t.frame, sym) };
}

const text = (s: ReturnType<typeof setUp>['sym'], aName: string | FIELD_T) =>
  s.GetField(aName)?.GetText() ?? null;

describe('DIALOG_UPDATE_SYMBOL_FIELDS', () => {
  it('lists the mandatory fields, then both symbols user fields in order, all checked', () => {
    const { dlg } = setUp();
    expect(dlg.m_parentSymbolReadOnly).toBe('P');
    expect(dlg.m_fieldsBox.map((r) => r.label)).toEqual([
      'Reference',
      'Value',
      'Footprint',
      'Datasheet',
      'Description',
      'MPN',
      'Note',
      'Vendor',
    ]);
    expect(dlg.m_fieldsBox.every((r) => r.checked)).toBe(true);
    expect([
      dlg.m_removeExtraBox,
      dlg.m_resetEmptyFields,
      dlg.m_resetFieldText,
      dlg.m_resetFieldVisibilities,
      dlg.m_resetFieldEffects,
      dlg.m_resetFieldPositions,
    ]).toEqual([false, false, true, true, true, true]);
  });

  it('Select None / All and a single check', () => {
    const { dlg } = setUp();
    dlg.checkAll(false);
    expect(dlg.m_fieldsBox.some((r) => r.checked)).toBe(false);
    dlg.checkAll(true);
    dlg.CheckField(1, false);
    expect(dlg.m_fieldsBox.map((r) => r.checked)).toEqual([
      true,
      false,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it('OK resets the checked fields from the parent, as one undoable commit', () => {
    const { sym, dlg } = setUp();
    expect(dlg.onOkButtonClicked()).toBe(wxID_OK);
    expect(text(sym, FIELD_T.VALUE)).toBe('10k');
    expect(text(sym, 'MPN')).toBe('X1');
    // Not removed: "Remove fields if not in parent symbol" is off.
    expect(text(sym, 'Note')).toBe('mine');
    expect(t.frame.GetUndoCommandCount()).toBe(1);
  });

  it('an unchecked field keeps its text; the mandatory rows match on canonical names', () => {
    const { sym, dlg } = setUp();
    const valueRow = dlg.m_fieldsBox.findIndex((r) => r.label === 'Value');
    dlg.CheckField(valueRow, false);
    dlg.CheckField(
      dlg.m_fieldsBox.findIndex((r) => r.label === 'MPN'),
      false,
    );
    dlg.onOkButtonClicked();
    expect(text(sym, FIELD_T.VALUE)).toBe('22k');
    expect(text(sym, 'MPN')).toBe('CHANGED');
  });

  it('nothing checked updates nothing', () => {
    const { sym, dlg } = setUp();
    dlg.checkAll(false);
    dlg.onOkButtonClicked();
    expect([text(sym, FIELD_T.VALUE), text(sym, 'MPN')]).toEqual(['22k', 'CHANGED']);
  });

  it('remove extra fields drops the field the parent does not have', () => {
    const { sym, dlg } = setUp();
    dlg.m_removeExtraBox = true;
    dlg.onOkButtonClicked();
    expect(text(sym, 'Note')).toBeNull();
  });

  it('reset text off keeps a field that has text', () => {
    const { sym, dlg } = setUp();
    dlg.m_resetFieldText = false;
    dlg.onOkButtonClicked();
    expect(text(sym, 'MPN')).toBe('CHANGED');
  });
});

describe('DialogUpdateSymbolFields', () => {
  it('draws, and Cancel / OK close with their codes', () => {
    const { dlg } = setUp();
    const closes: number[] = [];
    render(<DialogUpdateSymbolFields dialog={dlg} onClose={(r) => closes.push(r)} />);
    expect(screen.getByDisplayValue('P')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Select None' }));
    expect(dlg.m_fieldsBox.some((r) => r.checked)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(closes).toEqual([wxID_CANCEL, wxID_OK]);
  });
});
