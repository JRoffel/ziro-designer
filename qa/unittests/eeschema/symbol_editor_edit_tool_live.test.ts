// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * SYMBOL_EDITOR_EDIT_TOOL (eeschema/tools/symbol_editor_edit_tool.cpp), live on the symbol editor's
 * frame: rotate, mirror, swap, delete (pins, synchronized pins, fields hidden not removed), undo
 * and redo.
 */
import { ACTIONS } from '@ziroeda/common/tool/actions.js';
import type { TOOL_ACTION } from '@ziroeda/common/tool/tool_action.js';
import { GR_TEXT_H_ALIGN_T } from '@ziroeda/common/font/text_attributes.js';
import { PIN_ORIENTATION } from '@ziroeda/common/pin_type.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import type { EDA_ITEM } from '@ziroeda/common/eda_item.js';
import type { SCH_PIN } from '@ziroeda/eeschema/sch_pin.js';
import type { SCH_SHAPE } from '@ziroeda/eeschema/sch_shape.js';
import { SCH_ACTIONS } from '@ziroeda/eeschema/tools/sch_actions.js';
import { SCH_SELECTION_TOOL } from '@ziroeda/eeschema/tools/sch_selection_tool.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { G, type SYMBOL_EDIT_HARNESS, symbolEditHarness } from './support/symbol_edit_harness.js';

let t: SYMBOL_EDIT_HARNESS;

beforeEach(() => {
  t = symbolEditHarness();
});

afterEach(() => t.dispose());

const sym = () => t.frame.GetCurSymbol()!;
const pinOf = (aUnit: number) =>
  sym()
    .GetPins()
    .find((p) => p.GetUnit() === aUnit)!;
const rect = () =>
  [...sym().GetDrawItems()].find((i) => i.Type() === KICAD_T.SCH_SHAPE_T) as SCH_SHAPE;
/** A point as plain numbers: the parser's 0 is often -0 (a flipped axis). */
const pt = (p: { x: number; y: number }) => ({ x: p.x + 0, y: p.y + 0 });

function select(...aItems: EDA_ITEM[]) {
  const sel = t.frame.GetToolManager()!.GetTool(SCH_SELECTION_TOOL)!;
  for (const i of aItems) sel.AddItemToSel(i, true);
}

const run = (aAction: TOOL_ACTION) => t.frame.GetToolManager()!.RunAction(aAction);

describe('SYMBOL_EDITOR_EDIT_TOOL', () => {
  it('rotates a lone pin about its own position, as one undo step', () => {
    t.open();
    const before = pt(pinOf(1).GetPosition());
    select(pinOf(1));

    run(SCH_ACTIONS.rotateCW);

    expect(pt(pinOf(1).GetPosition())).toEqual(before);
    expect(pinOf(1).GetOrientation()).not.toBe(PIN_ORIENTATION.PIN_LEFT);
    expect(t.frame.GetUndoCommandCount()).toBe(1);
  });

  it('rotate counter-clockwise is the reverse of clockwise', () => {
    t.open();
    select(pinOf(1));
    const start = pinOf(1).GetOrientation();

    run(SCH_ACTIONS.rotateCW);
    const cw = pinOf(1).GetOrientation();
    select(pinOf(1));
    run(SCH_ACTIONS.rotateCCW);
    run(SCH_ACTIONS.rotateCCW);
    const ccw = pinOf(1).GetOrientation();

    expect(cw).not.toBe(start);
    expect(ccw).not.toBe(start);
    expect(ccw).not.toBe(cw);
  });

  it('rotates a selection of several about its centre, snapped to the half grid', () => {
    t.open();
    select(pinOf(1), rect());
    const center = t.frame.GetNearestHalfGridPosition(
      t.frame.GetToolManager()!.GetTool(SCH_SELECTION_TOOL)!.GetSelection().GetCenter(),
    );
    const p = pt(pinOf(1).GetPosition());

    run(SCH_ACTIONS.rotateCCW);

    // A quarter turn about the centre: (dx, dy) -> (dy, -dx) on screen (y down).
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    expect(pt(pinOf(1).GetPosition())).toEqual(pt({ x: center.x + dy, y: center.y - dx }));
  });

  it('mirrors a lone pin about its own position, and a field by its justification', () => {
    t.open();
    select(pinOf(1));
    run(SCH_ACTIONS.mirrorH);
    expect(pinOf(1).GetOrientation()).toBe(PIN_ORIENTATION.PIN_RIGHT);
    expect(t.frame.GetUndoCommandCount()).toBe(1);

    const ref = sym().GetReferenceField();
    ref.SetHorizJustify(GR_TEXT_H_ALIGN_T.GR_TEXT_H_ALIGN_LEFT);
    const at = pt(ref.GetPosition());
    t.frame.GetToolManager()!.GetTool(SCH_SELECTION_TOOL)!.ClearSelection();
    select(ref);
    run(SCH_ACTIONS.mirrorH);
    // A lone field flips its justification and stays where it is.
    expect(ref.GetHorizJustify()).toBe(GR_TEXT_H_ALIGN_T.GR_TEXT_H_ALIGN_RIGHT);
    expect(pt(ref.GetPosition())).toEqual(at);
  });

  it('swaps the places of two items, and two pins their orientations', () => {
    t.open();
    const pin = pinOf(1);
    const shape = rect();
    const pinAt = pt(pin.GetPosition());
    const shapeAt = pt(shape.GetPosition());
    select(pin, shape);

    run(SCH_ACTIONS.swap);

    expect(pt(pin.GetPosition())).toEqual(shapeAt);
    expect(pt(shape.GetPosition())).toEqual(pinAt);
    expect(t.frame.GetUndoCommandCount()).toBe(1);
  });

  it('deletes a pin and its synchronized twin in the other unit', () => {
    t.open();
    select(pinOf(1));

    run(ACTIONS.doDelete);

    expect(sym().GetPins()).toHaveLength(0);
    expect(t.frame.GetUndoCommandCount()).toBe(1);
  });

  it('does not delete a pin of another unit that only shares the place, not the name', () => {
    t.open();
    pinOf(2).SetName('B');
    select(pinOf(1));

    run(ACTIONS.doDelete);

    expect(
      sym()
        .GetPins()
        .map((p) => p.GetNumber()),
    ).toEqual(['2']);
  });

  it('deletes only the pin picked when the units are locked', () => {
    t.open();
    sym().LockUnits(true);
    t.frame.SetCurSymbol(sym(), false);
    select(pinOf(1));

    run(ACTIONS.doDelete);

    expect(
      sym()
        .GetPins()
        .map((p) => p.GetNumber()),
    ).toEqual(['2']);
  });

  it('hides a field rather than deleting it', () => {
    t.open();
    const value = sym().GetValueField();
    value.SetVisible(true);
    select(value);

    run(ACTIONS.doDelete);

    expect(sym().GetValueField().IsVisible()).toBe(false);
    expect(t.frame.GetUndoCommandCount()).toBe(1);
  });

  it('undo and redo through the actions', () => {
    t.open();
    select(pinOf(1));
    run(ACTIONS.doDelete);
    expect(sym().GetPins()).toHaveLength(0);

    run(ACTIONS.undo);
    expect(sym().GetPins()).toHaveLength(2);

    run(ACTIONS.redo);
    expect(sym().GetPins()).toHaveLength(0);
  });
});
