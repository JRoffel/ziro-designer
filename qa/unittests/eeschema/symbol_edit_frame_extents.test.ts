// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `SYMBOL_EDIT_FRAME::GetDocumentExtents` (symbol_edit_frame.cpp:1674-1688), what Zoom to Fit
 * fits: the symbol's current unit as drawn, or a 50 x 30 mm area when no symbol is open. Without
 * it a loaded symbol stayed at the frame's opening zoom, a speck in the middle of the canvas.
 */
import { mmToIU } from '@ziroeda/common/eda_units.js';
import { ACTIONS } from '@ziroeda/common/tool/actions.js';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { G, type SYMBOL_EDIT_HARNESS, symbolEditHarness } from './support/symbol_edit_harness.js';

let t: SYMBOL_EDIT_HARNESS;

beforeEach(() => {
  t = symbolEditHarness();
});

afterEach(() => t.dispose());

it('is a 50 x 30 mm area, centred, with no symbol', () => {
  const box = t.frame.GetDocumentExtents();
  expect([box.GetX(), box.GetY(), box.GetWidth(), box.GetHeight()]).toEqual([
    -mmToIU(25),
    -mmToIU(15),
    mmToIU(50),
    mmToIU(30),
  ]);
});

it('is the current unit of the symbol: unit 1 has the body, unit 2 only its pin', () => {
  // "U": a rectangle from -4G to 4G in unit 1, and a pin at x = 8G in each unit.
  t.open();
  expect(t.frame.GetDocumentExtents().GetX()).toBeLessThanOrEqual(-4 * G);
  t.frame.SetUnit(2);
  expect(t.frame.GetDocumentExtents().GetX()).toBeGreaterThan(-4 * G);
});

it('Zoom to Fit fills the view with it', () => {
  t.open();
  t.frame.GetToolManager()!.RunAction(ACTIONS.zoomFitScreen);
  const box = t.frame.GetDocumentExtents();
  const view = t.harness.view;
  const left = view.ToScreen({ x: box.GetLeft(), y: 0 });
  const right = view.ToScreen({ x: box.GetRight(), y: 0 });
  const across = Math.abs(right.x - left.x);
  // The harness canvas is 1000 px; a fit leaves only a margin.
  expect(across).toBeGreaterThan(500);
  expect(across).toBeLessThanOrEqual(1000);
});
