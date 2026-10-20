// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * SYMBOL_EDITOR_EDIT_TOOL's clipboard and Duplicate (eeschema/tools/symbol_editor_edit_tool.cpp),
 * live on the symbol editor's frame: Copy carries the selection as a symbol, Cut deletes it after,
 * Paste brings a symbol or plain text back through an interactive move, Duplicate numbers new pins
 * on from the highest.
 */
import { GetClipboardUTF8, SaveClipboard } from '@ziroeda/common/clipboard.js';
import type { EDA_ITEM } from '@ziroeda/common/eda_item.js';
import { ACTIONS } from '@ziroeda/common/tool/actions.js';
import type { TOOL_ACTION } from '@ziroeda/common/tool/tool_action.js';
import {
  TA_MOUSE_MOTION,
  TA_NONE,
  TC_MESSAGE,
  TOOL_EVENT,
} from '@ziroeda/common/tool/tool_event.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import { SCH_IO_KICAD_SEXPR } from '@ziroeda/eeschema/sch_io/kicad_sexpr/sch_io_kicad_sexpr.js';
import type { SCH_TEXT } from '@ziroeda/eeschema/sch_text.js';
import { SCH_SELECTION_TOOL } from '@ziroeda/eeschema/tools/sch_selection_tool.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { click, mouse } from './support/sch_tool_harness.js';
import { G, type SYMBOL_EDIT_HARNESS, symbolEditHarness } from './support/symbol_edit_harness.js';

let t: SYMBOL_EDIT_HARNESS;

beforeEach(() => {
  SaveClipboard('');
  t = symbolEditHarness();
  t.open();
});

afterEach(() => t.dispose());

const sym = () => t.frame.GetCurSymbol()!;
const mgr = () => t.frame.GetToolManager()!;
const pins = () => sym().GetPins();
const pin = (aUnit: number) => pins().find((p) => p.GetUnit() === aUnit)!;
const plain = (p: { x: number; y: number }) => ({ x: p.x + 0, y: p.y + 0 });
const select = (...aItems: EDA_ITEM[]) => {
  for (const i of aItems) mgr().GetTool(SCH_SELECTION_TOOL)!.AddItemToSel(i, true);
};
const run = (aAction: TOOL_ACTION) => mgr().RunAction(aAction);

async function settle() {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 0));
    mgr().ProcessEvent(new TOOL_EVENT(TC_MESSAGE, TA_NONE, 'test.flush'));
  }
}

/** Finish the interactive move a paste or duplicate starts: move to \a aTo and drop. */
async function dropAt(aTo: { x: number; y: number }) {
  mouse(t.harness, TA_MOUSE_MOTION, aTo);
  click(t.harness, aTo);
  await settle();
}

/** The clipboard read back as symbols, as Paste reads it. */
const clipboardSymbol = () =>
  SCH_IO_KICAD_SEXPR.ParseLibSymbols(GetClipboardUTF8(), 'Clipboard')[0]!;

describe('SYMBOL_EDITOR_EDIT_TOOL clipboard', () => {
  it('Copy puts the selection on the clipboard as a symbol holding only what was selected', () => {
    select(pin(1));
    run(ACTIONS.copy);

    const copied = clipboardSymbol();
    expect(copied.GetPins().map((p) => p.GetNumber())).toEqual(['1']);
    expect([...copied.GetDrawItems()].some((i) => i.Type() === KICAD_T.SCH_SHAPE_T)).toBe(false);
    // The symbol itself is untouched, its STRUCT_DELETED marks cleared again.
    expect(pins()).toHaveLength(2);
    expect([...sym().GetDrawItems()].every((i) => !i.HasFlag(1 << 13))).toBe(true);
  });

  it('Cut copies, then deletes as Delete does', () => {
    select(pin(1));
    run(ACTIONS.cut);

    expect(
      clipboardSymbol()
        .GetPins()
        .map((p) => p.GetNumber()),
    ).toEqual(['1']);
    // DoDelete takes the synchronized twin as well.
    expect(pins()).toHaveLength(0);
    expect(t.frame.GetUndoCommandCount()).toBe(1);
  });

  it('Copy As Text with nothing selected takes the item under the cursor, and leaves no selection', () => {
    t.harness.h.mouse = plain(pin(1).GetPosition());
    run(ACTIONS.copyAsText);

    expect(GetClipboardUTF8()).toContain('A');
    expect(mgr().GetTool(SCH_SELECTION_TOOL)!.GetSelection().Size()).toBe(0);
  });

  it('Copy As Text puts the selected text on the clipboard', () => {
    select(pin(1));
    run(ACTIONS.copyAsText);

    expect(GetClipboardUTF8()).toContain('A');
    expect(GetClipboardUTF8()).not.toContain('kicad_symbol_lib');
  });

  it('Paste brings a copied pin back, moved with the cursor, as one undo step', async () => {
    select(pin(1));
    run(ACTIONS.copy);
    mgr().GetTool(SCH_SELECTION_TOOL)!.ClearSelection();
    const before = pins().length;
    const fieldsBefore = [...sym().GetDrawItems()].filter(
      (i) => i.Type() === KICAD_T.SCH_FIELD_T,
    ).length;

    t.harness.h.mouse = plain(pin(1).GetPosition());
    run(ACTIONS.paste);
    await settle();
    await dropAt({ x: -6 * G, y: 6 * G });

    expect(pins()).toHaveLength(before + 1);
    expect(t.frame.GetUndoCommandCount()).toBe(1);
    // The copied symbol's fields (Reference, Value, ...) are not pasted as items.
    const fields = [...sym().GetDrawItems()].filter((i) => i.Type() === KICAD_T.SCH_FIELD_T);
    expect(fields.length).toBe(fieldsBefore);
    const pasted = pins().find((p) => !p.IsNew() && plain(p.GetPosition()).x === -6 * G);
    expect(pasted).toBeTruthy();
  });

  it('Paste of a bare word pastes nothing: the parser finds no symbol and says so without a throw', async () => {
    SaveClipboard('hello');

    run(ACTIONS.paste);
    await settle();

    expect([...sym().GetDrawItems()].some((i) => i.Type() === KICAD_T.SCH_TEXT_T)).toBe(false);
    expect(t.frame.GetUndoCommandCount()).toBe(0);
  });

  it('Paste of text that is not a symbol adds it as a text item', async () => {
    SaveClipboard('(hello)');

    run(ACTIONS.paste);
    await settle();
    await dropAt({ x: 2 * G, y: 2 * G });

    const texts = [...sym().GetDrawItems()].filter((i) => i.Type() === KICAD_T.SCH_TEXT_T);
    expect(texts.map((x) => (x as SCH_TEXT).GetText())).toEqual(['(hello)']);
  });

  it('Escape during the paste move puts nothing in', async () => {
    select(pin(1));
    run(ACTIONS.copy);
    mgr().GetTool(SCH_SELECTION_TOOL)!.ClearSelection();

    run(ACTIONS.paste);
    await settle();
    mouse(t.harness, TA_MOUSE_MOTION, { x: -6 * G, y: 6 * G });
    run(ACTIONS.cancelInteractive);
    await settle();

    expect(pins()).toHaveLength(2);
    expect(t.frame.GetUndoCommandCount()).toBe(0);
  });
});

describe('SYMBOL_EDITOR_EDIT_TOOL::Duplicate', () => {
  it('copies the selection, numbers a new pin on from the highest, and moves it into place', async () => {
    select(pin(1));
    t.harness.h.mouse = plain(pin(1).GetPosition());

    run(ACTIONS.duplicate);
    await settle();
    await dropAt({ x: -6 * G, y: 6 * G });

    // Pins 1 and 2 exist: the copy is 3.
    const copy = pins().find((p) => p.GetNumber() === '3')!;
    expect(copy).toBeTruthy();
    expect(copy.GetName()).toBe('A');
    expect(pins()).toHaveLength(3);
    expect(t.frame.GetUndoCommandCount()).toBe(1);
  });

  it('Escape during its move takes the copy back out', async () => {
    select(pin(1));

    run(ACTIONS.duplicate);
    await settle();
    run(ACTIONS.cancelInteractive);
    await settle();

    expect(pins()).toHaveLength(2);
    expect(t.frame.GetUndoCommandCount()).toBe(0);
  });
});

describe('SYMBOL_EDITOR_EDIT_TOOL::Paste into a derived symbol', () => {
  it('pastes nothing: a derived symbol takes its graphics from its parent', async () => {
    t.dispose();
    const prop = (aName: string, aValue: string) =>
      `(property "${aName}" "${aValue}" (at 0 0 0) (effects (font (size 1.27 1.27))))`;
    t = symbolEditHarness(`(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  (symbol "U" (in_bom yes) (on_board yes) ${prop('Reference', 'U')} ${prop('Value', 'U')})
  (symbol "D" (extends "U") ${prop('Reference', 'U')} ${prop('Value', 'D')}))`);
    t.open('D');
    expect(sym().IsDerived()).toBe(true);
    SaveClipboard('(hello)');
    const before = [...sym().GetDrawItems()].length;

    run(ACTIONS.paste);
    await settle();

    expect([...sym().GetDrawItems()].length).toBe(before);
    expect(t.frame.GetUndoCommandCount()).toBe(0);
  });
});
