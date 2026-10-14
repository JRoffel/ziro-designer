// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * MULTICHANNEL_TOOL against KiCad's own regression boards and checks
 * (qa/tests/pcbnew/test_multichannel.cpp): repeat layout copies footprint properties (issue
 * 22548), keeps the reference area's vias (issue 21184), copies only zones whose layers both
 * areas hold (issue 22983); and the generated placement rule areas of vme-wren.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { TOOL_MANAGER } from '@ziroeda/common/tool/tool_manager.js';
import { FIELD_T } from '@ziroeda/common/template_fieldnames.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import { installPgm } from '@ziroeda/designer/src/editors/pcb/pcb_canvas.js';
import { LIB_ID } from '@ziroeda/common/lib_id.js';
import { PCB_LAYER_ID } from '@ziroeda/common/layer_id.js';
import { LSET } from '@ziroeda/common/lset.js';
import { BOARD } from '@ziroeda/pcbnew/board.js';
import { FOOTPRINT } from '@ziroeda/pcbnew/footprint.js';
import { NETINFO_ITEM } from '@ziroeda/pcbnew/netinfo_item.js';
import { PAD } from '@ziroeda/pcbnew/pad.js';
import { PAD_SHAPE, PADSTACK } from '@ziroeda/pcbnew/padstack.js';
import { ZONE } from '@ziroeda/pcbnew/zone.js';
import {
  DefaultRepeatLayoutOptions,
  FormatComponentList,
  getParentSheetPaths,
  MULTICHANNEL_TOOL,
  RULE_AREA,
} from '@ziroeda/pcbnew/tools/multichannel_tool.js';
import { HAVE_TEST_DATA, LoadBoard } from './drc/drc_test_utils.js';

beforeAll(() => {
  installPgm();
});

function tool(aBoard: BOARD): MULTICHANNEL_TOOL {
  const toolMgr = new TOOL_MANAGER();
  toolMgr.SetEnvironment(aBoard, null, null, null, null);
  const mt = new MULTICHANNEL_TOOL();
  toolMgr.RegisterTool(mt);
  return mt;
}

const byPlacementGroup = (aTool: MULTICHANNEL_TOOL, aName: string): RULE_AREA =>
  aTool.GetData().m_areas.find((ra) => ra.m_zone?.GetPlacementAreaSource() === aName)!;

/** `countZonesByNameInRuleArea` / its prefix form ("_<n>" copies, issue 23131). */
function countZones(aBoard: BOARD, aName: string, aArea: RULE_AREA, aPrefix = false): number {
  return aBoard.Zones().filter((zone) => {
    if (zone === aArea.m_zone) return false;
    const name = zone.GetZoneName();
    if (aPrefix ? name !== aName && !name.startsWith(`${aName}_`) : name !== aName) return false;
    return aArea.m_zone!.Outline().Contains(zone.Outline().COutline(0).Centre());
  }).length;
}

describe('the pure helpers', () => {
  it('names the parent sheets above a sheet, root and the sheet itself left out', () => {
    expect(getParentSheetPaths('/A/B/C/')).toEqual(['/A/', '/A/B/']);
    expect(getParentSheetPaths('/A/')).toEqual([]);
  });

  it('lists references ten to a line, case-insensitively sorted', () => {
    const fps = Array.from({ length: 12 }, (_, i) => ({ GetReferenceAsString: () => `R${i + 1}` }));
    expect(FormatComponentList(fps as never)).toBe(
      'R1, R10, R11, R12, R2, R3, R4, R5, R6, R7\nR8, R9',
    );
    expect(FormatComponentList([])).toBe('(none)');
  });
});

describe.runIf(HAVE_TEST_DATA)("MULTICHANNEL_TOOL on KiCad's regression boards", () => {
  it('copies field visibility and 3D models onto the target footprint (issue 22548)', () => {
    const board = LoadBoard('issue22548/issue22548');
    const mt = tool(board);
    mt.FindExistingRuleAreas();
    const ruleData = mt.GetData();
    expect(ruleData.m_areas.length).toBeGreaterThanOrEqual(2);

    const refArea = ruleData.m_areas.find((ra) => ra.m_ruleName.includes('Untitled Sheet/'))!;
    const targetArea = ruleData.m_areas.find((ra) => ra.m_ruleName.includes('Untitled Sheet1/'))!;
    const refFP = [...refArea.m_components].find((fp) => fp.GetReference().startsWith('U1'))!;
    const targetFP = [...targetArea.m_components].find((fp) => fp.GetReference().startsWith('U2'))!;
    // The fixture's two fields already agree; flip the reference so a copy that skips
    // visibility is seen.
    refFP.GetField(FIELD_T.VALUE).SetVisible(!targetFP.GetField(FIELD_T.VALUE).IsVisible());
    const refValueVisible = refFP.GetField(FIELD_T.VALUE).IsVisible();
    const refModels = refFP.Models().length;

    mt.CheckRACompatibility(refArea.m_zone!);
    ruleData.m_compatMap.get(targetArea)!.m_doCopy = true;
    ruleData.m_options.m_copyPlacement = true;
    expect(mt.RepeatLayoutAll(null, refArea.m_zone!)).toBeGreaterThanOrEqual(0);

    expect(targetFP.GetField(FIELD_T.VALUE).IsVisible()).toBe(refValueVisible);
    expect(targetFP.Models().length).toBe(refModels);
  });

  it("leaves the reference area's vias alone when a copper zone shares a rule area's name (issue 21184)", () => {
    const board = LoadBoard('issue21184/issue21184');
    const mt = tool(board);
    mt.FindExistingRuleAreas();
    const ruleData = mt.GetData();
    expect(ruleData.m_areas.length).toBe(2);

    const refArea = ruleData.m_areas.find((ra) => ra.m_ruleName === 'Test1')!;
    const targetArea = ruleData.m_areas.find((ra) => ra.m_ruleName === 'Test2')!;
    const refVias = (): number =>
      board
        .Tracks()
        .filter(
          (t) =>
            t.Type() === KICAD_T.PCB_VIA_T && refArea.m_zone!.Outline().Contains(t.GetPosition()),
        ).length;
    const before = refVias();
    expect(before).toBeGreaterThan(0);

    mt.CheckRACompatibility(refArea.m_zone!);
    ruleData.m_compatMap.get(targetArea)!.m_doCopy = true;
    ruleData.m_options.m_copyPlacement = true;
    ruleData.m_options.m_copyRouting = true;
    expect(mt.RepeatLayoutAll(null, refArea.m_zone!)).toBeGreaterThanOrEqual(0);

    expect(refVias()).toBe(before);
  });

  it("refuses a target that resolves to the reference's own components (issue 22318)", () => {
    const board = LoadBoard('issue22318/issue22318');
    const mt = tool(board);
    mt.FindExistingRuleAreas();
    const ruleData = mt.GetData();
    expect(ruleData.m_areas.length).toBe(4);

    const sharedCount = ruleData.m_areas[0]!.m_components.size;
    expect(sharedCount).toBeGreaterThan(0);
    for (const ra of ruleData.m_areas) expect(ra.m_components.size).toBe(sharedCount);

    const refArea = ruleData.m_areas[0]!;
    expect(mt.CheckRACompatibility(refArea.m_zone!)).toBeGreaterThanOrEqual(0);
    expect(ruleData.m_compatMap.size).toBe(3);
    for (const compat of ruleData.m_compatMap.values()) {
      expect(compat.m_isOk).toBe(false);
      expect(compat.m_errorMsg).toBe('Target Rule Area shares components with the reference area');
    }

    const err = { value: '' };
    expect(
      mt.RepeatLayout(null, refArea, ruleData.m_areas[1]!, DefaultRepeatLayoutOptions(), null, err),
    ).toBeLessThan(0);
    expect(err.value).not.toBe('');
  });

  it('copies a zone only when both rule areas hold all its layers (issue 22983)', () => {
    const board = LoadBoard('issue22983/issue22983');
    const mt = tool(board);
    mt.FindExistingRuleAreas();

    const sourceA = byPlacementGroup(mt, 'SourceA');
    const destA = byPlacementGroup(mt, 'DestA');
    const sourceB = byPlacementGroup(mt, 'SourceB');
    const destB = byPlacementGroup(mt, 'DestB');

    expect(countZones(board, 'MultilayerZoneFrontAndOne', sourceA)).toBe(1);
    expect(countZones(board, 'MultilayerZoneFrontAndOne', destA)).toBe(0);
    expect(countZones(board, 'MultilayerZoneSourceBLayerMismatch', sourceB)).toBe(1);
    expect(countZones(board, 'BottomZoneDontCopyMe', sourceB)).toBe(1);

    const options = {
      ...DefaultRepeatLayoutOptions(),
      m_copyPlacement: false,
      m_copyRouting: false,
      m_copyOtherItems: true,
      m_includeLockedItems: true,
    };

    // A target-side zone whose layers the target area does not all hold stays: drop B.Cu from
    // DestB and park an F.Cu+B.Cu zone inside it.
    const c = destB.m_zone!.Outline().COutline(0).Centre();
    const keep = new ZONE(board);
    keep.SetZoneName('KeepMe');
    keep.SetLayerSet(new LSET([PCB_LAYER_ID.F_Cu, PCB_LAYER_ID.B_Cu]));
    keep.AddPolygon([
      { x: c.x - 500000, y: c.y - 500000 },
      { x: c.x + 500000, y: c.y - 500000 },
      { x: c.x + 500000, y: c.y + 500000 },
      { x: c.x - 500000, y: c.y + 500000 },
    ]);
    board.Add(keep);
    destB.m_zone!.SetLayerSet(destB.m_zone!.GetLayerSet().and(new LSET([PCB_LAYER_ID.B_Cu]).not()));

    expect(mt.RepeatLayout(null, sourceA, destA, options)).toBeGreaterThanOrEqual(0);
    expect(mt.RepeatLayout(null, sourceB, destB, options)).toBeGreaterThanOrEqual(0);
    expect(board.Zones().includes(keep)).toBe(true);

    // SourceA and DestA both include F.Cu+B.Cu, so this multilayer zone should copy.
    expect(countZones(board, 'MultilayerZoneFrontAndOne', destA, true)).toBe(1);
    // SourceB only includes F.Cu, so neither the F.Cu+B.Cu nor the B.Cu-only zone copies. A
    // copy would be renamed "<name>_<n>" (issue 23131), which KiCad's exact-name count cannot
    // see, so these count the prefix.
    expect(countZones(board, 'MultilayerZoneSourceBLayerMismatch', destB, true)).toBe(0);
    expect(countZones(board, 'BottomZoneDontCopyMe', destB, true)).toBe(0);
  });
});

describe.runIf(HAVE_TEST_DATA)(
  'MULTICHANNEL_TOOL on vme-wren (MultichannelToolRegressions)',
  () => {
    it('offers 73 channels, generates 16 + 16 areas of 31 and 11 parts, and every pair matches', () => {
      const board = LoadBoard('vme-wren');
      const mt = tool(board);

      mt.GeneratePotentialRuleAreas();
      const ruleData = mt.GetData();
      // 73 counts the /fpga/ container sheet, now offered as a channel.
      expect(ruleData.m_areas.length).toBe(73);

      // GenerateRuleAreasIncludesChildSheets: a parent sheet's area holds its children's parts.
      const sheet = (aPath: string) => ruleData.m_areas.find((ra) => ra.m_sheetPath === aPath)!;
      const leaf = sheet('/io_drivers_fp/bank0/io01/');
      const mid = sheet('/io_drivers_fp/bank0/');
      const top = sheet('/io_drivers_fp/');
      expect([leaf.m_components.size, mid.m_components.size, top.m_components.size]).toEqual([
        31, 131, 527,
      ]);
      for (const fp of leaf.m_components) expect(mid.m_components.has(fp)).toBe(true);
      for (const fp of mid.m_components) expect(top.m_components.has(fp)).toBe(true);

      ruleData.m_replaceExisting = true;
      for (const ra of ruleData.m_areas) {
        if (ra.m_sheetName === 'io_driver.kicad_sch' || ra.m_sheetName === 'pp_driver_2x.kicad_sch')
          ra.m_generateEnabled = true;
      }

      // AutogenerateRuleAreas with no GUI: no dialog.
      mt.generateRuleAreas();
      mt.FindExistingRuleAreas();

      const io = ruleData.m_areas.filter((ra) => ra.m_ruleName.includes('io_drivers_fp'));
      const pp = ruleData.m_areas.filter((ra) => ra.m_ruleName.includes('io_drivers_pp'));
      expect(io.length).toBe(16);
      expect(pp.length).toBe(16);
      expect(ruleData.m_areas.length - io.length - pp.length).toBe(0);
      for (const ra of io) expect(ra.m_components.size).toBe(31);
      for (const ra of pp) expect(ra.m_components.size).toBe(11);

      const ref = io.find((ra) => ra.m_ruleName.includes('io_drivers_fp/bank3/io78/'))!;
      mt.CheckRACompatibility(ref.m_zone!);
      for (const target of io) {
        if (target === ref) continue;
        const compat = ruleData.m_compatMap.get(target)!;
        expect(
          compat.m_isOk,
          `${ref.m_ruleName} -> ${target.m_ruleName}: ${compat.m_errorMsg}`,
        ).toBe(true);
      }

      // A generated parent-sheet area takes its children's parts (memberOfSheetOrChildren).
      mt.GeneratePotentialRuleAreas();
      for (const ra of mt.GetData().m_areas)
        ra.m_generateEnabled = ra.m_sheetPath === '/io_drivers_fp/bank0/';
      mt.generateRuleAreas();
      mt.FindExistingRuleAreas();
      const bank0 = mt
        .GetData()
        .m_areas.find((ra) => ra.m_ruleName === 'auto-placement-area-/io_drivers_fp/bank0/')!;
      expect(bank0.m_components.size).toBe(131);
    }, 600_000);
  },
);

describe('CheckRACompatGlobalRailAcrossChannels (issue 24019)', () => {
  it('excludes a rail two channels carry internally, so a strap to another rail still matches', () => {
    const board = new BOARD();
    const addNet = (aName: string): number => {
      const net = new NETINFO_ITEM(board, aName);
      board.Add(net);
      return net.GetNetCode();
    };
    const netGnd = addNet('GND');
    const netVcc = addNet('+3V3');

    // Each channel is an IC (OUT + GND) and a config resistor strapped to a rail: GND in
    // channels 1 and 2, +3V3 in channel 3.
    const makeChannel = (aIdx: number, aStrapNet: number): ZONE => {
      const netOut = addNet(`Net-(U${aIdx}-OUT)`);
      const netCfg = addNet(`Net-(U${aIdx}-CFG)`);
      const addPad = (aFp: FOOTPRINT, aNumber: string, aNetCode: number): void => {
        const pad = new PAD(aFp);
        pad.SetNumber(aNumber);
        pad.SetShape(PADSTACK.ALL_LAYERS, PAD_SHAPE.CIRCLE);
        pad.SetSize(PADSTACK.ALL_LAYERS, { x: 1e6, y: 1e6 });
        pad.SetLayerSet(new LSET([PCB_LAYER_ID.F_Cu]));
        pad.SetNetCode(aNetCode);
        aFp.Add(pad);
      };
      const ic = new FOOTPRINT(board);
      ic.SetFPID(new LIB_ID('TestLib', 'SOT-23-6'));
      ic.SetReference(`U${aIdx}`);
      board.Add(ic);
      addPad(ic, '1', netOut);
      addPad(ic, '2', netGnd);
      const r = new FOOTPRINT(board);
      r.SetFPID(new LIB_ID('TestLib', 'R_0402'));
      r.SetReference(`R${aIdx}`);
      board.Add(r);
      addPad(r, '1', netCfg);
      addPad(r, '2', aStrapNet);
      const zone = new ZONE(board);
      board.Add(zone);
      return zone;
    };

    const mt = tool(board);
    const ruleData = mt.GetData();
    const zones: ZONE[] = [];

    for (const [idx, strap] of [
      [1, netGnd],
      [2, netGnd],
      [3, netVcc],
    ] as const) {
      const zone = makeChannel(idx, strap);
      zones.push(zone);
      const ra = new RULE_AREA();
      ra.m_zone = zone;
      ra.m_ruleName = `Channel ${idx}`;
      for (const fp of board.Footprints()) {
        if (fp.GetReference() === `U${idx}` || fp.GetReference() === `R${idx}`)
          ra.m_components.add(fp);
      }
      ruleData.m_areas.push(ra);
    }

    expect(mt.CheckRACompatibility(zones[1]!)).toBe(0);
    for (const ra of ruleData.m_areas) {
      if (ra.m_zone === zones[1]) continue;
      const compat = ruleData.m_compatMap.get(ra)!;
      expect(compat.m_isOk, `Channel 2 must match ${ra.m_ruleName}: ${compat.m_errorMsg}`).toBe(
        true,
      );
    }
  });
});
