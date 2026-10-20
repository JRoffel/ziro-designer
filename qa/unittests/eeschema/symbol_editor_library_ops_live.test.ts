// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * SYMBOL_EDIT_FRAME's library operations (eeschema/symbol_editor/symbol_editor.cpp), live: New
 * Symbol with its dialog and name validator, Delete (with the modified and derived-symbol
 * questions), Copy to the clipboard flattened, Duplicate (from the library and from the clipboard,
 * a derived copy keeping its parent), Revert of a symbol and of a library, Revert All.
 */
import { GetClipboardUTF8, SaveClipboard } from '@ziroeda/common/clipboard.js';
import {
  type KICAD_MESSAGE_DIALOG_ARG,
  SetMessageDialogPresenter,
  SetQuestionPresenter,
} from '@ziroeda/common/confirm.js';
import type { KiDialogRequest } from '@ziroeda/common/kidialog.js';
import type { KiDialogResult } from '@ziroeda/common/kidialog_do_not_show.js';
import { LIB_ID } from '@ziroeda/common/lib_id.js';
import type { NEW_SYMBOL_PROPERTIES } from '@ziroeda/eeschema/symbol_editor/lib_symbol_library_manager.js';
import { wxID_CANCEL, wxID_OK } from '@ziroeda/wx/menu.js';
import { afterEach, describe, expect, it } from 'vitest';
import { type SYMBOL_EDIT_HARNESS, symbolEditHarness } from './support/symbol_edit_harness.js';

const prop = (aName: string, aValue: string) =>
  `(property "${aName}" "${aValue}" (at 0 0 0) (effects (font (size 1.27 1.27))))`;
/** U, and D derived from it. */
const LIB = `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  (symbol "U" (in_bom yes) (on_board yes) ${prop('Reference', 'U')} ${prop('Value', 'U')}
    (symbol "U_1_1" (rectangle (start -5.08 -5.08) (end 5.08 5.08) (stroke (width 0) (type default)) (fill (type none)))))
  (symbol "D" (extends "U") ${prop('Reference', 'U')} ${prop('Value', 'D')}))`;

interface DIALOG_ARG {
  symbolNames?: string[];
  validator?: (aName: string) => Promise<boolean>;
  props?: NEW_SYMBOL_PROPERTIES;
}

let t: SYMBOL_EDIT_HARNESS;
let treeSelection: LIB_ID[] = [];
let treeLibId: LIB_ID | null = null;
let questions: string[] = [];
let questionAnswer = true;
let messages: KICAD_MESSAGE_DIALOG_ARG[] = [];
let messageAnswer = wxID_OK;
let kiAsked: KiDialogRequest[] = [];
let kiAnswer: KiDialogResult = 'ok';
let newSymbol: ((aArg: DIALOG_ARG) => number) | null = null;
let synced = 0;
let modals: string[] = [];
let pickLibrary: string | null = null;

function setUp(aLib = LIB) {
  treeSelection = [];
  treeLibId = null;
  questions = [];
  questionAnswer = true;
  messages = [];
  messageAnswer = wxID_OK;
  kiAsked = [];
  kiAnswer = 'ok';
  newSymbol = null;
  synced = 0;
  modals = [];
  pickLibrary = null;
  SetQuestionPresenter(async (aMessage) => {
    questions.push(aMessage);
    return questionAnswer;
  });
  SetMessageDialogPresenter(async (aArg) => {
    messages.push(aArg);
    return messageAnswer;
  });
  t = symbolEditHarness(aLib, {
    isLibraryTreeShown: () => true,
    getTreeLibId: () => treeLibId,
    getSelectedLibIds: () => treeSelection,
    syncLibraries: () => {
      synced++;
    },
    askKiDialog: async (aRequest) => {
      kiAsked.push(aRequest);
      return kiAnswer;
    },
    showModal: async (aName, _aItems, aArg) => {
      modals.push(aName);

      if (aName === 'EDA_LIST_DIALOG' && pickLibrary !== null) {
        (aArg as { textSelection: string }).textSelection = pickLibrary;
        return wxID_OK;
      }

      return aName === 'DIALOG_LIB_NEW_SYMBOL' && newSymbol
        ? newSymbol(aArg as DIALOG_ARG)
        : wxID_CANCEL;
    },
  });
  t.frame.SetCurLib('mine');
}

afterEach(() => {
  t.dispose();
  SetQuestionPresenter(async () => false);
  SetMessageDialogPresenter(async () => wxID_CANCEL);
  SaveClipboard('');
});

const libMgr = () => t.frame.GetLibManager();
const names = () => {
  const out: string[] = [];
  libMgr().GetSymbolNames('mine', out);
  return out.sort();
};

describe('SYMBOL_EDIT_FRAME::CreateNewSymbol', () => {
  it('makes the symbol the dialog describes in the target library, and loads it', async () => {
    setUp();
    treeLibId = new LIB_ID('mine', '');
    newSymbol = (aArg) => {
      Object.assign(aArg.props!, { name: 'NEW', reference: 'R', unitCount: 2 });
      return wxID_OK;
    };

    await t.frame.CreateNewSymbol();

    expect(names()).toEqual(['D', 'NEW', 'U']);
    expect(t.frame.GetCurSymbol()!.GetName()).toBe('NEW');
    expect(t.frame.GetCurSymbol()!.GetUnitCount()).toBe(2);
    expect(synced).toBe(1);
  });

  it('with no target library, asks for one first - and stops if none is chosen', async () => {
    setUp();
    t.frame.SetCurLib('');
    newSymbol = (aArg) => {
      aArg.props!.name = 'NEW';
      return wxID_OK;
    };

    await t.frame.CreateNewSymbol();
    expect(modals).toEqual(['EDA_LIST_DIALOG']);
    expect(names()).toEqual(['D', 'U']);

    modals = [];
    pickLibrary = 'mine';
    await t.frame.CreateNewSymbol();
    expect(modals).toEqual(['EDA_LIST_DIALOG', 'DIALOG_LIB_NEW_SYMBOL']);
    expect(names()).toEqual(['D', 'NEW', 'U']);
  });

  it('hands the dialog the library names and a validator: no name, or a taken one, is asked about', async () => {
    setUp();
    treeLibId = new LIB_ID('mine', '');
    let arg: DIALOG_ARG = {};
    newSymbol = (aArg) => {
      arg = aArg;
      return wxID_CANCEL;
    };

    await t.frame.CreateNewSymbol();

    expect([...arg.symbolNames!].sort()).toEqual(['D', 'U']);
    expect(await arg.validator!('')).toBe(false);
    expect(messages.map((m) => m.message)).toEqual(['Symbol must have a name.']);
    expect(await arg.validator!('FREE')).toBe(true);

    kiAnswer = 'cancel';
    expect(await arg.validator!('U')).toBe(false);
    expect(kiAsked[0]!.message).toBe("Symbol 'U' already exists in library 'mine'.");
    expect(kiAsked[0]!.labels?.ok).toBe('Overwrite');
    kiAnswer = 'ok';
    expect(await arg.validator!('U')).toBe(true);
    // Cancelled: nothing made.
    expect(names()).toEqual(['D', 'U']);
  });
});

describe('SYMBOL_EDIT_FRAME::DeleteSymbolFromLibrary', () => {
  it('removes the selected symbol, and clears the screen when it is the one shown', async () => {
    setUp();
    await t.frame.LoadSymbol(new LIB_ID('mine', 'D'), 1, 1);
    treeSelection = [new LIB_ID('mine', 'D')];

    await t.frame.DeleteSymbolFromLibrary();

    expect(names()).toEqual(['U']);
    expect(t.frame.GetCurSymbol()).toBeNull();
  });

  it('a modified symbol is removed only if the user says so', async () => {
    setUp();
    await t.frame.LoadSymbol(new LIB_ID('mine', 'D'), 1, 1);
    t.frame.GetCurSymbol()!.SetKeyWords('x');
    t.frame.OnModify();
    treeSelection = [new LIB_ID('mine', 'D')];
    questionAnswer = false;

    await t.frame.DeleteSymbolFromLibrary();

    expect(questions).toEqual([
      "The symbol 'D' has been modified.\nDo you want to remove it from the library?",
    ]);
    expect(names()).toEqual(['D', 'U']);
  });

  it('a base symbol warns that its derived symbols go with it', async () => {
    setUp();
    treeSelection = [new LIB_ID('mine', 'U')];
    messageAnswer = wxID_CANCEL;

    await t.frame.DeleteSymbolFromLibrary();

    expect(messages[0]!.message).toBe(
      'Deleting a base symbol will delete all symbols derived from it.\n\nU (base)\nD\n',
    );
    expect(messages[0]!.okLabel).toBe('Delete All Listed Symbols');
    expect(names()).toEqual(['D', 'U']);

    messageAnswer = wxID_OK;
    await t.frame.DeleteSymbolFromLibrary();
    expect(names()).toEqual([]);
  });
});

describe('SYMBOL_EDIT_FRAME clipboard and duplicate', () => {
  it('Copy puts the tree symbols on the clipboard flattened', () => {
    setUp();
    treeSelection = [new LIB_ID('mine', 'D')];

    t.frame.CopySymbolToClipboard();

    expect(GetClipboardUTF8()).toContain('(symbol "D"');
    expect(GetClipboardUTF8()).not.toContain('extends');
    expect(GetClipboardUTF8()).toContain('rectangle');
  });

  it('Duplicate adds a copy under a unique name and loads it; a derived copy keeps its parent', async () => {
    setUp();
    treeLibId = new LIB_ID('mine', 'D');

    await t.frame.DuplicateSymbol(false);

    expect(names()).toEqual(['D', 'D_1', 'U']);
    expect(t.frame.GetCurSymbol()!.GetName()).toBe('D_1');
    expect(libMgr().GetBufferedSymbol('D_1', 'mine')!.IsDerived()).toBe(true);

    await t.frame.DuplicateSymbol(false);
    expect(names()).toEqual(['D', 'D_1', 'D_2', 'U']);
  });

  it('Paste Symbol duplicates what Copy put on the clipboard', async () => {
    setUp();
    treeSelection = [new LIB_ID('mine', 'U')];
    t.frame.CopySymbolToClipboard();
    treeLibId = new LIB_ID('mine', '');

    await t.frame.DuplicateSymbol(true);

    expect(names()).toEqual(['D', 'U', 'U_1']);
  });
});

describe('SYMBOL_EDIT_FRAME::Revert', () => {
  it('puts the target symbol back to its saved state, after asking', async () => {
    setUp();
    await t.frame.LoadSymbol(new LIB_ID('mine', 'U'), 1, 1);
    t.frame.GetCurSymbol()!.SetKeyWords('edited');
    t.frame.OnModify();
    treeLibId = new LIB_ID('mine', 'U');

    messageAnswer = wxID_CANCEL;
    await t.frame.Revert(true);
    expect(libMgr().GetBufferedSymbol('U', 'mine')!.GetKeyWords()).toBe('edited');
    expect(messages[0]!.message).toBe("Revert 'U' to last version saved?");
    expect(messages[0]!.okLabel).toBe('Revert');

    messageAnswer = wxID_OK;
    await t.frame.Revert(true);
    expect(libMgr().GetBufferedSymbol('U', 'mine')!.GetKeyWords()).toBe('');
    expect(libMgr().IsSymbolModified('U', 'mine')).toBe(false);
    // The symbol shown was the one reverted: reloaded, at its unit.
    expect(t.frame.GetCurSymbol()!.GetKeyWords()).toBe('');
  });

  it('reverting another symbol leaves the one shown alone', async () => {
    setUp();
    await t.frame.LoadSymbol(new LIB_ID('mine', 'U'), 1, 1);
    t.frame.GetCurSymbol()!.SetKeyWords('edited');
    t.frame.OnModify();
    treeLibId = new LIB_ID('mine', 'D');

    await t.frame.Revert(false);

    expect(t.frame.GetCurSymbol()!.GetName()).toBe('U');
    expect(t.frame.GetCurSymbol()!.GetKeyWords()).toBe('edited');
  });

  it('with the library itself the target, reverts the whole library', async () => {
    setUp();
    await t.frame.LoadSymbol(new LIB_ID('mine', 'U'), 1, 1);
    t.frame.GetCurSymbol()!.SetKeyWords('edited');
    t.frame.OnModify();
    treeLibId = new LIB_ID('mine', '');

    await t.frame.Revert(false);

    expect(libMgr().IsLibraryModified('mine')).toBe(false);
    expect(t.frame.GetCurSymbol()!.GetName()).toBe('U');
    expect(t.frame.GetCurSymbol()!.GetKeyWords()).toBe('');
    expect(messages).toEqual([]);
  });

  it('Revert All reverts every library without asking', async () => {
    setUp();
    await t.frame.LoadSymbol(new LIB_ID('mine', 'U'), 1, 1);
    t.frame.GetCurSymbol()!.SetKeyWords('edited');
    t.frame.OnModify();

    await t.frame.RevertAll();

    expect(libMgr().IsLibraryModified('mine')).toBe(false);
    expect(messages).toEqual([]);
  });
});
