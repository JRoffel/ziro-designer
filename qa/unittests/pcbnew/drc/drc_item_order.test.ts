// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * Which of a violation's two items DRC names first. DRC_TEST_PROVIDER_COPPER_CLEARANCE tests each
 * pad pair once, from the pad at the lower address (`pad > other` in its filter), and reports
 * `SetItems( pad, otherPad )` - so the order is the order the pads were MADE, which for a board
 * read from a file is file order. qa/data/pcbnew/drc/pad_pair_order.kicad_pcb has pad "6" before
 * pad "9", overlapping, on different nets, pad 9 with the lower UUID; `kicad-cli pcb drc` (10.0.6)
 * reports "Pad 6 [A] of Q1 on F.Cu" then "Pad 9 [B] of Q1 on F.Cu".
 */
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { RPT_SEVERITY_IGNORE } from '@ziroeda/common/reporter.js';
import { ptrLess } from '@ziroeda/core/kicad_algo.js';
import type { BOARD_ITEM } from '@ziroeda/pcbnew/board_item.js';
import { DRC_ENGINE } from '@ziroeda/pcbnew/drc/drc_engine.js';
import { type DRC_ITEM, PCB_DRC_CODE } from '@ziroeda/pcbnew/drc/drc_item.js';
import type { PAD } from '@ziroeda/pcbnew/pad.js';
import '@ziroeda/pcbnew/browser/drc_test_providers.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';

const BOARD_PATH = new URL('../../../data/pcbnew/drc/pad_pair_order.kicad_pcb', import.meta.url)
  .pathname;

it('names a pad pair in the order the pads were made, whatever compared them first', () => {
  const board = ParseBoard(readFileSync(BOARD_PATH, 'utf8'), BOARD_PATH);
  const engine = new DRC_ENGINE(board, board.GetDesignSettings());
  engine.InitEngine(null);
  const bds = board.GetDesignSettings();
  bds.m_DRCEngine = engine;
  bds.m_DRCSeverities.set(PCB_DRC_CODE.DRCE_LIB_FOOTPRINT_ISSUES, RPT_SEVERITY_IGNORE);
  bds.m_DRCSeverities.set(PCB_DRC_CODE.DRCE_LIB_FOOTPRINT_MISMATCH, RPT_SEVERITY_IGNORE);
  board.BuildListOfNets();
  board.BuildConnectivity();

  const pads = board.Footprints()[0]!.Pads() as PAD[];
  const byNumber = (n: string) => pads.find((p) => p.GetNumber() === n)!;

  // Something else compares pad 9 with pad 6 first - a set, a sort - as the editor does long
  // before DRC runs. An address does not depend on that.
  ptrLess(byNumber('9'), byNumber('6'));

  const found: DRC_ITEM[] = [];
  engine.SetViolationHandler((aItem: DRC_ITEM) => {
    if (aItem.GetErrorCode() === PCB_DRC_CODE.DRCE_CLEARANCE) found.push(aItem);
  });
  engine.RunTests('mm', true, false);

  const itemMap = board.FillItemMap();
  const named = found.map((v) =>
    [v.GetMainItemID(), v.GetAuxItemID()].map((id) =>
      (itemMap.get(id) as BOARD_ITEM as PAD).GetNumber(),
    ),
  );

  expect(named).toEqual([['6', '9']]);
});
