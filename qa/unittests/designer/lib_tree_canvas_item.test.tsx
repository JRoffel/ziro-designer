// @vitest-environment happy-dom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `LIB_TREE_RENDERER::Render` draws the canvas-item outline on every paint, from the Item cell's
 * rectangle (common/lib_tree_model_adapter.cpp:100-116). Ours measured the cell once, when the
 * outline mounted: a row laid out later - a frame built hidden - kept an SVG's default 300 x 150
 * and the outline ran five rows down the tree; a dragged column kept its old width. It is measured
 * whenever the cell's box changes now.
 *
 * happy-dom does no layout, so the cell's box is stubbed and the resize observer fired by hand.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { makeItemNode } from '@ziroeda/common/lib_tree_model.js';
import { LibTree } from '@ziroeda/common/widgets/lib_tree.js';
import { SymbolTreeSynchronizingAdapter } from '@ziroeda/eeschema/symbol_tree_synchronizing_adapter.js';

let cell = { width: 300, height: 150 };
let observers: (() => void)[] = [];

beforeEach(() => {
  cell = { width: 300, height: 150 };
  observers = [];
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const box = this.classList.contains('ze-libtree-canvasitem') ? cell : { width: 0, height: 0 };
    return {
      ...box,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: box.width,
      bottom: box.height,
      toJSON() {},
    } as DOMRect;
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly cb: () => void) {}
      observe() {
        observers.push(this.cb);
      }
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('follows the Item cell’s box, not the box it had when it mounted', () => {
  const adapter = new SymbolTreeSynchronizingAdapter({
    isLibraryModified: () => false,
    isSymbolModified: () => false,
    isLibraryLoaded: () => true,
    currentLibId: () => 'Device:R',
  });
  const lib = adapter.addLibrary('Device', '', false);
  makeItemNode(lib, 'Device', 'R');
  adapter.finishLibrary(lib);

  // Mounted before its row is laid out: the SVG's default size.
  const { container } = render(
    <LibTree adapter={adapter} onSelect={() => {}} onChoose={() => {}} />,
  );
  const points = () =>
    container.querySelector('.ze-libtree-canvasitem polyline')?.getAttribute('points');
  expect(points()).toBe('0,0 296,0 300,75 296,150 0,150 0,0');

  // The row takes its real size: one row, 26 px, in a 200 px Item column.
  cell = { width: 200, height: 26 };
  act(() => {
    for (const cb of observers) cb();
  });
  expect(points()).toBe('0,0 196,0 200,13 196,26 0,26 0,0');
});
