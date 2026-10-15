// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `DS_PROXY_VIEW_ITEM::ViewDraw` (ds_proxy_view_item.cpp:103-152) makes a
 * DS_PAINTER on every draw. Ours keeps one per GAL, so every draw must still
 * come out as a new painter's would: the same calls, in the colours the view's
 * settings hold at that draw, on the GAL being drawn on.
 */
import { describe, expect, it } from 'vitest';
import { FRAME_T } from '@ziroeda/common/frame_type.js';
import { DS_PROXY_VIEW_ITEM } from '@ziroeda/common/drawing_sheet/ds_proxy_view_item.js';
import { pcbIUScale } from '@ziroeda/common/eda_units.js';
import { GAL_DISPLAY_OPTIONS } from '@ziroeda/common/gal/gal_display_options.js';
import { GAL } from '@ziroeda/common/gal/graphics_abstraction_layer.js';
import { GAL_LAYER_ID } from '@ziroeda/common/layer_id.js';
import { PAGE_INFO } from '@ziroeda/common/page_info.js';
import { TITLE_BLOCK } from '@ziroeda/common/title_block.js';
import { PCB_PAINTER } from '@ziroeda/pcbnew/pcb_painter.js';
import { PCB_VIEW } from '@ziroeda/pcbnew/pcb_view.js';

/** A GAL that writes down every draw and colour call it is given. */
class RECORDING_GAL extends GAL {
  log: string[] = [];

  constructor() {
    super(new GAL_DISPLAY_OPTIONS());
    this.ResizeScreen(1200, 900);
    for (const name of Object.getOwnPropertyNames(GAL.prototype)) {
      if (!/^(Draw|Set(Stroke|Fill)Color|SetLineWidth|BitmapText|StrokeText)/.test(name)) continue;
      const f = (this as unknown as Record<string, (...a: unknown[]) => unknown>)[name]!;
      (this as unknown as Record<string, unknown>)[name] = (...a: unknown[]) => {
        this.log.push(`${name} ${JSON.stringify(a)}`);
        return f.apply(this, a);
      };
    }
  }

  override ResizeScreen(aWidth: number, aHeight: number): void {
    this.m_screenSize = { x: aWidth, y: aHeight };
  }
}

function viewOn(aGal: RECORDING_GAL): PCB_VIEW {
  const view = new PCB_VIEW();
  view.SetGAL(aGal);
  view.SetPainter(new PCB_PAINTER(aGal, FRAME_T.FRAME_PCB_EDITOR));
  // The whole A4 page in view.
  view.SetScale(0.000003);
  view.SetCenter({ x: 148_500_000, y: 105_000_000 });
  return view;
}

const page = new PAGE_INFO();
const titleBlock = new TITLE_BLOCK();
titleBlock.SetTitle('Kept painter');

function sheet(): DS_PROXY_VIEW_ITEM {
  const s = new DS_PROXY_VIEW_ITEM(pcbIUScale, page, null, titleBlock, null);
  s.SetColorLayer(GAL_LAYER_ID.LAYER_DRAWINGSHEET);
  s.SetPageBorderColorLayer(GAL_LAYER_ID.LAYER_PAGE_LIMITS);
  return s;
}

/** What one draw of `aSheet` on `aView` sends its GAL. */
function draw(aSheet: DS_PROXY_VIEW_ITEM, aView: PCB_VIEW): string[] {
  const gal = aView.GetGAL() as RECORDING_GAL;
  gal.log = [];
  aSheet.ViewDraw(GAL_LAYER_ID.LAYER_DRAWINGSHEET, aView);
  return gal.log;
}

describe('DS_PROXY_VIEW_ITEM.ViewDraw with a kept painter', () => {
  it('draws the same again as a new sheet draws the first time', () => {
    const view = viewOn(new RECORDING_GAL());
    const kept = sheet();
    const first = draw(kept, view);
    expect(first.some((c) => c.startsWith('DrawLine') || c.startsWith('DrawSegment'))).toBe(true);
    expect(draw(kept, view)).toEqual(first);
    expect(draw(sheet(), view)).toEqual(first);
  });

  it('draws in the colours the view holds now, not the ones it held at the first draw', () => {
    const view = viewOn(new RECORDING_GAL());
    const kept = sheet();
    const before = draw(kept, view);

    const settings = view.GetPainter()!.GetSettings();
    settings.SetLayerColor(GAL_LAYER_ID.LAYER_DRAWINGSHEET, { r: 0.1, g: 0.8, b: 0.3, a: 1 });
    settings.SetLayerColor(GAL_LAYER_ID.LAYER_PAGE_LIMITS, { r: 0.9, g: 0.2, b: 0.6, a: 1 });

    const after = draw(kept, view);
    expect(after).not.toEqual(before);
    expect(after).toEqual(draw(sheet(), view));
  });

  it('draws on the GAL of the view it is drawn in', () => {
    const kept = sheet();
    const one = viewOn(new RECORDING_GAL());
    const first = draw(kept, one);

    (one.GetGAL() as RECORDING_GAL).log = [];
    const two = viewOn(new RECORDING_GAL());
    const onTwo = draw(kept, two);
    expect(onTwo).toEqual(first);
    expect((one.GetGAL() as RECORDING_GAL).log).toEqual([]);
  });
});
