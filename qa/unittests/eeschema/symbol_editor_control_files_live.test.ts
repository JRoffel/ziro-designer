// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * SYMBOL_EDITOR_CONTROL's file and library commands (eeschema/tools/symbol_editor_control.cpp),
 * run as actions on the symbol editor's frame: New / Derive Symbol, Edit Symbol from the tree,
 * Edit Library Symbol from a schematic copy, Save / Save All, Revert, Cut / Copy / Delete,
 * Duplicate and Paste - and the infobar errors that refuse a missing or read-only library.
 */
import { GetClipboardUTF8, SaveClipboard } from '@ziroeda/common/clipboard.js';
import { SetErrorPresenter, SetMessageDialogPresenter } from '@ziroeda/common/confirm.js';
import { FRAME_T } from '@ziroeda/common/frame_type.js';
import { KIWAY } from '@ziroeda/common/kiway.js';
import { LIB_ID } from '@ziroeda/common/lib_id.js';
import { SetRenameDialogPresenter } from '@ziroeda/common/tool/library_editor_control.js';
import { ACTIONS } from '@ziroeda/common/tool/actions.js';
import type { TOOL_ACTION } from '@ziroeda/common/tool/tool_action.js';
import { TA_NONE, TC_MESSAGE, TOOL_EVENT } from '@ziroeda/common/tool/tool_event.js';
import type { NEW_SYMBOL_PROPERTIES } from '@ziroeda/eeschema/symbol_editor/lib_symbol_library_manager.js';
import { SCH_SCREEN } from '@ziroeda/eeschema/sch_screen.js';
import { SCH_SHEET_PATH } from '@ziroeda/eeschema/sch_sheet_path.js';
import type { SCH_SYMBOL } from '@ziroeda/eeschema/sch_symbol.js';
import { type PLACE_SYMBOL_PARAMS, SCH_ACTIONS } from '@ziroeda/eeschema/tools/sch_actions.js';
import { wxID_CANCEL, wxID_OK } from '@ziroeda/wx/menu.js';
import { afterEach, describe, expect, it } from 'vitest';
import { type SYMBOL_EDIT_HARNESS, symbolEditHarness } from './support/symbol_edit_harness.js';

const prop = (aName: string, aValue: string) =>
  `(property "${aName}" "${aValue}" (at 0 0 0) (effects (font (size 1.27 1.27))))`;
/** U with two units, and D derived from it. */
const LIB = `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  (symbol "U" (in_bom yes) (on_board yes) ${prop('Reference', 'U')} ${prop('Value', 'U')}
    (symbol "U_1_1" (rectangle (start -5.08 -5.08) (end 5.08 5.08) (stroke (width 0) (type default)) (fill (type none))))
    (symbol "U_2_1" (rectangle (start -2.54 -2.54) (end 2.54 2.54) (stroke (width 0) (type default)) (fill (type none)))))
  (symbol "D" (extends "U") ${prop('Reference', 'U')} ${prop('Value', 'D')}))`;

let t: SYMBOL_EDIT_HARNESS;
let treeLibId: LIB_ID | null = null;
let treeUnit = 0;
let treeSelection: LIB_ID[] = [];
let treeShown = false;
let treeToggled = 0;
let infoErrors: string[] = [];
let newSymbolName = '';
let dialogs: string[] = [];

let kiAnswer: 'ok' | 'cancel' = 'ok';
let kiAsked: string[] = [];
let boxes: string[] = [];
/** What the user types into each RENAME_DIALOG, in order; null cancels. */
let renames: (string | null)[] = [];

function setUp(aLib = LIB) {
  kiAnswer = 'ok';
  kiAsked = [];
  boxes = [];
  renames = [];
  // The window's wxTextEntryDialog: OK re-runs the validator until it accepts, or Cancel.
  SetRenameDialogPresenter(async (aDialog) => {
    for (;;) {
      const typed = renames.shift() ?? null;

      if (typed === null) return false;

      if (await aDialog.TransferDataFromWindow(typed)) return true;
    }
  });
  treeLibId = null;
  treeUnit = 0;
  treeSelection = [];
  // The tree is shown, so GetTargetLibId() reads it.
  treeShown = true;
  treeToggled = 0;
  infoErrors = [];
  newSymbolName = '';
  dialogs = [];
  SetMessageDialogPresenter(async () => wxID_OK);
  t = symbolEditHarness(aLib, {
    askKiDialog: async (aRequest) => {
      kiAsked.push(aRequest.message);
      return kiAnswer;
    },
    getTreeLibId: (aUnit) => {
      if (aUnit) aUnit.value = treeUnit;
      return treeLibId;
    },
    getSelectedLibIds: () => treeSelection,
    isLibraryTreeShown: () => treeShown,
    toggleLibraryTree: () => {
      treeToggled++;
    },
    showModal: async (aName, _aItems, aArg) => {
      dialogs.push(aName);

      if (aName === 'wxMessageBox') boxes.push((aArg as { message: string }).message);

      if (aName !== 'DIALOG_LIB_NEW_SYMBOL' || newSymbolName === '') return wxID_CANCEL;

      (aArg as { props: NEW_SYMBOL_PROPERTIES }).props.name = newSymbolName;
      return wxID_OK;
    },
  });
  t.frame.SetCurLib('mine');
  t.frame.ShowInfoBarError = (aMsg: string) => {
    infoErrors.push(aMsg);
  };
}

afterEach(() => {
  t.dispose();
  SetMessageDialogPresenter(async () => wxID_CANCEL);
  SetRenameDialogPresenter(null);
  SaveClipboard('');
});

const mgr = () => t.frame.GetToolManager()!;
const libMgr = () => t.frame.GetLibManager();
const names = () => {
  const out: string[] = [];
  libMgr().GetSymbolNames('mine', out);
  return out.sort();
};

/** Runs \a aAction and lets its coroutine finish whatever it waited on. */
async function run(aAction: TOOL_ACTION) {
  mgr().RunAction(aAction);

  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 0));
    mgr().ProcessEvent(new TOOL_EVENT(TC_MESSAGE, TA_NONE, 'test.flush'));
  }
}

describe('SYMBOL_EDITOR_CONTROL::AddSymbol', () => {
  it('New Symbol makes a symbol in the target library', async () => {
    setUp();
    treeLibId = new LIB_ID('mine', '');
    newSymbolName = 'NEW';

    await run(SCH_ACTIONS.newSymbol);

    expect(names()).toEqual(['D', 'NEW', 'U']);
    expect(t.frame.GetCurSymbol()!.GetName()).toBe('NEW');
  });

  it('Derive from Existing Symbol hands the dialog the target symbol as the parent', async () => {
    setUp();
    treeLibId = new LIB_ID('mine', 'U');
    newSymbolName = 'KID';

    await run(SCH_ACTIONS.deriveFromExistingSymbol);

    expect(libMgr().GetBufferedSymbol('KID', 'mine')!.IsDerived()).toBe(true);
  });

  it('refuses with no library, a missing one, or a read-only one', async () => {
    setUp();
    t.frame.SetCurLib('');
    await run(SCH_ACTIONS.newSymbol);

    treeLibId = new LIB_ID('nowhere', '');
    await run(SCH_ACTIONS.newSymbol);

    // The sexpr plugin asks the file system whether the file is writable: a read-only library.
    treeLibId = new LIB_ID('mine', '');
    libMgr().IsLibraryReadOnly = (aLib: string) => aLib === 'mine';
    await run(SCH_ACTIONS.newSymbol);

    expect(infoErrors).toEqual([
      'No symbol library selected.',
      "Symbol library 'nowhere' not found.",
      "Symbol library 'mine' is not writable.",
    ]);
    expect(dialogs).toEqual([]);
  });
});

describe('SYMBOL_EDITOR_CONTROL edit commands', () => {
  it('Edit Symbol loads the tree selection at its unit', async () => {
    setUp();
    treeLibId = new LIB_ID('mine', 'U');
    treeUnit = 2;

    await run(SCH_ACTIONS.editSymbol);

    expect(t.frame.GetCurSymbol()!.GetName()).toBe('U');
    expect(t.frame.GetUnit()).toBe(2);
  });

  it('Edit Library Symbol does nothing unless the symbol came from a schematic', async () => {
    setUp();
    await t.frame.LoadSymbol(new LIB_ID('mine', 'U'), 1, 1);
    treeShown = false;

    await run(SCH_ACTIONS.editLibSymbolWithLibEdit);

    expect(t.frame.IsSymbolFromSchematic()).toBe(false);
    expect(treeToggled).toBe(0);
  });

  it('Edit Library Symbol from a schematic copy loads the library one and shows the tree', async () => {
    setUp();
    await t.frame.LoadSymbol(new LIB_ID('mine', 'U'), 2, 1);
    t.frame.SetSymbolOrigin(true, false);
    treeShown = false;

    await run(SCH_ACTIONS.editLibSymbolWithLibEdit);

    expect(t.frame.IsSymbolFromSchematic()).toBe(false);
    expect(t.frame.GetUnit()).toBe(2);
    expect(treeToggled).toBe(1);
  });
});

describe('SYMBOL_EDITOR_CONTROL save and revert', () => {
  it('Save and Save All write the library', async () => {
    setUp();
    await t.frame.LoadSymbol(new LIB_ID('mine', 'U'), 1, 1);
    t.frame.GetCurSymbol()!.SetKeyWords('kw1');
    t.frame.OnModify();

    await run(ACTIONS.save);
    expect(new TextDecoder().decode(t.fs.Read('mine.kicad_sym')!)).toContain('kw1');

    t.frame.GetCurSymbol()!.SetKeyWords('kw2');
    t.frame.OnModify();
    await run(ACTIONS.saveAll);
    expect(new TextDecoder().decode(t.fs.Read('mine.kicad_sym')!)).toContain('kw2');
    expect(libMgr().IsLibraryModified('mine')).toBe(false);
  });

  it('Revert puts the target symbol back', async () => {
    setUp();
    await t.frame.LoadSymbol(new LIB_ID('mine', 'U'), 1, 1);
    t.frame.GetCurSymbol()!.SetKeyWords('edited');
    t.frame.OnModify();
    treeLibId = new LIB_ID('mine', 'U');

    await run(ACTIONS.revert);

    expect(libMgr().GetBufferedSymbol('U', 'mine')!.GetKeyWords()).toBe('');
  });
});

describe('SYMBOL_EDITOR_CONTROL::CutCopyDelete and DuplicateSymbol', () => {
  it('Copy copies without deleting; Cut copies and deletes; Delete only deletes', async () => {
    setUp();
    treeSelection = [new LIB_ID('mine', 'D')];

    await run(SCH_ACTIONS.copySymbol);
    expect(GetClipboardUTF8()).toContain('(symbol "D"');
    expect(names()).toEqual(['D', 'U']);

    SaveClipboard('');
    await run(SCH_ACTIONS.cutSymbol);
    expect(GetClipboardUTF8()).toContain('(symbol "D"');
    expect(names()).toEqual(['U']);

    SaveClipboard('');
    treeSelection = [new LIB_ID('mine', 'U')];
    await run(SCH_ACTIONS.deleteSymbol);
    expect(names()).toEqual([]);
    expect(GetClipboardUTF8()).toBe('');
  });

  it('Delete of a symbol in a missing library says so and deletes nothing', async () => {
    setUp();
    treeSelection = [new LIB_ID('nowhere', 'X')];

    await run(SCH_ACTIONS.deleteSymbol);

    expect(infoErrors).toEqual(["Symbol library 'nowhere' not found."]);
    expect(names()).toEqual(['D', 'U']);
  });

  it('Delete in a read-only library says so and deletes nothing', async () => {
    setUp();
    libMgr().IsLibraryReadOnly = (aLib: string) => aLib === 'mine';
    treeSelection = [new LIB_ID('mine', 'D')];

    await run(SCH_ACTIONS.deleteSymbol);

    expect(infoErrors).toEqual(["Symbol library 'mine' is not writable."]);
    expect(names()).toEqual(['D', 'U']);
  });

  it('Duplicate needs a symbol; Paste does not', async () => {
    setUp();
    treeLibId = new LIB_ID('mine', '');

    await run(SCH_ACTIONS.duplicateSymbol);
    expect(infoErrors).toEqual(['No symbol selected']);
    expect(names()).toEqual(['D', 'U']);

    treeSelection = [new LIB_ID('mine', 'U')];
    await run(SCH_ACTIONS.copySymbol);
    await run(SCH_ACTIONS.pasteSymbol);
    expect(names()).toEqual(['D', 'U', 'U_1']);

    treeLibId = new LIB_ID('mine', 'U');
    await run(SCH_ACTIONS.duplicateSymbol);
    expect(names()).toEqual(['D', 'U', 'U_1', 'U_2']);
  });
});

describe('SYMBOL_EDITOR_CONTROL::RenameSymbol', () => {
  /** U, D derived from it, and W whose value is not its name. */
  const RENAME_LIB = `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  (symbol "U" (in_bom yes) (on_board yes) ${prop('Reference', 'U')} ${prop('Value', 'U')}
    (symbol "U_1_1" (rectangle (start -5.08 -5.08) (end 5.08 5.08) (stroke (width 0) (type default)) (fill (type none)))))
  (symbol "D" (extends "U") ${prop('Reference', 'U')} ${prop('Value', 'D')})
  (symbol "W" (in_bom yes) (on_board yes) ${prop('Reference', 'U')} ${prop('Value', '10k')}))`;

  it('renames the tree selection in its library; a Value that was the name follows it', async () => {
    setUp(RENAME_LIB);
    treeLibId = new LIB_ID('mine', 'D');
    renames = ['  E  '];

    await run(SCH_ACTIONS.renameSymbol);

    expect(names()).toEqual(['E', 'U', 'W']);
    expect(libMgr().GetBufferedSymbol('E', 'mine')!.IsDerived()).toBe(true);
    expect(libMgr().GetBufferedSymbol('E', 'mine')!.GetValueField().GetText()).toBe('E');
    expect(libMgr().IsSymbolModified('E', 'mine')).toBe(true);

    // Escaped as a LIB_ID part; the tree then shows the renamed symbol.
    const focused: string[] = [];
    t.frame.FocusOnLibId = (aLibId: LIB_ID) => {
      focused.push(aLibId.Format());
    };
    treeLibId = new LIB_ID('mine', 'W');
    renames = ['w:2'];
    await run(SCH_ACTIONS.renameSymbol);
    expect(libMgr().GetBufferedSymbol('w{colon}2', 'mine')!.GetValueField().GetText()).toBe('10k');
    expect(focused).toEqual(['mine:w{colon}2']);
  });

  it('renaming the symbol shown follows it on the canvas', async () => {
    setUp(RENAME_LIB);
    await t.frame.LoadSymbol(new LIB_ID('mine', 'W'), 1, 1);
    treeLibId = new LIB_ID('mine', 'W');
    renames = ['V'];

    await run(SCH_ACTIONS.renameSymbol);

    expect(t.frame.GetCurSymbol()!.GetName()).toBe('V');
    expect(names()).toEqual(['D', 'U', 'V']);
  });

  it('an empty name is refused; a taken one asks to overwrite; the same name changes nothing', async () => {
    setUp(RENAME_LIB);
    treeLibId = new LIB_ID('mine', 'W');
    kiAnswer = 'cancel';
    renames = ['', 'U', null];

    await run(SCH_ACTIONS.renameSymbol);

    expect(boxes).toEqual(['Symbol must have a name.']);
    expect(kiAsked).toEqual(["Symbol 'U' already exists in library 'mine'."]);
    expect(names()).toEqual(['D', 'U', 'W']);

    renames = ['W'];
    await run(SCH_ACTIONS.renameSymbol);
    expect(kiAsked).toHaveLength(1);
    expect(libMgr().IsLibraryModified('mine')).toBe(false);
  });

  it('overwriting the symbol shown shows the renamed one in its place', async () => {
    setUp(RENAME_LIB);
    await t.frame.LoadSymbol(new LIB_ID('mine', 'U'), 1, 1);
    treeLibId = new LIB_ID('mine', 'W');
    kiAnswer = 'ok';
    renames = ['U'];

    await run(SCH_ACTIONS.renameSymbol);

    // The overwritten U goes with the symbols derived from it (LIB_BUFFER::DeleteBuffer).
    expect(names()).toEqual(['U']);
    expect(t.frame.GetCurSymbol()!.GetName()).toBe('U');
    expect(t.frame.GetCurSymbol()!.GetValueField().GetText()).toBe('10k');
  });
});

describe('SYMBOL_EDITOR_CONTROL::AddSymbolToSchematic', () => {
  /** The schematic editor as AddSymbolToSchematic reaches it: a sheet, its config, its tools. */
  function schematicEditor(aAutoplace: boolean) {
    const posted: PLACE_SYMBOL_PARAMS[] = [];
    let raised = 0;
    const sheet = new SCH_SHEET_PATH();
    const screen = new SCH_SCREEN();
    const frame = {
      GetCurrentSheet: () => sheet,
      GetScreen: () => screen,
      eeconfig: () => ({ autoplace_fields: { enable: aAutoplace } }),
      Raise: () => {
        raised++;
      },
      GetToolManager: () => ({
        PostAction: (aAction: unknown, aParam: PLACE_SYMBOL_PARAMS) => {
          expect(aAction).toBe(SCH_ACTIONS.placeSymbol);
          posted.push(aParam);
        },
      }),
      ProcessEvent: () => true,
    };
    return { frame, screen, posted, raised: () => raised };
  }

  function kiway() {
    const k = new KIWAY({
      OnKiCadExit: () => {},
      Player: () => true,
      HasProjectManager: () => true,
      ShowProjectManager: () => {},
      CreateKiWindow: () => false,
    });
    t.frame.SetKiway(k);
    return k;
  }

  it('hands the schematic editor a new symbol of the unit shown, to place and annotate', async () => {
    setUp();
    await t.frame.LoadSymbol(new LIB_ID('mine', 'U'), 2, 1);
    const sch = schematicEditor(true);
    kiway().SetPlayerFrame(
      FRAME_T.FRAME_SCH,
      sch.frame as unknown as Parameters<KIWAY['SetPlayerFrame']>[1],
    );

    await run(SCH_ACTIONS.addSymbolToSchematic);

    expect(sch.raised()).toBe(1);
    expect(sch.posted).toHaveLength(1);
    expect(sch.posted[0]!.m_Reannotate).toBe(true);
    const symbol = sch.posted[0]!.m_Symbol as SCH_SYMBOL;
    expect(symbol.GetLibId().Format()).toBe('mine:U');
    expect(symbol.GetUnit()).toBe(2);
    expect(symbol.GetParent() === sch.screen).toBe(true);
    expect(symbol.GetFieldsAutoplaced()).not.toBe(0);
  });

  it('autoplaces the fields only when the schematic editor is set to', async () => {
    setUp();
    await t.frame.LoadSymbol(new LIB_ID('mine', 'U'), 1, 1);
    const sch = schematicEditor(false);
    kiway().SetPlayerFrame(
      FRAME_T.FRAME_SCH,
      sch.frame as unknown as Parameters<KIWAY['SetPlayerFrame']>[1],
    );

    await run(SCH_ACTIONS.addSymbolToSchematic);

    expect((sch.posted[0]!.m_Symbol as SCH_SYMBOL).GetFieldsAutoplaced()).toBe(0);
  });

  it('says so when no schematic is open, and does nothing with no symbol', async () => {
    setUp();
    const errors: string[] = [];
    SetErrorPresenter((aText) => {
      errors.push(aText);
    });
    kiway();

    await run(SCH_ACTIONS.addSymbolToSchematic);
    expect(errors).toEqual([]);

    await t.frame.LoadSymbol(new LIB_ID('mine', 'U'), 1, 1);
    await run(SCH_ACTIONS.addSymbolToSchematic);
    expect(errors).toEqual(['No schematic currently open.']);
    SetErrorPresenter((aText) => console.error(aText));
  });
});
