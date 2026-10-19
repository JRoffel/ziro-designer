// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * RENDER_VIEW_MIRROR (pcbnew/browser/render_mirror.ts): what the window's VIEW does reaches the
 * render worker's VIEW - commits, a selection's repaint, a hidden item, layer visibility, the
 * painter's settings ahead of a recache - and the worker's board and view end up as the
 * window's. Both VIEWs are real PCB_VIEWs on a stub GAL.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FRAME_T } from '@ziroeda/common/frame_type.js';
import { GAL } from '@ziroeda/common/gal/graphics_abstraction_layer.js';
import { GAL_DISPLAY_OPTIONS } from '@ziroeda/common/gal/gal_display_options.js';
import { PCB_LAYER_ID } from '@ziroeda/common/layer_id.js';
import { VIEW_UPDATE_FLAGS, VIEW_VISIBILITY_FLAGS } from '@ziroeda/common/view/view_item.js';
import type { BOARD } from '@ziroeda/pcbnew/board.js';
import { BOARD_COMMIT } from '@ziroeda/pcbnew/board_commit.js';
import type { BOARD_ITEM } from '@ziroeda/pcbnew/board_item.js';
import {
  ApplyRenderViewBatch,
  RENDER_VIEW_MIRROR,
  type RENDER_VIEW_BATCH,
} from '@ziroeda/pcbnew/browser/render_mirror.js';
import { FormatRenderSyncItems } from '@ziroeda/pcbnew/browser/render_sync.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import { ZONE_DISPLAY_MODE } from '@ziroeda/common/project/board_project_settings.js';
import { PCB_PAINTER } from '@ziroeda/pcbnew/pcb_painter.js';
import { PCB_VIEW } from '@ziroeda/pcbnew/pcb_view.js';
import { beforeEach, describe, expect, it } from 'vitest';
import { TEST_PCB_FRAME } from './support/test_pcb_frame.js';
import { type TOOL_HARNESS, toolHarness } from './support/pcb_tool_harness.js';

const TEXT = readFileSync(
  resolve(import.meta.dirname, '../../data/zone_fill/ecc83-pp_kicad_cli.kicad_pcb'),
  'utf8',
);

class STUB_GAL extends GAL {
  override ResizeScreen(aWidth: number, aHeight: number): void {
    this.m_screenSize = { x: aWidth, y: aHeight };
  }
}

const top = (aBoard: BOARD): BOARD_ITEM[] =>
  [
    ...aBoard.Footprints(),
    ...aBoard.Tracks(),
    ...aBoard.Zones(),
    ...aBoard.Drawings(),
  ] as BOARD_ITEM[];

const items = (aBoard: BOARD): Map<string, string> =>
  new Map(top(aBoard).map((i) => [i.m_Uuid, FormatRenderSyncItems(aBoard, [i])]));

let h: TOOL_HARNESS<TEST_PCB_FRAME>;
let copy: BOARD;
let wView: PCB_VIEW;
let wPainter: PCB_PAINTER;
let mirror: RENDER_VIEW_MIRROR;
let batches: RENDER_VIEW_BATCH[];

beforeEach(() => {
  h = toolHarness(
    TEXT,
    (b) => new TEST_PCB_FRAME(b),
    () => [],
  );

  copy = ParseBoard(TEXT);
  copy.BuildConnectivity();
  const gal = new STUB_GAL(new GAL_DISPLAY_OPTIONS());
  gal.ResizeScreen(1000, 1000);
  wView = new PCB_VIEW();
  wView.SetGAL(gal);
  wPainter = new PCB_PAINTER(gal, FRAME_T.FRAME_PCB_EDITOR);
  wView.SetPainter(wPainter);
  for (const item of copy.GetItemSet()) wView.Add(item);

  batches = [];
  const painter = h.view.GetPainter() as PCB_PAINTER;
  mirror = new RENDER_VIEW_MIRROR(
    h.board,
    () => painter.GetSettings(),
    (b) => {
      batches.push(b);
      ApplyRenderViewBatch(copy, wView, wPainter.GetSettings(), b);
    },
  );
  // The window's VIEW has processed its own adds before the worker is attached, as in the editor.
  h.view.UpdateItems();
  h.view.SetOverlayOnly(true);
  h.view.SetRemoteView(mirror);
});

/** Let the window's VIEW process its pending updates, then deliver the batch. */
function settle(): void {
  h.view.UpdateItems();
  mirror.Flush();
}

const inCopy = (aItem: BOARD_ITEM): BOARD_ITEM => copy.ResolveItem(aItem.m_Uuid, true)!;

describe("the render worker's VIEW follows the window's", () => {
  it('a commit: a moved footprint and a deleted track', () => {
    const fp = h.board.Footprints()[0]!;
    const track = h.board.Tracks()[0]!;

    const commit = new BOARD_COMMIT(h.frame);
    commit.Modify(fp);
    fp.Move({ x: 1_000_000, y: 0 });
    commit.Remove(track);
    commit.Push('test');
    settle();

    expect(items(copy)).toEqual(items(h.board));
    expect(copy.ResolveItem(track.m_Uuid, true)).toBeNull();
  });

  it("a selection's repaint carries the selected flag, and no item text", () => {
    const fp = h.board.Footprints()[1]!;

    fp.SetSelected();
    h.view.Update(fp, VIEW_UPDATE_FLAGS.REPAINT);
    settle();

    expect(inCopy(fp).IsSelected()).toBe(true);
    expect(batches.at(-1)!.upsert).toBe('');

    fp.ClearSelected();
    h.view.Update(fp, VIEW_UPDATE_FLAGS.REPAINT);
    settle();

    expect(inCopy(fp).IsSelected()).toBe(false);
  });

  it('a hidden item is hidden there too', () => {
    const track = h.board.Tracks()[1]!;

    h.view.Hide(track, true);
    mirror.Flush();

    expect(inCopy(track).viewPrivData()!.m_flags & VIEW_VISIBILITY_FLAGS.HIDDEN).toBeTruthy();
  });

  it('layer visibility', () => {
    h.view.SetLayerVisible(PCB_LAYER_ID.B_Cu, false);
    mirror.Flush();

    expect(wView.IsLayerVisible(PCB_LAYER_ID.B_Cu)).toBe(false);
  });

  it("the painter's settings go ahead of the recache that reads them", () => {
    const rs = (h.view.GetPainter() as PCB_PAINTER).GetSettings();

    rs.m_ZoneDisplayMode = ZONE_DISPLAY_MODE.SHOW_ZONE_OUTLINE;
    h.view.RecacheAllItems();
    mirror.Flush();

    expect(wPainter.GetSettings().m_ZoneDisplayMode).toBe(ZONE_DISPLAY_MODE.SHOW_ZONE_OUTLINE);
    const ops = batches.at(-1)!.ops.map((o) => (o.op === 'call' ? o.name : o.op));
    expect(ops.slice(-2)).toEqual(['settings', 'RecacheAllItems']);
  });

  it('an overlay-only VIEW caches nothing, and a recache sends one call, not one per item', () => {
    h.view.RecacheAllItems();
    settle();

    const last = batches.at(-1)!;
    expect(last.upsert).toBe('');
    expect(last.ops.filter((o) => o.op === 'update')).toEqual([]);
  });
});
