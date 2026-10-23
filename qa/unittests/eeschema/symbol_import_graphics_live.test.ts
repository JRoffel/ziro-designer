// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * `SYMBOL_EDITOR_DRAWING_TOOLS::ImportGraphics` on the live symbol editor: DIALOG_IMPORT_GFX_SCH's
 * items added to the symbol at once for an absolute placement, or carried on the cursor and
 * dropped with a click; Cancel or an empty file adds nothing; each placement is one undo step.
 */
import { SHAPE_T } from '@ziroeda/common/eda_shape.js';
import { SCH_LAYER_ID } from '@ziroeda/common/layer_id.js';
import { ACTIONS } from '@ziroeda/common/tool/actions.js';
import {
  TA_MOUSE_MOTION,
  TA_NONE,
  TC_MESSAGE,
  TOOL_EVENT,
} from '@ziroeda/common/tool/tool_event.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import { SCH_SHAPE } from '@ziroeda/eeschema/sch_shape.js';
import { SCH_ACTIONS } from '@ziroeda/eeschema/tools/sch_actions.js';
import type { IMPORT_GFX_RESULT } from '@ziroeda/eeschema/tools/symbol_editor_drawing_tools.js';
import { wxID_CANCEL, wxID_OK } from '@ziroeda/wx/menu.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { click, mouse } from './support/sch_tool_harness.js';
import { G, type SYMBOL_EDIT_HARNESS, symbolEditHarness } from './support/symbol_edit_harness.js';

let t: SYMBOL_EDIT_HARNESS;
let shown: string[];
/** What the dialog answers, and the result it fills. */
let answer: number;
let interactive: boolean;
let makeItems: () => SCH_SHAPE[];

/** A 2 x 1 grid line from the origin, as an importer makes one. */
const lineItem = (): SCH_SHAPE => {
  const s = new SCH_SHAPE(SHAPE_T.POLY, SCH_LAYER_ID.LAYER_DEVICE);
  s.AddPoint({ x: 0, y: 0 });
  s.AddPoint({ x: 2 * G, y: G });
  return s;
};

beforeEach(() => {
  shown = [];
  answer = wxID_OK;
  interactive = false;
  makeItems = () => [lineItem()];
  t = symbolEditHarness(undefined, {
    showModal: async (aName, _aItems, aArg) => {
      shown.push(aName);
      if (aName === 'DIALOG_IMPORT_GFX_SCH') {
        const dlg = aArg as IMPORT_GFX_RESULT;
        dlg.items = makeItems();
        dlg.interactive = interactive;
      }
      return answer;
    },
  });
  t.open();
});

afterEach(() => t.dispose());

const sym = () => t.frame.GetCurSymbol()!;
const lines = () =>
  [...sym().GetDrawItems()].filter(
    (i) => i.Type() === KICAD_T.SCH_SHAPE_T && (i as SCH_SHAPE).GetShape() === SHAPE_T.POLY,
  ) as SCH_SHAPE[];

async function settle() {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 0));
    t.frame.GetToolManager()!.ProcessEvent(new TOOL_EVENT(TC_MESSAGE, TA_NONE, 'test.flush'));
  }
}

const run = () => t.frame.GetToolManager()!.RunAction(SCH_ACTIONS.importGraphics);

describe('ImportGraphics', () => {
  it('an absolute placement adds the items where they are, as one undo step', async () => {
    run();
    await settle();
    expect(shown).toEqual(['DIALOG_IMPORT_GFX_SCH']);
    expect(lines().length).toBe(1);
    expect(lines()[0]!.GetPolyPoints()).toEqual([
      { x: 0, y: 0 },
      { x: 2 * G, y: G },
    ]);
    expect(lines()[0]!.GetParent() === sym()).toBe(true);
    expect(t.frame.GetUndoCommandCount()).toBe(1);
  });

  it('interactive: the items ride the cursor and a click drops them there', async () => {
    interactive = true;
    t.harness.h.mouse = { x: 4 * G, y: 2 * G };
    run();
    await settle();
    expect(lines().length).toBe(0);

    const at = { x: 6 * G, y: 4 * G };
    mouse(t.harness, TA_MOUSE_MOTION, at);
    click(t.harness, at);
    await settle();

    expect(lines().length).toBe(1);
    expect(lines()[0]!.GetPolyPoints()[0]).toEqual(at);
    expect(t.frame.GetUndoCommandCount()).toBe(1);
  });

  it('interactive and cancelled: nothing is added', async () => {
    interactive = true;
    run();
    await settle();
    t.frame.GetToolManager()!.RunAction(ACTIONS.cancelInteractive);
    await settle();
    expect(lines().length).toBe(0);
    expect(t.frame.GetUndoCommandCount()).toBe(0);
  });

  it('Cancel in the dialog adds nothing; an empty file says so', async () => {
    answer = wxID_CANCEL;
    run();
    await settle();
    expect(lines().length).toBe(0);

    answer = wxID_OK;
    makeItems = () => [];
    run();
    await settle();
    expect(shown).toEqual(['DIALOG_IMPORT_GFX_SCH', 'DIALOG_IMPORT_GFX_SCH', 'wxMessageBox']);
    expect(lines().length).toBe(0);
  });
});
