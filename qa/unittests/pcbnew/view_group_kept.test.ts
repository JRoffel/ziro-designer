// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * VIEW_GROUP::ViewDraw's kept selection drawings (not KiCad's, common/view/view_group.ts): a
 * selected item standing still is drawn once and its drawing reused frame after frame; a moving
 * one is drawn afresh every frame, because a drag moves items without telling the VIEW.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { IS_MOVING } from '@ziroeda/common/eda_item_flags.js';
import { FRAME_T } from '@ziroeda/common/frame_type.js';
import { GAL } from '@ziroeda/common/gal/graphics_abstraction_layer.js';
import { GAL_DISPLAY_OPTIONS } from '@ziroeda/common/gal/gal_display_options.js';
import { RENDER_TARGET } from '@ziroeda/common/gal/definitions.js';
import { LAYER_GP_OVERLAY, LAYER_SELECT_OVERLAY } from '@ziroeda/common/layer_id.js';
import { BOX2I } from '@ziroeda/kimath/src/math/box2.js';
import { VIEW_GROUP } from '@ziroeda/common/view/view_group.js';
import type { VIEW_ITEM } from '@ziroeda/common/view/view_item.js';
import type { BOARD } from '@ziroeda/pcbnew/board.js';
import { ParseBoard } from '@ziroeda/pcbnew/pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';
import { PCB_PAINTER } from '@ziroeda/pcbnew/pcb_painter.js';
import type { PCB_TRACK } from '@ziroeda/pcbnew/pcb_track.js';
import { PCB_VIEW } from '@ziroeda/pcbnew/pcb_view.js';
import { beforeEach, describe, expect, it } from 'vitest';

const TEXT = readFileSync(
  resolve(import.meta.dirname, '../../data/zone_fill/ecc83-pp_kicad_cli.kicad_pcb'),
  'utf8',
);

/** A GAL that keeps overlay groups, as OPENGL_GAL does. */
class KEEPING_GAL extends GAL {
  private m_groups = new Set<number>();
  private m_next = 1;

  override ResizeScreen(aWidth: number, aHeight: number): void {
    this.m_screenSize = { x: aWidth, y: aHeight };
  }

  override SupportsOverlayGroups(): boolean {
    return true;
  }

  override BeginOverlayGroup(): number {
    const n = this.m_next++;
    this.m_groups.add(n);
    return n;
  }

  override DrawOverlayGroup(aGroupNumber: number): boolean {
    return this.m_groups.has(aGroupNumber);
  }

  override DeleteOverlayGroup(aGroupNumber: number): void {
    this.m_groups.delete(aGroupNumber);
  }
}

/** PCB_PAINTER, counting what it is asked to draw. */
class COUNTING_PAINTER extends PCB_PAINTER {
  draws = 0;
  drawn = new Set<VIEW_ITEM>();

  override Draw(aItem: VIEW_ITEM, aLayer: number): boolean {
    this.draws++;
    this.drawn.add(aItem);
    return super.Draw(aItem, aLayer);
  }
}

let board: BOARD;
let view: PCB_VIEW;
let painter: COUNTING_PAINTER;
let track: PCB_TRACK;
let selection: VIEW_GROUP;

beforeEach(() => {
  board = ParseBoard(TEXT);
  const gal = new KEEPING_GAL(new GAL_DISPLAY_OPTIONS());
  gal.ResizeScreen(1000, 1000);

  view = new PCB_VIEW();
  view.SetGAL(gal);
  painter = new COUNTING_PAINTER(gal, FRAME_T.FRAME_PCB_EDITOR);
  view.SetPainter(painter);

  for (const item of board.GetItemSet()) view.Add(item);

  view.UpdateItems();

  track = board.Tracks()[0]!;
  selection = new VIEW_GROUP();
  selection.SetLayer(LAYER_SELECT_OVERLAY);
  selection.Add(track);
  view.Add(selection);
});

/** One frame of the overlay: the selection drawn, and how many items the painter drew. */
function frame(): number {
  const before = painter.draws;
  selection.ViewDraw(LAYER_SELECT_OVERLAY, view);
  return painter.draws - before;
}

describe("the selection's kept drawings", () => {
  it('a still selection is drawn once, then reused', () => {
    expect(frame()).toBeGreaterThan(0);
    expect(frame()).toBe(0);
  });

  it('a moving item is drawn afresh every frame', () => {
    frame();
    track.SetFlags(IS_MOVING);

    const first = frame();
    track.Move({ x: 1_000_000, y: 0 });

    expect(first).toBeGreaterThan(0);
    expect(frame()).toBe(first);
  });
});

describe("the render worker's VIEW and the overlay (VIEW::SetOverlayKept)", () => {
  it('draws the selection it was handed, and nothing else of the overlay', () => {
    const other = new VIEW_GROUP();
    const otherTrack = board.Tracks()[1]!;

    other.SetLayer(LAYER_GP_OVERLAY);
    other.Add(otherTrack);
    view.Add(other);
    // PCB_DRAW_PANEL_GAL::setDefaultLayerDeps: both are TARGET_OVERLAY layers.
    view.SetLayerTarget(LAYER_SELECT_OVERLAY, RENDER_TARGET.TARGET_OVERLAY);
    view.SetLayerTarget(LAYER_GP_OVERLAY, RENDER_TARGET.TARGET_OVERLAY);
    view.SetOverlayKept(LAYER_SELECT_OVERLAY);

    view.MarkDirty();
    painter.drawn.clear();
    const all = new BOX2I({ x: -1e10, y: -1e10 }, { x: 2e10, y: 2e10 });
    (view as unknown as { redrawRect(r: BOX2I): void }).redrawRect(all);

    expect(painter.drawn.has(track)).toBe(true);
    expect(painter.drawn.has(otherTrack)).toBe(false);
  });
});
