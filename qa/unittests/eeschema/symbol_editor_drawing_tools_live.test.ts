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
import { SHAPE_T } from '@ziroeda/common/eda_shape.js';
import {
  TA_MOUSE_DBLCLICK,
  TA_MOUSE_MOTION,
  TA_NONE,
  TC_MESSAGE,
  TOOL_EVENT,
} from '@ziroeda/common/tool/tool_event.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import type { SCH_PIN } from '@ziroeda/eeschema/sch_pin.js';
import type { SCH_SHAPE } from '@ziroeda/eeschema/sch_shape.js';
import type { SCH_TEXT } from '@ziroeda/eeschema/sch_text.js';
import type { SCH_TEXTBOX } from '@ziroeda/eeschema/sch_textbox.js';
import { SCH_ACTIONS } from '@ziroeda/eeschema/tools/sch_actions.js';
import { SCH_SELECTION_TOOL } from '@ziroeda/eeschema/tools/sch_selection_tool.js';
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

/** The symbol's shapes (SCH_SHAPE_T), or its text boxes. */
const shapes = () =>
  [...sym().GetDrawItems()].filter((i) => i.Type() === KICAD_T.SCH_SHAPE_T) as SCH_SHAPE[];
const textboxes = () =>
  [...sym().GetDrawItems()].filter((i) => i.Type() === KICAD_T.SCH_TEXTBOX_T) as SCH_TEXTBOX[];

/**
 * A shape tool started where the cursor is primes itself with a click there (the action carries
 * the cursor position), which is the first corner; each later click is the next point.
 */
describe('SYMBOL_EDITOR_DRAWING_TOOLS::doDrawShape', () => {
  it('draws a rectangle from two clicks, on the device layer, as one undo step', async () => {
    const before = new Set(shapes());
    const a = { x: -6 * G, y: -6 * G };
    const b = { x: 6 * G, y: 4 * G };
    t.harness.h.mouse = a;
    run(SCH_ACTIONS.drawRectangle);
    await settle();
    await clickAt(b);
    run(ACTIONS.cancelInteractive);
    await settle();

    // AddDrawItem sorts the drawings, so the new shape is the one that was not there.
    const added = shapes().filter((x) => !before.has(x));
    expect(added).toHaveLength(1);
    expect(added[0]!.GetShape()).toBe(SHAPE_T.RECTANGLE);
    expect(plain(added[0]!.GetStart())).toEqual(a);
    expect(plain(added[0]!.GetEnd())).toEqual(b);
    // m_drawSpecificBodyStyle starts true and m_drawSpecificUnit false: the shape is drawn for
    // the body style shown and every unit.
    expect(added[0]!.GetBodyStyle()).toBe(t.frame.GetBodyStyle());
    expect(added[0]!.GetUnit()).toBe(0);
    expect(t.frame.GetUndoCommandCount()).toBe(1);
  });

  it('a polygon takes a point per click and ends on a double-click', async () => {
    const before = new Set(shapes());
    const pts = [
      { x: 0, y: 0 },
      { x: 4 * G, y: 0 },
      { x: 4 * G, y: 4 * G },
    ];
    t.harness.h.mouse = pts[0]!;
    run(SCH_ACTIONS.drawSymbolPolygon);
    await settle();
    for (const p of pts.slice(1)) await clickAt(p);
    mouse(t.harness, TA_MOUSE_DBLCLICK, pts[2]!);
    await settle();
    run(ACTIONS.cancelInteractive);
    await settle();

    // AddDrawItem sorts the drawings, so the new shape is the one that was not there.
    const added = shapes().filter((x) => !before.has(x));
    expect(added).toHaveLength(1);
    expect(added[0]!.GetShape()).toBe(SHAPE_T.POLY);
    const outline = added[0]!.GetPolyShape().Outline(0);
    const corners = [] as { x: number; y: number }[];
    for (let i = 0; i < outline.PointCount(); i++) corners.push(plain(outline.CPoint(i)));
    // Upstream's finish: CalcEdit( GetPosition() ) moves the rubber-band point onto the first
    // vertex, and EDA_SHAPE::endEdit then drops it (it is not a repeat of the point before) and
    // leaves the outline open - the clicked points, exactly.
    expect(corners).toEqual(pts);
    expect(outline.IsClosed()).toBe(false);
  });

  it('a text box is kept when its dialog is OK, and dropped when it is cancelled', async () => {
    let selectedAfterDialog = -1;
    const draw = async () => {
      t.harness.h.mouse = { x: -2 * G, y: -2 * G };
      run(SCH_ACTIONS.drawSymbolTextBox);
      await settle();
      await clickAt({ x: 4 * G, y: 2 * G });
      selectedAfterDialog = t.frame
        .GetToolManager()!
        .GetTool(SCH_SELECTION_TOOL)!
        .GetSelection()
        .Size();
      run(ACTIONS.cancelInteractive);
      await settle();
    };

    dialog = () => wxID_CANCEL;
    await draw();
    expect(textboxes()).toHaveLength(0);
    // cleanup(): the abandoned text box leaves the selection with the dialog, not later.
    expect(selectedAfterDialog).toBe(0);
    expect(shown).toEqual(['DIALOG_TEXT_PROPERTIES']);

    dialog = () => wxID_OK;
    await draw();
    expect(textboxes()).toHaveLength(1);
    expect(t.frame.GetUndoCommandCount()).toBe(1);
  });
});
