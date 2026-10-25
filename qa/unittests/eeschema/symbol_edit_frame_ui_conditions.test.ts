// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * SYMBOL_EDIT_FRAME::setupUIConditions (symbol_edit_frame.cpp:448-660), asked of the live frame
 * as wx asks before it draws a row or a button: a wxUpdateUIEvent for the action's UI id through
 * ProcessUpdateUI. Which rows a cold frame, a root symbol, a derived one and a library-tree row
 * leave live, and which toggles are checked.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { IS_MOVING } from '@ziroeda/common/eda_item_flags.js';
import { LIB_ID } from '@ziroeda/common/lib_id.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import { SCH_SELECTION_TOOL } from '@ziroeda/eeschema/tools/sch_selection_tool.js';
import { ACTIONS } from '@ziroeda/common/tool/actions.js';
import type { TOOL_ACTION } from '@ziroeda/common/tool/tool_action.js';
import { SCH_ACTIONS } from '@ziroeda/eeschema/tools/sch_actions.js';
import { SYMBOL_EDIT_FRAME } from '@ziroeda/eeschema/symbol_editor/symbol_edit_frame.js';
import {
  symbolEditorCheckedIds,
  symbolEditorDisabledIds,
  symbolEditorIdChecked,
  symbolEditorIdEnabled,
} from '@ziroeda/eeschema/symbol_editor/toolbars_symbol_editor.js';
import { wxUpdateUIEvent } from '@ziroeda/wx/wx_event.js';
import {
  LIB_TEXT,
  type SYMBOL_EDIT_HARNESS,
  symbolEditHarness,
} from './support/symbol_edit_harness.js';

const prop = (aName: string, aValue: string) =>
  `(property "${aName}" "${aValue}" (at 0 0 0) (effects (font (size 1.27 1.27))))`;

/** The harness's U (two interchangeable units), D derived from it with a datasheet, B with De Morgan. */
const LIB = LIB_TEXT.replace(
  /\)$/,
  `
  (symbol "D" (extends "U") ${prop('Reference', 'U')} ${prop('Value', 'D')} ${prop('Datasheet', 'https://example.com/d.pdf')})
  (symbol "B" (in_bom yes) (on_board yes)
    ${prop('Reference', 'B')} ${prop('Value', 'B')}
    (symbol "B_1_1" (rectangle (start -1 -1) (end 1 1) (stroke (width 0) (type default)) (fill (type none))))
    (symbol "B_1_2" (circle (center 0 0) (radius 1) (stroke (width 0) (type default)) (fill (type none))))))`,
);

let t: SYMBOL_EDIT_HARNESS;
let tree: LIB_ID | null;

function setUp(): void {
  tree = null;
  t = symbolEditHarness(LIB, {
    isLibraryTreeShown: () => tree !== null,
    getTreeLibId: () => tree ?? new LIB_ID(),
  });
}

afterEach(() => t.dispose());

const ui = (aAction: TOOL_ACTION): wxUpdateUIEvent => {
  const event = new wxUpdateUIEvent(aAction.GetUIId());
  t.frame.ProcessUpdateUI(event);
  return event;
};
const enabled = (aAction: TOOL_ACTION): boolean => ui(aAction).GetEnabled();
const checked = (aAction: TOOL_ACTION): boolean => ui(aAction).GetChecked();

/** EDIT_TOOL( tool ): the twelve, all on isEditableCond. */
const EDIT_TOOLS = [
  ACTIONS.deleteTool,
  SCH_ACTIONS.placeSymbolPin,
  SCH_ACTIONS.placeSymbolText,
  SCH_ACTIONS.drawSymbolTextBox,
  SCH_ACTIONS.drawRectangle,
  SCH_ACTIONS.drawCircle,
  SCH_ACTIONS.drawArc,
  SCH_ACTIONS.drawBezier,
  SCH_ACTIONS.drawSymbolLines,
  SCH_ACTIONS.drawSymbolPolygon,
  SCH_ACTIONS.placeSymbolAnchor,
  SCH_ACTIONS.importGraphics,
];

const names = (aActions: readonly TOOL_ACTION[]): string[] => aActions.map((a) => a.GetName());
const live = (aActions: readonly TOOL_ACTION[]): string[] => names(aActions.filter(enabled));

describe('a frame with no symbol', () => {
  it('leaves only the commands that need no symbol', () => {
    setUp();

    expect(
      live([
        ACTIONS.save,
        ACTIONS.saveAll,
        SCH_ACTIONS.newSymbol,
        SCH_ACTIONS.importSymbol,
        ACTIONS.undo,
        ACTIONS.redo,
        ACTIONS.revert,
        ACTIONS.cut,
        ACTIONS.copy,
        ACTIONS.copyAsText,
        ACTIONS.paste,
        ACTIONS.doDelete,
        ACTIONS.duplicate,
        ACTIONS.selectAll,
        ACTIONS.unselectAll,
        SCH_ACTIONS.rotateCW,
        SCH_ACTIONS.rotateCCW,
        SCH_ACTIONS.mirrorH,
        SCH_ACTIONS.mirrorV,
        SCH_ACTIONS.saveLibraryAs,
        SCH_ACTIONS.saveSymbolAs,
        SCH_ACTIONS.saveSymbolCopyAs,
        SCH_ACTIONS.editLibSymbolWithLibEdit,
        ACTIONS.showDatasheet,
        SCH_ACTIONS.symbolProperties,
        SCH_ACTIONS.runERC,
        SCH_ACTIONS.pinTable,
        SCH_ACTIONS.updateSymbolFields,
        SCH_ACTIONS.cycleBodyStyle,
        SCH_ACTIONS.toggleSyncedPinsMode,
        ...EDIT_TOOLS,
      ]),
    ).toEqual(
      names([ACTIONS.save, ACTIONS.saveAll, SCH_ACTIONS.newSymbol, SCH_ACTIONS.importSymbol]),
    );
  });
});

describe('a root symbol', () => {
  it('is editable: the edit commands and every drawing tool are live', () => {
    setUp();
    t.open('U');

    expect(
      live([
        ACTIONS.cut,
        ACTIONS.copy,
        ACTIONS.paste,
        ACTIONS.doDelete,
        ACTIONS.duplicate,
        ACTIONS.selectAll,
        SCH_ACTIONS.rotateCW,
        SCH_ACTIONS.mirrorH,
        SCH_ACTIONS.mirrorV,
        SCH_ACTIONS.pinTable,
        SCH_ACTIONS.symbolProperties,
        SCH_ACTIONS.saveSymbolAs,
        SCH_ACTIONS.saveLibraryAs,
        SCH_ACTIONS.runERC,
        ...EDIT_TOOLS,
      ]).length,
    ).toBe(14 + EDIT_TOOLS.length);
  });

  it('has nothing to undo, revert, update from a parent, or show a datasheet for, yet', () => {
    setUp();
    t.open('U');

    expect(
      live([
        ACTIONS.undo,
        ACTIONS.redo,
        ACTIONS.revert,
        SCH_ACTIONS.updateSymbolFields,
        ACTIONS.showDatasheet,
        SCH_ACTIONS.cycleBodyStyle,
        SCH_ACTIONS.editLibSymbolWithLibEdit,
      ]),
    ).toEqual([]);
  });

  it('can be undone and reverted once it is changed', () => {
    setUp();
    t.open('U');
    const tm = t.frame.GetToolManager()!;
    expect(t.frame.HasLibModifications()).toBe(false);

    tm.RunAction(ACTIONS.selectAll);
    tm.RunAction(SCH_ACTIONS.rotateCW);

    expect(t.frame.HasLibModifications()).toBe(true);

    expect(enabled(ACTIONS.undo)).toBe(true);
    expect(enabled(ACTIONS.redo)).toBe(false);
    expect(enabled(ACTIONS.revert)).toBe(true);
  });

  // SELECTION_CONDITIONS::Idle, asked of GetCurrentSelection() - the selection tool's.
  it('pastes nothing while an item is being moved', () => {
    setUp();
    const symbol = t.open('U');
    const tool = t.frame.GetToolManager()!.GetTool(SCH_SELECTION_TOOL)!;
    const shape = [...symbol.GetDrawItems()].find((i) => i.Type() === KICAD_T.SCH_SHAPE_T)!;

    tool.AddItemToSel(shape);
    expect(enabled(ACTIONS.paste)).toBe(true);

    shape.SetFlags(IS_MOVING);
    expect(enabled(ACTIONS.paste)).toBe(false);
  });

  it('with interchangeable units, offers synced pin editing - checked as the frame has it', () => {
    setUp();
    t.open('U');

    expect(enabled(SCH_ACTIONS.toggleSyncedPinsMode)).toBe(true);
    expect(checked(SCH_ACTIONS.toggleSyncedPinsMode)).toBe(t.frame.m_SyncPinEdit);

    t.frame.m_SyncPinEdit = !t.frame.m_SyncPinEdit;

    expect(checked(SCH_ACTIONS.toggleSyncedPinsMode)).toBe(t.frame.m_SyncPinEdit);
  });

  it('with a De Morgan body style, cycles body styles', () => {
    setUp();
    t.open('B');

    expect(enabled(SCH_ACTIONS.cycleBodyStyle)).toBe(true);
    expect(enabled(SCH_ACTIONS.toggleSyncedPinsMode)).toBe(false);
  });
});

describe('a derived symbol', () => {
  it('rotates its fields and updates them from the parent, but is not edited itself', () => {
    setUp();
    t.open('D');

    expect(
      live([
        SCH_ACTIONS.rotateCW,
        SCH_ACTIONS.rotateCCW,
        ACTIONS.copy,
        SCH_ACTIONS.updateSymbolFields,
        ACTIONS.showDatasheet,
      ]).length,
    ).toBe(5);
    expect(
      live([
        ACTIONS.cut,
        ACTIONS.paste,
        ACTIONS.doDelete,
        ACTIONS.duplicate,
        SCH_ACTIONS.mirrorH,
        SCH_ACTIONS.mirrorV,
        SCH_ACTIONS.pinTable,
        ...EDIT_TOOLS,
      ]),
    ).toEqual([]);
  });
});

describe('the library tree', () => {
  it('a symbol row is a target with no symbol open', () => {
    setUp();
    tree = new LIB_ID('mine', 'U');

    expect(enabled(SCH_ACTIONS.symbolProperties)).toBe(true);
    expect(enabled(SCH_ACTIONS.saveSymbolAs)).toBe(true);
    expect(enabled(SCH_ACTIONS.saveLibraryAs)).toBe(true);
  });

  it('a row naming a symbol the library does not have is no symbol to save', () => {
    setUp();
    t.open('U');
    tree = new LIB_ID('mine', 'Nope');

    expect(enabled(SCH_ACTIONS.saveSymbolAs)).toBe(false);
    expect(enabled(SCH_ACTIONS.symbolProperties)).toBe(true);
  });

  it('a library row alone is a library to save', () => {
    setUp();
    tree = new LIB_ID('mine', '');

    expect(enabled(SCH_ACTIONS.saveLibraryAs)).toBe(true);
    expect(enabled(SCH_ACTIONS.symbolProperties)).toBe(false);
  });

  it('is checked while it is shown', () => {
    setUp();

    expect(checked(ACTIONS.showLibraryTree)).toBe(false);
    tree = new LIB_ID();
    expect(checked(ACTIONS.showLibraryTree)).toBe(true);
  });
});

describe('a symbol from the schematic', () => {
  it('can be opened in the library editor', () => {
    setUp();
    t.open('U');
    t.frame.SetSymbolOrigin(true, false);

    expect(enabled(SCH_ACTIONS.editLibSymbolWithLibEdit)).toBe(true);
  });

  // canEditProperties decides only when the target LIB_ID is empty - a symbol with no library -
  // since GetTargetLibId otherwise answers the tree condition with the open symbol's own.
  it('with no library, has its properties edited only if it is editable', () => {
    setUp();
    t.open('U').SetLibId(new LIB_ID('', 'U'));
    t.frame.SetSymbolOrigin(false, true);
    expect(enabled(SCH_ACTIONS.symbolProperties)).toBe(false);

    t.frame.SetSymbolOrigin(false, false);
    expect(enabled(SCH_ACTIONS.symbolProperties)).toBe(true);
  });

  it('is editable even from a legacy library', () => {
    setUp();
    t.open('U');
    t.frame.SetSymbolOrigin(false, true);
    expect(enabled(ACTIONS.cut)).toBe(false);
    expect(enabled(SCH_ACTIONS.pinTable)).toBe(false);
    // symbolSelectedInTreeCondition asks GetTargetLibId, which falls back to the open symbol's
    // own LIB_ID: Symbol Properties stays live on a legacy symbol, upstream as here.
    expect(enabled(SCH_ACTIONS.symbolProperties)).toBe(true);

    t.frame.SetSymbolOrigin(true, true);
    expect(enabled(ACTIONS.cut)).toBe(true);
    expect(enabled(SCH_ACTIONS.pinTable)).toBe(true);
  });
});

describe('the checked toggles', () => {
  it('follow the symbol editor settings', () => {
    setUp();
    const cfg = t.frame.libeditconfig()!;
    const before = [
      cfg.show_pin_electrical_type,
      cfg.show_hidden_lib_pins,
      cfg.show_hidden_lib_fields,
      cfg.show_pin_alt_icons,
    ];

    try {
      cfg.show_pin_electrical_type = false;
      cfg.show_hidden_lib_pins = true;
      cfg.show_hidden_lib_fields = false;
      cfg.show_pin_alt_icons = true;

      expect(
        [
          SCH_ACTIONS.showElectricalTypes,
          SCH_ACTIONS.showHiddenPins,
          SCH_ACTIONS.showHiddenFields,
          SCH_ACTIONS.togglePinAltIcons,
        ].map(checked),
      ).toEqual([false, true, false, true]);
    } finally {
      [
        cfg.show_pin_electrical_type,
        cfg.show_hidden_lib_pins,
        cfg.show_hidden_lib_fields,
        cfg.show_pin_alt_icons,
      ] = before as [boolean, boolean, boolean, boolean];
    }
  });

  it('check the properties pane while it is shown', () => {
    let shown = false;
    t = symbolEditHarness(LIB, { isPropertiesShown: () => shown });

    expect(checked(ACTIONS.showProperties)).toBe(false);
    shown = true;
    expect(checked(ACTIONS.showProperties)).toBe(true);
  });

  it('check the tool running', () => {
    setUp();
    t.open('U');

    expect(checked(ACTIONS.selectionTool)).toBe(true);
    expect(checked(SCH_ACTIONS.placeSymbolPin)).toBe(false);
  });
});

describe('the bars', () => {
  it('offer no action before the frame has its tools', () => {
    setUp();
    const toolless = new SYMBOL_EDIT_FRAME({ libEdit: () => {} });

    expect(symbolEditorIdEnabled(toolless, 'newSymbol')).toBe(false);
    expect(symbolEditorIdEnabled(t.frame, 'newSymbol')).toBe(true);
    // A row no action stands behind is the window's own.
    expect(symbolEditorIdEnabled(toolless, 'noSuchAction')).toBe(true);
  });

  it('grey a tool inside a group as well as one on its own', () => {
    setUp();

    expect([
      ...symbolEditorDisabledIds(t.frame, [
        { group: 'Pins', actions: [{ id: 'placePin', icon: 'placePin', title: 'Add a pin' }] },
        { id: 'drawRectangle', icon: 'drawRectangle', title: 'Draw rectangles' },
        { id: 'newSymbol', icon: 'newSymbol', title: 'New Symbol' },
      ]),
    ]).toEqual(['placePin', 'drawRectangle']);
  });
  it("light what the frame's CHECK conditions hold, inside a group too, and nothing else", () => {
    // The window draws no toggle state of its own: HandleUpdateUIEvent asks these on every
    // idle, so a Preferences OK, a tool flipping m_SyncPinEdit or the units changing moves the
    // buttons with nothing to re-sync.
    setUp();
    t.open('U');
    const cfg = t.frame.libeditconfig()!;
    const before = [cfg.show_hidden_lib_pins, cfg.show_hidden_lib_fields];
    const bar = [
      {
        group: 'Units',
        actions: [
          { id: 'unitsMm', icon: 'unitsMm', title: 'Millimeters' },
          { id: 'unitsInches', icon: 'unitsInches', title: 'Inches' },
          { id: 'unitsMils', icon: 'unitsMils', title: 'Mils' },
        ],
      },
      { id: 'showHiddenPins', icon: 'toggleHiddenPins', title: 'Show hidden pins', toggle: true },
      {
        id: 'showHiddenFields',
        icon: 'showHiddenFields',
        title: 'Show hidden fields',
        toggle: true,
      },
      { id: 'toggleSyncedPinsMode', icon: 'syncedPins', title: 'Synced pins', toggle: true },
      { id: 'newSymbol', icon: 'newSymbol', title: 'New Symbol' },
    ];

    try {
      cfg.show_hidden_lib_pins = true;
      cfg.show_hidden_lib_fields = false;
      t.frame.SetUserUnits('in');
      t.frame.m_SyncPinEdit = true;
      expect([...symbolEditorCheckedIds(t.frame, bar)].sort()).toEqual(
        ['showHiddenPins', 'toggleSyncedPinsMode', 'unitsInches'].sort(),
      );

      cfg.show_hidden_lib_pins = false;
      cfg.show_hidden_lib_fields = true;
      t.frame.SetUserUnits('mm');
      t.frame.m_SyncPinEdit = false;
      expect([...symbolEditorCheckedIds(t.frame, bar)].sort()).toEqual(
        ['showHiddenFields', 'unitsMm'].sort(),
      );
    } finally {
      [cfg.show_hidden_lib_pins, cfg.show_hidden_lib_fields] = before as [boolean, boolean];
    }

    // No action behind the id, or no frame tools yet: unchecked.
    expect(symbolEditorIdChecked(t.frame, 'noSuchAction')).toBe(false);
    expect(
      symbolEditorIdChecked(new SYMBOL_EDIT_FRAME({ libEdit: () => {} }), 'showHiddenFields'),
    ).toBe(false);
  });
});

/**
 * SYMBOL_EDIT_FRAME::FocusOnItem (symbol_edit_frame.cpp:1691), which the pin table's cross-probe
 * asks on a row selection: the pin brightened, the last one dimmed, its unit shown.
 */
describe('FocusOnItem', () => {
  it('brightens the pin, shows its unit, and dims the one before', () => {
    setUp();
    const symbol = t.open('U');
    const pin = (n: string) => symbol.GetGraphicalPins(0, 0).find((p) => p.GetNumber() === n)!;
    const pin1 = pin('1');
    const pin2 = pin('2');

    t.frame.FocusOnItem(pin2);
    expect([pin2.IsBrightened(), t.frame.GetUnit()]).toEqual([true, 2]);

    t.frame.FocusOnItem(pin1);
    expect([pin1.IsBrightened(), pin2.IsBrightened(), t.frame.GetUnit()]).toEqual([true, false, 1]);

    t.frame.FocusOnItem(null);
    expect(pin1.IsBrightened()).toBe(false);
  });

  it('dims a field it brightened, as it does a pin', () => {
    setUp();
    const symbol = t.open('U');
    const value = symbol.GetValueField();
    const pin = symbol.GetGraphicalPins(0, 0)[0]!;

    t.frame.FocusOnItem(value);
    expect(value.IsBrightened()).toBe(true);

    t.frame.FocusOnItem(pin);
    expect([value.IsBrightened(), pin.IsBrightened()]).toEqual([false, true]);
  });

  it('moves the view to the item', () => {
    setUp();
    const symbol = t.open('U');
    const pin = symbol.GetGraphicalPins(0, 0).find((p) => p.GetNumber() === '1')!;
    const view = t.frame.GetCanvas()!.GetView();
    view.SetCenter({ x: 1e8, y: 1e8 });

    t.frame.FocusOnItem(pin);

    const c = view.GetCenter();
    const f = pin.GetFocusPosition();
    expect([Math.round(c.x), Math.round(c.y)]).toEqual([f.x, f.y]);
  });
});
