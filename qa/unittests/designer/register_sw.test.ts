// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * designer/public/registerSW.js: the service worker registers on load, and a registration the
 * browser refuses (private window, site setting, aborted navigation) is caught, not left as an
 * unhandled rejection for the crash reports.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const SOURCE = readFileSync(
  fileURLToPath(new URL('../../../designer/public/registerSW.js', import.meta.url)),
  'utf8',
);

function run(aRegister: () => Promise<unknown>) {
  let onLoad: (() => void) | null = null;
  const window = {
    addEventListener: (type: string, fn: () => void) => {
      if (type === 'load') onLoad = fn;
    },
  };
  const register = vi.fn(aRegister);
  const navigator = { serviceWorker: { register } };
  const warn = vi.fn();
  new Function('window', 'navigator', 'console', SOURCE)(window, navigator, { warn });
  return { load: () => onLoad?.(), register, warn };
}

describe('registerSW.js', () => {
  it('registers /sw.js at the root scope once the page has loaded', () => {
    const r = run(async () => ({}));
    expect(r.register).not.toHaveBeenCalled();
    r.load();
    expect(r.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('catches a refused registration', async () => {
    const refusal = new Error('The user denied permission to use Service Worker.');
    const r = run(() => Promise.reject(refusal));
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      r.load();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(r.warn).toHaveBeenCalledWith(expect.stringContaining('offline cache'), refusal);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
