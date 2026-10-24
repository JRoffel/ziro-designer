// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * designer/src/fs/user_symbols_mount.ts: the account's Symbols folder mounted where KiCad's file
 * reads find it - every file, folder libraries' included - and what KiCad writes there going back
 * to the account.
 */
import { describe, expect, it } from 'vitest';
import type { Entry, FileSystem } from '@ziroeda/designer/src/fs/filesystem.js';
import { mountUserSymbolsFolder } from '@ziroeda/designer/src/fs/user_symbols_mount.js';
import { wxReadFileSync, wxWriteFileSync } from '@ziroeda/wx/filefn.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

/** An account store holding \a aFiles (absolute paths), recording every write. */
function store(aFiles: Record<string, string>) {
  const files = new Map<string, Uint8Array>(
    Object.entries(aFiles).map(([p, t]) => [p, enc.encode(t)]),
  );
  const written: string[] = [];
  const entry = (aPath: string, aKind: Entry['kind']): Entry =>
    ({
      name: aPath.slice(aPath.lastIndexOf('/') + 1),
      path: aPath,
      kind: aKind,
      size: null,
      modified: null,
    }) as Entry;

  const fs = {
    async stat(aPath: string) {
      return [...files.keys()].some((p) => p === aPath || p.startsWith(`${aPath}/`))
        ? entry(aPath, files.has(aPath) ? 'file' : 'folder')
        : null;
    },
    async list(aDir: string) {
      // As the account's tree does: listing a folder that is not there is an error.
      if (!(await fs.stat(aDir))) throw new Error(`no such folder ${aDir}`);
      const children = new Map<string, Entry>();
      for (const p of files.keys()) {
        if (!p.startsWith(`${aDir}/`)) continue;
        const [head, ...rest] = p.slice(aDir.length + 1).split('/');
        const path = `${aDir}/${head}`;
        children.set(path, entry(path, rest.length ? 'folder' : 'file'));
      }
      return [...children.values()];
    },
    async read(aPath: string) {
      return files.get(aPath)!;
    },
    async write(aPath: string, aBytes: Uint8Array) {
      files.set(aPath, aBytes);
      written.push(aPath);
    },
  } as unknown as FileSystem;

  return { fs, files, written };
}

describe('mountUserSymbolsFolder', () => {
  it('mounts every library at /Symbols, a folder library symbol by symbol', async () => {
    const s = store({
      '/Symbols/Mine.kicad_sym': '(kicad_symbol_lib)',
      '/Symbols/Split/R.kicad_sym': '(kicad_symbol_lib R)',
      '/Symbols/Split/C.kicad_sym': '(kicad_symbol_lib C)',
      '/Board/Board.kicad_pro': '{}',
    });
    const unmount = await mountUserSymbolsFolder(s.fs);

    try {
      expect(dec.decode(wxReadFileSync('/Symbols/Mine.kicad_sym')!)).toBe('(kicad_symbol_lib)');
      expect(dec.decode(wxReadFileSync('/Symbols/Split/C.kicad_sym')!)).toBe(
        '(kicad_symbol_lib C)',
      );
      // Only the Symbols folder: a project is mounted by the editor that opens it.
      expect(wxReadFileSync('/Board/Board.kicad_pro')).toBeNull();
      // Loading is not saving.
      expect(s.written).toEqual([]);
    } finally {
      unmount();
    }
  });

  it('writes what KiCad saves there back to the account', async () => {
    const s = store({ '/Symbols/Mine.kicad_sym': '(old)' });
    const unmount = await mountUserSymbolsFolder(s.fs);

    try {
      expect(wxWriteFileSync('/Symbols/Mine.kicad_sym', enc.encode('(new)'))).toBe(true);
      expect(wxWriteFileSync('/Symbols/Fresh.kicad_sym', enc.encode('(fresh)'))).toBe(true);
      await new Promise((r) => setTimeout(r, 0));

      expect(s.written.sort()).toEqual(['/Symbols/Fresh.kicad_sym', '/Symbols/Mine.kicad_sym']);
      expect(dec.decode(s.files.get('/Symbols/Fresh.kicad_sym')!)).toBe('(fresh)');
    } finally {
      unmount();
    }
  });

  it('mounts an empty folder for an account that has none yet, which a save then makes', async () => {
    const s = store({});
    const unmount = await mountUserSymbolsFolder(s.fs);

    try {
      expect(wxWriteFileSync('/Symbols/First.kicad_sym', enc.encode('(first)'))).toBe(true);
      await new Promise((r) => setTimeout(r, 0));
      expect(s.written).toEqual(['/Symbols/First.kicad_sym']);
    } finally {
      unmount();
    }
  });

  it('is gone once unmounted', async () => {
    const s = store({ '/Symbols/Mine.kicad_sym': '(lib)' });
    (await mountUserSymbolsFolder(s.fs))();

    expect(wxReadFileSync('/Symbols/Mine.kicad_sym')).toBeNull();
  });
});
