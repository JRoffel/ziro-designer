// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 ZiroEDA and contributors.
// Portions derived from KiCad, copyright The KiCad Developers. See NOTICE.md.
/**
 * `LIBRARY_MANAGER_ADAPTER::AsyncLoad()` (library_manager.cpp:1796-1960), which
 * `IFACE::PreloadLibraries` runs when a project opens: every enabled row of the adapter's type
 * is loaded, so `LoadSymbol`'s `fetchIfLoaded` finds a project library LOADED. And
 * `SETTINGS_MANAGER::LoadProject` hands an active project to `LIBRARY_MANAGER::ProjectChanged`,
 * which reads its tables from the project directory.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LIB_ID } from '@ziroeda/common/lib_id.js';
import { LOAD_STATUS } from '@ziroeda/common/libraries/library_manager.js';
import {
  LIBRARY_TABLE,
  LIBRARY_TABLE_SCOPE,
  LIBRARY_TABLE_TYPE,
} from '@ziroeda/common/libraries/library_table.js';
import { PGM_BASE, Pgm, SETTINGS_MANAGER, SetPgm } from '@ziroeda/common/pgm_base.js';
import { SymbolLibAdapter } from '@ziroeda/eeschema/project_sch.js';
import { schFrame } from '../../eeschema/support/sch_tool_harness.js';
import { MEMORY_FILESYSTEM, wxMountFileSystem } from '@ziroeda/wx/filefn.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const R = readFileSync(resolve(__dirname, '../../../data/R.kicad_sym'), 'utf8');
const enc = (t: string) => new TextEncoder().encode(t);
let unmount: () => void = () => {};

beforeEach(() => {
  SetPgm(new PGM_BASE(null, new SETTINGS_MANAGER()));
  const fs = new MEMORY_FILESYSTEM();
  fs.Write('demo.kicad_pro', enc('{}'));
  fs.Write('MyLib.kicad_sym', enc(R));
  fs.Write('Off.kicad_sym', enc(R));
  fs.Write(
    'sym-lib-table',
    enc(`(sym_lib_table
  (version 7)
  (lib (name "MyLib")(type "KiCad")(uri "\${KIPRJMOD}/MyLib.kicad_sym")(options "")(descr ""))
  (lib (name "Off")(type "KiCad")(uri "\${KIPRJMOD}/Off.kicad_sym")(options "")(descr "")(disabled))
)`),
  );
  unmount = wxMountFileSystem('/demo', fs);
});

afterEach(() => {
  unmount();
  SetPgm(null);
});

describe('opening a project loads its symbol libraries', () => {
  it('LoadProject reads the project sym-lib-table (ProjectChanged)', () => {
    Pgm().GetSettingsManager().LoadProject('/demo/demo.kicad_pro', {});
    const rows = Pgm()
      .GetLibraryManager()
      .Rows(LIBRARY_TABLE_TYPE.SYMBOL, LIBRARY_TABLE_SCOPE.PROJECT, true);
    expect(rows.map((r) => r.Nickname())).toEqual(['MyLib', 'Off']);
  });

  it('AsyncLoad makes an enabled project library LOADED and its symbols loadable', () => {
    Pgm().GetSettingsManager().LoadProject('/demo/demo.kicad_pro', {});
    const adapter = SymbolLibAdapter(null);
    expect(adapter.LoadSymbol(new LIB_ID('MyLib', 'R'))).toBe(null);

    adapter.AsyncLoad();

    expect(adapter.GetLibraryStatus('MyLib')?.load_status).toBe(LOAD_STATUS.LOADED);
    expect(adapter.LoadSymbol(new LIB_ID('MyLib', 'R'))?.GetName()).toBe('R');
  });

  it('AsyncLoad never contacts a disabled library', () => {
    Pgm().GetSettingsManager().LoadProject('/demo/demo.kicad_pro', {});
    const adapter = SymbolLibAdapter(null);
    adapter.AsyncLoad();
    expect(adapter.GetLibraryStatus('Off')).toBe(undefined);
  });

  it('OpenProjectFiles schedules the project libraries’ load after the project is in', async () => {
    const files = new Map([
      ['/demo/demo.kicad_pro', '{}'],
      [
        '/demo/demo.kicad_sch',
        '(kicad_sch (version 20250114) (generator "eeschema") (uuid "11111111-1111-1111-1111-111111111111") (paper "A4") (lib_symbols))',
      ],
    ]);
    expect(
      schFrame().OpenProjectFiles(['/demo/demo.kicad_sch'], 0, (p) => files.get(p) ?? null),
    ).toBe(true);
    const adapter = SymbolLibAdapter(null);
    expect(adapter.GetLibraryStatus('MyLib')).toBe(undefined);

    await new Promise((r) => setTimeout(r, 0));

    expect(adapter.GetLibraryStatus('MyLib')?.load_status).toBe(LOAD_STATUS.LOADED);
  });

  it('a newly opened project’s library wins over a loaded global one of the same nickname', () => {
    const global = new MEMORY_FILESYSTEM();
    global.Write('MyLib.kicad_sym', enc(R.replace(/\(symbol "R(_\d+_\d+)?"/g, '(symbol "G$1"')));
    const unmountGlobal = wxMountFileSystem('/global', global);
    try {
      Pgm()
        .GetLibraryManager()
        .SetTable(
          LIBRARY_TABLE_TYPE.SYMBOL,
          LIBRARY_TABLE_SCOPE.GLOBAL,
          LIBRARY_TABLE.FromFile(
            '/global/sym-lib-table',
            '(sym_lib_table (version 7) (lib (name "MyLib")(type "KiCad")(uri "/global/MyLib.kicad_sym")(options "")(descr "")))',
            LIBRARY_TABLE_SCOPE.GLOBAL,
            LIBRARY_TABLE_TYPE.SYMBOL,
          ),
        );
      const adapter = SymbolLibAdapter(null);
      adapter.AsyncLoad();
      expect(adapter.LoadSymbol(new LIB_ID('MyLib', 'G'))?.GetName()).toBe('G');

      Pgm().GetSettingsManager().LoadProject('/demo/demo.kicad_pro', {});
      adapter.AsyncLoad();

      expect(adapter.LoadSymbol(new LIB_ID('MyLib', 'R'))?.GetName()).toBe('R');
      expect(adapter.LoadSymbol(new LIB_ID('MyLib', 'G'))).toBe(null);
    } finally {
      unmountGlobal();
    }
  });

  it('AsyncLoad leaves a library that is already LOADED alone', () => {
    Pgm().GetSettingsManager().LoadProject('/demo/demo.kicad_pro', {});
    const adapter = SymbolLibAdapter(null);
    adapter.AsyncLoad();
    const loadOne = vi.spyOn(adapter, 'LoadOne');

    adapter.AsyncLoad();

    expect(loadOne).not.toHaveBeenCalled();
  });
});
