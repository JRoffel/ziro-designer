// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * SYMBOL_EDIT_FRAME (eeschema/symbol_editor/symbol_edit_frame.cpp), live: its TOOL_MANAGER and
 * the symbol it shows - SetCurSymbol, SetUnit, OnModify into LIB_SYMBOL_LIBRARY_MANAGER's buffer -
 * and the selection tool picking the symbol's own items on the canvas.
 */
import {
  LIBRARY_TABLE,
  LIBRARY_TABLE_SCOPE,
  LIBRARY_TABLE_TYPE,
} from '@ziroeda/common/libraries/library_table.js';
import { PGM_BASE, Pgm, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { MEMORY_FILESYSTEM, wxMountFileSystem } from '@ziroeda/wx/filefn.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import { LIB_SYMBOL } from '@ziroeda/eeschema/lib_symbol.js';
import { SymbolLibAdapter } from '@ziroeda/eeschema/project_sch.js';
import type { SCH_EDIT_FRAME } from '@ziroeda/eeschema/sch_edit_frame.js';
import { SCH_SELECTION_TOOL } from '@ziroeda/eeschema/tools/sch_selection_tool.js';
import { SYMBOL_EDIT_FRAME } from '@ziroeda/eeschema/symbol_editor/symbol_edit_frame.js';
import { LIB_SYMBOL_LIBRARY_MANAGER } from '@ziroeda/eeschema/symbol_editor/lib_symbol_library_manager.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { click, schToolHarness, type SCH_HARNESS } from './support/sch_tool_harness.js';

const prop = (aName: string, aValue: string) =>
  `(property "${aName}" "${aValue}" (at 0 0 0) (effects (font (size 1.27 1.27))))`;

/** A two-unit symbol: a rectangle in unit 1, a pin at (10, 0) mm in each unit. */
const LIB_TEXT = `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  (symbol "U" (in_bom yes) (on_board yes)
    ${prop('Reference', 'U')} ${prop('Value', 'U')}
    (symbol "U_1_1"
      (rectangle (start -5 -5) (end 5 5) (stroke (width 0) (type default)) (fill (type none)))
      (pin input line (at 10 0 180) (length 5) (name "A" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27))))))
    (symbol "U_2_1"
      (pin input line (at 10 0 180) (length 5) (name "B" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27))))))))`;

let unmount: () => void = () => {};
let frame: SYMBOL_EDIT_FRAME;
let harness: SCH_HARNESS;

beforeEach(() => {
  SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER()));
  const fs = new MEMORY_FILESYSTEM();
  unmount = wxMountFileSystem('/libs', fs);
  fs.Write('mine.kicad_sym', new TextEncoder().encode(LIB_TEXT));
  Pgm()
    .GetLibraryManager()
    .SetTable(
      LIBRARY_TABLE_TYPE.SYMBOL,
      LIBRARY_TABLE_SCOPE.PROJECT,
      LIBRARY_TABLE.FromFile(
        '/libs/sym-lib-table',
        '(sym_lib_table (version 7) (lib (name "mine")(type "KiCad")(uri "/libs/mine.kicad_sym")(options "")(descr "")))',
        LIBRARY_TABLE_SCOPE.PROJECT,
        LIBRARY_TABLE_TYPE.SYMBOL,
      ),
    );
  SymbolLibAdapter(null).LoadOne('mine');

  frame = new SYMBOL_EDIT_FRAME({ libEdit: () => {} });
  harness = schToolHarness(frame as unknown as SCH_EDIT_FRAME);
});

afterEach(() => {
  unmount();
  SetPgm(null);
});

/** Open \\a aName of the library as LoadSymbolFromCurrentLib does: a copy of the buffered one. */
function open(aName = 'U'): LIB_SYMBOL {
  frame.SetCurLib('mine');
  const symbol = LIB_SYMBOL.copyOf(frame.GetLibManager().GetBufferedSymbol(aName, 'mine')!);
  frame.SetCurSymbol(symbol, true);
  return symbol;
}

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
    click(harness, mm(10, 0));
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
