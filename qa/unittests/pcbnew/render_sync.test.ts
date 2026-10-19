// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * RENDER_SYNC (pcbnew/browser/render_sync.ts): every edit pushed through BOARD_COMMIT on the
 * window's board reaches the render worker's copy, and leaves it equal - item for item, as each
 * writes itself - to the board the tools edited.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import type { BOARD } from '@ziroeda/pcbnew/board.js';
import { BOARD_COMMIT } from '@ziroeda/pcbnew/board_commit.js';
import type { BOARD_ITEM } from '@ziroeda/pcbnew/board_item.js';
import type { BOARD_CONNECTED_ITEM } from '@ziroeda/pcbnew/board_connected_item.js';
import type { FOOTPRINT } from '@ziroeda/pcbnew/footprint.js';
import {
  ApplyRenderSync,
  FormatRenderSyncItems,
  RENDER_SYNC,
} from '@ziroeda/pcbnew/browser/render_sync.js';
import { NETINFO_ITEM } from '@ziroeda/pcbnew/netinfo_item.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import { PCB_TRACK } from '@ziroeda/pcbnew/pcb_track.js';
import type { ZONE } from '@ziroeda/pcbnew/zone.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { TEST_PCB_FRAME } from './support/test_pcb_frame.js';
import { type TOOL_HARNESS, toolHarness } from './support/pcb_tool_harness.js';

const TEXT = readFileSync(
  resolve(import.meta.dirname, '../../data/zone_fill/ecc83-pp_kicad_cli.kicad_pcb'),
  'utf8',
);

/** Every top-level item, by uuid, as it writes itself (nets by name, so the two boards compare). */
function items(aBoard: BOARD): Map<string, string> {
  const out = new Map<string, string>();

  // A net that prints the right name but is not this board's NETINFO_ITEM (net colours, the
  // highlighted net and connectivity all go by this board's own) marks the item.
  const foreign = (aItem: BOARD_ITEM): boolean => {
    const connected = (aItem.Type() === KICAD_T.PCB_FOOTPRINT_T
      ? (aItem as unknown as FOOTPRINT).Pads()
      : aItem.IsConnected()
        ? [aItem]
        : []) as unknown as BOARD_CONNECTED_ITEM[];

    return connected.some(
      (c) => c.GetNetCode() > 0 && c.GetNet() !== aBoard.FindNet(c.GetNetname()),
    );
  };

  for (const item of [
    ...aBoard.Footprints(),
    ...aBoard.Tracks(),
    ...aBoard.Zones(),
    ...aBoard.Drawings(),
  ] as BOARD_ITEM[])
    out.set(
      item.m_Uuid,
      FormatRenderSyncItems(aBoard, [item]) + (foreign(item) ? ' FOREIGN-NET' : ''),
    );

  return out;
}

let h: TOOL_HARNESS<TEST_PCB_FRAME>;
let copy: BOARD;
let sync: RENDER_SYNC;
let messages: number;

beforeEach(() => {
  h = toolHarness(
    TEXT,
    (b) => new TEST_PCB_FRAME(b),
    () => [],
  );
  copy = ParseBoard(TEXT);
  copy.BuildConnectivity();
  messages = 0;
  sync = new RENDER_SYNC(h.board, (m) => {
    messages++;
    ApplyRenderSync(copy, null, m);
  });
  h.board.AddListener(sync);
});

/** Push \a aEdit as one commit and deliver what it changed. */
function edit(aEdit: (aCommit: BOARD_COMMIT) => void): void {
  const commit = new BOARD_COMMIT(h.frame);
  aEdit(commit);
  commit.Push('test');
  sync.Flush();
}

describe('the render worker’s board follows every commit', () => {
  it('starts equal', () => {
    expect(items(copy)).toEqual(items(h.board));
  });

  it('a moved footprint', () => {
    const fp = h.board.Footprints()[0]!;

    edit((c) => {
      c.Modify(fp);
      fp.Move({ x: 1_000_000, y: -2_000_000 });
    });

    expect(messages).toBe(1);
    expect(items(copy)).toEqual(items(h.board));
  });

  it('a deleted track and a new one', () => {
    const track = h.board.Tracks()[0]!;
    const fresh = new PCB_TRACK(h.board);

    fresh.SetStart({ x: 0, y: 0 });
    fresh.SetEnd({ x: 5_000_000, y: 0 });
    fresh.SetWidth(250_000);
    fresh.SetNet(track.GetNet());

    edit((c) => {
      c.Remove(track);
      c.Add(fresh);
    });

    const want = items(h.board);

    expect(want.has(track.m_Uuid)).toBe(false);
    expect(want.has(fresh.m_Uuid)).toBe(true);
    expect(items(copy)).toEqual(want);
  });

  it('a pad moved to another net, and to a net the copy has not seen', () => {
    const fp = h.board.Footprints().find((f) => f.Pads().length > 1)!;
    const [a, b] = fp.Pads();
    const added = new NETINFO_ITEM(h.board, 'RENDER_SYNC_NEW', h.board.GetNetInfo().GetNetCount());

    h.board.Add(added);

    edit((c) => {
      c.Modify(fp);
      a!.SetNet(b!.GetNet());
      b!.SetNet(added);
    });

    expect(copy.FindNet('RENDER_SYNC_NEW')).not.toBeNull();
    expect(items(copy)).toEqual(items(h.board));
  });

  it('an edited zone', () => {
    const zone = h.board.Zones()[0] as ZONE;

    edit((c) => {
      c.Modify(zone);
      zone.Outline().Move({ x: 500_000, y: 500_000 });
      zone.UnFill();
    });

    expect(items(copy)).toEqual(items(h.board));
    expect(
      copy
        .Zones()
        .find((z) => z.m_Uuid === zone.m_Uuid)!
        .Type(),
    ).toBe(KICAD_T.PCB_ZONE_T);
  });
});
