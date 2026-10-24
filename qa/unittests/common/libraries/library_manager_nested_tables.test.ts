// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * Nested library tables (common/libraries/library_manager.cpp:139-189, :784-812): a `Table` row names
 * another table file, whose libraries count as the row's table's own. KiCad 10's global table is a
 * chain row to the stock one plus the user's own rows (`CreateGlobalTable`, :526-563).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LIBRARY_TABLE,
  LIBRARY_TABLE_SCOPE,
  LIBRARY_TABLE_TYPE,
} from '@ziroeda/common/libraries/library_table.js';
import { PGM_BASE, Pgm, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { MEMORY_FILESYSTEM, wxMountFileSystem } from '@ziroeda/wx/filefn.js';

const SYM = LIBRARY_TABLE_TYPE.SYMBOL;
const lib = (aName: string, aExtra = '') =>
  `(lib (name "${aName}")(type "KiCad")(uri "/cfg/${aName}.kicad_sym")(options "")(descr "")${aExtra})`;
const chain = (aName: string, aUri: string, aExtra = '') =>
  `(lib (name "${aName}")(type "Table")(uri "${aUri}")(options "")(descr "")${aExtra})`;
const symTable = (aRows: string[]) => `(sym_lib_table (version 7) ${aRows.join(' ')})`;

let fs: MEMORY_FILESYSTEM;
let unmount: () => void;
const put = (aName: string, aText: string): void =>
  fs.Write(aName, new TextEncoder().encode(aText));

beforeEach(() => {
  SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER()));
  fs = new MEMORY_FILESYSTEM();
  unmount = wxMountFileSystem('/cfg', fs);
});

afterEach(() => {
  unmount();
  SetPgm(null);
});

/** The global table at /cfg/sym-lib-table, as the host hands it over. */
function setGlobal(aRows: string[]): LIBRARY_TABLE {
  const table = LIBRARY_TABLE.FromFile(
    '/cfg/sym-lib-table',
    symTable(aRows),
    LIBRARY_TABLE_SCOPE.GLOBAL,
  );
  Pgm().GetLibraryManager().SetTable(SYM, LIBRARY_TABLE_SCOPE.GLOBAL, table);
  return table;
}

const nicknames = (aScope = LIBRARY_TABLE_SCOPE.BOTH, aIncludeInvalid = false): string[] =>
  Pgm()
    .GetLibraryManager()
    .Rows(SYM, aScope, aIncludeInvalid)
    .map((r) => r.Nickname());

describe('a Table row', () => {
  it("brings the chained table's libraries in, in place, beside the table's own", () => {
    put('stock/sym-lib-table', symTable([lib('Device'), lib('power')]));
    setGlobal([chain('KiCad', '/cfg/stock/sym-lib-table'), lib('Mine')]);

    expect(nicknames(LIBRARY_TABLE_SCOPE.GLOBAL)).toEqual(['Device', 'power', 'Mine']);
    expect(Pgm().GetLibraryManager().GetRow(SYM, 'power')?.URI()).toBe('/cfg/power.kicad_sym');
  });

  it('names its file relative to the table that holds it', () => {
    put('stock/sym-lib-table', symTable([lib('Device')]));
    setGlobal([chain('KiCad', 'stock/sym-lib-table')]);

    expect(nicknames()).toEqual(['Device']);
  });

  it('follows a chain of chains', () => {
    put('a/sym-lib-table', symTable([chain('B', '/cfg/b/sym-lib-table'), lib('FromA')]));
    put('b/sym-lib-table', symTable([lib('FromB')]));
    setGlobal([chain('A', '/cfg/a/sym-lib-table')]);

    expect(nicknames()).toEqual(['FromB', 'FromA']);
  });

  it('contributes nothing when disabled, and hides its libraries when hidden', () => {
    put('stock/sym-lib-table', symTable([lib('Device')]));
    setGlobal([chain('KiCad', '/cfg/stock/sym-lib-table', '(disabled)'), lib('Mine')]);
    expect(nicknames()).toEqual(['Mine']);

    setGlobal([chain('KiCad', '/cfg/stock/sym-lib-table', '(hidden)')]);
    expect(Pgm().GetLibraryManager().GetRow(SYM, 'Device')?.Hidden()).toBe(true);
  });

  it('is marked, and brings nothing, when its file does not exist', () => {
    const table = setGlobal([chain('KiCad', '/cfg/missing/sym-lib-table'), lib('Mine')]);
    const row = table.Rows().find((r) => r.Nickname() === 'KiCad')!;

    expect(row.IsOk()).toBe(false);
    expect(row.ErrorDescription()).toContain('/cfg/missing/sym-lib-table');
    expect(nicknames()).toEqual(['Mine']);
  });

  it('is marked when it names a table already met on the way, and not followed back', () => {
    put('loop/sym-lib-table', symTable([chain('Back', '/cfg/loop/sym-lib-table'), lib('Once')]));
    setGlobal([chain('Loop', '/cfg/loop/sym-lib-table')]);

    expect(nicknames()).toEqual(['Once']);
    // With the invalid rows too: upstream recursed forever here, the marked row naming the table
    // it sits in.
    expect(nicknames(LIBRARY_TABLE_SCOPE.GLOBAL, true)).toEqual(['Once']);

    const loop = (
      Pgm().GetLibraryManager() as unknown as { m_childTables: Map<string, LIBRARY_TABLE> }
    ).m_childTables.get('/cfg/loop/sym-lib-table')!;
    const back = loop.Rows().find((r) => r.Nickname() === 'Back')!;
    expect(back.IsOk()).toBe(false);
    expect(back.ErrorDescription()).toBe('A reference to this library table already exists');
  });

  it('gives way to a project row of the same nickname, as a global row does', () => {
    put('stock/sym-lib-table', symTable([lib('Device')]));
    setGlobal([chain('KiCad', '/cfg/stock/sym-lib-table')]);
    Pgm()
      .GetLibraryManager()
      .SetTable(
        SYM,
        LIBRARY_TABLE_SCOPE.PROJECT,
        LIBRARY_TABLE.FromFile(
          '/cfg/proj/sym-lib-table',
          symTable([
            '(lib (name "Device")(type "KiCad")(uri "/proj/Device.kicad_sym")(options "")(descr ""))',
          ]),
          LIBRARY_TABLE_SCOPE.PROJECT,
        ),
      );

    expect(Pgm().GetLibraryManager().GetRow(SYM, 'Device')?.URI()).toBe('/proj/Device.kicad_sym');
  });

  it('is followed in a project table read from its directory too', () => {
    put('stock/sym-lib-table', symTable([lib('Device')]));
    put('proj/sym-lib-table', symTable([chain('KiCad', '/cfg/stock/sym-lib-table')]));
    Pgm().GetLibraryManager().LoadProjectTables('/cfg/proj', [SYM]);

    expect(nicknames(LIBRARY_TABLE_SCOPE.PROJECT)).toEqual(['Device']);
  });
});
