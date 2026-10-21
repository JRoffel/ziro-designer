// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * A project file's `text` is decoded only when it is text: a binary (git's test, a NUL in the first
 * 8000 bytes) gets ''. Decoding KiCad's backup zips and `.history` objects as UTF-8 put a string
 * twice their size in the V8 heap and crashed the tab in every editor.
 */
import { isBinaryBytes, projectFileText } from '@ziroeda/designer/src/home/files.js';
import { isToolingPath } from '@ziroeda/designer/src/home/project_picker.js';
import { describe, expect, it } from 'vitest';

const enc = new TextEncoder();

describe('projectFileText', () => {
  it('decodes a text file', () => {
    expect(projectFileText(enc.encode('(kicad_pcb (version 20241229))'))).toBe(
      '(kicad_pcb (version 20241229))',
    );
    expect(projectFileText(enc.encode('Ωmega µ'))).toBe('Ωmega µ');
    expect(projectFileText(new Uint8Array())).toBe('');
  });

  it('gives a binary file no text', () => {
    // A zip's local file header: PK\x03\x04 then a version with a NUL byte.
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00]);
    expect(isBinaryBytes(zip)).toBe(true);
    expect(projectFileText(zip)).toBe('');
  });

  it('looks only at the first 8000 bytes, as git does', () => {
    const late = new Uint8Array(9000).fill(0x41);
    late[8500] = 0;
    expect(isBinaryBytes(late)).toBe(false);

    const edge = new Uint8Array(9000).fill(0x41);
    edge[7999] = 0;
    expect(isBinaryBytes(edge)).toBe(true);
  });

  it('a file inside a dot folder is tooling; a dot file at the root is not a folder', () => {
    expect(isToolingPath('proj/.history/objects/ab/cdef')).toBe(true);
    expect(isToolingPath('.history/HEAD')).toBe(true);
    expect(isToolingPath('proj/board.kicad_pcb')).toBe(false);
    expect(isToolingPath('proj/stm32-backups/stm32-2026-09-26.zip')).toBe(false);
  });
});
