// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * SCH_EDITOR_CONTROL::AssignNetclass (sch_editor_control.cpp:1156) on the live connection graph:
 * its getNetNamePattern lambda turns a vector bus into `PREFIX*` and a bus group into
 * `PREFIX.*` - the prefix of `SCH_CONNECTION::Name()`, so a local label keeps its sheet path - refuses the whole action when any selected net has no label, and hands
 * DIALOG_ASSIGN_NETCLASS the patterns as a std::set - sorted, whatever the selection order.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PGM_BASE, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import type { SCH_ITEM } from '@ziroeda/eeschema/sch_item.js';
import type { SCH_LINE } from '@ziroeda/eeschema/sch_line.js';
import { SCH_ACTIONS } from '@ziroeda/eeschema/tools/sch_actions.js';
import { SCH_SELECTION_TOOL } from '@ziroeda/eeschema/tools/sch_selection_tool.js';
import { type SCH_HARNESS, schFrame, schToolHarness } from './support/sch_tool_harness.js';

const u = (n: number) => `c0000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const label = (aText: string, aY: number, aN: number) =>
  `(label "${aText}" (at 55.88 ${aY} 0) (effects (font (size 1.27 1.27)) (justify left bottom)) (uuid "${u(aN)}"))`;
const segment = (aKind: 'bus' | 'wire', aY: number, aN: number) =>
  `(${aKind} (pts (xy 50.8 ${aY}) (xy 76.2 ${aY})) (stroke (width 0) (type default)) (uuid "${u(aN)}"))`;

/** A vector bus, a group bus, a wire nothing names, one a sheet pin names, one a hierarchical label names, and a bus nothing names. */
const SHEET = `(kicad_sch (version 20250114) (generator "eeschema") (uuid "${u(1)}") (paper "A4")
  (lib_symbols)
  ${segment('bus', 50.8, 2)} ${label('D[0..7]', 50.8, 3)}
  ${segment('bus', 76.2, 4)} ${label('USB{DP DM}', 76.2, 5)}
  ${segment('wire', 101.6, 6)}
  ${segment('wire', 127, 7)}
  (sheet (at 76.2 120.65) (size 20.32 12.7) (stroke (width 0.1524) (type solid)) (fill (color 0 0 0 0.0000))
    (uuid "${u(8)}")
    (property "Sheetname" "S" (at 76.2 119.9 0) (effects (font (size 1.27 1.27)) (justify left bottom)))
    (property "Sheetfile" "s.kicad_sch" (at 76.2 134 0) (effects (font (size 1.27 1.27)) (justify left top)))
    (pin "P" input (at 76.2 127 180) (effects (font (size 1.27 1.27)) (justify left)) (uuid "${u(9)}"))
    (instances (project "t" (path "/${u(1)}" (page "2")))))
  ${segment('wire', 152.4, 10)}
  ${segment('bus', 177.8, 13)}
  (hierarchical_label "H" (shape input) (at 55.88 152.4 0) (effects (font (size 1.27 1.27)) (justify left)) (uuid "${u(11)}"))
  (sheet_instances (path "/" (page "1"))))`;

const SUB = `(kicad_sch (version 20250114) (generator "eeschema") (uuid "${u(12)}") (paper "A4") (lib_symbols))`;

let h: SCH_HARNESS;
let errors: string[];
let offered: string[][];

beforeEach(() => {
  SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER()));
  errors = [];
  offered = [];
  h = schToolHarness(
    schFrame({
      showModal: (aDialog, _aItems, aArg) => {
        if (aDialog === 'DIALOG_ASSIGN_NETCLASS')
          offered.push([...(aArg as { netNames: Iterable<string> }).netNames]);
        return Promise.resolve(0);
      },
    }),
  );
  h.frame.OpenProjectFiles(['/t/t.kicad_sch'], 0, (p) =>
    p === '/t/t.kicad_sch' ? SHEET : p === '/t/s.kicad_sch' ? SUB : null,
  );
  (h.frame as unknown as { ShowInfoBarError(m: string): void }).ShowInfoBarError = (m) =>
    errors.push(m);
});

afterEach(() => SetPgm(null));

const flush = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};

const lines = () => [...h.frame.GetScreen()!.Items().OfType(KICAD_T.SCH_LINE_T)] as SCH_LINE[];
const at = (aY: number) => lines().find((l) => l.GetStartPoint().y === aY * 10000)!;

async function assign(...aItems: SCH_ITEM[]): Promise<void> {
  const sel = h.frame.GetToolManager()!.GetTool(SCH_SELECTION_TOOL)!;
  sel.ClearSelection(true);
  for (const item of aItems) sel.AddItemToSel(item, true);
  h.frame.GetToolManager()!.RunAction(SCH_ACTIONS.assignNetclass);
  await flush();
}

describe('AssignNetclass: getNetNamePattern', () => {
  it('a vector bus becomes its prefix and a star', async () => {
    await assign(at(50.8));
    expect(offered).toEqual([['/D*']]);
  });

  it('a bus group becomes its prefix and a dotted star', async () => {
    await assign(at(76.2));
    expect(offered).toEqual([['/USB.*']]);
  });

  it('hands the patterns over sorted, as the std::set holds them', async () => {
    await assign(at(76.2), at(50.8));
    expect(offered).toEqual([['/D*', '/USB.*']]);
  });

  it('a net only a sheet pin names is labeled enough: PRIORITY::SHEET_PIN is the floor', async () => {
    await assign(at(127));
    expect(offered).toEqual([['/P']]);
  });

  it('a net a hierarchical label names keeps its name', async () => {
    await assign(at(152.4));
    expect(offered).toEqual([['/H']]);
  });

  it('a bus that parses as neither skips the driver check: an unlabeled bus is not refused', async () => {
    await assign(at(177.8));
    expect(errors).toEqual([]);
    // SCH_CONNECTION::recacheName: an empty name caches as <NO NET>, behind the sheet path.
    expect(offered).toEqual([['/<NO NET>']]);
  });

  it('refuses the whole action when any selected net has no label', async () => {
    await assign(at(50.8), at(101.6));

    expect(offered).toEqual([]);
    expect(errors).toEqual(['All selected nets must be labeled to assign a netclass.']);
  });
});
