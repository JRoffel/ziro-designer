// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * The hosted symbol libraries are KiCad's installed ones, and as read-only as their install path
 * is upstream. A fetched symbol file is read by the library code but is not writable through the
 * wx helpers, so the Symbol Editor reports "Library is read-only" and offers a copy. Writable, a
 * Save of a hosted symbol went into page memory that was gone on the next load.
 */
import { LIB_ID } from '@ziroeda/common/lib_id.js';
import {
  configureSymbolLibraryAdapter,
  fetchHostedSymbolFile,
} from '@ziroeda/eeschema/libraries/symbol_library_adapter.js';
import {
  wxIsDirWritable,
  wxIsFileWritable,
  wxReadFileSync,
  wxWriteFileSync,
} from '@ziroeda/wx/filefn.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  configureSymbolLibraryAdapter({
    symbolsBase: () => 'https://hosted.test/symbols',
    fetchIndex: async () => [],
    trackLoad: (_label, work) => work,
    loadLibraryItemsPooled: async () => [],
  });
  vi.stubGlobal('fetch', async () => new Response('(kicad_symbol_lib (version 20241209))'));
});

afterEach(() => vi.unstubAllGlobals());

it('a fetched symbol file reads, and is not writable', async () => {
  const path = await fetchHostedSymbolFile(new LIB_ID('ReadOnlyTest', 'R'));
  expect(path).not.toBeNull();
  expect(new TextDecoder().decode(wxReadFileSync(path!)!)).toContain('kicad_symbol_lib');
  expect(wxIsFileWritable(path!)).toBe(false);
  expect(wxIsDirWritable(path!.replace(/\/[^/]*$/, ''))).toBe(false);
  expect(wxWriteFileSync(path!, new Uint8Array([1]))).toBe(false);
});
