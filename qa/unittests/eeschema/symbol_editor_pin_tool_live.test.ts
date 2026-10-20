// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * SYMBOL_EDITOR_PIN_TOOL (eeschema/tools/symbol_editor_pin_tool.cpp), live on the symbol editor's
 * frame: PlacePin's clash question when a moved pin lands on another unit's pin, the other units
 * kept in step after an edit (SynchronizeOtherUnits), and pushing one pin's length and text sizes.
 *
 * CreatePin and RepeatPin are reached from SYMBOL_EDITOR_DRAWING_TOOLS, the next stage; they are
 * pinned there.
 */
import type { KiDialogRequest } from '@ziroeda/common/kidialog.js';
import type { KiDialogResult } from '@ziroeda/common/kidialog_do_not_show.js';
import {
  TA_MOUSE_MOTION,
  TA_NONE,
  TC_MESSAGE,
  TOOL_EVENT,
} from '@ziroeda/common/tool/tool_event.js';
import type { TOOL_ACTION } from '@ziroeda/common/tool/tool_action.js';
import { SCH_PIN } from '@ziroeda/eeschema/sch_pin.js';
import { SCH_ACTIONS } from '@ziroeda/eeschema/tools/sch_actions.js';
import { SCH_SELECTION_TOOL } from '@ziroeda/eeschema/tools/sch_selection_tool.js';
import { SYMBOL_EDITOR_PIN_TOOL } from '@ziroeda/eeschema/tools/symbol_editor_pin_tool.js';
import { afterEach, describe, expect, it } from 'vitest';
import { click, mouse } from './support/sch_tool_harness.js';
import { G, type SYMBOL_EDIT_HARNESS, symbolEditHarness } from './support/symbol_edit_harness.js';

const prop = (aName: string, aValue: string) =>
  `(property "${aName}" "${aValue}" (at 0 0 0) (effects (font (size 1.27 1.27))))`;
const pinText = (aName: string, aNumber: string, aY: number) =>
  `(pin input line (at 10.16 ${aY} 180) (length 5.08) (name "${aName}" (effects (font (size 1.27 1.27)))) (number "${aNumber}" (effects (font (size 1.27 1.27)))))`;

/** Two interchangeable units, pin A in each at (10.16, 0); unit 2 also has pin C 100 mil below. */
const LIB = `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  (symbol "U" (in_bom yes) (on_board yes)
    ${prop('Reference', 'U')} ${prop('Value', 'U')}
    (symbol "U_1_1" ${pinText('A', '1', 0)})
    (symbol "U_2_1" ${pinText('A', '2', 0)} ${pinText('C', '3', -2.54)})))`;

let t: SYMBOL_EDIT_HARNESS;
let asked: KiDialogRequest[] = [];
let answer: KiDialogResult = 'cancel';

function setUp(aLib = LIB) {
  asked = [];
  t = symbolEditHarness(aLib, {
    askKiDialog: async (aRequest) => {
      asked.push(aRequest);
      return answer;
    },
  });
  t.open();
}

afterEach(() => t.dispose());

const sym = () => t.frame.GetCurSymbol()!;
const pin = (aNumber: string) =>
  sym()
    .GetPins()
    .find((p) => p.GetNumber() === aNumber)!;
const at = (aNumber: string) => {
  const p = pin(aNumber).GetPosition();
  return { x: p.x + 0, y: p.y + 0 };
};
const run = (aAction: TOOL_ACTION) => t.frame.GetToolManager()!.RunAction(aAction);

/** Let a dialog's promise settle and the tool waiting on it run on. */
async function settle() {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 0));
    t.frame.GetToolManager()!.ProcessEvent(new TOOL_EVENT(TC_MESSAGE, TA_NONE, 'test.flush'));
  }
}

/**
 * Show unit 2 and drop its pin C on pin A's place. C has no twin in unit 1, so it is the lone pin
 * the drop hands to PlacePin (a pin with synchronized twins is moved with them, and upstream only
 * places a lone pin).
 */
async function dropPin3OnPinA() {
  t.frame.SetUnit(2);
  const from = at('3');
  const to = at('1');
  click(t.harness, from);
  t.harness.h.mouse = from;
  run(SCH_ACTIONS.move);
  mouse(t.harness, TA_MOUSE_MOTION, to);
  click(t.harness, to);
  await settle();
  return { from, to };
}

describe('SYMBOL_EDITOR_PIN_TOOL::PlacePin', () => {
  it("asks before a pin lands on another unit's pin, and Cancel puts the move back", async () => {
    setUp();
    answer = 'cancel';
    const { from } = await dropPin3OnPinA();

    expect(asked).toHaveLength(1);
    expect(asked[0]!.message).toMatch(
      /^This position is already occupied by another pin, in unit [12]\.$/,
    );
    expect(asked[0]!.labels?.ok).toBe('Place Pin Anyway');
    expect(asked[0]!.doNotShowKey).toBe('eeschema/tools/symbol_editor_pin_tool.cpp:PlacePin');
    expect(at('3')).toEqual(from);
    expect(t.frame.GetUndoCommandCount()).toBe(0);
  });

  it('Place Pin Anyway drops it there, as one undo step', async () => {
    setUp();
    answer = 'ok';
    const { to } = await dropPin3OnPinA();

    expect(asked).toHaveLength(1);
    expect(at('3')).toEqual(to);
    expect(t.frame.GetUndoCommandCount()).toBe(1);
  });

  it('asks nothing when the units are not synchronized', async () => {
    setUp();
    sym().LockUnits(true);
    t.frame.SetCurSymbol(sym(), false);
    const { to } = await dropPin3OnPinA();

    expect(asked).toHaveLength(0);
    expect(at('3')).toEqual(to);
  });
});

describe('SYMBOL_EDITOR_PIN_TOOL::SynchronizeOtherUnits', () => {
  it('carries an edit to the matching pin of each other unit, and only that pin', () => {
    setUp();
    const p1 = pin('1');
    const original = p1.Clone() as SCH_PIN;
    p1.SetName('Z');
    p1.SetLength(7 * G);
    p1.SetNameTextSize(4 * G);

    const removed = SYMBOL_EDITOR_PIN_TOOL.SynchronizeOtherUnits(sym(), p1, original);

    expect(removed).toBe(0);
    expect(pin('2').GetName()).toBe('Z');
    expect(pin('2').GetLength()).toBe(7 * G);
    expect(pin('2').GetNameTextSize()).toBe(4 * G);
    expect(pin('3').GetName()).toBe('C');
    expect(pin('3').GetLength()).toBe(4 * G);
  });

  it('a pin made common to all units deletes the matching pins it now covers', () => {
    setUp();
    const p1 = pin('1');
    const original = p1.Clone() as SCH_PIN;
    p1.SetUnit(0);

    const removed = SYMBOL_EDITOR_PIN_TOOL.SynchronizeOtherUnits(sym(), p1, original);

    expect(removed).toBe(1);
    expect(
      sym()
        .GetPins()
        .map((p) => p.GetNumber())
        .sort(),
    ).toEqual(['1', '3']);
  });

  it('changes one pin per other unit, so pins stacked in a unit stay separately editable', () => {
    setUp(`(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  (symbol "U" (in_bom yes) (on_board yes)
    ${prop('Reference', 'U')} ${prop('Value', 'U')}
    (symbol "U_1_1" ${pinText('A', '1', 0)})
    (symbol "U_2_1" ${pinText('A', '2', 0)} ${pinText('A', '4', 0)})))`);
    const p1 = pin('1');
    const original = p1.Clone() as SCH_PIN;
    p1.SetName('Z');

    SYMBOL_EDITOR_PIN_TOOL.SynchronizeOtherUnits(sym(), p1, original);

    expect([pin('2').GetName(), pin('4').GetName()].sort()).toEqual(['A', 'Z']);
  });

  it('leaves a pin that did not match the original', () => {
    setUp();
    const p1 = pin('1');
    p1.SetName('Q');
    const original = p1.Clone() as SCH_PIN;
    p1.SetLength(7 * G);

    SYMBOL_EDITOR_PIN_TOOL.SynchronizeOtherUnits(sym(), p1, original);

    expect(pin('2').GetLength()).toBe(4 * G);
  });
});

describe('SYMBOL_EDITOR_PIN_TOOL::PushPinProperties', () => {
  function pushFrom1(aAction: TOOL_ACTION, aSet: (p: SCH_PIN) => void) {
    setUp();
    aSet(pin('1'));
    t.frame.GetToolManager()!.GetTool(SCH_SELECTION_TOOL)!.AddItemToSel(pin('1'), true);
    run(aAction);
  }

  it('pushes the length to every other pin, as one undo step', () => {
    pushFrom1(SCH_ACTIONS.pushPinLength, (p) => p.SetLength(7 * G));

    expect(pin('2').GetLength()).toBe(7 * G);
    expect(pin('3').GetLength()).toBe(7 * G);
    expect(t.frame.GetUndoCommandCount()).toBe(1);
  });

  it('pushes the name size, and only that', () => {
    pushFrom1(SCH_ACTIONS.pushPinNameSize, (p) => {
      p.SetNameTextSize(3 * G);
      p.SetNumberTextSize(4 * G);
      p.SetLength(7 * G);
    });

    expect(pin('3').GetNameTextSize()).toBe(3 * G);
    expect(pin('3').GetNumberTextSize()).not.toBe(4 * G);
    expect(pin('3').GetLength()).toBe(4 * G);
  });

  it('pushes the number size', () => {
    pushFrom1(SCH_ACTIONS.pushPinNumSize, (p) => p.SetNumberTextSize(4 * G));

    expect(pin('2').GetNumberTextSize()).toBe(4 * G);
  });
});
