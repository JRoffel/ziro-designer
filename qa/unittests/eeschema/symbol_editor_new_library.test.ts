// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * A new symbol library, and Save Library As, into the account's Symbols folder - with the row in the
 * table the dialog's own controls choose (FILEDLG_HOOK_NEW_LIBRARY's two buttons,
 * SYMBOL_LIBRARY_SAVE_AS_FILEDLG_HOOK's four). The global table is the user's
 * (LoadGlobalSymbolTables), kept in the settings path, so a global row is written where it lasts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { LIBRARY_MANAGER } from '@ziroeda/common/libraries/library_manager.js';
import {
  LIBRARY_TABLE,
  LIBRARY_TABLE_SCOPE,
  LIBRARY_TABLE_TYPE,
} from '@ziroeda/common/libraries/library_table.js';
import { LIB_ID } from '@ziroeda/common/lib_id.js';
import { PATHS } from '@ziroeda/common/paths.js';
import { Pgm } from '@ziroeda/common/pgm_base.js';
import type {
  FILEDLG_HOOK_NEW_LIBRARY,
  wxFileDialogCustomizeHook,
} from '@ziroeda/common/widgets/filedlg_hook_new_library.js';
import { LoadGlobalSymbolTables } from '@ziroeda/eeschema/libraries/symbol_library_adapter.js';
import { SymbolLibAdapter } from '@ziroeda/eeschema/project_sch.js';
import {
  SYMBOL_LIBRARY_SAVE_AS_FILEDLG_HOOK,
  SYMBOL_SAVEAS_TYPE,
} from '@ziroeda/eeschema/widgets/symbol_library_save_as_filedlg_hook.js';
import { wxFD_SAVE } from '@ziroeda/wx/defs.js';
import { MEMORY_FILESYSTEM, wxMountFileSystem, wxReadFileSync } from '@ziroeda/wx/filefn.js';
import { type SYMBOL_EDIT_HARNESS, symbolEditHarness } from './support/symbol_edit_harness.js';

const SYM = LIBRARY_TABLE_TYPE.SYMBOL;
const dec = new TextDecoder();

let t: SYMBOL_EDIT_HARNESS;
let mounts: (() => void)[] = [];
/** What the window's file dialog was asked for, and what it answers. */
let asked: { style: number; hook: wxFileDialogCustomizeHook | undefined }[];
let answer: { path: string | null; pick?: (aHook: wxFileDialogCustomizeHook) => void };

function setUp() {
  asked = [];
  answer = { path: null };
  t = symbolEditHarness(undefined, {
    fileDialog: async (_title, _dir, _file, _wild, aStyle, aHook) => {
      asked.push({ style: aStyle, hook: aHook });
      if (aHook) answer.pick?.(aHook);
      return answer.path;
    },
  });
  // The program's settings path and the account's Symbols folder, as the app mounts them.
  const cfg = new MEMORY_FILESYSTEM();
  const symbols = new MEMORY_FILESYSTEM();
  mounts = [
    wxMountFileSystem(PATHS.GetUserSettingsPath(), cfg),
    wxMountFileSystem('/Symbols', symbols),
  ];
  // A project open at /libs, its table a file there (the harness only installs it), so the
  // project-table choice is offered and ProjectChanged reads the table back.
  t.fs.Write(
    'sym-lib-table',
    new TextEncoder().encode(
      Pgm().GetLibraryManager().Table(SYM, LIBRARY_TABLE_SCOPE.PROJECT)!.FormatForSave(),
    ),
  );
  Pgm().GetSettingsManager().LoadProject('/libs/proj.kicad_pro', {});
  SymbolLibAdapter(t.frame.Prj()).LoadOne('mine');
  LoadGlobalSymbolTables([]);
  return { symbols };
}

afterEach(() => {
  for (const u of mounts) u();
  t.dispose();
});

/** The user's global table as its file now holds it. */
const userTable = () =>
  LIBRARY_TABLE.FromFile(
    LIBRARY_MANAGER.DefaultGlobalTablePath(SYM),
    dec.decode(wxReadFileSync(LIBRARY_MANAGER.DefaultGlobalTablePath(SYM))!),
    LIBRARY_TABLE_SCOPE.GLOBAL,
  );
const projectTable = () => Pgm().GetLibraryManager().Table(SYM, LIBRARY_TABLE_SCOPE.PROJECT)!;

describe('New Library', () => {
  it('asks for a file to write, with the table chooser, and adds the row to the table chosen', async () => {
    const { symbols } = setUp();
    answer = {
      path: '/Symbols/Fresh.kicad_sym',
      pick: (aHook) => {
        (aHook as FILEDLG_HOOK_NEW_LIBRARY).useGlobalTable = false;
      },
    };

    expect(await t.frame.AddLibraryFile(true)).toBe('/Symbols/Fresh.kicad_sym');

    expect(asked.length).toBe(1);
    expect(asked[0]!.style & wxFD_SAVE).toBe(wxFD_SAVE);
    expect((asked[0]!.hook as FILEDLG_HOOK_NEW_LIBRARY | undefined)?.kind).toBe('new_library');
    expect(symbols.Read('Fresh.kicad_sym')).not.toBeNull();
    expect(projectTable().HasRow('Fresh')).toBe(true);
    expect(userTable().HasRow('Fresh')).toBe(false);
  });

  it("puts it in the user's global table, which keeps it, when that is the choice", async () => {
    setUp();
    answer = { path: '/Symbols/Everywhere.kicad_sym' };

    expect(await t.frame.AddLibraryFile(true)).toBe('/Symbols/Everywhere.kicad_sym');

    expect(userTable().HasRow('Everywhere')).toBe(true);
    // The stock chain stays beside it.
    expect(userTable().HasRow('KiCad')).toBe(true);
    expect(Pgm().GetLibraryManager().GetRow(SYM, 'Everywhere')?.URI()).toBe(
      '/Symbols/Everywhere.kicad_sym',
    );
  });

  it('writes nothing when the dialog is cancelled', async () => {
    const { symbols } = setUp();
    answer = { path: null };

    expect(await t.frame.AddLibraryFile(true)).toBe('');
    expect(symbols.List('')).toEqual([]);
  });
});

describe('Save Library As', () => {
  it("adds a global row to the user's table when the dialog says so", async () => {
    const { symbols } = setUp();
    await t.frame.LoadSymbol(new LIB_ID('mine', 'U'), 1, 1);
    answer = {
      path: '/Symbols/Copy.kicad_sym',
      pick: (aHook) =>
        (aHook as SYMBOL_LIBRARY_SAVE_AS_FILEDLG_HOOK).TransferDataFromCustomControls(
          SYMBOL_SAVEAS_TYPE.ADD_GLOBAL_TABLE_ENTRY,
        ),
    };

    expect(await t.frame.saveLibrary('mine', true)).toBe(true);

    expect(asked[0]!.hook instanceof SYMBOL_LIBRARY_SAVE_AS_FILEDLG_HOOK).toBe(true);
    expect(dec.decode(symbols.Read('Copy.kicad_sym')!)).toContain('(symbol "U"');
    expect(userTable().HasRow('Copy')).toBe(true);
    expect(projectTable().HasRow('Copy')).toBe(false);
  });
});
