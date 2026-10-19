// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * A fill run as a job (pcbnew/browser/fill_job.ts) and installed with applyFillJobResult leaves
 * the board exactly as ZONE_FILLER::Fill run in place does: every zone's fill state - the
 * polygons and their triangulation, flags, islands, hash, area - and every pad's and via's zone
 * layer overrides. The window's board takes the job's fill, so any difference here is a
 * difference between a fill on the worker and one on the window's thread.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LSET } from '@ziroeda/common/lset.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import type { BOARD } from '@ziroeda/pcbnew/board.js';
import { ZONE_LAYER_OVERRIDE } from '@ziroeda/pcbnew/board_item.js';
import { loadBoardForDrc } from '@ziroeda/pcbnew/browser/drc_job.js';
import {
  type FILL_JOB_REQUEST,
  applyFillJobResult,
  runFillJob,
} from '@ziroeda/pcbnew/browser/fill_job.js';
import type { PAD } from '@ziroeda/pcbnew/pad.js';
import type { PCB_VIA } from '@ziroeda/pcbnew/pcb_track.js';
import type { ZONE } from '@ziroeda/pcbnew/zone.js';
import { ISLAND_REMOVAL_MODE } from '@ziroeda/pcbnew/zone_settings.js';
import {
  CTL_ENUMERATE_LAYERS,
  CTL_FOR_BOARD,
  FormatBoard,
} from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import { ZONE_FILLER } from '@ziroeda/pcbnew/zone_filler.js';
import { describe, expect, it } from 'vitest';

const DATA = resolve(import.meta.dirname, '../../data/zone_fill');

function request(stem: string): FILL_JOB_REQUEST {
  const path = `${DATA}/${stem}_kicad_cli.kicad_pcb`;
  const pro = `${DATA}/${stem.replace(/_1006$/, '')}.kicad_pro`;

  return {
    boardText: readFileSync(path, 'utf8'),
    boardPath: path,
    boardUuid: '00000000-0000-0000-0000-00000000b0a2',
    projectText: existsSync(pro) ? readFileSync(pro, 'utf8') : null,
    rulesText: null,
    rulesPath: '',
    zones: [],
  };
}

const zonesOf = (aBoard: BOARD): ZONE[] => [
  ...aBoard.Zones(),
  ...aBoard.Footprints().flatMap((fp) => fp.Zones()),
];

/** Everything a fill leaves, keyed by item id, in a form toEqual compares field by field. */
function filledState(aBoard: BOARD) {
  const zones = zonesOf(aBoard).map((z) => [z.m_Uuid, z.GetFillState()] as const);
  const items: (PAD | PCB_VIA)[] = [
    ...aBoard.Footprints().flatMap((fp) => fp.Pads()),
    ...aBoard.Tracks().filter((t): t is PCB_VIA => t.Type() === KICAD_T.PCB_VIA_T),
  ];
  const overrides = items.flatMap((i) =>
    LSET.AllCuMask()
      .Seq()
      .map((l) => [i.m_Uuid, l, i.GetZoneLayerOverride(l)] as const)
      .filter(([, , o]) => o !== ZONE_LAYER_OVERRIDE.ZLO_NONE),
  );

  return { zones, overrides };
}

/**
 * \a aStem's board, changed by \a aEdit and written back: the fills a fixture alone does not
 * reach - islands kept, islands removed by area, a zone inside a footprint.
 */
function variant(aStem: string, aEdit: (aBoard: BOARD) => void): FILL_JOB_REQUEST {
  const req = request(aStem);
  const board = loadBoardForDrc(req);

  aEdit(board);

  return { ...req, boardText: FormatBoard(board, undefined, CTL_FOR_BOARD | CTL_ENUMERATE_LAYERS) };
}

const REQUESTS: [string, () => FILL_JOB_REQUEST][] = [
  ...['ecc83-pp', 'flashing', 'waveorder_1006', 'hatchpads', 'StickHub'].map(
    (stem) => [stem, () => request(stem)] as [string, () => FILL_JOB_REQUEST],
  ),
  [
    'StickHub, islands never removed',
    () =>
      variant('StickHub', (b) => {
        for (const z of b.Zones()) z.SetIslandRemovalMode(ISLAND_REMOVAL_MODE.NEVER);
      }),
  ],
  [
    'StickHub, islands removed below an area',
    () =>
      variant('StickHub', (b) => {
        for (const z of b.Zones()) {
          z.SetIslandRemovalMode(ISLAND_REMOVAL_MODE.AREA);
          z.SetMinIslandArea(4_000_000_000_000); // 4 mm²
        }
      }),
  ],
  [
    'ecc83-pp, its zone inside a footprint',
    () =>
      variant('ecc83-pp', (b) => {
        const zone = b.Zones()[0]!;

        b.Remove(zone);
        b.Footprints()[0]!.Add(zone);
      }),
  ],
];

describe('a fill run as a job installs exactly what Fill leaves in place', () => {
  for (const [name, make] of REQUESTS) {
    it(name, async () => {
      const req = make();

      const inPlace = loadBoardForDrc(req);
      const zones = zonesOf(inPlace).filter((z) => !z.GetIsRuleArea());
      expect(new ZONE_FILLER(inPlace, null).Fill(zones)).toBe(true);

      const viaJob = loadBoardForDrc(req);
      const result = await runFillJob(
        { ...req, zones: zones.map((z) => z.m_Uuid) },
        { onPhase: () => {}, onProgress: () => {} },
      );
      expect(result.filled).toBe(true);
      applyFillJobResult(viaJob, result);

      const want = filledState(inPlace);
      // The fill must have done something, or the comparison proves nothing.
      expect(want.zones.some(([, s]) => s.layers.some((l) => (l.polys?.length ?? 0) > 0))).toBe(
        true,
      );
      expect(filledState(viaJob)).toEqual(want);
    }, 120_000);
  }
});
