// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * LoadGlobalSymbolTables (eeschema/libraries/symbol_library_adapter.ts): the program's global
 * symbol table as KiCad 10 has it - the user's table in the settings path, chaining the stock one,
 * which here is the hosted set. The windows call it once they have the hosted index.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LIBRARY_MANAGER } from '@ziroeda/common/libraries/library_manager.js';
import {
  LIBRARY_TABLE,
  LIBRARY_TABLE_SCOPE,
  LIBRARY_TABLE_TYPE,
} from '@ziroeda/common/libraries/library_table.js';
import { PATHS } from '@ziroeda/common/paths.js';
import { PGM_BASE, Pgm, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import {
  isHostedSymbolLibraryRow,
  LoadGlobalSymbolTables,
} from '@ziroeda/eeschema/libraries/symbol_library_adapter.js';
import { MEMORY_FILESYSTEM, wxMountFileSystem, wxReadFileSync } from '@ziroeda/wx/filefn.js';

const SYM = LIBRARY_TABLE_TYPE.SYMBOL;
const dec = new TextDecoder();

let cfg: MEMORY_FILESYSTEM;
let unmount: () => void;

beforeEach(() => {
  SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER()));
  cfg = new MEMORY_FILESYSTEM();
  unmount = wxMountFileSystem(PATHS.GetUserSettingsPath(), cfg);
});

afterEach(() => {
  unmount();
  SetPgm(null);
});

const globalRows = () => Pgm().GetLibraryManager().Rows(SYM, LIBRARY_TABLE_SCOPE.GLOBAL);

/** The user's table as stored. */
const stored = (): LIBRARY_TABLE =>
  LIBRARY_TABLE.FromFile(
    LIBRARY_MANAGER.DefaultGlobalTablePath(SYM),
    dec.decode(wxReadFileSync(LIBRARY_MANAGER.DefaultGlobalTablePath(SYM))!),
    LIBRARY_TABLE_SCOPE.GLOBAL,
  );

describe('LoadGlobalSymbolTables', () => {
  it("writes the user's table on first run, and the hosted libraries come through its chain", () => {
    LoadGlobalSymbolTables(['Device', 'power']);

    expect(
      stored()
        .Rows()
        .map((r) => [r.Nickname(), r.Type()]),
    ).toEqual([['KiCad', 'Table']]);
    expect(globalRows().map((r) => r.Nickname())).toEqual(['Device', 'power']);
    expect(globalRows().every(isHostedSymbolLibraryRow)).toBe(true);
  });

  it("keeps the user's own rows, which are not hosted, across a reload", () => {
    LoadGlobalSymbolTables(['Device']);
    const table = stored();
    const mine = table.InsertRow();
    mine.SetNickname('Mine');
    mine.SetType('KiCad');
    mine.SetURI('/Symbols/Mine.kicad_sym');
    expect(table.Save().ok).toBe(true);

    LoadGlobalSymbolTables(['Device', 'power']);

    expect(globalRows().map((r) => r.Nickname())).toEqual(['Device', 'power', 'Mine']);
    expect(
      globalRows()
        .filter((r) => !isHostedSymbolLibraryRow(r))
        .map((r) => r.Nickname()),
    ).toEqual(['Mine']);
  });

  it('leaves out of the stock table a library the tables already name', () => {
    LoadGlobalSymbolTables([]);
    const table = stored();
    const mine = table.InsertRow();
    mine.SetNickname('Mine');
    mine.SetType('KiCad');
    mine.SetURI('/Symbols/Mine.kicad_sym');
    table.Save();
    LoadGlobalSymbolTables([]);

    // The index lists every library it read, "Mine" included.
    LoadGlobalSymbolTables(['Device', 'Mine']);

    const mineRows = globalRows().filter((r) => r.Nickname() === 'Mine');
    expect(mineRows.length).toBe(1);
    expect(mineRows[0]!.URI()).toBe('/Symbols/Mine.kicad_sym');
    const stockText = dec.decode(wxReadFileSync(LIBRARY_MANAGER.StockTablePath(SYM))!);
    expect(stockText).not.toContain('"Mine"');
  });

  it('makes the stock table the global one when there is nowhere to keep a user table', () => {
    unmount();
    unmount = () => {};

    LoadGlobalSymbolTables(['Device']);

    expect(globalRows().map((r) => r.Nickname())).toEqual(['Device']);
    expect(Pgm().GetLibraryManager().Table(SYM, LIBRARY_TABLE_SCOPE.GLOBAL)!.IsReadOnly()).toBe(
      true,
    );
  });
});
