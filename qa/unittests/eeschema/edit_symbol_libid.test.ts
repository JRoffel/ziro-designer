// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The library id string helpers (tools/edit_symbol_libid.ts): the halves of an id and what a
 * valid one is. The dialog itself is tested live in dialog_edit_symbols_libid_live.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  isValidLibId,
  libItemName,
  libNickname,
} from '@ziroeda/eeschema/tools/edit_symbol_libid.js';

describe('library ids', () => {
  it('splits a nickname from an item name', () => {
    expect(libNickname('Device:R_Small')).toBe('Device');
    expect(libItemName('Device:R_Small')).toBe('R_Small');
    expect(libNickname('R')).toBe('');
    expect(libItemName('R')).toBe('R');
  });

  it('needs both halves to be valid', () => {
    expect(isValidLibId('Device:R')).toBe(true);
    expect(isValidLibId('R')).toBe(false);
    expect(isValidLibId('Device:')).toBe(false);
    expect(isValidLibId(':R')).toBe(false);
    expect(isValidLibId('')).toBe(false);
  });

  it('rejects a second colon, because the first one is the separator', () => {
    expect(isValidLibId('Device:Sub:R')).toBe(false);
  });

  it('rejects the forbidden characters', () => {
    expect(isValidLibId('Device:R<1>')).toBe(false);
    expect(isValidLibId('Dev"ice:R')).toBe(false);
    expect(isValidLibId('Device:R\\1')).toBe(false);
    // …and allows what is merely unusual.
    expect(isValidLibId('My Lib:R 0805')).toBe(true);
  });
});
