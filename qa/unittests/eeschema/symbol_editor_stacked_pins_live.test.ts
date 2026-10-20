// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * SYMBOL_EDITOR_EDIT_TOOL's stacked pins and Update Symbol Fields
 * (eeschema/tools/symbol_editor_edit_tool.cpp), live on the symbol editor's frame. Every expected
 * notation is worked by hand from upstream's collapseRanges: numeric pins sorted first, a range for
 * three or more consecutive, the prefix groups in key order, non-numeric numbers last.
 */
import type { EDA_ITEM } from '@ziroeda/common/eda_item.js';
import { ELECTRICAL_PINTYPE } from '@ziroeda/common/pin_type.js';
import type { TOOL_ACTION } from '@ziroeda/common/tool/tool_action.js';
import { TA_NONE, TC_MESSAGE, TOOL_EVENT } from '@ziroeda/common/tool/tool_event.js';
import { SCH_ACTIONS } from '@ziroeda/eeschema/tools/sch_actions.js';
import { SCH_SELECTION_TOOL } from '@ziroeda/eeschema/tools/sch_selection_tool.js';
import { wxID_OK } from '@ziroeda/wx/menu.js';
import { afterEach, describe, expect, it } from 'vitest';
import { type SYMBOL_EDIT_HARNESS, symbolEditHarness } from './support/symbol_edit_harness.js';

const prop = (aName: string, aValue: string) =>
  `(property "${aName}" "${aValue}" (at 0 0 0) (effects (font (size 1.27 1.27))))`;
const pinText = (aNumber: string, aY = 0, aType = 'input', aName = 'P', aHide = '') =>
  `(pin ${aType} line (at 10.16 ${aY} 180) (length 5.08) ${aHide} (name "${aName}" (effects (font (size 1.27 1.27)))) (number "${aNumber}" (effects (font (size 1.27 1.27)))))`;
const lib = (aBody: string, aExtra = '') =>
  `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  (symbol "U" (in_bom yes) (on_board yes) ${prop('Reference', 'U')} ${prop('Value', 'U')}
    (symbol "U_1_1" ${aBody}))${aExtra})`;

let t: SYMBOL_EDIT_HARNESS;
let errors: string[] = [];
let asked: string[] = [];

function setUp(aLib: string, aName = 'U') {
  errors = [];
  asked = [];
  t = symbolEditHarness(aLib, {
    showModal: async (aName) => {
      asked.push(aName);
      return wxID_OK;
    },
  });
  t.frame.ShowInfoBarError = (aMsg: string) => {
    errors.push(aMsg);
  };
  t.open(aName);
}

afterEach(() => t.dispose());

const sym = () => t.frame.GetCurSymbol()!;
const mgr = () => t.frame.GetToolManager()!;
const numbers = () =>
  sym()
    .GetPins()
    .map((p) => p.GetNumber())
    .sort();
const pin = (aNumber: string) =>
  sym()
    .GetPins()
    .find((p) => p.GetNumber() === aNumber)!;
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

describe('SYMBOL_EDITOR_EDIT_TOOL::ConvertStackedPins', () => {
  it('folds the pins at one place into the first, numbered with collapsed ranges', () => {
    setUp(lib(['3', '1', '2', '5', 'A2', 'A3', 'A4', 'X'].map((n) => pinText(n)).join(' ')));
    select(pin('3'));

    run(SCH_ACTIONS.convertStackedPins);

    expect(numbers()).toEqual(['[1-3,5,A2-A4,X]']);
    expect(t.frame.GetUndoCommandCount()).toBe(1);
  });

  it('the pin kept is the lowest number, compared as a number: 9 before 10', () => {
    setUp(lib([pinText('10', 0, 'input', 'TEN'), pinText('9', 0, 'input', 'NINE')].join(' ')));
    select(pin('10'));

    run(SCH_ACTIONS.convertStackedPins);

    expect(numbers()).toEqual(['[9,10]']);
    expect(sym().GetPins()[0]!.GetName()).toBe('NINE');
  });

  it('a numbered pin is kept before a named one, even one that sorts before digits', () => {
    // '#' sorts below the digits, so the symbol's own item order puts '#A' first: only the
    // numeric-first rule makes '5' the pin kept.
    setUp(lib([pinText('#A', 0, 'input', 'HASH'), pinText('5', 0, 'input', 'FIVE')].join(' ')));
    select(pin('#A'));

    run(SCH_ACTIONS.convertStackedPins);

    expect(numbers()).toEqual(['[5,#A]']);
    expect(sym().GetPins()[0]!.GetName()).toBe('FIVE');
  });

  it('two consecutive numbers stay a list, not a range', () => {
    setUp(lib([pinText('2'), pinText('1')].join(' ')));
    select(pin('1'));

    run(SCH_ACTIONS.convertStackedPins);

    expect(numbers()).toEqual(['[1,2]']);
  });

  it('a lone pin cannot be stacked, and says so', () => {
    setUp(lib([pinText('1'), pinText('2', 2.54)].join(' ')));
    select(pin('1'));

    run(SCH_ACTIONS.convertStackedPins);

    expect(errors).toEqual(['At least two pins are needed to convert to stacked pins']);
    expect(numbers()).toEqual(['1', '2']);
  });

  it('selected pins in different places are refused', () => {
    setUp(lib([pinText('1'), pinText('2', 2.54)].join(' ')));
    select(pin('1'), pin('2'));

    run(SCH_ACTIONS.convertStackedPins);

    expect(errors).toEqual(['All pins must be at the same location']);
    expect(t.frame.GetUndoCommandCount()).toBe(0);
  });
});

describe('SYMBOL_EDITOR_EDIT_TOOL::ExplodeStackedPin', () => {
  it('keeps the smallest number visible and adds the rest as hidden pins in the same place', () => {
    // Hidden to start with: exploding makes the kept pin visible.
    setUp(lib(pinText('[1-3]', 0, 'power_in', 'P', 'hide')));
    expect(pin('[1-3]').IsVisible()).toBe(false);
    select(pin('[1-3]'));

    run(SCH_ACTIONS.explodeStackedPin);

    expect(numbers()).toEqual(['1', '2', '3']);
    expect(pin('1').IsVisible()).toBe(true);
    expect(pin('2').IsVisible()).toBe(false);
    expect(pin('3').IsVisible()).toBe(false);
    expect(pin('2').GetPosition()).toEqual(pin('1').GetPosition());
    // Hidden power inputs act as global labels upstream, so the new ones are passive.
    expect(pin('1').GetType()).toBe(ELECTRICAL_PINTYPE.PT_POWER_IN);
    expect(pin('2').GetType()).toBe(ELECTRICAL_PINTYPE.PT_PASSIVE);
    expect(t.frame.GetUndoCommandCount()).toBe(1);
  });

  it('a pin without stacked notation is refused', () => {
    setUp(lib(pinText('7')));
    select(pin('7'));

    run(SCH_ACTIONS.explodeStackedPin);

    expect(errors).toEqual(['Selected pin does not have valid stacked notation']);
    expect(numbers()).toEqual(['7']);
  });
});

describe('SYMBOL_EDITOR_EDIT_TOOL::UpdateSymbolFields', () => {
  it('a symbol that is not derived says so and opens nothing', async () => {
    setUp(lib(pinText('1')));

    run(SCH_ACTIONS.updateSymbolFields);
    await settle();

    expect(errors).toEqual(['Symbol is not derived from another symbol.']);
    expect(asked).toEqual([]);
  });

  it('a derived symbol opens DIALOG_UPDATE_SYMBOL_FIELDS', async () => {
    setUp(
      lib(
        pinText('1'),
        `\n  (symbol "D" (extends "U") ${prop('Reference', 'U')} ${prop('Value', 'D')})`,
      ),
      'D',
    );

    run(SCH_ACTIONS.updateSymbolFields);
    await settle();

    expect(errors).toEqual([]);
    expect(asked).toEqual(['DIALOG_UPDATE_SYMBOL_FIELDS']);
  });
});
