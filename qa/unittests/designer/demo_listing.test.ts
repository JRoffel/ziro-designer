// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * The demos kept on the CDN for benchmarking but not offered in the menu or the chooser: the
 * two heaviest bundles. Their `/demo/<id>` links still open them.
 */
import { describe, expect, it } from 'vitest';
import { type DemoMeta, isListedDemo } from '@ziroeda/designer/src/home/demos.js';

const demo = (id: string): DemoMeta => ({ id, base: id, title: id, description: '', files: [] });

describe('which demos are listed', () => {
  it('hides Jetson AGX Thor and VME Wren, and lists the rest', () => {
    expect(isListedDemo(demo('jetson-agx-thor-baseboard'))).toBe(false);
    expect(isListedDemo(demo('vme-wren'))).toBe(false);
    expect(isListedDemo(demo('cm5_minima'))).toBe(true);
  });
});
