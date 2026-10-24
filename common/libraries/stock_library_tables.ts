// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * The stock library tables: what a KiCad install puts at `PATHS::GetStockTemplatesPath()`
 * (`sym-lib-table`, `fp-lib-table`), the tables of the libraries that ship with it. A user's global
 * table chains them (`LIBRARY_MANAGER::CreateGlobalTable`), so they are read like any table file.
 *
 * Here the libraries that ship are the hosted set, known once the program has fetched its index;
 * the program writes each stock table then, into a memory file system at that path, and the global
 * tables read them from there. Nothing else lives at that path.
 */
import { MEMORY_FILESYSTEM, wxMountFileSystem } from '@ziroeda/wx/filefn.js';
import { PATHS } from '../paths.js';
import { LIBRARY_MANAGER } from './library_manager.js';
import { LIBRARY_TABLE, LIBRARY_TABLE_SCOPE, type LIBRARY_TABLE_TYPE } from './library_table.js';

let s_stock: MEMORY_FILESYSTEM | null = null;

/** The hosted library set as a LIBRARY_TABLE: read-only, "KiCad" rows. */
export function hostedLibraryTable(
  aType: LIBRARY_TABLE_TYPE,
  aNames: readonly string[],
  aUriOf: (aName: string) => string,
): LIBRARY_TABLE {
  const table = LIBRARY_TABLE.Empty(LIBRARY_TABLE_SCOPE.GLOBAL, aType);

  for (const name of aNames) {
    const row = table.InsertRow();
    row.SetNickname(name);
    row.SetType('KiCad');
    row.SetURI(aUriOf(name));
  }

  table.SetReadOnly();
  return table;
}

/** The stock table of \a aType, as the install would have it: \a aTable's text at its path. */
export function SetStockLibraryTable(aType: LIBRARY_TABLE_TYPE, aTable: LIBRARY_TABLE): void {
  if (!s_stock) {
    s_stock = new MEMORY_FILESYSTEM();
    // An install path: KiCad's code reads it and never writes it.
    s_stock.ReadOnly = true;
    wxMountFileSystem(PATHS.GetStockTemplatesPath(), s_stock);
  }

  s_stock.Write(
    LIBRARY_MANAGER.TableFileName(aType),
    new TextEncoder().encode(aTable.FormatForSave()),
  );
}
