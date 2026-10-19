// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * Stage 1 of the render worker (not KiCad's): `PCB_DRAW_PANEL_GAL` - VIEW, PCB_PAINTER and
 * OPENGL_GAL - on an OffscreenCanvas, in a worker, over its own copy of the board.
 *
 * KiCad draws on its GUI thread and gets away with it in C++. In a browser the window's thread
 * is also the menus', the panels' and the cursor's, so every redraw that takes longer than a
 * frame freezes all of them. Here the drawing happens on this thread instead; the window posts
 * what changed. This stage proves the panel runs here and measures it: a board, its view, and
 * nothing that edits yet.
 */
import { EMBEDDED_FILES } from '@ziroeda/common/embedded_files.js';
import {
  type COMMON_SETTINGS_LIKE,
  PGM_BASE,
  SETTINGS_MANAGER,
  SetPgm,
} from '@ziroeda/common/pgm_base.js';
import { GAL_DISPLAY_OPTIONS } from '@ziroeda/common/gal/gal_display_options.js';
import { loadBitmapFontImage } from '@ziroeda/common/gal/gal_window.js';
import type { DRAW_PANEL_GAL_WINDOW } from '@ziroeda/common/draw_panel_gal.js';
import { BOX2D } from '@ziroeda/kimath/src/math/box2.js';
import { PCB_DRAW_PANEL_GAL } from '../pcb_draw_panel_gal.js';
import { ParseBoard } from '../pcb_io/kicad_sexpr/pcb_io_kicad_sexpr.js';

export type RENDER_WORKER_REQUEST =
  | {
      t: 'init';
      canvas: OffscreenCanvas;
      boardText: string;
      width: number;
      height: number;
      /** The window's `Pgm().GetCommonSettings()`, as plain data. */
      commonSettings: COMMON_SETTINGS_LIKE;
    }
  | { t: 'view'; center: { x: number; y: number }; scale: number }
  | { t: 'resize'; width: number; height: number };

export type RENDER_WORKER_MESSAGE =
  | {
      t: 'ready';
      parseMs: number;
      displayMs: number;
      firstDrawMs: number;
      center: { x: number; y: number };
      scale: number;
    }
  | { t: 'drawn'; ms: number }
  | { t: 'error'; message: string };

/**
 * The OffscreenCanvas as the panel's `wxGLCanvas`: what it reads of a DOM canvas - its size,
 * being shown, a style for the cursor - answered from the last size the window posted.
 */
function canvasShim(aCanvas: OffscreenCanvas, aSize: { w: number; h: number }): HTMLCanvasElement {
  const style: Record<string, string> = {};

  return Object.assign(aCanvas, {
    get clientWidth() {
      return aSize.w;
    },
    get clientHeight() {
      return aSize.h;
    },
    isConnected: true,
    // No DOM events reach a worker: EDA_DRAW_PANEL_GAL binds none when there is no listener API.
    addEventListener: undefined,
    parentElement: null,
    style,
    focus: () => {},
    getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, width: aSize.w, height: aSize.h }),
  }) as unknown as HTMLCanvasElement;
}

interface WorkerScope {
  postMessage(aMessage: RENDER_WORKER_MESSAGE): void;
  onmessage: ((e: MessageEvent<RENDER_WORKER_REQUEST>) => void) | null;
}

const g = globalThis as unknown as { WorkerGlobalScope?: unknown };

if (g.WorkerGlobalScope !== undefined) {
  const scope = globalThis as unknown as WorkerScope;
  const size = { w: 1, h: 1 };
  let panel: PCB_DRAW_PANEL_GAL | null = null;

  const timedDraw = (): number => {
    const t0 = performance.now();
    panel!.ForceRefresh();
    return performance.now() - t0;
  };

  scope.onmessage = async (e: MessageEvent<RENDER_WORKER_REQUEST>): Promise<void> => {
    const msg = e.data;

    try {
      if (msg.t === 'init') {
        await EMBEDDED_FILES.InitCodec();

        // This realm's program object; the window's settings and theme arrive in a later stage.
        const pgm = new PGM_BASE(null, new SETTINGS_MANAGER());
        pgm.SetCommonSettings(msg.commonSettings);
        SetPgm(pgm);

        const font = await loadBitmapFontImage();

        size.w = msg.width;
        size.h = msg.height;
        msg.canvas.width = msg.width;
        msg.canvas.height = msg.height;

        let t0 = performance.now();
        const board = ParseBoard(msg.boardText);
        board.BuildConnectivity();
        const parseMs = performance.now() - t0;

        const window: DRAW_PANEL_GAL_WINDOW = {
          canvas: canvasShim(msg.canvas, size),
          GetCursorCss: () => 'default',
          GetBitmapFontImage: () => font,
        };

        panel = new PCB_DRAW_PANEL_GAL(null, window, new GAL_DISPLAY_OPTIONS());

        // What PCB_EDIT_FRAME does to a canvas once a board is loaded: the theme's colours and
        // the board's visible layers.
        panel.UpdateColors();

        t0 = performance.now();
        panel.DisplayBoard(board);
        panel.SyncLayersVisibility(board);
        const displayMs = performance.now() - t0;

        // Zoom to fit, as the frame does after a load.
        const view = panel.GetView();
        const bbox = board.GetBoundingBox();
        view.SetViewport(
          new BOX2D(
            { x: bbox.GetX(), y: bbox.GetY() },
            { x: bbox.GetWidth(), y: bbox.GetHeight() },
          ),
        );

        const firstDrawMs = timedDraw();
        const c = view.GetCenter();

        scope.postMessage({
          t: 'ready',
          parseMs,
          displayMs,
          firstDrawMs,
          center: { x: c.x, y: c.y },
          scale: view.GetScale(),
        });
      } else if (msg.t === 'view' && panel) {
        const view = panel.GetView();
        view.SetScale(msg.scale);
        view.SetCenter(msg.center);
        scope.postMessage({ t: 'drawn', ms: timedDraw() });
      } else if (msg.t === 'resize' && panel) {
        size.w = msg.width;
        size.h = msg.height;
        scope.postMessage({ t: 'drawn', ms: timedDraw() });
      }
    } catch (err) {
      scope.postMessage({
        t: 'error',
        message: err instanceof Error ? (err.stack ?? err.message) : String(err),
      });
    }
  };
}
