// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * Preferences > Symbol Editor > Editing Options, read where upstream reads them - the tools, off
 * `libeditconfig()`, never the window:
 *
 *  - `m_Defaults.pin_length / pin_name_size / pin_num_size`: a new pin's (symbol_editor_pin_tool.cpp:50-79);
 *  - `m_Repeat.pin_step / label_delta`: RepeatPin's step and increment (:427-445);
 *  - `m_Defaults.text_size`: new text, before its dialog (symbol_editor_drawing_tools.cpp:238);
 *  - `m_Defaults.line_width`: a new shape's stroke (:480);
 *  - `m_dragPinsAlongWithEdges`: SCH_POINT_EDITOR::dragPinsOnEdge (sch_point_editor.cpp:652).
 *
 * Every value is off its default, so a reader stuck on the default fails.
 */
import type { EDA_ITEM } from '@ziroeda/common/eda_item.js';
import { schIUScale } from '@ziroeda/common/eda_units.js';
import { SHAPE_T } from '@ziroeda/common/eda_shape.js';
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
import type { SCH_SHAPE } from '@ziroeda/eeschema/sch_shape.js';
import type { SCH_TEXT } from '@ziroeda/eeschema/sch_text.js';
import {
  SYMBOL_EDITOR_DEFAULTS,
  type SymbolEditorSettings,
  setSymbolEditorSettingsProvider,
} from '@ziroeda/eeschema/symbol_editor/symbol_editor_settings.js';
import { SCH_ACTIONS } from '@ziroeda/eeschema/tools/sch_actions.js';
import { ResetLastPinProperties } from '@ziroeda/eeschema/tools/symbol_editor_pin_tool.js';
import { wxID_OK } from '@ziroeda/wx/menu.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { click, drag, mouse } from './support/sch_tool_harness.js';
import { G, type SYMBOL_EDIT_HARNESS, symbolEditHarness } from './support/symbol_edit_harness.js';

let t: SYMBOL_EDIT_HARNESS;
let cfg: SymbolEditorSettings;
/** What the window's dialog does: fill the item and answer. */
let dialog: (aName: string, aItem: EDA_ITEM) => number;

beforeEach(() => {
  cfg = structuredClone(SYMBOL_EDITOR_DEFAULTS);
  cfg.defaults.pin_length = 150;
  cfg.defaults.pin_name_size = 60;
  cfg.defaults.pin_num_size = 40;
  cfg.defaults.text_size = 80;
  cfg.defaults.line_width = 12;
  cfg.repeat.pin_step = 200;
  cfg.repeat.label_delta = 2;
  setSymbolEditorSettingsProvider(() => cfg);
  // The g_LastPin* sentinels: read from the settings on first use.
  ResetLastPinProperties();
  dialog = () => wxID_OK;
  t = symbolEditHarness(undefined, {
    showModal: async (aName, aItems) => dialog(aName, aItems[0]!),
  });
  t.open();
});

afterEach(() => {
  t.dispose();
  setSymbolEditorSettingsProvider(() => SYMBOL_EDITOR_DEFAULTS);
  ResetLastPinProperties();
});

const sym = () => t.frame.GetCurSymbol()!;
const run = (aAction: TOOL_ACTION) => t.frame.GetToolManager()!.RunAction(aAction);
const mils = (aMils: number) => schIUScale.milsToIU(aMils);

async function settle() {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 0));
    t.frame.GetToolManager()!.ProcessEvent(new TOOL_EVENT(TC_MESSAGE, TA_NONE, 'test.flush'));
  }
}

async function clickAt(aAt: { x: number; y: number }) {
  mouse(t.harness, TA_MOUSE_MOTION, aAt);
  click(t.harness, aAt);
  await settle();
}

async function placePin(aAt: { x: number; y: number }) {
  dialog = (aName, aItem) => {
    if (aName === 'DIALOG_PIN_PROPERTIES') (aItem as SCH_PIN).SetNumber('5');
    return wxID_OK;
  };
  t.harness.h.mouse = aAt;
  run(SCH_ACTIONS.placeSymbolPin);
  await settle();
  await clickAt(aAt);
  run(ACTIONS.cancelInteractive);
  await settle();
}

describe('the pin tool', () => {
  it('gives a new pin the default length, name size and number size', async () => {
    await placePin({ x: -8 * G, y: 2 * G });
    const pin = sym()
      .GetPins()
      .find((p) => p.GetNumber() === '5')!;
    expect([pin.GetLength(), pin.GetNameTextSize(), pin.GetNumberTextSize()]).toEqual([
      mils(150),
      mils(60),
      mils(40),
    ]);
  });

  it('repeats by the pitch and the label increment', async () => {
    const at = { x: -8 * G, y: 2 * G };
    await placePin(at);
    run(SCH_ACTIONS.repeatDrawItem);
    await settle();

    // A PIN_RIGHT pin steps in y; "5" + 2 is "7".
    const repeated = sym()
      .GetPins()
      .find((p) => p.GetNumber() === '7')!;
    expect(repeated).toBeTruthy();
    expect(repeated.GetPosition().y - at.y).toBe(mils(200));
  });
});

describe('the drawing tools', () => {
  it('open new text at the default size', async () => {
    let size = 0;
    dialog = (aName, aItem) => {
      if (aName === 'DIALOG_TEXT_PROPERTIES') {
        size = (aItem as SCH_TEXT).GetTextHeight();
        (aItem as SCH_TEXT).SetText('Hi');
      }
      return wxID_OK;
    };
    const at = { x: 2 * G, y: -2 * G };
    t.harness.h.mouse = at;
    run(SCH_ACTIONS.placeSymbolText);
    await settle();
    await clickAt(at);
    run(ACTIONS.cancelInteractive);
    await settle();

    expect(size).toBe(mils(80));
  });

  /**
   * NOT the default line width: DrawShape builds the shape with `lineWidth` and then
   * `item->SetStroke( m_lastStroke )` (:506-511), and SCH_SHAPE::SetStroke replaces the whole
   * stroke (sch_shape.cpp:63-66). `m_lastStroke` starts at width 0 (:57), so in 10.0.6 the first
   * shape's width is 0 - "default" - whatever m_Defaults.line_width says.
   */
  it('give a new shape the last stroke, over the default line width, as 10.0.6 does', async () => {
    const before = new Set(sym().GetDrawItems());
    run(SCH_ACTIONS.drawRectangle);
    await settle();
    await clickAt({ x: 6 * G, y: 6 * G });
    await clickAt({ x: 10 * G, y: 10 * G });
    run(ACTIONS.cancelInteractive);
    await settle();

    const added = [...sym().GetDrawItems()].filter(
      (i) => !before.has(i) && i.Type() === KICAD_T.SCH_SHAPE_T,
    ) as SCH_SHAPE[];
    expect(added.map((s) => [s.GetShape(), s.GetStroke().GetWidth()])).toEqual([
      [SHAPE_T.RECTANGLE, 0],
    ]);
  });
});

describe('the point editor', () => {
  /**
   * "E"'s rectangle spans (-4G, -4G)-(4G, 4G); pin 1 hangs off the top edge at x = 2G, its root
   * on that edge but away from the edge's midpoint (a pin root ON the midpoint is the next test).
   * Dragging the top edge up by 2G takes the pin with it, or not.
   */
  const E = `(kicad_symbol_lib (version 20241209) (generator "kicad_symbol_editor")
  (symbol "E" (in_bom yes) (on_board yes)
    (property "Reference" "U" (at 0 0 0) (effects (font (size 1.27 1.27))))
    (property "Value" "E" (at 0 0 0) (effects (font (size 1.27 1.27))))
    (symbol "E_1_1"
      (rectangle (start -5.08 -5.08) (end 5.08 5.08) (stroke (width 0) (type default)) (fill (type none)))
      (pin input line (at 2.54 10.16 270) (length 5.08) (name "A" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27))))))))`;

  const dragTopEdge = async (): Promise<number> => {
    t.dispose();
    t = symbolEditHarness(E);
    t.open('E');
    const rect = [...sym().GetDrawItems()].find(
      (i) => i.Type() === KICAD_T.SCH_SHAPE_T && (i as SCH_SHAPE).GetShape() === SHAPE_T.RECTANGLE,
    )!;
    // EDIT_POINTS::FindPoint tries the corners first, within ToWorld( POINT_SIZE ): zoomed out, a
    // 10 mm rectangle's corner swallows its edge's midpoint, as it does in KiCad. Zoom in.
    t.harness.view.SetScale(t.harness.view.GetScale() * 1000);
    t.harness.view.SetCenter({ x: 0, y: 0 });
    t.harness.h.mouse = { x: -20 * G, y: -20 * G };
    run(ACTIONS.selectionClear);
    t.frame.GetToolManager()!.RunAction(ACTIONS.selectItem, rect);
    await settle();
    drag(t.harness, { x: 0, y: -4 * G }, { x: 0, y: -6 * G });
    await settle();
    return sym()
      .GetPins()
      .find((p) => p.GetNumber() === '1')!
      .GetPosition().y;
  };

  it('keeps pins attached to a dragged edge when the setting is on', async () => {
    cfg.drag_pins_along_with_edges = true;
    expect(await dragTopEdge()).toBe(-10 * G);
  });

  it('leaves them where they were when it is off', async () => {
    cfg.drag_pins_along_with_edges = false;
    expect(await dragTopEdge()).toBe(-8 * G);
  });
});
