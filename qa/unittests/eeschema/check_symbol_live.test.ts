// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * `SCH_INSPECTION_TOOL::CheckSymbol` (sch_inspection_tool.cpp:270) on the live symbol editor: the
 * current symbol through CheckLibSymbol, "No symbol issues found." for a clean one, the warnings
 * in a "Symbol Warnings" HTML_MESSAGE_BOX otherwise, and nothing with no symbol open.
 */
import { SetInfoPresenter } from '@ziroeda/common/confirm.js';
import { SCH_ACTIONS } from '@ziroeda/eeschema/tools/sch_actions.js';
import { afterEach, describe, expect, it } from 'vitest';
import { type SYMBOL_EDIT_HARNESS, symbolEditHarness } from './support/symbol_edit_harness.js';

const effects = '(effects (font (size 1.27 1.27)))';
const prop = (aName: string, aValue: string) =>
  `(property "${aName}" "${aValue}" (at 0 0 0) ${effects})`;
const pin = (aNumber: string, aX: number) =>
  `(pin input line (at ${aX} 0 0) (length 2.54) (name "A" ${effects}) (number "${aNumber}" ${effects}))`;

/** C: clean. D: two pins numbered 1, one of them off the 50 mil grid. */
const LIB = `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  (symbol "C" ${prop('Reference', 'U')} ${prop('Value', 'C')} (symbol "C_1_1" ${pin('1', 0)} ${pin('2', 2.54)}))
  (symbol "D" ${prop('Reference', 'U')} ${prop('Value', 'D')} (symbol "D_1_1" ${pin('1', 0)} ${pin('1', 1.0)})))`;

let t: SYMBOL_EDIT_HARNESS;
let infos: string[];
let boxes: { dialog: string; arg: unknown }[];

function setUp(aName?: string) {
  infos = [];
  boxes = [];
  SetInfoPresenter(async (m) => {
    infos.push(m);
  });
  t = symbolEditHarness(LIB, {
    showModal: async (aDialog, _aItems, aArg) => {
      boxes.push({ dialog: aDialog, arg: aArg });
      return 5100;
    },
  });
  if (aName) t.open(aName);
}

afterEach(() => {
  t?.dispose();
  SetInfoPresenter(async () => {});
});

describe('CheckSymbol', () => {
  it('a clean symbol: "No symbol issues found."', () => {
    setUp('C');
    t.frame.GetToolManager()!.RunAction(SCH_ACTIONS.checkSymbol);
    expect(infos).toEqual(['No symbol issues found.']);
    expect(boxes.length).toBe(0);
  });

  it('warnings go to a Symbol Warnings HTML box', () => {
    setUp('D');
    t.frame.GetToolManager()!.RunAction(SCH_ACTIONS.checkSymbol);
    expect(infos.length).toBe(0);
    expect(boxes.length).toBe(1);
    expect(boxes[0]!.dialog).toBe('HTML_MESSAGE_BOX');
    const arg = boxes[0]!.arg as { caption: string; html: string };
    expect(arg.caption).toBe('Symbol Warnings');
    expect(arg.html).toContain('Duplicate pin 1');
    expect(arg.html).toContain('Off grid pin 1');
  });

  it('no symbol open: nothing', () => {
    setUp();
    t.frame.GetToolManager()!.RunAction(SCH_ACTIONS.checkSymbol);
    expect([infos.length, boxes.length]).toEqual([0, 0]);
  });
});
