// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The account's Symbols folder, `GetDefaultUserSymbolsPath()`'s, as a file system KiCad's code reads
 * and writes like any directory.
 *
 * A symbol library saved or dropped into the account goes there and is named by a library table row
 * as `/Symbols/<lib>.kicad_sym`, from any project. KiCad's reads and writes are synchronous, so the
 * folder is held in memory, loaded from the account store when it is mounted, and every write goes
 * back to the store - the cloud sync takes it from there, as it does a project's files.
 *
 * A library may be a FILE or a FOLDER (KiCad 10 keeps a symbol directory as one `.kicad_sym` per
 * symbol), so the load walks the folder all the way down.
 */
import { MEMORY_FILESYSTEM, wxMountFileSystem } from '@ziroeda/wx/filefn.js';
import { USER_DIRS } from './chooser_places.js';
import type { FileSystem } from './filesystem.js';

/**
 * Mount the account's Symbols folder from \a aStore at its own path.
 *
 * @return the unmount, which leaves the store as the writes made it.
 */
export async function mountUserSymbolsFolder(aStore: FileSystem): Promise<() => void> {
  const root = USER_DIRS.symbols;
  const fs = new MEMORY_FILESYSTEM();

  const load = async (aDir: string): Promise<void> => {
    for (const entry of await aStore.list(aDir)) {
      const rel = entry.path.slice(root.length + 1);

      if (entry.kind === 'file') {
        fs.Write(rel, await aStore.read(entry.path));
      } else {
        fs.Mkdir(rel);
        await load(entry.path);
      }
    }
  };

  // A new account has no Symbols folder until something is put in it.
  if (await aStore.stat(root)) await load(root);

  fs.SetWriteListener((aRel, aData) => {
    aStore.write(`${root}/${aRel}`, aData).catch((e: unknown) => {
      console.warn(`Could not save ${root}/${aRel} to the account:`, e);
    });
  });

  return wxMountFileSystem(root, fs);
}
