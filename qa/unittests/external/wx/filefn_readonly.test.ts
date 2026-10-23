// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * A read-only mount - KiCad's installed libraries, here the hosted symbol downloads - is read by
 * KiCad's code but never written through the wx helpers, and reports nothing in it writable.
 * Writable, a Save into a hosted library went into memory that was gone on the next load.
 */
import {
  MEMORY_FILESYSTEM,
  wxIsDirWritable,
  wxIsFileWritable,
  wxMkdir,
  wxMountFileSystem,
  wxReadFileSync,
  wxRemoveFile,
  wxRenameFile,
  wxWriteFileSync,
} from '@ziroeda/wx/filefn.js';
import { afterEach, expect, it } from 'vitest';

let unmount: (() => void) | null = null;
afterEach(() => unmount?.());

const mount = (aReadOnly: boolean) => {
  const fs = new MEMORY_FILESYSTEM();
  fs.Write('lib/R.kicad_sym', new TextEncoder().encode('(kicad_symbol_lib)'));
  fs.ReadOnly = aReadOnly;
  unmount = wxMountFileSystem('/ro-test', fs);
  return fs;
};

it.each([false, true])('reads either way, writes only when not read-only (read-only %s)', (aRo) => {
  const fs = mount(aRo);
  expect(new TextDecoder().decode(wxReadFileSync('/ro-test/lib/R.kicad_sym')!)).toBe(
    '(kicad_symbol_lib)',
  );
  expect({
    fileWritable: wxIsFileWritable('/ro-test/lib/R.kicad_sym'),
    dirWritable: wxIsDirWritable('/ro-test/lib'),
    write: wxWriteFileSync('/ro-test/lib/C.kicad_sym', new Uint8Array([1])),
    mkdir: wxMkdir('/ro-test/other'),
    rename: wxRenameFile('/ro-test/lib/R.kicad_sym', '/ro-test/lib/R2.kicad_sym'),
  }).toEqual({ fileWritable: !aRo, dirWritable: !aRo, write: !aRo, mkdir: !aRo, rename: !aRo });
  // ...and the owner still fills it through the mount itself.
  fs.Write('lib/L.kicad_sym', new Uint8Array([2]));
  expect(wxReadFileSync('/ro-test/lib/L.kicad_sym')).toEqual(new Uint8Array([2]));
  expect(wxRemoveFile('/ro-test/lib/L.kicad_sym')).toBe(!aRo);
});
