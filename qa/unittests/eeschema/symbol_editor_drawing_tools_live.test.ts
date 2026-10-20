// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * SYMBOL_EDITOR_DRAWING_TOOLS (eeschema/tools/symbol_editor_drawing_tools.cpp), live on the symbol
 * editor's frame: placing a pin (CreatePin's dialog, then PlacePin and the image pins of the other
 * units), Repeat Last Item (RepeatPin), placing text, and moving the anchor.
 */
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
import type { SCH_PIN } from '@ziroeda/eeschema/sch_pin.js';
import type { SCH_TEXT } from '@ziroeda/eeschema/sch_text.js';
import { SCH_ACTIONS } from '@ziroeda/eeschema/tools/sch_actions.js';
import { ResetLastPinProperties } from '@ziroeda/eeschema/tools/symbol_editor_pin_tool.js';
import { wxID_CANCEL, wxID_OK } from '@ziroeda/wx/menu.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { click, mouse } from './support/sch_tool_harness.js';
import { G, type SYMBOL_EDIT_HARNESS, symbolEditHarness } from './support/symbol_edit_harness.js';

let t: SYMBOL_EDIT_HARNESS;
let shown: string[] = [];
/** What the window's dialog does: fill the item and answer. */
let dialog: (aName: string, aItem: EDA_ITEM) => number = () => wxID_OK;

beforeEach(() => {
  ResetLastPinProperties();
  shown = [];
  dialog = () => wxID_OK;
  t = symbolEditHarness(undefined, {
    showModal: async (aName, aItems) => {
      shown.push(aName);
      return dialog(aName, aItems[0]!);
    },
  });
  t.open();
});

afterEach(() => t.dispose());

const sym = () => t.frame.GetCurSymbol()!;
const pins = () => sym().GetPins();
const plain = (p: { x: number; y: number }) => ({ x: p.x + 0, y: p.y + 0 });
const run = (aAction: TOOL_ACTION) => t.frame.GetToolManager()!.RunAction(aAction);

/** Let a dialog's promise settle and the tool waiting on it run on. */
async function settle() {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 0));
    t.frame.GetToolManager()!.ProcessEvent(new TOOL_EVENT(TC_MESSAGE, TA_NONE, 'test.flush'));
  }
}

/** A click that first moves there, as a pointer does. */
async function clickAt(aAt: { x: number; y: number }) {
  mouse(t.harness, TA_MOUSE_MOTION, aAt);
  click(t.harness, aAt);
  await settle();
}

/**
 * Run Draw Pins. With immediate actions (the default) the tool primes itself with a click at the
 * cursor, which creates the pin through DIALOG_PIN_PROPERTIES; the next click places it.
 */
async function placePin(aAt: { x: number; y: number }, aNumber = '5') {
  dialog = (aName, aItem) => {
    if (aName === 'DIALOG_PIN_PROPERTIES') (aItem as SCH_PIN).SetNumber(aNumber);
    return wxID_OK;
  };
  t.harness.h.mouse = aAt;
  run(SCH_ACTIONS.placeSymbolPin);
  await settle();
  await clickAt(aAt);
  run(ACTIONS.cancelInteractive);
  await settle();
}

describe('SYMBOL_EDITOR_DRAWING_TOOLS::TwoClickPlace', () => {
  it('places a pin where it is clicked, after its properties dialog, as one undo step', async () => {
    const at = { x: -4 * G, y: 2 * G };
    await placePin(at);

    expect(shown).toContain('DIALOG_PIN_PROPERTIES');
    const placed = pins().find((p) => p.GetNumber() === '5')!;
    expect(placed).toBeTruthy();
    expect(plain(placed.GetPosition())).toEqual(at);
    expect(placed.IsNew()).toBe(false);
    expect(t.frame.GetUndoCommandCount()).toBe(1);
  });

  it('gives the other interchangeable unit an image pin, numbered for it (CreateImagePins)', async () => {
    await placePin({ x: -4 * G, y: 2 * G });

    const image = pins().find((p) => p.GetNumber() === '5-UB');
    expect(image).toBeTruthy();
    expect(image!.GetUnit()).toBe(2);
  });

  it('a cancelled pin dialog places nothing', async () => {
    dialog = () => wxID_CANCEL;
    const before = pins().length;
    t.harness.h.mouse = { x: -4 * G, y: 2 * G };
    run(SCH_ACTIONS.placeSymbolPin);
    await settle();
    await clickAt({ x: -4 * G, y: 2 * G });
    run(ACTIONS.cancelInteractive);
    await settle();

    expect(pins()).toHaveLength(before);
    expect(t.frame.GetUndoCommandCount()).toBe(0);
  });

  it('places text with its dialog, and none when the text is empty', async () => {
    dialog = (aName, aItem) => {
      if (aName === 'DIALOG_TEXT_PROPERTIES') (aItem as SCH_TEXT).SetText('Hi');
      return wxID_OK;
    };
    const at = { x: 2 * G, y: -2 * G };
    t.harness.h.mouse = at;
    run(SCH_ACTIONS.placeSymbolText);
    await settle();
    await clickAt(at);
    run(ACTIONS.cancelInteractive);
    await settle();

    const texts = [...sym().GetDrawItems()].filter((i) => i.Type() === KICAD_T.SCH_TEXT_T);
    expect(texts.map((x) => (x as SCH_TEXT).GetText())).toEqual(['Hi']);
    expect(plain(texts[0]!.GetPosition())).toEqual(at);
  });

  it('places no text when the dialog is left with nothing printable in it', async () => {
    dialog = (aName, aItem) => {
      if (aName === 'DIALOG_TEXT_PROPERTIES') (aItem as SCH_TEXT).SetText('  ');
      return wxID_OK;
    };
    const at = { x: 2 * G, y: -2 * G };
    t.harness.h.mouse = at;
    run(SCH_ACTIONS.placeSymbolText);
    await settle();
    await clickAt(at);
    run(ACTIONS.cancelInteractive);
    await settle();

    expect([...sym().GetDrawItems()].some((i) => i.Type() === KICAD_T.SCH_TEXT_T)).toBe(false);
  });
});

describe('SYMBOL_EDITOR_DRAWING_TOOLS::RepeatDrawItem', () => {
  it('repeats the last pin one pin step on, its number incremented', async () => {
    const at = { x: -4 * G, y: 2 * G };
    await placePin(at, '5');

    run(SCH_ACTIONS.repeatDrawItem);
    await settle();

    const repeated = pins().find((p) => p.GetNumber() === '6')!;
    expect(repeated).toBeTruthy();
    // repeat.pin_step is 100 mil; a PIN_RIGHT pin steps in y.
    expect(plain(repeated.GetPosition())).toEqual({ x: at.x, y: at.y + 2 * G });
    // Place Pin, then Repeat Pin: one undo step each.
    expect(t.frame.GetUndoCommandCount()).toBe(2);
  });

  it('a second repeat goes on from the repeated pin', async () => {
    const at = { x: -4 * G, y: 2 * G };
    await placePin(at, '5');

    run(SCH_ACTIONS.repeatDrawItem);
    await settle();
    run(SCH_ACTIONS.repeatDrawItem);
    await settle();

    const second = pins().find((p) => p.GetNumber() === '7')!;
    expect(second).toBeTruthy();
    expect(plain(second.GetPosition())).toEqual({ x: at.x, y: at.y + 4 * G });
  });
});

describe('SYMBOL_EDITOR_DRAWING_TOOLS::PlaceAnchor', () => {
  it('moves the whole symbol so the clicked point becomes its anchor', async () => {
    const before = plain(pins()[0]!.GetPosition());
    const at = { x: 2 * G, y: 4 * G };
    run(SCH_ACTIONS.placeSymbolAnchor);
    await settle();
    await clickAt(at);
    run(ACTIONS.cancelInteractive);
    await settle();

    expect(plain(pins()[0]!.GetPosition())).toEqual({ x: before.x - at.x, y: before.y - at.y });
  });
});
