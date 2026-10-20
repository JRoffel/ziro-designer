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
import { RECURSE_MODE } from '@ziroeda/common/eda_item.js';
import { PAGE_INFO, PAGE_SIZE_TYPE } from '@ziroeda/common/page_info.js';
import { TITLE_BLOCK } from '@ziroeda/common/title_block.js';
import { IS_MOVING } from '@ziroeda/common/eda_item_flags.js';
import { LAYER_GP_OVERLAY, LAYER_SELECT_OVERLAY, PCB_LAYER_ID } from '@ziroeda/common/layer_id.js';
import { VIEW_GROUP } from '@ziroeda/common/view/view_group.js';
import { VIEW_UPDATE_FLAGS, VIEW_VISIBILITY_FLAGS } from '@ziroeda/common/view/view_item.js';
import type { BOARD } from '@ziroeda/pcbnew/board.js';
import { BOARD_COMMIT } from '@ziroeda/pcbnew/board_commit.js';
import type { BOARD_ITEM } from '@ziroeda/pcbnew/board_item.js';
import {
  ApplyRenderViewBatch,
  RENDER_VIEW_MIRROR,
  type RENDER_VIEW_BATCH,
  RenderGroupsOf,
} from '@ziroeda/pcbnew/browser/render_mirror.js';
import { FormatRenderSyncItems } from '@ziroeda/pcbnew/browser/render_sync.js';
import { ApplyProjectToBoard } from '@ziroeda/pcbnew/browser/drc_job.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import { ZONE_DISPLAY_MODE } from '@ziroeda/common/project/board_project_settings.js';
import { PCB_PAINTER } from '@ziroeda/pcbnew/pcb_painter.js';
import { PCB_VIEW } from '@ziroeda/pcbnew/pcb_view.js';
import { PCB_SELECTION } from '@ziroeda/pcbnew/tools/pcb_selection.js';
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
let projectText: string | null;

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
  projectText = null;
  const painter = h.view.GetPainter() as PCB_PAINTER;
  mirror = new RENDER_VIEW_MIRROR(
    h.board,
    () => painter.GetSettings(),
    (b) => {
      batches.push(b);
      ApplyRenderViewBatch(copy, wView, wPainter.GetSettings(), b, {
        projectChanged: (aText) => ApplyProjectToBoard(copy, '', aText),
      });
    },
    () => projectText,
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

  it('a moved board edge moves the worker’s board outline', () => {
    const edge = h.board.Drawings().find((d) => d.GetLayer() === PCB_LAYER_ID.Edge_Cuts)!;
    const outline = (aBoard: BOARD): string =>
      JSON.stringify(aBoard.BoardOutline().GetOutline().BBox());

    h.board.UpdateBoardOutline();
    copy.UpdateBoardOutline();
    const before = outline(copy);

    const commit = new BOARD_COMMIT(h.frame);
    commit.Modify(edge);
    edge.Move({ x: 5_000_000, y: 0 });
    commit.Push('test');
    settle();

    expect(outline(h.board)).not.toBe(before);
    expect(outline(copy)).toBe(outline(h.board));
  });

  it("a conditional update carries the painter's settings it was made for", () => {
    const rs = (h.view.GetPainter() as PCB_PAINTER).GetSettings();
    const track = h.board.Tracks()[0]!;

    rs.SetHighlight(true, track.GetNetCode());
    h.view.UpdateAllItemsConditionally(VIEW_UPDATE_FLAGS.REPAINT, (i) => i === track);
    settle();

    expect([...wPainter.GetSettings().GetHighlightNetCodes()]).toEqual([track.GetNetCode()]);
  });

  it('Page Settings: the page and the title block reach the worker’s board', () => {
    const page = new PAGE_INFO(PAGE_SIZE_TYPE.A3);
    const titles = new TITLE_BLOCK();

    titles.SetTitle('Render worker');
    h.board.SetPageSettings(page);
    h.board.SetTitleBlock(titles);
    mirror.Flush();

    expect(copy.GetTitleBlock().GetTitle()).toBe('Render worker');
    expect(copy.GetPageSettings().GetSizeMils()).toEqual(h.board.GetPageSettings().GetSizeMils());
    expect(copy.GetPageSettings().GetSizeMils()).not.toEqual(
      new PAGE_INFO(PAGE_SIZE_TYPE.A4).GetSizeMils(),
    );
  });

  it('Board Setup: a changed project file reaches the worker’s board, ahead of the repaint', () => {
    const clearance = (): number =>
      copy.GetDesignSettings().m_NetSettings.GetDefaultNetclass().GetClearance();
    const before = clearance();

    projectText = JSON.stringify({
      net_settings: { classes: [{ name: 'Default', clearance: 0.4321 }] },
    });
    h.view.UpdateAllItemsConditionally(VIEW_UPDATE_FLAGS.REPAINT, () => true);
    settle();

    expect(before).not.toBe(432_100);
    expect(clearance()).toBe(432_100);
    expect(batches.at(-1)!.ops[0]!.op).toBe('project');
  });

  it('an overlay-only VIEW caches nothing, and a recache sends one call, not one per item', () => {
    h.view.RecacheAllItems();
    settle();

    const last = batches.at(-1)!;
    expect(last.upsert).toBe('');
    expect(last.ops.filter((o) => o.op === 'update')).toEqual([]);
  });
});

describe('the selection is drawn by the worker while it stands still', () => {
  let sel: VIEW_GROUP;

  beforeEach(() => {
    sel = new VIEW_GROUP();
    sel.SetLayer(LAYER_SELECT_OVERLAY);
    h.view.Add(sel);
  });

  /** The worker's selection groups, as the items they hold. */
  const groupItems = (): BOARD_ITEM[][] =>
    [...RenderGroupsOf(wView).values()].map((g) =>
      Array.from({ length: g.group.GetSize() }, (_, i) => g.group.GetItem(i) as BOARD_ITEM),
    );
  // By uuid: a failing comparison of the items themselves prints the whole board.
  const workerGroups = (): string[][] => groupItems().map((g) => g.map((i) => i.m_Uuid));
  /** Whether the worker's groups hold its board's own items, not stale copies. */
  const holdsBoardItems = (): boolean => groupItems().every((g) => g.every((i) => i === inCopy(i)));

  it('a selected footprint is the worker’s to draw, as its own item', () => {
    const fp = h.board.Footprints()[0]!;

    sel.Add(fp);
    expect(h.view.IsGroupDrawnRemotely(sel)).toBe(true);
    mirror.Flush();

    expect(workerGroups()).toEqual([[fp.m_Uuid]]);
    expect(holdsBoardItems()).toBe(true);
  });

  it('a moving item is the window’s to draw, and the worker lets go of the group', () => {
    const fp = h.board.Footprints()[0]!;

    sel.Add(fp);
    h.view.IsGroupDrawnRemotely(sel);
    mirror.Flush();

    fp.SetFlags(IS_MOVING);
    expect(h.view.IsGroupDrawnRemotely(sel)).toBe(false);
    mirror.Flush();

    expect(workerGroups()).toEqual([[]]);
  });

  it('a group emptied without being drawn again is emptied there too', () => {
    sel.Add(h.board.Footprints()[0]!);
    h.view.IsGroupDrawnRemotely(sel);
    mirror.Flush();

    sel.Clear();
    mirror.Flush();

    expect(workerGroups()).toEqual([[]]);
  });

  it('a selected item that is edited is the new object in the worker’s group', () => {
    const fp = h.board.Footprints()[0]!;

    sel.Add(fp);
    h.view.IsGroupDrawnRemotely(sel);
    mirror.Flush();

    const commit = new BOARD_COMMIT(h.frame);
    commit.Modify(fp);
    fp.Move({ x: 1_000_000, y: 0 });
    commit.Push('test');
    settle();

    expect(workerGroups()).toEqual([[fp.m_Uuid]]);
    expect(holdsBoardItems()).toBe(true);
    expect(inCopy(fp).GetPosition()).toEqual(fp.GetPosition());
  });

  it('an edited selected footprint stays hidden there, its pads selected', () => {
    const fp = h.board.Footprints().find((f) => f.Pads().length > 0)!;
    const pad = fp.Pads()[0]!;
    const select = (aItem: BOARD_ITEM): void => {
      aItem.SetSelected();
      h.view.Hide(aItem, true);
    };

    select(fp);
    fp.RunOnChildren(select, RECURSE_MODE.RECURSE);
    settle();

    const commit = new BOARD_COMMIT(h.frame);
    commit.Modify(fp);
    fp.Move({ x: 0, y: 1_000_000 });
    commit.Push('test');
    settle();

    const hidden = (aItem: BOARD_ITEM): boolean =>
      (inCopy(aItem).viewPrivData()!.m_flags & VIEW_VISIBILITY_FLAGS.HIDDEN) !== 0;

    expect([hidden(fp), hidden(pad)]).toEqual([true, true]);
    expect(inCopy(pad).IsSelected()).toBe(true);
  });

  it('a PCB_SELECTION is one there too, so a footprint’s pads are drawn with it', () => {
    const pcbSel = new PCB_SELECTION();
    const fp = h.board.Footprints().find((f) => f.Pads().length > 0)!;

    h.view.Add(pcbSel);
    pcbSel.Add(fp);
    h.view.IsGroupDrawnRemotely(pcbSel);
    mirror.Flush();

    const groups = [...RenderGroupsOf(wView).values()];
    expect(groups.map((g) => g.group instanceof PCB_SELECTION)).toEqual([true]);
  });

  it('a group on any other layer stays the window’s', () => {
    const other = new VIEW_GROUP();
    other.SetLayer(LAYER_GP_OVERLAY);
    h.view.Add(other);
    other.Add(h.board.Footprints()[0]!);

    expect(h.view.IsGroupDrawnRemotely(other)).toBe(false);
  });
});
