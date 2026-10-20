// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * SYMBOL_EDITOR_EDIT_TOOL's dialogs (eeschema/tools/symbol_editor_edit_tool.cpp): Properties
 * dispatching on the selection (pin, shape, text box, field, the symbol itself, or a symbol picked
 * in the library tree but not loaded) and the pin table, live on the symbol editor's frame. The
 * window is played by the showModal hook, which edits what a dialog would.
 */
import type { EDA_ITEM } from '@ziroeda/common/eda_item.js';
import { LIB_ID } from '@ziroeda/common/lib_id.js';
import type { TOOL_ACTION } from '@ziroeda/common/tool/tool_action.js';
import { TA_NONE, TC_MESSAGE, TOOL_EVENT } from '@ziroeda/common/tool/tool_event.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import type { LIB_SYMBOL } from '@ziroeda/eeschema/lib_symbol.js';
import type { SCH_COMMIT } from '@ziroeda/eeschema/sch_commit.js';
import type { SCH_FIELD } from '@ziroeda/eeschema/sch_field.js';
import type { SCH_PIN } from '@ziroeda/eeschema/sch_pin.js';
import { SCH_ACTIONS } from '@ziroeda/eeschema/tools/sch_actions.js';
import { SCH_SELECTION_TOOL } from '@ziroeda/eeschema/tools/sch_selection_tool.js';
import { SYMBOL_EDITOR_DRAWING_TOOLS } from '@ziroeda/eeschema/tools/symbol_editor_drawing_tools.js';
import { wxID_CANCEL, wxID_OK } from '@ziroeda/wx/menu.js';
import { afterEach, describe, expect, it } from 'vitest';
import { type SYMBOL_EDIT_HARNESS, symbolEditHarness } from './support/symbol_edit_harness.js';

interface ASKED {
  name: string;
  items: readonly EDA_ITEM[];
  arg: unknown;
}

let t: SYMBOL_EDIT_HARNESS;
let asked: ASKED[] = [];
let treeLibId: LIB_ID | null = null;
let treeUpdates: string[] = [];
/** The window's dialog: edits what it was handed and answers. */
let dialog: (aAsked: ASKED) => number = () => wxID_OK;

function setUp(aOpen = true, aLib?: string) {
  asked = [];
  treeLibId = null;
  treeUpdates = [];
  dialog = () => wxID_OK;
  t = symbolEditHarness(aLib, {
    showModal: async (name, items, arg) => {
      const a = { name, items, arg };
      asked.push(a);
      return dialog(a);
    },
    getTreeLibId: () => treeLibId,
    updateLibraryTree: (aLibId) => treeUpdates.push(aLibId.Format()),
  });
  if (aOpen) t.open();
}

afterEach(() => t.dispose());

const sym = () => t.frame.GetCurSymbol()!;
const mgr = () => t.frame.GetToolManager()!;
const select = (...aItems: EDA_ITEM[]) => {
  for (const i of aItems) mgr().GetTool(SCH_SELECTION_TOOL)!.AddItemToSel(i, true);
};
const run = (aAction: TOOL_ACTION) => mgr().RunAction(aAction);
const pin = (aUnit: number) =>
  sym()
    .GetPins()
    .find((p) => p.GetUnit() === aUnit)!;

async function settle() {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 0));
    mgr().ProcessEvent(new TOOL_EVENT(TC_MESSAGE, TA_NONE, 'test.flush'));
  }
}

describe('SYMBOL_EDITOR_EDIT_TOOL::Properties', () => {
  it('a pin opens DIALOG_PIN_PROPERTIES, and the edit reaches its twin in the other unit', async () => {
    setUp();
    dialog = (a) => {
      (a.items[0] as SCH_PIN).SetName('Z');
      return wxID_OK;
    };
    select(pin(1));

    run(SCH_ACTIONS.properties);
    await settle();

    expect(asked.map((a) => a.name)).toEqual(['DIALOG_PIN_PROPERTIES']);
    expect(asked[0]!.items[0] === pin(1)).toBe(true);
    expect(pin(2).GetName()).toBe('Z');
  });

  it('a shape opens DIALOG_SHAPE_PROPERTIES; its apply-to-all boxes become the drawing defaults', async () => {
    setUp();
    const rect = [...sym().GetDrawItems()].find((i) => i.Type() === KICAD_T.SCH_SHAPE_T)!;
    dialog = (a) => {
      Object.assign(a.arg as object, { applyToAllConversions: true, applyToAllUnits: false });
      return wxID_OK;
    };
    select(rect);

    run(SCH_ACTIONS.properties);
    await settle();

    expect(asked.map((a) => a.name)).toEqual(['DIALOG_SHAPE_PROPERTIES']);
    const drawing = mgr().GetTool(SYMBOL_EDITOR_DRAWING_TOOLS)!;
    expect(drawing.GetDrawSpecificBodyStyle()).toBe(false);
    expect(drawing.GetDrawSpecificUnit()).toBe(true);
    expect(t.frame.GetLibManager().IsSymbolModified('U', 'mine')).toBe(true);
  });

  it('a cancelled shape dialog changes no default and marks nothing modified', async () => {
    setUp();
    const rect = [...sym().GetDrawItems()].find((i) => i.Type() === KICAD_T.SCH_SHAPE_T)!;
    dialog = (a) => {
      Object.assign(a.arg as object, { applyToAllConversions: true, applyToAllUnits: true });
      return wxID_CANCEL;
    };
    select(rect);

    run(SCH_ACTIONS.properties);
    await settle();

    const drawing = mgr().GetTool(SYMBOL_EDITOR_DRAWING_TOOLS)!;
    expect(drawing.GetDrawSpecificBodyStyle()).toBe(true);
    expect(t.frame.GetLibManager().IsSymbolModified('U', 'mine')).toBe(false);
  });

  it("a field opens DIALOG_FIELD_PROPERTIES under its caption, and the window's edit is one undo step", async () => {
    setUp();
    const value = sym().GetValueField();
    dialog = (a) => {
      const { commit } = a.arg as { caption: string; commit: SCH_COMMIT };
      const field = a.items[0] as SCH_FIELD;
      commit.Modify(field, t.frame.GetScreen());
      field.SetText('LM358');
      return wxID_OK;
    };
    select(value);

    run(SCH_ACTIONS.properties);
    await settle();

    expect(asked[0]!.name).toBe('DIALOG_FIELD_PROPERTIES');
    expect((asked[0]!.arg as { caption: string }).caption).toBe('Edit Value Field');
    expect(sym().GetValueField().GetText()).toBe('LM358');
    // The selection's saveCopyInUndoList, then the field's own commit (upstream does both).
    expect(t.frame.GetUndoCommandCount()).toBe(2);
  });

  it('Symbol Properties with no tree selection opens DIALOG_LIB_SYMBOL_PROPERTIES on the loaded symbol; locking units turns sync off', async () => {
    setUp();
    expect(t.frame.m_SyncPinEdit).toBe(true);
    dialog = (a) => {
      (a.items[0] as LIB_SYMBOL).LockUnits(true);
      return wxID_OK;
    };

    run(SCH_ACTIONS.symbolProperties);
    await settle();

    expect(asked.map((a) => a.name)).toEqual(['DIALOG_LIB_SYMBOL_PROPERTIES']);
    expect(asked[0]!.items[0] === sym()).toBe(true);
    expect(t.frame.m_SyncPinEdit).toBe(false);
    expect(mgr().GetTool(SYMBOL_EDITOR_DRAWING_TOOLS)!.GetDrawSpecificUnit()).toBe(true);
    expect(treeUpdates).toEqual(['mine:U']);
  });

  it('Symbol Properties on the tree symbol that IS loaded edits the loaded symbol, not a copy', async () => {
    setUp();
    treeLibId = new LIB_ID('mine', 'U');

    run(SCH_ACTIONS.symbolProperties);
    await settle();

    expect(asked.map((a) => a.name)).toEqual(['DIALOG_LIB_SYMBOL_PROPERTIES']);
    expect(asked[0]!.items[0] === sym()).toBe(true);
  });

  it('Symbol Properties on another tree symbol than the loaded one edits that one, from the buffer', async () => {
    const prop = (aName: string, aValue: string) =>
      `(property "${aName}" "${aValue}" (at 0 0 0) (effects (font (size 1.27 1.27))))`;
    setUp(
      true,
      `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  (symbol "U" (in_bom yes) (on_board yes) ${prop('Reference', 'U')} ${prop('Value', 'U')})
  (symbol "W" (in_bom yes) (on_board yes) ${prop('Reference', 'W')} ${prop('Value', 'W')}))`,
    );
    treeLibId = new LIB_ID('mine', 'W');

    run(SCH_ACTIONS.symbolProperties);
    await settle();

    expect(asked.map((a) => a.name)).toEqual(['DIALOG_LIB_SYMBOL_PROPERTIES']);
    expect((asked[0]!.items[0] as LIB_SYMBOL).GetName()).toBe('W');
    expect(asked[0]!.items[0] === sym()).toBe(false);
  });

  it('Symbol Properties on a tree symbol that is not loaded edits a copy into the buffer', async () => {
    setUp(false);
    t.frame.SetCurLib('mine');
    treeLibId = new LIB_ID('mine', 'U');
    dialog = (a) => {
      (a.items[0] as LIB_SYMBOL).SetKeyWords('opamp');
      return wxID_OK;
    };

    run(SCH_ACTIONS.symbolProperties);
    await settle();

    expect(asked.map((a) => a.name)).toEqual(['DIALOG_LIB_SYMBOL_PROPERTIES']);
    const buffered = t.frame.GetLibManager().GetBufferedSymbol('U', 'mine')!;
    expect(buffered.GetKeyWords()).toBe('opamp');
    // A copy was edited, not the buffer's own symbol.
    expect(asked[0]!.items[0] === buffered).toBe(false);
    expect(t.frame.GetLibManager().IsSymbolModified('U', 'mine')).toBe(true);
    expect(t.frame.GetCurSymbol()).toBeNull();
    expect(treeUpdates).toEqual(['mine:U']);
  });

  it('a rename there renames the buffer in place', async () => {
    setUp(false);
    t.frame.SetCurLib('mine');
    treeLibId = new LIB_ID('mine', 'U');
    dialog = (a) => {
      (a.items[0] as LIB_SYMBOL).SetName('V');
      return wxID_OK;
    };

    run(SCH_ACTIONS.symbolProperties);
    await settle();

    // The library's buffer holds V where U was - one symbol, not a second one beside it.
    // (GetBufferedSymbol( 'U' ) would read U afresh from the unsaved file, as upstream's does.)
    const names: string[] = [];
    t.frame.GetLibManager().GetSymbolNames('mine', names);
    expect(names).toEqual(['V']);
    expect(treeUpdates).toEqual(['mine:V']);
  });
});

describe('SYMBOL_EDITOR_EDIT_TOOL::PinTable', () => {
  it('hands the symbol and the selected pins to DIALOG_LIB_EDIT_PIN_TABLE; OK is one undo step', async () => {
    setUp();
    let selectedDuringDialog = -1;
    dialog = () => {
      selectedDuringDialog = mgr().GetTool(SCH_SELECTION_TOOL)!.GetSelection().Size();
      return wxID_OK;
    };
    select(pin(1));

    run(SCH_ACTIONS.pinTable);
    await settle();

    expect(asked[0]!.name).toBe('DIALOG_LIB_EDIT_PIN_TABLE');
    expect(asked[0]!.items[0] === sym()).toBe(true);
    // Identity, not toEqual: a failing deep diff of two pins runs vitest out of memory.
    expect(asked[0]!.items.length).toBe(2);
    expect(asked[0]!.items[1] === pin(1)).toBe(true);
    // The selection is cleared before the dialog, so the pins it may change are not held there.
    expect(selectedDuringDialog).toBe(0);
    expect(t.frame.GetUndoCommandCount()).toBe(1);
  });

  it('Cancel leaves nothing to undo', async () => {
    setUp();
    dialog = () => wxID_CANCEL;

    run(SCH_ACTIONS.pinTable);
    await settle();

    expect(t.frame.GetUndoCommandCount()).toBe(0);
  });
});
