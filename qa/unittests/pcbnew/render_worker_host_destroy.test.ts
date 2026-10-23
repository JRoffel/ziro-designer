// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * RENDER_WORKER_HOST.Destroy runs once. A lost WebGL context destroys the host ahead of its panel,
 * and the window's cleanup asks again after the panel's view is gone: the second call must not
 * reach for that view (Sentry JAVASCRIPT-REACT-S, "reading 'SetRemoteView'").
 */
import { RENDER_WORKER_HOST } from '@ziroeda/pcbnew/browser/render_worker_host.js';
import type { PCB_BASE_FRAME } from '@ziroeda/pcbnew/pcb_base_frame.js';
import type { PCB_DRAW_PANEL_GAL } from '@ziroeda/pcbnew/pcb_draw_panel_gal.js';
import { describe, expect, it } from 'vitest';

describe('RENDER_WORKER_HOST.Destroy', () => {
  it('a second call, after the panel lost its view, does nothing', () => {
    const remoteViews: unknown[] = [];
    let view: { SetRemoteView(a: unknown): void } | null = {
      SetRemoteView: (a) => remoteViews.push(a),
    };
    const displayHooks: unknown[] = [];
    const panel = {
      SetOnDisplayBoard: (fn: unknown) => displayHooks.push(fn),
      GetView: () => view,
    } as unknown as PCB_DRAW_PANEL_GAL;
    const host = new RENDER_WORKER_HOST(
      panel,
      {} as PCB_BASE_FRAME,
      document.createElement('canvas'),
      { commonSettings: () => ({}) as never },
    );

    host.Destroy();
    expect(remoteViews).toEqual([null]);
    expect(displayHooks.at(-1)).toBeNull();

    // EDA_DRAW_PANEL_GAL::Destroy: m_view = null.
    view = null;
    expect(() => host.Destroy()).not.toThrow();
    expect(remoteViews).toEqual([null]);
  });
});
