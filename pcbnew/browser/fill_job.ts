// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `ZONE_FILLER::Fill` as a job for another thread - the DRC job's sibling.
 *
 * KiCad pours on its thread pool while the progress dialog pumps the GUI thread. A browser pour
 * on the window's thread holds it from the first zone to the last (30 s on the Video demo), so
 * the window freezes. Here the worker loads the same board the DRC job loads (the editor's own
 * load, over the board's text), runs the filler unchanged, and hands back what the fill left:
 * each zone's fill state and every pad's and via's zone layer overrides, which the window
 * installs on its own board.
 */
import { EMBEDDED_FILES } from '@ziroeda/common/embedded_files.js';
import { PCB_LAYER_ID } from '@ziroeda/common/layer_id.js';
import { LSET } from '@ziroeda/common/lset.js';
import type { BOARD } from '../board.js';
import { ZONE_LAYER_OVERRIDE } from '../board_item.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import type { PAD } from '../pad.js';
import type { PCB_VIA } from '../pcb_track.js';
import type { ZONE, ZONE_FILL_STATE } from '../zone.js';
import { ZONE_FILLER } from '../zone_filler.js';
import { type DRC_JOB_REQUEST, JOB_REPORTER, loadBoardForDrc } from './drc_job.js';

export type FILL_JOB_REQUEST = Pick<
  DRC_JOB_REQUEST,
  'boardText' | 'boardPath' | 'boardUuid' | 'projectText' | 'rulesText' | 'rulesPath'
> & {
  /** The `m_Uuid`s of the zones `Fill( aZones )` was given, in that order. */
  zones: string[];
};

export interface FILL_JOB_RESULT {
  /** `ZONE_FILLER::Fill`'s return: false when it was cancelled or failed. */
  filled: boolean;
  /** Every zone of the board, after the fill: a fill can touch more than it was given. */
  zones: { id: string; state: ZONE_FILL_STATE }[];
  /** Every pad's and via's non-default overrides, after the fill: [id, layer, override]. */
  overrides: [string, PCB_LAYER_ID, ZONE_LAYER_OVERRIDE][];
}

export interface FILL_JOB_HOOKS {
  onPhase(aMessage: string): void;
  onProgress(aValue: number): void;
  isCancelled?(): boolean;
}

/** The pads and vias whose zone layer overrides the filler sets, and so must be carried back. */
function flashedItems(aBoard: BOARD): (PAD | PCB_VIA)[] {
  const out: (PAD | PCB_VIA)[] = [];

  for (const fp of aBoard.Footprints()) out.push(...fp.Pads());

  for (const track of aBoard.Tracks()) {
    if (track.Type() === KICAD_T.PCB_VIA_T) out.push(track as PCB_VIA);
  }

  return out;
}

/** Every zone the filler can have written: the board's own and the footprints'. */
function allZones(aBoard: BOARD): ZONE[] {
  const out: ZONE[] = [...aBoard.Zones()];

  for (const fp of aBoard.Footprints()) out.push(...fp.Zones());

  return out;
}

const COPPER = LSET.AllCuMask();

/** Run the fill the request describes, on this thread. */
export async function runFillJob(
  aRequest: FILL_JOB_REQUEST,
  aHooks: FILL_JOB_HOOKS,
): Promise<FILL_JOB_RESULT> {
  // The parse meets embedded files on boards that carry fonts or models.
  await EMBEDDED_FILES.InitCodec();

  const board = loadBoardForDrc(aRequest);
  const byId = new Map(allZones(board).map((z) => [z.m_Uuid, z]));
  const zones = aRequest.zones.map((id) => byId.get(id)).filter((z): z is ZONE => !!z);

  const filler = new ZONE_FILLER(board, null);
  filler.SetProgressReporter(new JOB_REPORTER({ ...aHooks, onViolation: () => {} }));

  const filled = filler.Fill(zones);

  const overrides: FILL_JOB_RESULT['overrides'] = [];

  for (const item of flashedItems(board)) {
    for (const layer of COPPER.Seq()) {
      const o = item.GetZoneLayerOverride(layer);

      if (o !== ZONE_LAYER_OVERRIDE.ZLO_NONE) overrides.push([item.m_Uuid, layer, o]);
    }
  }

  return {
    filled,
    zones: allZones(board).map((z) => ({ id: z.m_Uuid, state: z.GetFillState() })),
    overrides,
  };
}

/**
 * Install a FILL_JOB_RESULT on the window's board: what `Fill` would have left had it run here.
 * The caller has already `Modify`'d the zones in its commit, as `Fill` does before it pours.
 */
export function applyFillJobResult(aBoard: BOARD, aResult: FILL_JOB_RESULT): void {
  const byId = new Map(allZones(aBoard).map((z) => [z.m_Uuid, z]));

  for (const { id, state } of aResult.zones) byId.get(id)?.SetFillState(state);

  // `ZONE_FILLER::PrepareBoardForFill` clears every override before it decides them again.
  const items = new Map(flashedItems(aBoard).map((i) => [i.m_Uuid, i]));

  for (const item of items.values()) item.ClearZoneLayerOverrides();

  for (const [id, layer, o] of aResult.overrides) items.get(id)?.SetZoneLayerOverride(layer, o);
}

/** The typed arrays a result owns, for the worker's transfer list. */
export function fillJobTransferables(aResult: FILL_JOB_RESULT): Transferable[] {
  const out: Transferable[] = [];

  for (const { state } of aResult.zones) {
    for (const l of state.layers) {
      for (const poly of l.polys ?? []) for (const chain of poly) out.push(chain.pts.buffer);

      for (const tp of l.triangulation?.polys ?? []) {
        out.push(tp.vertices.buffer);
        out.push(tp.triangles.buffer);
      }
    }
  }

  return out;
}
