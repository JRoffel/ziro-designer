// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `SCH_DRAWING_TOOLS::ImportGraphics` (sch_drawing_tools.cpp:1382) on the live schematic:
 * DIALOG_IMPORT_GFX_SCH's items added to the sheet at once for an absolute placement, or carried on
 * the cursor and dropped with a click; Cancel, an empty file or a cancelled placement adds nothing;
 * each placement is one undo step; a drag and drop hands the dropped file to the dialog.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { ACTIONS } from '@ziroeda/common/tool/actions.js';
import {
  TA_MOUSE_MOTION,
  TA_NONE,
  TC_MESSAGE,
  TOOL_EVENT,
} from '@ziroeda/common/tool/tool_event.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import type { IMPORT_GFX_RESULT } from '@ziroeda/eeschema/import_gfx/dialog_import_gfx_sch.js';
import { SCH_LINE } from '@ziroeda/eeschema/sch_line.js';
import { SCH_ACTIONS } from '@ziroeda/eeschema/tools/sch_actions.js';
import { wxID_CANCEL, wxID_OK } from '@ziroeda/wx/menu.js';
import {
  type SCH_HARNESS,
  click,
  mouse,
  schFrame,
  schToolHarness,
} from './support/sch_tool_harness.js';

const ROOT = '10000000-0000-0000-0000-000000000001';
const SHEET = `(kicad_sch (version 20250114) (generator "eeschema") (uuid "${ROOT}") (paper "A4")
  (lib_symbols) (sheet_instances (path "/" (page "1"))))`;

/** 50 mil, the schematic's grid. */
const G = 50 * 254;

let h: SCH_HARNESS;
let shown: string[];
let answer: number;
let interactive: boolean;
let makeItems: () => SCH_LINE[];
let override: (string | undefined)[];

/** A 2 x 1 grid line from the origin, as GRAPHICS_IMPORTER_SCH makes one. */
const lineItem = (): SCH_LINE => {
  const l = new SCH_LINE();
  l.SetStartPoint({ x: 0, y: 0 });
  l.SetEndPoint({ x: 2 * G, y: G });
  return l;
};

beforeEach(() => {
  SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER()));
  shown = [];
  override = [];
  answer = wxID_OK;
  interactive = false;
  makeItems = () => [lineItem()];
  h = schToolHarness(
    schFrame({
      showModal: async (aName, _aItems, aArg) => {
        shown.push(aName);
        if (aName === 'DIALOG_IMPORT_GFX_SCH') {
          const dlg = aArg as IMPORT_GFX_RESULT;
          override.push(dlg.filenameOverride);
          dlg.items = makeItems();
          dlg.interactive = interactive;
        }
        return answer;
      },
    }),
  );
  h.frame.OpenProjectFiles(['/t/t.kicad_sch'], 0, (p) => (p === '/t/t.kicad_sch' ? SHEET : null));
});

afterEach(() => SetPgm(null));

const lines = (): SCH_LINE[] =>
  [...h.frame.GetScreen()!.Items().OfType(KICAD_T.SCH_LINE_T)] as SCH_LINE[];

async function settle() {
  for (let i = 0; i < 3; i++) {
    await new Promise((r) => setTimeout(r, 0));
    h.frame.GetToolManager()!.ProcessEvent(new TOOL_EVENT(TC_MESSAGE, TA_NONE, 'test.flush'));
  }
}

const run = () => h.frame.GetToolManager()!.RunAction(SCH_ACTIONS.importGraphics);

describe('ImportGraphics', () => {
  it('an absolute placement adds the items where they are, as one undo step', async () => {
    const undos = h.frame.GetUndoCommandCount();
    run();
    await settle();

    expect(shown).toEqual(['DIALOG_IMPORT_GFX_SCH']);
    expect(lines().length).toBe(1);
    expect([lines()[0]!.GetStartPoint(), lines()[0]!.GetEndPoint()]).toEqual([
      { x: 0, y: 0 },
      { x: 2 * G, y: G },
    ]);
    expect(h.frame.GetUndoCommandCount()).toBe(undos + 1);
  });

  it('interactive: the items ride the cursor and a click drops them there', async () => {
    interactive = true;
    const undos = h.frame.GetUndoCommandCount();
    h.h.mouse = { x: 4 * G, y: 2 * G };
    run();
    await settle();
    expect(lines().length).toBe(0);

    const at = { x: 6 * G, y: 4 * G };
    mouse(h, TA_MOUSE_MOTION, at);
    click(h, at);
    await settle();

    expect(lines().length).toBe(1);
    expect(lines()[0]!.GetStartPoint()).toEqual(at);
    expect(h.frame.GetUndoCommandCount()).toBe(undos + 1);
  });

  it('interactive and cancelled: nothing is added', async () => {
    interactive = true;
    const undos = h.frame.GetUndoCommandCount();
    run();
    await settle();
    h.frame.GetToolManager()!.RunAction(ACTIONS.cancelInteractive);
    await settle();

    expect(lines().length).toBe(0);
    expect(h.frame.GetUndoCommandCount()).toBe(undos);
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

  it("a drag and drop hands the dropped file's name to the dialog", async () => {
    h.frame.GetToolManager()!.RunAction(SCH_ACTIONS.ddImportGraphics, '/t/drawing.dxf');
    await settle();
    run();
    await settle();

    expect(override).toEqual(['/t/drawing.dxf', undefined]);
  });
});
