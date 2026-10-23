// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * `SCH_EDIT_FRAME::SaveSymbolToSchematic` (sch_edit_frame.cpp:2239-2302): the symbol editor's
 * edit of a placement's symbol goes to that placement and every unit annotated with its
 * reference, as one undoable commit; other symbols keep theirs.
 */
import { resolve } from 'node:path';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { ACTIONS } from '@ziroeda/common/tool/actions.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import {
  EESCHEMA_DEFAULTS,
  setEeschemaSettingsProvider,
  setUpdateEeschemaSettingsProvider,
} from '@ziroeda/eeschema/eeschema_settings.js';
import type { SCH_SHEET_PATH } from '@ziroeda/eeschema/sch_sheet_path.js';
import type { SCH_SYMBOL } from '@ziroeda/eeschema/sch_symbol.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openProject, schFrame, schToolHarness } from './support/sch_tool_harness.js';

const ORACLE = resolve(__dirname, '../../data/eeschema/netlist_oracle/complex_hierarchy');
const SHEETS = ['complex_hierarchy.kicad_sch', 'ampli_ht.kicad_sch', 'complex_hierarchy.kicad_pro'];

beforeEach(() => {
  SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER()));
  let cfg = structuredClone(EESCHEMA_DEFAULTS);
  setEeschemaSettingsProvider(() => cfg);
  setUpdateEeschemaSettingsProvider((mutate) => {
    const next = structuredClone(cfg);
    mutate(next);
    cfg = next;
  });
});

afterEach(() => {
  SetPgm(null);
  setEeschemaSettingsProvider(() => EESCHEMA_DEFAULTS);
  setUpdateEeschemaSettingsProvider(() => {});
});

function setUp() {
  const h = schToolHarness(schFrame());
  openProject(h.frame, ORACLE, 'complex_hierarchy', SHEETS);
  const root = h.frame
    .Schematic()
    .Hierarchy()
    .find((p) => p.size() === 1)!;
  h.frame.SetCurrentSheet(root);
  // Every placement on every sheet path, with the path it is annotated on.
  const placed: [SCH_SYMBOL, SCH_SHEET_PATH][] = [];
  for (const path of h.frame.Schematic().Hierarchy())
    for (const s of path.LastScreen()!.Items().OfType(KICAD_T.SCH_SYMBOL_T))
      placed.push([s as SCH_SYMBOL, path]);
  const byRef = (aRef: string) =>
    placed.filter(([s, p]) => s.GetRef(p, false) === aRef).map(([s]) => s);
  return { h, byRef };
}

const description = (s: SCH_SYMBOL) => s.GetLibSymbolRef()!.GetDescription();

describe('SaveSymbolToSchematic', () => {
  it('every unit of the reference takes the edit; another symbol does not', () => {
    const { h, byRef } = setUp();
    const u4 = byRef('U4');
    // Not U3: ampli_ht is instantiated twice, so U3 and U4 are the same placements on two paths.
    const [u1] = byRef('U1');
    expect(u4.length).toBe(2);
    const before = description(u1!);

    const edited = u4[0]!.GetLibSymbolRef()!.Flatten();
    edited.SetDescription('edited in the symbol editor');
    h.frame.SaveSymbolToSchematic(edited, u4[0]!.m_Uuid);

    expect(u4.map(description)).toEqual([
      'edited in the symbol editor',
      'edited in the symbol editor',
    ]);
    expect(description(u1!)).toBe(before);
    // Each unit holds a copy of its own, not the editor's symbol.
    expect(u4[0]!.GetLibSymbolRef() === edited).toBe(false);
    expect(u4[0]!.GetLibSymbolRef() === u4[1]!.GetLibSymbolRef()).toBe(false);
  });

  it('is one commit that Undo takes back', () => {
    const { h, byRef } = setUp();
    const u4 = byRef('U4');
    const before = u4.map(description);
    const edited = u4[1]!.GetLibSymbolRef()!.Flatten();
    edited.SetDescription('changed');
    h.frame.SaveSymbolToSchematic(edited, u4[1]!.m_Uuid);
    expect(h.frame.GetUndoCommandCount()).toBe(1);

    h.frame.GetToolManager()!.RunAction(ACTIONS.undo);
    const after = byRef('U4').map(description);
    expect(after).toEqual(before);
  });

  it('an unknown placement changes nothing', () => {
    const { h, byRef } = setUp();
    const edited = byRef('U4')[0]!.GetLibSymbolRef()!.Flatten();
    edited.SetDescription('nowhere');
    h.frame.SaveSymbolToSchematic(edited, '00000000-0000-0000-0000-00000000abcd');
    expect(h.frame.GetUndoCommandCount()).toBe(0);
    expect(byRef('U4').map(description)).not.toContain('nowhere');
  });
});
