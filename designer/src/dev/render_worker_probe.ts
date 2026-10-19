// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Dev-only (not in the build): drives pcbnew/browser/render_worker.ts for measurements.
import type {
  RENDER_WORKER_MESSAGE,
  RENDER_WORKER_REQUEST,
} from '@ziroeda/pcbnew/browser/render_worker.js';

import { commonSettingsOf } from '../pgm_app.js';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const offscreen = canvas.transferControlToOffscreen();
const worker = new Worker(new URL('../../../pcbnew/browser/render_worker.ts', import.meta.url), {
  type: 'module',
});

const out = { messages: [] as RENDER_WORKER_MESSAGE[] };
(window as unknown as { __probe: unknown }).__probe = out;

worker.onmessage = (e: MessageEvent<RENDER_WORKER_MESSAGE>) => out.messages.push(e.data);

const post = (m: RENDER_WORKER_REQUEST, transfer: Transferable[] = []): void =>
  worker.postMessage(m, transfer);

(window as unknown as { __post: typeof post }).__post = post;

const text = await (await fetch('/__probe/video.kicad_pcb')).text();
post(
  {
    t: 'init',
    canvas: offscreen,
    boardText: text,
    width: canvas.width,
    height: canvas.height,
    commonSettings: JSON.parse(JSON.stringify(commonSettingsOf())),
  },
  [offscreen],
);
