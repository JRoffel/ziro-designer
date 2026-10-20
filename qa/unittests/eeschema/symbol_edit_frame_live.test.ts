// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * SYMBOL_EDIT_FRAME (eeschema/symbol_editor/symbol_edit_frame.cpp), live: its TOOL_MANAGER and
 * the symbol it shows - SetCurSymbol, SetUnit, OnModify into LIB_SYMBOL_LIBRARY_MANAGER's buffer -
 * and the selection tool picking the symbol's own items on the canvas.
 */
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import type { LIB_SYMBOL } from '@ziroeda/eeschema/lib_symbol.js';
import { SCH_SELECTION_TOOL } from '@ziroeda/eeschema/tools/sch_selection_tool.js';
import { SCH_ACTIONS } from '@ziroeda/eeschema/tools/sch_actions.js';
import { ACTIONS } from '@ziroeda/common/tool/actions.js';
import { TA_MOUSE_MOTION } from '@ziroeda/common/tool/tool_event.js';
import type { SYMBOL_EDIT_FRAME } from '@ziroeda/eeschema/symbol_editor/symbol_edit_frame.js';
import { LIB_SYMBOL_LIBRARY_MANAGER } from '@ziroeda/eeschema/symbol_editor/lib_symbol_library_manager.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { click, mouse, type SCH_HARNESS } from './support/sch_tool_harness.js';
import { G, type SYMBOL_EDIT_HARNESS, symbolEditHarness } from './support/symbol_edit_harness.js';

let t: SYMBOL_EDIT_HARNESS;
let frame: SYMBOL_EDIT_FRAME;
let harness: SCH_HARNESS;

beforeEach(() => {
  t = symbolEditHarness();
  frame = t.frame;
  harness = t.harness;
});

afterEach(() => t.dispose());

/** Open \a aName of the library as LoadSymbolFromCurrentLib does: a copy of the buffered one. */
const open = (aName = 'U'): LIB_SYMBOL => t.open(aName);

const mm = (x: number, y: number) => ({ x: x * 10000, y: y * 10000 });

describe('SYMBOL_EDIT_FRAME', () => {
  it('starts on the dummy screen, with its manager and tools', () => {
    expect(frame.GetLibManager()).toBeInstanceOf(LIB_SYMBOL_LIBRARY_MANAGER);
    expect(frame.GetScreen()).not.toBeNull();
    expect(frame.GetToolManager()!.GetTool(SCH_SELECTION_TOOL)).toBeTruthy();
    expect(frame.GetCurSymbol()).toBeNull();
  });

  it('shows the symbol it is given, and remembers the library', () => {
    const symbol = open();

    expect(frame.GetCurSymbol() === symbol).toBe(true);
    expect(frame.GetCurLib()).toBe('mine');
    expect(frame.m_SyncPinEdit).toBe(true);
    // The symbol's own items are in the view.
    const inView = [...symbol.GetDrawItems()].filter((i) => i.viewPrivData() !== null);
    expect(inView.length).toBeGreaterThan(0);
  });

  it('a click on unit 1 picks its pin; unit 2 shows the other', () => {
    open();
    const pins = () =>
      frame.GetCurSymbol()!.GetGraphicalPins(frame.GetUnit(), frame.GetBodyStyle());

    expect(pins().map((p) => p.GetNumber())).toEqual(['1']);
    click(harness, mm(10.16, 0));
    const sel = frame.GetToolManager()!.GetTool(SCH_SELECTION_TOOL)!.GetSelection();
    expect(sel.Size()).toBe(1);
    expect(sel.Front()!.Type()).toBe(KICAD_T.SCH_PIN_T);

    frame.SetUnit(2);
    expect(frame.GetUnit()).toBe(2);
    // The painter draws the unit shown (RebuildView's m_ShowUnit).
    expect(frame.GetRenderSettings()!.m_ShowUnit).toBe(2);
    expect(pins().map((p) => p.GetNumber())).toEqual(['2']);
    // Changing unit clears the selection (selectionClear).
    expect(frame.GetToolManager()!.GetTool(SCH_SELECTION_TOOL)!.GetSelection().Size()).toBe(0);

    frame.SetUnit(3); // out of range: ignored
    expect(frame.GetUnit()).toBe(2);
  });

  it('an edit goes into the library buffer on OnModify', () => {
    const symbol = open();
    symbol.SetKeyWords('amplifier');
    frame.OnModify();

    expect(frame.GetLibManager().IsSymbolModified('U', 'mine')).toBe(true);
    expect(frame.GetLibManager().GetBufferedSymbol('U', 'mine')!.GetKeyWords()).toBe('amplifier');
    // The buffer holds a copy, not the frame's symbol.
    expect(frame.GetLibManager().GetBufferedSymbol('U', 'mine') === symbol).toBe(false);
  });

  it('undo swaps the stored copy in, redo swaps it back (symbol_editor_undo_redo.cpp)', () => {
    const symbol = open();
    frame.SaveCopyInUndoList('Edit Symbol', symbol);
    symbol.SetKeyWords('after');
    frame.OnModify();

    expect(frame.GetUndoCommandCount()).toBe(1);

    frame.GetSymbolFromUndoList();
    expect(frame.GetCurSymbol() === symbol).toBe(false);
    expect(frame.GetCurSymbol()!.GetKeyWords()).toBe('');
    expect(frame.GetUndoCommandCount()).toBe(0);
    expect(frame.GetRedoCommandCount()).toBe(1);
    // OnModify stored the undone symbol in the buffer.
    expect(frame.GetLibManager().GetBufferedSymbol('U', 'mine')!.GetKeyWords()).toBe('');

    frame.GetSymbolFromRedoList();
    expect(frame.GetCurSymbol() === symbol).toBe(true);
    expect(frame.GetCurSymbol()!.GetKeyWords()).toBe('after');
    expect(frame.GetUndoCommandCount()).toBe(1);
    expect(frame.GetRedoCommandCount()).toBe(0);

    // A new edit clears the redo list.
    frame.GetSymbolFromUndoList();
    frame.SaveCopyInUndoList('Edit Symbol', frame.GetCurSymbol());
    expect(frame.GetRedoCommandCount()).toBe(0);
  });

  it('undo and redo with nothing on the list change nothing', () => {
    const symbol = open();
    frame.GetSymbolFromUndoList();
    frame.GetSymbolFromRedoList();

    expect(frame.GetCurSymbol() === symbol).toBe(true);
  });

  it('emptyScreen leaves no symbol and no library', () => {
    open();
    frame.emptyScreen();

    expect(frame.GetCurSymbol()).toBeNull();
    expect(frame.GetCurLib()).toBe('');
  });
});

describe('SYMBOL_EDITOR_MOVE_TOOL (symbol_editor_move_tool.cpp)', () => {
  const pinOf = (aUnit: number) =>
    frame
      .GetCurSymbol()!
      .GetPins()
      .find((p) => p.GetUnit() === aUnit)!;
  /** A position as plain numbers: the parser's y of 0 is -0 (a flipped axis). */
  const at = (aUnit: number) => {
    const p = pinOf(aUnit).GetPosition();
    return { x: p.x + 0, y: p.y + 0 };
  };

  function grabPin(aBefore: () => void = () => {}) {
    open();
    aBefore();
    const mgr = frame.GetToolManager()!;
    const pin = pinOf(1);
    const before = at(1);
    click(harness, before);
    harness.h.mouse = before;
    mgr.RunAction(SCH_ACTIONS.move);
    return { mgr, pin, before };
  }

  it('moves the selection by the cursor travel, on the grid, as one undo step into the buffer', () => {
    const { pin, before } = grabPin();
    const to = { x: before.x + 4 * G, y: before.y + 2 * G };

    mouse(harness, TA_MOUSE_MOTION, to);
    click(harness, to);

    expect(at(1)).toEqual(to);
    expect(frame.GetUndoCommandCount()).toBe(1);
    expect(frame.GetLibManager().IsSymbolModified('U', 'mine')).toBe(true);
    // The edit flags are cleared at the drop.
    expect(pin.IsMoving()).toBe(false);
  });

  it('follows every motion from where the last one left it, and marks what it moves', () => {
    const { before } = grabPin();
    const half = { x: before.x + 2 * G, y: before.y };
    const to = { x: before.x + 4 * G, y: before.y + 2 * G };

    mouse(harness, TA_MOUSE_MOTION, half);
    expect(pinOf(1).IsMoving()).toBe(true);
    mouse(harness, TA_MOUSE_MOTION, to);
    click(harness, to);

    expect(at(1)).toEqual(to);
  });

  it('leaves a symbol it cannot edit where it is (IsSymbolEditable)', () => {
    const { before } = grabPin(() => frame.SetSymbolOrigin(false, true));
    const to = { x: before.x + 4 * G, y: before.y };

    mouse(harness, TA_MOUSE_MOTION, to);
    click(harness, to);

    expect(at(1)).toEqual(before);
    expect(frame.GetUndoCommandCount()).toBe(0);
  });

  it('does not carry a pin of another unit that only shares the place, not the name', () => {
    const { before } = grabPin(() => pinOf(2).SetName('B'));
    const to = { x: before.x + 2 * G, y: before.y };

    mouse(harness, TA_MOUSE_MOTION, to);
    click(harness, to);

    expect(at(1)).toEqual(to);
    expect(at(2)).toEqual(before);
  });

  it('carries the interchangeable unit pin with it (SynchronizePins)', () => {
    const { before } = grabPin();
    const to = { x: before.x + 2 * G, y: before.y };

    mouse(harness, TA_MOUSE_MOTION, to);
    click(harness, to);

    expect(at(2)).toEqual(to);
  });

  it('a locked symbol moves only the pin picked', () => {
    open();
    frame.GetCurSymbol()!.LockUnits(true);
    frame.SetCurSymbol(frame.GetCurSymbol(), false);
    const mgr = frame.GetToolManager()!;
    const before = at(1);
    click(harness, before);
    harness.h.mouse = before;
    mgr.RunAction(SCH_ACTIONS.move);
    mouse(harness, TA_MOUSE_MOTION, { x: before.x + 2 * G, y: before.y });
    click(harness, { x: before.x + 2 * G, y: before.y });

    expect(at(1)).toEqual({ x: before.x + 2 * G, y: before.y });
    expect(at(2)).toEqual(before);
  });

  it('puts everything back on Escape, with nothing to undo', () => {
    const { mgr, before } = grabPin();

    mouse(harness, TA_MOUSE_MOTION, { x: before.x + 6 * G, y: before.y });
    mgr.RunAction(ACTIONS.cancelInteractive);

    // revertLibEdit: the copy taken at the start becomes the current symbol.
    expect(at(1)).toEqual(before);
    expect(at(2)).toEqual(before);
    expect(frame.GetUndoCommandCount()).toBe(0);
  });

  it('Align to Grid moves an item that is off the grid only up or down', () => {
    open();
    const pin = pinOf(1);
    pin.SetPosition({ x: 8 * G, y: 300 });
    frame.GetToolManager()!.GetTool(SCH_SELECTION_TOOL)!.AddItemToSel(pin, true);

    frame.GetToolManager()!.RunAction(SCH_ACTIONS.alignToGrid);

    expect(at(1)).toEqual({ x: 8 * G, y: 0 });
  });

  it('Align to Grid puts an item on the grid and rounds a pin length to it', () => {
    const symbol = open();
    const pin = pinOf(1);
    pin.SetPosition({ x: pin.GetPosition().x + 300, y: 0 });
    pin.SetLength(5 * G + 2000);
    frame.GetToolManager()!.GetTool(SCH_SELECTION_TOOL)!.AddItemToSel(pin, true);

    frame.GetToolManager()!.RunAction(SCH_ACTIONS.alignToGrid);

    expect(at(1)).toEqual({ x: 8 * G, y: 0 });
    expect(pin.GetLength()).toBe(5 * G);
    expect(frame.GetUndoCommandCount()).toBe(1);
    expect(frame.GetCurSymbol() === symbol).toBe(true);
  });
});
