// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * NET_SETTINGS::SetNetclassPatternAssignment on a plain assignment list: bus patterns expand
 * to their members before they are stored, and only an exact duplicate is skipped. The
 * schematic action's own pattern rule is pinned on the live tool (sch_assign_netclass_live).
 */
import { describe, it, expect } from 'vitest';
import {
  addNetclassAssignment,
  busMemberPatterns,
} from '@ziroeda/eeschema/tools/assign_netclass.js';

describe('bus patterns expand before they are stored', () => {
  it('a vector expands to its members', () => {
    // The matchers read [ as a regex character class, so an unexpanded
    // D[0..2] would never match D0.
    expect(busMemberPatterns('D[0..2]')).toEqual(['D0', 'D1', 'D2']);
  });

  it('a group expands its members, recursively', () => {
    // A group member may itself be a vector, so the expansion recurses.
    expect(busMemberPatterns('USB{D[0..1] SCL}')).toEqual(['D0', 'D1', 'SCL']);
  });

  it('a plain pattern is itself', () => {
    expect(busMemberPatterns('VCC')).toEqual(['VCC']);
    expect(busMemberPatterns('D*')).toEqual(['D*']);
  });
});

describe('storing an assignment', () => {
  const start = [{ pattern: 'VCC', netClass: 'Power' }];

  it('appends a new one', () => {
    expect(addNetclassAssignment(start, 'GND', 'Power')).toEqual([
      { pattern: 'VCC', netClass: 'Power' },
      { pattern: 'GND', netClass: 'Power' },
    ]);
  });

  it('skips an exact duplicate', () => {
    expect(addNetclassAssignment(start, 'VCC', 'Power')).toEqual(start);
  });

  it('does NOT replace a different class for the same pattern', () => {
    // addSinglePatternAssignment compares pattern *and* netclass, so this is an
    // append. Replacing would be the intuitive guess and would silently drop
    // the user's earlier rule.
    expect(addNetclassAssignment(start, 'VCC', 'HighSpeed')).toEqual([
      { pattern: 'VCC', netClass: 'Power' },
      { pattern: 'VCC', netClass: 'HighSpeed' },
    ]);
  });

  it('stores one row per bus member', () => {
    const out = addNetclassAssignment([], 'D[0..2]', 'Fast');
    expect(out).toEqual([
      { pattern: 'D0', netClass: 'Fast' },
      { pattern: 'D1', netClass: 'Fast' },
      { pattern: 'D2', netClass: 'Fast' },
    ]);
  });

  it('leaves the input untouched', () => {
    const input = [...start];
    addNetclassAssignment(input, 'GND', 'Power');
    expect(input).toEqual(start);
  });
});
