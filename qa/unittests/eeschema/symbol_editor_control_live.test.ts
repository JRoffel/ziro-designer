// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * SYMBOL_EDITOR_CONTROL (eeschema/tools/symbol_editor_control.cpp), live on the symbol editor's
 * frame: the view toggles (the render settings, and symbol_editor.json for the three it
 * remembers), unit stepping, flattening a derived symbol in the buffer, the fields table.
 */
import { LIB_ID } from '@ziroeda/common/lib_id.js';
import type { TOOL_ACTION } from '@ziroeda/common/tool/tool_action.js';
import { ACTIONS } from '@ziroeda/common/tool/actions.js';
import { TA_NONE, TC_MESSAGE, TOOL_EVENT } from '@ziroeda/common/tool/tool_event.js';
import {
  SYMBOL_EDITOR_DEFAULTS,
  type SymbolEditorSettings,
  setSymbolEditorSettingsProvider,
  setUpdateSymbolEditorSettingsProvider,
} from '@ziroeda/eeschema/symbol_editor/symbol_editor_settings.js';
import { SCH_ACTIONS } from '@ziroeda/eeschema/tools/sch_actions.js';
import { wxID_OK } from '@ziroeda/wx/menu.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
let cfg: SymbolEditorSettings;
let asked: { name: string; arg: unknown }[] = [];
let propertiesToggled = 0;
let treeLibId: LIB_ID | null = null;
let treeShown = false;
let treeUpdates: string[] = [];

beforeEach(() => {
  cfg = structuredClone(SYMBOL_EDITOR_DEFAULTS);
  setSymbolEditorSettingsProvider(() => cfg);
  setUpdateSymbolEditorSettingsProvider((mutate) => mutate(cfg));
  asked = [];
  propertiesToggled = 0;
  treeLibId = null;
  treeShown = false;
  treeUpdates = [];
  t = symbolEditHarness(LIB, {
    showModal: async (name, _items, arg) => {
      asked.push({ name, arg });
      return wxID_OK;
    },
    toggleProperties: () => {
      propertiesToggled++;
    },
    getTreeLibId: () => treeLibId,
    isLibraryTreeShown: () => treeShown,
    updateLibraryTree: (aLibId) => treeUpdates.push(aLibId.Format()),
  });
  t.open();
});

afterEach(() => {
  t.dispose();
  setSymbolEditorSettingsProvider(() => SYMBOL_EDITOR_DEFAULTS);
  setUpdateSymbolEditorSettingsProvider(() => {});
});

const mgr = () => t.frame.GetToolManager()!;
const run = (aAction: TOOL_ACTION) => mgr().RunAction(aAction);
const rs = () => t.frame.GetRenderSettings()!;

async function settle() {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 0));
    mgr().ProcessEvent(new TOOL_EVENT(TC_MESSAGE, TA_NONE, 'test.flush'));
  }
}

describe('SYMBOL_EDITOR_CONTROL view toggles', () => {
  it('electrical types and pin numbers flip the render settings', () => {
    const types = rs().m_ShowPinsElectricalType;
    const numbers = rs().m_ShowPinNumbers;

    run(SCH_ACTIONS.showElectricalTypes);
    run(SCH_ACTIONS.showPinNumbers);

    expect(rs().m_ShowPinsElectricalType).toBe(!types);
    expect(rs().m_ShowPinNumbers).toBe(!numbers);
  });

  it('hidden pins, hidden fields and alternate-pin icons are remembered in symbol_editor.json', () => {
    run(SCH_ACTIONS.showHiddenPins);
    run(SCH_ACTIONS.showHiddenFields);
    run(SCH_ACTIONS.togglePinAltIcons);

    expect(cfg.show_hidden_lib_pins).toBe(!SYMBOL_EDITOR_DEFAULTS.show_hidden_lib_pins);
    expect(cfg.show_hidden_lib_fields).toBe(!SYMBOL_EDITOR_DEFAULTS.show_hidden_lib_fields);
    expect(cfg.show_pin_alt_icons).toBe(!SYMBOL_EDITOR_DEFAULTS.show_pin_alt_icons);
    expect(rs().m_ShowHiddenPins).toBe(cfg.show_hidden_lib_pins);
    expect(rs().m_ShowHiddenFields).toBe(cfg.show_hidden_lib_fields);
    expect(rs().m_ShowPinAltIcons).toBe(cfg.show_pin_alt_icons);

    run(SCH_ACTIONS.showHiddenPins);
    expect(cfg.show_hidden_lib_pins).toBe(SYMBOL_EDITOR_DEFAULTS.show_hidden_lib_pins);
    expect(rs().m_ShowHiddenPins).toBe(cfg.show_hidden_lib_pins);

    // Back the other way too, so each render setting is seen to follow, not just to start equal.
    run(SCH_ACTIONS.togglePinAltIcons);
    expect(cfg.show_pin_alt_icons).toBe(SYMBOL_EDITOR_DEFAULTS.show_pin_alt_icons);
    expect(rs().m_ShowPinAltIcons).toBe(cfg.show_pin_alt_icons);
  });

  it('synchronized pins mode flips the frame, and Show Properties asks the window', () => {
    const sync = t.frame.m_SyncPinEdit;

    run(SCH_ACTIONS.toggleSyncedPinsMode);
    run(ACTIONS.showProperties);

    expect(t.frame.m_SyncPinEdit).toBe(!sync);
    expect(propertiesToggled).toBe(1);
  });
});

describe('SYMBOL_EDITOR_CONTROL::ChangeUnit', () => {
  it('steps through the units and wraps both ways', () => {
    expect(t.frame.GetUnit()).toBe(1);
    run(SCH_ACTIONS.nextUnit);
    expect(t.frame.GetUnit()).toBe(2);
    run(SCH_ACTIONS.nextUnit);
    expect(t.frame.GetUnit()).toBe(1);
    run(SCH_ACTIONS.previousUnit);
    expect(t.frame.GetUnit()).toBe(2);
  });
});

describe('SYMBOL_EDITOR_CONTROL::FlattenSymbol', () => {
  it('replaces the derived symbol in the buffer with a flat one, and tells the tree', async () => {
    treeShown = true;
    treeLibId = new LIB_ID('mine', 'D');
    expect(t.frame.GetLibManager().GetBufferedSymbol('D', 'mine')!.IsDerived()).toBe(true);

    run(SCH_ACTIONS.flattenSymbol);
    await settle();

    const flat = t.frame.GetLibManager().GetBufferedSymbol('D', 'mine')!;
    expect(flat.IsDerived()).toBe(false);
    // It carries its parent's graphics now.
    expect([...flat.GetDrawItems()].length).toBeGreaterThan(2);
    expect(treeUpdates).toEqual(['mine:D']);
  });

  it('with the tree hidden it takes the loaded symbol', () => {
    treeShown = false;
    treeLibId = new LIB_ID('mine', 'D');
    expect(t.frame.GetTargetLibId().Format()).toBe('mine:U');
  });

  it('with nothing to flatten it says so', async () => {
    t.frame.emptyScreen();

    run(SCH_ACTIONS.flattenSymbol);
    await settle();

    expect(asked.map((a) => (a.arg as { message: string }).message)).toEqual([
      'No symbol to flatten',
    ]);
  });
});

describe('SYMBOL_EDITOR_CONTROL::ShowLibraryTable', () => {
  it('opens DIALOG_LIB_FIELDS_TABLE for the library, or for the related symbols', async () => {
    run(SCH_ACTIONS.showLibFieldsTable);
    await settle();
    run(SCH_ACTIONS.showRelatedLibFieldsTable);
    await settle();

    expect(asked.map((a) => [a.name, (a.arg as { scope: number }).scope])).toEqual([
      ['DIALOG_LIB_FIELDS_TABLE', 0],
      ['DIALOG_LIB_FIELDS_TABLE', 1],
    ]);
  });
});
