// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
/**
 * `LIBRARY_MANAGER::LoadProjectTables` (common/libraries/library_manager.cpp:893-935) over a
 * project mounted on the page's file system: the project's table read from its directory, and
 * the design block adapter - registered with the manager, as `PROJECT::DesignBlockLibs` does -
 * dropping the libraries it loaded from the old table.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '@ziroeda/common/design_block_library_adapter.js';
import {
  LIBRARY_TABLE_SCOPE,
  LIBRARY_TABLE_TYPE,
} from '@ziroeda/common/libraries/library_table.js';
import { LIBRARY_MANAGER } from '@ziroeda/common/libraries/library_manager.js';
import { PGM_BASE, Pgm, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { PROJECT } from '@ziroeda/common/project.js';
import { MEMORY_FILESYSTEM, wxMountFileSystem } from '@ziroeda/wx/filefn.js';

const DB = LIBRARY_TABLE_TYPE.DESIGN_BLOCK;
const table = (names: string[]): string =>
  `(design_block_lib_table (version 7) ${names
    .map(
      (n) =>
        `(lib (name "${n}")(type "KiCad")(uri "/proj/${n}.kicad_blocks")(options "")(descr ""))`,
    )
    .join(' ')})`;

let fs: MEMORY_FILESYSTEM;
let unmount: () => void;
const put = (name: string, text: string): void => fs.Write(name, new TextEncoder().encode(text));

beforeEach(() => {
  SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER()));
  fs = new MEMORY_FILESYSTEM();
  unmount = wxMountFileSystem('/proj', fs);
});

afterEach(() => {
  unmount();
  SetPgm(null);
});

const nicknames = (): string[] =>
  Pgm()
    .GetLibraryManager()
    .Rows(DB, LIBRARY_TABLE_SCOPE.PROJECT)
    .map((r) => r.Nickname());

describe('LoadProjectTables', () => {
  it('reads the named table from the project directory', () => {
    put('design-block-lib-table', table(['Power', 'Filters']));
    Pgm().GetLibraryManager().LoadProjectTables('/proj/', [DB]);
    expect(nicknames()).toEqual(['Power', 'Filters']);
    expect(Pgm().GetLibraryManager().Table(DB, LIBRARY_TABLE_SCOPE.PROJECT)!.Path()).toBe(
      '/proj/design-block-lib-table',
    );
  });

  it('a project without the file has no table, and replaces one it had', () => {
    const mgr = Pgm().GetLibraryManager();
    put('design-block-lib-table', table(['Power']));
    mgr.LoadProjectTables('/proj', [DB]);
    expect(nicknames()).toEqual(['Power']);

    fs.Remove('design-block-lib-table');
    mgr.LoadProjectTables('/proj', [DB]);
    expect(mgr.Table(DB, LIBRARY_TABLE_SCOPE.PROJECT)).toBeNull();
  });

  it('skips a file that holds another type of table', () => {
    put(
      'design-block-lib-table',
      '(fp_lib_table (version 7) (lib (name "X")(type "KiCad")(uri "x")(options "")(descr "")))',
    );
    Pgm().GetLibraryManager().LoadProjectTables('/proj', [DB]);
    expect(Pgm().GetLibraryManager().Table(DB, LIBRARY_TABLE_SCOPE.PROJECT)).toBeNull();
  });

  it('loads only the types it is asked for', () => {
    put('design-block-lib-table', table(['Power']));
    put(
      'fp-lib-table',
      '(fp_lib_table (version 7) (lib (name "F")(type "KiCad")(uri "f")(options "")(descr "")))',
    );
    const mgr = Pgm().GetLibraryManager();
    mgr.LoadProjectTables('/proj', [DB]);
    expect(mgr.Table(LIBRARY_TABLE_TYPE.FOOTPRINT, LIBRARY_TABLE_SCOPE.PROJECT)).toBeNull();

    mgr.LoadProjectTables('/proj');
    expect(
      mgr.Rows(LIBRARY_TABLE_TYPE.FOOTPRINT, LIBRARY_TABLE_SCOPE.PROJECT).map((r) => r.Nickname()),
    ).toEqual(['F']);
  });

  it('the table file names are FILEEXT', () => {
    expect(LIBRARY_MANAGER.TableFileName(LIBRARY_TABLE_TYPE.SYMBOL)).toBe('sym-lib-table');
    expect(LIBRARY_MANAGER.TableFileName(LIBRARY_TABLE_TYPE.FOOTPRINT)).toBe('fp-lib-table');
    expect(LIBRARY_MANAGER.TableFileName(DB)).toBe('design-block-lib-table');
  });
});

describe('the design block adapter on reload', () => {
  it('is the one adapter the manager holds, for every project', () => {
    const a = new PROJECT().DesignBlockLibs();
    const b = new PROJECT().DesignBlockLibs();
    expect(a).toBe(b);
    expect(Pgm().GetLibraryManager().Adapter(DB)).toBe(a);
  });

  it('drops a library loaded from the old project table, so the new row is read', () => {
    put('design-block-lib-table', table(['Power']));
    fs.Mkdir('Power.kicad_blocks');
    const mgr = Pgm().GetLibraryManager();
    mgr.LoadProjectTables('/proj', [DB]);

    const libs = new PROJECT().DesignBlockLibs();
    libs.LoadOneByName('Power');
    expect(libs.IsLibraryLoaded('Power')).toBe(true);

    mgr.LoadProjectTables('/proj', [DB]);
    expect(libs.IsLibraryLoaded('Power')).toBe(false);
  });

  it('keeps it when another type of table is reloaded', () => {
    put('design-block-lib-table', table(['Power']));
    fs.Mkdir('Power.kicad_blocks');
    const mgr = Pgm().GetLibraryManager();
    mgr.LoadProjectTables('/proj', [DB]);
    const libs = new PROJECT().DesignBlockLibs();
    libs.LoadOneByName('Power');

    mgr.LoadProjectTables('/proj', [LIBRARY_TABLE_TYPE.FOOTPRINT]);
    expect(libs.IsLibraryLoaded('Power')).toBe(true);
  });
});
