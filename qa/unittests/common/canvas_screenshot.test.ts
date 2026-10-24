// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The view as an image: `OPENGL_GAL::GetScreenshot` (opengl_gal.cpp:834) reads the main buffer -
 * GL hands it over bottom row first - into a wxImage's RGB and alpha planes and mirrors it top to
 * bottom; `EDA_DRAW_PANEL_GAL::GetScreenshot` (draw_panel_gal.cpp:552) repaints first and only
 * the OpenGL backend can; `wxImage::SetData` / `SetAlpha( plane )` / `Mirror` underneath.
 * There is no WebGL in vitest, so the GAL runs against a GL that answers the three calls the
 * screenshot makes.
 */
import { EDA_DRAW_PANEL_GAL, GAL_TYPE } from '@ziroeda/common/draw_panel_gal.js';
import { OPENGL_GAL } from '@ziroeda/common/gal/opengl/opengl_gal.js';
import { WX_IMAGE } from '@ziroeda/wx/wx_image.js';
import { describe, expect, it } from 'vitest';

/** 2 x 2 pixels, RGBA, as GL returns them: the BOTTOM row first. */
const GL_ROWS = [
  [10, 11, 12, 100, 20, 21, 22, 110], // bottom row
  [30, 31, 32, 120, 40, 41, 42, 130], // top row
].flat();

function fakeGal(aWidth: number, aHeight: number) {
  const buffers: unknown[] = [];
  const gl = {
    VIEWPORT: 1,
    PACK_ALIGNMENT: 2,
    COLOR_ATTACHMENT0: 3,
    RGBA: 4,
    UNSIGNED_BYTE: 5,
    getParameter: () => new Int32Array([0, 0, aWidth, aHeight]),
    finish: () => {},
    pixelStorei: () => {},
    readBuffer: () => {},
    readPixels: (
      _x: number,
      _y: number,
      _w: number,
      _h: number,
      _f: number,
      _t: number,
      aOut: Uint8Array,
    ) => aOut.set(GL_ROWS.slice(0, aOut.length)),
  };
  const gal = {
    gl,
    m_mainBuffer: 7,
    m_compositor: { SetBuffer: (aBuffer: unknown) => buffers.push(aBuffer) },
    IsInitialized: () => true,
    LockContext: () => {},
    UnlockContext: () => {},
  };
  return { gal, buffers };
}

describe('OPENGL_GAL::GetScreenshot', () => {
  it('turns GL’s bottom-up RGBA into a top-down image with its alpha plane', () => {
    const { gal, buffers } = fakeGal(2, 2);
    const image = new WX_IMAGE();

    expect(OPENGL_GAL.prototype.GetScreenshot.call(gal, image)).toBe(true);

    expect([image.GetWidth(), image.GetHeight()]).toEqual([2, 2]);
    expect([...image.GetData()!]).toEqual([30, 31, 32, 40, 41, 42, 10, 11, 12, 20, 21, 22]);
    expect([...image.GetAlpha()!]).toEqual([120, 130, 100, 110]);
    // The main buffer is read, and direct rendering restored after.
    expect(buffers).toEqual([7, 0]);
  });

  it('reads nothing from an empty viewport', () => {
    const { gal } = fakeGal(0, 0);
    const image = new WX_IMAGE();

    expect(OPENGL_GAL.prototype.GetScreenshot.call(gal, image)).toBe(false);
    expect(image.IsOk()).toBe(false);
  });
});

describe('EDA_DRAW_PANEL_GAL::GetScreenshot', () => {
  const panel = (aBackend: GAL_TYPE) => {
    const calls: string[] = [];
    return {
      calls,
      self: {
        m_backend: aBackend,
        m_gal: { GetScreenshot: () => (calls.push('screenshot'), true) },
        DoRePaint: (aAllowSkip: boolean) => calls.push(`repaint ${aAllowSkip}`),
      },
    };
  };

  it('repaints, unskippably, then reads the GL buffer', () => {
    const { self, calls } = panel(GAL_TYPE.GAL_TYPE_OPENGL);

    expect(EDA_DRAW_PANEL_GAL.prototype.GetScreenshot.call(self, new WX_IMAGE())).toBe(true);
    expect(calls).toEqual(['repaint false', 'screenshot']);
  });

  it('has no screenshot on another backend', () => {
    const { self, calls } = panel(GAL_TYPE.GAL_TYPE_CAIRO);

    expect(EDA_DRAW_PANEL_GAL.prototype.GetScreenshot.call(self, new WX_IMAGE())).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('wxImage::SetData / SetAlpha( plane ) / Mirror', () => {
  const image = () => {
    const img = new WX_IMAGE();
    img.SetData(new Uint8Array([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6]), 3, 2);
    img.SetAlpha(new Uint8Array([11, 12, 13, 14, 15, 16]));
    return img;
  };
  const pixels = (aImg: WX_IMAGE) => [...aImg.GetData()!].filter((_, i) => i % 3 === 0);

  it('mirrors top to bottom with the alpha', () => {
    const flipped = image().Mirror(false);

    expect(pixels(flipped)).toEqual([4, 5, 6, 1, 2, 3]);
    expect([...flipped.GetAlpha()!]).toEqual([14, 15, 16, 11, 12, 13]);
  });

  it('mirrors left to right by default', () => {
    const flipped = image().Mirror();

    expect(pixels(flipped)).toEqual([3, 2, 1, 6, 5, 4]);
    expect([...flipped.GetAlpha()!]).toEqual([13, 12, 11, 16, 15, 14]);
  });

  it('SetData drops the old alpha plane, as fresh wx ref data does', () => {
    const img = image();
    img.SetData(new Uint8Array(3), 1, 1);

    expect(img.HasAlpha()).toBe(false);
  });
});
