// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `PCB_BASE_EDIT_FRAME::PutDataInPreviousState` (undo_redo.cpp:672-677)
 * rebuilds the whole board's connectivity after an undo. Ours puts back only
 * the items the command touched. This holds that the connectivity it leaves is
 * the one a full `BOARD::BuildConnectivity()` gives: every connected item's
 * net, what each one connects to, and the unconnected count.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { UNDO_REDO } from '@ziroeda/common/undo_redo_container.js';
import { KICAD_T } from '@ziroeda/core/typeinfo.js';
import type { BOARD } from '@ziroeda/pcbnew/board.js';
import type { BOARD_CONNECTED_ITEM } from '@ziroeda/pcbnew/board_connected_item.js';
import { BOARD_COMMIT } from '@ziroeda/pcbnew/board_commit.js';
import type { FOOTPRINT } from '@ziroeda/pcbnew/footprint.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import { TEST_PCB_FRAME } from './support/test_pcb_frame.js';

const ECC83 = fileURLToPath(
  new URL('../../data/zone_fill/ecc83-pp_kicad_cli.kicad_pcb', import.meta.url),
);

function load(): { board: BOARD; frame: TEST_PCB_FRAME } {
  const board = ParseBoard(readFileSync(ECC83, 'utf8'));
  const frame = new TEST_PCB_FRAME(board);
  board.BuildConnectivity();
  return { board, frame };
}

/** The connected items, each with its net and the uuids it connects to, and the count. */
function connectivityOf(board: BOARD): string[] {
  const conn = board.GetConnectivity();
  const items: BOARD_CONNECTED_ITEM[] = [
    ...board.Footprints().flatMap((f) => f.Pads()),
    ...board.Tracks(),
    ...board.Zones(),
  ];
  const rows = items.map((it) => {
    const to = conn
      .GetConnectedItems(it)
      .map((c) => c.m_Uuid)
      .sort();
    return `${it.GetClass()} ${it.m_Uuid} net ${it.GetNetCode()} -> ${to.join(',')}`;
  });
  rows.sort();
  rows.push(`unconnected ${conn.GetUnconnectedCount(false)}`);
  return rows;
}

/** What a full rebuild of the same board gives. */
function rebuilt(board: BOARD): string[] {
  board.BuildConnectivity();
  return connectivityOf(board);
}

const fpWithPads = (board: BOARD): FOOTPRINT =>
  board.Footprints().find((f) => f.Pads().length >= 3 && f.Pads().some((p) => p.GetNetCode() > 0))!;

describe('undo leaves the connectivity a full build would', () => {
  it('after moving a footprint off its tracks, and on the redo', () => {
    const { board, frame } = load();
    const before = connectivityOf(board);
    const fp = fpWithPads(board);
    const commit = new BOARD_COMMIT(frame);
    commit.Modify(fp);
    fp.Move({ x: 5_000_000, y: 3_000_000 });
    commit.Push('Move');
    const moved = connectivityOf(board);
    expect(moved).not.toEqual(before);

    frame.RestoreCopyFromUndoList();
    const undone = connectivityOf(board);
    expect(undone).toEqual(before);
    expect(undone).toEqual(rebuilt(board));

    frame.RestoreCopyFromRedoList();
    const redone = connectivityOf(board);
    expect(redone).toEqual(moved);
    expect(redone).toEqual(rebuilt(board));
  });

  it('after deleting a footprint', () => {
    const { board, frame } = load();
    const before = connectivityOf(board);
    const commit = new BOARD_COMMIT(frame);
    commit.Remove(fpWithPads(board));
    commit.Push('Delete');

    frame.RestoreCopyFromUndoList();
    const undone = connectivityOf(board);
    expect(undone).toEqual(before);
    expect(undone).toEqual(rebuilt(board));
  });

  it('after deleting tracks and a via', () => {
    const { board, frame } = load();
    const before = connectivityOf(board);
    const commit = new BOARD_COMMIT(frame);
    const via = board.Tracks().find((t) => t.Type() === KICAD_T.PCB_VIA_T);
    for (const t of [
      ...board
        .Tracks()
        .filter((t) => t.Type() === KICAD_T.PCB_TRACE_T)
        .slice(0, 6),
      ...(via ? [via] : []),
    ])
      commit.Remove(t);
    commit.Push('Delete tracks');

    frame.RestoreCopyFromUndoList();
    const undone = connectivityOf(board);
    expect(undone).toEqual(before);
    expect(undone).toEqual(rebuilt(board));
  });

  it('after moving one pad inside its footprint', () => {
    const { board, frame } = load();
    const before = connectivityOf(board);
    const pad = fpWithPads(board)
      .Pads()
      .find((p) => p.GetNetCode() > 0)!;
    const commit = new BOARD_COMMIT(frame);
    commit.Modify(pad);
    pad.Move({ x: 4_000_000, y: 0 });
    commit.Push('Move pad');
    const moved = connectivityOf(board);
    expect(moved).not.toEqual(before);

    frame.RestoreCopyFromUndoList();
    const undone = connectivityOf(board);
    expect(undone).toEqual(before);
    expect(undone).toEqual(rebuilt(board));

    frame.RestoreCopyFromRedoList();
    const redone = connectivityOf(board);
    expect(redone).toEqual(moved);
    expect(redone).toEqual(rebuilt(board));
  });

  it('after a pad filed by itself, not through its footprint', () => {
    // A BOARD_COMMIT files a pad's footprint, which BOARD::Add and ::Remove carry in and
    // out of the connectivity. A pad filed alone goes through its footprint's Add and
    // Remove, which do not.
    const { board, frame } = load();
    const before = connectivityOf(board);
    const pad = fpWithPads(board)
      .Pads()
      .find((p) => p.GetNetCode() > 0)!;
    frame.SaveCopyInUndoList(pad, UNDO_REDO.CHANGED);
    pad.Move({ x: 4_000_000, y: 0 });
    board.GetConnectivity().Update(pad);
    board.GetConnectivity().RecalculateRatsnest();
    expect(connectivityOf(board)).not.toEqual(before);

    frame.RestoreCopyFromUndoList();
    const undone = connectivityOf(board);
    expect(undone).toEqual(before);
    expect(undone).toEqual(rebuilt(board));
  });
});
