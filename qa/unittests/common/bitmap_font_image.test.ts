// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * `loadBitmapFontImage` (common/gal/gal_window.ts): the atlas is fetched once and shared, but a
 * failed fetch is not the atlas - the next panel asks again rather than every canvas in the tab
 * failing on one cached rejection until a reload (a 504 from the edge did exactly that).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('loadBitmapFontImage', () => {
  it('retries after a failed fetch, then keeps the decoded atlas', async () => {
    const statuses = [504, 200];
    const fetchMock = vi.fn(async () => {
      const status = statuses.shift()!;
      return { ok: status === 200, status, blob: async () => new Blob() };
    });
    const bitmap = { width: 1 };
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => bitmap),
    );

    vi.resetModules();
    const { loadBitmapFontImage } = await import('@ziroeda/common/gal/gal_window.js');

    await expect(loadBitmapFontImage()).rejects.toThrow('bitmap font atlas: 504');
    expect(await loadBitmapFontImage()).toBe(bitmap);
    expect(await loadBitmapFontImage()).toBe(bitmap);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
