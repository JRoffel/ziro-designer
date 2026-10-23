// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `SYMBOL_EDIT_FRAME::SetCurSymbol` (symbol_edit_frame.cpp:939-1100) beyond the canvas: the tree
 * selects the symbol, the properties panel refreshes, and the infobar says what can and cannot
 * be done with it - a derived symbol, a read-only library - with its links. All three were
 * missing: the Properties pane stayed empty until the first edit, and the infobar said nothing.
 */
import type { WX_INFOBAR_HYPERLINK } from '@ziroeda/common/eda_base_frame.js';
import type { KiDialogRequest } from '@ziroeda/common/kidialog.js';
import type { LIB_ID } from '@ziroeda/common/lib_id.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LIB_TEXT,
  type SYMBOL_EDIT_HARNESS,
  symbolEditHarness,
} from './support/symbol_edit_harness.js';

/** "U" plus "V", derived from it. */
const LIB = LIB_TEXT.replace(
  /\)$/,
  `  (symbol "V" (extends "U")
    (property "Reference" "U" (at 0 0 0) (effects (font (size 1.27 1.27))))
    (property "Value" "V" (at 0 0 0) (effects (font (size 1.27 1.27)))))
)`,
);

let t: SYMBOL_EDIT_HARNESS;
let bar: { message: string | null; flags: string | null; buttons: WX_INFOBAR_HYPERLINK[] };
let selected: string[];
let unselected: number;
let updates: number;
let asked: KiDialogRequest[];

beforeEach(() => {
  selected = [];
  unselected = 0;
  updates = 0;
  asked = [];
  t = symbolEditHarness(LIB, {
    libTreeSelectLibId: (aLibId: LIB_ID) => selected.push(aLibId.Format()),
    libTreeUnselect: () => unselected++,
    askKiDialog: async (aRequest) => {
      asked.push(aRequest);
      return 'cancel';
    },
  });
  let buttons: WX_INFOBAR_HYPERLINK[] = [];
  bar = { message: null, flags: null, buttons: [] };
  t.frame.SetInfoBar({
    IsLocked: () => false,
    AddButton: (b) => {
      buttons.push(b);
    },
    RemoveAllButtons: () => {
      buttons = [];
    },
    ShowMessage: (m, f) => {
      bar = { message: m, flags: f ?? null, buttons: [...buttons] };
    },
    ShowMessageFor: () => {},
    Dismiss: () => {
      bar = { message: null, flags: null, buttons: [] };
    },
  });
  t.frame.SetPropertiesPanel({ IsShownOnScreen: () => true, UpdateData: () => updates++ });
  t.frame.SetCurLib('mine');
});

afterEach(() => t.dispose());

describe('the tree and the properties panel', () => {
  it('selects the symbol in the tree and refreshes the panel', () => {
    expect(t.frame.LoadSymbolFromCurrentLib('U', 1, 1)).toBe(true);
    expect(selected).toEqual(['mine:U']);
    expect(updates).toBeGreaterThan(0);
  });

  it('unselects the tree when no symbol is current', () => {
    t.frame.SetCurSymbol(null, false);
    expect(unselected).toBe(1);
  });
});

describe('the infobar', () => {
  it('says nothing for a writable library’s own symbol, and takes down what the last one said', () => {
    t.frame.LoadSymbolFromCurrentLib('V', 1, 1);
    expect(bar.message).not.toBeNull();
    t.frame.LoadSymbolFromCurrentLib('U', 1, 1);
    expect(bar.message).toBeNull();
  });

  it('a derived symbol: its graphics are not editable, and its root opens from the link', () => {
    t.frame.LoadSymbolFromCurrentLib('V', 1, 1);
    expect(bar.message).toBe('Symbol V is a derived symbol. Symbol graphics will not be editable.');
    expect(bar.buttons.map((b) => b.label)).toEqual(['Open U']);
    bar.buttons[0]!.onClick();
    expect(t.frame.GetCurSymbol()!.GetName()).toBe('U');
  });

  it('a read-only library: saving is refused, and a copy is offered with upstream’s labels', async () => {
    t.fs.ReadOnly = true;
    t.frame.LoadSymbolFromCurrentLib('U', 1, 1);
    expect(bar.message).toBe('Library is read-only.  Changes cannot be saved to this library.');
    expect(bar.buttons.map((b) => b.label)).toEqual(['Create an editable copy']);
    bar.buttons[0]!.onClick();
    await new Promise((r) => setTimeout(r, 0));
    expect(asked.map((a) => [a.caption, a.yesNo])).toEqual([
      ['Select type of item to save', { yes: 'Copy symbol', no: 'Cancel', cancel: 'Copy library' }],
    ]);
  });

  it('a derived symbol in a read-only library says both, one per line', () => {
    t.fs.ReadOnly = true;
    t.frame.LoadSymbolFromCurrentLib('V', 1, 1);
    expect(bar.message!.split('\n')).toHaveLength(2);
    expect(bar.buttons.map((b) => b.label)).toEqual(['Open U', 'Create an editable copy']);
  });
});
