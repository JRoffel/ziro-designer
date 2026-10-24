// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The user's global library tables where KiCad keeps them: files in `PATHS::GetUserSettingsPath()`,
 * beside the settings (`LIBRARY_MANAGER::DefaultGlobalTablePath`). KiCad's code reads and writes
 * them as files - `LoadGlobalTables`, `CreateGlobalTable`, a table's `Save()` - so they are mounted
 * there, each backed by its settings slice, which is what the account syncs.
 *
 * The symbol table only, so far: the footprint and design-block tables are still the hosted ones.
 */
import { LIBRARY_MANAGER } from '@ziroeda/common/libraries/library_manager.js';
import { LIBRARY_TABLE_TYPE } from '@ziroeda/common/libraries/library_table.js';
import { PATHS } from '@ziroeda/common/paths.js';
import { MEMORY_FILESYSTEM, wxMountFileSystem } from '@ziroeda/wx/filefn.js';

/** What the mount asks of the settings: the table's text, and a change to it. */
export interface USER_LIBRARY_TABLE_SETTINGS {
  readonly symLibTable: string;
  setSymLibTable(aText: string): void;
  subscribe(aListener: () => void): () => void;
}

/** Mount the user's global symbol library table, following the slice as the account changes it. */
export function mountUserLibraryTables(aSettings: USER_LIBRARY_TABLE_SETTINGS): () => void {
  const fs = new MEMORY_FILESYSTEM();
  const name = LIBRARY_MANAGER.TableFileName(LIBRARY_TABLE_TYPE.SYMBOL);
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let shown = '';
  let refreshing = false;

  // The slice into the file: at mount, and when the account brings another device's change.
  const refresh = (): void => {
    const text = aSettings.symLibTable;

    if (text === shown) return;

    shown = text;
    refreshing = true;

    if (text === '') fs.Remove(name);
    else fs.Write(name, enc.encode(text));

    refreshing = false;
  };

  // The file into the slice: a save of the table.
  fs.SetWriteListener((aRel, aData) => {
    if (refreshing || aRel !== name) return;

    shown = dec.decode(aData);
    aSettings.setSymLibTable(shown);
  });

  refresh();

  const unsubscribe = aSettings.subscribe(refresh);
  const unmount = wxMountFileSystem(PATHS.GetUserSettingsPath(), fs);

  return () => {
    unsubscribe();
    unmount();
  };
}
